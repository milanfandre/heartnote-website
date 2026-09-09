// Abandoned-checkout emails for the V3 quiz.
//
// These go to someone who completed the quiz, gave an email, saw the price and
// did not pay. They are commercial emails to a non-customer, so every one
// carries a one-click unsubscribe. That is a legal requirement, not a nicety.
//
// The sequence sells with work that already exists: real songs written for
// other families, and the reaction videos those families filmed. Nothing here
// promises anything made specially for this person, because nothing is. An
// earlier design had Paul record a bespoke preview for each abandoned cart;
// that was dropped because it costs as much effort as writing the song itself.
//
// House style matches lib/emails.js: Georgia serif headings in claret, Arial
// body, 640px wide, inline styles only (email clients strip <style>).

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

function subjectNames(row) {
  const name = (row.recipient_name || '').trim();
  return {
    name,
    theirs: name ? possessive(name) : 'your',
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

// Real songs, already written and already on the site. Country and pop first,
// since those sell most.
const SONGS = [
  { title: 'The Old Man Called David', style: 'Country' },
  { title: 'Forever Starts Tonight', style: 'Country pop' },
  { title: 'Tonight We Start', style: 'Upbeat pop' },
];

// Reaction videos the customers filmed themselves. The posters are already
// served from the site, so the email shows a still and the click opens the
// real video on the page.
const REACTIONS = [
  { poster: 'poster-ugc-claire.jpg', caption: 'Her family played it at the table' },
  { poster: 'poster-ugc-dad-birthday.jpg', caption: 'Reading his own story back' },
  { poster: 'poster-ugc-jill.jpg', caption: 'Hearing it for the first time' },
];

// An image with a play badge drawn in the caption bar, because email clients
// will not render an overlay reliably.
function reactionCard(r) {
  const url = `${SITE}/v3#reactions`;
  return `<td style="padding:0 6px;width:33%;vertical-align:top">
    <a href="${esc(url)}" style="text-decoration:none;color:inherit">
      <img src="${SITE}/videos/${r.poster}" width="180" alt="" style="width:100%;max-width:180px;border-radius:10px;display:block;border:1px solid #eadfce" />
      <span style="display:block;color:#6B5D50;font-size:12px;line-height:1.4;margin-top:6px">&#9654;&nbsp;${esc(r.caption)}</span>
    </a>
  </td>`;
}

const reactionRow = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:4px 0 8px">
    <tr>${REACTIONS.map(reactionCard).join('')}</tr>
  </table>`;

const songList = () =>
  quote(SONGS.map((s) => `<span style="display:block;margin:2px 0"><strong>${esc(s.title)}</strong> <span style="color:#6B5D50">&middot; ${esc(s.style)}</span></span>`).join(''));

// ── 1. Fifteen minutes later: their answers are safe ──────────────────────
export function nudgeSavedHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: `${n.theirs === 'your' ? 'Your song' : `${n.theirs} song`} is saved`,
    body:
      para(`You were one step away from creating ${n.theirs === 'your' ? 'your song' : `a song for ${esc(n.them)}`}. Everything you told us is still here, so you can pick up exactly where you left off.`) +
      (row.story ? quote(`Your story so far: &ldquo;${esc(String(row.story).slice(0, 180))}${String(row.story).length > 180 ? '&hellip;' : ''}&rdquo;`) : ''),
    cta: 'Finish your Heart Note',
    ctaUrl: `${SITE}/v3-order`,
    footnote: 'It takes about a minute from here. Nothing has been charged.',
  });
}
export const nudgeSavedSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `${possessive(n.name)} song is saved` : 'Your song is saved';
};

// ── 2. An hour later: hear songs we have actually written ────────────────
export function hearSongsHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: 'Hear what one of these sounds like',
    body:
      para(`A song about someone you love is a hard thing to picture before you have heard one. So here are a few we have written for other families, in the styles people choose most.`) +
      songList() +
      para(`${n.name ? esc(n.name) + "'s song" : 'Your song'} would be written from scratch, around the story you gave us, with ${n.name ? 'their' : 'your'} own name in it.`),
    cta: 'Listen to a few',
    ctaUrl: `${SITE}/v3#listen`,
    footnote: 'Your answers are still saved, so you can pick up whenever you are ready.',
  });
}
export const hearSongsSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `Hear how ${possessive(n.name)} song could sound` : 'Hear how your song could sound';
};

// ── 3. Two hours later: the moment other families had ────────────────────
export function realReactionsHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: 'This is the part that is hard to explain',
    body:
      para(`These are real customers, filmed by their own families, hearing their song for the first time. Nobody here is an actor.`) +
      reactionRow() +
      para(`That reaction is the whole reason we do this${n.name ? `, and it is what is waiting for ${esc(n.name)}` : ''}.`),
    cta: 'Watch the reactions',
    ctaUrl: `${SITE}/v3#reactions`,
    footnote: 'Your answers are saved, so finishing takes about a minute.',
  });
}
export const realReactionsSubject = () => 'Real families hearing their song for the first time';

// ── 4. The next day: one last, quiet nudge ───────────────────────────────
export function lastCallHTML(row) {
  const n = subjectNames(row);
  return shell({
    token: row.token,
    heading: `${n.theirs === 'your' ? 'Your song' : `${n.theirs} song`} is still here`,
    body:
      para(`We will stop emailing after this one.`) +
      para(`Everything you wrote${esc(n.forThem)} is still saved, and finishing takes about a minute. If the timing is wrong, that is completely fine and we will leave you to it.`),
    cta: 'Finish your Heart Note',
    ctaUrl: `${SITE}/v3-order`,
    footnote: 'Written and produced by Paul and his team, and delivered within 24 hours.',
  });
}
export const lastCallSubject = (row) => {
  const n = subjectNames(row);
  return n.name ? `Still thinking about ${possessive(n.name)} song?` : 'Still thinking about your song?';
};
