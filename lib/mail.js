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
  // Resend wants each address separately, so split any "a@x.com,b@y.com" string
  // into an array (env vars like ORDER_NOTIFY_EMAIL can hold several).
  const addrs = (v) => (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
  const replyList = replyTo ? addrs(replyTo) : [];
  const body = JSON.stringify({
    from,
    to: addrs(to),
    subject,
    html,
    ...(replyList.length ? { reply_to: replyList } : {}),
    ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
  });
  // Resend's free tier caps at 2 requests/second, and a paid order fires two
  // emails together, so back off and retry on a 429 rather than dropping one.
  let lastText = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
    });
    if (r.ok) return r.json();
    lastText = await r.text();
    if (r.status !== 429) throw new Error(`Resend ${r.status}: ${lastText}`);
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw new Error(`Resend rate-limited after retries: ${lastText}`);
}

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
