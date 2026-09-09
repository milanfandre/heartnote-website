// Abandoned-checkout recovery for the V3 quiz.
//
// How it works, and why it is built this way:
//
// The quiz asks for an email at step 2 of 3, before payment. That is the only
// point in any Heart Note flow where we know how to reach someone who has not
// bought, so this is the only flow that can be recovered.
//
// The first three follow-ups are handed to Resend at capture time with a
// `scheduled_at`, which means no cron job and no scheduler of our own. That
// matters: api/ is at the 12-function Vercel Hobby ceiling, so there was no
// room for a worker. Resend holds them for up to 72 hours; the sequence spans
// under three, so it fits comfortably.
//
// If the person buys, the webhook cancels whatever has not sent. If they
// unsubscribe, the same. Cancellation is best-effort and never throws, because
// a failed cancel must not break a paid order.
//
// Every email is scheduled up front. They sell with work that already exists,
// real songs and the reaction videos customers filmed, so nothing waits on
// anyone recording something bespoke. Resend holds them up to 72 hours and the
// sequence ends at 20, so it fits.

import { sbInsert, sbSelect, sbUpdate, supabaseReady } from './db.js';
import { sendEmail, mailReady, cancelEmail } from './mail.js';
import {
  nudgeSavedHTML, nudgeSavedSubject,
  hearSongsHTML, hearSongsSubject,
  realReactionsHTML, realReactionsSubject,
  lastCallHTML, lastCallSubject,
} from './abandoned-emails.js';

const TABLE = 'abandoned_checkouts';

// Minutes after abandonment. Deliberately close together at the start, while
// the gift is still on their mind, then a gap.
const SCHEDULE = [
  { key: 'saved',     minutes: 15,   subject: nudgeSavedSubject,     html: nudgeSavedHTML },
  { key: 'songs',     minutes: 75,   subject: hearSongsSubject,      html: hearSongsHTML },
  { key: 'reactions', minutes: 135,  subject: realReactionsSubject,  html: realReactionsHTML },
  { key: 'lastcall',  minutes: 1200, subject: lastCallSubject,       html: lastCallHTML },
];

const RECAPTURE_WINDOW_DAYS = 7; // do not start a second sequence inside this

export function abandonedReady() {
  return supabaseReady() && mailReady();
}

const isEmail = (v) => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : null);
const atMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

function newToken() {
  const b = new Uint8Array(24);
  (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(b);
  return Buffer.from(b).toString('base64url');
}

async function scheduleSequence(row, from = 0) {
  const ids = [];
  const errors = [];
  for (const step of SCHEDULE.slice(from)) {
    try {
      const res = await sendEmail({
        to: row.email,
        subject: step.subject(row),
        html: step.html(row),
        replyTo: process.env.ORDER_NOTIFY_EMAIL || undefined,
        scheduledAt: atMinutes(step.minutes),
      });
      if (res && res.id) ids.push(res.id);
      // Resend allows 2 requests a second; space these so a burst cannot 429.
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      // One failed schedule must not lose the others.
      console.warn(`abandoned: could not schedule "${step.key}":`, err.message);
      errors.push(`${step.key}: ${err.message}`);
    }
  }
  scheduleSequence.lastErrors = errors;
  return ids;
}

// Called when someone reaches the payment step of the quiz with a valid email.
// Best-effort by design: this runs off a fire-and-forget beacon.
export async function captureAbandoned(payload = {}, attr = null) {
  if (!abandonedReady()) return { skipped: 'not configured' };
  const email = String(payload.email || '').trim().toLowerCase();
  if (!isEmail(email)) return { skipped: 'no email' };

  // Already bought, already unsubscribed, or already in a sequence? Leave it.
  const since = new Date(Date.now() - RECAPTURE_WINDOW_DAYS * 864e5).toISOString();
  const existing = await sbSelect(TABLE,
    `select=id,status,token&email=eq.${encodeURIComponent(email)}&created_at=gte.${since}&order=created_at.desc&limit=1`);
  if (existing.length) {
    const row = existing[0];
    if (row.status === 'unsubscribed' || row.status === 'recovered') return { skipped: row.status };
    // Same person, refreshed brief: update the record, keep the running sequence.
    await sbUpdate(TABLE, `id=eq.${row.id}`, briefFields(payload));
    return { updated: row.id };
  }

  const row = {
    email,
    token: newToken(),
    ...briefFields(payload),
    attr: attr && typeof attr === 'object' ? attr : null,
  };
  const created = await sbInsert(TABLE, row);
  if (!created) return { skipped: 'insert failed' };

  const ids = await scheduleSequence(created);
  if (ids.length) await sbUpdate(TABLE, `id=eq.${created.id}`, { scheduled_email_ids: ids });
  return { created: created.id, scheduled: ids.length, errors: scheduleSequence.lastErrors || [] };
}

function briefFields(p = {}) {
  return {
    recipient_name: clip(p.recipient, 120),
    relationship: clip(p.relationship, 120),
    occasion: clip(p.occasion, 120),
    // The quiz no longer asks for themes or a favourite thing. Those columns
    // stay for older rows; new ones leave them null rather than repurposing
    // them, since the emails quote favorite_thing back to the customer.
    themes: null,
    music_style: clip(p.style, 80),
    tempo: clip(p.tempo, 40),
    voice: clip(p.singer ? `${p.voice} (${p.singer})` : p.voice, 40),
    favorite_thing: null,
    story: clip(p.story, 4000),
    tier: clip(p.tier, 40),
    brief: p && typeof p === 'object' ? p : null,
  };
}

export async function findByToken(token) {
  if (!supabaseReady() || !token) return null;
  const rows = await sbSelect(TABLE, `select=*&token=eq.${encodeURIComponent(String(token))}&limit=1`);
  return rows[0] || null;
}

// Stop every pending follow-up for a row, whatever the reason.
//
// Returns the ids that could NOT be cancelled. Those are written back to the
// row, so `status` is closed but `scheduled_email_ids` is non-empty exactly
// when email is still going to reach someone it should not. That is a
// one-query health check with no extra column:
//   select email,status,scheduled_email_ids from abandoned_checkouts
//    where status in ('recovered','unsubscribed')
//      and array_length(scheduled_email_ids,1) > 0;
async function stopSequence(row) {
  const ids = Array.isArray(row.scheduled_email_ids) ? row.scheduled_email_ids : [];
  const stuck = [];
  for (const id of ids) if (!(await cancelEmail(id))) stuck.push(id);
  if (stuck.length) {
    console.error(`abandoned: ${stuck.length} follow-up(s) for ${row.email} could NOT be cancelled and will still send`);
  }
  return stuck;
}

// Called from the Stripe webhook. Someone paid, so nothing further should send.
export async function markRecovered(email) {
  if (!supabaseReady()) return { skipped: 'not configured' };
  const addr = String(email || '').trim().toLowerCase();
  if (!isEmail(addr)) return { skipped: 'no email' };
  // preview_requested / preview_ready are from the earlier bespoke-preview
  // design. No new row gets them, but an old one still must stop emailing
  // the moment that person buys.
  const rows = await sbSelect(TABLE,
    `select=id,scheduled_email_ids&email=eq.${encodeURIComponent(addr)}&status=in.(open,preview_requested,preview_ready)`);
  let stuck = 0;
  for (const row of rows) {
    const failed = await stopSequence(row);
    stuck += failed.length;
    await sbUpdate(TABLE, `id=eq.${row.id}`, {
      status: 'recovered',
      recovered_at: new Date().toISOString(),
      scheduled_email_ids: failed,   // empty when everything really stopped
    });
  }
  return { rows: rows.length, uncancelled: stuck };
}

export async function markUnsubscribed(token) {
  const row = await findByToken(token);
  if (!row) return null;
  const failed = await stopSequence(row);
  await sbUpdate(TABLE, `id=eq.${row.id}`, {
    status: 'unsubscribed',
    unsubscribed_at: new Date().toISOString(),
    scheduled_email_ids: failed,
  });
  return row;
}
