// Receives a contact-form submission and emails it to the support inbox.
import { sendEmail, mailReady, esc } from '../lib/mail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const { name, email, message, company } = req.body || {};
    if (company) return res.status(200).json({ ok: true }); // honeypot: silently drop bots
    if (!email || !message || !String(message).trim()) return res.status(400).json({ error: 'Please include your email and a message.' });
    if (!mailReady()) return res.status(500).json({ error: 'Messaging is not set up yet. Please email us directly.' });

    const to = process.env.CONTACT_EMAIL || process.env.ORDER_NOTIFY_EMAIL;
    if (!to) return res.status(500).json({ error: 'No support inbox configured.' });

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#2B2019">
      <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">New message from the Heart Note site</h2>
      <p style="margin:2px 0"><strong>Name:</strong> ${esc(name || '(not given)')}</p>
      <p style="margin:2px 0"><strong>Email:</strong> ${esc(email)}</p>
      <p style="margin:14px 0 4px"><strong>Message:</strong></p>
      <div style="white-space:pre-wrap;background:#FBF7EE;border:1px solid #eadfce;border-radius:8px;padding:12px 16px">${esc(message)}</div>
    </div>`;

    await sendEmail({
      to,
      subject: `New contact message${name ? ` from ${name}` : ''}`,
      html,
      replyTo: String(email).trim(),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
