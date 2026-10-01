/* ============================================================================
   kit.js — window.BVKit
   Bifrost Vault commercial · pure helpers that power every scene.
   Everything here is a pure function of its inputs (time in, pixels out):
   no Math.random, no Date, no timers, no CSS transitions — seeking anywhere
   on the timeline always produces the same frame.

   CONTRACT API (see ARCH.md)
     clamp(x,a=0,b=1) lerp(a,b,t) invLerp(a,b,x) range(local,a,b) env(local,inA,inB,outA,outB)
     ease.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,outQuart,inOutQuart,
           outQuint,inOutQuint,outExpo,inExpo,inOutExpo,outBack,outElastic,inOutSine}
     spring(t,freq=4,damping=0.35)  rng(seed)  hash(n)  noise(x,seed)
     el(tag,{class,style,attrs,html,parent})  setT(el,{x,y,z,s,sx,sy,r,rx,ry,o})
     superText(parent,text,opts) -> handle{el,parts[]}   animText(handle,local,inAt,outAt,opts)
     countUp(el,local,a,b,from,to,fmt)  aurora(parent,{W,H,seed}) -> {canvas,draw(t,intensity,hueShift)}
     particles(canvas,opts) -> {draw(ctx,local)}  sweep(el,local,a,b,opts)  shake(local,amp,seed,decay)
     fmtEUR(n) fmtInt(n)

   NOTES / ADDITIONS (non-breaking)
   - All easings take (t) and clamp t to [0,1]. outBack takes (t, k=1.70158) —
     call ease.outBack(p) or ease.outBack(p, 2.2). ease.back(k) returns a (t)=>v
     function if you prefer a factory. Extra easings: inSine, outSine, inQuart,
     inQuint, inBack, inOutBack, outCirc, inOutCirc, smooth.
   - hash(n, seed=0), noise(x, seed=0); fbm(x, seed, octaves=3) layered noise.
   - rng(seed) accepts numbers or strings; the returned fn also has
     .range(a,b), .int(a,b) (inclusive), .pick(arr), .sign().
   - setT: s is uniform scale, sx/sy multiply it (setT(e,{s:2,sy:.5}) -> scale(2,1)).
     Optional p (perspective px) prepends perspective(); o sets opacity.
   - superText extra opts: valign 'middle'|'top'|'bottom' (default middle),
     gradient: true|'aurora'|'silver'|'gold', sheen (default true when gradient),
     chroma: true|px (violet/cyan ghost layers that converge as text lands),
     glow: CSS colour, shadow: bool, upper: bool, letterSpacing, lineHeight,
     font, fit: px (shrinks font-size so the line never exceeds fit px), seed.
     If size is omitted, the cls default is used, scaled in portrait (hero 0.72x, num 0.75x,
     sub 0.92x, mono 0.95x, tag 1x). Defaults: hero 150, num 130, sub 48, mono 30, tag 24.
     x/y accept numbers (px) or CSS strings ('50%'); default centre of parent.
   - animText extra opts: outStyle ('rise'|'blur'|'scale'|'slam'|'fade'|'drop'|'wipe'|'type'),
     outDur, order ('ltr'|'rtl'|'center'|'edges'|'random'), chroma (px, overrides),
     caretColor. Returns {p, q, impact, landed}: p = 0..1 progress of the whole in-animation,
     q = 0..1 out-progress, impact = local time the text lands (slam: the hit; other styles:
     when the last part settles) — use it to fire shake / flash / particles.
     paintText(handle, local) re-aligns the animated gradient for text that is
     not driven by animText. measureText(handle) -> {W,H,pos[]} layout metrics.
   - emitter(canvas,{rate,...}) -> {draw(ctx,local)}: continuous analytic emitter
     (particle i is born at i/rate; state is closed-form) for dust / embers / bokeh.
   - sweep opts: intensity (opacity), blend ('screen'|'overlay'|...), mask (image URL to
     clip the sweep to a shape, e.g. a coin), soft (halo width multiplier). If el is an
     <img>, the overlay is placed as its sibling, masked by the image and follows its
     inline transform. Returns progress 0..1.
   - shake(local, amp, seed=1, decay=0, freq=14).
   - fmtEUR(n, decimals=0). rgba(hex, a) colour helper. smoothstep(a,b,x). fract(x).
   ========================================================================== */
(function () {
  'use strict';

  /* ── 1. Math ─────────────────────────────────────────────────────────────── */
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, x) => (a === b ? (x >= b ? 1 : 0) : (x - a) / (b - a));
  const range = (local, a, b) => clamp(invLerp(a, b, local));
  const smoothstep = (a, b, x) => { const t = range(x, a, b); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);

  // 0 -> 1 over [inA,inB], holds 1 until outA, -> 0 by outB. Omit outA/outB to never fade out.
  function env(local, inA, inB, outA = Infinity, outB = Infinity) {
    const i = inB > inA ? clamp((local - inA) / (inB - inA)) : (local >= inA ? 1 : 0);
    const o = outB > outA ? 1 - clamp((local - outA) / (outB - outA)) : (local < outA ? 1 : 0);
    return i < o ? i : o;
  }

  /* ── 2. Easing (all clamp their input to [0,1]) ──────────────────────────── */
  const C = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const ease = {
    linear: t => C(t),
    inQuad: t => (t = C(t), t * t),
    outQuad: t => (t = C(t), 1 - (1 - t) * (1 - t)),
    inOutQuad: t => (t = C(t), t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: t => (t = C(t), t * t * t),
    outCubic: t => (t = C(t), 1 - Math.pow(1 - t, 3)),
    inOutCubic: t => (t = C(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inQuart: t => (t = C(t), t * t * t * t),
    outQuart: t => (t = C(t), 1 - Math.pow(1 - t, 4)),
    inOutQuart: t => (t = C(t), t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    inQuint: t => (t = C(t), t * t * t * t * t),
    outQuint: t => (t = C(t), 1 - Math.pow(1 - t, 5)),
    inOutQuint: t => (t = C(t), t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    inExpo: t => (t = C(t), t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outExpo: t => (t = C(t), t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutExpo: t => (t = C(t), t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    inSine: t => (t = C(t), 1 - Math.cos(t * PI / 2)),
    outSine: t => (t = C(t), Math.sin(t * PI / 2)),
    inOutSine: t => (t = C(t), -(Math.cos(PI * t) - 1) / 2),
    outCirc: t => (t = C(t), Math.sqrt(1 - Math.pow(t - 1, 2))),
    inOutCirc: t => (t = C(t), t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
    inBack: (t, k = 1.70158) => (t = C(t), (k + 1) * t * t * t - k * t * t),
    outBack: (t, k = 1.70158) => (t = C(t), 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2)),
    inOutBack: (t, k = 1.70158) => {
      t = C(t); const c2 = k * 1.525;
      return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
                     : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    outElastic: t => {
      t = C(t); if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    },
    smooth: t => (t = C(t), t * t * (3 - 2 * t)),
    back: k => t => ease.outBack(t, k)
  };

  // Damped spring 0 -> 1 with overshoot. freq in Hz, damping = damping ratio (0..1).
  function spring(t, freq = 4, damping = 0.35) {
    if (t <= 0) return 0;
    const z = clamp(damping, 0.001, 0.999);
    const w = TAU * freq, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
  }

  /* ── 3. Deterministic randomness ─────────────────────────────────────────── */
  function seedOf(s) {
    if (typeof s === 'number' && Number.isInteger(s)) return s | 0;
    const str = String(s);
    let h = 2166136261;                                  // FNV-1a
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }

  // mulberry32 PRNG -> () => [0,1)
  function rng(seed = 1) {
    let a = seedOf(seed) >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.sign = () => (next() < 0.5 ? -1 : 1);
    return next;
  }

  // Stateless hash -> [0,1). Non-integer inputs hash distinctly (fraction is folded in).
  function hash(n, seed = 0) {
    const i = Math.floor(n);
    const f = Math.floor((n - i) * 65536);
    let h = Math.imul(i ^ 0x27D4EB2D, 0x9E3779B1) ^ Math.imul((f + 0x165667B1) | 0, 0x85EBCA77) ^
            Math.imul((seedOf(seed) + 0x7F4A7C15) | 0, 0xC2B2AE3D);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D);
    h ^= h >>> 12; h = Math.imul(h, 0x297A2D39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // Smooth 1D value noise in [-1,1] (quintic fade between hashed lattice values).
  function noise(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const a = hash(i, seed), b = hash(i + 1, seed);
    return (a + (b - a) * u) * 2 - 1;
  }

  // Fractal noise (normalised to roughly [-1,1]).
  function fbm(x, seed = 0, oct = 3) {
    let s = 0, amp = 1, norm = 0, fr = 1;
    for (let o = 0; o < oct; o++) { s += noise(x * fr, seed + o * 101) * amp; norm += amp; amp *= 0.5; fr *= 2.03; }
    return s / norm;
  }

  /* ── 4. Colour helpers ───────────────────────────────────────────────────── */
  function hexRGB(hex) {
    let h = String(hex).trim();
    if (h.startsWith('rgb')) { const m = h.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgbStr = (c, a = 1) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (+a).toFixed(3) + ')';
  const rgba = (hex, a = 1) => rgbStr(hexRGB(hex), a);
  const WHITE = [255, 255, 255];

  const AURORA = ['#7C5CFF', '#4D8DFF', '#19D3FF', '#46E6A6'];
  const FONT = {
    display: "'Space Grotesk', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    body: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  };

  /* ── 5. DOM helpers ──────────────────────────────────────────────────────── */
  function el(tag, o = {}) {
    const e = o.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (o.class) e.setAttribute('class', o.class);
    if (o.style) { if (typeof o.style === 'string') e.style.cssText = o.style; else Object.assign(e.style, o.style); }
    if (o.attrs) for (const k in o.attrs) if (o.attrs[k] != null) e.setAttribute(k, o.attrs[k]);
    if (o.html != null) e.innerHTML = o.html;
    if (o.text != null) e.textContent = o.text;
    if (o.children) o.children.forEach(c => c && e.appendChild(c));
    if (o.parent) o.parent.appendChild(e);
    return e;
  }

  // Pure transform/opacity write.
  function setT(e, o) {
    if (!e) return e;
    o = o || {};
    const x = o.x || 0, y = o.y || 0, z = o.z || 0;
    const s = o.s == null ? 1 : o.s;
    const sx = (o.sx == null ? 1 : o.sx) * s, sy = (o.sy == null ? 1 : o.sy) * s;
    let tr = o.p ? 'perspective(' + o.p + 'px) ' : '';
    tr += 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px)';
    if (o.rx) tr += ' rotateX(' + o.rx + 'deg)';
    if (o.ry) tr += ' rotateY(' + o.ry + 'deg)';
    if (o.r) tr += ' rotate(' + o.r + 'deg)';
    if (sx !== 1 || sy !== 1) tr += ' scale(' + sx + ',' + sy + ')';
    e.style.transform = tr;
    if (o.o != null) e.style.opacity = clamp(o.o);
    return e;
  }
  const px = v => (typeof v === 'number' ? v + 'px' : v);

  /* ── 6. Kit stylesheet (injected once; kit-owned classes only) ───────────── */
  (function injectCSS() {
    if (document.getElementById('bvkit-css')) return;
    const css = [
      '.bvk-t{position:absolute;width:0;height:0;pointer-events:none;user-select:none;-webkit-user-select:none}',
      '.bvk-ti{position:absolute;left:0;top:0;white-space:nowrap;font-kerning:normal;text-rendering:geometricPrecision}',
      '.bvk-ti.bvk-wrap{white-space:normal}',
      '.bvk-w{display:inline-block;white-space:nowrap}',
      '.bvk-p{display:inline-block;position:relative}',
      '.bvk-f{display:inline-block;position:relative}',
      '.bvk-g .bvk-f{color:transparent!important;-webkit-background-clip:text;background-clip:text;background-repeat:repeat-x;-webkit-text-fill-color:transparent}',
      '.bvk-gh{position:absolute;left:0;top:0;width:100%;opacity:0;pointer-events:none;-webkit-text-fill-color:currentColor}',
      '.bvk-gh1{color:#7C5CFF}.bvk-gh2{color:#19D3FF}',
      '.bvk-caret{position:absolute;left:0;top:0;width:.5em;height:1em;background:#19D3FF;opacity:0;pointer-events:none}',
      '.bvk-edge{position:absolute;top:-12%;height:124%;width:.07em;margin-left:-.035em;left:0;opacity:0;pointer-events:none;' +
        'background:linear-gradient(180deg,rgba(255,255,255,0),#fff 30%,#fff 70%,rgba(255,255,255,0));' +
        'box-shadow:0 0 .25em #19D3FF,0 0 .7em #7C5CFF,0 0 1.4em rgba(77,141,255,.6)}',
      '.bvk-sweep{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;border-radius:inherit;' +
        'mix-blend-mode:screen;visibility:hidden;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}',
      '.bvk-sweep-band{position:absolute;top:0;left:-100%;width:300%;height:100%}',
      '.bvk-aurora,.bvk-canvas{position:absolute;left:0;top:0;pointer-events:none}'
    ].join('\n');
    const st = document.createElement('style');
    st.id = 'bvkit-css';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ── 7. Kinetic typography ───────────────────────────────────────────────── */
  const CLS = {
    // pk = default-size factor in portrait (big type shrinks ~0.7x; small type stays legible on phones)
    hero: { size: 150, pk: 0.72, weight: 700, font: FONT.display, ls: '-0.03em', lh: 0.95 },
    sub:  { size: 48,  pk: 0.92, weight: 500, font: FONT.body,    ls: '-0.01em', lh: 1.18 },
    tag:  { size: 24,  pk: 1,    weight: 600, font: FONT.mono,    ls: '0.32em',  lh: 1.2, upper: true, color: '#8AA4BC' },
    mono: { size: 30,  pk: 0.95, weight: 500, font: FONT.mono,    ls: '0',       lh: 1.3 },
    num:  { size: 130, pk: 0.75, weight: 700, font: FONT.display, ls: '-0.035em', lh: 1, tnum: true }
  };

  // Gradient fills for text (background-clip:text). Each returns layer config.
  const GRAD = {
    aurora: { img: 'linear-gradient(90deg,#7C5CFF 0%,#4D8DFF 17%,#19D3FF 33%,#46E6A6 50%,#19D3FF 67%,#4D8DFF 83%,#7C5CFF 100%)', move: true },
    silver: { img: 'linear-gradient(180deg,#FFFFFF 0%,#F4F7FA 22%,#C9D1D9 44%,#5B6670 53%,#9AA5B1 63%,#E6EBF0 84%,#FFFFFF 100%)', move: false },
    gold:   { img: 'linear-gradient(180deg,#FFF8DD 0%,#FFF1C1 20%,#F2C66D 42%,#8A5A12 53%,#D9A441 64%,#FFE7A3 86%,#FFF8DD 100%)', move: false }
  };
  const SHEEN_IMG = 'linear-gradient(105deg,rgba(255,255,255,0) 44%,rgba(255,255,255,.55) 48.5%,rgba(255,255,255,.95) 50%,rgba(255,255,255,.55) 51.5%,rgba(255,255,255,0) 56%)';

  function superText(parent, text, o = {}) {
    const cls = CLS[o.cls] ? o.cls : 'hero';
    const c = CLS[cls];
    const portraitK = (window.BV && window.BV.portrait) ? c.pk : 1;
    const size = o.size != null ? o.size : Math.round(c.size * portraitK);
    const align = o.align || 'center';
    const valign = o.valign || 'middle';
    const split = o.split || 'chars';
    const gradKey = o.gradient === true ? 'aurora' : (o.gradient && GRAD[o.gradient] ? o.gradient : null);
    const chroma = !!o.chroma;

    const wrap = el('div', { class: 'bvk-t bvk-t--' + cls, parent });
    wrap.style.left = px(o.x != null ? o.x : '50%');
    wrap.style.top = px(o.y != null ? o.y : '50%');

    const inner = el('div', { class: 'bvk-ti' + (gradKey ? ' bvk-g' : ''), parent: wrap });
    const st = inner.style;
    st.fontFamily = o.font || c.font;
    st.fontSize = size + 'px';
    st.fontWeight = o.weight || c.weight;
    st.letterSpacing = o.letterSpacing != null ? px(o.letterSpacing) : c.ls;
    st.lineHeight = o.lineHeight != null ? o.lineHeight : c.lh;
    st.textAlign = align;
    st.color = o.color || c.color || '#EAF2F8';
    if (o.upper != null ? o.upper : c.upper) st.textTransform = 'uppercase';
    if (c.tnum) st.fontVariantNumeric = 'tabular-nums';
    if (o.maxWidth) { inner.classList.add('bvk-wrap'); st.width = o.maxWidth + 'px'; }
    const ax = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
    const ay = valign === 'top' ? '0' : valign === 'bottom' ? '-100%' : '-50%';
    st.transform = 'translate(' + ax + ',' + ay + ')';

    const parts = [], faces = [], ghosts = [];
    const makePart = (str, host, isHTML) => {
      const p = el('span', { class: 'bvk-p', parent: host });
      if (chroma) {
        const g1 = el('span', { class: 'bvk-gh bvk-gh1', parent: p, attrs: { 'aria-hidden': 'true' } });
        const g2 = el('span', { class: 'bvk-gh bvk-gh2', parent: p, attrs: { 'aria-hidden': 'true' } });
        if (isHTML) { g1.innerHTML = str; g2.innerHTML = str; } else { g1.textContent = str; g2.textContent = str; }
        ghosts.push([g1, g2]);
      }
      const f = el('span', { class: 'bvk-f', parent: p });
      if (isHTML) f.innerHTML = str; else f.textContent = str;
      parts.push(p); faces.push(f);
    };

    const lines = String(text).split('\n');
    if (split === 'none') {
      const esc = s => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
      makePart(lines.map(esc).join('<br>'), inner, true);
    } else {
      lines.forEach((line, li) => {
        if (li) inner.appendChild(document.createElement('br'));
        line.split(' ').forEach((w, wi) => {
          if (wi) inner.appendChild(document.createTextNode(' '));
          if (!w) return;
          if (split === 'words') makePart(w, inner);
          else { const ws = el('span', { class: 'bvk-w', parent: inner }); for (const ch of Array.from(w)) makePart(ch, ws); }
        });
      });
    }

    // Static decoration: glow / legibility shadow.
    if (o.glow || o.shadow) {
      const g = o.glow, sh = [];
      if (gradKey) {
        if (g) sh.push('drop-shadow(0 0 ' + (size * 0.12).toFixed(1) + 'px ' + g + ')');
        if (o.shadow) sh.push('drop-shadow(0 ' + (size * 0.04).toFixed(1) + 'px ' + (size * 0.12).toFixed(1) + 'px rgba(0,0,0,.55))');
        faces.forEach(f => { f.style.filter = sh.join(' '); });
      } else {
        if (g) sh.push('0 0 ' + (size * 0.14).toFixed(1) + 'px ' + g, '0 0 ' + (size * 0.45).toFixed(1) + 'px ' + g);
        if (o.shadow) sh.push('0 ' + (size * 0.04).toFixed(1) + 'px ' + (size * 0.16).toFixed(1) + 'px rgba(0,0,0,.6)');
        faces.forEach(f => { f.style.textShadow = sh.join(','); });
      }
    }
    if (gradKey) {
      const layers = (o.sheen === false ? '' : SHEEN_IMG + ',') + GRAD[gradKey].img;
      faces.forEach(f => { f.style.backgroundImage = layers; });
    }

    const h = {
      el: wrap, inner, parts, faces, ghosts, text: String(text), size, cls, split,
      grad: gradKey, sheen: !!gradKey && o.sheen !== false, chroma, chromaPx: typeof o.chroma === 'number' ? o.chroma : size * 0.07,
      fit: o.fit || 0, seed: o.seed != null ? o.seed : seedOf(String(text)),
      _m: null, _style: null, _order: {}, _vis: true
    };
    measure(h);              // measured immediately when laid out (roots are displayed during build)
    return h;
  }

  // Layout metrics (lazily cached; offsets ignore transforms so this is stable).
  function measure(h) {
    if (h._m) return h._m;
    const inner = h.inner;
    if (!inner.isConnected || inner.offsetParent === null) return null;
    let W = inner.offsetWidth;
    if (!W) return null;
    if (h.fit && W > h.fit) {                 // shrink to fit (deterministic: depends on fonts only)
      h.size = h.size * h.fit / W;
      inner.style.fontSize = h.size + 'px';
      h.chromaPx = h.chromaPx * h.fit / W;
      W = inner.offsetWidth;
    }
    const H = inner.offsetHeight;
    const pos = h.parts.map(p => ({ x: p.offsetLeft, y: p.offsetTop, w: p.offsetWidth, h: p.offsetHeight }));
    h._m = { W, H, pos, gw: Math.max(W, 240) * 1.6, sw: Math.max(W, 240) * 3 };
    if (h.grad) {
      const m = h._m, sizes = (h.sheen ? m.sw + 'px ' + H + 'px,' : '') + m.gw + 'px ' + H + 'px';
      h.faces.forEach(f => { f.style.backgroundSize = sizes; });
      paintText(h, 0);
    }
    return h._m;
  }

  // Align + animate the gradient fill across all parts (continuous over the line).
  function paintText(h, local) {
    if (!h.grad) return;
    const m = measure(h); if (!m) return;
    const moving = GRAD[h.grad].move;
    const shiftA = moving ? (local * m.gw * 0.1) % m.gw : 0;          // aurora drifts ~1 cycle / 10 s
    const shiftS = ((local * m.W * 0.55) % m.sw + m.sw) % m.sw - m.sw * 0.35; // sheen crosses every ~5 s
    for (let i = 0; i < h.faces.length; i++) {
      const p = m.pos[i];
      const a = (-p.x + shiftA).toFixed(1) + 'px ' + (-p.y) + 'px';
      const v = h.sheen ? (-p.x + shiftS).toFixed(1) + 'px ' + (-p.y) + 'px,' + a : a;
      const f = h.faces[i];
      if (f._bp !== v) { f.style.backgroundPosition = v; f._bp = v; }
    }
  }

  function orderRanks(h, mode, n) {
    mode = mode || 'ltr';
    if (h._order[mode]) return h._order[mode];
    let r;
    if (mode === 'rtl') r = h.parts.map((_, i) => n - 1 - i);
    else if (mode === 'center') r = h.parts.map((_, i) => Math.abs(i - (n - 1) / 2));
    else if (mode === 'edges') r = h.parts.map((_, i) => (n - 1) / 2 - Math.abs(i - (n - 1) / 2));
    else if (mode === 'random') {
      const R = rng(h.seed), idx = h.parts.map((_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      r = new Array(n); idx.forEach((pi, k) => { r[pi] = k; });
    } else r = h.parts.map((_, i) => i);
    return (h._order[mode] = r);
  }

  function writePart(p, tr, op, fl) {
    if (p._tr !== tr) { p.style.transform = tr; p._tr = tr; }
    if (p._op !== op) { p.style.opacity = op; p._op = op; }
    if (p._fl !== fl) { p.style.filter = fl; p._fl = fl; }
  }

  const DEF = {
    rise:  { stagger: 0.028, dur: 0.62 },
    blur:  { stagger: 0.022, dur: 0.8 },
    scale: { stagger: 0.02,  dur: 0.6 },
    slam:  { stagger: 0,     dur: 0.6 },
    type:  { stagger: 0.045, dur: 0 },
    wipe:  { stagger: 0,     dur: 0.75 }
  };
  const SLAM_HIT = 0.42;   // fraction of dur at which a slam lands

  function animText(h, local, inAt = 0, outAt = Infinity, o = {}) {
    if (!h || !h.parts) return { p: 0, q: 0, impact: inAt, landed: false };
    const style = DEF[o.style] ? o.style : 'rise';
    const d = DEF[style];
    const n = h.parts.length;
    const stagger = o.stagger != null ? o.stagger : d.stagger;
    const dur = o.dur != null ? o.dur : d.dur;
    const outStyle = o.outStyle || (style === 'type' || style === 'wipe' ? style : style === 'slam' ? 'slam' : style === 'blur' ? 'blur' : style === 'scale' ? 'scale' : 'rise');
    const outDur = o.outDur != null ? o.outDur : Math.max(0.18, Math.min(0.45, (dur || 0.4) * 0.65));
    const stagOut = o.outStagger != null ? o.outStagger : (outStyle === 'type' ? Math.max(0.012, stagger * 0.4) : stagger * 0.5);
    const hasOut = isFinite(outAt);
    const size = h.size;
    const ranks = orderRanks(h, o.order, n);
    const maxRank = n > 1 ? Math.max.apply(null, ranks) : 0;
    // slam: the (first) hit; everything else: when the last part has landed
    const impact = style === 'slam' ? inAt + dur * SLAM_HIT : inAt + maxRank * stagger + (dur || 0);
    const m = measure(h);

    // Style switch: reset per-part caches and kit decorations. Parts that land
    // together (stagger 0) scale about the block centre so they move as one unit.
    const unit = stagger === 0 && (style === 'slam' || style === 'scale' || style === 'blur');
    const okey = style + (unit ? ':u' : '') + (m ? ':m' : '');
    if (h._style !== okey) {
      h._style = okey;
      h.parts.forEach((p, i) => {
        p._tr = p._op = p._fl = null;
        if (unit && m) {
          const q = m.pos[i];
          p.style.transformOrigin = (m.W / 2 - q.x).toFixed(1) + 'px ' + (m.H / 2 - q.y).toFixed(1) + 'px';
        } else p.style.transformOrigin = style === 'rise' ? '50% 90%' : '50% 55%';
      });
      h.inner.style.clipPath = ''; h._clip = '';
      if (h._edge) h._edge.style.opacity = 0;
      if (h._caret) h._caret.style.opacity = 0;
    }

    // Whole block hidden outside [inAt, outAt).
    const vis = local >= inAt && local < outAt;
    if (vis !== h._vis) { h.inner.style.visibility = vis ? '' : 'hidden'; h._vis = vis; }
    const inEnd = inAt + maxRank * stagger + (dur || 0);
    if (!vis) return { p: local >= inAt ? 1 : 0, q: local >= outAt ? 1 : 0, impact, landed: local >= impact };

    paintText(h, local);

    const caPx = o.chroma != null ? o.chroma : h.chromaPx;
    let lastVisible = -1;

    // Whole-block wipe (clip-path) with a glowing leading edge.
    if (style === 'wipe' || outStyle === 'wipe') {
      const e = style === 'wipe' ? ease.inOutCubic(dur > 0 ? (local - inAt) / dur : 1) : 1;
      const qw = outStyle === 'wipe' && hasOut ? ease.inOutCubic((local - (outAt - outDur)) / outDur) : 0;
      if (!h._edge) h._edge = el('div', { class: 'bvk-edge', parent: h.inner });
      let clip = '';
      if (e < 1) clip = 'inset(-0.3em calc(' + ((1 - e) * 100).toFixed(2) + '% + ' + ((1 - e) * 0.6 - 0.3).toFixed(3) + 'em) -0.3em -0.3em)';
      else if (qw > 0) clip = 'inset(-0.3em -0.3em -0.3em calc(' + (qw * 100).toFixed(2) + '% + ' + (qw * 0.6 - 0.3).toFixed(3) + 'em))';
      if (h._clip !== clip) { h.inner.style.clipPath = clip; h._clip = clip; }
      const edgeX = e < 1 ? e : qw;
      const edgeO = e < 1 ? Math.sin(PI * e) : (qw > 0 && qw < 1 ? Math.sin(PI * qw) : 0);
      h._edge.style.left = (edgeX * 100).toFixed(2) + '%';
      h._edge.style.opacity = edgeO.toFixed(3);
    }

    for (let i = 0; i < n; i++) {
      const k = ranks[i];
      const t0 = inAt + k * stagger;
      const p = dur > 0 ? clamp((local - t0) / dur) : (local >= t0 ? 1 : 0);
      let tx = 0, ty = 0, s = 1, blur = 0, op = 1, rx = 0, ca = 0;

      // ── in ──
      if (style === 'rise') {
        const e = ease.outBack(p, 1.45), eo = ease.outCubic(p);
        ty = (1 - e) * 0.6; s = 0.86 + 0.14 * eo; rx = (1 - eo) * 48;
        blur = (1 - eo) * Math.min(14, size * 0.07); op = ease.outQuad(p * 2.2); ca = 1 - eo;
      } else if (style === 'blur') {
        const eo = ease.outCubic(p);
        tx = (k - maxRank / 2) * (1 - eo) * 0.14;           // tracking-in from centre
        s = 1.12 - 0.12 * eo; blur = (1 - eo) * Math.min(28, size * 0.16);
        op = ease.inOutSine(p * 1.4); ca = (1 - eo) * 0.7;
      } else if (style === 'scale') {
        const e = ease.outExpo(p);
        s = 1.4 - 0.4 * e; blur = (1 - e) * Math.min(12, size * 0.07);
        op = ease.outQuad(p * 3); ca = 1 - e;
      } else if (style === 'slam') {
        if (p < SLAM_HIT) {
          const u = p / SLAM_HIT;
          s = 3 - 2 * ease.inQuad(u); op = clamp(u * 2.5); ca = 1;   // no blur: filters raster at 1x under scale
        } else {
          const u = (p - SLAM_HIT) / (1 - SLAM_HIT);
          s = 1 - 0.14 * Math.exp(-3 * u) * Math.sin(3 * PI * u);   // squash + settle, exactly 1 at u=1
          ca = Math.pow(1 - u, 2) * 0.75;
        }
      } else if (style === 'type') {
        op = p >= 1 ? 1 : 0;
      } else if (style === 'wipe') {
        const e = ease.outCubic(dur > 0 ? (local - inAt) / dur : 1);
        tx = (1 - e) * -0.06; ca = (1 - e) * 0.8;
      }

      // ── out ──
      if (hasOut && outStyle !== 'wipe') {
        const rk = outStyle === 'type' ? (maxRank - k) : k;           // backspace removes the end first
        const end = outAt - (maxRank - rk) * stagOut;
        if (outStyle === 'type') { if (local >= end - (stagOut || 0.001)) op = 0; }
        else {
          const q = ease.inCubic((local - (end - outDur)) / outDur);
          if (q > 0) {
            if (outStyle === 'blur') { blur += q * Math.min(28, size * 0.14); s *= 1 + 0.08 * q; op *= 1 - q; }
            else if (outStyle === 'scale') { s *= 1 - 0.18 * q; blur += q * 4; op *= 1 - q; }
            else if (outStyle === 'slam') { s *= 1 + 0.6 * q; op *= 1 - q; ca = Math.max(ca, q); }
            else if (outStyle === 'fade') { op *= 1 - q; }
            else if (outStyle === 'drop') { ty += q * 0.5; op *= 1 - q; blur += q * 3; }
            else { ty -= q * 0.42; blur += q * Math.min(12, size * 0.06); op *= 1 - q; ca = Math.max(ca, q * 0.6); }
          }
        }
      }

      if (op > 0.001 && i > lastVisible) lastVisible = i;
      const part = h.parts[i];
      let tr = '';
      if (tx || ty) tr += 'translate3d(' + tx.toFixed(4) + 'em,' + ty.toFixed(4) + 'em,0) ';
      if (rx) tr += 'perspective(' + (size * 5).toFixed(0) + 'px) rotateX(' + rx.toFixed(2) + 'deg) ';
      if (s !== 1) tr += 'scale(' + s.toFixed(4) + ')';
      writePart(part, tr || 'none', op <= 0.001 ? '0' : op >= 0.999 ? '1' : op.toFixed(3), blur > 0.6 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none');

      if (h.chroma) {
        const dpx = ca * caPx, g = h.ghosts[i];
        const go = dpx > 0.3 ? Math.min(1, ca * 3) * 0.9 : 0;
        const key = dpx.toFixed(1) + '|' + go.toFixed(2);
        if (g._k !== key) {
          g._k = key;
          g[0].style.transform = 'translate3d(' + (-dpx).toFixed(1) + 'px,' + (-dpx * 0.22).toFixed(1) + 'px,0)';
          g[1].style.transform = 'translate3d(' + dpx.toFixed(1) + 'px,' + (dpx * 0.22).toFixed(1) + 'px,0)';
          g[0].style.opacity = g[1].style.opacity = go.toFixed(2);
        }
      }
    }

    // Typewriter caret (positioned from measured layout, blinks when idle).
    if (style === 'type') {
      if (!h._caret) h._caret = el('span', { class: 'bvk-caret', parent: h.inner });
      const cs = h._caret.style;
      if (o.caretColor && cs.background !== o.caretColor) cs.background = o.caretColor;
      let on = 0;
      if (m && m.pos.length) {
        const typing = local < inEnd;
        const deleting = hasOut && local > outAt - (maxRank + 1) * stagOut - 0.05;
        on = (typing || deleting) ? 1 : (Math.floor((local - inEnd) * 2.2) % 2 === 0 ? 1 : 0);
        const ref = lastVisible >= 0 ? m.pos[lastVisible] : m.pos[0];
        const x = lastVisible >= 0 ? ref.x + ref.w : ref.x;
        cs.transform = 'translate3d(' + (x + size * 0.04).toFixed(1) + 'px,' + (ref.y + ref.h * 0.14).toFixed(1) + 'px,0)';
        cs.height = (ref.h * 0.72).toFixed(1) + 'px';
        cs.width = Math.max(2, size * 0.5).toFixed(1) + 'px';
      }
      cs.opacity = on ? '0.9' : '0';
    }

    const pIn = inEnd > inAt ? clamp((local - inAt) / (inEnd - inAt)) : (local >= inAt ? 1 : 0);
    const qOut = hasOut ? clamp((local - (outAt - outDur - maxRank * stagOut)) / Math.max(1e-6, outDur + maxRank * stagOut)) : 0;
    return { p: pIn, q: qOut, impact, landed: local >= impact };
  }

  /* ── 8. Numbers ──────────────────────────────────────────────────────────── */
  const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function fmtInt(n) {
    const v = Math.round(+n || 0);
    return (v < 0 ? '-' : '') + group(String(Math.abs(v)));
  }
  function fmtEUR(n, decimals = 0) {
    n = +n || 0;
    const parts = Math.abs(n).toFixed(decimals).split('.');
    return (n < 0 ? '-' : '') + '€' + group(parts[0]) + (parts[1] ? '.' + parts[1] : '');
  }

  // Number ticker: eases from `from` to `to` over local time [a,b].
  function countUp(e, local, a, b, from, to, fmt) {
    const v = lerp(from, to, ease.outCubic(range(local, a, b)));
    const f = typeof fmt === 'function' ? fmt : fmt === 'eur' ? fmtEUR : fmtInt;
    const s = f(v);
    if (e && e._bvc !== s) { e.textContent = s; e._bvc = s; }
    return v;
  }

  /* ── 9. Camera shake ─────────────────────────────────────────────────────── */
  function shake(local, amp, seed = 1, decay = 0, freq = 14) {
    if (local < 0 || !amp) return { x: 0, y: 0, r: 0 };
    const a = amp * (decay > 0 ? Math.exp(-decay * local) : 1);
    if (Math.abs(a) < 0.01) return { x: 0, y: 0, r: 0 };
    const f = local * freq, sd = seedOf(seed);
    return {
      x: a * (noise(f, sd) * 0.8 + noise(f * 2.3, sd + 7) * 0.2),
      y: a * (noise(f, sd + 13) * 0.8 + noise(f * 2.1, sd + 17) * 0.2),
      r: a * 0.035 * noise(f * 0.8, sd + 29)
    };
  }

  /* ── 10. Aurora (canvas ribbons, additive) ───────────────────────────────── */
  function stageW() { return (window.BV && window.BV.W) || 1920; }
  function stageH() { return (window.BV && window.BV.H) || 1080; }

  function aurora(parent, o = {}) {
    const W = o.W || stageW(), H = o.H || stageH();
    const res = o.res || 0.5;
    const cw = Math.max(2, Math.round(W * res)), chh = Math.max(2, Math.round(H * res));
    const canvas = el('canvas', { class: 'bvk-aurora', parent });
    canvas.width = cw; canvas.height = chh;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (o.blend) canvas.style.mixBlendMode = o.blend;
    const ctx = canvas.getContext('2d');
    const R = rng(o.seed != null ? o.seed : 7);
    const portrait = H > W;
    const unit = Math.min(W, H);

    // Ping-pong palette cycle so hue drift is seamless (violet..mint..violet).
    const pal = (o.palette || AURORA).map(hexRGB);
    const cyc = pal.length > 2 ? pal.concat(pal.slice(1, -1).reverse()) : pal.concat([pal[0]]);
    const palAt = u => {
      u = fract(u); const f = u * cyc.length, i = Math.floor(f);
      return mixRGB(cyc[i % cyc.length], cyc[(i + 1) % cyc.length], f - i);
    };

    // Pre-built unit-space gradients (reused every frame via setTransform).
    const K = 48, strip = [], blob = [];
    for (let k = 0; k < K; k++) {
      const c = palAt(k / K), hi = mixRGB(c, WHITE, 0.5);
      const g = ctx.createLinearGradient(0, 0.14, 0, -1);    // y=+0.14 below baseline -> y=-1 top of curtain
      g.addColorStop(0, rgbStr(c, 0));
      g.addColorStop(0.07, rgbStr(c, 0.32));
      g.addColorStop(0.123, rgbStr(hi, 1));                 // bright lower hem at the baseline
      g.addColorStop(0.2, rgbStr(c, 0.82));
      g.addColorStop(0.45, rgbStr(c, 0.4));
      g.addColorStop(0.75, rgbStr(c, 0.13));
      g.addColorStop(1, rgbStr(c, 0));
      strip.push(g);
      const b = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      b.addColorStop(0, rgbStr(c, 1)); b.addColorStop(0.45, rgbStr(c, 0.35)); b.addColorStop(1, rgbStr(c, 0));
      blob.push(b);
    }

    const nR = o.ribbons || (portrait ? 5 : 4);
    const yC = o.y != null ? o.y : (portrait ? 0.36 : 0.5);
    const spread = o.spread != null ? o.spread : (portrait ? 0.42 : 0.34);
    const hMul = o.height || 1;
    const ribbons = [];
    for (let r = 0; r < nR; r++) {
      ribbons.push({
        base: yC + (nR > 1 ? (r / (nR - 1) - 0.5) : 0) * spread + (R() - 0.5) * 0.06,
        amp: unit * (0.05 + R() * 0.07),
        k1: (1.1 + R() * 1.5) * TAU / W, k2: (2.4 + R() * 2.8) * TAU / W,
        w1: 0.16 + R() * 0.22, w2: -(0.22 + R() * 0.3),
        p1: R() * TAU, p2: R() * TAU,
        kE: (0.7 + R() * 0.9) * TAU / W, wE: (R() - 0.5) * 0.5, pE: R() * TAU,
        height: unit * (0.24 + R() * 0.2) * hMul,
        alpha: 0.38 + R() * 0.3,
        hue: R(), hueSpan: 0.3 + R() * 0.35, hueSpeed: 0.015 + R() * 0.025,
        rs: 100 + Math.floor(R() * 1e6), rf: (0.018 + R() * 0.016) * (1920 / W), rd: (R() - 0.5) * 0.6,
        lean: (R() - 0.5) * 0.28
      });
    }
    const N = o.strips || 150, sw = W / N;

    function draw(t, intensity = 1, hueShift = 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cw, chh);
      if (!(intensity > 0.001)) return;
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < ribbons.length; r++) {
        const rb = ribbons[r];
        // Broad soft glow under each curtain (light leak).
        for (let b = 0; b < 2; b++) {
          const bx = W * (0.28 + 0.44 * b) + Math.sin(t * 0.13 + rb.p1 + b * 2.1) * W * 0.12;
          const by = H * rb.base + rb.amp * Math.sin(rb.k1 * bx + rb.w1 * t + rb.p1) - rb.height * 0.3;
          const hi = Math.floor(fract(rb.hue + hueShift + (bx / W) * rb.hueSpan + t * rb.hueSpeed) * K) % K;
          ctx.globalAlpha = Math.min(1, 0.11 * intensity * rb.alpha);
          ctx.fillStyle = blob[hi];
          ctx.setTransform(rb.height * 1.9 * res, 0, 0, rb.height * 1.05 * res, bx * res, by * res);
          ctx.fillRect(-1, -1, 2, 2);
        }
        // Curtain: vertical strips with a hemmed baseline and drifting rays.
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * sw, xr = x / W;
          const y = H * rb.base + rb.amp * (Math.sin(rb.k1 * x + rb.w1 * t + rb.p1) * 0.65 +
                    Math.sin(rb.k2 * x + rb.w2 * t + rb.p2) * 0.35 + noise(x * 0.0021 + t * 0.09, rb.rs) * 0.5);
          const r1 = 0.5 + 0.5 * noise(x * rb.rf + t * rb.rd, rb.rs + 1);
          const r2 = 0.5 + 0.5 * noise(x * rb.rf * 3.3 - t * 0.35, rb.rs + 2);
          const ray = 0.22 + 0.78 * (r1 * r1 * 0.7 + r2 * 0.3);
          const fold = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(rb.kE * x + rb.wE * t + rb.pE));
          const a = intensity * rb.alpha * ray * fold;
          if (a < 0.004) continue;
          const hgt = rb.height * (0.55 + 0.65 * r1);
          const hi = Math.floor(fract(rb.hue + hueShift + xr * rb.hueSpan + t * rb.hueSpeed) * K) % K;
          ctx.globalAlpha = a > 1 ? 1 : a;
          ctx.fillStyle = strip[hi];
          ctx.setTransform(sw * res, 0, rb.lean * hgt * res, hgt * res, (x - sw / 2) * res, y * res);
          ctx.fillRect(0, -1, 1, 1.14);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    return { canvas, ctx, draw, W, H, res };
  }

  /* ── 11. Particles (analytic; position = f(p0, v, g, drag, age)) ─────────── */
  const spriteCache = new Map();
  function glowSprite(hex) {
    let s = spriteCache.get(hex);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    const c = s.getContext('2d'), col = hexRGB(hex);
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, rgbStr(mixRGB(col, WHITE, 0.35), 1));
    g.addColorStop(0.4, rgbStr(col, 0.42));
    g.addColorStop(1, rgbStr(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    spriteCache.set(hex, s);
    return s;
  }
  const lighten = hex => { const c = mixRGB(hexRGB(hex), WHITE, 0.6); return rgbStr(c, 1); };
  const pick2 = (v, d) => (Array.isArray(v) ? v : v != null ? [v, v] : d);
  const DEG = PI / 180;

  // Shared closed-form motion + renderer.
  function physics(p, age, g, k, out) {
    if (k > 1e-4) {
      const e = Math.exp(-k * age), f = (1 - e) / k;
      out.x = p.x + p.vx * f; out.y = p.y + p.vy * f + (g / k) * (age - f);
      out.vx = p.vx * e; out.vy = p.vy * e + (g / k) * (1 - e);
    } else {
      out.x = p.x + p.vx * age; out.y = p.y + p.vy * age + 0.5 * g * age * age;
      out.vx = p.vx; out.vy = p.vy + g * age;
    }
    return out;
  }

  function renderParticle(ctx, p, age, cfg, st, base) {
    const u = age / p.life;
    if (u < 0 || u >= 1) return;
    physics(p, age, cfg.g, cfg.k, st);
    let x = st.x, y = st.y;
    if (cfg.sway) x += cfg.sway[0] * Math.sin(TAU * cfg.sway[1] * age + p.ph);
    if (cfg.turb) { x += cfg.turb * noise(age * 1.3 + p.ph * 10, p.seed); y += cfg.turb * noise(age * 1.1 + p.ph * 10, p.seed + 5); }
    const fin = cfg.fadeIn > 0 ? Math.min(1, age / cfg.fadeIn) : 1;
    let a = fin * cfg.alpha;
    a *= p.shape === 'shard' ? 1 - smoothstep(0.62, 1, u) : Math.pow(1 - u, cfg.fadePow);
    if (cfg.twinkle) a *= 1 - cfg.twinkle * (0.5 + 0.5 * Math.sin(age * p.tw + p.ph * 6));
    if (a < 0.004) return;
    const col = cfg.colors[p.col], sz = p.size;

    if (p.shape === 'spark') {
      let dx = st.vx * cfg.tail, dy = st.vy * cfg.tail;
      const L = Math.hypot(dx, dy), maxL = sz * 46;
      if (L > maxL) { dx *= maxL / L; dy *= maxL / L; }
      const w = sz * (1 - 0.55 * u);
      if (L < sz * 0.8) { drawSprite(ctx, col, x, y, w * 2.4, a); return; }
      ctx.globalCompositeOperation = cfg.blend || 'lighter';
      ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.3; ctx.strokeStyle = col; ctx.lineWidth = w * 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx, y - dy); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = cfg.cores[p.col]; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 0.85, y - dy * 0.85); ctx.stroke();
    } else if (p.shape === 'dot') {
      drawSprite(ctx, col, x, y, sz * (1 - 0.45 * u) * 2.2, a);
    } else if (p.shape === 'star') {
      const tw = 0.75 + 0.25 * Math.sin(age * p.tw + p.ph * 6);
      drawSprite(ctx, col, x, y, sz * 2.6 * tw, a * 0.7);
      const L = sz * 1.7 * tw, w = L * 0.16, rot = p.rot + p.spin * age * 0.15;
      ctx.globalCompositeOperation = cfg.blend || 'lighter';
      ctx.globalAlpha = a; ctx.fillStyle = cfg.cores[p.col];
      ctx.setTransform(base); ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(0, -L); ctx.lineTo(w, -w); ctx.lineTo(L, 0); ctx.lineTo(w, w);
      ctx.lineTo(0, L); ctx.lineTo(-w, w); ctx.lineTo(-L, 0); ctx.lineTo(-w, -w); ctx.closePath();
      ctx.fill();
      ctx.setTransform(base);
    } else if (p.shape === 'shard') {
      const tum = Math.cos(p.tw * age + p.ph * TAU);
      ctx.globalCompositeOperation = cfg.blend || 'source-over';
      ctx.setTransform(base); ctx.translate(x, y); ctx.rotate(p.rot + p.spin * age); ctx.scale(0.15 + 0.85 * Math.abs(tum), 1);
      ctx.beginPath();
      const v = p.verts; ctx.moveTo(v[0], v[1]);
      for (let j = 2; j < v.length; j += 2) ctx.lineTo(v[j], v[j + 1]);
      ctx.closePath();
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill();
      const glint = Math.pow(Math.max(0, tum), 10);
      if (glint > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * glint * 0.95; ctx.fillStyle = '#FFFFFF'; ctx.fill(); }
      ctx.setTransform(base);
    }
  }

  function drawSprite(ctx, col, x, y, r, a) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
  }

  function particleCfg(o) {
    const colors = (o.colors && o.colors.length) ? o.colors.slice() : ['#FFFFFF', '#19D3FF', '#7C5CFF', '#46E6A6'];
    return {
      g: o.gravity || 0, k: o.drag || 0, tail: o.tail != null ? o.tail : 0.045,
      alpha: o.alpha != null ? o.alpha : 1, fadeIn: o.fadeIn != null ? o.fadeIn : 0.04,
      fadePow: o.fadePow != null ? o.fadePow : 1.4, twinkle: o.twinkle || 0,
      sway: o.sway || null, turb: o.turb || 0, blend: o.blend || null,
      colors, cores: colors.map(lighten)
    };
  }

  function makeParticle(R, o, cfg, shapes, i) {
    const a = pick2(o.angle, [0, 360]), sp = pick2(o.speed, [200, 600]);
    const lf = pick2(o.life, [0.6, 1.4]), sz = pick2(o.size, [2, 5]), dl = pick2(o.delay, [0, 0]);
    const spread = o.spread || 0, spreadY = o.spreadY != null ? o.spreadY : spread;
    const ang = lerp(a[0], a[1], R()) * DEG;
    const v = lerp(sp[0], sp[1], Math.pow(R(), o.speedBias || 1));
    const rr = Math.sqrt(R()), th = R() * TAU;
    const p = {
      x: (o.x || 0) + Math.cos(th) * rr * spread + (o.w ? (R() - 0.5) * o.w : 0),
      y: (o.y || 0) + Math.sin(th) * rr * spreadY + (o.h ? (R() - 0.5) * o.h : 0),
      vx: Math.cos(ang) * v + (o.vx || 0), vy: Math.sin(ang) * v + (o.vy || 0),
      life: lerp(lf[0], lf[1], R()), size: lerp(sz[0], sz[1], R()),
      col: Math.floor(R() * cfg.colors.length), shape: shapes[Math.floor(R() * shapes.length)],
      rot: R() * TAU, spin: (R() - 0.5) * 2 * (o.spin != null ? o.spin : 9), tw: 3 + R() * 9, ph: R(),
      delay: lerp(dl[0], dl[1], R()), seed: (i * 7919) | 0, verts: null
    };
    if (p.shape === 'shard') {
      const nv = 3 + Math.floor(R() * 2), vs = [];
      for (let j = 0; j < nv; j++) {
        const ta = (j / nv) * TAU + (R() - 0.5) * 0.9, rad = p.size * (0.55 + R() * 0.8);
        vs.push(Math.cos(ta) * rad * 1.3, Math.sin(ta) * rad * 0.8);
      }
      p.verts = vs;
    }
    return p;
  }

  // One-shot analytic burst. draw(ctx, local): local = seconds since the burst.
  function particles(canvas, o = {}) {
    const R = rng(o.seed != null ? o.seed : 1);
    const cfg = particleCfg(o);
    const shapes = Array.isArray(o.shape) ? o.shape : [o.shape || 'spark'];
    const n = o.count != null ? o.count : 120;
    const list = [];
    for (let i = 0; i < n; i++) list.push(makeParticle(R, o, cfg, shapes, i));
    const st = { x: 0, y: 0, vx: 0, vy: 0 };
    return {
      particles: list,
      draw(ctx, local) {
        if (local < 0) return;
        const base = ctx.getTransform(), gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
        for (let i = 0; i < list.length; i++) renderParticle(ctx, list[i], local - list[i].delay, cfg, st, base);
        ctx.setTransform(base); ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
      }
    };
  }

  // Continuous emitter: particle i is born at (i + jitter)/rate; everything closed-form.
  // opts: rate, seed, x,y (origin) + spread/spreadY or w,h (spawn box), speed, angle, gravity, drag,
  //       life, size, colors, shape, sway:[ampPx,freqHz], turb, twinkle, prewarm (s, default max life), max.
  function emitter(canvas, o = {}) {
    const seed = o.seed != null ? o.seed : 3;
    const rate = Math.max(0.01, o.rate || 20);
    const cfg = particleCfg(o);
    const shapes = Array.isArray(o.shape) ? o.shape : [o.shape || 'dot'];
    const lf = pick2(o.life, [2, 4]);
    const prewarm = o.prewarm != null ? o.prewarm : lf[1];
    const max = o.max != null ? o.max : Infinity;
    const cache = new Map();
    const st = { x: 0, y: 0, vx: 0, vy: 0 };
    const get = i => {
      let p = cache.get(i);
      if (!p) {
        p = makeParticle(rng(seedOf(seed) * 31 + i * 2654435761), o, cfg, shapes, i);
        p.birth = (i + hash(i, seed) * 0.9) / rate;
        if (cache.size > 2048) cache.clear();
        cache.set(i, p);
      }
      return p;
    };
    return {
      draw(ctx, local) {
        const T = local + prewarm;
        if (T < 0) return;
        const i0 = Math.max(0, Math.floor((T - lf[1]) * rate) - 1), i1 = Math.min(max - 1, Math.floor(T * rate));
        const base = ctx.getTransform(), gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
        for (let i = i0; i <= i1; i++) {
          const p = get(i);
          renderParticle(ctx, p, T - p.birth, cfg, st, base);
        }
        ctx.setTransform(base); ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
      }
    };
  }

  /* ── 12. Light sweep ─────────────────────────────────────────────────────── */
  function sweep(target, local, a, b, o = {}) {
    if (!target) return 0;
    const isImg = target.tagName === 'IMG';
    let s = target._bvSweep;
    if (!s) {
      const ov = el('div', { class: 'bvk-sweep' });
      const band = el('div', { class: 'bvk-sweep-band', parent: ov });
      if (isImg) {
        if (!target.parentElement) return 0;
        target.parentElement.insertBefore(ov, target.nextSibling);
        ov.style.borderRadius = getComputedStyle(target).borderRadius;
      } else {
        if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
        target.appendChild(ov);
      }
      s = target._bvSweep = { ov, band, key: '', vis: false, mask: '' };
    }
    const p = range(local, a, b);
    if (p <= 0 || p >= 1) {
      if (s.vis) { s.ov.style.visibility = 'hidden'; s.vis = false; }
      return p;
    }
    const angle = o.angle != null ? o.angle : 20, w = o.width != null ? o.width : 0.18;
    const color = o.color || 'rgba(255,255,255,.55)', soft = o.soft != null ? o.soft : 1;
    const key = angle + '|' + w + '|' + color + '|' + (o.blend || 'screen') + '|' + soft;
    if (s.key !== key) {
      const half = (w / 3) * 50, halo = Math.min(49.9, half * (1 + soft * 1.6));
      s.band.style.background = 'linear-gradient(' + (90 + angle) + 'deg,transparent ' + (50 - halo).toFixed(2) + '%,' +
        rgbaish(color, 0.25) + ' ' + (50 - half).toFixed(2) + '%,' + color + ' 50%,' +
        rgbaish(color, 0.25) + ' ' + (50 + half).toFixed(2) + '%,transparent ' + (50 + halo).toFixed(2) + '%)';
      s.ov.style.mixBlendMode = o.blend || 'screen';
      s.key = key;
    }
    const mask = o.mask || (isImg ? target.currentSrc || target.src : '');
    if (mask !== s.mask) {
      const v = mask ? 'url("' + mask + '")' : '';
      s.ov.style.webkitMaskImage = v; s.ov.style.maskImage = v; s.mask = mask;
    }
    if (isImg) {          // follow the image's box + inline transform
      const ov = s.ov.style;
      ov.left = target.offsetLeft + 'px'; ov.top = target.offsetTop + 'px';
      ov.width = target.offsetWidth + 'px'; ov.height = target.offsetHeight + 'px';
      ov.transform = target.style.transform; ov.transformOrigin = target.style.transformOrigin;
    }
    const e = ease.inOutSine(p);
    const slant = Math.abs(Math.tan(angle * DEG)) * 0.5;
    const cx = lerp(-0.5 - w - slant, 1.5 + w + slant, e);
    s.band.style.transform = 'translate3d(' + (((cx - 0.5) / 3) * 100).toFixed(3) + '%,0,0)';
    s.ov.style.opacity = o.intensity != null ? o.intensity : 1;
    if (!s.vis) { s.ov.style.visibility = 'visible'; s.vis = true; }
    return p;
  }
  // Soft companion colour for the sweep halo (same hue, lower alpha).
  function rgbaish(color, k) {
    const m = String(color).match(/rgba?\(([^)]+)\)/);
    if (m) { const v = m[1].split(',').map(s => s.trim()); const a = v[3] != null ? +v[3] : 1; return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + (a * k).toFixed(3) + ')'; }
    if (String(color)[0] === '#') return rgba(color, k);
    return 'transparent';
  }

  /* ── 13. Export ──────────────────────────────────────────────────────────── */
  window.BVKit = {
    // math
    clamp, lerp, invLerp, range, env, smoothstep, fract, ease, spring,
    // randomness
    rng, hash, noise, fbm,
    // dom
    el, setT,
    // type
    superText, animText, paintText, measureText: measure, countUp,
    // fx
    aurora, particles, emitter, sweep, shake,
    // format / colour
    fmtEUR, fmtInt, rgba, hexRGB,
    FONT, AURORA
  };
})();
