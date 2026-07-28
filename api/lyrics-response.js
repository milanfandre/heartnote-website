// The customer approves their lyrics, or asks for changes. Public: the lyrics
// link is the credential, exactly like the gift page.
import { getOrder, updateOrder, supabaseReady } from '../lib/db.js';
import { sendEmail, mailReady } from '../lib/mail.js';
import { lyricsResponseHTML } from '../lib/emails.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!supabaseReady()) return res.status(500).json({ error: 'Not configured' });
  try {
    const { orderId, approved, feedback } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.lyrics) return res.status(400).json({ error: 'There are no lyrics to respond to yet.' });
    if (order.lyrics_status === 'approved') {
      return res.status(409).json({ error: 'These lyrics have already been approved.' });
    }

    const notes = String(feedback || '').trim();
    if (!approved && notes.length < 5) {
      return res.status(400).json({ error: 'Please tell us what you would like changed.' });
    }

    await updateOrder(orderId, {
      lyrics_status: approved ? 'approved' : 'changes',
      lyrics_feedback: approved ? null : notes.slice(0, 4000),
      lyrics_responded_at: new Date().toISOString(),
    });

    const to = process.env.ORDER_NOTIFY_EMAIL;
    if (mailReady() && to) {
      try {
        await sendEmail({
          to,
          subject: approved ? `Lyrics approved — ${order.recipient_name || order.tier}` : `Lyric changes requested — ${order.recipient_name || order.tier}`,
          html: lyricsResponseHTML({ order, approved: Boolean(approved), feedback: notes, orderId }),
          replyTo: order.customer_email,
        });
      } catch (e) {
        console.error('lyrics-response notify failed:', e);
      }
    }
    return res.status(200).json({ ok: true, approved: Boolean(approved) });
  } catch (err) {
    console.error('lyrics-response failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
