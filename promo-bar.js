// Countdown for the promotional banner.
//
// Runs to midnight at the end of Sunday in the visitor's own timezone, then
// rolls over to the following week. A week-long window is closer to how a real
// sale behaves than the nightly reset it replaced, which visitors noticed.
(function () {
  var els = document.querySelectorAll('[data-promo-countdown]');
  if (!els.length) return;

  var pad = function (n) { return n < 10 ? '0' + n : String(n); };

  // The end of Sunday is midnight at the start of Monday, so the deadline is
  // the next Monday 00:00. On a Monday that means the Monday seven days out,
  // not the one that has already passed.
  function nextDeadline(now) {
    var day = now.getDay();                 // 0 Sun ... 6 Sat
    var ahead = (8 - day) % 7 || 7;
    var d = new Date(now);
    d.setDate(d.getDate() + ahead);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function tick() {
    var now = new Date();
    var ms = nextDeadline(now) - now;
    if (ms < 0) ms = 0;

    var days = Math.floor(ms / 864e5);
    var hrs = Math.floor((ms % 864e5) / 3600000);
    var mins = Math.floor((ms % 3600000) / 60000);
    var secs = Math.floor((ms % 60000) / 1000);

    // Days only appear once there is at least one, so the last day reads as a
    // plain clock rather than "0d".
    var text = (days ? days + 'd ' : '') + pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }

  tick();
  setInterval(tick, 1000);
})();
