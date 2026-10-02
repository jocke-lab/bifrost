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
                       A chapter's t is the scene's VISIBLE cut, not its registration start:
                       def.chapterAt when given; otherwise, for a scene that cross-fades in over
                       the previous chaptered scene, the first BVShared.CUES time inside that
                       overlap (03 4.85 -> 5.0, 04 9.9 -> 10.0, 05 19.9 -> 20.0, 06 24.75 -> 25.0).

   ADDITIONS (documented, non-breaking)
     BV.preload(x)     x = Promise | <img> | array of those. A preload made while a scene's
                       build() runs belongs to THAT scene (as does every <img> in its root,
                       decoded automatically); any other preload is global.
                       Render mode (?render=1): every scene is built and BV.ready waits for
                       every preload, exactly as before (timeout 120 s).
                       Page mode (staged loading): BV.ready waits only for the global preloads
                       and the scenes that start within the first FILM.readyLead (9.5) s of the
                       start time (01-03 from 0), so autoplay starts after ~a third of the bytes.
                       The other scenes are then built and loaded in the background, one at a
                       time in film order (each waits for the previous one's assets, so the next
                       cut always gets the bandwidth first). Playback never draws a frame whose
                       scenes are still loading: it holds on the last complete frame instead
                       (BV.waiting) and resumes by itself. A paused seek into a loading scene
                       builds it at once and covers the picture with a loading veil until its
                       assets are decoded. Page timeout per scene: 30 s (then a console warning).
     BV.waiting        true while playback is held for assets. BV.playing stays true (the
                       viewer's intent, like <video> 'waiting'); the engine emits
                       'waiting'(true) + 'pause' (so the soundtrack stops in step) and, when the
                       assets land, 'waiting'(false) + 'play' and carries on from the held frame.
                       BV.pause() during a hold cancels it.
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
     BV.defaultFormat  format used when the URL has no ?format= ('portrait' on phone-shaped
                       viewports <=720px wide, else 'landscape'; render mode: 'landscape').
     BV.world          #bv-world element.  BV.scale  current fit scale.  BV.params  URLSearchParams.
     BV.scenes         registered scene defs (read-only use, e.g. audio cue timing).
     BV.clock          optional fn () => seconds; when set (e.g. by audio) the play loop
                       follows that clock instead of performance.now().
     BV.remap(from, to, fn)   (contract "Engine additions") during [from,to) every scene is
                       evaluated at fn(t) instead of t (visibility, local and t passed to update),
                       e.g. callback flash-cuts that replay earlier moments. Scenes registered with
                       `noRemap: true` always see real t. fn must be pure. Returns an unregister fn.
                       Later registrations win where ranges overlap. BV.t stays the real time.
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
  const G = { id: '(global)', pend: [] };   // preloads made outside any scene build
  let building = null;             // scene whose build() is running (preload attribution)
  let pumping = false;             // background builder busy
  let built = false, booted = false;
  // Page mode: BV.ready covers the scenes that start within this lead of the start time.
  const READY_LEAD = RENDER ? Infinity : (isFinite(+FILM.readyLead) && +FILM.readyLead > 0 ? +FILM.readyLead : 9.5);
  let drawnComplete = true;        // page mode: the last drawn frame had all its scenes loaded
  let stallT = 0;                  // page mode: the time playback is waiting to draw
  let viewport = null, stage = null, world = null, fxRoot = null;
  const fxEl = {};
  let rafId = 0, clockT0 = 0, clockW0 = 0;
  const errs = new Set();

  let readyResolve;
  const BV = window.BV = {
    W: 1920, H: 1080, portrait: false, format: 'landscape',
    duration: +FILM.duration || 30,
    fps: +FILM.fps || 30,
    render: RENDER,
    t: 0, frame: 0, playing: false, waiting: false, scale: 1,
    chapters: [], scenes: defs,
    root: null, world: null, params,
    clock: null,
    ready: new Promise(r => { readyResolve = r; }),
    scene, seek, play, pause, toggle, on, off, setFormat, preload, remap
  };

  function setDims(f) {
    BV.format = f === 'portrait' ? 'portrait' : 'landscape';
    BV.portrait = BV.format === 'portrait';
    BV.W = DIMS[BV.format][0];
    BV.H = DIMS[BV.format][1];
  }
  // Default format: 9:16 on phone-shaped viewports (a 16:9 film is tiny on a portrait phone),
  // 16:9 everywhere else. ?format= always wins; render mode always uses ?format (default landscape).
  BV.defaultFormat = (!RENDER && window.innerWidth <= 720 && window.innerHeight > window.innerWidth * 1.2) ? 'portrait' : 'landscape';
  setDims(params.get('format') || BV.defaultFormat);

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
      root: null, state: undefined, ctx: null, vis: false, broken: false,
      pend: [], loadP: null, loaded: false, warm: false   // per-scene preloads (see BV.preload)
    };
    const dup = defs.findIndex(d => d.id === s.id);
    if (dup >= 0) {
      console.warn('[BV] scene "' + s.id + '" registered twice; replacing.');
      if (defs[dup].root) defs[dup].root.remove();
      defs.splice(dup, 1);
    }
    defs.push(s);
    sortScenes();
    buildChapters();
    if (built) {                   // late registration: build now, keep DOM in z order
      buildOne(s);
      apply(BV.t);
    }
    return s;
  }
  function sortScenes() { sorted = defs.slice().sort((a, b) => (a.z - b.z) || (a.order - b.order)); }

  // Chapter marks sit on each scene's VISIBLE cut. Scenes cross-fade in, so a scene's
  // registration start (4.85) can precede its cut (5.0) while the previous scene is still on
  // screen; def.chapterAt wins, else the first shared cue inside the overlap, else its middle.
  function cueTimes() {
    const C = (window.BVShared && window.BVShared.CUES) || {};
    const out = [];
    Object.keys(C).forEach(k => [].concat(C[k]).forEach(v => { if (typeof v === 'number' && isFinite(v)) out.push(v); }));
    return out.sort((a, b) => a - b);
  }
  function chapterTime(s, chaptered, cues) {
    const at = s.def.chapterAt;
    if (at != null && at !== '' && isFinite(+at)) return clamp(+at, 0, BV.duration);
    let prevEnd = -Infinity;
    chaptered.forEach(o => { if (o !== s && o.start < s.start && o.end > s.start) prevEnd = Math.max(prevEnd, o.end); });
    if (!(prevEnd > s.start)) return s.start;
    const cue = cues.find(v => v >= s.start - 1e-6 && v <= prevEnd + 1e-6);
    return cue != null ? cue : Math.round((s.start + prevEnd) * 10) / 20;
  }
  function buildChapters() {
    const chaptered = defs.filter(d => d.def.chapter);
    const cues = cueTimes();
    BV.chapters = chaptered
      .map(d => ({ t: chapterTime(d, chaptered, cues), label: String(d.def.chapter), id: d.id }))
      .sort((a, b) => a.t - b.t);
  }

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
    // Insert in z order (before the next built scene), displayed during build so layout can be measured.
    const i = sorted.indexOf(s);
    const next = sorted.slice(i + 1).find(o => o.root && o.root.parentNode === world);
    world.insertBefore(root, next ? next.root : null);
    s.root = root; s.vis = true; s.broken = false; s.state = undefined;
    s.ctx = Object.assign({}, baseCtx);
    const prev = building;
    building = s;                  // preloads made during build() belong to this scene
    try {
      if (typeof s.def.build === 'function') {
        try { s.state = s.def.build(root, s.ctx); }
        catch (e) { s.broken = true; report(s, e, 'build'); }
      }
      queueImages(root, s);
    } finally { building = prev; }
  }

  // Build one scene into the live world (late registration, background builder, on-demand).
  function buildOne(s) {
    buildScene(s, makeCtx());
    s.root.style.display = 'none'; s.vis = false;
    track(s);
  }

  // (Re)build: clears the world, builds `list` (all scenes in render mode), leaves the rest unbuilt.
  function buildSet(list) {
    world.textContent = '';
    errs.clear();
    sortScenes();
    defs.forEach(s => { s.root = null; s.vis = false; s.state = undefined; s.loaded = false; });
    const ctx = makeCtx();
    sorted.forEach(s => { if (list.indexOf(s) >= 0) buildScene(s, ctx); });
    sorted.forEach(s => { if (s.root) { s.root.style.display = 'none'; s.vis = false; track(s); } });
    built = true;
  }

  // Scenes BV.ready / setFormat wait for: render mode all; page mode those that start within
  // READY_LEAD of t (01-03 from 0) plus whatever is on screen at t.
  function headScenes(t) {
    if (RENDER) return defs.slice();
    return defs.filter(s => (s.start < t + READY_LEAD && s.end > t) || visibleAt(s, t, remaps.length ? evalTime(t) : t));
  }

  /* ── Preload ─────────────────────────────────────────────────────────────── */
  function preload(x, owner) {
    if (!x) return;
    const o = owner && Array.isArray(owner.pend) ? owner : (building || G);   // (forEach(BV.preload) passes an index)
    if (Array.isArray(x)) { x.forEach(v => preload(v, o)); return; }
    let p = null;
    if (typeof x.decode === 'function' && x.tagName === 'IMG') p = x.decode().catch(() => {});
    else if (typeof x.then === 'function') p = Promise.resolve(x).catch(e => console.warn('[BV] preload failed:', e));
    if (p) o.pend.push(p);
  }
  function queueImages(rootEl, owner) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img').forEach(img => { if (img.src) preload(img, owner); });
  }
  // Render mode must never start capturing before assets are decoded; the page gives up sooner.
  const PRELOAD_TIMEOUT = RENDER ? 120000 : 30000;
  async function settle(h, timeout = PRELOAD_TIMEOUT) {
    for (let round = 0; round < 4 && h.pend.length; round++) {
      const list = h.pend; h.pend = [];
      let done = false, timer = 0;
      await Promise.race([
        Promise.all(list).then(() => { done = true; }),
        new Promise(r => { timer = setTimeout(() => { if (!done) console.warn('[BV] preload timeout after ' + timeout + 'ms (' + h.id + ')'); r(); }, timeout); })
      ]);
      clearTimeout(timer);
    }
  }
  // Start (or extend) a scene's load. Loads chain, so `loaded` only turns true once every preload
  // the scene ever registered has settled (a rebuild may not re-register module-cached images).
  function track(s) {
    const cur = settle(s);
    const p = s.loadP = (s.loadP ? Promise.all([s.loadP, cur]) : cur).then(() => {
      if (s.loadP !== p) return;
      s.loaded = s.warm = true;
      onLoaded(s);
    });
    s.loaded = false;
    return p;
  }
  function settleScenes(list) {
    return Promise.all([settle(G)].concat(list.map(s => s.loadP))).then(() => settle(G));
  }

  // Scenes on screen at t that may not be drawn yet: unbuilt, or never fully loaded. (A rebuild
  // after a format switch reuses decoded/cached assets — `warm` — and does not hold playback.)
  function visibleAt(s, t, te) {
    const ts = s.def.noRemap ? t : te;
    return !s.broken && ((ts >= s.start && ts < s.end) || (ts >= BV.duration && s.end >= BV.duration && ts >= s.start));
  }
  function blockers(t) {
    t = clamp(+t || 0, 0, BV.duration);
    const te = remaps.length ? evalTime(t) : t;
    const out = [];
    for (let i = 0; i < defs.length; i++) {
      const s = defs[i];
      if (visibleAt(s, t, te) && !(s.root && (s.loaded || s.warm))) out.push(s);
    }
    return out;
  }
  function ensureBuilt(list) { list.forEach(s => { if (!s.root) buildOne(s); }); }

  function onLoaded() {
    if (RENDER || !booted) return;
    if (BV.waiting) { if (!blockers(stallT).length) resume(); else refreshCover(); }
    else if (!BV.playing && !drawnComplete && !blockers(BV.t).length) apply(BV.t);   // paused on a veiled frame
  }

  // Background builder (page mode): builds the remaining scenes one at a time, the next cut first,
  // each waiting (bounded) for the previous one's assets so bandwidth goes where playback needs it.
  const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 32));
  function nextUnbuilt() {
    const rest = defs.filter(s => !s.root);
    if (!rest.length) return null;
    const ahead = rest.filter(s => s.end > BV.t).sort((a, b) => a.start - b.start);
    return ahead[0] || rest.sort((a, b) => a.start - b.start)[0];
  }
  function pump() {
    if (RENDER || pumping || !nextUnbuilt()) return;
    pumping = true;
    idle(() => {
      const s = nextUnbuilt();
      if (!s) { pumping = false; return; }
      buildOne(s);
      Promise.race([s.loadP, delay(PRELOAD_TIMEOUT)]).then(() => { pumping = false; pump(); });
    });
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
    fxEl.grain.style.cssText = 'position:absolute;left:0;top:0;opacity:' + GRAIN_OPACITY + ';mix-blend-mode:overlay;background-repeat:repeat;will-change:transform;';
    fxEl.grain.style.backgroundImage = 'url(' + grainTexture() + ')';
    fxEl.grain.style.backgroundSize = (GRAIN * GRAIN_SCALE) + 'px';
    fxRoot.appendChild(fxEl.grain);

    stage.appendChild(world);
    stage.appendChild(fxRoot);
    viewport.appendChild(stage);
    BV.root = stage;
    BV.world = world;
    sizeStage();

    if (!RENDER) {
      setupCover();
      if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(viewport);
      window.addEventListener('resize', fit);
      document.addEventListener('fullscreenchange', fit);
    }
  }

  // Page-only loading veil (never in render mode, outside the stage): 'cover' hides a frame whose
  // scenes are still loading (paused seek); 'stall' shows a spinner over the held frame, after a
  // short grace so a quick hold does not flash.
  const cover = { el: null, spin: null, mode: 'none', timer: 0 };
  function setupCover() {
    const el = document.createElement('div');
    el.className = 'bv-wait';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:4;pointer-events:none;display:none;';
    const spin = document.createElement('div');
    spin.style.cssText = 'position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;box-sizing:border-box;' +
      'border-radius:50%;border:2px solid rgba(255,255,255,.10);border-top-color:var(--cyan,#19D3FF);border-right-color:var(--violet,#7C5CFF);';
    el.appendChild(spin);
    viewport.appendChild(el);
    if (typeof spin.animate === 'function') {
      try { spin.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 900, iterations: Infinity }); } catch (e) { /* static ring */ }
    }
    cover.el = el; cover.spin = spin;
  }
  function showCover(mode) {
    const el = cover.el; if (!el) return;
    if (mode === 'cover') {
      el.style.background = 'radial-gradient(60% 50% at 50% 55%,rgba(77,141,255,.14),transparent 70%),#05070D';
      el.style.display = '';
    } else if (mode === 'stall') {
      el.style.background = 'rgba(5,7,13,.38)';
      el.style.display = '';
    } else el.style.display = 'none';
  }
  function refreshCover() {
    if (!cover.el) return;
    const mode = !booted ? 'none' : !drawnComplete ? 'cover' : BV.waiting ? 'stall' : 'none';
    if (mode === cover.mode) return;
    cover.mode = mode;
    clearTimeout(cover.timer);
    if (mode === 'stall') cover.timer = setTimeout(() => { if (cover.mode === 'stall') showCover('stall'); }, 350);
    else showCover(mode);
  }

  // Deterministic grain tile (256px, fixed seed). Grain is the most expensive thing in the
  // encoded MP4: fine 1px noise re-rolled every frame multiplied the x264 bitrate ~7x (61 vs
  // 8 Mbps at crf 18). It is drawn 2x (softer, filmic, ~3.5x cheaper) and re-rolled every
  // GRAIN_STEP frames (15 fps at 30 fps). Tuning knobs for tests: ?grainop= &grainstep= &grainscale=
  const GRAIN = 256;
  const GRAIN_OPACITY = +(params.get('grainop') || 0.07);
  const GRAIN_STEP = Math.max(1, +(params.get('grainstep') || 2));
  const GRAIN_SCALE = Math.max(1, +(params.get('grainscale') || 2));
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
    fxEl.grain.style.width = (BV.W + GRAIN * GRAIN_SCALE) + 'px';
    fxEl.grain.style.height = (BV.H + GRAIN * GRAIN_SCALE) + 'px';
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
    // Coloured flashes bloom from the centre (bright core, tinted falloff) so they read as
    // light, not as a flat colour wash over the frame.
    aurora: 'radial-gradient(ellipse 60% 60% at 50% 50%,rgba(255,255,255,.95) 0%,rgba(255,255,255,0) 60%),' +
            'linear-gradient(120deg,rgba(124,92,255,.85),rgba(77,141,255,.7) 40%,rgba(25,211,255,.7) 72%,rgba(70,230,166,.85))',
    gold: 'radial-gradient(ellipse 70% 70% at 50% 50%,#FFF8DD 0%,rgba(242,198,109,.9) 38%,rgba(217,164,65,.45) 75%,rgba(138,90,18,.25) 100%)'
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
      const gf = Math.floor(BV.frame / GRAIN_STEP);
      const gx = Math.floor(hash(gf, 11) * GRAIN) * GRAIN_SCALE, gy = Math.floor(hash(gf, 23) * GRAIN) * GRAIN_SCALE;
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

  /* ── Time remapping (callback cuts) ──────────────────────────────────────── */
  const remaps = [];
  function remap(from, to, fn) {
    if (typeof fn !== 'function' || !(+to > +from)) { console.warn('[BV] remap(from, to, fn) ignored: bad arguments'); return () => {}; }
    const r = { from: +from, to: +to, fn };
    remaps.push(r);
    if (built) apply(BV.t);
    return () => { const i = remaps.indexOf(r); if (i >= 0) { remaps.splice(i, 1); if (built) apply(BV.t); } };
  }
  function evalTime(t) {
    for (let i = remaps.length - 1; i >= 0; i--) {
      const r = remaps[i];
      if (t >= r.from && t < r.to) {
        let v = NaN;
        try { v = +r.fn(t); } catch (e) { console.error('[BV] remap fn failed:', e); }
        return isFinite(v) ? clamp(v, 0, BV.duration) : t;
      }
    }
    return t;
  }

  /* ── Time ────────────────────────────────────────────────────────────────── */
  // Pure function of t: visibility, scene updates, fx, camera.
  function apply(t) {
    t = clamp(+t || 0, 0, BV.duration);
    BV.t = t;
    BV.frame = Math.floor(t * BV.fps + 1e-6);
    resetFx();
    const te = remaps.length ? evalTime(t) : t;          // scene-evaluation time (remapped)
    let complete = true;
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      // Visible iff start <= t < end; the final frame holds scenes that run to the end.
      const ts = s.def.noRemap ? t : te;
      const vis = visibleAt(s, t, te);
      if (!s.root) {
        if (!vis || !built) continue;
        buildOne(s);                                      // page mode: not built yet -> build on demand
      }
      if (vis && !s.loaded && !s.warm) complete = false;
      if (vis !== s.vis) { s.root.style.display = vis ? '' : 'none'; s.vis = vis; }
      if (vis && typeof s.def.update === 'function') {
        try { s.def.update(s.state, ts - s.start, ts, s.ctx); }
        catch (e) { report(s, e, 'update'); }
      }
    }
    if (stage) { applyFx(); applyCamera(); }
    if (!RENDER) { drawnComplete = complete; refreshCover(); }
    emit('time', t);
    return t;
  }

  // Page mode: can playback draw t? Builds what is missing; false = hold (assets still loading).
  function canDraw(t) {
    if (RENDER || !built) return true;
    const b = blockers(t);
    if (!b.length) return true;
    ensureBuilt(b);
    return !blockers(t).length;
  }
  // Hold playback on the last drawn (complete) frame until the scenes at t have loaded.
  function stall(t) {
    stallT = t;
    cancelAnimationFrame(rafId);
    if (!BV.waiting) {
      BV.waiting = true;
      emit('waiting', true);
      emit('pause');            // BV.playing stays true: media listeners stop, the UI keeps 'playing'
    }
    refreshCover();
  }
  function resume() {
    if (!BV.waiting) return;
    BV.waiting = false;
    emit('waiting', false);
    refreshCover();
    if (!BV.playing) return;
    clockT0 = BV.t; clockW0 = performance.now();
    emit('play');
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function seek(t) {
    apply(t);
    if (BV.playing) {
      clockT0 = BV.t; clockW0 = performance.now();
      if (BV.waiting) {         // re-aim the hold at the new time (or resume if it is ready)
        if (canDraw(BV.t)) resume(); else stall(BV.t);
      }
    }
    return BV.t;
  }

  function play() {
    if (RENDER || BV.playing) return;
    if (BV.t >= BV.duration - 1e-3) apply(0);
    BV.playing = true;
    clockT0 = BV.t; clockW0 = performance.now();
    if (!canDraw(BV.t)) { stall(BV.t); return; }
    emit('play');
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!BV.playing) return;
    BV.playing = false;
    cancelAnimationFrame(rafId);
    if (BV.waiting) { BV.waiting = false; emit('waiting', false); refreshCover(); }
    emit('pause');
  }

  function toggle() { if (BV.playing) pause(); else play(); }

  function tick() {
    if (!BV.playing || BV.waiting) return;
    let t = NaN;
    if (typeof BV.clock === 'function') { try { t = +BV.clock(); } catch (e) { t = NaN; } }
    if (!isFinite(t)) t = clockT0 + Math.max(0, performance.now() - clockW0) / 1000;
    if (t >= BV.duration) {
      if (!canDraw(BV.duration)) { stall(BV.duration); return; }
      apply(BV.duration);
      BV.playing = false;
      emit('pause');
      emit('end');
      return;
    }
    if (!canDraw(t)) { stall(t); return; }
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
    const head = headScenes(BV.t);   // render: every scene; page: the next ~10 s, rest in the background
    buildSet(head);
    apply(BV.t);
    emit('format', BV.format);
    pump();
    return settleScenes(head).then(() => { apply(BV.t); return nextPaint(); }).then(() => BV);
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
      specs.push(w + ' 40px "Geist"', w + ' 40px "JetBrains Mono"');
    });
    await Promise.race([Promise.all(specs.map(s => document.fonts.load(s).catch(() => null))), delay(8000)]);
    await Promise.race([document.fonts.ready, delay(3000)]);
  }

  async function boot() {
    try {
      setupDOM();
      await fontsReady();
      buildChapters();               // BVShared (cue sheet) is loaded by now
      let t0 = parseFloat(params.get('t'));
      t0 = isFinite(t0) ? clamp(t0, 0, BV.duration) : 0;
      const head = headScenes(t0);   // render mode: every scene (unchanged contract)
      buildSet(head);
      await settleScenes(head);
      apply(t0);
      await nextPaint();
    } catch (e) {
      console.error('[BV] boot failed:', e);
    }
    booted = true;
    readyResolve(BV);
    emit('ready', BV);
    refreshCover();
    pump();                          // page mode: build + load the remaining scenes in film order
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})();
