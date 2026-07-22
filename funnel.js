/* Heart Note ad-funnel pages — shared behaviour.
 *
 * Each page sets window.LP before loading this file:
 *   window.LP = {
 *     slug:      'wedding',                 // attribution + ViewContent label ('general' on /lp)
 *     occasion:  'Wedding',                 // prefilled on every CTA; must match an
 *                                           // <option> in order.html's occasion select
 *     heroAudio: 'first-dance',             // key into SAMPLES below (hero play button)
 *     samples:   ['first-dance', 'groom-aisle', ...],  // which songs render, in order
 *   };
 *
 * Everything is optional-safe: a page missing #sampleGrid, #heroPlay, #deliveryDate
 * or #stickyBar simply skips that behaviour.
 */
(function () {
  'use strict';

  var LP = window.LP || {};
  var params = new URLSearchParams(location.search);

  // ---------- The sample song catalogue ----------
  // To add a song: drop the MP3 in /audio and add an entry here, then list its
  // key in a page's LP.samples.
  var SAMPLES = {
    'first-dance':     { occasion: 'First Dance',            style: 'Country-pop',      title: 'Forever Starts Tonight',   context: 'For Sophie & Ben’s first dance as newlyweds', src: '/audio/sample-first-dance.mp3' },
    'father-daughter': { occasion: 'Father-Daughter Dance',  style: 'Heartfelt ballad', title: 'One More Dance',           context: 'For Emma and her dad on her wedding day',          src: '/audio/sample-father-daughter.mp3' },
    'groom-aisle':     { occasion: 'Walking the Aisle',      style: 'Acoustic',         title: 'Here Comes Grace',         context: 'Tyler’s song for his bride, Grace',           src: '/audio/sample-groom-aisle.mp3' },
    'reception':       { occasion: 'Reception Entrance',     style: 'Upbeat pop',       title: 'Tonight We Start',         context: 'Mia & Ethan’s big reception entrance',        src: '/audio/sample-reception.mp3' },
    'grandma':         { occasion: 'A Grandmother’s Birthday', style: 'Easy listening', title: 'For Grandma, with love', context: 'From her grandchildren, on her 80th',        src: '/audio/sample-grandma.mp3' },
    'mothers-day':     { occasion: 'For Mom',                style: 'Easy listening',   title: 'Love You, Mom',            context: 'For Karen, from her kids Luke & Emma',             src: '/audio/sample-mothers-day.mp3' },
    'fathers-day':     { occasion: 'For Dad',                style: 'Warm country',     title: 'The Old Man Called David', context: 'A tribute to Dad',                                 src: '/audio/sample-fathers-day.mp3' },
  };

  var PLAY_D = 'M8 5v14l11-7z';
  var PAUSE_D = 'M6 5h4v14H6zM14 5h4v14h-4z';
  var current = null; // only one song plays at a time, across every player

  // ---------- Reveal on scroll ----------
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.14 });
  var observe = function (el) { io.observe(el); };
  document.querySelectorAll('.reveal, .draw').forEach(observe);

  // ---------- Carry ad + attribution params through to the order page ----------
  // Keeps fbclid / utm_* / gclid alive across the click so Meta and the order
  // record can both attribute the sale back to the ad that paid for it.
  var KEEP = ['fbclid', 'gclid', 'ttclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
  function wireCtas(root) {
    (root || document).querySelectorAll('a[data-cta]').forEach(function (a) {
      if (a.dataset.ctaWired) return;
      var url = new URL(a.getAttribute('href'), location.href);
      KEEP.forEach(function (k) {
        var v = params.get(k);
        if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
      });
      if (!url.searchParams.has('src')) url.searchParams.set('src', 'lp-' + (LP.slug || 'general'));
      // An occasion-targeted page prefills the order form's occasion too.
      if (LP.occasion && !url.searchParams.has('occasion')) url.searchParams.set('occasion', LP.occasion);
      a.setAttribute('href', url.pathname + url.search);
      a.dataset.ctaWired = '1';
    });
  }
  wireCtas();

  // ---------- Meta: mid-funnel signal for the optimizer ----------
  // PageView already fired in pixel.js. ViewContent tells Meta which angle was
  // actually viewed, so it can optimize toward the angles that convert.
  if (typeof fbq === 'function') {
    fbq('track', 'ViewContent', {
      content_name: 'lp-' + (LP.slug || 'general'),
      content_category: LP.occasion || 'General',
      content_type: 'product',
    });
  }

  // ---------- Honest delivery date ----------
  // The only urgency on these pages: a real date computed from real turnaround.
  (function () {
    var el = document.getElementById('deliveryDate');
    if (!el) return;
    var d = new Date();
    d.setDate(d.getDate() + 1);
    el.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  })();

  // ---------- Sticky CTA bar (appears once the hero scrolls away) ----------
  (function () {
    var bar = document.getElementById('stickyBar');
    var hero = document.querySelector('.hero-bg');
    if (!bar || !hero) return;
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('show', !entries[0].isIntersecting);
    }, { threshold: 0, rootMargin: '-120px 0px 0px 0px' }).observe(hero);
  })();

  // ---------- Sample players ----------
  var fmt = function (s) {
    if (!isFinite(s) || s < 0) return '0:00';
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  };

  (function () {
    var grid = document.getElementById('sampleGrid');
    if (!grid) return;
    var keys = LP.samples || Object.keys(SAMPLES);

    keys.forEach(function (key) {
      var s = SAMPLES[key];
      if (!s) return;

      var card = document.createElement('div');
      card.className = 'samp-card reveal';
      card.innerHTML =
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-gold text-[.7rem] font-700 tracking-[.12em] uppercase">' + s.occasion + ' &middot; ' + s.style + '</p>' +
            '<p class="font-display text-ivory text-xl leading-tight mt-1">' + s.title + '</p>' +
          '</div>' +
          '<div class="eq mt-1.5" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
        '</div>' +
        '<p class="text-ivory/65 text-[.9rem] italic mt-2 leading-snug">' + s.context + '</p>' +
        '<div class="mt-auto pt-5 flex items-center gap-3.5">' +
          '<button type="button" class="samp-play" aria-label="Play ' + s.title + '">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + PLAY_D + '"/></svg>' +
          '</button>' +
          '<div class="samp-progress flex-1"><div class="samp-fill"></div></div>' +
          '<span class="samp-time text-ivory/70 text-sm tabular-nums w-9 text-right">0:00</span>' +
        '</div>';

      var audio = new Audio();
      audio.preload = 'metadata';
      audio.src = s.src;
      var btn = card.querySelector('.samp-play');
      var icon = btn.querySelector('path');
      var fill = card.querySelector('.samp-fill');
      var timeEl = card.querySelector('.samp-time');
      var bar = card.querySelector('.samp-progress');

      audio.addEventListener('loadedmetadata', function () { timeEl.textContent = fmt(audio.duration); });
      audio.addEventListener('timeupdate', function () {
        fill.style.width = (audio.duration ? (audio.currentTime / audio.duration) * 100 : 0) + '%';
        timeEl.textContent = fmt(audio.duration - audio.currentTime);
      });
      audio.addEventListener('ended', function () { fill.style.width = '0%'; timeEl.textContent = fmt(audio.duration); });
      // A missing MP3 shouldn't look broken — the card just goes quiet.
      audio.addEventListener('error', function () { card.classList.add('pending'); timeEl.textContent = ''; });
      audio.addEventListener('play', function () { card.classList.add('playing'); icon.setAttribute('d', PAUSE_D); });
      audio.addEventListener('pause', function () { card.classList.remove('playing'); icon.setAttribute('d', PLAY_D); });

      btn.addEventListener('click', function () {
        if (card.classList.contains('pending')) return;
        if (audio.paused) {
          if (current && current !== audio) current.pause();
          current = audio;
          audio.play().catch(function () {});
        } else {
          audio.pause();
        }
      });
      bar.addEventListener('click', function (e) {
        if (!audio.duration) return;
        var r = bar.getBoundingClientRect();
        audio.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * audio.duration;
      });

      grid.appendChild(card);
      observe(card);
    });
  })();

  // ---------- Hero sample ----------
  (function () {
    var heroPlay = document.getElementById('heroPlay');
    var s = SAMPLES[LP.heroAudio];
    if (!heroPlay || !s) return;
    var audio = new Audio(s.src);
    var iconPath = document.getElementById('heroPlayIcon').querySelector('path');
    var heroCard = document.getElementById('heroCard');
    audio.addEventListener('play', function () { iconPath.setAttribute('d', PAUSE_D); heroCard.classList.add('playing'); });
    audio.addEventListener('pause', function () { iconPath.setAttribute('d', PLAY_D); heroCard.classList.remove('playing'); });
    audio.addEventListener('ended', function () { audio.pause(); });
    heroPlay.addEventListener('click', function () {
      if (audio.paused) {
        if (current && current !== audio) current.pause();
        current = audio;
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
    });
  })();

  // Exposed so a page can render its own cards and still get CTA tagging + reveals.
  window.LPUtil = { wireCtas: wireCtas, observe: observe, samples: SAMPLES };
})();
