/* ============================================================================
   app.js — page wiring around the film (no global)
   Play/pause, sound (BVAudio), scrubber with chapter ticks + hover labels,
   time readout, 16:9 / 9:16 toggle, replay, fullscreen, "Open a case" CTA
   (BVPlay), muted autoplay behind a "Play with sound" overlay, keyboard
   shortcuts, auto-hiding controls, end-of-film -> epilogue.
   Every optional module (BVAudio, BVPlay) is feature-checked: a missing file
   never breaks the page. Does nothing at all in render mode (?render=1).
   ========================================================================== */
(function () {
  'use strict';

  const BV = window.BV;
  if (!BV) { console.warn('[app] film engine (film.js) not loaded'); return; }
  if (BV.render) return;

  const cfg = window.BV_CONFIG || {};
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  const player = $('bvp-player'), screen = $('bvp-screen'), controls = $('bvp-controls');
  const big = $('bvp-bigplay'), bigLabel = $('bvp-bigplay-label'), endcard = $('bvp-endcard');
  const btnPlay = $('bvp-play'), btnReplay = $('bvp-replay'), btnSound = $('bvp-sound');
  const btnFull = $('bvp-full'), btnCta = $('bvp-cta'), btnEndReplay = $('bvp-end-replay'), btnEndCta = $('bvp-end-cta');
  const timeEl = $('bvp-time'), scrub = $('bvp-scrub'), fill = $('bvp-scrub-fill'), thumb = $('bvp-scrub-thumb');
  const ticks = $('bvp-scrub-ticks'), tip = $('bvp-scrub-tip');
  const segBtns = Array.from(document.querySelectorAll('[data-format]'));
  if (!player || !screen) return;

  const audio = () => (window.BVAudio && typeof window.BVAudio.enable === 'function' ? window.BVAudio : null);
  const epi = () => (window.BVPlay && typeof window.BVPlay.open === 'function' ? window.BVPlay : null);
  const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fmtTime = t => { t = Math.max(0, Math.floor(t + 1e-6)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  let engaged = false;        // the viewer has interacted (unlocks auto-epilogue at the end)
  let ended = false;
  let startToken = 0;         // cancels a pending "play with sound" start if the viewer acts first
  let lastPointer = 'mouse';

  /* ── Static copy from config ─────────────────────────────────────────────── */
  const brand = cfg.brand || {};
  document.querySelectorAll('[data-brand-link]').forEach(a => { if (brand.url) a.href = brand.url; });
  document.querySelectorAll('[data-brand-domain]').forEach(a => { if (brand.domain) a.textContent = brand.domain; });
  const fine = $('bvp-fine');
  if (fine && cfg.finePrint) fine.textContent = cfg.finePrint.long || cfg.finePrint.short || '';
  if (bigLabel) bigLabel.textContent = audio() ? 'Play with sound' : 'Play';
  if (scrub) scrub.setAttribute('aria-valuemax', String(BV.duration));

  /* ── State -> UI ─────────────────────────────────────────────────────────── */
  function setPlayingUI() {
    player.classList.toggle('is-playing', BV.playing);
    if (btnPlay) btnPlay.setAttribute('aria-label', BV.playing ? 'Pause' : 'Play');
  }

  let lastSec = -1;
  function setTimeUI(t) {
    const p = BV.duration ? clamp(t / BV.duration, 0, 1) : 0;
    if (fill) fill.style.transform = 'scaleX(' + p.toFixed(5) + ')';
    if (thumb) thumb.style.left = (p * 100).toFixed(3) + '%';
    const sec = Math.floor(t + 1e-6);
    if (sec !== lastSec) {
      lastSec = sec;
      if (timeEl) timeEl.textContent = fmtTime(t) + ' / ' + fmtTime(BV.duration);
      if (scrub) { scrub.setAttribute('aria-valuenow', String(sec)); scrub.setAttribute('aria-valuetext', fmtTime(t)); }
    }
  }

  function setFormatUI(f) {
    const portrait = f === 'portrait';
    player.classList.toggle('is-portrait', portrait);
    segBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.format === f)));
  }

  /* ── Sound ───────────────────────────────────────────────────────────────── */
  let soundOn = false, soundBusy = false;
  function renderSound() {
    player.classList.toggle('is-sound', soundOn);
    player.classList.toggle('is-sound-busy', soundBusy);
    if (btnSound) btnSound.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
  }
  // Must be called from a user gesture the first time (creates the AudioContext).
  function setSound(on) {
    const A = audio();
    if (!A) return Promise.resolve(false);
    if (!on) {
      try { if (typeof A.setMuted === 'function') A.setMuted(true); } catch (e) { console.warn('[app] setMuted failed', e); }
      soundOn = false; renderSound();
      return Promise.resolve(false);
    }
    soundBusy = true; renderSound();
    // Never spin forever: release the busy state after 20 s (a late enable still turns sound on).
    const guard = setTimeout(() => { if (soundBusy) { soundBusy = false; renderSound(); console.warn('[app] sound is taking long to start'); } }, 20000);
    let p;
    try { p = Promise.resolve(A.enable()); } catch (e) { p = Promise.reject(e); }
    return p.then(() => {
      if (typeof A.setMuted === 'function') A.setMuted(false);
      soundOn = true;
      return true;
    }).catch(e => {
      console.warn('[app] sound unavailable:', e);
      soundOn = false;
      return false;
    }).then(r => { clearTimeout(guard); soundBusy = false; renderSound(); return r; });
  }
  function toggleSound() { if (!soundBusy) setSound(!soundOn); }

  /* ── Transport ───────────────────────────────────────────────────────────── */
  function hideBig() { if (big) big.hidden = true; }
  function hideEnd() { if (endcard) endcard.hidden = true; ended = false; }

  function engage() { engaged = true; hideBig(); }
  // Any direct transport action supersedes a pending "play with sound" start.
  function cancelPendingStart() { startToken++; if (big) big.classList.remove('is-busy'); }

  function togglePlay() {
    engage(); cancelPendingStart();
    if (BV.playing) BV.pause();
    else { if (BV.t >= BV.duration - 0.05) BV.seek(0); hideEnd(); BV.play(); }
  }

  function replay() {
    engage(); cancelPendingStart(); hideEnd();
    BV.seek(0);
    BV.play();
  }

  // The first-load overlay: restart from the top, with sound when available.
  function playWithSound() {
    engage();
    const token = ++startToken;
    if (big) big.classList.add('is-busy');
    const start = () => {
      if (token !== startToken) return;                     // viewer already took over
      if (big) big.classList.remove('is-busy');
      hideEnd(); BV.seek(0); BV.play();
    };
    if (audio() && !soundOn) {
      BV.pause();
      // Wait (briefly) for the soundtrack so the first beat lands on frame 0.
      Promise.race([setSound(true), new Promise(r => setTimeout(r, 4000))]).then(start);
    } else start();
  }

  function seekBy(dt) {
    engage(); cancelPendingStart();
    BV.seek(clamp(BV.t + dt, 0, BV.duration));
    if (BV.t < BV.duration) hideEnd();
  }

  /* ── Epilogue / CTA ──────────────────────────────────────────────────────── */
  function openEpilogue(source) {
    const P = epi();
    if (P) {
      BV.pause();
      try { P.open({ source }); } catch (e) { console.error('[app] epilogue failed to open', e); }
      return true;
    }
    return false;
  }
  function cta() {
    engage();
    if (!openEpilogue('cta') && brand.url) window.open(brand.url, '_blank', 'noopener');
  }
  const epiOpen = () => {
    const P = window.BVPlay;
    if (!P) return false;
    if (typeof P.isOpen === 'function') { try { return !!P.isOpen(); } catch (e) { return false; } }
    return P.isOpen === true || P.opened === true;
  };

  /* ── Fullscreen ──────────────────────────────────────────────────────────── */
  const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFull() {
    if (!fsEnabled) return;
    try {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const r = (player.requestFullscreen || player.webkitRequestFullscreen).call(player);
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* not allowed here */ }
  }
  function onFsChange() { player.classList.toggle('is-full', fsElement() === player); wake(); }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  if (!fsEnabled && btnFull) btnFull.hidden = true;

  /* ── Auto-hide controls while playing ────────────────────────────────────── */
  let idleTimer = 0, dragging = false;
  function wake() {
    player.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (BV.playing || ended) {
      idleTimer = setTimeout(() => {
        if ((BV.playing || ended) && !dragging && !(controls && controls.matches(':hover'))) player.classList.add('is-idle');
      }, 2600);
    }
  }
  player.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') wake(); });
  let idleAtDown = false;
  player.addEventListener('pointerdown', e => {
    lastPointer = e.pointerType || 'mouse';
    idleAtDown = player.classList.contains('is-idle');
  }, true);
  player.addEventListener('pointerup', wake);
  player.addEventListener('pointerleave', () => { if (BV.playing) { clearTimeout(idleTimer); idleTimer = setTimeout(() => player.classList.add('is-idle'), 900); } });

  /* ── Scrubber ────────────────────────────────────────────────────────────── */
  function chapterAt(t) {
    let label = '';
    (BV.chapters || []).forEach(c => { if (c.t <= t + 0.01) label = c.label; });
    return label;
  }
  function buildTicks() {
    if (!ticks) return;
    ticks.textContent = '';
    (BV.chapters || []).forEach(c => {
      if (c.t < 0.25 || c.t >= BV.duration) return;      // no tick at the very start
      const i = document.createElement('i');
      i.style.left = (c.t / BV.duration * 100).toFixed(3) + '%';
      i.title = c.label;
      ticks.appendChild(i);
    });
  }
  function tFromX(clientX) {
    const r = scrub.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * BV.duration;
  }
  function showTip(t) {
    if (!tip) return;
    const r = scrub.getBoundingClientRect();
    const x = clamp(t / BV.duration * r.width, 36, Math.max(36, r.width - 36));
    tip.style.left = x.toFixed(1) + 'px';
    tip.firstElementChild.textContent = fmtTime(t);
    tip.lastElementChild.textContent = chapterAt(t);
  }
  if (scrub) {
    let resume = false;
    scrub.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      engage(); cancelPendingStart();
      dragging = true; resume = BV.playing;
      scrub.classList.add('is-drag');
      try { scrub.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      BV.pause();
      const t = tFromX(e.clientX);
      BV.seek(t); showTip(t);
      if (t < BV.duration) hideEnd();
      e.preventDefault();
    });
    scrub.addEventListener('pointermove', e => {
      const t = tFromX(e.clientX);
      showTip(t);
      if (dragging) { BV.seek(t); if (t < BV.duration) hideEnd(); }
      else scrub.classList.add('is-hover');
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      scrub.classList.remove('is-drag');
      if (resume && BV.t < BV.duration) BV.play();
      wake();
    };
    scrub.addEventListener('pointerup', endDrag);
    scrub.addEventListener('pointercancel', endDrag);
    scrub.addEventListener('pointerleave', () => { if (!dragging) scrub.classList.remove('is-hover'); });
    scrub.addEventListener('click', e => e.stopPropagation());
  }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  const onClick = (elm, fn) => { if (elm) elm.addEventListener('click', e => { e.stopPropagation(); fn(e); }); };
  onClick(btnPlay, togglePlay);
  onClick(btnReplay, replay);
  onClick(btnEndReplay, replay);
  onClick(btnSound, () => { engage(); toggleSound(); });
  onClick(btnFull, () => { engage(); toggleFull(); });
  onClick(btnCta, cta);
  onClick(btnEndCta, cta);
  onClick(big, playWithSound);
  if (!audio() && btnSound) { btnSound.disabled = true; btnSound.title = 'Sound unavailable'; }

  segBtns.forEach(b => onClick(b, () => {
    engage();
    const f = b.dataset.format === 'portrait' ? 'portrait' : 'landscape';
    if (f === BV.format) return;
    cancelPendingStart();
    setFormatUI(f);
    BV.setFormat(f);
    try {
      const u = new URL(location.href);
      if (f !== (BV.defaultFormat || 'landscape')) u.searchParams.set('format', f); else u.searchParams.delete('format');
      history.replaceState(null, '', u.toString());
    } catch (e) { /* file:// or sandboxed — ignore */ }
  }));

  // Click the picture to play/pause, double-click for fullscreen.
  screen.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('button, a, .bvp-controls')) return;
    // A tap on a touch screen while the controls are hidden only brings them back.
    if (lastPointer === 'touch' && idleAtDown) { wake(); return; }
    togglePlay();
  });
  screen.addEventListener('dblclick', e => {
    if (e.target.closest && e.target.closest('button, a, .bvp-controls')) return;
    toggleFull();
  });
  if (controls) controls.addEventListener('click', e => e.stopPropagation());

  /* ── Keyboard ────────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target || {};
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return;
    if (epiOpen()) return;                                  // the epilogue owns the keyboard
    const k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'k' || k === 'K') {
      if (tag === 'button' || tag === 'a') return;          // native activation handles it
      e.preventDefault(); togglePlay();
    } else if (k === 'm' || k === 'M') {
      e.preventDefault(); engage(); toggleSound();
    } else if (k === 'ArrowLeft') {
      e.preventDefault(); seekBy(-2);
    } else if (k === 'ArrowRight') {
      e.preventDefault(); seekBy(2);
    } else if (k === 'f' || k === 'F') {
      e.preventDefault(); engage(); toggleFull();
    } else if (k === 'Home') {
      if (t === scrub) { e.preventDefault(); seekBy(-BV.duration); }
    } else if (k === 'End') {
      if (t === scrub) { e.preventDefault(); seekBy(BV.duration); }
    } else return;
    wake();
  });

  /* ── Engine events ───────────────────────────────────────────────────────── */
  BV.on('time', setTimeUI);
  BV.on('play', () => { ended = false; if (endcard) endcard.hidden = true; setPlayingUI(); wake(); });
  BV.on('pause', () => { setPlayingUI(); if (!ended) { clearTimeout(idleTimer); player.classList.remove('is-idle'); } });
  BV.on('format', f => { setFormatUI(f); buildTicks(); });
  BV.on('end', () => {
    ended = true;
    hideBig();
    if (endcard) endcard.hidden = false;
    wake();
    if (engaged) openEpilogue('end');                       // only after the viewer has engaged
  });

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  setFormatUI(BV.format);
  setPlayingUI();
  renderSound();
  setTimeUI(BV.t);

  BV.ready.then(() => {
    player.classList.remove('is-loading');
    player.removeAttribute('aria-busy');
    setFormatUI(BV.format);
    buildTicks();
    setTimeUI(BV.t);
    if (BV.params && BV.params.has('play') && epi()) {      // ?play opens the epilogue directly
      engage();
      openEpilogue('url');
      return;
    }
    if (big) big.hidden = false;
    if (!reducedMotion) BV.play();                          // muted autoplay behind the overlay
  });
})();
