// Public, first-party analytics beacon. The browser (track.js) POSTs one event
// here per pageview / button click / checkout intent; we write it to Supabase
// with the service key. No auth — it's a write-only firehose from the site
// itself — but every field is whitelisted and length-capped so it can't be used
// to stuff arbitrary data into the table.
//
// Graceful no-op until Supabase is configured, exactly like the order pipeline:
// a missing database must never throw an error back at a visitor's browser.
import { insertEvents, supabaseReady } from '../lib/db.js';

const TYPES = new Set(['pageview', 'cta_click', 'add_to_cart', 'purchase']);
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);
const int = (v) => (Number.isFinite(+v) ? Math.trunc(+v) : null);

export default async function handler(req, res) {
  // Beacons are fire-and-forget; always 204 so the browser never sees an error.
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // navigator.sendBeacon sends the body as text/plain, so parse defensively.
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    if (!TYPES.has(body.type)) return res.status(204).end();
    if (!supabaseReady()) return res.status(204).end();

    const row = {
      type: body.type,
      page: str(body.page),
      angle: str(body.angle, 60),
      source: str(body.source, 120),
      label: str(body.label, 200),
      session_id: str(body.sid, 64),
      referrer: str(body.referrer),
      utm_source: str(body.utm_source, 120),
      utm_medium: str(body.utm_medium, 120),
      utm_campaign: str(body.utm_campaign, 200),
      utm_content: str(body.utm_content, 200),
      value_cents: int(body.value_cents),
      tier: str(body.tier, 40),
      meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
    };

    await insertEvents([row]);
    return res.status(204).end();
  } catch (err) {
    // Never surface tracking failures to the visitor; just log for us.
    console.error('track failed:', err.message);
    return res.status(204).end();
  }
}
