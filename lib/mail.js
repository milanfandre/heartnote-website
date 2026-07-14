// Thin Resend wrapper for transactional email.
export function mailReady() {
  return Boolean(process.env.RESEND_API_KEY);
}

// `scheduledAt` (ISO 8601) hands the email to Resend now but has it delivered
// later, so a song finished in minutes can still arrive when the customer
// expects it. Resend allows scheduling up to 72 hours out.
export async function sendEmail({ to, subject, html, replyTo, scheduledAt }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  // Until heartnote.music is verified in Resend, this test sender only
  // delivers to your own Resend account address.
  const from = process.env.ORDER_FROM_EMAIL || 'Heart Note <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
