// Stripe webhook: fires after a successful payment, verifies the signature,
// and hands the completed song brief off to the AI workflow.
//
// IMPORTANT: Stripe signature verification needs the RAW request body, so we
// disable Vercel's automatic body parsing below.
import Stripe from 'stripe';
import { orderNotificationHTML, orderConfirmationHTML } from '../lib/emails.js';
import { sendEmail, mailReady } from '../lib/mail.js';
import { sendMetaPurchase } from '../lib/meta.js';
import { updateOrder } from '../lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Confirmation email to the customer, right after payment.
async function sendOrderConfirmation(order) {
  if (!mailReady() || !order.customer_email) return;

  // Pull the actual line items from Stripe for an accurate itemized receipt.
  let receipt = [];
  try {
    const items = await stripe.checkout.sessions.listLineItems(order.stripe_session_id, { limit: 20 });
    receipt = (items.data || []).map((it) => ({ description: it.description, amount: it.amount_total, quantity: it.quantity }));
  } catch (err) {
    console.error('Could not fetch line items for receipt:', err);
  }

  try {
    await sendEmail({
      to: order.customer_email,
      subject: 'Your Heart Note order is confirmed',
      html: orderConfirmationHTML({
        recipient: order.recipient_name || order.brief?.recipient_name,
        tier: order.tier,
        receipt,
        total: order.amount_total,
        currency: order.currency,
      }),
      replyTo: process.env.ORDER_NOTIFY_EMAIL,
    });
  } catch (err) {
    console.error('Order confirmation email failed:', err);
  }
}

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
        html: orderNotificationHTML(order),
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
    attribution: order.attribution || null,
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

// Flatten an order into one readable spreadsheet row (header -> value).
function orderSheetRow(order) {
  const wedding = order.tier === 'wedding';
  let weddingSongs = '';
  if (wedding) {
    const keys = Object.keys(order).filter((k) => /^song\d+$/.test(k)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
    weddingSongs = keys.map((k, i) => `SONG ${i + 1}\n${order[k]}`).join('\n\n-----\n\n');
  }
  const occasion = wedding
    ? 'Wedding'
    : (order.occasion === 'Other' ? (order.occasion_other || 'Other') : (order.occasion || ''));
  // Where the order came from, as plain spreadsheet columns.
  const a = order.attribution || {};
  const aSrc = String(a.utm_source || a.source || '').toLowerCase();
  const cameFrom = (a.fbclid || /facebook|instagram|^fb$|^ig$|meta/.test(aSrc)) ? 'Meta ad'
    : (a.gclid || aSrc === 'google') ? 'Google ad'
    : (aSrc && aSrc !== 'direct') ? `Referral (${a.utm_source || a.source})`
    : (Object.keys(a).length ? 'Direct / organic' : '');

  const map = {
    'Date': order.paid_at ? new Date(order.paid_at * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '',
    'Status': 'New',
    'Came From': cameFrom,
    'Campaign': a.utm_campaign || '',
    'Ad': a.utm_content || '',
    'Ad Set': a.utm_term || '',
    'Landing Page': a.landing || '',
    'Package': order.tier || '',
    'Amount ($)': order.amount_total != null ? order.amount_total / 100 : '',
    'Customer Email': order.customer_email || '',
    'Occasion': occasion,
    'Song For': order.recipient_name || '',
    'Relationship': order.recipient_relationship || '',
    'From (sender)': order.sender_name || '',
    'Chosen Voice': wedding
      ? 'See Wedding Songs column (one per song)'
      : (order.voice_addon === 'yes' && order.voice ? order.voice : 'Not selected (default voice)'),
    'Style': order.music_style || 'No preference',
    'Mood': order.mood || 'No preference',
    'Story': order.story || '',
    'Must Include': order.must_include || '',
    'Other Info': order.other_info || '',
    'Wedding Songs': weddingSongs,
    'Order ID': order.stripe_session_id || '',
  };
  return { headers: Object.keys(map), values: Object.values(map) };
}

// Append the order to a Google Sheet (via a little Apps Script web app) so a
// non-technical client can watch orders in a plain spreadsheet. Safe no-op
// until GOOGLE_SHEET_WEBHOOK_URL is set.
async function sendToSheet(order) {
  const endpoint = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!endpoint) return;
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderSheetRow(order)),
    });
    if (!r.ok) console.error('Google Sheet append error', r.status, await r.text());
  } catch (err) {
    console.error('Google Sheet append failed:', err);
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

    // Upsell: unlock every version on an existing order. Not a new order, so
    // handle it and stop before any of the new-order side effects.
    if (session.metadata?.type === 'unlock_all') {
      const orderId = session.metadata.order_id;
      try {
        if (orderId) {
          await updateOrder(orderId, { versions_unlocked: true });
          console.log('Unlocked all versions for order', orderId);
        }
      } catch (err) {
        console.error('Unlocking versions failed:', err);
        return res.status(500).json({ error: 'unlock failed' }); // let Stripe retry
      }
      return res.status(200).json({ received: true });
    }

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

    // Which ad/campaign earned this order (captured on the landing page).
    // Parsed once here so the email, the sheet and the database all agree.
    try { order.attribution = order.attr ? JSON.parse(order.attr) : null; }
    catch { order.attribution = null; }

    // Save the full customer input to the database, then email whoever fills
    // the order. Both are safe no-ops until their keys are configured.
    await saveOrder(order);
    await sendToSheet(order);
    await sendOrderNotification(order);
    await sendOrderConfirmation(order);

    // Server-side Purchase to Meta (Conversions API), deduped with the browser
    // Pixel via the shared event id packed into the `meta` metadata value.
    try {
      const m = order.meta ? JSON.parse(order.meta) : {};
      await sendMetaPurchase({
        eventId: m.eid,
        email: order.customer_email,
        fbp: m.fbp, fbc: m.fbc, ip: m.ip, userAgent: m.ua,
        value: order.amount_total,
        currency: order.currency,
        eventSourceUrl: `${process.env.SITE_URL || 'https://heartnote.music'}/success.html`,
      });
    } catch (err) {
      console.error('Meta purchase event failed:', err);
    }

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
