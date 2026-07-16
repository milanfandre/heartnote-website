// Small read-only endpoint the success page uses to fire an accurate browser
// Purchase event: returns the paid amount, currency, and the shared event_id.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const id = req.query.session_id;
  if (!id) return res.status(400).json({ error: 'session_id required' });
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    let eventId = s.metadata?.meta_event_id || null;
    if (!eventId && s.metadata?.meta) {
      try { eventId = JSON.parse(s.metadata.meta).eid || null; } catch { /* ignore */ }
    }
    return res.status(200).json({
      value: (s.amount_total || 0) / 100,
      currency: (s.currency || 'usd').toUpperCase(),
      eventId,
      paid: s.payment_status === 'paid',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
