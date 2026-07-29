// Creates a Stripe Checkout Session for a Heart Note order.
// The full song brief is attached as metadata so the webhook can hand it
// to the AI workflow after payment succeeds.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map tier -> Stripe Price ID (set these in Vercel env vars).
const TIERS = {
  single: process.env.PRICE_SINGLE,
  deluxe: process.env.PRICE_DELUXE,
  experience: process.env.PRICE_EXPERIENCE,
};

const VOICE_ADDON_CENTS = 1000; // $10

// Where we will post a CD. Add countries here as the shipping side allows.
const SHIP_TO = ['US', 'CA', 'GB', 'IE', 'AU', 'NZ'];
const LYRIC_ADDON_CENTS = 2000; // $20
const CD_ADDON_CENTS = 3000;    // $30

// Add-ons already priced into a tier, so they are never charged again.
const INCLUDED_ADDONS = { single: [], deluxe: [], experience: ['voice', 'lyrics'] };
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

    if (!b.email) return res.status(400).json({ error: 'A delivery email is required.' });

    const voiceOn = b.voiceAddon === 'yes' || includesAddon(tierKey, 'voice');
    const lyricOn = b.lyricAddon === 'yes' || includesAddon(tierKey, 'lyrics');
    const cdOn = b.cdAddon === 'yes';

    // Build the brief metadata. Stripe caps each value at 500 chars and 50 keys
    // per object, so the long free-text fields are chunked.
    const metadata = {
      tier: tierKey,
      sender_name: clip(b.sender, 120),
      voice_addon: voiceOn ? 'yes' : 'no',      // applied once per order, not per song
      voice: voiceOn ? clip(b.voice, 80) : '',
      lyric_addon: lyricOn ? 'yes' : 'no',      // lyrics emailed for approval before recording
      cd_addon: cdOn ? 'yes' : 'no',            // pressed CD, ships separately
      cd_photo_url: cdOn ? clip(b.cdPhotoUrl, 400) : '',  // cover photo, uploaded before checkout
      delivery_email: clip(b.email, 200),
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
    if (lyricOn && !includesAddon(tierKey, 'lyrics')) addon(LYRIC_ADDON_CENTS, 'Lyric review before recording (add-on)');
    if (cdOn) addon(CD_ADDON_CENTS, 'Keepsake CD with your photo (add-on)');

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Meta tracking: one event id shared by the browser Pixel (on success.html)
    // and the server Conversions API (in the webhook) so Meta dedupes them.
    // fbp/fbc/ip/ua improve match quality. Packed into one metadata value to
    // stay well under Stripe's 50-key limit.
    const metaEventId = (globalThis.crypto?.randomUUID?.() || `evt_${Date.now()}`);
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
    const shipping = cdOn
      ? { shipping_address_collection: { allowed_countries: SHIP_TO } }
      : {};

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      ...shipping,
      customer_email: b.email,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}&eid=${metaEventId}`,
      cancel_url: `${origin}/order.html?tier=${tierKey}&canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
}
