// Meta Conversions API (server-side events). Sends the Purchase server-to-server
// from the Stripe webhook, so it survives ad blockers and iOS. Shares an
// event_id with the browser Pixel so Meta deduplicates the two.
import crypto from 'node:crypto';

const GRAPH_VERSION = 'v21.0';

const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

export function metaReady() {
  return Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

export async function sendMetaPurchase({ eventId, email, fbp, fbc, ip, userAgent, value, currency, eventSourceUrl }) {
  if (!metaReady()) return;
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  const user_data = {};
  if (email) user_data.em = [sha256(email)];
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;
  if (ip) user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,               // must match the browser Pixel's Purchase eventID
      action_source: 'website',
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data,
      custom_data: { currency: (currency || 'usd').toUpperCase(), value: (value || 0) / 100 },
    }],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };

  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error('Meta CAPI error', r.status, await r.text());
  } catch (err) {
    console.error('Meta CAPI request failed:', err);
  }
}
