// Renders a customer's private keepsake page from their order.
// URL: /gift/<order_id>  (rewritten to /api/gift?id=<order_id>)
//
// Single/Wedding: every delivered song, playable and downloadable.
// Deluxe/Experience: 2-3 versions. Until one is chosen, each is a 30-second
// preview. Choosing unlocks that version's full files; the rest stay previews
// behind the "unlock every version" upsell.
import { getOrder, supabaseReady } from '../lib/db.js';
import { esc } from '../lib/mail.js';
import { VERSIONS_PER_TIER, UPSELL_CENTS, dollars, upsellCopy } from '../lib/pricing.js';

const PREVIEW_SECONDS = 30;

// Extra downloads that ride along with a song/version.
const EXTRAS = {
  wav: { label: 'Download studio-quality WAV', name: (t) => `${t} - Heart Note (studio quality).wav` },
  multitrack: { label: 'Download multitrack files', name: (t) => `${t} - Heart Note (multitrack).zip` },
  remastered: { label: 'Download remastered version', name: (t) => `${t} - Heart Note (remastered).mp3` },
  zip: { label: 'Download multitrack files', name: (t) => `${t} - Heart Note (multitrack).zip` },
};

const DL_ICON = (n) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const LOCK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

// Storage is cross-origin, so the HTML download attribute is ignored. Asking
// Supabase for ?download makes it send an attachment header, which iOS honours.
const dlHref = (url, name) => `${esc(url)}?download=${encodeURIComponent(name)}`;

function shell(title, body) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="/brand_assets/favicon.png" />
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Nunito+Sans:wght@0,400;0,600;0,700&family=Pinyon+Script&display=swap" rel="stylesheet" />
<script>tailwind.config={theme:{extend:{colors:{claret:{DEFAULT:'#6E1423',deep:'#4E0E1A',dark:'#360911'},gold:{DEFAULT:'#C6973F',soft:'#E4C67F',pale:'#EFDCA9'},ivory:{DEFAULT:'#F7F1E6',deep:'#EFE6D4'},blush:'#E9CBC0',ink:{DEFAULT:'#2B2019',soft:'#6B5D50'}},fontFamily:{display:['Fraunces','serif'],body:['"Nunito Sans"','sans-serif'],script:['"Pinyon Script"','cursive']}}}};</script>
<style>
  body{background:#F7F1E6;color:#2B2019;font-family:'Nunito Sans',sans-serif;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(55% 45% at 82% 8%,rgba(233,203,192,.5) 0%,rgba(233,203,192,0) 60%),radial-gradient(45% 45% at 12% 92%,rgba(198,151,63,.18) 0%,rgba(198,151,63,0) 60%);}
  h1,h2,.font-display{font-family:'Fraunces',serif;} .script{font-family:'Pinyon Script',cursive;}
  .progress{position:relative;height:7px;border-radius:999px;background:rgba(110,20,35,.14);cursor:pointer;}
  .fill{position:absolute;inset:0 auto 0 0;width:0%;background:#C6973F;border-radius:999px;}
  .eq{display:inline-flex;align-items:flex-end;gap:3px;height:20px;} .eq span{width:3px;background:#C6973F;border-radius:2px;height:30%;}
  .playing .eq span{animation:bounce 1s ease-in-out infinite;}
  .playing .eq span:nth-child(2){animation-delay:.12s} .playing .eq span:nth-child(3){animation-delay:.28s}
  .playing .eq span:nth-child(4){animation-delay:.42s} .playing .eq span:nth-child(5){animation-delay:.6s}
  @keyframes bounce{0%,100%{height:25%}50%{height:100%}}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font-weight:700;border-radius:999px;transition:background-color .15s,transform .15s;}
  .btn:active{transform:scale(.98);}
  .btn:focus-visible{outline:3px solid #C6973F;outline-offset:2px;}
</style></head>
<body class="min-h-screen flex flex-col items-center justify-center px-6 py-12"><div class="w-full max-w-lg">
  <div class="flex items-center justify-center gap-2.5 mb-8">
    <img src="/brand_assets/heartnote-mark.png" alt="" style="height:34px;width:auto" />
    <span class="font-display text-xl font-500 text-claret">Heart Note</span>
  </div>
  ${body}
  <p class="text-center text-ink-soft text-sm mt-8">Want one for someone you love? <a href="/index.html" class="text-claret font-700 hover:text-claret-deep">Create a Heart Note</a>.</p>
</div></body></html>`;
}

function header(recipient, sender) {
  return `<div class="bg-claret text-ivory px-8 pt-9 pb-8 text-center relative">
      <div class="absolute inset-0 opacity-[.14] pointer-events-none" style="background-image:radial-gradient(50% 70% at 80% 10%, #C6973F 0%, transparent 60%)"></div>
      <p class="relative text-gold-soft tracking-[.16em] uppercase text-[.72rem] font-700">A Heart Note for</p>
      <h1 class="relative font-display font-500 text-[2.3rem] leading-tight mt-1">${esc(recipient)}</h1>
      ${sender ? `<p class="relative text-ivory/75 mt-3">with love from <span class="script text-gold-soft text-2xl align-middle">${esc(sender)}</span></p>` : ''}
    </div>`;
}

// One playable track. `locked` caps playback at 30s and hides the downloads.
function trackBlock({ title, url, eyebrow, locked, downloads = [], first }) {
  return `<div class="song ${first ? '' : 'mt-8 pt-8 border-t border-claret/10'}" data-src="${esc(url)}" data-locked="${locked ? '1' : ''}">
      <div class="flex items-start justify-between gap-3">
        <div>
          ${eyebrow ? `<p class="text-gold text-[.72rem] font-700 tracking-[.12em] uppercase">${esc(eyebrow)}</p>` : ''}
          <p class="font-display text-claret text-2xl leading-tight mt-1">${esc(title)}</p>
          ${locked ? `<p class="inline-flex items-center gap-1.5 text-ink-soft text-xs font-600 mt-1.5">${LOCK_ICON} 30-second preview</p>` : ''}
        </div>
        <div class="eq mt-1.5" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      </div>
      <div class="mt-5 flex items-center gap-4">
        <button type="button" class="play grid place-items-center w-16 h-16 rounded-full bg-claret text-ivory shrink-0 shadow-[0_10px_24px_-10px_rgba(110,20,35,.6)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold" aria-label="Play ${esc(title)}">
          <svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="flex-1">
          <div class="progress bar"><div class="fill"></div></div>
          <div class="flex justify-between text-ink-soft text-sm mt-2"><span class="cur">0:00</span><span class="dur">0:00</span></div>
        </div>
      </div>
      ${downloads.join('')}
    </div>`;
}

function downloadLink(url, name, label, primary) {
  const cls = primary
    ? 'mt-6 w-full btn border border-claret/25 text-claret py-3.5 hover:bg-claret/5'
    : 'mt-2.5 w-full btn bg-ivory-deep/70 text-ink-soft font-600 text-sm py-3 hover:text-claret hover:bg-ivory-deep';
  return `<a href="${dlHref(url, name)}" download="${esc(name)}" class="${cls}">${DL_ICON(primary ? 18 : 16)}${esc(label)}</a>`;
}

function versionDownloads(v) {
  const out = [downloadLink(v.mp3, `${v.title} - Heart Note.mp3`, 'Download your song', true)];
  for (const kind of ['wav', 'remastered', 'multitrack']) {
    if (v[kind] && EXTRAS[kind]) out.push(downloadLink(v[kind], EXTRAS[kind].name(v.title), EXTRAS[kind].label, false));
  }
  return out;
}

function upsellCard(tier, orderId) {
  const copy = upsellCopy(tier);
  return `<div class="mt-8 pt-7 border-t border-claret/10 text-center">
      <p class="font-display text-claret text-xl">${esc(copy.heading)}</p>
      <p class="text-ink-soft text-sm mt-1">${esc(copy.body)}. Every version, with all the files in your package, yours to keep.</p>
      <button type="button" id="unlockBtn" data-order="${esc(orderId)}" class="btn mt-4 w-full bg-gold text-claret-dark py-3.5 hover:bg-gold-soft">${esc(copy.cta)}</button>
      <p id="unlockErr" class="hidden text-claret text-sm mt-2"></p>
    </div>`;
}

// Deluxe/Experience before a choice is made: all previews + pick one.
function chooseScreen({ recipient, sender, versions, tier, orderId, justPaid }) {
  const blocks = versions.map((v, i) => {
    const choose = `<button type="button" class="choose btn mt-5 w-full bg-claret text-ivory py-3.5 hover:bg-claret-deep" data-i="${i}" data-title="${esc(v.title)}">Choose this version</button>`;
    return trackBlock({
      title: v.title, url: v.mp3, eyebrow: `Version ${i + 1}`, locked: true, first: i === 0,
      downloads: [choose],
    });
  }).join('');

  return `${justPaid ? paidNotice() : ''}
  <div class="mb-5 rounded-2xl bg-blush/25 border border-claret/10 px-5 py-4">
    <p class="font-700 text-claret text-sm mb-1.5">Choose your version</p>
    <ul class="space-y-1 text-sm text-ink/85 list-disc pl-4">
      <li>We wrote ${versions.length} versions of your song. Have a listen to each one.</li>
      <li>Choose your favourite and it's yours in full, to download and keep forever.</li>
      <li>Love more than one? You can unlock them all for ${esc(dollars(UPSELL_CENTS[tier]))}.</li>
    </ul>
  </div>
  <div class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 overflow-hidden">
    ${header(recipient, sender)}
    <div class="px-8 py-8">
      ${blocks}
      ${upsellCard(tier, orderId)}
    </div>
  </div>
  ${playerScript()}
  ${chooseScript(orderId)}`;
}

// After a choice (or after unlocking): chosen version in full, others locked.
function keepsakeVersions({ recipient, sender, versions, tier, orderId, selected, unlocked, occasionLabel, justPaid }) {
  const open = (i) => unlocked || i === selected;
  const ordered = versions.map((v, i) => ({ v, i })).sort((a, b) => (open(b.i) ? 1 : 0) - (open(a.i) ? 1 : 0));

  const blocks = ordered.map(({ v, i }, pos) => trackBlock({
    title: v.title,
    url: v.mp3,
    eyebrow: pos === 0 && occasionLabel && open(i) ? occasionLabel : `Version ${i + 1}`,
    locked: !open(i),
    first: pos === 0,
    downloads: open(i) ? versionDownloads(v) : [],
  })).join('');

  const anyLocked = versions.some((_, i) => !open(i));

  return `${justPaid && !unlocked ? paidNotice() : ''}
  <div class="mb-5 rounded-2xl bg-blush/25 border border-claret/10 px-5 py-4">
    <p class="font-700 text-claret text-sm mb-1.5">Sharing this song</p>
    <ul class="space-y-1 text-sm text-ink/85 list-disc pl-4">
      <li>Email or text this page's link to your loved one. They can open it right away, with no sign-in needed.</li>
      <li>It plays on any phone, tablet, or computer.</li>
      <li>Tap "Download" to save the file and keep it forever.</li>
    </ul>
  </div>
  <div class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 overflow-hidden">
    ${header(recipient, sender)}
    <div class="px-8 py-8">
      ${blocks}
      ${anyLocked ? upsellCard(tier, orderId) : ''}
      <p class="text-center text-ink-soft text-sm mt-6">Yours to keep, play, and share forever.</p>
    </div>
  </div>
  ${playerScript()}`;
}

function paidNotice() {
  return `<div class="mb-5 rounded-2xl bg-gold/15 border border-gold/50 px-5 py-4 text-center">
    <p class="font-700 text-claret text-sm">Payment received</p>
    <p class="text-ink-soft text-sm mt-1">Your other versions are unlocking now. Refresh this page in a few seconds if they aren't showing yet.</p>
  </div>`;
}

function playerScript() {
  return `<script>
    var players = [];
    var PREVIEW = ${PREVIEW_SECONDS};
    document.querySelectorAll('.song').forEach(function (block) {
      var audio = new Audio(block.dataset.src); audio.preload = 'metadata';
      var locked = block.dataset.locked === '1';
      var icon = block.querySelector('.icon path'), fill = block.querySelector('.fill'), bar = block.querySelector('.bar');
      var cur = block.querySelector('.cur'), dur = block.querySelector('.dur'), play = block.querySelector('.play');
      var fmt = function (s) { return isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00'; };
      var span = function () { return locked ? Math.min(PREVIEW, audio.duration || PREVIEW) : audio.duration; };
      audio.addEventListener('loadedmetadata', function () { dur.textContent = fmt(span()); });
      audio.addEventListener('timeupdate', function () {
        if (locked && audio.currentTime >= PREVIEW) { audio.pause(); audio.currentTime = 0; fill.style.width = '0%'; cur.textContent = '0:00'; return; }
        var total = span() || 0;
        fill.style.width = (total ? Math.min(audio.currentTime / total * 100, 100) : 0) + '%';
        cur.textContent = fmt(audio.currentTime);
      });
      audio.addEventListener('play', function () {
        players.forEach(function (o) { if (o !== audio && !o.paused) o.pause(); });
        icon.setAttribute('d', 'M6 5h4v14H6zM14 5h4v14h-4z'); block.classList.add('playing');
      });
      audio.addEventListener('pause', function () { icon.setAttribute('d', 'M8 5v14l11-7z'); block.classList.remove('playing'); });
      audio.addEventListener('ended', function () { fill.style.width = '0%'; cur.textContent = '0:00'; });
      play.addEventListener('click', function () { audio.paused ? audio.play().catch(function () {}) : audio.pause(); });
      bar.addEventListener('click', function (e) {
        var total = span(); if (!total) return;
        var r = bar.getBoundingClientRect();
        audio.currentTime = Math.min((e.clientX - r.left) / r.width * total, total - 0.05);
      });
      players.push(audio);
    });
    var unlock = document.getElementById('unlockBtn');
    if (unlock) unlock.addEventListener('click', async function () {
      var err = document.getElementById('unlockErr');
      unlock.disabled = true; var t = unlock.textContent; unlock.textContent = 'Taking you to checkout…';
      try {
        var r = await fetch('/api/create-upsell-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: unlock.dataset.order }) });
        var d = await r.json();
        if (!r.ok || !d.url) throw new Error(d.error || 'Could not start checkout.');
        window.location.href = d.url;
      } catch (e) {
        err.textContent = e.message; err.classList.remove('hidden');
        unlock.disabled = false; unlock.textContent = t;
      }
    });
  </script>`;
}

function chooseScript(orderId) {
  return `<script>
    document.querySelectorAll('.choose').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var title = btn.dataset.title;
        if (!confirm('Choose "' + title + '" as your version?\\n\\nThis is the version you\\'ll keep, and it can\\'t be changed afterwards. You can still unlock the others at any time.')) return;
        btn.disabled = true; btn.textContent = 'Saving your choice…';
        try {
          var r = await fetch('/api/choose-version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: '${esc(orderId)}', version: Number(btn.dataset.i) }) });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Could not save your choice.');
          window.location.reload();
        } catch (e) {
          alert(e.message); btn.disabled = false; btn.textContent = 'Choose this version';
        }
      });
    });
  </script>`;
}

// Single/Wedding: every delivered song, in full.
function keepsakeSongs({ recipient, sender, occasionLabel, songs, extras }) {
  const many = songs.length > 1;
  const blocks = songs.map((s, i) => trackBlock({
    title: s.title, url: s.url, eyebrow: i === 0 ? occasionLabel : '', locked: false, first: i === 0,
    downloads: [downloadLink(s.url, `${s.title} - Heart Note.mp3`, many ? 'Download this song' : 'Download your song', true)],
  })).join('');

  const extraBlock = extras.length ? `<div class="mt-8 pt-6 border-t border-claret/10">
      <p class="text-ink-soft text-sm font-600 mb-1">Also included in your package</p>
      ${extras.map((f) => downloadLink(f.url, EXTRAS[f.kind].name(songs[0].title), EXTRAS[f.kind].label, false)).join('')}
    </div>` : '';

  return `<div class="mb-5 rounded-2xl bg-blush/25 border border-claret/10 px-5 py-4">
    <p class="font-700 text-claret text-sm mb-1.5">Sharing ${many ? 'these songs' : 'this song'}</p>
    <ul class="space-y-1 text-sm text-ink/85 list-disc pl-4">
      <li>Email or text this page's link to your loved one. They can open it right away, with no sign-in needed.</li>
      <li>${many ? 'They play' : 'It plays'} on any phone, tablet, or computer.</li>
      <li>Tap "Download" to save ${many ? 'each song' : 'the file'} and keep ${many ? 'them' : 'it'} forever.</li>
    </ul>
  </div>
  <div class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 overflow-hidden">
    ${header(recipient, sender)}
    <div class="px-8 py-8">
      ${blocks}
      ${extraBlock}
      <p class="text-center text-ink-soft text-sm mt-6">Yours to keep, play, and share forever.</p>
    </div>
  </div>
  ${playerScript()}`;
}

function message(title, text) {
  return `<div class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 px-8 py-12 text-center">
    <h1 class="font-display font-500 text-claret text-[1.8rem] leading-tight">${esc(title)}</h1>
    <p class="text-ink-soft mt-3">${esc(text)}</p>
  </div>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); // state changes as they choose/unlock
  const id = req.query.id;

  if (!supabaseReady()) {
    return res.status(200).send(shell('Heart Note', message('Not available yet', 'This keepsake page is not configured yet. Please check back soon.')));
  }
  if (!id) {
    return res.status(404).send(shell('Heart Note', message('Not found', "We couldn't find that Heart Note.")));
  }

  let order;
  try {
    order = await getOrder(id);
  } catch (err) {
    console.error('gift getOrder failed:', err);
    return res.status(500).send(shell('Heart Note', message('Something went wrong', 'Please try again in a moment.')));
  }
  if (!order) {
    return res.status(404).send(shell('Heart Note', message('Not found', "We couldn't find that Heart Note. Please check the link.")));
  }

  const brief = order.brief || {};
  const recipient = brief.recipient_name || 'someone special';
  const sender = brief.sender_name || '';
  const occRaw = brief.occasion === 'Other' ? (brief.occasion_other || '') : (brief.occasion || '');
  const occasionLabel = occRaw ? `For their ${occRaw.toLowerCase()}` : '';
  const justPaid = req.query.unlocked === '1';

  // Deluxe/Experience: pick-a-version flow.
  const versions = Array.isArray(order.versions) ? order.versions.filter((v) => v && v.mp3) : [];
  if (versions.length && VERSIONS_PER_TIER[order.tier]) {
    const selected = Number.isInteger(order.selected_version) ? order.selected_version : null;
    const unlocked = Boolean(order.versions_unlocked);
    const body = (selected === null && !unlocked)
      ? chooseScreen({ recipient, sender, versions, tier: order.tier, orderId: id, justPaid })
      : keepsakeVersions({ recipient, sender, versions, tier: order.tier, orderId: id, selected, unlocked, occasionLabel, justPaid });
    return res.status(200).send(shell(`A Heart Note for ${recipient}`, body));
  }

  // Single/Wedding: straight to the songs.
  const stored = Array.isArray(order.song_files) ? order.song_files.filter((f) => f && f.url) : [];
  const songs = stored.filter((f) => f.kind === 'mp3').map((f, i) => ({ url: f.url, title: f.title || order.song_title || `Song ${i + 1}` }));
  const extras = stored.filter((f) => f.kind !== 'mp3' && EXTRAS[f.kind]);
  if (!songs.length && order.song_file_url) songs.push({ url: order.song_file_url, title: order.song_title || 'Your song' });

  if (!songs.length) {
    return res.status(200).send(shell('Your Heart Note', message('Your Heart Note is being composed', 'It will appear right here as soon as it is ready. We will email you the moment it is finished.')));
  }

  return res.status(200).send(shell(
    `A Heart Note for ${recipient}`,
    keepsakeSongs({ recipient, sender, occasionLabel, songs, extras })
  ));
}
