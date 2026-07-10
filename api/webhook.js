// Stripe webhook: fires after a successful payment, verifies the signature,
// and hands the completed song brief off to the AI workflow.
//
// IMPORTANT: Stripe signature verification needs the RAW request body, so we
// disable Vercel's automatic body parsing below.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Long brief fields are stored across `${name}_1..N` (with `${name}_parts`) to
// fit Stripe's 500-char metadata limit. Rebuild them into single fields.
function reassembleChunks(meta) {
  const out = { ...meta };
  for (const key of Object.keys(meta)) {
    const m = key.match(/^(.+)_parts$/);
    if (!m) continue;
    const base = m[1];
    const n = parseInt(meta[key], 10) || 0;
    let s = '';
    for (let i = 1; i <= n; i++) { s += meta[`${base}_${i}`] || ''; delete out[`${base}_${i}`]; }
    out[base] = s;
    delete out[key];
  }
  return out;
}

// ----- Order-notification email (fast manual fulfillment) -----
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const row = (label, val) => (val && String(val).trim())
  ? `<tr><td style="padding:5px 12px;color:#6B5D50;font-weight:600;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:5px 12px;color:#2B2019">${esc(val).replace(/\n/g, '<br>')}</td></tr>` : '';
const block = (label, val) => (val && String(val).trim())
  ? `<h3 style="font-family:Georgia,serif;color:#6E1423;margin:16px 0 4px;font-size:15px">${esc(label)}</h3><div style="white-space:pre-wrap;background:#FBF7EE;border:1px solid #eadfce;border-radius:8px;padding:10px 14px">${esc(val)}</div>` : '';

function orderEmailHTML(order) {
  const amount = ((order.amount_total || 0) / 100).toFixed(2);
  let brief;
  if (order.tier === 'wedding') {
    const songs = Object.keys(order).filter((k) => /^song\d+$/.test(k)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
    brief = songs.map((k, i) => block(`Song ${i + 1}`, order[k])).join('');
  } else {
    brief = `<table style="border-collapse:collapse;width:100%">
        ${row('Occasion', order.occasion === 'Other' ? (order.occasion_other || 'Other') : order.occasion)}
        ${row('Song is for', order.recipient_name)}
        ${row('Relationship', order.recipient_relationship)}
        ${row('From', order.sender_name)}
        ${row('Style', order.music_style)}
        ${row('Mood', order.mood)}
        ${row('Voice', order.voice_addon === 'yes' ? order.voice : '')}
      </table>
      ${block('Story', order.story)}${block('Must include', order.must_include)}${block('Other info', order.other_info)}`;
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2B2019">
    <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">New Heart Note order</h2>
    <table style="border-collapse:collapse;width:100%">
      ${row('Package', order.tier)}
      ${row('Amount paid', '$' + amount + ' ' + (order.currency || 'usd').toUpperCase())}
      ${row('Deliver to', order.customer_email)}
      ${order.tier === 'wedding' ? row('Songs', order.song_count) : ''}
    </table>
    <hr style="border:none;border-top:1px solid #eadfce;margin:16px 0">
    <h3 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 6px">The brief</h3>
    ${brief}
    <p style="color:#9a8b7c;font-size:12px;margin-top:24px">Stripe order ${esc(order.stripe_session_id)}</p>
  </div>`;
}

async function sendOrderNotification(order) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFY_EMAIL;
  if (!key || !to) return; // not configured yet — skip quietly
  const from = process.env.ORDER_FROM_EMAIL || 'Heart Note <onboarding@resend.dev>';
  const amount = Math.round((order.amount_total || 0) / 100);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `New order — ${order.tier} ($${amount})`,
        html: orderEmailHTML(order),
        ...(order.customer_email ? { reply_to: order.customer_email } : {}),
      }),
    });
    if (!r.ok) console.error('Resend error', r.status, await r.text());
  } catch (err) {
    console.error('Order notification failed:', err);
  }
}

// Store every paid order's full customer input in the database (Supabase).
// A few columns are broken out for the future admin dashboard to filter/sort
// on; the complete brief is kept in `brief` so nothing is ever lost.
// Idempotent: Stripe can retry a webhook, so we upsert on the session id.
async function saveOrder(order) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  // Accept the plain project URL, and tolerate a trailing slash or an
  // accidental "/rest/v1" so we never build a doubled-up path.
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!url || !key) return; // not configured yet — skip quietly
  const row = {
    stripe_session_id: order.stripe_session_id,
    status: 'new',
    tier: order.tier || null,
    amount_total: order.amount_total ?? null,
    currency: order.currency || 'usd',
    customer_email: order.customer_email || null,
    customer_name: order.customer_name || null,
    occasion: order.tier === 'wedding'
      ? 'Wedding'
      : (order.occasion === 'Other' ? (order.occasion_other || 'Other') : (order.occasion || null)),
    recipient_name: order.recipient_name || null,
    song_count: order.song_count ? (parseInt(order.song_count, 10) || null) : null,
    brief: order,
  };
  try {
    const r = await fetch(`${url}/rest/v1/orders?on_conflict=stripe_session_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) console.error('Supabase insert error', r.status, await r.text());
  } catch (err) {
    console.error('Saving order to database failed:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // The full brief to hand to the AI workflow.
    const order = {
      ...reassembleChunks(session.metadata || {}),
      stripe_session_id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || session.metadata?.delivery_email,
      customer_name: session.customer_details?.name || '',
      paid_at: event.created,
    };

    // Save the full customer input to the database, then email whoever fills
    // the order. Both are safe no-ops until their keys are configured.
    await saveOrder(order);
    await sendOrderNotification(order);

    try {
      if (process.env.AI_WORKFLOW_URL) {
        const resp = await fetch(process.env.AI_WORKFLOW_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.AI_WORKFLOW_SECRET
              ? { Authorization: `Bearer ${process.env.AI_WORKFLOW_SECRET}` }
              : {}),
          },
          body: JSON.stringify(order),
        });
        if (!resp.ok) console.error('AI workflow responded', resp.status, await resp.text());
      } else {
        // Not wired yet — log so you can see orders in the Vercel function logs.
        console.log('NEW ORDER (AI_WORKFLOW_URL not set):', JSON.stringify(order));
      }
    } catch (err) {
      // Don't hard-fail the webhook; Stripe would retry. Log for investigation.
      console.error('Handoff to AI workflow failed:', err);
    }
  }

  return res.status(200).json({ received: true });
}
