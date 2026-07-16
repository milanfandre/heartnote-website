// Meta Pixel loader (shared across pages).
// Replace the ID below with your Pixel / Dataset ID. It is PUBLIC (visible in
// the browser), so it's fine to hardcode here. The Conversions API token is the
// secret half and lives only in Vercel env vars, never here.
var HN_PIXEL_ID = '__META_PIXEL_ID__';

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
