// The customer picks which version their package includes. Public (the gift
// link is the credential), and deliberately ONE-TIME: once chosen it can't be
// swapped, otherwise you could cycle through every version and download them
// all for free, which is exactly what the upsell sells.
import { getOrder, updateOrder, supabaseReady } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!supabaseReady()) return res.status(500).json({ error: 'Not configured' });
  try {
    const { orderId, version } = req.body || {};
    const idx = Number(version);
    if (!orderId || !Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'orderId and a version index are required' });

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const versions = Array.isArray(order.versions) ? order.versions : [];
    if (!versions.length) return res.status(400).json({ error: 'This order has no versions to choose from.' });
    if (idx >= versions.length) return res.status(400).json({ error: 'That version does not exist.' });
    if (order.selected_version !== null && order.selected_version !== undefined) {
      return res.status(409).json({ error: 'A version has already been chosen for this order.', selected: order.selected_version });
    }

    await updateOrder(orderId, { selected_version: idx });
    return res.status(200).json({ ok: true, selected: idx });
  } catch (err) {
    console.error('choose-version failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
