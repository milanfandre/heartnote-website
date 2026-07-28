// Single source of truth for the transactional email bodies, so the templates
// can be reused by the webhook (new-order notice) and the deliver API (customer
// delivery), and previewed without duplicating markup.
import { esc } from './mail.js';

const row = (label, val) => (val && String(val).trim())
  ? `<tr><td style="padding:5px 12px;color:#6B5D50;font-weight:600;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:5px 12px;color:#2B2019">${esc(val).replace(/\n/g, '<br>')}</td></tr>` : '';

const block = (label, val) => (val && String(val).trim())
  ? `<h3 style="font-family:Georgia,serif;color:#6E1423;margin:16px 0 4px;font-size:15px">${esc(label)}</h3><div style="white-space:pre-wrap;background:#FBF7EE;border:1px solid #eadfce;border-radius:8px;padding:10px 14px">${esc(val)}</div>` : '';

// The CD cover photo the customer uploaded, shown inline so it can be checked
// at a glance without opening Storage.
const coverPhoto = (url) => url
  ? `<h3 style="font-family:Georgia,serif;color:#6E1423;margin:16px 0 6px;font-size:15px">CD cover photo</h3>
     <a href="${esc(url)}" style="display:inline-block"><img src="${esc(url)}" alt="CD cover photo" style="max-width:260px;border-radius:10px;border:1px solid #eadfce"></a>
     <p style="margin:6px 0 0"><a href="${esc(url)}" style="color:#6E1423;font-size:13px">Open full size</a></p>` : '';

// Sent to whoever fulfills orders, the moment a payment succeeds.
export function orderNotificationHTML(order) {
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
        ${row('Lyric review', order.lyric_addon === 'yes' ? 'YES — send lyrics for approval before recording' : '')}
        ${row('Keepsake CD', order.cd_addon === 'yes' ? 'YES — press and ship a CD' : '')}
      </table>
      ${coverPhoto(order.cd_photo_url)}
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

const TIER_NAMES = { single: 'Single', deluxe: 'Deluxe', experience: 'Experience Package', wedding: 'The Wedding Package' };

// Sent to the customer right after they pay, so they know the order landed and
// what to expect. The song itself arrives later, in the delivery email.
// `receipt` is [{ description, amount (cents), quantity }]; `total` is cents.
// Sent to the customer when the lyrics are ready for their approval.
export function lyricsForApprovalHTML({ displayName, lyrics, reviewUrl, revision = 0 }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2B2019">
    <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">${revision ? 'Your revised lyrics are ready' : 'Your lyrics are ready to read'}</h2>
    <p style="color:#6B5D50;line-height:1.6;margin:0 0 20px">
      ${revision
        ? `We've made the changes you asked for. Have another read of ${esc(displayName)}'s song below.`
        : `Before we record, here are the words to ${esc(displayName)}'s song. Read them over — if anything isn't right, tell us and we'll rewrite it.`}
    </p>
    <div style="white-space:pre-wrap;background:#FBF7EE;border:1px solid #eadfce;border-radius:12px;padding:18px 22px;line-height:1.7;font-size:15px">${esc(lyrics)}</div>
    <p style="margin:24px 0 8px">
      <a href="${esc(reviewUrl)}" style="display:inline-block;background:#6E1423;color:#F7F1E6;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">Approve or request changes</a>
    </p>
    <p style="color:#9a8b7c;font-size:12px;margin-top:20px;word-break:break-all">Or paste this link into your browser:<br>${esc(reviewUrl)}</p>
    <p style="color:#6B5D50;font-size:13px;margin-top:20px">Nothing is recorded until you approve it, so take your time.</p>
  </div>`;
}

// Sent to whoever fulfills orders when the customer responds to their lyrics.
export function lyricsResponseHTML({ order, approved, feedback, orderId }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2B2019">
    <h2 style="font-family:Georgia,serif;color:#6E1423;margin:0 0 12px">${approved ? 'Lyrics approved' : 'Lyric changes requested'}</h2>
    <table style="border-collapse:collapse;width:100%">
      ${row('Order', orderId)}
      ${row('Package', order.tier)}
      ${row('Song is for', order.recipient_name || (order.brief || {}).recipient_name)}
      ${row('Customer', order.customer_email)}
    </table>
    ${approved
      ? '<p style="color:#6B5D50;line-height:1.6;margin:16px 0 0">They are happy with the words. You are clear to record.</p>'
      : block('What they want changed', feedback)}
  </div>`;
}

export function orderConfirmationHTML({ recipient, tier, receipt = [], total, currency = 'usd' }) {
  const tierName = TIER_NAMES[tier];
  const forWhom = recipient ? ` for <strong>${esc(recipient)}</strong>` : '';
  const money = (c) => (c == null ? '' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }));

  let receiptBlock = '';
  if (receipt.length) {
    const rows = receipt.map((r) => `<tr>
        <td style="padding:6px 0;color:#2B2019">${esc(r.description || 'Item')}${r.quantity > 1 ? ` &times; ${r.quantity}` : ''}</td>
        <td style="padding:6px 0;text-align:right;color:#2B2019;white-space:nowrap">${money(r.amount)}</td>
      </tr>`).join('');
    receiptBlock = `<div style="margin:8px 0 22px">
      <p style="font-family:Georgia,serif;color:#6E1423;font-size:15px;margin:0 0 6px">Receipt</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows}
        <tr>
          <td style="padding:9px 0 2px;font-weight:bold;border-top:1px solid #e4d9c6">Total paid</td>
          <td style="padding:9px 0 2px;text-align:right;font-weight:bold;border-top:1px solid #e4d9c6;white-space:nowrap">${money(total)}</td>
        </tr>
      </table>
    </div>`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2B2019;background:#F7F1E6;padding:32px 24px;border-radius:16px">
    <p style="font-family:Georgia,serif;color:#6E1423;font-size:20px;margin:0">Heart Note</p>
    <h1 style="font-family:Georgia,serif;color:#6E1423;font-size:26px;margin:18px 0 8px">Your order is confirmed</h1>
    <p style="color:#6B5D50;line-height:1.6;margin:0 0 16px">Thank you. We've received your order${tierName ? ` (${esc(tierName)})` : ''}, and our team is now writing a one-of-a-kind song${forWhom}.</p>
    ${receiptBlock}
    <p style="color:#6B5D50;line-height:1.6;margin:0 0 16px">You'll receive it by email at this address, usually within about 24 hours. It arrives as a private page where you can play your song, download it, and share it with the people you love.</p>
    <p style="color:#6B5D50;line-height:1.6;margin:0">Have a question in the meantime? Just reply to this email and a real person will help.</p>
  </div>`;
}

// Sent to the customer when their finished song (or songs) is delivered.
// `songTitles` is one entry per delivered song; `extras` lists any additional
// formats included (e.g. ['wav', 'zip']).
export function deliveryEmailHTML({ displayName, songTitles = [], songTitle, songCount, giftUrl, extras = [], chooseVersions = 0 }) {
  // Only real titles reach here — a song with no title given is simply not named,
  // rather than being announced to the customer as "Song 1".
  const titles = songTitles.length ? songTitles : (songTitle ? [songTitle] : []);
  const count = songCount || titles.length || 1;
  // Name the songs only when every one of them actually has a name; a partial
  // list reads as though some songs are missing.
  const named = titles.length === count && titles.length > 0;

  // Deluxe/Experience: they pick a favourite version on the gift page.
  const intro = chooseVersions
    ? `<p style="color:#6B5D50;line-height:1.6;margin:0 0 20px">Your song is ready in <strong>${chooseVersions} versions</strong>. Have a listen to each one in full, then choose the one you'd like to keep. It's yours to download and share forever.</p>`
    : count > 1
    ? `<p style="color:#6B5D50;line-height:1.6;margin:0 0 ${named ? '12px' : '20px'}">Your ${count} custom songs are finished. Open your private keepsake page to play them, download them, and keep them forever.</p>${
        named ? `\n       <ul style="color:#2B2019;line-height:1.7;margin:0 0 20px;padding-left:20px">${titles.map((t) => `<li><strong>${esc(t)}</strong></li>`).join('')}</ul>` : ''}`
    : named
    ? `<p style="color:#6B5D50;line-height:1.6;margin:0 0 20px">Your custom song, <strong>${esc(titles[0])}</strong>, is finished. Open your private keepsake page to play it, download it, and keep it forever.</p>`
    : `<p style="color:#6B5D50;line-height:1.6;margin:0 0 20px">Your custom song is finished. Open your private keepsake page to play it, download it, and keep it forever.</p>`;

  const names = { wav: 'a studio-quality WAV', zip: 'the multitrack files' };
  const listed = extras.map((k) => names[k]).filter(Boolean);
  const extraLine = listed.length
    ? `<p style="color:#6B5D50;line-height:1.6;margin:0 0 24px">Your package also includes ${listed.join(' and ')}, ready to download on the same page.</p>`
    : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2B2019;background:#F7F1E6;padding:32px 24px;border-radius:16px">
    <p style="font-family:Georgia,serif;color:#6E1423;font-size:20px;margin:0">Heart Note</p>
    <h1 style="font-family:Georgia,serif;color:#6E1423;font-size:26px;margin:18px 0 8px">${esc(displayName)}'s Heart Note is ready</h1>
    ${intro}
    ${chooseVersions ? '' : extraLine}
    <a href="${esc(giftUrl)}" style="display:inline-block;background:#6E1423;color:#F7F1E6;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${chooseVersions ? 'Listen and choose your version' : 'Open your Heart Note'}</a>
    <p style="color:#9a8b7c;font-size:12px;margin-top:28px;word-break:break-all">Or paste this link into your browser:<br>${esc(giftUrl)}</p>
  </div>`;
}
