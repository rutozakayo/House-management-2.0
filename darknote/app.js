/* ============================================================
   ReXnote — ambient FX, gate transition, main-site interactions
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gate = document.getElementById('gate');
  var site = document.getElementById('site');
  var boot = document.getElementById('boot');
  var enterBtn = document.getElementById('enterBtn');
  var backBtn = document.getElementById('backBtn');
  var backBtn2 = document.getElementById('backBtn2');
  var state = { entering: false, siteReady: false };

  /* ── ambient canvas: particles + laser dust + digital rain ──── */
  function initFX() {
    var canvas = document.getElementById('fx');
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var particles = [];
    var columns = [];
    var glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789';
    var frame = 0;
    var running = true;

    function sizeCanvas() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
      buildRain();
    }

    function buildParticles() {
      var mobile = w < 760;
      var target = Math.round((w * h) / (mobile ? 26000 : 14000));
      target = Math.max(26, Math.min(mobile ? 52 : 118, target));
      particles = [];
      for (var i = 0; i < target; i++) {
        var roll = Math.random();
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.5 + Math.random() * 1.5,
          vx: (Math.random() - 0.5) * 0.16,
          vy: -0.05 - Math.random() * 0.22,
          a: 0.25 + Math.random() * 0.55,
          hue: roll > 0.9 ? 'red' : roll > 0.62 ? 'purple' : 'blue',
          tw: Math.random() * Math.PI * 2
        });
      }
    }

    function buildRain() {
      var gap = w < 760 ? 30 : 20;
      var count = Math.ceil(w / gap);
      columns = [];
      for (var i = 0; i < count; i++) {
        columns.push({
          x: i * gap + gap * 0.35,
          y: Math.random() * h,
          speed: 0.5 + Math.random() * 1.7,
          alpha: 0.05 + Math.random() * 0.13,
          len: 6 + Math.floor(Math.random() * 12),
          size: 11 + Math.random() * 3
        });
      }
    }

    function palette(hue, a) {
      if (hue === 'red') return 'rgba(255,23,68,' + a + ')';
      if (hue === 'purple') return 'rgba(139,92,246,' + a + ')';
      return 'rgba(0,200,255,' + a + ')';
    }

    function drawRain() {
      ctx.font = '12px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        ctx.font = col.size + 'px "Share Tech Mono", monospace';
        for (var k = 0; k < col.len; k++) {
          var yy = col.y - k * (col.size + 2);
          if (yy < -20 || yy > h + 20) continue;
          var fade = (1 - k / col.len) * col.alpha;
          ctx.fillStyle = 'rgba(120, 220, 255,' + fade.toFixed(3) + ')';
          ctx.fillText(glyphs.charAt((Math.random() * glyphs.length) | 0), col.x, yy);
        }
      }
    }

    function stepRain() {
      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        col.y += col.speed;
        if (col.y - col.len * 14 > h) {
          col.y = -Math.random() * 260;
          col.speed = 0.5 + Math.random() * 1.7;
          col.alpha = 0.05 + Math.random() * 0.13;
        }
      }
    }

    function drawParticles(t) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.02;
        if (p.y < -12) { p.y = h + 12; p.x = Math.random() * w; }
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;

        var twinkle = 0.72 + Math.sin(p.tw) * 0.28;
        var a = p.a * twinkle;

        ctx.beginPath();
        ctx.fillStyle = palette(p.hue, a * 0.10);
        ctx.arc(p.x, p.y, p.r * 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = palette(p.hue, a);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineWidth = 0.6;
      for (var a1 = 0; a1 < particles.length; a1++) {
        for (var b1 = a1 + 1; b1 < particles.length; b1++) {
          var dx = particles[a1].x - particles[b1].x;
          var dy = particles[a1].y - particles[b1].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 13000) {
            var alpha = (1 - d2 / 13000) * 0.10;
            ctx.strokeStyle = 'rgba(0,200,255,' + alpha.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(particles[a1].x, particles[a1].y);
            ctx.lineTo(particles[b1].x, particles[b1].y);
            ctx.stroke();
          }
        }
      }
    }

    var last = 0;
    function loop(ts) {
      if (!running) return;
      var rafId = requestAnimationFrame(loop);
      if (ts - last < 21) return;
      last = ts;
      frame++;

      ctx.clearRect(0, 0, w, h);

      if (frame % 2 === 0) stepRain();
      drawRain();
      drawParticles(ts);

      canvas._raf = rafId;
    }

    sizeCanvas();
    requestAnimationFrame(loop);

    var rzTimer;
    window.addEventListener('resize', function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(sizeCanvas, 180);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
        if (canvas._raf) cancelAnimationFrame(canvas._raf);
      } else if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(loop);
      }
    });
  }

  /* ── pointer glow + parallax ─────────────────────────────────── */
  function initPointer() {
    if (reduceMotion) return;
    var root = document.documentElement;
    var holo = document.querySelector('.holo');
    var queued = false;
    var px = window.innerWidth / 2, py = window.innerHeight / 2;

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      px = e.clientX; py = e.clientY;
      document.body.classList.add('has-pointer');
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        root.style.setProperty('--mx', px + 'px');
        root.style.setProperty('--my', py + 'px');
        if (holo && !document.body.classList.contains('site-active')) {
          var nx = (px / window.innerWidth - 0.5) * 2;
          var ny = (py / window.innerHeight - 0.5) * 2;
          holo.style.transform = 'translate(-50%,-50%) translate3d(' + (nx * 12).toFixed(2) + 'px,' + (ny * 9).toFixed(2) + 'px,0)';
        }
      });
    }, { passive: true });
  }

  /* ── clocks (Asia/Singapore) ─────────────────────────────────── */
  function initClocks() {
    var clock = document.getElementById('clock');
    var panelClock = document.getElementById('panelClock');
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } catch (err) {
      fmt = null;
    }
    function tick() {
      var now = new Date();
      var t = fmt ? fmt.format(now) : now.toTimeString().slice(0, 8);
      if (clock) clock.textContent = t;
      if (panelClock) panelClock.textContent = t + ' SGT';
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ── gate → site transition ──────────────────────────────────── */
  function showSite(immediate) {
    if (state.entering) return;
    state.entering = true;

    if (immediate || reduceMotion) {
      gate.style.display = 'none';
      gate.hidden = true;
      site.hidden = false;
      document.body.classList.add('site-active');
      finishEnter();
      return;
    }

    boot.classList.add('is-on');
    document.body.classList.add('booting');

    window.setTimeout(function () {
      gate.style.display = 'none';
      gate.hidden = true;
      site.hidden = false;
      window.scrollTo(0, 0);
      document.body.classList.add('site-active');
    }, 600);

    window.setTimeout(finishEnter, 900);
  }

  function finishEnter() {
    boot.classList.remove('is-on');
    document.body.classList.remove('booting');
    state.entering = false;
    if (history.replaceState) history.replaceState(null, '', '#system');
    initSite();
    var h = document.querySelector('.hero__title');
    if (h) {
      h.setAttribute('tabindex', '-1');
      try { h.focus({ preventScroll: true }); } catch (err) { h.focus(); }
    }
  }

  function showGate() {
    if (state.entering) return;
    state.entering = true;

    if (reduceMotion) {
      site.hidden = true;
      gate.hidden = false;
      gate.style.display = '';
      document.body.classList.remove('site-active');
      state.entering = false;
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      return;
    }

    site.classList.add('leaving');
    window.setTimeout(function () {
      site.hidden = true;
      site.classList.remove('leaving');
      gate.hidden = false;
      gate.style.display = '';
      gate.classList.add('is-in');
      document.body.classList.remove('site-active');
      window.scrollTo(0, 0);
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      window.setTimeout(function () {
        gate.classList.remove('is-in');
        state.entering = false;
      }, 700);
    }, 380);
  }

  /* ── main-site interactions ──────────────────────────────────── */
  function initSite() {
    if (state.siteReady) return;
    state.siteReady = true;

    // scroll reveal
    var items = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      items.forEach(function (el) { io.observe(el); });
    } else {
      items.forEach(function (el) { el.classList.add('in'); });
    }

    // fail-safe: anything already inside the first viewport shows immediately
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height && r.top < window.innerHeight * 0.96) el.classList.add('in');
    });

    // hero is in view the moment we arrive: reveal it immediately, staggered
    document.querySelectorAll('.hero .reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i * 90) + 'ms';
      el.classList.add('in');
    });

    initMeters();
    initTerminal();
  }

  function initMeters() {
    var meters = document.querySelectorAll('.meter');
    if (!meters.length) return;

    function paint(m, value) {
      var bar = m.querySelector('.meter__track i');
      var label = m.querySelector('.meter__row b');
      if (bar) bar.style.width = value + '%';
      if (label) label.textContent = value + '%';
    }

    window.setTimeout(function () {
      meters.forEach(function (m) { paint(m, Number(m.dataset.value) || 60); });
    }, 320);

    if (reduceMotion) return;
    setInterval(function () {
      meters.forEach(function (m) {
        var base = Number(m.dataset.value) || 60;
        var next = Math.round(Math.min(99, Math.max(42, base + (Math.random() - 0.5) * 12)));
        paint(m, next);
      });
    }, 2600);
  }

  function initTerminal() {
    var pre = document.getElementById('term');
    if (!pre) return;
    var code = pre.querySelector('code');
    var script = [
      [{ t: '$ ', c: 'dim' }, { t: 'rexnote link --session', c: 'cmd' }],
      [{ t: '  › pairing code ', c: 'dim' }, { t: '7F2K-91QD', c: 'ok' }, { t: ' issued · ttl 60s', c: 'dim' }],
      [{ t: '$ ', c: 'dim' }, { t: 'rexnote status', c: 'cmd' }],
      [{ t: '  socket ', c: 'dim' }, { t: 'OPEN', c: 'ok' }, { t: ' · presence 20s · vault 412 items · guards 4/4', c: 'dim' }],
      [{ t: '$ ', c: 'dim' }, { t: 'rexnote guard enable antidelete --mode 3', c: 'cmd' }],
      [{ t: '  retention active · ', c: 'ok' }, { t: 'routed to private number', c: 'dim' }],
      [{ t: '$ ', c: 'dim' }, { t: 'rexnote deploy', c: 'cmd' }],
      [{ t: '  42 commands registered · ', c: 'ok' }, { t: 'system nominal', c: 'ok' }]
    ];

    var li = 0, si = 0, ci = 0, timer = null;
    var lineEl = null, spanEl = null;

    function reset() {
      code.textContent = '';
      li = si = ci = 0;
      lineEl = null;
      spanEl = null;
    }

    function type() {
      if (li >= script.length) {
        timer = window.setTimeout(function () { reset(); type(); }, 5200);
        return;
      }
      var seg = script[li][si];

      if (!lineEl) {
        lineEl = document.createElement('span');
        if (li > 0) lineEl.appendChild(document.createTextNode('\n'));
        code.appendChild(lineEl);
      }
      if (!spanEl) {
        spanEl = document.createElement('span');
        if (seg.c) spanEl.className = seg.c;
        lineEl.appendChild(spanEl);
      }

      if (ci < seg.t.length) {
        spanEl.textContent += seg.t.charAt(ci);
        ci++;
        timer = window.setTimeout(type, seg.c === 'dim' ? 8 : 24);
        return;
      }

      si++; ci = 0; spanEl = null;
      if (si < script[li].length) {
        timer = window.setTimeout(type, 40);
      } else {
        li++; si = 0; lineEl = null;
        timer = window.setTimeout(type, 200);
      }
    }

    // restart when the section scrolls into view the first time
    var started = false;
    function start() {
      if (started) return;
      started = true;
      reset();
      type();
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) start(); });
      }, { threshold: 0.25 });
      io.observe(pre);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(timer);
      } else if (started && li < script.length) {
        clearTimeout(timer);
        type();
      }
    });
  }

  /* ── wire up ─────────────────────────────────────────────────── */
  function init() {
    initFX();
    initPointer();
    initClocks();

    if (enterBtn) enterBtn.addEventListener('click', function () { showSite(false); });
    if (backBtn) backBtn.addEventListener('click', showGate);
    if (backBtn2) backBtn2.addEventListener('click', showGate);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!document.body.classList.contains('site-active')) {
        e.preventDefault();
        showSite(false);
      }
    });

    // deep link straight into the system
    if (location.hash === '#system') {
      showSite(true);
    }

    // nav elevation on scroll
    var nav = document.getElementById('nav');
    if (nav) {
      window.addEventListener('scroll', function () {
        nav.style.boxShadow = window.scrollY > 12 ? '0 18px 50px -30px rgba(0,200,255,.6)' : 'none';
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
