/* ============================================================================
   art-fields.js — window.BVArtFields
   The six coin ILLUSTRATIONS (the coloured art fields) for the Bifrost Vault
   commercial. Loaded BEFORE art.js, which owns the coin frame, metal shading,
   legend band and composition.

   Contract (ARCH.md "Art split"):
     BVArtFields[id] = { metal:'ag'|'au', field(uid), inkMask(uid), relief(uid) }
   - All markup is drawn in a 1000x1000 space, centre (500,500). The visible
     art field is the disc r<=330 (art.js clips it); art may run to r=360.
   - field(uid)   -> SVG markup (no outer <svg>): the full-colour enamel art.
   - inkMask(uid) -> the CONTENTS of a <mask> (luminance; white = colour ink,
                     black = bare metal, grey = translucent ink). Wrap it as
       <mask id="X" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">…</mask>
                     and apply it to the field group. Engraved lines on bare
                     metal are drawn in the field AND whitened in the mask.
   - relief(uid)  -> height map: WHITE shapes on a TRANSPARENT background, height
                     carried by fill-opacity (so it works as SourceAlpha or as
                     luminance). Already softened with a small blur.
   Every id inside the markup is prefixed with uid. Pure functions, deterministic
   (seeded PRNG only), no external resources, no fonts.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  var PI = Math.PI, TAU = PI * 2, D = PI / 180;
  function n(v) { return String(Math.round(v * 10) / 10); }
  function P(x, y) { return n(x) + ',' + n(y); }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function pol(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function poly(pts, close) { return 'M' + pts.map(function (p) { return P(p[0], p[1]); }).join('L') + (close === false ? '' : 'Z'); }
  // Catmull-Rom through points -> cubic Bezier path string
  function smooth(pts, close, k) {
    k = k == null ? 1 : k;
    var m = pts.length; if (m < 2) return '';
    var s = 'M' + P(pts[0][0], pts[0][1]);
    var cnt = close ? m : m - 1;
    for (var i = 0; i < cnt; i++) {
      var p0 = pts[close ? (i - 1 + m) % m : Math.max(i - 1, 0)];
      var p1 = pts[i], p2 = pts[(i + 1) % m];
      var p3 = pts[close ? (i + 2) % m : Math.min(i + 2, m - 1)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6 * k, c1y = p1[1] + (p2[1] - p0[1]) / 6 * k;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6 * k, c2y = p2[1] - (p3[1] - p1[1]) / 6 * k;
      s += 'C' + P(c1x, c1y) + ' ' + P(c2x, c2y) + ' ' + P(p2[0], p2[1]);
    }
    return s + (close ? 'Z' : '');
  }
  // offset outline around a spine (array of [x,y]) with width function w(t) (full width)
  function ribbonPts(spine, w) {
    var L = [], R = [], m = spine.length;
    for (var i = 0; i < m; i++) {
      var a = spine[Math.max(i - 1, 0)], b = spine[Math.min(i + 1, m - 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var nx = -dy / l, ny = dx / l, hw = w(i / (m - 1)) / 2;
      L.push([spine[i][0] + nx * hw, spine[i][1] + ny * hw]);
      R.push([spine[i][0] - nx * hw, spine[i][1] - ny * hw]);
    }
    return { L: L, R: R };
  }
  // 4-point star (concave), r = tip radius
  function star4(x, y, r, waist, rot) {
    waist = waist || 0.16; rot = rot || 0;
    var s = '';
    for (var i = 0; i < 4; i++) {
      var a = rot + i * PI / 2, b = a + PI / 4;
      var t = pol(x, y, r, a), w = pol(x, y, r * waist, b);
      var nt = pol(x, y, r, a + PI / 2);
      if (i === 0) s += 'M' + P(t[0], t[1]);
      s += 'Q' + P(w[0], w[1]) + ' ' + P(nt[0], nt[1]);
    }
    return s + 'Z';
  }
  // crescent = disc(c1,r1) minus disc(c2,r2)
  function crescent(cx, cy, r1, dx, dy, r2) {
    var d = Math.hypot(dx, dy), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
    var px = cx + a * dx / d, py = cy + a * dy / d;
    var i1 = [px - h * dy / d, py + h * dx / d], i2 = [px + h * dy / d, py - h * dx / d];
    return 'M' + P(i1[0], i1[1]) + 'A' + n(r1) + ' ' + n(r1) + ' 0 1 1 ' + P(i2[0], i2[1]) +
      'A' + n(r2) + ' ' + n(r2) + ' 0 0 0 ' + P(i1[0], i1[1]) + 'Z';
  }
  function hex2rgb(h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
  function mix(c1, c2, t) {
    var a = hex2rgb(c1), b = hex2rgb(c2);
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(lerp(a[i], b[i], t)); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function ramp(stops, t) { // stops: [[t,'#hex'],...]
    t = clamp(t, 0, 1);
    for (var i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
      return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
    }
    return stops[stops.length - 1][1];
  }
  function lg(id, x1, y1, x2, y2, stops, extra) {
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"' + (extra || '') + '>' +
      stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') + '</linearGradient>';
  }
  function rg(id, cx, cy, r, stops, extra) {
    return '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '"' + (extra || '') + '>' +
      stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') + '</radialGradient>';
  }
  function blurF(id, sd) {
    return '<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';
  }
  var FULL = '<rect x="0" y="0" width="1000" height="1000" fill="#fff"/>';
  function g(attrs, inner) { return '<g ' + attrs + '>' + inner + '</g>'; }
  function path(d, attrs) { return '<path d="' + d + '" ' + (attrs || '') + '/>'; }
  // relief wrapper: blurred white shapes on transparent
  function reliefWrap(uid, inner, sd) {
    return '<defs>' + blurF(uid + '-rlb', sd == null ? 2.2 : sd) + '</defs><g filter="url(#' + uid + '-rlb)" fill="#fff">' + inner + '</g>';
  }

  /* ---------------------------------------------------------- shared motifs */
  // Elder Futhark rune strokes in a 10x16 box (x 0..10, y 0..16)
  var RUNES = {
    h: 'M0,0V16M10,0V16M0,5L10,11',
    u: 'M0,16V0L10,6V16',
    g: 'M0,0L10,16M10,0L0,16',
    i: 'M5,0V16',
    n: 'M5,0V16M1,5L9,10',
    m: 'M0,0V16M10,0V16M0,0L10,8M10,0L0,8',
    r: 'M0,16V0L8,4L0,8L9,16',
    o: 'M0,16L9,6L5,0L1,6L10,16',
    s: 'M2,0L2,7L8,9L8,16',
    a: 'M2,0V16M2,3L9,7M2,8L9,12',
    d: 'M0,0V16M10,0V16M0,0L10,16M10,0L0,16',
    j: 'M5,0V16M5,4L9,8M5,12L1,8',
    e: 'M0,16V0L5,6L10,0V16',
    t: 'M5,0V16M0,5L5,0L10,5',
    k: 'M8,0L2,8L8,16',
    f: 'M2,0V16M2,4L9,0M2,9L9,5',
    l: 'M2,0V16M2,0L9,5'
  };
  // a ring of runes + dots; returns path data (strokes) and dot circles
  function runeRing(cx, cy, r, word, dotsBetween, size) {
    size = size || 1;
    var glyphs = word.split('');
    var slots = [];
    glyphs.forEach(function (c) { slots.push(c); for (var k = 0; k < dotsBetween; k++) slots.push('.'); });
    var strokes = '', dots = [];
    for (var i = 0; i < slots.length; i++) {
      var a = -PI / 2 + i / slots.length * TAU, c = slots[i];
      if (c === '.' || c === ' ') { var p = pol(cx, cy, r, a); dots.push(p); continue; }
      if (!RUNES[c]) continue;
      var p2 = pol(cx, cy, r, a), deg = a / D + 90;
      strokes += '<path transform="translate(' + P(p2[0], p2[1]) + ') rotate(' + n(deg) + ') scale(' + size + ') translate(-5,-8)" d="' + RUNES[c] + '"/>';
    }
    return { strokes: strokes, dots: dots };
  }

  /* =================================================================== HUGINN
     Odin's ravens crossing a cobalt -> cyan dusk sky; bare-silver crescent moon;
     runic dot ring. */
  // Raven seen from below (gliding), facing +x. opts.wl / opts.wr: wing length
  // factors (banking), opts.sweep: forward/back sweep of the hand (-1..1).
  function raven(opts) {
    opts = opts || {};
    var out = { body: '', feathers: [], lines: '', eye: [76, -5] };
    // body: heavy beak, rounded head, wedge tail
    out.body = 'M112,0Q98,-5 86,-11Q74,-19 58,-14Q44,-21 18,-22Q-22,-25 -58,-14L-110,-31Q-128,-17 -144,0Q-128,17 -110,31L-58,14Q-22,25 18,22Q44,21 58,14Q74,19 86,11Q98,5 112,0Z';
    var lines = '';
    [1, -1].forEach(function (s) {
      var f = s > 0 ? (opts.wl || 1) : (opts.wr || 1);
      var sw = (opts.sweep || 0);
      function W(x, y) { // wing-space point -> local (apply length factor + sweep shear)
        var yy = y * f;
        return [x + sw * (y / 250) * 34 * (y > 120 ? 1 : y / 120), yy * s];
      }
      // fingers (primaries): tip, notch-before
      var tips = [[40, 238], [19, 258], [-3, 266], [-25, 259], [-45, 245], [-62, 224]];
      var notch = [[48, 184], [30, 196], [10, 204], [-11, 203], [-30, 196], [-48, 184]];
      var pts = [];
      var A = W(22, 12), B = W(52, 72), C = W(56, 132);
      var d = 'M' + P(A[0], A[1]) + 'Q' + P(W(50, 30)[0], W(50, 30)[1]) + ' ' + P(B[0], B[1]) + 'Q' + P(W(60, 104)[0], W(60, 104)[1]) + ' ' + P(C[0], C[1]);
      var prev = C;
      for (var i = 0; i < tips.length; i++) {
        var N = W(notch[i][0], notch[i][1]), T = W(tips[i][0], tips[i][1]);
        var Nn = i < tips.length - 1 ? W(notch[i + 1][0], notch[i + 1][1]) : W(-64, 178);
        // into notch
        d += 'L' + P(N[0], N[1]);
        // up the leading side of the finger to a rounded tip and back down the trailing side
        var mx = (N[0] + T[0]) / 2, my = (N[1] + T[1]) / 2;
        var ux = T[0] - N[0], uy = T[1] - N[1], l = Math.hypot(ux, uy); ux /= l; uy /= l;
        var px = -uy, py = ux; // perpendicular, oriented away from the next notch
        if (px * (Nn[0] - N[0]) + py * (Nn[1] - N[1]) > 0) { px = -px; py = -py; }
        var wv = 9.5;
        var c1 = [mx + px * wv * 1.1, my + py * wv * 1.1];
        var tipL = [T[0] + px * wv * 0.55 - ux * 3, T[1] + py * wv * 0.55 - uy * 3];
        var tipR = [T[0] - px * wv * 0.55 - ux * 3, T[1] - py * wv * 0.55 - uy * 3];
        var cap = [T[0] + ux * 6, T[1] + uy * 6];
        d += 'Q' + P(c1[0], c1[1]) + ' ' + P(tipL[0], tipL[1]) + 'Q' + P(cap[0], cap[1]) + ' ' + P(tipR[0], tipR[1]);
        var c2 = [(T[0] + Nn[0]) / 2 - px * wv * 0.3, (T[1] + Nn[1]) / 2 - py * wv * 0.3];
        d += 'Q' + P(c2[0], c2[1]) + ' ' + P(Nn[0], Nn[1]);
        if (i > 0) lines += 'M' + P(lerp(N[0], T[0], 0.18), lerp(N[1], T[1], 0.18)) + 'L' + P(lerp(N[0], T[0], -0.55), lerp(N[1], T[1], -0.55));
      }
      // secondaries: gently scalloped trailing edge back to the body
      var sec = [[-66, 170], [-62, 150], [-70, 134], [-64, 114], [-71, 98], [-64, 80], [-70, 64], [-62, 48], [-66, 34], [-56, 16]];
      for (var j = 0; j < sec.length; j += 2) {
        var p1 = W(sec[j][0], sec[j][1]), p2 = W(sec[j + 1][0], sec[j + 1][1]);
        d += 'Q' + P(p1[0], p1[1]) + ' ' + P(p2[0], p2[1]);
        if (j > 0 && j < 8) { var q = W(sec[j + 1][0] + 4, sec[j + 1][1]), q2 = W(sec[j + 1][0] + 30, sec[j + 1][1] + 4); lines += 'M' + P(q[0], q[1]) + 'L' + P(q2[0], q2[1]); }
      }
      d += 'Z';
      out.feathers.push(d);
      // covert line (struck detail across the wing)
      var k1 = W(46, 150), k2 = W(-10, 120), k3 = W(-40, 30);
      lines += 'M' + P(k1[0], k1[1]) + 'Q' + P(k2[0], k2[1]) + ' ' + P(k3[0], k3[1]);
      var m1 = W(52, 96), m2 = W(10, 70), m3 = W(-16, 22);
      lines += 'M' + P(m1[0], m1[1]) + 'Q' + P(m2[0], m2[1]) + ' ' + P(m3[0], m3[1]);
    });
    lines += 'M-66,0L-132,0M-66,-7L-120,-21M-66,7L-120,21';
    out.lines = lines;
    return out;
  }
  function ravenMarkup(rv, tf, fill) {
    return '<g transform="' + tf + '" fill="' + fill + '">' + path(rv.body) + rv.feathers.map(function (d) { return path(d); }).join('') + '</g>';
  }

  var HUGINN = (function () {
    var MOON = { x: 636, y: 338, r: 84, dx: -32, dy: -22, r2: 76 };
    var RA = { tf: 'translate(436,506) rotate(-36) scale(0.78)', o: { wl: 0.86, wr: 1.0, sweep: 0.35 } };
    var RB = { tf: 'translate(650,344) rotate(-168) scale(0.44)', o: { wl: 1.0, wr: 0.9, sweep: 0.3 } };
    var ravA = raven(RA.o), ravB = raven(RB.o);
    function stars() {
      var r = rng(4120), out = [];
      for (var i = 0; i < 70; i++) {
        var x = 190 + r() * 620, y = 190 + r() * 420, s = 1.5 + Math.pow(r(), 3) * 9;
        var dc = Math.hypot(x - 500, y - 500); if (dc > 300) continue;
        if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r + 26) continue;
        out.push([x, y, s, r()]);
      }
      return out;
    }
    var STARS = stars();
    function pines(seed, y0, x0, x1, hMin, hMax, step) {
      var r = rng(seed), d = '';
      for (var x = x0; x < x1; x += step * (0.7 + r() * 0.6)) {
        var h = lerp(hMin, hMax, r()), w = h * 0.36, by = y0 + r() * 8;
        var tiers = 4;
        for (var k = 0; k < tiers; k++) {
          var ty = by - h + k * h * 0.2, bw = w * (0.45 + k * 0.2), byk = ty + h * 0.42;
          d += 'M' + P(x, ty) + 'L' + P(x + bw, byk) + 'L' + P(x - bw, byk) + 'Z';
        }
        d += 'M' + P(x - 2, by - h * 0.2) + 'H' + n(x + 2) + 'V' + n(by + 4) + 'H' + n(x - 2) + 'Z';
      }
      return d;
    }
    var FAR = [[140, 646], [205, 602], [250, 624], [318, 560], [362, 600], [424, 544], [474, 594], [524, 566], [590, 612], [646, 574], [700, 614], [764, 582], [860, 628]];
    var RIDGE_FAR = poly(FAR.concat([[860, 760], [140, 760]]));
    var FACETS = '', CAPS = '';
    for (var fi = 1; fi < FAR.length - 1; fi += 2) {
      var pk = FAR[fi], vr = FAR[fi + 1], vl = FAR[fi - 1];
      FACETS += poly([pk, vr, [lerp(pk[0], vr[0], 0.55), 720], [pk[0] + 4, 720]]);
      if (pk[1] < 580) { // small snow caps on the tallest peaks (bare silver)
        var a1 = [lerp(pk[0], vl[0], 0.32), lerp(pk[1], vl[1], 0.32)], a2 = [lerp(pk[0], vr[0], 0.3), lerp(pk[1], vr[1], 0.3)];
        CAPS += poly([pk, a2, [lerp(a1[0], a2[0], 0.75), a2[1] - 6], [lerp(a1[0], a2[0], 0.5), a2[1] + 2], [lerp(a1[0], a2[0], 0.25), a1[1] - 5], a1]);
      }
    }
    var RIDGE_MID = smooth([[150, 690], [230, 664], [320, 684], [410, 650], [500, 676], [590, 652], [680, 680], [760, 660], [850, 690], [850, 800], [150, 800]], false) + 'Z';
    var RIDGE_NEAR = smooth([[150, 742], [240, 724], [340, 744], [450, 728], [560, 748], [660, 726], [760, 742], [850, 728], [850, 860], [150, 860]], false) + 'Z';
    var PINES = pines(77, 742, 160, 850, 34, 70, 22);
    var PINES_B = pines(91, 694, 160, 850, 16, 30, 13);
    var RING = runeRing(500, 500, 316, 'huginnmuninn', 3, 0.95);

    function field(u) {
      var defs = lg(u + '-sky', 0, 170, 0, 760, [[0, '#101c63'], [0.28, '#2348c4'], [0.55, '#4D8DFF'], [0.78, '#19D3FF'], [1, '#8EF3FF']]) +
        rg(u + '-halo', MOON.x, MOON.y, 210, [[0, '#E6FBFF', 0.85], [0.35, '#BDF2FF', 0.35], [1, '#9BE9FF', 0]]) +
        rg(u + '-sun', 500, 700, 380, [[0, '#E9FEFF', 0.75], [0.4, '#7DEBFF', 0.25], [1, '#19D3FF', 0]]) +
        lg(u + '-far', 0, 550, 0, 720, [[0, '#2c5fd6'], [1, '#1f43a8']]) +
        lg(u + '-mid', 0, 650, 0, 760, [[0, '#122a85'], [1, '#0c1a5c']]) +
        lg(u + '-near', 0, 720, 0, 840, [[0, '#070f3a'], [1, '#040824']]) +
        rg(u + '-rav', 0, 0, 270, [[0, '#060a1c'], [0.45, '#0a1030'], [0.8, '#16215a'], [1, '#2a3d8f']]) +
        lg(u + '-band', 0, 170, 0, 830, [[0, '#0b1550'], [1, '#081037']]);
      var sky = '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-sky)"/>' +
        '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-sun)"/>' +
        '<circle cx="' + MOON.x + '" cy="' + MOON.y + '" r="210" fill="url(#' + u + '-halo)"/>';
      // engraved horizontal sky lines
      var hl = '';
      for (var y = 176; y < 700; y += 7) hl += 'M140,' + y + 'H860';
      sky += path(hl, 'stroke="#061040" stroke-opacity=".16" stroke-width="1.3" fill="none"');
      // moon halo rings
      var rings = '';
      [96, 118, 146, 182].forEach(function (rr, i) {
        rings += '<circle cx="' + MOON.x + '" cy="' + MOON.y + '" r="' + rr + '" fill="none" stroke="#F2FDFF" stroke-opacity="' + (0.55 - i * 0.11) + '" stroke-width="' + (2.2 - i * 0.35) + '"' + (i % 2 ? ' stroke-dasharray="2 7"' : '') + '/>';
      });
      // moon disc (masked bare later) + earthshine
      var moon = '<circle cx="' + MOON.x + '" cy="' + MOON.y + '" r="' + MOON.r + '" fill="#cfefff" fill-opacity=".22"/>' +
        '<circle cx="' + MOON.x + '" cy="' + MOON.y + '" r="' + MOON.r + '" fill="none" stroke="#e8fbff" stroke-opacity=".5" stroke-width="1.5"/>';
      var land = path(RIDGE_FAR, 'fill="url(#' + u + '-far)"') + path(FACETS, 'fill="#0f2a8c" fill-opacity=".45"') + path(PINES_B, 'fill="#1a3a9a"') +
        path(RIDGE_MID, 'fill="url(#' + u + '-mid)"') + path(PINES, 'fill="#060c30"') + path(RIDGE_NEAR, 'fill="url(#' + u + '-near)"');
      // contour engraving on hills
      var cl = '';
      for (var k = 0; k < 7; k++) cl += 'M150,' + (770 + k * 10) + 'Q500,' + (752 + k * 10) + ' 850,' + (768 + k * 10);
      land += path(cl, 'stroke="#2a4fd0" stroke-opacity=".35" stroke-width="1.4" fill="none"');
      var ravens = ravenMarkup(ravB, RB.tf, 'url(#' + u + '-rav)') + ravenMarkup(ravA, RA.tf, 'url(#' + u + '-rav)');
      // band with rune ring
      var band = '<circle cx="500" cy="500" r="331" fill="none" stroke="url(#' + u + '-band)" stroke-width="44"/>' +
        '<circle cx="500" cy="500" r="296" fill="none" stroke="#7fe9ff" stroke-opacity=".55" stroke-width="1.6"/>';
      return '<defs>' + defs + '</defs>' + sky + rings + moon + land + ravens + band;
    }
    function inkMask(u) {
      var m = FULL;
      // moon: bare silver crescent; the dark limb is printed as faint sky
      m += path(crescent(MOON.x, MOON.y, MOON.r, MOON.dx, MOON.dy, MOON.r2), 'fill="#000"');
      m += '<circle cx="' + (MOON.x + MOON.dx) + '" cy="' + (MOON.y + MOON.dy) + '" r="' + MOON.r2 + '" fill="#000" fill-opacity=".0"/>';
      // star glints: bare metal
      STARS.forEach(function (s) {
        m += s[2] > 4 ? path(star4(s[0], s[1], s[2], 0.14, s[3] * 0.4), 'fill="#000"') : '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.42) + '" fill="#000"/>';
      });
      m += path(CAPS, 'fill="#000"');
      // ravens fly in front of the moon and stars: always printed
      m += ravenMarkup(ravA, RA.tf, '#fff') + ravenMarkup(ravB, RB.tf, '#fff');
      // raven feather separations as struck silver lines
      m += '<g fill="none" stroke="#000" stroke-linecap="round">' +
        '<path transform="' + RA.tf + '" d="' + ravA.lines + '" stroke-width="1.9"/>' +
        '<path transform="' + RB.tf + '" d="' + ravB.lines + '" stroke-width="2.6"/></g>';
      m += '<g fill="#000"><circle transform="' + RA.tf + '" cx="' + ravA.eye[0] + '" cy="' + ravA.eye[1] + '" r="3.2"/>' +
        '<circle transform="' + RB.tf + '" cx="' + ravB.eye[0] + '" cy="' + ravB.eye[1] + '" r="4"/></g>';
      // runic ring in bare silver
      m += '<g fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + RING.strokes + '</g>';
      m += '<g fill="#000">' + RING.dots.map(function (p) { return '<circle cx="' + n(p[0]) + '" cy="' + n(p[1]) + '" r="2.8"/>'; }).join('') + '</g>';
      return m;
    }
    function relief(u) {
      var inner = path(crescent(MOON.x, MOON.y, MOON.r, MOON.dx, MOON.dy, MOON.r2), 'fill-opacity="1"') +
        '<g fill-opacity=".85">' + ravenMarkup(ravA, RA.tf, '#fff') + ravenMarkup(ravB, RB.tf, '#fff') + '</g>' +
        path(RIDGE_NEAR, 'fill-opacity=".35"') +
        '<circle cx="500" cy="500" r="331" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="44"/>';
      return reliefWrap(u, inner, 2.5);
    }
    return { metal: 'ag', field: field, inkMask: inkMask, relief: relief };
  })();

  /* ==================================================================== FJORD
     Aurora ribbons (violet -> cyan -> mint) over a midnight fjord; peaks left
     unprinted (mirror silver = snow); a tiny amber-lit cabin + reflection. */
  var FJORD = (function () {
    var WL = 612; // waterline
    var LM = [[140, 612], [170, 566], [204, 522], [238, 474], [266, 442], [290, 414], [312, 444], [332, 470], [352, 498], [372, 486], [394, 466], [412, 490], [432, 526], [452, 562], [474, 598], [492, 612]];
    var RM = [[516, 612], [546, 582], [572, 550], [598, 520], [622, 488], [648, 452], [672, 422], [692, 400], [714, 428], [736, 454], [756, 446], [778, 428], [798, 452], [822, 486], [846, 520], [870, 548], [870, 612]];
    var MM = [[430, 612], [462, 584], [486, 566], [503, 552], [522, 566], [548, 588], [574, 612]];
    // peaks: [peakIndex, polygon, divide base x]
    var PEAKS = [[LM, 5, 318], [LM, 10, 404], [RM, 7, 712], [RM, 13, 790], [MM, 3, 510]];
    function snowPolys() {
      var r = rng(881), out = '', ridges = '';
      PEAKS.forEach(function (pk, k) {
        var M = pk[0], i = pk[1], P0 = M[i];
        var depth = k === 4 ? 0.55 : (k % 2 ? 0.42 : 0.38);
        var Lp = M[Math.max(i - 3, 0)], A = [lerp(P0[0], Lp[0], depth), lerp(P0[1], Lp[1], depth)];
        var Bb = [pk[2], WL], B = [lerp(P0[0], Bb[0], depth * 0.62), lerp(P0[1], Bb[1], depth * 0.62)];
        var pts = [P0];
        // left ridge from peak to A following the polygon
        for (var j = i - 1; j >= 0; j--) { if (M[j][1] >= A[1]) break; pts.push(M[j]); }
        pts.push(A);
        var teeth = 6;
        for (var t = 1; t < teeth; t++) {
          var q = t / teeth, x = lerp(A[0], B[0], q), y = lerp(A[1], B[1], q);
          pts.push([x + (r() - 0.5) * 6, y + (t % 2 ? 14 + r() * 16 : -4 - r() * 6)]);
        }
        pts.push(B);
        out += poly(pts);
        ridges += 'M' + P(P0[0], P0[1]) + 'L' + P(lerp(P0[0], Bb[0], 0.75), lerp(P0[1], Bb[1], 0.75));
      });
      return { snow: out, ridges: ridges };
    }
    var SNOW = snowPolys();
    // couloirs: thin snow streaks on the shadow faces
    function couloirs() {
      var r = rng(512), d = '';
      PEAKS.forEach(function (pk, k) {
        if (k === 4) return;
        var M = pk[0], i = pk[1], P0 = M[i], Rn = M[Math.min(i + 2, M.length - 1)];
        for (var c = 0; c < 4; c++) {
          var t = 0.15 + c * 0.2 + r() * 0.05;
          var sx = lerp(P0[0], Rn[0], t), sy = lerp(P0[1], Rn[1], t) + 4;
          var len = 26 + r() * 40;
          d += 'M' + P(sx, sy) + 'Q' + P(sx + 3, sy + len * 0.5) + ' ' + P(sx - 2 + r() * 6, sy + len);
        }
      });
      return d;
    }
    var COUL = couloirs();
    function auroraBase(k, x) {
      var t = (x - 160) / 680;
      if (k === 0) return 452 - 70 * t + 46 * Math.sin(t * PI * 2.1 + 0.6) + 14 * Math.sin(t * PI * 5.3);
      if (k === 1) return 360 + 30 * t + 36 * Math.sin(t * PI * 1.7 + 2.2) + 10 * Math.sin(t * PI * 6.1 + 1);
      return 520 - 40 * t + 24 * Math.sin(t * PI * 2.6 + 4.1);
    }
    function auroraH(k, x) {
      var t = (x - 160) / 680;
      if (k === 0) return 120 + 70 * Math.sin(t * PI * 1.3 + 0.3) + 20 * Math.sin(t * PI * 7);
      if (k === 1) return 90 + 50 * Math.sin(t * PI * 2.0 + 1.1);
      return 54 + 26 * Math.sin(t * PI * 3 + 0.5);
    }
    function auroraStrips(k, seed) {
      var r = rng(seed), d = [], x = 160;
      while (x < 840) {
        var w = 2.2 + r() * 3.2, b0 = auroraBase(k, x), b1 = auroraBase(k, x + w), h0 = auroraH(k, x), h1 = auroraH(k, x + w);
        var hj = 1 + (r() - 0.5) * 0.35;
        d.push({ p: poly([[x, b0], [x + w + 0.6, b1], [x + w + 0.6, b1 - h1 * hj], [x, b0 - h0 * hj]]), o: 0.25 + 0.75 * Math.pow(r(), 0.7) });
        x += w;
      }
      return d;
    }
    var STRIPS = [auroraStrips(0, 11), auroraStrips(1, 12), auroraStrips(2, 13)];
    function basePath(k, x0, x1) {
      var pts = [];
      for (var x = x0; x <= x1; x += 8) pts.push([x, auroraBase(k, x)]);
      return smooth(pts, false);
    }
    var STARS = (function () {
      var r = rng(9090), out = [];
      for (var i = 0; i < 120; i++) {
        var x = 170 + r() * 660, y = 175 + r() * 420, s = 0.9 + Math.pow(r(), 4) * 7;
        if (Math.hypot(x - 500, y - 500) > 318) continue;
        var near = false;
        for (var k = 0; k < 2; k++) { var b = auroraBase(k, x); if (y < b + 6 && y > b - auroraH(k, x) * 0.7) near = true; }
        if (near && s < 3) continue;
        out.push([x, y, s, r()]);
      }
      return out;
    })();
    var CABIN = { x: 404, y: 604 };
    function cabin(fillBody) {
      var x = CABIN.x, y = CABIN.y;
      return path('M' + P(x - 15, y) + 'V' + n(y - 13) + 'L' + P(x, y - 26) + 'L' + P(x + 15, y - 13) + 'V' + n(y) + 'Z', 'fill="' + fillBody + '"') +
        path('M' + P(x - 19, y - 11) + 'L' + P(x, y - 29) + 'L' + P(x + 19, y - 11) + 'L' + P(x + 16, y - 9) + 'L' + P(x, y - 24) + 'L' + P(x - 16, y - 9) + 'Z', 'fill="' + fillBody + '"') +
        '<rect x="' + n(x + 6) + '" y="' + n(y - 30) + '" width="5" height="10" fill="' + fillBody + '"/>';
    }
    var SHORE = smooth([[300, 616], [336, 607], [372, 604], [420, 604], [452, 608], [480, 616]], false) + 'L480,618L300,618Z';
    var FORE_L = smooth([[150, 760], [200, 752], [252, 768], [300, 790], [330, 830], [150, 840]], false) + 'Z';
    var FORE_R = smooth([[850, 742], [790, 752], [730, 778], [690, 806], [670, 840], [850, 840]], false) + 'Z';
    function pinesAt(list) {
      var d = '';
      list.forEach(function (t) {
        var x = t[0], by = t[1], h = t[2], w = h * 0.3;
        for (var k = 0; k < 5; k++) {
          var ty = by - h + k * h * 0.16, bw = w * (0.35 + k * 0.17), byk = ty + h * 0.34;
          d += 'M' + P(x, ty) + 'L' + P(x + bw, byk) + 'L' + P(x - bw, byk) + 'Z';
        }
        d += 'M' + P(x - 2.5, by - h * 0.2) + 'H' + n(x + 2.5) + 'V' + n(by + 6) + 'H' + n(x - 2.5) + 'Z';
      });
      return d;
    }
    var PINES = pinesAt([[188, 772, 96], [222, 776, 70], [250, 786, 52], [812, 752, 104], [778, 764, 74], [748, 780, 50], [282, 798, 34], [722, 796, 36]]);

    function field(u) {
      var defs = lg(u + '-sky', 0, 170, 0, WL, [[0, '#04071d'], [0.45, '#0a1038'], [0.8, '#151c5c'], [1, '#22307a']]) +
        lg(u + '-aurH', 170, 0, 830, 0, [[0, '#7C5CFF'], [0.3, '#5d7dff'], [0.55, '#19D3FF'], [0.8, '#46E6A6'], [1, '#7dffc8']]) +
        lg(u + '-fade', 0, 1, 0, 0, [[0, '#fff', 1], [0.25, '#fff', 0.8], [1, '#fff', 0]], ' gradientUnits="objectBoundingBox"').replace('gradientUnits="userSpaceOnUse" ', '') +
        rg(u + '-glow', 470, 420, 340, [[0, '#2bd8ff', 0.22], [0.5, '#6b5cff', 0.12], [1, '#7C5CFF', 0]]) +
        lg(u + '-rock', 0, 400, 0, WL, [[0, '#1d2a72'], [0.5, '#121c55'], [1, '#0a1138']]) +
        lg(u + '-rockF', 0, 520, 0, WL, [[0, '#3b4fae'], [1, '#1c2a74']]) +
        lg(u + '-water', 0, WL, 0, 830, [[0, '#101a55'], [0.5, '#0a1240'], [1, '#050922']]) +
        rg(u + '-amb', CABIN.x - 2, CABIN.y - 12, 70, [[0, '#FFD27A', 0.95], [0.25, '#FFB547', 0.5], [1, '#FF8A3D', 0]]) +
        '<pattern id="' + u + '-hat" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(58)"><rect width="7" height="2" fill="#8ea6ff" fill-opacity=".22"/></pattern>' +
        blurF(u + '-b6', 6) + blurF(u + '-b2', 2);
      var maskStrips = '';
      STRIPS.forEach(function (arr, k) {
        maskStrips += '<mask id="' + u + '-am' + k + '" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">' +
          arr.map(function (s) { return '<path d="' + s.p + '" fill="url(#' + u + '-fade)" fill-opacity="' + n(s.o) + '"/>'; }).join('') + '</mask>';
      });
      var out = '<defs>' + defs + maskStrips + '</defs>';
      out += '<rect x="140" y="140" width="720" height="' + (WL - 140) + '" fill="url(#' + u + '-sky)"/>';
      out += '<rect x="140" y="140" width="720" height="' + (WL - 140) + '" fill="url(#' + u + '-glow)"/>';
      // stars (printed as pale dots; the bright ones become bare metal via the mask)
      out += '<g fill="#dfe8ff">' + STARS.map(function (s) { return '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(Math.max(0.8, s[2] * 0.3)) + '" fill-opacity=".7"/>'; }).join('') + '</g>';
      // aurora: soft glow + streaked curtains + bright lower edge
      function aurora(scaleY) {
        var a = '';
        [2, 1, 0].forEach(function (k) {
          a += '<g mask="url(#' + u + '-am' + k + ')"><rect x="140" y="140" width="720" height="' + (WL - 140) + '" fill="url(#' + u + '-aurH)" opacity="' + (k === 2 ? 0.6 : k === 1 ? 0.8 : 1) + '"/></g>';
          var bp = basePath(k, 160, 840);
          a += '<path d="' + bp + '" fill="none" stroke="url(#' + u + '-aurH)" stroke-width="' + (k === 0 ? 16 : 10) + '" stroke-opacity=".55" filter="url(#' + u + '-b6)"/>';
          a += '<path d="' + bp + '" fill="none" stroke="#c9fff0" stroke-width="' + (k === 0 ? 2.2 : 1.4) + '" stroke-opacity="' + (k === 2 ? 0.35 : 0.8) + '"/>';
        });
        return a;
      }
      out += aurora();
      // mountains
      out += path(poly(MM), 'fill="url(#' + u + '-rockF)"');
      out += path(poly(LM), 'fill="url(#' + u + '-rock)"') + path(poly(RM), 'fill="url(#' + u + '-rock)"');
      out += '<g fill="url(#' + u + '-hat)">' + path(poly(LM)) + path(poly(RM)) + '</g>';
      // aurora-lit rim on the left faces
      out += path(SNOW.snow, 'fill="#e8f3ff"');
      // water + reflections
      out += '<rect x="140" y="' + WL + '" width="720" height="' + (860 - WL) + '" fill="url(#' + u + '-water)"/>';
      out += '<g transform="matrix(1,0,0,-0.55,0,' + n(WL * 1.55) + ')" opacity=".55">' + aurora() + '</g>';
      out += '<g transform="matrix(1,0,0,-0.5,0,' + n(WL * 1.5) + ')" opacity=".85">' + path(poly(LM), 'fill="#070c2c"') + path(poly(RM), 'fill="#070c2c"') + path(poly(MM), 'fill="#0d1646"') + path(SNOW.snow, 'fill="#5d6fae" fill-opacity=".5"') + '</g>';
      var rip = '';
      for (var y = WL + 4; y < 840; y += 5 + (y - WL) * 0.03) rip += 'M140,' + n(y) + 'H860';
      out += path(rip, 'stroke="#050922" stroke-opacity=".55" stroke-width="' + 1.6 + '" fill="none"');
      // shore + cabin + glow + reflection
      out += path(SHORE, 'fill="#070b26"');
      out += '<circle cx="' + CABIN.x + '" cy="' + (CABIN.y - 12) + '" r="70" fill="url(#' + u + '-amb)"/>';
      out += cabin('#0a0d22');
      out += '<rect x="' + (CABIN.x - 9) + '" y="' + (CABIN.y - 11) + '" width="7" height="7" fill="#FFC861"/><rect x="' + (CABIN.x + 3) + '" y="' + (CABIN.y - 11) + '" width="6" height="11" fill="#FF9F43"/>';
      var refl = '';
      for (var j = 0; j < 14; j++) { var yy = WL + 6 + j * 5.5, w = 7 + j * 1.2 + (j % 3) * 4; refl += '<rect x="' + n(CABIN.x - 2 - w / 2) + '" y="' + n(yy) + '" width="' + n(w) + '" height="2.2" fill="#FFB547" fill-opacity="' + n(0.85 - j * 0.055) + '"/>'; }
      out += refl;
      // foreground silhouettes
      out += path(FORE_L, 'fill="#03051a"') + path(FORE_R, 'fill="#03051a"') + path(PINES, 'fill="#03051a"');
      return out;
    }
    function inkMask(u) {
      var m = FULL;
      m += path(SNOW.snow, 'fill="#000"');
      m += path(COUL, 'fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"');
      m += path(SNOW.ridges, 'fill="none" stroke="#000" stroke-width="1.6" stroke-opacity=".9"');
      STARS.forEach(function (s) {
        if (s[2] > 3.4) m += path(star4(s[0], s[1], s[2], 0.14, 0), 'fill="#000"');
        else if (s[2] > 1.6) m += '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.45) + '" fill="#000"/>';
      });
      // mirror glints on the water
      var r = rng(77), gl = '';
      for (var i = 0; i < 60; i++) {
        var y = WL + 8 + Math.pow(r(), 1.4) * 150, x = 200 + r() * 600, w = 6 + r() * 26;
        if (Math.abs(x - CABIN.x) < 30) continue;
        gl += 'M' + P(x, y) + 'h' + n(w);
      }
      m += path(gl, 'stroke="#000" stroke-width="1.6" stroke-opacity=".8" fill="none" stroke-linecap="round"');
      return m;
    }
    function relief(u) {
      var inner = path(poly(LM), 'fill-opacity=".55"') + path(poly(RM), 'fill-opacity=".55"') + path(poly(MM), 'fill-opacity=".35"') +
        path(SNOW.snow, 'fill-opacity="1"') + path(FORE_L + FORE_R, 'fill-opacity=".7"') + path(PINES, 'fill-opacity=".8"') + cabin('#fff');
      return reliefWrap(u, inner, 2.5);
    }
    return { metal: 'ag', field: field, inkMask: inkMask, relief: relief };
  })();

  /* ------------------------------------------------------------ placeholders */
  function placeholder(metal, c1, c2) {
    return {
      metal: metal,
      field: function (u) { return '<defs>' + lg(u + '-p', 170, 170, 830, 830, [[0, c1], [1, c2]]) + '</defs><circle cx="500" cy="500" r="340" fill="url(#' + u + '-p)"/>'; },
      inkMask: function () { return FULL; },
      relief: function () { return null; }
    };
  }

  window.BVArtFields = {
    huginn: HUGINN,
    fjord: FJORD,
    valkyrie: placeholder('au', '#7C5CFF', '#4D8DFF'),
    heimdall: placeholder('au', '#7C5CFF', '#46E6A6'),
    jormungandr: placeholder('ag', '#46E6A6', '#19D3FF'),
    koi: placeholder('au', '#FF7A6B', '#19D3FF')
  };
})();
