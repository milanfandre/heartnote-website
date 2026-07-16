// Stripe Checkout for the "unlock every version" upsell, started from the gift
// page. The webhook watches for metadata.type === 'unlock_all' and flips the
// order's versions_unlocked flag once payment succeeds.
import Stripe from 'stripe';
import { getOrder, supabaseReady } from '../lib/db.js';
import { UPSELL_CENTS, VERSIONS_PER_TIER, dollars } from '../lib/pricing.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!supabaseReady()) return res.status(500).json({ error: 'Not configured' });
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.versions_unlocked) return res.status(400).json({ error: 'Every version is already unlocked.' });

    const amount = UPSELL_CENTS[order.tier];
    const count = VERSIONS_PER_TIER[order.tier];
    if (!amount) return res.status(400).json({ error: 'This package has no versions to unlock.' });

    const origin = process.env.SITE_URL || req.headers.origin || `https://${req.headers.host}`;
    const gift = `${origin.replace(/\/+$/, '')}/gift/${orderId}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `All ${count} versions of your Heart Note`,
            description: 'Unlock every version of your song, with all the files included in your package.',
          },
        },
        quantity: 1,
      }],
      ...(order.customer_email ? { customer_email: order.customer_email } : {}),
      // type marks this as an upsell so the webhook doesn't treat it as a new order.
      metadata: { type: 'unlock_all', order_id: String(orderId) },
      payment_intent_data: { metadata: { type: 'unlock_all', order_id: String(orderId) } },
      success_url: `${gift}?unlocked=1`,
      cancel_url: gift,
    });

    return res.status(200).json({ url: session.url, amount: dollars(amount) });
  } catch (err) {
    console.error('create-upsell-session failed:', err);
    return res.status(500).json({ error: err.message || 'Could not start checkout.' });
  }
}
