// The customer's private lyric-approval page.
// URL: /lyrics/<order_id>  (rewritten to /api/lyrics?id=<order_id>)
//
// They read the words before anything is recorded, then either approve them or
// send back changes. The link itself is the credential, same as the gift page.
import { getOrder, supabaseReady } from '../lib/db.js';
import { esc } from '../lib/mail.js';

const shell = (title, body) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="/brand_assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --claret:#6E1423; --ivory:#F7F1E6; --gold:#C6973F; --ink:#2B2019; --soft:#6B5D50; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--ivory); color:var(--ink); font-family:'Nunito Sans',system-ui,sans-serif; line-height:1.7; }
  h1,h2,.display { font-family:'Fraunces',Georgia,serif; font-weight:500; }
  .wrap { max-width:44rem; margin:0 auto; padding:2.5rem 1.25rem 4rem; }
  .card { background:#fff; border:1px solid rgba(110,20,35,.12); border-radius:26px; overflow:hidden;
          box-shadow:0 2px 4px rgba(54,9,17,.05), 0 30px 60px -24px rgba(110,20,35,.35); }
  .head { background:var(--claret); color:var(--ivory); padding:2.2rem 2rem 1.9rem; text-align:center; }
  .head h1 { margin:.3rem 0 0; font-size:2rem; line-height:1.2; }
  .eyebrow { color:#E4C67F; text-transform:uppercase; letter-spacing:.16em; font-size:.72rem; font-weight:700; margin:0; }
  .body { padding:2rem; }
  .lyrics { white-space:pre-wrap; background:#FBF7EE; border:1px solid #eadfce; border-radius:14px;
            padding:1.4rem 1.6rem; font-size:1.05rem; line-height:1.85; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; border-radius:999px;
         padding:.95rem 1.9rem; font:inherit; font-weight:700; cursor:pointer; border:1px solid transparent;
         text-decoration:none; transition:transform .3s cubic-bezier(.34,1.56,.64,1), background-color .25s ease; }
  .btn:active { transform:translateY(0); }
  .btn:focus-visible { outline:3px solid var(--gold); outline-offset:3px; }
  .primary { background:var(--claret); color:var(--ivory); box-shadow:0 10px 24px -10px rgba(110,20,35,.6); width:100%; }
  .primary:hover { background:#5a0f1c; transform:translateY(-2px); }
  .ghost { background:transparent; color:var(--claret); border-color:rgba(110,20,35,.28); width:100%; }
  .ghost:hover { background:rgba(110,20,35,.06); transform:translateY(-2px); }
  textarea { width:100%; font:inherit; padding:.85rem 1rem; border:1px solid rgba(110,20,35,.18);
             border-radius:12px; background:#FBF7EE; min-height:130px; resize:vertical; color:var(--ink); }
  textarea:focus { outline:none; border-color:var(--gold); box-shadow:0 0 0 3px rgba(198,151,63,.25); }
  .muted { color:var(--soft); }
  .hidden { display:none; }
  .note { background:rgba(233,203,192,.35); border:1px solid rgba(110,20,35,.1); border-radius:12px; padding:.9rem 1.1rem; }
  .err { color:var(--claret); font-weight:700; }
  @media (prefers-reduced-motion: reduce) { .btn { transition:none; } }
</style>
</head><body><div class="wrap">${body}</div></body></html>`;

const notice = (title, msg) => shell(title, `<div class="card"><div class="body" style="text-align:center;padding:3rem 2rem">
  <h1 class="display" style="color:#6E1423;margin:0 0 .6rem">${esc(title)}</h1>
  <p class="muted" style="margin:0">${esc(msg)}</p></div></div>`);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseReady()) return res.status(500).send(notice('Not available', 'This page is not configured yet.'));

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(404).send(notice('Not found', 'That link is missing an order.'));

  let order;
  try { order = await getOrder(id); } catch (e) {
    console.error('lyrics page failed:', e);
    return res.status(500).send(notice('Something went wrong', 'Please try again in a moment.'));
  }
  if (!order) return res.status(404).send(notice('Not found', 'We could not find that order.'));
  if (!order.lyrics) {
    return res.status(200).send(notice('Not quite yet', 'Your lyrics are still being written. We will email you the moment they are ready.'));
  }

  const name = esc(order.recipient_name || order.brief?.recipient_name || 'your song');
  const approved = order.lyrics_status === 'approved';

  const body = approved
    ? `<div class="card">
        <div class="head"><p class="eyebrow">Approved</p><h1>These words are final</h1></div>
        <div class="body">
          <p class="muted" style="margin:0 0 1.2rem">Thank you — we're recording ${name}'s song now. You'll get an email as soon as it's ready.</p>
          <div class="lyrics">${esc(order.lyrics)}</div>
        </div>
      </div>`
    : `<div class="card">
        <div class="head"><p class="eyebrow">Before we record</p><h1>The words to ${name}'s song</h1></div>
        <div class="body">
          <p class="muted" style="margin:0 0 1.4rem">Read them over. If anything isn't right — a name, a date, a line that doesn't sound like them — tell us and we'll rewrite it. Nothing is recorded until you're happy.</p>
          <div class="lyrics">${esc(order.lyrics)}</div>

          <div id="choice" style="margin-top:1.8rem;display:grid;gap:.75rem">
            <button type="button" class="btn primary" id="approveBtn">These are perfect — start recording</button>
            <button type="button" class="btn ghost" id="changeBtn">I'd like some changes</button>
          </div>

          <div id="changeForm" class="hidden" style="margin-top:1.5rem">
            <label for="feedback" style="font-weight:700;display:block;margin-bottom:.5rem">What would you like changed?</label>
            <p class="muted" style="margin:0 0 .7rem;font-size:.95rem">Be as specific as you like — quote the line and tell us what it should say.</p>
            <textarea id="feedback" maxlength="4000" placeholder="Verse 2 says 'thirty years' but it should be forty. And could the chorus mention her garden?"></textarea>
            <div style="display:grid;gap:.6rem;margin-top:.9rem">
              <button type="button" class="btn primary" id="sendChanges">Send these changes</button>
              <button type="button" class="btn ghost" id="cancelChanges">Never mind, go back</button>
            </div>
          </div>

          <p id="err" class="err hidden" style="margin-top:1rem"></p>
          <p class="muted" style="margin-top:1.6rem;font-size:.92rem">Questions? Just reply to the email that brought you here.</p>
        </div>
      </div>

      <script>
        var id = ${JSON.stringify(id)};
        var $ = function (s) { return document.getElementById(s); };
        function fail(m) { $('err').textContent = m; $('err').classList.remove('hidden'); }
        function lock(on, btn, text) { btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = text; } else if (btn.dataset.t) { btn.textContent = btn.dataset.t; } }

        $('changeBtn').addEventListener('click', function () {
          $('choice').classList.add('hidden'); $('changeForm').classList.remove('hidden'); $('feedback').focus();
        });
        $('cancelChanges').addEventListener('click', function () {
          $('changeForm').classList.add('hidden'); $('choice').classList.remove('hidden'); $('err').classList.add('hidden');
        });

        function respond(approved, feedback, btn, busyText) {
          $('err').classList.add('hidden');
          lock(true, btn, busyText);
          fetch('/api/lyrics-response', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: id, approved: approved, feedback: feedback }),
          }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (o) {
              if (!o.ok) { lock(false, btn); return fail(o.j.error || 'Something went wrong.'); }
              location.reload();
            })
            .catch(function () { lock(false, btn); fail('Something went wrong. Please try again.'); });
        }

        $('approveBtn').addEventListener('click', function () { respond(true, '', $('approveBtn'), 'Sending…'); });
        $('sendChanges').addEventListener('click', function () {
          var v = $('feedback').value.trim();
          if (v.length < 5) return fail('Please tell us what you would like changed.');
          respond(false, v, $('sendChanges'), 'Sending…');
        });
      </script>`;

  return res.status(200).send(shell(`The lyrics for ${order.recipient_name || 'your song'}`, body));
}
