// Meta Pixel loader (shared across pages).
// Replace the ID below with your Pixel / Dataset ID. It is PUBLIC (visible in
// the browser), so it's fine to hardcode here. The Conversions API token is the
// secret half and lives only in Vercel env vars, never here.
var HN_PIXEL_ID = '1049149630784983';

!function (f, b, e, v, n, t, s) {
  if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

if (HN_PIXEL_ID && HN_PIXEL_ID.indexOf('__') !== 0) {
  fbq('init', HN_PIXEL_ID);
  fbq('track', 'PageView');
}

// Current Meta browser identifiers, to hand to the server for the Conversions
// API so browser and server events can be matched and deduplicated.
window.HN_META = {
  cookie: function (name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : '';
  },
  data: function () {
    var fbp = this.cookie('_fbp');
    var fbc = this.cookie('_fbc');
    if (!fbc) {
      var fbclid = new URLSearchParams(location.search).get('fbclid');
      if (fbclid) fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    }
    return { fbp: fbp, fbc: fbc };
  }
};

// ───────────────────────────────────────────────────────────────────────────
// First-party analytics tracker. Runs on every page the pixel is on, and feeds
// the /dashboard. Mirrors the Meta funnel (pageview / cta_click / add_to_cart /
// purchase) into our own Supabase table via /api/track, so we can query and
// chart it ourselves instead of only seeing it inside Meta's Events Manager.
(function () {
  var params = new URLSearchParams(location.search);

  // A stable, anonymous first-party id kept in this browser. No PII — just a
  // random string so we can count distinct visitors and stitch a visit together.
  function sid() {
    try {
      var k = 'hn_sid', v = localStorage.getItem(k);
      if (!v) { v = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return null; } // private mode: still track, just without a stable id
  }

  // Which landing-page angle this is, from the URL — works for the live clean
  // paths (/lp/wedding) and the local file names (/lp-wedding.html) alike.
  function angle() {
    if (window.LP && window.LP.slug) return window.LP.slug;
    var p = location.pathname.replace(/\.html$/, '');
    var m = p.match(/\/lp[\/-]([a-z-]+)$/i);
    if (m) return m[1];
    if (p === '/lp' || p === '/funnel') return 'general';
    if (p === '/' || p === '/index' || p === '') return 'home';
    return p.replace(/^\//, '') || 'home';
  }

  // Where the visit came from: campaign tag first, then a Facebook click, then
  // an external referrer, else direct.
  function source() {
    var us = params.get('utm_source');
    if (us) return us;
    if (params.get('fbclid')) return 'facebook';
    try {
      if (document.referrer) {
        var h = new URL(document.referrer).hostname;
        if (h && h !== location.hostname) return h;
      }
    } catch (e) { /* ignore */ }
    return 'direct';
  }

  var BASE = {
    page: location.pathname,
    angle: angle(),
    source: source(),
    sid: sid(),
    referrer: document.referrer || null,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
  };

  function send(type, extra) {
    var payload = {}, k;
    for (k in BASE) payload[k] = BASE[k];
    if (extra) for (k in extra) payload[k] = extra[k];
    payload.type = type;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }));
        return;
      }
    } catch (e) { /* fall through to fetch */ }
    try { fetch('/api/track', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) { /* best-effort */ }
  }

  // Public hook so pages can log intent/purchase with a value (order + success).
  window.hnTrack = send;

  // Auto: one pageview per load. Defer to DOMContentLoaded so window.LP (set at
  // the bottom of the landing pages) is available for a precise angle.
  function pageview() { BASE.angle = angle(); send('pageview'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageview);
  else pageview();

  // Auto: every primary CTA click across the site. These are the buttons that
  // send someone toward the order page — the "buttons being clicked" view.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-cta], [data-track]');
    if (!a) return;
    var label = (a.getAttribute('data-track') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    send('cta_click', { label: label, meta: { href: a.getAttribute('href') || null } });
  }, true);
})();
