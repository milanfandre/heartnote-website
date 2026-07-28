// Sends the lyrics to the customer for approval, before anything is recorded.
// Called by the Deliver tool, the same way versions are sent.
import { getOrder, updateOrder, supabaseReady } from '../lib/db.js';
import { sendEmail, mailReady } from '../lib/mail.js';
import { adminAuthed } from '../lib/auth.js';
import { lyricsForApprovalHTML } from '../lib/emails.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });
  try {
    const { orderId, lyrics } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });
    const text = String(lyrics || '').trim();
    if (text.length < 20) return res.status(400).json({ error: 'Please paste the lyrics before sending.' });

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Re-sending after a change request starts a fresh round of approval.
    const revision = order.lyrics_status === 'changes' ? 1 : 0;
    await updateOrder(orderId, {
      lyrics: text,
      lyrics_status: 'sent',
      lyrics_feedback: null,
      lyrics_sent_at: new Date().toISOString(),
      lyrics_responded_at: null,
    });

    const origin = process.env.SITE_URL || req.headers.origin || `https://${req.headers.host}`;
    const reviewUrl = `${origin.replace(/\/+$/, '')}/lyrics/${orderId}`;
    const displayName = order.recipient_name || order.brief?.recipient_name || 'your loved one';

    let emailed = false, emailError = null;
    if (mailReady() && order.customer_email) {
      try {
        await sendEmail({
          to: order.customer_email,
          subject: revision ? 'Your revised lyrics are ready' : `The lyrics for ${displayName}'s song`,
          html: lyricsForApprovalHTML({ displayName, lyrics: text, reviewUrl, revision }),
          replyTo: process.env.ORDER_NOTIFY_EMAIL,
        });
        emailed = true;
      } catch (e) {
        emailError = e.message;
        console.error('send-lyrics email failed:', e);
      }
    }
    return res.status(200).json({ ok: true, emailed, emailError, reviewUrl });
  } catch (err) {
    console.error('send-lyrics failed:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
}
