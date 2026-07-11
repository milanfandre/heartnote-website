// Marks an order delivered and emails the customer their gift-page link.
// Called by the Deliver tool after the MP3 has been uploaded to Storage.
import { getOrder, updateOrder, supabaseReady } from '../lib/db.js';
import { sendEmail, mailReady, esc } from '../lib/mail.js';
import { adminAuthed } from '../lib/auth.js';

function deliveryEmailHTML({ displayName, songTitle, giftUrl }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2B2019;background:#F7F1E6;padding:32px 24px;border-radius:16px">
    <p style="font-family:Georgia,serif;color:#6E1423;font-size:20px;margin:0">Heart Note</p>
    <h1 style="font-family:Georgia,serif;color:#6E1423;font-size:26px;margin:18px 0 8px">${esc(displayName)}'s Heart Note is ready</h1>
    <p style="color:#6B5D50;line-height:1.6;margin:0 0 24px">Your custom song, <strong>${esc(songTitle)}</strong>, is finished. Open your private keepsake page to play it, download it, and keep it forever.</p>
    <a href="${esc(giftUrl)}" style="display:inline-block;background:#6E1423;color:#F7F1E6;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">Open your Heart Note</a>
    <p style="color:#9a8b7c;font-size:12px;margin-top:28px;word-break:break-all">Or paste this link into your browser:<br>${esc(giftUrl)}</p>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });
  try {
    const { orderId, songTitle, songUrl } = req.body || {};
    if (!orderId || !songTitle || !songUrl) return res.status(400).json({ error: 'orderId, songTitle and songUrl are required' });

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await updateOrder(orderId, {
      song_title: songTitle,
      song_file_url: songUrl,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    });

    const origin = process.env.SITE_URL || req.headers.origin || `https://${req.headers.host}`;
    const giftUrl = `${origin.replace(/\/+$/, '')}/gift/${orderId}`;

    let emailed = false;
    let emailError = null;
    const to = order.customer_email;
    const displayName = order.brief?.recipient_name || 'Your loved one';
    if (mailReady() && to) {
      try {
        await sendEmail({
          to,
          subject: `${displayName}'s Heart Note is ready`,
          html: deliveryEmailHTML({ displayName, songTitle, giftUrl }),
          replyTo: process.env.ORDER_NOTIFY_EMAIL,
        });
        emailed = true;
      } catch (e) {
        emailError = String(e.message || e);
        console.error('delivery email failed:', e);
      }
    }

    return res.status(200).json({ ok: true, giftUrl, emailed, emailError });
  } catch (err) {
    console.error('deliver failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
