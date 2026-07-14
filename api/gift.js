// Renders a customer's private keepsake page from their order.
// URL: /gift/<order_id>  (rewritten to /api/gift?id=<order_id>)
import { getOrder, supabaseReady } from '../lib/db.js';
import { esc } from '../lib/mail.js';

// Each deliverable the customer can download. Deluxe/Experience add wav + zip.
const FILES = {
  mp3: { label: 'Download your song', name: (t) => `${t} - Heart Note.mp3` },
  wav: { label: 'Download studio-quality WAV', name: (t) => `${t} - Heart Note (studio quality).wav` },
  zip: { label: 'Download multitrack files', name: (t) => `${t} - Heart Note (multitrack).zip` },
};

const DL_ICON = (n) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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

// Cross-origin storage ignores the HTML download attribute, so we ask Supabase
// to send the file as an attachment. iOS honours that and saves the file.
function downloadLink({ url, name, label, primary, dataSrc }) {
  const href = `${esc(url)}?download=${encodeURIComponent(name)}`;
  const cls = primary
    ? 'mt-7 w-full inline-flex items-center justify-center gap-2.5 rounded-full border border-claret/25 text-claret font-700 py-3.5 hover:bg-claret/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'
    : 'mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-ivory-deep/70 text-ink-soft font-600 text-sm py-3 hover:text-claret hover:bg-ivory-deep transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
  const attrs = primary ? ` id="download" data-src="${esc(dataSrc)}"` : '';
  return `<a${attrs} href="${href}" download="${esc(name)}" class="${cls}">${DL_ICON(primary ? 18 : 16)}${esc(label)}</a>`;
}

function keepsake({ recipient, sender, occasionLabel, songTitle, files }) {
  const mp3 = files.find((f) => f.kind === 'mp3') || files[0];
  const extras = files.filter((f) => f !== mp3 && FILES[f.kind]);
  const downloads = downloadLink({
    url: mp3.url, dataSrc: mp3.url, primary: true,
    name: FILES.mp3.name(songTitle), label: FILES.mp3.label,
  }) + extras.map((f) => downloadLink({
    url: f.url, primary: false,
    name: FILES[f.kind].name(songTitle), label: FILES[f.kind].label,
  })).join('');

  return `<div class="mb-5 rounded-2xl bg-blush/25 border border-claret/10 px-5 py-4">
    <p class="font-700 text-claret text-sm mb-1.5">Sharing this song</p>
    <ul class="space-y-1 text-sm text-ink/85 list-disc pl-4">
      <li>Email or text this page's link to your loved one. They can open it right away, with no sign-in needed.</li>
      <li>It plays on any phone, tablet, or computer.</li>
      <li>Tap "Download your song" to save the file and keep it forever.</li>
    </ul>
  </div>
  <div id="card" class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 overflow-hidden">
    <div class="bg-claret text-ivory px-8 pt-9 pb-8 text-center relative">
      <div class="absolute inset-0 opacity-[.14] pointer-events-none" style="background-image:radial-gradient(50% 70% at 80% 10%, #C6973F 0%, transparent 60%)"></div>
      <p class="relative text-gold-soft tracking-[.16em] uppercase text-[.72rem] font-700">A Heart Note for</p>
      <h1 class="relative font-display font-500 text-[2.3rem] leading-tight mt-1">${esc(recipient)}</h1>
      ${sender ? `<p class="relative text-ivory/75 mt-3">with love from <span class="script text-gold-soft text-2xl align-middle">${esc(sender)}</span></p>` : ''}
    </div>
    <div class="px-8 py-8">
      <div class="flex items-start justify-between gap-3">
        <div>
          ${occasionLabel ? `<p class="text-gold text-[.72rem] font-700 tracking-[.12em] uppercase">${esc(occasionLabel)}</p>` : ''}
          <p class="font-display text-claret text-2xl leading-tight mt-1">${esc(songTitle)}</p>
        </div>
        <div class="eq mt-1.5" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      </div>
      <div class="mt-6 flex items-center gap-4">
        <button type="button" id="play" aria-label="Play the song" class="grid place-items-center w-16 h-16 rounded-full bg-claret text-ivory shrink-0 shadow-[0_10px_24px_-10px_rgba(110,20,35,.6)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          <svg id="icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="flex-1">
          <div class="progress" id="bar"><div class="fill" id="fill"></div></div>
          <div class="flex justify-between text-ink-soft text-sm mt-2"><span id="cur">0:00</span><span id="dur">0:00</span></div>
        </div>
      </div>
      ${downloads}
      <p class="text-center text-ink-soft text-sm mt-4">Yours to keep, play, and share forever.</p>
    </div>
  </div>
  <script>
    const audio=new Audio(document.getElementById('download').dataset.src);audio.preload='metadata';
    const card=document.getElementById('card'),icon=document.getElementById('icon').querySelector('path');
    const fill=document.getElementById('fill'),bar=document.getElementById('bar'),cur=document.getElementById('cur'),dur=document.getElementById('dur');
    const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
    audio.addEventListener('loadedmetadata',()=>dur.textContent=fmt(audio.duration));
    audio.addEventListener('timeupdate',()=>{fill.style.width=(audio.duration?audio.currentTime/audio.duration*100:0)+'%';cur.textContent=fmt(audio.currentTime);});
    audio.addEventListener('play',()=>{icon.setAttribute('d','M6 5h4v14H6zM14 5h4v14h-4z');card.classList.add('playing');});
    audio.addEventListener('pause',()=>{icon.setAttribute('d','M8 5v14l11-7z');card.classList.remove('playing');});
    audio.addEventListener('ended',()=>{fill.style.width='0%';cur.textContent='0:00';});
    document.getElementById('play').addEventListener('click',()=>audio.paused?audio.play().catch(()=>{}):audio.pause());
    bar.addEventListener('click',e=>{if(!audio.duration)return;const r=bar.getBoundingClientRect();audio.currentTime=(e.clientX-r.left)/r.width*audio.duration;});
  </script>`;
}

function message(title, text) {
  return `<div class="bg-white rounded-[26px] shadow-[0_2px_4px_rgba(54,9,17,.05),0_30px_60px_-24px_rgba(110,20,35,.35)] border border-gold/30 px-8 py-12 text-center">
    <h1 class="font-display font-500 text-claret text-[1.8rem] leading-tight">${esc(title)}</h1>
    <p class="text-ink-soft mt-3">${esc(text)}</p>
  </div>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

  // Newer orders carry every deliverable in song_files; older ones just the mp3.
  const stored = Array.isArray(order.song_files) ? order.song_files.filter((f) => f && f.url && FILES[f.kind]) : [];
  const files = stored.length ? stored : (order.song_file_url ? [{ kind: 'mp3', url: order.song_file_url }] : []);

  if (!files.length) {
    return res.status(200).send(shell('Your Heart Note', message('Your Heart Note is being composed', 'It will appear right here as soon as it is ready. We will email you the moment it is finished.')));
  }

  const brief = order.brief || {};
  const recipient = brief.recipient_name || 'someone special';
  const sender = brief.sender_name || '';
  const occRaw = brief.occasion === 'Other' ? (brief.occasion_other || '') : (brief.occasion || '');
  const occasionLabel = occRaw ? `For their ${occRaw.toLowerCase()}` : '';
  const songTitle = order.song_title || 'Your song';

  return res.status(200).send(shell(
    `A Heart Note for ${recipient}`,
    keepsake({ recipient, sender, occasionLabel, songTitle, files })
  ));
}
