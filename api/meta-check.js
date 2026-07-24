// Diagnostic for Meta conversion tracking. Password-gated, read-only by default.
//
// Answers the three questions you can't see from the outside when a Purchase
// isn't attributing in Ads Manager:
//   1. Is the server actually configured to send events? (a missing
//      META_PIXEL_ID makes sendMetaPurchase a silent no-op)
//   2. Did the real orders carry the Facebook click id? Without `fbc`, Meta
//      can't tie the sale to the ad that earned it.
//   3. Does the token actually work? POST with a test_event_code to fire a
//      harmless event into Events Manager → Test Events and see Meta's reply.
//
//   GET  /api/meta-check                          → config + last 10 orders
//   POST /api/meta-check?test_event_code=TEST1234 → live token/payload check
//
// Never returns a secret — only whether each one is present.
import crypto from 'node:crypto';
import { sbSelect, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });

  const config = {
    META_PIXEL_ID: Boolean(process.env.META_PIXEL_ID),
    META_CAPI_TOKEN: Boolean(process.env.META_CAPI_TOKEN),
    // Must be false in production, or server events only reach Test Events.
    META_TEST_EVENT_CODE: Boolean(process.env.META_TEST_EVENT_CODE),
    META_ADS_TOKEN: Boolean(process.env.META_ADS_TOKEN),
    META_AD_ACCOUNT_ID: Boolean(process.env.META_AD_ACCOUNT_ID),
  };
  const problems = [];
  if (!config.META_PIXEL_ID) problems.push('META_PIXEL_ID is not set — the server sends NO Purchase events at all (silent no-op).');
  if (!config.META_CAPI_TOKEN) problems.push('META_CAPI_TOKEN is not set — the server sends NO Purchase events at all.');
  if (config.META_TEST_EVENT_CODE) problems.push('META_TEST_EVENT_CODE is set — server Purchases only reach Test Events and never count as conversions. Remove it and redeploy.');

  // ── Live token / payload check (opt-in, goes to Test Events only) ──────────
  if (req.method === 'POST') {
    const code = req.query.test_event_code;
    if (!code) return res.status(400).json({ error: 'Add ?test_event_code=… (from Events Manager → Test Events) so this never touches real conversion data.' });
    if (!config.META_PIXEL_ID || !config.META_CAPI_TOKEN) return res.status(400).json({ error: 'Cannot test: pixel id or CAPI token missing.', config, problems });

    const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `diag_${Date.now()}`,
        action_source: 'website',
        event_source_url: `${process.env.SITE_URL || 'https://heartnote.music'}/success.html`,
        user_data: {
          em: [sha256('diagnostic@heartnote.music')],
          fbc: `fb.1.${Date.now()}.diagnostic_click_id`,
          fbp: `fb.1.${Date.now()}.1234567890`,
        },
        custom_data: { currency: 'USD', value: 69 },
      }],
      test_event_code: code,
    };
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await r.json();
      return res.status(200).json({
        sent: r.ok,
        meta_response: body, // events_received:1 = token and payload are good
        hint: r.ok
          ? 'Look in Events Manager → Test Events. If it appears there, the token and payload are fine and the problem is in Ads Manager reporting, not the code.'
          : 'Meta rejected the call — the message above is the reason (usually an expired token or a pixel id the token cannot post to).',
        config, problems,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, config, problems });
    }
  }

  // ── What the real orders actually carried ────────────────────────────────
  let orders = [];
  if (supabaseReady()) {
    try {
      const rows = await sbSelect('orders', 'select=id,created_at,amount_total,tier,brief,attribution&order=created_at.desc&limit=10');
      orders = rows.map((o) => {
        let m = {};
        try { m = o.brief?.meta ? JSON.parse(o.brief.meta) : {}; } catch { m = {}; }
        return {
          created_at: o.created_at,
          tier: o.tier,
          amount: (o.amount_total || 0) / 100,
          // The identifiers that decide whether Meta can attribute the sale.
          has_fbc: Boolean(m.fbc),           // the ad click id — the key one
          has_fbp: Boolean(m.fbp),
          has_event_id: Boolean(m.eid),
          has_ip: Boolean(m.ip),
          attribution: o.attribution || null, // campaign/ad, once URL tags are set
        };
      });
    } catch (err) {
      orders = [{ error: err.message }];
    }
  }

  const withFbc = orders.filter((o) => o.has_fbc).length;
  if (orders.length && !withFbc) {
    problems.push('No recent order carried an fbc (ad click id). Meta cannot attribute a sale to an ad without it — check that ads land on a page with the pixel and that the click id survives to checkout.');
  }

  return res.status(200).json({
    config,
    problems: problems.length ? problems : ['No configuration problems found.'],
    orders_checked: orders.length,
    orders_with_click_id: withFbc,
    orders,
    next_step: 'POST to this endpoint with ?test_event_code=… (Events Manager → Test Events) to prove the token works end to end.',
  });
}
