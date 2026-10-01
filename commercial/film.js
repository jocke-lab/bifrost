/* ============================================================================
   film.js — window.BV
   Bifrost Vault commercial · the timeline engine.
   A fixed logical stage (1920x1080 landscape / 1080x1920 portrait) scaled to
   fit #bv-viewport (letterboxed). Scenes register at load time, are built
   once per format, and are updated as a PURE function of time by seek(t).

   DOM
     #bv-viewport                 container (page sizes it; render mode pins it to 0,0)
       #bv-stage                  W x H logical px, CSS-scaled to fit
         #bv-world                camera wrapper (BV.camera) — every scene root lives here
           .bv-scene[data-scene]  one absolutely positioned full-stage root per scene
         #bv-fx                   film finish above the world: flash, bars, vignette, grain

   CONTRACT API (see ARCH.md)
     BV.W, BV.H, BV.portrait, BV.duration, BV.fps, BV.render, BV.t, BV.root
     BV.scene(def)  BV.ready  BV.seek(t)  BV.play()  BV.pause()  BV.playing
     BV.on(evt, fn)  (events: 'time', 'play', 'pause', 'end', 'format')
     BV.setFormat('landscape'|'portrait')  BV.chapters [{t,label}]

   ADDITIONS (documented, non-breaking)
     BV.preload(x)     x = Promise | <img> | array of those. BV.ready (and the promise
                       returned by setFormat) wait for every registered preload.
                       Every <img> inside the stage is also decoded automatically.
     BV.fx             film finish, RESET BY THE ENGINE AT THE START OF EVERY SEEK, then
                       driven by scenes inside update() (so it stays deterministic):
                         fx.flash(intensity 0..1, color='white'|'aurora'|'gold'|css)  (max wins)
                         fx.vignette(v 0..1)   extra vignette darkness on top of the base soft vignette
                         fx.grain(on)          always-on animated film grain; any scene may switch it off
                         fx.bars(v 0..1)       cinemascope letterbox bars (for slow-mo moments)
     BV.camera         {x, y, s, r} reset each seek, applied to #bv-world after all scene
                       updates. Scenes ADD to it: BV.camera.x += sh.x; BV.camera.s *= 1.04.
                       Translation/rotation automatically over-scan (zoom) so stage edges
                       never show; set BV.camera.overscan = false to disable for a frame.
     BV.toggle()       play/pause.
     BV.off(evt, fn)   remove a listener (BV.on also returns an unsubscribe fn).
     BV.format         'landscape' | 'portrait'.  BV.frame  current frame index (t*fps).
     BV.world          #bv-world element.  BV.scale  current fit scale.  BV.params  URLSearchParams.
     BV.scenes         registered scene defs (read-only use, e.g. audio cue timing).
     BV.clock          optional fn () => seconds; when set (e.g. by audio) the play loop
                       follows that clock instead of performance.now().
     Events also: 'ready', 'resize' (scale).
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.BV_CONFIG || {};
  const FILM = CFG.film || {};
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render') && params.get('render') !== '0' && params.get('render') !== 'false';
  const DIMS = { landscape: [1920, 1080], portrait: [1080, 1920] };
  if (RENDER) document.documentElement.classList.add('bv-render');

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const hash = (n, s) => {           // tiny local hash (kit may not be loaded)
    let h = Math.imul((n | 0) ^ 0x27D4EB2D, 0x9E3779B1) ^ Math.imul((s | 0) + 0x7F4A7C15, 0xC2B2AE3D);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };

  /* ── State ───────────────────────────────────────────────────────────────── */
  const defs = [];                 // registration order
  let sorted = [];                 // by z, then registration order
  let order = 0;
  const listeners = {};
  let pending = [];                // preload promises
  let built = false, booted = false;
  let viewport = null, stage = null, world = null, fxRoot = null;
  const fxEl = {};
  let rafId = 0, clockT0 = 0, clockW0 = 0;
  const errs = new Set();

  let readyResolve;
  const BV = window.BV = {
    W: 1920, H: 1080, portrait: false, format: 'landscape',
    duration: +FILM.duration || 60,
    fps: +FILM.fps || 30,
    render: RENDER,
    t: 0, frame: 0, playing: false, scale: 1,
    chapters: [], scenes: defs,
    root: null, world: null, params,
    clock: null,
    ready: new Promise(r => { readyResolve = r; }),
    scene, seek, play, pause, toggle, on, off, setFormat, preload
  };

  function setDims(f) {
    BV.format = f === 'portrait' ? 'portrait' : 'landscape';
    BV.portrait = BV.format === 'portrait';
    BV.W = DIMS[BV.format][0];
    BV.H = DIMS[BV.format][1];
  }
  setDims(params.get('format'));

  /* ── Events ──────────────────────────────────────────────────────────────── */
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return () => off(evt, fn);
  }
  function off(evt, fn) {
    const l = listeners[evt]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  function emit(evt, arg) {
    const l = listeners[evt]; if (!l || !l.length) return;
    l.slice().forEach(fn => { try { fn(arg); } catch (e) { console.error('[BV] listener "' + evt + '" failed:', e); } });
  }

  function report(s, e, phase) {
    const key = s.id + ':' + phase + ':' + (e && e.message);
    if (errs.has(key)) return;
    errs.add(key);
    console.error('[BV] scene "' + s.id + '" ' + phase + ' failed:', e);
  }

  /* ── Scene registry ──────────────────────────────────────────────────────── */
  function scene(def) {
    if (!def || !def.id) { console.error('[BV] scene() needs an id', def); return; }
    const s = {
      id: String(def.id), def,
      start: +def.start || 0,
      end: def.end == null ? BV.duration : +def.end,
      z: def.z == null ? defs.length : +def.z,
      order: order++,
      root: null, state: undefined, ctx: null, vis: false, broken: false
    };
    const dup = defs.findIndex(d => d.id === s.id);
    if (dup >= 0) {
      console.warn('[BV] scene "' + s.id + '" registered twice; replacing.');
      if (defs[dup].root) defs[dup].root.remove();
      defs.splice(dup, 1);
    }
    defs.push(s);
    sortScenes();
    BV.chapters = defs.filter(d => d.def.chapter)
      .map(d => ({ t: d.start, label: String(d.def.chapter), id: d.id }))
      .sort((a, b) => a.t - b.t);
    if (built) {                   // late registration: build now, keep DOM in z order
      buildScene(s, makeCtx());
      placeRoot(s);
      queueImages(s.root);
      apply(BV.t);
    }
    return s;
  }
  function sortScenes() { sorted = defs.slice().sort((a, b) => (a.z - b.z) || (a.order - b.order)); }

  function makeCtx() {
    return {
      W: BV.W, H: BV.H, portrait: BV.portrait, format: BV.format,
      kit: window.BVKit, art: window.BVArt || null, cfg: window.BV_CONFIG || {},
      fps: BV.fps, duration: BV.duration, BV
    };
  }

  function buildScene(s, baseCtx) {
    const root = document.createElement('div');
    root.className = 'bv-scene';
    root.setAttribute('data-scene', s.id);
    root.style.cssText = 'position:absolute;left:0;top:0;width:' + BV.W + 'px;height:' + BV.H + 'px;z-index:' + s.z + ';';
    world.appendChild(root);       // displayed during build so layout can be measured
    s.root = root; s.vis = true; s.broken = false; s.state = undefined;
    s.ctx = Object.assign({}, baseCtx);
    if (typeof s.def.build === 'function') {
      try { s.state = s.def.build(root, s.ctx); }
      catch (e) { s.broken = true; report(s, e, 'build'); }
    }
  }
  function placeRoot(s) {
    const i = sorted.indexOf(s);
    const next = sorted.slice(i + 1).find(o => o.root && o.root.parentNode === world);
    world.insertBefore(s.root, next ? next.root : null);
  }

  function buildAll() {
    world.textContent = '';
    errs.clear();
    const ctx = makeCtx();
    sortScenes();
    sorted.forEach(s => buildScene(s, ctx));
    sorted.forEach(s => { s.root.style.display = 'none'; s.vis = false; });
    queueImages(world);
    built = true;
  }

  /* ── Preload ─────────────────────────────────────────────────────────────── */
  function preload(x) {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(preload); return; }
    if (typeof x.decode === 'function' && x.tagName === 'IMG') {
      pending.push(x.decode().catch(() => {}));
    } else if (typeof x.then === 'function') {
      pending.push(Promise.resolve(x).catch(e => console.warn('[BV] preload failed:', e)));
    }
  }
  function queueImages(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img').forEach(img => { if (img.src) preload(img); });
  }
  async function settle(timeout = 12000) {
    for (let round = 0; round < 4 && pending.length; round++) {
      const list = pending; pending = [];
      let done = false, timer = 0;
      await Promise.race([
        Promise.all(list).then(() => { done = true; }),
        new Promise(r => { timer = setTimeout(() => { if (!done) console.warn('[BV] preload timeout after ' + timeout + 'ms'); r(); }, timeout); })
      ]);
      clearTimeout(timer);
    }
  }

  /* ── DOM ─────────────────────────────────────────────────────────────────── */
  function setupDOM() {
    viewport = document.getElementById('bv-viewport');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.id = 'bv-viewport';
      document.body.appendChild(viewport);
    }
    if (RENDER) {
      document.body.appendChild(viewport);      // lift out of any page chrome
      document.body.style.margin = '0';
      document.body.style.background = '#000';
      document.body.style.overflow = 'hidden';
    }
    viewport.style.overflow = 'hidden';
    if (getComputedStyle(viewport).position === 'static') viewport.style.position = 'relative';

    stage = document.createElement('div');
    stage.id = 'bv-stage';
    stage.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0;background:#05070D;contain:layout paint style;';
    world = document.createElement('div');
    world.id = 'bv-world';
    world.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 50%;';
    fxRoot = document.createElement('div');
    fxRoot.id = 'bv-fx';
    fxRoot.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;overflow:hidden;';

    const layer = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;' + css; fxRoot.appendChild(d); return d; };
    fxEl.flash = layer('display:none;opacity:0;mix-blend-mode:screen;background:#fff;');
    fxEl.vig = layer('background:radial-gradient(ellipse 75% 75% at 50% 50%,rgba(0,0,0,0) 58%,rgba(0,0,0,.26) 82%,rgba(0,0,0,.5) 100%);');
    fxEl.vig2 = layer('display:none;opacity:0;background:radial-gradient(ellipse 62% 62% at 50% 50%,rgba(0,0,0,0) 30%,rgba(0,0,0,.6) 75%,rgba(0,0,0,.92) 100%);');
    fxEl.barT = layer('height:12.5%;background:#000;transform:translate3d(0,-100%,0);');
    fxEl.barB = layer('top:auto;bottom:0;height:12.5%;background:#000;transform:translate3d(0,100%,0);');
    fxEl.grain = document.createElement('div');
    fxEl.grain.style.cssText = 'position:absolute;left:0;top:0;opacity:.085;mix-blend-mode:overlay;background-repeat:repeat;will-change:transform;';
    fxEl.grain.style.backgroundImage = 'url(' + grainTexture() + ')';
    fxRoot.appendChild(fxEl.grain);

    stage.appendChild(world);
    stage.appendChild(fxRoot);
    viewport.appendChild(stage);
    BV.root = stage;
    BV.world = world;
    sizeStage();

    if (!RENDER) {
      if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(viewport);
      window.addEventListener('resize', fit);
      document.addEventListener('fullscreenchange', fit);
    }
  }

  // Deterministic grain tile (256px, fixed seed).
  const GRAIN = 256;
  function grainTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = GRAIN;
    const g = c.getContext('2d');
    const img = g.createImageData(GRAIN, GRAIN);
    let a = 0x9E3779B9 | 0;
    for (let i = 0; i < img.data.length; i += 4) {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      const v = 128 + (r - 0.5) * 180;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  function sizeStage() {
    stage.style.width = BV.W + 'px';
    stage.style.height = BV.H + 'px';
    fxEl.grain.style.width = (BV.W + GRAIN) + 'px';
    fxEl.grain.style.height = (BV.H + GRAIN) + 'px';
    if (RENDER) {
      viewport.style.cssText += ';position:fixed;left:0;top:0;width:' + BV.W + 'px;height:' + BV.H + 'px;background:#000;';
    }
    fit();
  }

  // Letterbox-fit the logical stage into the viewport.
  function fit() {
    if (!stage) return;
    if (RENDER) { stage.style.transform = 'none'; BV.scale = 1; return; }
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    if (!vw || !vh) return;
    const s = Math.min(vw / BV.W, vh / BV.H);
    const ox = Math.round((vw - BV.W * s) / 2), oy = Math.round((vh - BV.H * s) / 2);
    stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
    if (s !== BV.scale) { BV.scale = s; emit('resize', s); }
  }

  /* ── Film finish (fx) + camera — reset every seek ────────────────────────── */
  const fx = { flash: 0, flashColor: 'white', vignette: 0, grain: true, bars: 0 };
  const FLASH_BG = {
    white: '#fff',
    aurora: 'linear-gradient(120deg,#7C5CFF,#4D8DFF 40%,#19D3FF 72%,#46E6A6)',
    gold: 'radial-gradient(ellipse at 50% 50%,#FFF8DD,#F2C66D 55%,#D9A441)'
  };
  BV.fx = {
    flash(i, color) { i = clamp(+i || 0, 0, 1); if (i >= fx.flash && i > 0) { fx.flash = i; fx.flashColor = color || 'white'; } },
    vignette(v) { fx.vignette = Math.max(fx.vignette, clamp(+v || 0, 0, 1)); },
    grain(onOff) { fx.grain = fx.grain && !!onOff; },
    bars(v) { fx.bars = Math.max(fx.bars, clamp(+v || 0, 0, 1)); }
  };
  BV.camera = { x: 0, y: 0, s: 1, r: 0 };
  const last = { flash: -1, flashBg: '', vig: -1, grain: null, gx: -1, gy: -1, bars: -1, cam: null };

  function resetFx() {
    fx.flash = 0; fx.flashColor = 'white'; fx.vignette = 0; fx.grain = true; fx.bars = 0;
    const c = BV.camera; c.x = 0; c.y = 0; c.s = 1; c.r = 0; c.overscan = true;
  }

  function applyFx() {
    // flash
    const f = Math.round(fx.flash * 1000) / 1000;
    if (f !== last.flash) {
      fxEl.flash.style.display = f > 0 ? '' : 'none';
      fxEl.flash.style.opacity = f;
      last.flash = f;
    }
    if (f > 0) {
      const bg = FLASH_BG[fx.flashColor] || fx.flashColor;
      if (bg !== last.flashBg) { fxEl.flash.style.background = bg; last.flashBg = bg; }
    }
    // extra vignette
    const v = Math.round(fx.vignette * 1000) / 1000;
    if (v !== last.vig) {
      fxEl.vig2.style.display = v > 0 ? '' : 'none';
      fxEl.vig2.style.opacity = v;
      last.vig = v;
    }
    // bars
    const b = Math.round(fx.bars * 1000) / 1000;
    if (b !== last.bars) {
      const off = ((1 - b) * 100).toFixed(2);
      fxEl.barT.style.transform = 'translate3d(0,-' + off + '%,0)';
      fxEl.barB.style.transform = 'translate3d(0,' + off + '%,0)';
      last.bars = b;
    }
    // grain: offset the tile by a hashed amount per frame
    if (fx.grain !== last.grain) { fxEl.grain.style.display = fx.grain ? '' : 'none'; last.grain = fx.grain; }
    if (fx.grain) {
      const gx = Math.floor(hash(BV.frame, 11) * GRAIN), gy = Math.floor(hash(BV.frame, 23) * GRAIN);
      if (gx !== last.gx || gy !== last.gy) {
        fxEl.grain.style.transform = 'translate3d(' + (-gx) + 'px,' + (-gy) + 'px,0)';
        last.gx = gx; last.gy = gy;
      }
    }
  }

  function applyCamera() {
    const c = BV.camera || {};
    const x = +c.x || 0, y = +c.y || 0, r = +c.r || 0;
    let s = c.s == null ? 1 : +c.s;
    if (!isFinite(s) || s <= 0) s = 1;
    let tr = '';
    if (x || y || r || s !== 1) {
      if (c.overscan !== false && (x || y || r)) {
        const rr = Math.abs(r) * Math.PI / 180;
        const asp = Math.max(BV.W / BV.H, BV.H / BV.W);
        const cover = Math.max(1 + 2 * Math.abs(x) / BV.W, 1 + 2 * Math.abs(y) / BV.H) * (Math.cos(rr) + asp * Math.sin(rr));
        s = s >= 1 ? Math.max(s, cover) : s * cover;
      }
      tr = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' + (r ? ' rotate(' + r.toFixed(3) + 'deg)' : '') + (s !== 1 ? ' scale(' + s.toFixed(5) + ')' : '');
    }
    if (tr !== last.cam) { world.style.transform = tr; last.cam = tr; }
  }

  /* ── Time ────────────────────────────────────────────────────────────────── */
  // Pure function of t: visibility, scene updates, fx, camera.
  function apply(t) {
    t = clamp(+t || 0, 0, BV.duration);
    BV.t = t;
    BV.frame = Math.floor(t * BV.fps + 1e-6);
    resetFx();
    const atEnd = t >= BV.duration;
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      if (!s.root) continue;
      // Visible iff start <= t < end; the final frame holds scenes that run to the end.
      const vis = !s.broken && ((t >= s.start && t < s.end) || (atEnd && s.end >= BV.duration && t >= s.start));
      if (vis !== s.vis) { s.root.style.display = vis ? '' : 'none'; s.vis = vis; }
      if (vis && typeof s.def.update === 'function') {
        try { s.def.update(s.state, t - s.start, t, s.ctx); }
        catch (e) { report(s, e, 'update'); }
      }
    }
    if (stage) { applyFx(); applyCamera(); }
    emit('time', t);
    return t;
  }

  function seek(t) {
    apply(t);
    if (BV.playing) { clockT0 = BV.t; clockW0 = performance.now(); }
    return BV.t;
  }

  function play() {
    if (RENDER || BV.playing) return;
    if (BV.t >= BV.duration - 1e-3) apply(0);
    BV.playing = true;
    clockT0 = BV.t; clockW0 = performance.now();
    emit('play');
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!BV.playing) return;
    BV.playing = false;
    cancelAnimationFrame(rafId);
    emit('pause');
  }

  function toggle() { if (BV.playing) pause(); else play(); }

  function tick() {
    if (!BV.playing) return;
    let t = NaN;
    if (typeof BV.clock === 'function') { try { t = +BV.clock(); } catch (e) { t = NaN; } }
    if (!isFinite(t)) t = clockT0 + Math.max(0, performance.now() - clockW0) / 1000;
    if (t >= BV.duration) {
      apply(BV.duration);
      BV.playing = false;
      emit('pause');
      emit('end');
      return;
    }
    apply(t);
    rafId = requestAnimationFrame(tick);
  }

  /* ── Format ──────────────────────────────────────────────────────────────── */
  function setFormat(f) {
    f = f === 'portrait' ? 'portrait' : 'landscape';
    if (!booted) {
      if (built) return BV.ready.then(() => setFormat(f));   // mid-boot: switch once ready
      setDims(f); if (stage) sizeStage();
      return BV.ready;
    }
    if (f === BV.format) return Promise.resolve(BV);
    setDims(f);
    sizeStage();
    resetFx();
    applyCamera();
    buildAll();
    apply(BV.t);
    emit('format', BV.format);
    return settle().then(() => { apply(BV.t); return nextPaint(); }).then(() => BV);
  }

  function nextPaint() {
    return new Promise(r => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 150);
    });
  }

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  async function fontsReady() {
    if (!document.fonts) return;
    const link = document.querySelector('link[href*="fonts.googleapis"]');
    // Wait for the font stylesheet to settle (window 'load' also implies it has).
    if (link && !link.sheet && !link.dataset.done && document.readyState !== 'complete') {
      await Promise.race([new Promise(r => {
        link.addEventListener('load', r, { once: true });
        link.addEventListener('error', r, { once: true });
        window.addEventListener('load', r, { once: true });
      }), delay(4000)]);
    }
    const specs = [];
    ['400', '500', '600', '700'].forEach(w => {
      specs.push(w + ' 40px "Space Grotesk"', w + ' 40px "Inter"', w + ' 40px "JetBrains Mono"');
    });
    await Promise.race([Promise.all(specs.map(s => document.fonts.load(s).catch(() => null))), delay(8000)]);
    await Promise.race([document.fonts.ready, delay(3000)]);
  }

  async function boot() {
    try {
      setupDOM();
      await fontsReady();
      buildAll();
      await settle();
      const t0 = parseFloat(params.get('t'));
      apply(isFinite(t0) ? t0 : 0);
      await nextPaint();
    } catch (e) {
      console.error('[BV] boot failed:', e);
    }
    booted = true;
    readyResolve(BV);
    emit('ready', BV);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})();
