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
// The last two emails are NOT scheduled here. They say Paul recorded a
// preview, so they only send from the deliver tool once he actually has.

import { sbInsert, sbSelect, sbUpdate, supabaseReady } from './db.js';
import { sendEmail, mailReady, cancelEmail } from './mail.js';
import {
  nudgeSavedHTML, nudgeSavedSubject,
  previewOfferHTML, previewOfferSubject,
  previewOfferAgainHTML, previewOfferAgainSubject,
  previewReadyHTML, previewReadySubject,
  previewFollowUpHTML, previewFollowUpSubject,
  previewRequestedInternalHTML, previewRequestedInternalSubject,
} from './abandoned-emails.js';

const TABLE = 'abandoned_checkouts';

// Minutes after abandonment. Deliberately close together at the start, while
// the gift is still on their mind, then a gap.
const SCHEDULE = [
  { key: 'saved', minutes: 15, subject: nudgeSavedSubject, html: nudgeSavedHTML },
  { key: 'offer', minutes: 75, subject: previewOfferSubject, html: previewOfferHTML },
  { key: 'offer2', minutes: 135, subject: previewOfferAgainSubject, html: previewOfferAgainHTML },
];

const FOLLOW_UP_MINUTES = 60;   // gap between "Paul recorded it" and "did you listen"
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
    } catch (err) {
      // One failed schedule must not lose the others.
      console.warn(`abandoned: could not schedule "${step.key}":`, err.message);
    }
  }
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
  return { created: created.id, scheduled: ids.length };
}

function briefFields(p = {}) {
  return {
    recipient_name: clip(p.recipient, 120),
    relationship: clip(p.relationship, 120),
    recipient_gender: clip(p.gender, 20),
    occasion: clip(p.occasion, 120),
    themes: clip(p.themes, 240),
    music_style: clip(p.style, 80),
    tempo: clip(p.tempo, 40),
    voice: clip(p.voice, 40),
    favorite_thing: clip(p.favorite, 500),
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
async function stopSequence(row) {
  const ids = Array.isArray(row.scheduled_email_ids) ? row.scheduled_email_ids : [];
  let cancelled = 0;
  for (const id of ids) if (await cancelEmail(id)) cancelled += 1;
  return cancelled;
}

// Called from the Stripe webhook. Someone paid, so nothing further should send.
export async function markRecovered(email) {
  if (!supabaseReady()) return { skipped: 'not configured' };
  const addr = String(email || '').trim().toLowerCase();
  if (!isEmail(addr)) return { skipped: 'no email' };
  const rows = await sbSelect(TABLE,
    `select=id,scheduled_email_ids&email=eq.${encodeURIComponent(addr)}&status=in.(open,preview_requested,preview_ready)`);
  let cancelled = 0;
  for (const row of rows) {
    cancelled += await stopSequence(row);
    await sbUpdate(TABLE, `id=eq.${row.id}`, { status: 'recovered', recovered_at: new Date().toISOString() });
  }
  return { rows: rows.length, cancelled };
}

export async function markUnsubscribed(token) {
  const row = await findByToken(token);
  if (!row) return null;
  await stopSequence(row);
  await sbUpdate(TABLE, `id=eq.${row.id}`, { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() });
  return row;
}

// They clicked "yes, I would like to hear it". Tell Paul, and stop nagging.
export async function requestPreview(token) {
  const row = await findByToken(token);
  if (!row) return null;
  if (row.status === 'open') {
    // They have asked, so the remaining "would you like a preview" nudge is
    // now redundant. The saved-brief reminder may already have gone.
    await stopSequence(row);
    await sbUpdate(TABLE, `id=eq.${row.id}`, {
      status: 'preview_requested',
      preview_requested_at: new Date().toISOString(),
      scheduled_email_ids: [],
    });
    if (mailReady() && process.env.ORDER_NOTIFY_EMAIL) {
      try {
        await sendEmail({
          to: process.env.ORDER_NOTIFY_EMAIL,
          subject: previewRequestedInternalSubject(row),
          html: previewRequestedInternalHTML(row),
          replyTo: row.email,
        });
      } catch (err) {
        console.warn('abandoned: could not notify about preview request:', err.message);
      }
    }
  }
  return row;
}

// Paul uploaded a real recording. Only now may we say he made one.
export async function deliverPreview({ id, previewUrl, note }) {
  if (!abandonedReady()) throw new Error('Abandoned recovery is not configured');
  const rows = await sbSelect(TABLE, `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const row = rows[0];
  if (!row) throw new Error('That preview request no longer exists');
  if (row.status === 'recovered') throw new Error('They have already bought, so nothing was sent');
  if (row.status === 'unsubscribed') throw new Error('They unsubscribed, so nothing was sent');

  const withPreview = { ...row, preview_url: previewUrl, preview_note: note || null };

  await sendEmail({
    to: row.email,
    subject: previewReadySubject(withPreview),
    html: previewReadyHTML(withPreview),
    replyTo: process.env.ORDER_NOTIFY_EMAIL || undefined,
  });
  let followUpId = null;
  try {
    const res = await sendEmail({
      to: row.email,
      subject: previewFollowUpSubject(withPreview),
      html: previewFollowUpHTML(withPreview),
      replyTo: process.env.ORDER_NOTIFY_EMAIL || undefined,
      scheduledAt: atMinutes(FOLLOW_UP_MINUTES),
    });
    if (res && res.id) followUpId = res.id;
  } catch (err) {
    console.warn('abandoned: could not schedule the preview follow-up:', err.message);
  }

  await sbUpdate(TABLE, `id=eq.${row.id}`, {
    status: 'preview_ready',
    preview_url: previewUrl,
    preview_note: note || null,
    preview_sent_at: new Date().toISOString(),
    scheduled_email_ids: followUpId ? [followUpId] : [],
    emails_sent: (row.emails_sent || 0) + 1,
  });
  return { ...withPreview, id: row.id };
}

// Paul's queue, newest first, people who asked at the top.
export async function listQueue() {
  if (!supabaseReady()) return [];
  return sbSelect('abandoned_queue', 'select=*&limit=50');
}
