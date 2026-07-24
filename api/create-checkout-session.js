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
  wedding: process.env.PRICE_WEDDING,
};

const VOICE_ADDON_CENTS = 1000; // $10

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

    const voiceOn = b.voiceAddon === 'yes';

    // Build the brief metadata. Stripe caps each value at 500 chars and 50 keys
    // per object, so long text is chunked. For weddings, each song's fields are
    // combined into one chunked value so several songs stay within the key limit.
    const metadata = {
      tier: tierKey,
      sender_name: clip(b.sender, 120),
      voice_addon: voiceOn ? 'yes' : 'no',      // applied once per order, not per song
      voice: voiceOn ? clip(b.voice, 80) : '',
      delivery_email: clip(b.email, 200),
    };

    if (tierKey === 'wedding') {
      const nums = [...new Set(
        Object.keys(b).filter((k) => /^song\d+_/.test(k)).map((k) => parseInt(k.match(/^song(\d+)_/)[1], 10))
      )].sort((a, z) => a - z);
      metadata.song_count = clip(String(b.songCount || nums.length || 3), 10);
      for (const n of nums) {
        const moment = clip(b[`song${n}_moment`], 200);
        const story = (b[`song${n}_story`] || '').trim();
        const other = (b[`song${n}_other`] || '').trim();
        const svoice = clip(b[`song${n}_voice`], 80);
        const parts = [];
        if (moment) parts.push(`Moment: ${moment}`);
        if (svoice) parts.push(`Voice: ${svoice}`);
        if (story) parts.push(`About this song:\n${story}`);
        if (other) parts.push(`Other info:\n${other}`);
        putChunked(metadata, `song${n}`, parts.join('\n\n'), 3000);
      }
    } else {
      metadata.occasion = clip(b.occasion, 120);
      metadata.occasion_other = clip(b.occasionOther, 120);
      metadata.recipient_name = clip(b.recipient, 120);
      metadata.recipient_relationship = clip(b.relationship, 120);
      metadata.music_style = clip(b.style, 80);
      metadata.mood = clip(b.mood, 80);
      putChunked(metadata, 'story', b.story);
      putChunked(metadata, 'must_include', b.details);
      putChunked(metadata, 'other_info', b.other);
    }

    const line_items = [{ price, quantity: 1 }];
    // Voice add-on: once for single-song tiers, or per song with a voice for weddings.
    const voiceQty = tierKey === 'wedding'
      ? Object.keys(b).filter((k) => /^song\d+_voice$/.test(k) && (b[k] || '').trim()).length
      : (voiceOn ? 1 : 0);
    if (voiceQty > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          unit_amount: VOICE_ADDON_CENTS,
          product_data: { name: 'Choose your voice (add-on)' },
        },
        quantity: voiceQty,
      });
    }
    if (tierKey === 'wedding') {
      const extra = Math.max(0, parseInt(b.extraSongs, 10) || 0);
      if (extra > 0) {
        line_items.push({
          price_data: { currency: 'usd', unit_amount: 4900, product_data: { name: 'Additional wedding song' } },
          quantity: extra,
        });
      }
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Meta tracking: one event id shared by the browser Pixel (on success.html)
    // and the server Conversions API (in the webhook) so Meta dedupes them.
    // fbp/fbc/ip/ua improve match quality. Packed into one metadata value to
    // stay well under Stripe's 50-key limit even on large wedding orders.
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
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
