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
