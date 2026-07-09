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

    // Short fields (each < 500 chars)
    const metadata = {
      tier: tierKey,
      occasion: clip(b.occasion, 120),
      occasion_other: clip(b.occasionOther, 120),
      recipient_name: clip(b.recipient, 120),
      recipient_relationship: clip(b.relationship, 120),
      sender_name: clip(b.sender, 120),
      music_style: clip(b.style, 80),
      mood: clip(b.mood, 80),
      voice_addon: voiceOn ? 'yes' : 'no',
      voice: voiceOn ? clip(b.voice, 80) : '',
      delivery_email: clip(b.email, 200),
    };
    // Long fields (chunked so the full text survives to the webhook)
    putChunked(metadata, 'story', b.story);
    putChunked(metadata, 'must_include', b.details);
    putChunked(metadata, 'other_info', b.other);

    const line_items = [{ price, quantity: 1 }];
    if (voiceOn) {
      line_items.push({
        price_data: {
          currency: 'usd',
          unit_amount: VOICE_ADDON_CENTS,
          product_data: { name: 'Choose your voice (add-on)' },
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: b.email,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order.html?tier=${tierKey}&canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
}
