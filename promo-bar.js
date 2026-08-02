// Countdown for the promotional banner.
//
// Counts down to midnight in the visitor's OWN timezone, then rolls over and
// starts again. That keeps the promotion evergreen: it never expires, never
// shows a negative number, and never needs anyone to update a date.
(function () {
  var els = document.querySelectorAll('[data-promo-countdown]');
  if (!els.length) return;

  var pad = function (n) { return n < 10 ? '0' + n : String(n); };

  function tick() {
    var now = new Date();
    // setHours(24,...) is midnight tonight, and handles month and year ends.
    var midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);

    var ms = midnight - now;
    if (ms < 0) ms = 0;

    var text = pad(Math.floor(ms / 3600000)) + ':' +
               pad(Math.floor((ms % 3600000) / 60000)) + ':' +
               pad(Math.floor((ms % 60000) / 1000));

    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }

  tick();
  setInterval(tick, 1000);
})();
