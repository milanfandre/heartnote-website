// Abandoned-checkout emails for the V3 quiz.
//
// Two rules govern the copy, and both are deliberate:
//
//  1. Nothing here claims a song exists before it does. The first three
//     emails are reminders and an offer. The last two only ever send after
//     Paul has actually recorded a preview and uploaded it, because they
//     say he has.
//  2. Every email carries a one-click unsubscribe. These are commercial
//     emails to someone who has not bought, so that is a legal requirement,
//     not a nicety.
//
// House style matches lib/emails.js: Georgia serif headings in claret,
// Arial body, 640px wide, inline styles only (email clients strip <style>).

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SITE = 'https://www.heartnote.music';

// "Patricia" -> "Patricia's", "Chris" -> "Chris'"
const possessive = (name) => {
  const n = String(name || '').trim();
  if (!n) return '';
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
};

// Whose song is it? Falls back gracefully when the buyer chose "myself"
// or skipped the name.
function subjectNames(row) {
  const name = (row.recipient_name || '').trim();
  return {
    name,
    theirs: name ? possessive(name) : 'your',        // "Patricia's song" / "your song"
    them: name || 'them',
    forThem: name ? ` for ${name}` : '',
  };
}

function shell({ heading, body, cta, ctaUrl, footnote, token }) {
  const unsub = `${SITE}/unsubscribe/${encodeURIComponent(token)}`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2B2019">
    <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">${heading}</h2>
    ${body}
    ${cta ? `<p style="margin:24px 0 8px">
      <a href="${esc(ctaUrl)}" style="display:inline-block;background:#6E1423;color:#F7F1E6;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${esc(cta)}</a>
    </p>
    <p style="color:#9a8b7c;font-size:12px;margin-top:16px;word-break:break-all">Or paste this link into your browser:<br>${esc(ctaUrl)}</p>` : ''}
    ${footnote ? `<p style="color:#6B5D50;font-size:13px;margin-top:20px">${footnote}</p>` : ''}
    <hr style="border:none;border-top:1px solid #eadfce;margin:28px 0 14px">
    <p style="color:#9a8b7c;font-size:12px;line-height:1.6;margin:0">
      Heart Note, personal keepsake songs. You are getting this because you started a song on our website.<br>
      <a href="${esc(unsub)}" style="color:#9a8b7c">Unsubscribe from these reminders</a>
    </p>
  </div>`;
}

const para = (t) => `<p style="color:#6B5D50;line-height:1.6;margin:0 0 16px">${t}</p>`;

const quote = (t) => `<div style="background:#FBF7EE;border:1px solid #eadfce;border-radius:12px;padding:16px 20px;line-height:1.7;font-size:15px;color:#2B2019">${t}</div>`;

// ── 1. Fifteen minutes later: their answers are safe ──────────────────────
export function nudgeSavedHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: `${n.theirs === 'your' ? 'Your song' : `${n.theirs} song`} is saved`,
    body:
      para(`You were one step away from creating ${n.theirs === 'your' ? 'your song' : `a song for ${esc(n.them)}`}. Everything you told us is still here, so you can pick up exactly where you left off.`) +
      (row.favorite_thing ? quote(`You told us: &ldquo;${esc(row.favorite_thing)}&rdquo;`) : ''),
    cta: 'Finish your Heart Note',
    ctaUrl: `${SITE}/v3-order`,
    footnote: 'It takes about a minute from here. Nothing has been charged.',
  });
}
export const nudgeSavedSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `${possessive(n.name)} song is saved` : 'Your song is saved';
};

// ── 2. An hour later: offer a real preview ────────────────────────────────
export function previewOfferHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: 'Would you like to hear it first?',
    body:
      para(`Choosing a gift like this is easier once you have heard one.`) +
      para(`If it would help, Paul will record a short preview${esc(n.forThem)} and send it to you. It is free, and there is nothing to pay unless you love it.`),
    cta: 'Yes, I would like to hear it',
    ctaUrl: `${SITE}/hear/${encodeURIComponent(row.token)}`,
    footnote: 'One tap is all it takes. We will let you know as soon as it is ready.',
  });
}
export const previewOfferSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `Would you like to hear how ${esc(n.name)}'s song could sound?` : 'Would you like to hear how your song could sound?';
};

// ── 3. Two hours later: the offer stands ──────────────────────────────────
export function previewOfferAgainHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: 'The offer still stands',
    body:
      para(`We know a personal song is a big thing to picture before you have heard one.`) +
      para(`Paul is happy to record a short preview${esc(n.forThem)}, free, so you can hear what your story sounds like set to music before you decide anything.`),
    cta: 'Hear a preview',
    ctaUrl: `${SITE}/hear/${encodeURIComponent(row.token)}`,
    footnote: 'If now is not the moment, no problem at all. You can unsubscribe below and we will leave you be.',
  });
}
export const previewOfferAgainSubject = () => 'A free preview, whenever you are ready';

// ── 4. Paul has actually recorded something ───────────────────────────────
// Only ever sent from the deliver tool, after a real preview is uploaded.
export function previewReadyHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: `Paul recorded something${esc(n.forThem)}`,
    body:
      para(`Paul read what you told us and recorded a short preview${esc(n.forThem)}. It is yours to keep either way.`) +
      (row.preview_note ? quote(`From Paul: &ldquo;${esc(row.preview_note)}&rdquo;`) : ''),
    cta: 'Listen to the preview',
    ctaUrl: `${SITE}/preview/${encodeURIComponent(row.token)}`,
    footnote: 'This is a preview, so it is short. The full song is written and produced start to finish, and arrives within 24 hours of your order.',
  });
}
export const previewReadySubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `Paul recorded a preview for ${esc(n.name)}` : 'Paul recorded your preview';
};

// ── 5. An hour after that: did you hear it? ───────────────────────────────
export function previewFollowUpHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: 'Did you get a chance to listen?',
    body:
      para(`Your preview${esc(n.forThem)} is still here whenever you have a quiet minute.`) +
      para(`If you would like the full song, your answers are saved and it takes about a minute to finish. If not, that is completely fine.`),
    cta: 'Listen again',
    ctaUrl: `${SITE}/preview/${encodeURIComponent(row.token)}`,
    footnote: 'Every order includes one free revision, so if a detail is not right we will rework it at no cost.',
  });
}
export const previewFollowUpSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `${possessive(n.name)} preview is waiting` : 'Your preview is waiting';
};

// ── Internal: tell Paul someone asked for a preview ───────────────────────
export function previewRequestedInternalHTML(row) {
  const n = subjectNames(row);
  const line = (k, v) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#6B5D50;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#2B2019">${esc(v)}</td></tr>` : '');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2B2019">
    <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">Someone asked to hear a preview</h2>
    <p style="color:#6B5D50;line-height:1.6;margin:0 0 16px">They did not buy yet, and they have asked for a short preview${esc(n.forThem)}. Record one, then upload it in the Deliver tool under "Preview requests".</p>
    <table style="border-collapse:collapse;width:100%">
      ${line('Their email', row.email)}
      ${line('Song is for', row.recipient_name)}
      ${line('Relationship', row.relationship)}
      ${line('Occasion', row.occasion)}
      ${line('Style', row.music_style)}
      ${line('Tempo', row.tempo)}
      ${line('Voice', row.voice)}
      ${line('Themes', row.themes)}
    </table>
    ${row.favorite_thing ? `<h3 style="font-family:Georgia,serif;color:#6E1423;margin:16px 0 4px;font-size:15px">Favorite thing about them</h3>${quote(esc(row.favorite_thing))}` : ''}
    ${row.story ? `<h3 style="font-family:Georgia,serif;color:#6E1423;margin:16px 0 4px;font-size:15px">Their story</h3>${quote(esc(row.story).replace(/\n/g, '<br>'))}` : ''}
    <p style="margin:22px 0 0"><a href="${SITE}/deliver" style="display:inline-block;background:#6E1423;color:#F7F1E6;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">Open the Deliver tool</a></p>
  </div>`;
}
export const previewRequestedInternalSubject = (row) => {
  const n = subjectNames(row);
  return `Preview requested${n.name ? ` for ${n.name}` : ''} (${row.email})`;
};
