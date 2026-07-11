// Lists orders for the Deliver tool (newest first). Password-gated.
import { listOrders, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });
  try {
    const orders = await listOrders({});
    const out = orders.map((o) => ({
      id: o.id,
      created_at: o.created_at,
      status: o.status,
      tier: o.tier,
      amount_total: o.amount_total,
      customer_email: o.customer_email,
      occasion: o.occasion,
      recipient_name: o.recipient_name,
      song_title: o.song_title,
      song_file_url: o.song_file_url,
      brief: o.brief,
    }));
    return res.status(200).json({ orders: out });
  } catch (err) {
    console.error('admin-orders failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
