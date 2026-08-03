// Creates a Stripe Checkout Session for a Heart Note order.
// The full song brief is attached as metadata so the webhook can hand it
// to the AI workflow after payment succeeds.
import Stripe from 'stripe';
import { sendMetaEvent, metaReady } from '../lib/meta.js';
import { orderTotalCents } from '../lib/pricing.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map tier -> Stripe Price ID (set these in Vercel env vars).
const TIERS = {
  single: process.env.PRICE_SINGLE,
  deluxe: process.env.PRICE_DELUXE,
  experience: process.env.PRICE_EXPERIENCE,
};

const VOICE_ADDON_CENTS = 1000; // $10


// Add-ons already priced into a tier, so they are never charged again.
const INCLUDED_ADDONS = { single: [], deluxe: [], experience: ['voice'] };
const includesAddon = (tier, addon) => (INCLUDED_ADDONS[tier] || []).includes(addon);

// Short metadata value: Stripe caps each value at 500 chars.
const clip = (v, n = 500) => (typeof v === 'string' ? v : '').trim().slice(0, n);

// Long text won't fit in one 500-char metadata value, so store it in chunks.
// The webhook reassembles `${name}` from `${name}_1..N` when `${name}_parts` is set.
function putChunked(meta, name, value, maxChars = 5000, size = 500) {
  const v = (typeof value === 'string' ? value : '').trim().slice(0, maxChars);
  if (!v) return;
  if (v.length <= size) { meta[name] = v; return; }
  const n = Math.ceil(v.length / size);
  meta[`${name}_parts`] = String(n);
  for (let i = 0; i < n; i++) meta[`${name}_${i + 1}`] = v.slice(i * size, (i + 1) * size);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};
    const tierKey = Object.keys(TIERS).includes(b.tier) ? b.tier : 'deluxe';
    const price = TIERS[tierKey];
    if (!price) throw new Error(`Missing Stripe price for tier "${tierKey}". Set PRICE_${tierKey.toUpperCase()} in the environment.`);


    const voiceOn = b.voiceAddon === 'yes' || includesAddon(tierKey, 'voice');

    // Build the brief metadata. Stripe caps each value at 500 chars and 50 keys
    // per object, so the long free-text fields are chunked.
    const metadata = {
      tier: tierKey,
      sender_name: clip(b.sender, 120),
      voice_addon: voiceOn ? 'yes' : 'no',      // applied once per order, not per song
      voice: voiceOn ? clip(b.voice, 80) : '',
      occasion: clip(b.occasion, 120),
      occasion_other: clip(b.occasionOther, 120),
      recipient_name: clip(b.recipient, 120),
      recipient_relationship: clip(b.relationship, 120),
      music_style: clip(b.style, 80),
      mood: clip(b.mood, 80),
    };
    putChunked(metadata, 'story', b.story);
    putChunked(metadata, 'must_include', b.details);
    putChunked(metadata, 'other_info', b.other);

    const line_items = [{ price, quantity: 1 }];
    const addon = (cents, name) => line_items.push({
      price_data: { currency: 'usd', unit_amount: cents, product_data: { name } },
      quantity: 1,
    });
    if (voiceOn && !includesAddon(tierKey, 'voice')) addon(VOICE_ADDON_CENTS, 'Choose your voice (add-on)');

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Meta tracking: one event id shared by the browser Pixel (on success.html)
    // and the server Conversions API (in the webhook) so Meta dedupes them.
    // fbp/fbc/ip/ua improve match quality. Packed into one metadata value to
    // stay well under Stripe's 50-key limit.
    const metaEventId = (globalThis.crypto?.randomUUID?.() || `evt_${Date.now()}`);
    // Separate id: InitiateCheckout and Purchase are different events and must
    // never share one, or Meta will dedupe them against each other.
    const checkoutEventId = clip(b.checkoutEventId, 80) || (globalThis.crypto?.randomUUID?.() || `ic_${Date.now()}`);
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    putChunked(metadata, 'meta', JSON.stringify({
      eid: metaEventId,
      fbp: clip(b.fbp, 120),
      fbc: clip(b.fbc, 200),
      ip: clientIp,
      ua: clip(req.headers['user-agent'], 300),
    }), 4000);
    metadata.meta_event_id = metaEventId; // also stored flat for session-info

    // Campaign attribution: which ad/campaign this order came from, captured on
    // the landing page and carried here by the order form. Whitelisted so only
    // known marketing parameters ever reach the order record.
    const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
      'fbclid', 'gclid', 'ttclid', 'ad_id', 'adset_id', 'campaign_id', 'placement', 'site_source_name',
      'src', 'landing', 'angle', 'source', 'referrer', 'landed_at'];
    const rawAttr = (b.attr && typeof b.attr === 'object') ? b.attr : {};
    const attr = {};
    for (const k of ATTR_KEYS) if (rawAttr[k]) attr[k] = clip(String(rawAttr[k]), 200);
    if (Object.keys(attr).length) putChunked(metadata, 'attr', JSON.stringify(attr), 2000);

    // A CD has to be posted, so Stripe collects and validates the address at
    // payment. Digital-only orders are never asked for one.

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}&eid=${metaEventId}`,
      cancel_url: `${origin}/order.html?tier=${tierKey}&canceled=1`,
    });

    // InitiateCheckout, sent server-side the moment Stripe actually has a
    // session. Firing here rather than on the button press means a failed
    // session never counts, and it survives ad blockers and iOS. The browser
    // sends the same event id, which is how Meta knows it is one event.
    if (metaReady()) {
      await sendMetaEvent({
        eventName: 'InitiateCheckout',
        eventId: checkoutEventId,
        fbp: clip(b.fbp, 120),
        fbc: clip(b.fbc, 200),
        ip: clientIp,
        userAgent: clip(req.headers['user-agent'], 300),
        value: orderTotalCents(tierKey, { voice: voiceOn }),
        currency: 'usd',
        eventSourceUrl: `${origin}/order.html`,
        customData: { content_name: tierKey },
      });
    }

    return res.status(200).json({ url: session.url, checkoutEventId });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
}
