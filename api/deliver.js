// Marks an order delivered and emails the customer their gift-page link.
// Called by the Deliver tool after the MP3 has been uploaded to Storage.
import { getOrder, updateOrder, supabaseReady } from '../lib/db.js';
import { sendEmail, mailReady } from '../lib/mail.js';
import { adminAuthed } from '../lib/auth.js';
import { deliveryEmailHTML } from '../lib/emails.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });
  try {
    const { orderId, songTitle, songUrl, files, scheduledAt } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    // files: [{ kind: 'mp3', url, title }, { kind: 'wav' | 'zip', url }]. An
    // order can carry up to 6 songs. songUrl is the older single-file form.
    const KINDS = ['mp3', 'wav', 'zip'];
    let list = Array.isArray(files) ? files.filter((f) => f && f.url && KINDS.includes(f.kind)) : [];
    if (!list.length && songUrl) list = [{ kind: 'mp3', url: songUrl, title: songTitle }];

    let n = 0;
    list = list.map((f) => {
      if (f.kind !== 'mp3') return { kind: f.kind, url: f.url };
      n += 1;
      return { kind: 'mp3', url: f.url, title: String(f.title || '').trim() || `Song ${n}` };
    });

    const songs = list.filter((f) => f.kind === 'mp3');
    if (!songs.length) return res.status(400).json({ error: 'At least one song file is required.' });
    const songTitles = songs.map((s) => s.title);

    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await updateOrder(orderId, {
      song_title: songTitles[0],   // first song, for the email subject and lists
      song_file_url: songs[0].url,
      song_files: list,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      scheduled_send_at: scheduledAt || null,
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
          html: deliveryEmailHTML({
            displayName,
            songTitles,
            giftUrl,
            extras: list.filter((f) => f.kind !== 'mp3').map((f) => f.kind),
          }),
          replyTo: process.env.ORDER_NOTIFY_EMAIL,
          scheduledAt: scheduledAt || undefined,
        });
        emailed = true;
      } catch (e) {
        emailError = String(e.message || e);
        console.error('delivery email failed:', e);
      }
    }

    return res.status(200).json({ ok: true, giftUrl, emailed, emailError, scheduledAt: scheduledAt || null });
  } catch (err) {
    console.error('deliver failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
