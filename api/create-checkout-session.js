// Creates a Stripe Checkout Session for a Heart Note order.
// The full song brief is attached as metadata so the webhook can hand it
// to the AI workflow after payment succeeds.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map tier -> Stripe Price ID (set these in Vercel env vars).
const TIERS = {
  single: process.env.PRICE_SINGLE,
  deluxe: process.env.PRICE_DELUXE,
  keepsake: process.env.PRICE_KEEPSAKE,
};

// Stripe metadata values must be <= 500 chars each; keep briefs tidy.
const clip = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};
    const tierKey = ['single', 'deluxe', 'keepsake'].includes(b.tier) ? b.tier : 'deluxe';
    const price = TIERS[tierKey];
    if (!price) throw new Error(`Missing Stripe price for tier "${tierKey}". Set PRICE_${tierKey.toUpperCase()} in the environment.`);

    if (!b.email) return res.status(400).json({ error: 'A delivery email is required.' });

    // The song brief — everything the AI workflow needs.
    const metadata = {
      tier: tierKey,
      occasion: clip(b.occasion, 120),
      recipient_name: clip(b.recipient, 120),
      recipient_relationship: clip(b.relationship, 120),
      sender_name: clip(b.sender, 120),
      music_style: clip(b.style, 120),
      mood: clip(b.mood, 120),
      needed_by: clip(b.neededBy, 60),
      delivery_email: clip(b.email, 200),
      story: clip(b.story, 500),
      must_include: clip(b.details, 500),
    };

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
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
