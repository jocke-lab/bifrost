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
    var PEAKS = [[LM, 5, 318], [LM, 10, 404], [RM, 7, 712], [RM, 11, 790], [MM, 3, 510]];
    // walk a ridge polyline from the peak (index i, direction dir) down to height y
    function ridgeAt(M, i, dir, y) {
      var pts = [M[i]];
      for (var j = i + dir; j >= 0 && j < M.length; j += dir) {
        var a = M[j - dir], b = M[j];
        if (b[1] < a[1]) return pts; // reached a saddle: stop
        if (b[1] >= y) { var t = (y - a[1]) / (b[1] - a[1] || 1); pts.push([lerp(a[0], b[0], t), y]); return pts; }
        pts.push(b);
      }
      return pts;
    }
    function snowPolys() {
      var r = rng(881), out = '', ridges = '', shade = '';
      PEAKS.forEach(function (pk, k) {
        var M = pk[0], i = pk[1], P0 = M[i];
        var frac = k === 4 ? 0.5 : (k % 2 ? 0.46 : 0.5);
        var ySnow = P0[1] + (WL - P0[1]) * frac;
        var left = ridgeAt(M, i, -1, ySnow), A = left[left.length - 1];
        var Bb = [pk[2], WL];
        var tB = (ySnow - 10 - P0[1]) / (WL - P0[1]);
        var B = [lerp(P0[0], Bb[0], tB), lerp(P0[1], Bb[1], tB)];
        var pts = left.slice();
        var teeth = 7 + (k % 2) * 2;
        for (var t = 1; t < teeth; t++) {
          var q = t / teeth, x = lerp(A[0], B[0], q), y = lerp(A[1], B[1], q);
          if (t % 2) pts.push([x - 6 - r() * 8, y + 12 + r() * 30]); // gully tongue, slanting down-slope
          else pts.push([x + (r() - 0.5) * 4, y - 10 - r() * 16]);
        }
        pts.push(B);
        out += poly(pts);
        ridges += 'M' + P(P0[0], P0[1]) + 'L' + P(lerp(P0[0], Bb[0], tB * 1.05), lerp(P0[1], Bb[1], tB * 1.05));
        // shadow facet: from the divide line to the right ridge
        var right = ridgeAt(M, i, 1, WL);
        shade += poly([P0].concat(right.slice(1)).concat([Bb]));
      });
      return { snow: out, ridges: ridges, shade: shade };
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
          var len = 14 + r() * 22;
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
    var FORE_L = smooth([[200, 712], [262, 714], [318, 732], [370, 770], [400, 840], [200, 840]], false) + 'Z';
    var FORE_R = smooth([[800, 700], [740, 708], [680, 734], [630, 772], [606, 840], [800, 840]], false) + 'Z';
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
    var PINES = pinesAt([[262, 728, 104], [296, 734, 78], [326, 750, 56], [228, 722, 70], [742, 716, 112], [706, 726, 80], [674, 744, 58], [776, 712, 74], [350, 768, 30], [652, 764, 34]]);

    function field(u) {
      var defs = lg(u + '-sky', 0, 170, 0, WL, [[0, '#04071d'], [0.45, '#0a1038'], [0.8, '#151c5c'], [1, '#22307a']]) +
        lg(u + '-aurH', 170, 0, 830, 0, [[0, '#7C5CFF'], [0.3, '#5d7dff'], [0.55, '#19D3FF'], [0.8, '#46E6A6'], [1, '#7dffc8']]) +
        lg(u + '-fade', 0, 1, 0, 0, [[0, '#fff', 1], [0.25, '#fff', 0.8], [1, '#fff', 0]], ' gradientUnits="objectBoundingBox"').replace('gradientUnits="userSpaceOnUse" ', '') +
        rg(u + '-glow', 470, 420, 340, [[0, '#2bd8ff', 0.22], [0.5, '#6b5cff', 0.12], [1, '#7C5CFF', 0]]) +
        lg(u + '-rock', 0, 400, 0, WL, [[0, '#24308a'], [0.45, '#141d5c'], [1, '#080d33']]) +
        lg(u + '-rockF', 0, 540, 0, WL, [[0, '#33449a'], [1, '#18235f']]) +
        lg(u + '-water', 0, WL, 0, 830, [[0, '#101a55'], [0.5, '#0a1240'], [1, '#050922']]) +
        rg(u + '-amb', CABIN.x - 2, CABIN.y - 12, 70, [[0, '#FFD27A', 0.95], [0.25, '#FFB547', 0.5], [1, '#FF8A3D', 0]]) +
        '<pattern id="' + u + '-hat" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(58)"><rect width="7" height="1.6" fill="#8ea6ff" fill-opacity=".13"/></pattern>' +
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
          if (k < 2) a += '<path d="' + bp + '" fill="none" stroke="#d8fff4" stroke-width="' + (k === 0 ? 2.4 : 1.4) + '" stroke-opacity="' + (k === 0 ? 0.9 : 0.6) + '"/>';
        });
        return a;
      }
      out += aurora();
      // mountains
      out += path(poly(MM), 'fill="url(#' + u + '-rockF)"');
      out += path(poly(LM), 'fill="url(#' + u + '-rock)"') + path(poly(RM), 'fill="url(#' + u + '-rock)"');
      out += path(SNOW.shade, 'fill="#02041a" fill-opacity=".55"');
      out += '<g fill="url(#' + u + '-hat)">' + path(poly(LM)) + path(poly(RM)) + '</g>';
      // aurora-lit rim on the left faces
      out += path(SNOW.snow, 'fill="#e8f3ff"');
      // water + reflections
      out += '<rect x="140" y="' + WL + '" width="720" height="' + (860 - WL) + '" fill="url(#' + u + '-water)"/>';
      var refA = '';
      [0, 1].forEach(function (k) { refA += '<path d="' + basePath(k, 160, 840) + '" fill="none" stroke="url(#' + u + '-aurH)" stroke-width="' + (k ? 26 : 40) + '" stroke-opacity="' + (k ? 0.35 : 0.5) + '" filter="url(#' + u + '-b6)"/>'; });
      out += '<g transform="matrix(1,0,0,-0.42,0,' + n(WL * 1.42) + ')" opacity=".6">' + refA + '</g>';
      out += '<g transform="matrix(1,0,0,-0.5,0,' + n(WL * 1.5) + ')" opacity=".85">' + path(poly(LM), 'fill="#070c2c"') + path(poly(RM), 'fill="#070c2c"') + path(poly(MM), 'fill="#0d1646"') + path(SNOW.snow, 'fill="#5d6fae" fill-opacity=".5"') + '</g>';
      var rip = '';
      for (var y = WL + 4; y < 840; y += 4 + (y - WL) * 0.035) rip += 'M140,' + n(y) + 'H860';
      out += path(rip, 'stroke="#050922" stroke-opacity=".45" stroke-width="1.4" fill="none"');
      // shore + cabin + glow + reflection
      out += path(SHORE, 'fill="#070b26"');
      out += '<circle cx="' + CABIN.x + '" cy="' + (CABIN.y - 12) + '" r="70" fill="url(#' + u + '-amb)"/>';
      out += '<g transform="translate(' + CABIN.x + ',' + CABIN.y + ') scale(1.3) translate(' + (-CABIN.x) + ',' + (-CABIN.y) + ')">' + cabin('#0a0d22') +
        '<rect x="' + (CABIN.x - 9) + '" y="' + (CABIN.y - 11) + '" width="7" height="7" fill="#FFC861"/><rect x="' + (CABIN.x + 3) + '" y="' + (CABIN.y - 11) + '" width="6" height="11" fill="#FF9F43"/></g>';
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
      m += path(COUL, 'fill="none" stroke="#000" stroke-opacity=".6" stroke-width="1.8" stroke-linecap="round"');
      // silvery reflection of the snow caps, broken by ripples (translucent ink = metal glimmers through)
      m += '<g transform="matrix(1,0,0,-0.5,0,' + n(WL * 1.5) + ')">' + path(SNOW.snow, 'fill="#000" fill-opacity=".45"') + '</g>';
      var rp = '';
      for (var y = WL + 3; y < 760; y += 4 + (y - WL) * 0.035) rp += 'M140,' + n(y) + 'H860';
      m += path(rp, 'stroke="#fff" stroke-width="1.6" fill="none"');
      m += path(SNOW.ridges, 'fill="none" stroke="#000" stroke-width="1.6" stroke-opacity=".9"');
      STARS.forEach(function (s) {
        if (s[2] > 3.4) m += path(star4(s[0], s[1], s[2], 0.14, 0), 'fill="#000"');
        else if (s[2] > 1.6) m += '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.45) + '" fill="#000"/>';
      });
      // mirror glints on the water
      var r = rng(77), gl = '';
      for (var i = 0; i < 26; i++) {
        var y = WL + 8 + Math.pow(r(), 1.6) * 110, x = 250 + r() * 500, w = 6 + r() * 20;
        if (Math.abs(x - CABIN.x) < 30) continue;
        gl += 'M' + P(x, y) + 'h' + n(w);
      }
      m += path(gl, 'stroke="#000" stroke-width="1.4" stroke-opacity=".6" fill="none" stroke-linecap="round"');
      return m;
    }
    function relief(u) {
      var inner = path(poly(LM), 'fill-opacity=".55"') + path(poly(RM), 'fill-opacity=".55"') + path(poly(MM), 'fill-opacity=".35"') +
        path(SNOW.snow, 'fill-opacity="1"') + path(FORE_L + FORE_R, 'fill-opacity=".45"') + path(PINES, 'fill-opacity=".5"') + cabin('#fff');
      return reliefWrap(u, inner, 2.5);
    }
    return { metal: 'ag', field: field, inkMask: inkMask, relief: relief };
  })();

  /* ================================================================= VALKYRIE
     Gold. A Valkyrie in three-quarter profile (frosted gold, high relief) with
     outstretched translucent violet -> azure cloisonne wings, sunrise rays struck
     across a mirror-gold field, star glints on the wingtips. */
  function qpt(A, C, B, u) { var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; return [a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]]; }
  // leaf-shaped feather from base B to tip T, width w, bend (-1..1) bows the feather sideways
  function featherBT(B, T, w, bend) {
    bend = bend || 0;
    var dx = T[0] - B[0], dy = T[1] - B[1], L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    var px = -dy, py = dx, bb = bend * L * 0.08;
    return 'M' + P(B[0] + px * w / 2, B[1] + py * w / 2) +
      'Q' + P(B[0] + dx * L * 0.6 + px * (w * 0.62 + bb), B[1] + dy * L * 0.6 + py * (w * 0.62 + bb)) + ' ' + P(T[0] + px * w * 0.14, T[1] + py * w * 0.14) +
      'Q' + P(T[0] + dx * 4, T[1] + dy * 4) + ' ' + P(T[0] - px * w * 0.14, T[1] - py * w * 0.14) +
      'Q' + P(B[0] + dx * L * 0.6 - px * (w * 0.62 - bb), B[1] + dy * L * 0.6 - py * (w * 0.62 - bb)) + ' ' + P(B[0] - px * w / 2, B[1] - py * w / 2) + 'Z';
  }
  // display wing: leading edge S-C-H (quadratic), trailing curve T0-TC-H; rows of feather cells
  function displayWing(S, C, H, T0, TC, o) {
    o = o || {};
    var side = H[0] < S[0] ? -1 : 1;
    var rows = [{ n: o.n || 19, f: 1, w: 34 }, { n: 15, f: 0.52, w: 30, uMax: 0.9 }, { n: 12, f: 0.27, w: 24, uMax: 0.8 }];
    var cells = [], tips = [];
    rows.forEach(function (row, ri) {
      for (var i = 0; i < row.n; i++) {
        var u = lerp(0.02, row.uMax || 0.985, i / (row.n - 1));
        var E = qpt(S, C, H, u), T = qpt(T0, TC, [H[0] - side * 6, H[1] + 8], Math.pow(u, 0.9));
        var len = Math.hypot(T[0] - E[0], T[1] - E[1]);
        var Tr = [lerp(E[0], T[0], row.f), lerp(E[1], T[1], row.f)];
        if (ri > 0) { // coverts: start a bit inside the leading edge
          var k = 6 / (len || 1); E = [lerp(E[0], T[0], k), lerp(E[1], T[1], k)];
        }
        var w = row.w * (ri === 0 ? lerp(1, 0.55, Math.pow(u, 2)) : lerp(1, 0.7, u));
        cells.push({ d: featherBT(E, Tr, w, side * 0.6), row: ri, u: u, B: E, T: Tr });
        if (ri === 0) tips.push(Tr);
      }
    });
    var lead = [], back = [];
    for (var j = 0; j <= 24; j++) {
      var u2 = j / 24, e = qpt(S, C, H, u2), t = qpt(T0, TC, H, u2), th = lerp(22, 3, u2), l = Math.hypot(t[0] - e[0], t[1] - e[1]) || 1;
      lead.push(e); back.push([e[0] + (t[0] - e[0]) / l * th, e[1] + (t[1] - e[1]) / l * th]);
    }
    var bone = smooth(lead, false) + 'L' + back.reverse().map(function (p) { return P(p[0], p[1]); }).join('L') + 'Z';
    return { cells: cells, tips: tips, bone: bone, side: side };
  }

  var VALKYRIE = (function () {
    var SUN = [500, 600];
    var WL = displayWing([424, 520], [318, 236], [214, 318], [384, 700], [176, 616], {});
    var WR = displayWing([576, 512], [690, 226], [790, 306], [630, 694], [834, 604], {});
    // ---- figure (frosted gold) ----
    var FACE = 'M414,352C410,362 408,370 410,377C412,383 410,389 406,395C402,401 398,407 397,411C397,415 401,418 408,418' +
      'C407,423 406,427 408,429C411,431 412,433 410,435C407,438 407,442 411,445C414,447 414,450 412,454' +
      'C410,462 414,470 426,474C440,478 454,474 464,466L480,430L476,380L446,350Z';
    var NECK = 'M432,472C444,494 456,516 466,552L560,540C546,512 534,484 526,450L480,440Z';
    var HELM = 'M404,354C398,302 444,266 500,266C558,266 590,312 584,368L572,412C552,400 528,396 510,398L504,446C494,462 474,466 462,456L456,394C446,372 428,360 404,354Z';
    var HELM_LINES = 'M408,350C440,338 476,334 506,338C538,342 566,354 584,370M414,334C446,322 478,318 508,322C540,326 568,340 586,356' +
      'M470,272C476,296 478,316 476,330M456,396C468,400 486,401 504,400M458,418C472,421 488,421 504,418M460,438C472,441 486,441 500,436';
    var HELM_RIVETS = [[428, 342], [452, 336], [478, 333], [504, 334], [530, 340], [556, 350]];
    function helmWing() {
      var d = '', lines = '';
      for (var i = 0; i < 6; i++) {
        var B = [522 + i * 8, 326 + i * 6];
        var ang = (-80 + i * 13) * D, L = 96 - i * 9;
        var T = [B[0] + Math.cos(ang) * L + 22, B[1] + Math.sin(ang) * L];
        d += featherBT(B, T, 20 - i, 1.8);
        lines += 'M' + P(lerp(B[0], T[0], 0.15), lerp(B[1], T[1], 0.15)) + 'L' + P(lerp(B[0], T[0], 0.82), lerp(B[1], T[1], 0.82));
      }
      return { d: d, lines: lines };
    }
    var HW = helmWing();
    // flowing hair: an S-curved mass streaming behind the neck over the far shoulder
    function lock(sp, w0, w1, wEnd) {
      var rb = ribbonPts(sp, function (t) { return lerp(lerp(w0, w1, Math.sin(Math.min(t / 0.5, 1) * PI / 2)), wEnd, Math.pow(Math.max(0, (t - 0.5) / 0.5), 1.4)); });
      var d = smooth(rb.L.concat(rb.R.slice().reverse()), true, 0.9);
      var lines = '';
      [-0.36, -0.12, 0.12, 0.36].forEach(function (k) {
        var lp = sp.map(function (p, i) { var q = rb.L[i], r = rb.R[i]; return [lerp(q[0], r[0], 0.5 + k), lerp(q[1], r[1], 0.5 + k)]; });
        lines += smooth(lp.slice(1, lp.length - 1), false);
      });
      return { d: d, lines: lines };
    }
    function sCurve(pts) { var out = []; for (var i = 0; i < pts.length - 1; i++) for (var k = 0; k < 4; k++) { var t = k / 4; out.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]); } out.push(pts[pts.length - 1]); return out; }
    var LOCKS = [
      lock(sCurve([[548, 396], [590, 430], [606, 486], [632, 540], [672, 580], [690, 630], [672, 690]]), 60, 84, 8),
      lock(sCurve([[574, 388], [626, 410], [640, 460], [672, 500], [712, 528], [726, 570]]), 34, 42, 6),
      lock(sCurve([[540, 430], [556, 480], [552, 540], [574, 600], [600, 640], [598, 690]]), 30, 38, 6)
    ];
    var HAIR = LOCKS.map(function (l) { return l.d; }).join('');
    var HAIR_LINES = LOCKS.map(function (l) { return l.lines; }).join('');
    var EYE = 'M420,388C426,384 434,384 440,388C434,392 426,393 420,388Z';
    var FACE_LINES = 'M416,379C424,375 434,375 444,379M411,431L418,432M422,408C426,412 430,413 434,412';
    var TORSO = 'M466,550C440,554 410,558 388,568C362,580 348,604 344,640C340,700 346,780 352,840L668,840C672,770 674,700 672,652C670,612 652,584 626,570C604,558 582,548 560,540Z';
    // near-shoulder pauldron: a dome with three lames
    var PAULDRON = 'M334,644C332,598 364,566 410,562C448,560 474,582 480,614C442,604 400,608 364,626C352,632 342,640 334,652Z';
    var PAULDRON2 = 'M336,672C352,644 390,630 430,630C456,630 474,638 482,652C448,646 408,652 374,668C360,674 346,684 338,696Z' +
      'M340,716C356,690 392,678 430,678C454,678 472,684 480,696C448,692 410,698 380,712C364,718 352,728 342,740Z';
    var GORGET = 'M462,546C494,562 532,560 562,540L570,576C536,596 490,598 456,582Z';
    // breastplate: rising-sun emblem + deco chevrons
    var CHEST_LINES = (function () {
      var cx = 532, cy = 714;
      var d = 'M' + cx + ',' + cy + 'L' + cx + ',840M' + (cx - 40) + ',774L' + cx + ',798L' + (cx + 40) + ',774M' + (cx - 48) + ',810L' + cx + ',838L' + (cx + 48) + ',810';
      d += 'M' + (cx - 46) + ',' + cy + 'A46,46 0 0 1 ' + (cx + 46) + ',' + cy + 'Z';
      for (var i = 0; i <= 10; i++) { var a = lerp(186, 354, i / 10) * D, p0 = pol(cx, cy, 17, a), p1 = pol(cx, cy, 42, a); d += 'M' + P(p0[0], p0[1]) + 'L' + P(p1[0], p1[1]); }
      d += 'M' + (cx - 14) + ',' + cy + 'A14,14 0 0 1 ' + (cx + 14) + ',' + cy;
      // cloak pleats falling from a brooch on the far shoulder
      for (var k = 0; k < 5; k++) { var x0 = 606 + k * 13; d += 'M' + P(x0, 604) + 'C' + P(x0 + 4, 680) + ' ' + P(x0 - 6, 760) + ' ' + P(x0 + 2 + k * 2, 840); }
      return d;
    })();
    var SCALES = '';
    var BROOCH = [604, 588];
    var GORGET_FAN = (function () {
      var d = 'M' + P(BROOCH[0] - 10, BROOCH[1]) + 'A10,10 0 1 0 ' + P(BROOCH[0] + 10, BROOCH[1]) + 'A10,10 0 1 0 ' + P(BROOCH[0] - 10, BROOCH[1]);
      for (var i = 0; i <= 8; i++) { var a = lerp(200, 340, i / 8) * D; var p0 = pol(508, 600, 10, a), p1 = pol(508, 600, 40, a); d += 'M' + P(p0[0], p0[1]) + 'L' + P(p1[0], p1[1]); }
      return d;
    })();
    var BROOCH_D = 'M' + P(BROOCH[0] - 18, BROOCH[1]) + 'A18,18 0 1 0 ' + P(BROOCH[0] + 18, BROOCH[1]) + 'A18,18 0 1 0 ' + P(BROOCH[0] - 18, BROOCH[1]) + 'Z';
    var BODY = TORSO + NECK + FACE + HELM + HW.d;
    var BODY_BACK = TORSO + NECK, BODY_FRONT = FACE + HELM + HW.d;
    var ARMOUR = PAULDRON + PAULDRON2 + GORGET + BROOCH_D;
    var GLINTS = (function () {
      var out = [], r = rng(1912);
      [WL, WR].forEach(function (W) {
        var t = W.tips.slice(-9);
        for (var i = 0; i < 6; i++) {
          var p = t[Math.min(t.length - 1, Math.floor(i * t.length / 6))];
          var dx = p[0] - 500, dy = p[1] - 500, rr = Math.hypot(dx, dy), lim = 300 - r() * 26;
          if (rr > lim) p = [500 + dx / rr * lim, 500 + dy / rr * lim];
          out.push([p[0] + (r() - 0.5) * 14, p[1] + (r() - 0.5) * 14, 6 + r() * 12]);
        }
      });
      return out;
    })();
    function rays(r0, r1, nr) {
      var wedges = '', lines = '';
      for (var i = 0; i < nr; i++) {
        var a0 = i / nr * TAU, a1 = (i + 0.5) / nr * TAU;
        var p0 = pol(SUN[0], SUN[1], r0, a0), p1 = pol(SUN[0], SUN[1], r1, a0), p2 = pol(SUN[0], SUN[1], r1, a1), p3 = pol(SUN[0], SUN[1], r0, a1);
        wedges += poly([p0, p1, p2, p3]);
        var am = (i + 0.75) / nr * TAU, q0 = pol(SUN[0], SUN[1], r0, am), q1 = pol(SUN[0], SUN[1], r1, am);
        lines += 'M' + P(q0[0], q0[1]) + 'L' + P(q1[0], q1[1]);
      }
      return { wedges: wedges, lines: lines };
    }
    var RAYS = rays(30, 520, 64);
    function wingCells(W, gid) { return W.cells.map(function (c) { return '<path d="' + c.d + '" fill="url(#' + gid + ')"/>'; }).join(''); }
    function wingMask(W) {
      return W.cells.map(function (c) { return '<path d="' + c.d + '" fill="#f4f4f4" stroke="#000" stroke-width="2.4" stroke-linejoin="round"/>'; }).join('') + path(W.bone, 'fill="#000"');
    }

    function field(u) {
      var wg = [[0, '#2c1690'], [0.3, '#5a3df0'], [0.55, '#7C5CFF'], [0.8, '#5a84ff'], [1, '#4D8DFF']];
      var defs = rg(u + '-wl', 430, 540, 330, wg) + rg(u + '-wr', 570, 530, 330, wg) +
        lg(u + '-frost', 0, 266, 0, 840, [[0, '#FFF8E2'], [0.45, '#F9E6AE'], [1, '#EFCF7E']]) +
        rg(u + '-mir', SUN[0], SUN[1] - 60, 420, [[0, '#FFF1C1', 0.35], [0.35, '#b07a1c', 0.08], [0.75, '#5a3405', 0.32], [1, '#3a2003', 0.55]]) +
        rg(u + '-sheen', 500, 330, 300, [[0, '#ffffff', 0.35], [1, '#ffffff', 0]]) +
        lg(u + '-shx', 340, 0, 680, 0, [[0, '#7a4a0a', 0.55], [0.18, '#a8741c', 0.15], [0.45, '#ffffff', 0.12], [0.75, '#a8741c', 0.2], [1, '#6b3f08', 0.6]]) +
        lg(u + '-shy', 0, 540, 0, 840, [[0, '#ffffff', 0], [0.6, '#8a5a12', 0.1], [1, '#5a3405', 0.45]]) +
        rg(u + '-hl', 470, 300, 120, [[0, '#ffffff', 0.7], [1, '#ffffff', 0]]) +
        lg(u + '-nsh', 0, 470, 0, 560, [[0, '#6b3f08', 0.55], [1, '#6b3f08', 0]]) +
        '<radialGradient id="' + u + '-gl"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".35" stop-color="#c9d8ff" stop-opacity=".35"/><stop offset="1" stop-color="#c9d8ff" stop-opacity="0"/></radialGradient>';
      var out = '<defs>' + defs + '</defs>';
      out += '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-mir)"/>';
      out += path(RAYS.wedges, 'fill="#FFF1C1" fill-opacity=".16"');
      out += path(RAYS.lines, 'stroke="#4a2a03" stroke-opacity=".35" stroke-width="1.2" fill="none"');
      out += wingCells(WR, u + '-wr') + wingCells(WL, u + '-wl');
      var sh = '';
      [WL, WR].forEach(function (W) { W.cells.forEach(function (c) { if (c.row === 0) sh += 'M' + P(lerp(c.B[0], c.T[0], 0.5), lerp(c.B[1], c.T[1], 0.5)) + 'L' + P(lerp(c.B[0], c.T[0], 0.9), lerp(c.B[1], c.T[1], 0.9)); }); });
      out += path(sh, 'stroke="#d9e2ff" stroke-opacity=".55" stroke-width="1.5" fill="none"');
      out += '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-sheen)" opacity=".6"/>';
      out += GLINTS.map(function (g) { return '<circle cx="' + n(g[0]) + '" cy="' + n(g[1]) + '" r="' + n(g[2] * 0.9) + '" fill="url(#' + u + '-gl)"/>' + path(star4(g[0], g[1], g[2], 0.12, 0), 'fill="#FFFBEA"'); }).join('');
      var F = 'fill="url(#' + u + '-frost)"', O = 'fill="none" stroke="#5e3a08" stroke-width="2.6" stroke-linejoin="round"', E = 'stroke="#7a4f0e" stroke-width="1.8" fill="none" stroke-linecap="round"';
      out += path(BODY_BACK, F) + path(TORSO, 'fill="url(#' + u + '-shx)"') + path(TORSO, 'fill="url(#' + u + '-shy)"') + path(NECK, 'fill="url(#' + u + '-nsh)"') +
        path(CHEST_LINES + SCALES, E) + path(BODY_BACK, O);
      out += path(ARMOUR, F) + path(GORGET_FAN, E) + path(ARMOUR, O);
      out += path(HAIR, F) + path(HAIR_LINES, E) + path(HAIR, O);
      out += path(BODY_FRONT, F) + path(HELM, 'fill="url(#' + u + '-hl)"') + path(HELM_LINES + FACE_LINES + HW.lines, E) + path(BODY_FRONT, O);
      out += path(EYE, 'fill="#5e3a08"');
      out += HELM_RIVETS.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#7a4f0e"/>'; }).join('');
      return out;
    }
    function inkMask(u) {
      var m = '<rect x="0" y="0" width="1000" height="1000" fill="#fff" fill-opacity=".85"/>';
      m += wingMask(WR) + wingMask(WL);
      m += GLINTS.map(function (g) { return '<circle cx="' + n(g[0]) + '" cy="' + n(g[1]) + '" r="' + n(g[2] * 0.9) + '" fill="#fff"/>'; }).join('');
      var G = 'fill="#9a9a9a"', W = 'fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"', Wl = 'stroke="#fff" stroke-width="2.2" fill="none"';
      m += path(BODY_BACK, G) + path(CHEST_LINES + SCALES, Wl) + path(BODY_BACK, W);
      m += path(ARMOUR, G) + path(GORGET_FAN, Wl) + path(ARMOUR, W);
      m += path(HAIR, G) + path(HAIR_LINES, Wl) + path(HAIR, W);
      m += path(BODY_FRONT, G) + path(HELM_LINES + FACE_LINES + HW.lines, Wl) + path(BODY_FRONT, W);
      m += path(EYE, 'fill="#fff"');
      return m;
    }
    function relief(u) {
      var inner = '<g fill-opacity=".3">' + WL.cells.concat(WR.cells).map(function (c) { return path(c.d); }).join('') + '</g>' +
        path(TORSO, 'fill-opacity=".55"') + path(HAIR, 'fill-opacity=".7"') + path(NECK + FACE, 'fill-opacity=".85"') +
        path(HELM + HW.d, 'fill-opacity="1"') + path(ARMOUR, 'fill-opacity=".9"');
      return reliefWrap(u, inner, 2.4);
    }
    return { metal: 'au', field: field, inkMask: inkMask, relief: relief };
  })();

  /* ================================================================= HEIMDALL
     Legendary gold (the hero). Heimdall at Asgard's gate sounding the
     Gjallarhorn; a full-colour enamel aurora bridge sweeps rim to rim with a
     violet and a mint dot at its feet (the Bifrost mark); deep mirror-proof sky
     with a micro starfield; Art Deco gate architecture; god-rays. */
  var HEIMDALL = (function () {
    var BR = { cx: 500, cy: 628, rx: 282, ry: 372, w: 58 }; // bridge half-ellipse (logo proportions)
    var DOOR = { x0: 414, x1: 586, top: 404, sill: 772 };
    function arcPath(rx, ry) {
      return 'M' + P(BR.cx - rx, BR.cy) + 'A' + n(rx) + ' ' + n(ry) + ' 0 0 1 ' + P(BR.cx + rx, BR.cy);
    }
    // gate architecture -----------------------------------------------------
    function stepTower(x0, x1, top, steps) {
      // ziggurat-topped pylon from x0..x1, top y, down to the sill
      var pts = [[x0, DOOR.sill]], st = steps || 3, inset = (x1 - x0) * 0.14;
      for (var i = 0; i < st; i++) {
        var y = top + (st - 1 - i) * 0; // placeholder
      }
      var w = x1 - x0, d = 'M' + P(x0, DOOR.sill);
      d += 'L' + P(x0, top + 54) + 'L' + P(x0 + inset, top + 54) + 'L' + P(x0 + inset, top + 26) + 'L' + P(x0 + inset * 2, top + 26) + 'L' + P(x0 + inset * 2, top) +
        'L' + P(x1 - inset * 2, top) + 'L' + P(x1 - inset * 2, top + 26) + 'L' + P(x1 - inset, top + 26) + 'L' + P(x1 - inset, top + 54) + 'L' + P(x1, top + 54) + 'L' + P(x1, DOOR.sill) + 'Z';
      return d;
    }
    var PYL_L = stepTower(326, 414, 352), PYL_R = stepTower(586, 674, 352);
    // central gate block with a tall stepped arch opening
    var GATE = 'M404,' + DOOR.sill + 'L404,384L432,384L432,362L458,362L458,340L542,340L542,362L568,362L568,384L596,384L596,' + DOOR.sill + 'Z';
    var OPEN = 'M' + DOOR.x0 + ',' + DOOR.sill + 'L' + DOOR.x0 + ',476L432,476L432,452L452,452L452,430L472,430L472,412L528,412L528,430L548,430L548,452L568,452L568,476L' + DOOR.x1 + ',476L' + DOOR.x1 + ',' + DOOR.sill + 'Z';
    var WALLS = 'M246,' + DOOR.sill + 'L246,560L262,560L262,546L282,546L282,560L298,560L298,546L318,546L318,560L326,560L326,' + DOOR.sill + 'Z' +
      'M674,' + DOOR.sill + 'L674,560L682,560L682,546L702,546L702,560L718,560L718,546L738,546L738,560L754,560L754,' + DOOR.sill + 'Z';
    var STEPS = 'M196,' + DOOR.sill + 'H804V860H196Z';
    var ARCH_LINES = (function () {
      var d = '';
      // fluting on the pylons
      [[326, 414], [586, 674]].forEach(function (p) { for (var k = 1; k < 5; k++) { var x = lerp(p[0] + 12, p[1] - 12, k / 5); d += 'M' + n(x) + ',420V' + (DOOR.sill - 14); } d += 'M' + p[0] + ',406H' + p[1] + 'M' + p[0] + ',' + (DOOR.sill - 14) + 'H' + p[1]; });
      // keystone fan above the opening
      for (var i = 0; i <= 8; i++) { var a = lerp(200, 340, i / 8) * D, p0 = pol(500, 404, 14, a), p1 = pol(500, 404, 52, a); d += 'M' + P(p0[0], p0[1]) + 'L' + P(p1[0], p1[1]); }
      // steps
      for (var s = 1; s < 5; s++) { var y = DOOR.sill + s * 16; d += 'M196,' + y + 'H804'; }
      // masonry on walls
      for (var r = 0; r < 12; r++) { var y2 = 576 + r * 16; d += 'M246,' + y2 + 'H326M674,' + y2 + 'H754'; }
      return d;
    })();
    // Heimdall ------------------------------------------------------------
    var HORN_SP = (function () { var a = []; for (var i = 0; i <= 16; i++) { var t = i / 16; a.push([lerp(516, 676, t) - Math.sin(t * PI) * 10, lerp(526, 376, t) + Math.sin(t * PI) * 34 - t * t * 8]); } return a; })();
    var HORN_RB = ribbonPts(HORN_SP, function (t) { return lerp(7, 34, Math.pow(t, 1.6)); });
    var HORN = smooth(HORN_RB.L.concat(HORN_RB.R.slice().reverse()), true, 0.8);
    var BELL = (function () { var e = HORN_SP[16], p = HORN_SP[15], a = Math.atan2(e[1] - p[1], e[0] - p[0]); var q = pol(e[0], e[1], 4, a); return { x: q[0], y: q[1], a: a }; })();
    var HORN_BANDS = (function () { var d = ''; [0.3, 0.55, 0.78, 0.93].forEach(function (t) { var i = Math.round(t * 16); d += 'M' + P(HORN_RB.L[i][0], HORN_RB.L[i][1]) + 'L' + P(HORN_RB.R[i][0], HORN_RB.R[i][1]); }); return d; })();
    var CAPE = 'M502,552C476,558 452,584 436,630C420,676 400,722 366,766L384,774L398,764L414,776L430,764L446,774L460,762C458,716 466,662 484,616C490,598 496,580 506,566Z';
    var CAPE_LINES = 'M482,580C462,620 444,680 410,766M494,592C478,640 466,700 446,770M470,600C454,650 432,710 392,768';
    var TORSO_H = 'M498,536L514,536L516,550C524,552 530,558 530,568L526,606C524,622 524,634 524,644L490,644C490,632 488,618 486,604L484,572C484,560 490,552 498,550Z';
    var SKIRT = 'M490,642L524,642L540,706C520,714 494,714 474,706Z';
    var HEAD = 'M496,520C494,508 502,500 512,501C520,502 524,508 524,514L528,520C528,523 525,524 523,524L524,530L516,538C506,540 498,534 496,524Z';
    var BEARD = 'M506,532C510,540 512,548 508,558C516,554 522,546 524,536L522,528Z';
    var HELMH = 'M494,516C492,500 502,490 514,490C524,490 530,498 530,510L524,512C520,506 512,504 504,506L500,520Z';
    var CREST = 'M506,492C496,474 476,466 456,470C470,474 482,482 490,494Z' + 'M512,490L516,474L520,490Z';
    // limbs as rounded strokes: [path, width]
    var LIMBS = [
      ['M494,566L512,594L530,524', 13],          // far arm up to the horn
      ['M522,566L552,574L552,516', 13],          // near arm up to the horn
      ['M500,700L486,736L470,768', 18],          // back leg
      ['M516,700L536,732L546,768', 18]           // front leg
    ];
    var BOOTS = 'M458,762L482,762L486,776L452,776Z' + 'M536,762L560,762L566,776L532,776Z';
    var HANDS = [[530, 520, 8], [552, 512, 8]];
    var BELT = 'M488,640L526,640L526,650L488,650Z';
    var FIG = CAPE + TORSO_H + SKIRT + HEAD + BEARD + HELMH + CREST + BOOTS;
    var FIG_LINES = CAPE_LINES + 'M480,676L532,676M478,692L536,692M496,560L500,600M506,512L510,512';
    function limbs(stroke, w0) {
      return LIMBS.map(function (l) { return '<path d="' + l[0] + '" fill="none" stroke="' + stroke + '" stroke-width="' + (l[1] + w0) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }).join('');
    }
    function hands(fill, r0) { return HANDS.map(function (h) { return '<circle cx="' + h[0] + '" cy="' + h[1] + '" r="' + (h[2] + r0) + '" fill="' + fill + '"/>'; }).join(''); }
    // sky -------------------------------------------------------------------
    var STARS = (function () {
      var r = rng(25), out = [];
      for (var i = 0; i < 900; i++) {
        var x = 170 + r() * 660, y = 172 + r() * 640, rr = Math.hypot(x - 500, y - 500);
        if (rr > 324) continue;
        var inDoor = x > DOOR.x0 + 4 && x < DOOR.x1 - 4 && y > 480 && y < 700;
        if (!inDoor && y > 336 && x > 320 && x < 680) continue; // behind the gate
        var e = Math.hypot((x - BR.cx) / BR.rx, (y - BR.cy) / BR.ry); if (Math.abs(e - 1) < 0.135 && y < BR.cy + 30) continue; // on the bridge
        if (y > 540 && (x < 340 || x > 660) && !inDoor) continue;
        if (inDoor && Math.abs(x - 510) < 70 && y > 470) continue; // keep the figure clean
        var big = Math.pow(r(), 9);
        out.push([x, y, 0.7 + big * 10 + r() * 0.8]);
      }
      return out;
    })();
    var SPARKS = (function () { // glints riding the bridge
      var r = rng(707), out = [];
      for (var i = 0; i < 9; i++) {
        var t = lerp(0.08, 0.92, (i + r() * 0.6) / 9) * PI, k = (r() - 0.5) * 0.7;
        out.push([BR.cx - Math.cos(t) * (BR.rx + k * BR.w), BR.cy - Math.sin(t) * (BR.ry + k * BR.w), 6 + r() * 9]);
      }
      return out;
    })();
    var RAYS = (function () {
      var d = '';
      for (var i = 0; i < 26; i++) {
        var a0 = lerp(-172, -8, i / 25) * D, a1 = a0 + 2.2 * D, o = [500, 640];
        var p1 = pol(o[0], o[1], 520, a0), p2 = pol(o[0], o[1], 520, a1);
        d += poly([o, p1, p2]);
      }
      return d;
    })();
    var FEET = [[BR.cx - BR.rx, BR.cy, '#7C5CFF'], [BR.cx + BR.rx, BR.cy, '#46E6A6']];
    var FIG_TF = 'translate(510,776) scale(1.14) translate(-510,-776)';
    // enamel inlays on the pylons (aurora colours) + capitals
    var INLAYS = [[370, 380, '#7C5CFF'], [630, 380, '#46E6A6']];
    function inlay(x, y) { return 'M' + P(x, y - 13) + 'L' + P(x + 10, y) + 'L' + P(x, y + 13) + 'L' + P(x - 10, y) + 'Z'; }

    function field(u) {
      var defs = rg(u + '-sky', 500, 690, 520, [[0, '#3a2408', 0.25], [0.35, '#1a0f05', 0.72], [0.7, '#0d0703', 0.86], [1, '#070402', 0.92]]) +
        rg(u + '-aur', 500, 640, 420, [[0, '#7C5CFF', 0], [0.6, '#4D8DFF', 0.0], [0.82, '#7C5CFF', 0.22], [1, '#19D3FF', 0]]) +
        lg(u + '-br', BR.cx - BR.rx - 30, 0, BR.cx + BR.rx + 30, 0, [[0, '#7C5CFF'], [0.36, '#4D8DFF'], [0.66, '#19D3FF'], [1, '#46E6A6']]) +
        lg(u + '-door', 0, DOOR.top, 0, DOOR.sill, [[0, '#120a3a'], [0.45, '#2a1e8a'], [0.75, '#2f7dff'], [1, '#9ff7ff']]) +
        rg(u + '-doorglow', 500, DOOR.sill, 190, [[0, '#ffffff', 0.95], [0.25, '#b9fbff', 0.7], [0.6, '#46E6A6', 0.25], [1, '#19D3FF', 0]]) +
        lg(u + '-frost', 0, 330, 0, 860, [[0, '#FFF8E2'], [0.5, '#F7E3A8'], [1, '#E2BA62']]) +
        lg(u + '-horn', 516, 526, 676, 376, [[0, '#E8D9B5'], [0.6, '#F3E2B3'], [1, '#FFF6DC']]) +
        rg(u + '-rays', 500, 640, 480, [[0, '#FFE7A8', 0.55], [0.6, '#F2C66D', 0.22], [1, '#F2C66D', 0]]) +
        blurF(u + '-b8', 8) + blurF(u + '-b3', 3);
      var out = '<defs>' + defs + '</defs>';
      // deep mirror sky + god-rays
      out += '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-sky)"/>';
      out += '<rect x="140" y="140" width="720" height="720" fill="url(#' + u + '-aur)"/>';
      out += path(RAYS, 'fill="url(#' + u + '-rays)"');
      // micro starfield (bright ink so it still sparkles if the mask is ignored)
      out += '<g fill="#FFF4DC">' + STARS.map(function (s) { return s[2] > 4.2 ? path(star4(s[0], s[1], s[2], 0.13, 0)) : '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.55) + '"/>'; }).join('') + '</g>';
      // aurora bridge: halo, enamel band, lane wires, shimmer
      var bw = BR.w;
      out += '<path d="' + arcPath(BR.rx, BR.ry) + '" fill="none" stroke="url(#' + u + '-br)" stroke-width="' + (bw + 46) + '" stroke-opacity=".45" filter="url(#' + u + '-b8)"/>';
      out += '<path d="' + arcPath(BR.rx, BR.ry) + '" fill="none" stroke="url(#' + u + '-br)" stroke-width="' + bw + '"/>';
      var lanes = '';
      [[-0.375, '#7C5CFF', 0.35], [-0.125, '#ffffff', 0.1], [0.125, '#ffffff', 0.22], [0.375, '#ffffff', 0.32]].forEach(function (k) { lanes += '<path d="' + arcPath(BR.rx + k[0] * bw, BR.ry + k[0] * bw) + '" fill="none" stroke="' + k[1] + '" stroke-opacity="' + k[2] + '" stroke-width="' + (bw * 0.25) + '"/>'; });
      out += lanes;
      out += '<path d="' + arcPath(BR.rx - bw * 0.38, BR.ry - bw * 0.38) + '" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round"/>';
      out += SPARKS.map(function (g) { return '<circle cx="' + n(g[0]) + '" cy="' + n(g[1]) + '" r="' + n(g[2] * 1.2) + '" fill="#ffffff" fill-opacity=".35" filter="url(#' + u + '-b3)"/>' + path(star4(g[0], g[1], g[2], 0.12, 0), 'fill="#ffffff"'); }).join('');
      // gate
      out += path(WALLS + PYL_L + PYL_R + GATE + STEPS, 'fill="url(#' + u + '-frost)"');
      out += path(OPEN, 'fill="url(#' + u + '-door)"');
      out += '<g clip-path="url(#' + u + '-oc)"></g>';
      out += '<ellipse cx="500" cy="' + DOOR.sill + '" rx="150" ry="120" fill="url(#' + u + '-doorglow)"/>';
      out += path(ARCH_LINES, 'stroke="#7a4f0e" stroke-width="1.8" fill="none"');
      out += INLAYS.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="20" fill="' + q[2] + '" fill-opacity=".5" filter="url(#' + u + '-b3)"/>' + path(inlay(q[0], q[1]), 'fill="' + q[2] + '"'); }).join('');
      out += path(WALLS + PYL_L + PYL_R + GATE + OPEN, 'fill="none" stroke="#5e3a08" stroke-width="2.4"');
      // bridge feet: violet + mint enamel discs on gold pedestals
      FEET.forEach(function (f) {
        out += '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="40" fill="' + f[2] + '" fill-opacity=".45" filter="url(#' + u + '-b8)"/>' +
          '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="27" fill="' + f[2] + '"/><circle cx="' + (f[0] - 8) + '" cy="' + (f[1] - 9) + '" r="8" fill="#ffffff" fill-opacity=".45"/>';
      });
      // Heimdall
      var FR = 'url(#' + u + '-frost)', OL = '#4a2c05';
      out += '<g transform="' + FIG_TF + '">';
      out += path(CAPE, 'fill="' + FR + '" stroke="' + OL + '" stroke-width="2.4"') + path(CAPE_LINES, 'stroke="#7a4f0e" stroke-width="1.6" fill="none"');
      out += limbs(OL, 5) + limbs(FR, 0);
      out += path(TORSO_H + SKIRT + HEAD + BEARD + HELMH + CREST + BOOTS, 'fill="' + FR + '" stroke="' + OL + '" stroke-width="2.4" stroke-linejoin="round"');
      out += path(BELT, 'fill="#c8952e" stroke="' + OL + '" stroke-width="2"') + path('M480,676L532,676M478,692L536,692M498,560L502,600', 'stroke="#7a4f0e" stroke-width="1.6" fill="none"');
      out += path(HORN, 'fill="url(#' + u + '-horn)" stroke="#5e3a08" stroke-width="2.4"') + path(HORN_BANDS, 'stroke="#8a5a12" stroke-width="2.6"');
      out += hands(OL, 2.5) + hands(FR, 0);
      out += '<g fill="none" stroke-linecap="round">' + [30, 50, 72].map(function (r, i) { var a0 = BELL.a - 0.55, a1 = BELL.a + 0.55, p0 = pol(BELL.x, BELL.y, r, a0), p1 = pol(BELL.x, BELL.y, r, a1); return '<path d="M' + P(p0[0], p0[1]) + 'A' + r + ' ' + r + ' 0 0 1 ' + P(p1[0], p1[1]) + '" stroke="#FFF4DC" stroke-opacity="' + (0.8 - i * 0.22) + '" stroke-width="' + (2.6 - i * 0.6) + '"/>'; }).join('') + '</g>';
      out += '</g>';
      return out;
    }
    function inkMask(u) {
      var m = FULL;
      // micro-engraved stars: bare polished gold
      m += '<g fill="#000">' + STARS.map(function (s) { return s[2] > 4.2 ? path(star4(s[0], s[1], s[2], 0.13, 0)) : '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.55) + '"/>'; }).join('') + '</g>';
      // bridge enamel fully printed, with bare-gold cloisonne lane wires + edges
      var bw = BR.w;
      m += '<path d="' + arcPath(BR.rx, BR.ry) + '" fill="none" stroke="#fff" stroke-width="' + bw + '"/>';
      [-0.5, -0.25, 0, 0.25, 0.5].forEach(function (k) { m += '<path d="' + arcPath(BR.rx + k * bw, BR.ry + k * bw) + '" fill="none" stroke="#000" stroke-width="' + (Math.abs(k) === 0.5 ? 3.2 : 2) + '"/>'; });
      // gate: frosted gold (partial ink) with engraved lines; opening fully printed
      m += path(WALLS + PYL_L + PYL_R + GATE + STEPS, 'fill="#8c8c8c"');
      m += path(OPEN, 'fill="#fff"');
      m += path(ARCH_LINES, 'stroke="#fff" stroke-width="2.2" fill="none"');
      m += path(WALLS + PYL_L + PYL_R + GATE + OPEN, 'fill="none" stroke="#fff" stroke-width="2.8"');
      m += INLAYS.map(function (q) { return path(inlay(q[0], q[1]), 'fill="#fff" stroke="#000" stroke-width="3"'); }).join('');
      // feet discs: enamel with a bare-gold ring
      FEET.forEach(function (f) { m += '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="27" fill="#fff" stroke="#000" stroke-width="5"/>'; });
      // figure: frosted gold
      m += '<g transform="' + FIG_TF + '">';
      m += path(CAPE, 'fill="#9a9a9a" stroke="#fff" stroke-width="2.8"') + path(CAPE_LINES, 'stroke="#fff" stroke-width="2" fill="none"');
      m += limbs('#fff', 5.5) + limbs('#9a9a9a', 0);
      m += path(TORSO_H + SKIRT + HEAD + BEARD + HELMH + CREST + BOOTS, 'fill="#9a9a9a" stroke="#fff" stroke-width="2.8"');
      m += path(BELT, 'fill="#fff"') + path('M480,676L532,676M478,692L536,692M498,560L502,600', 'stroke="#fff" stroke-width="2" fill="none"');
      m += path(HORN, 'fill="#e6e6e6" stroke="#fff" stroke-width="2.8"') + path(HORN_BANDS, 'stroke="#fff" stroke-width="3"');
      m += hands('#fff', 3) + hands('#9a9a9a', 0);
      m += '</g>';
      return m;
    }
    function relief(u) {
      var inner = '<path d="' + arcPath(BR.rx, BR.ry) + '" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="' + BR.w + '"/>' +
        path(WALLS + PYL_L + PYL_R + GATE, 'fill-opacity=".55"') + path(STEPS, 'fill-opacity=".35"') +
        path(FIG, 'fill-opacity="1"') + path(HORN, 'fill-opacity="1"') + '<g fill="none" stroke="#fff">' + LIMBS.map(function (l) { return '<path d="' + l[0] + '" stroke-width="' + l[1] + '" stroke-linecap="round"/>'; }).join('') + '</g>' +
        FEET.map(function (f) { return '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="27" fill-opacity=".8"/>'; }).join('');
      return reliefWrap(u, inner, 2.4);
    }
    return { metal: 'au', field: field, inkMask: inkMask, relief: relief };
  })();

  /* ============================================================== JORMUNGANDR
     The world serpent in emerald -> cyan cloisonne enamel coiled around the
     field biting its own tail; dorsal spines push out to the rim; deep-blue
     enamel waves over a mirror-silver ocean with Thor's longship. */
  var JORMUNGANDR = (function () {
    var R0 = 262, T0 = -88, T1 = 264; // body from tail tip (deg) clockwise to the neck
    function rad(th) { return R0 + 7 * Math.sin(th * D * 5 + 0.6); }
    function bodyW(s) { return 12 + 54 * (1 - Math.pow(1 - s, 2.6)); }
    function spineAt(s) { var th = lerp(T0, T1, s); var r = rad(th); return [500 + r * Math.cos(th * D), 500 + r * Math.sin(th * D), th]; }
    var NS = 170;
    var SPINE = []; for (var i = 0; i <= NS; i++) SPINE.push(spineAt(i / NS));
    var RB = ribbonPts(SPINE.map(function (p) { return [p[0], p[1]]; }), bodyW);
    // travelling clockwise, RB.L is the inner edge and RB.R the outer edge
    var BODY = smooth(RB.L.concat(RB.R.slice().reverse()), true, 0.6);
    // body segments (for the colour ramp) and scales
    function segs() {
      var out = [];
      for (var i = 0; i < NS; i++) out.push({ d: poly([RB.L[i], RB.L[i + 1], RB.R[i + 1], RB.R[i]]), s: i / NS });
      return out;
    }
    var SEGS = segs();
    function scales() {
      var d = '';
      var rows = 4;
      for (var i = 2; i < NS - 1; i += 2) {
        var s = i / NS, w = bodyW(s);
        if (w < 16) continue;
        for (var k = 0; k < rows; k++) {
          var f0 = (k + 0.15) / rows, f1 = (k + 0.85) / rows, fm = (k + 0.5) / rows;
          var off = (i / 2) % 2 ? 0.5 / rows : 0;
          if (k === rows - 1 && off) continue;
          var a = [lerp(RB.L[i][0], RB.R[i][0], f0 + off), lerp(RB.L[i][1], RB.R[i][1], f0 + off)];
          var b = [lerp(RB.L[i][0], RB.R[i][0], f1 + off), lerp(RB.L[i][1], RB.R[i][1], f1 + off)];
          var j = Math.min(i + 3, NS);
          var c = [lerp(RB.L[j][0], RB.R[j][0], fm + off), lerp(RB.L[j][1], RB.R[j][1], fm + off)];
          d += 'M' + P(a[0], a[1]) + 'Q' + P(c[0], c[1]) + ' ' + P(b[0], b[1]);
        }
      }
      return d;
    }
    var SCALES = scales();
    // ventral plates along the inner edge
    function belly() {
      var band = [], d = '';
      for (var i = 0; i <= NS; i++) { band.push([lerp(RB.L[i][0], RB.R[i][0], 0.22), lerp(RB.L[i][1], RB.R[i][1], 0.22)]); }
      var poly1 = RB.L.slice(4).concat(band.slice(4).reverse());
      for (var k = 6; k < NS; k += 3) d += 'M' + P(RB.L[k][0], RB.L[k][1]) + 'L' + P(band[k][0], band[k][1]);
      return { band: poly(poly1), lines: d };
    }
    var BELLY = belly();
    // dorsal spines on the outer edge
    function spines() {
      var d = '';
      for (var i = 8; i < NS - 4; i += 6) {
        var s = i / NS, h = 10 + bodyW(s) * 0.42;
        var p0 = RB.R[i], p1 = RB.R[i + 4], pm = RB.R[i];
        var th = SPINE[i][2] * D;
        var tip = [pm[0] + Math.cos(th) * h + Math.sin(th) * h * 0.55, pm[1] + Math.sin(th) * h - Math.cos(th) * h * 0.55];
        d += 'M' + P(p0[0], p0[1]) + 'Q' + P(lerp(p0[0], tip[0], 0.6) + 2, lerp(p0[1], tip[1], 0.6)) + ' ' + P(tip[0], tip[1]) + 'Q' + P(lerp(p1[0], tip[0], 0.4), lerp(p1[1], tip[1], 0.4)) + ' ' + P(p1[0], p1[1]) + 'Z';
      }
      return d;
    }
    var SPINES = spines();
    // head (local coords: facing +x, neck at x=-50) placed at the top
    var HEAD_TF = (function () { var p = spineAt(1); var th = p[2] + 90; return 'translate(' + P(p[0], p[1]) + ') rotate(' + n(th) + ')'; })();
    var HEAD = 'M-52,-30C-30,-34 -6,-36 14,-30C32,-25 52,-20 70,-14C80,-11 84,-6 80,-2L44,-4L16,4L46,16C60,20 66,26 60,30C40,34 14,34 -8,32C-28,30 -44,30 -56,28Z';
    var HEAD_HORNS = 'M-20,-31C-38,-48 -62,-56 -84,-54C-66,-48 -50,-40 -38,-28Z M2,-34C-8,-52 -24,-64 -44,-70C-30,-58 -20,-46 -12,-33Z';
    var HEAD_LINES = 'M-40,-22C-20,-24 0,-22 18,-18M-36,22C-16,24 6,24 28,22M-8,-8C-4,-2 -4,6 -8,12';
    var FANGS = 'M50,-4L54,6L58,-3ZM64,-3L67,5L70,-2ZM34,-4L37,4L40,-4ZM44,16L47,8L50,17ZM56,21L58,13L61,22Z';
    var EYE = { x: 14, y: -18 };
    // ocean: rows of curling waves inside the ring
    function waveRow(y0, x0, x1, W, H, depth, seed) {
      var body = '', lines = '', foam = '', top = '', r = rng(seed || 1);
      for (var x = x0; x < x1; x += W) {
        var h = H * (0.85 + r() * 0.3);
        var crest = 'M' + P(x, y0) + 'C' + P(x + W * 0.25, y0 - h * 0.15) + ' ' + P(x + W * 0.45, y0 - h * 0.75) + ' ' + P(x + W * 0.72, y0 - h) +
          'C' + P(x + W * 0.9, y0 - h * 1.06) + ' ' + P(x + W * 1.02, y0 - h * 0.82) + ' ' + P(x + W * 0.96, y0 - h * 0.62) +
          'C' + P(x + W * 0.92, y0 - h * 0.48) + ' ' + P(x + W * 0.8, y0 - h * 0.5) + ' ' + P(x + W * 0.8, y0 - h * 0.64) +
          'C' + P(x + W * 0.86, y0 - h * 0.42) + ' ' + P(x + W * 0.92, y0 - h * 0.18) + ' ' + P(x + W, y0);
        body += crest + 'L' + P(x + W, y0 + depth) + 'L' + P(x, y0 + depth) + 'Z';
        top += crest;
        for (var k = 1; k <= 3; k++) {
          var f = k * 0.2;
          lines += 'M' + P(x + W * (0.05 + f * 0.5), y0 + h * f * 0.3) + 'C' + P(x + W * (0.3 + f * 0.3), y0 - h * (0.2 - f * 0.1)) + ' ' + P(x + W * (0.48 + f * 0.2), y0 - h * (0.78 - f * 0.9)) + ' ' + P(x + W * (0.7 + f * 0.05), y0 - h * (0.96 - f * 1.1));
        }
        foam += 'M' + P(x + W * 0.72, y0 - h) + 'C' + P(x + W * 0.9, y0 - h * 1.06) + ' ' + P(x + W * 1.02, y0 - h * 0.82) + ' ' + P(x + W * 0.96, y0 - h * 0.62) +
          'C' + P(x + W * 0.92, y0 - h * 0.48) + ' ' + P(x + W * 0.8, y0 - h * 0.5) + ' ' + P(x + W * 0.8, y0 - h * 0.64);
      }
      return { body: body, lines: lines, foam: foam, top: top };
    }
    var ROWS = [waveRow(522, 196, 820, 62, 30, 60, 3), waveRow(590, 150, 860, 88, 46, 80, 5), waveRow(684, 110, 900, 122, 72, 200, 7)];
    // longship riding the middle swell
    var SHIP = { x: 500, y: 512 };
    function ship() {
      var x = SHIP.x, y = SHIP.y;
      var hull = 'M' + P(x - 86, y - 30) + 'C' + P(x - 80, y - 8) + ' ' + P(x - 60, y + 10) + ' ' + P(x - 20, y + 12) + 'L' + P(x + 22, y + 12) +
        'C' + P(x + 60, y + 10) + ' ' + P(x + 82, y - 8) + ' ' + P(x + 88, y - 32) +
        'C' + P(x + 98, y - 40) + ' ' + P(x + 104, y - 54) + ' ' + P(x + 96, y - 62) + 'C' + P(x + 90, y - 58) + ' ' + P(x + 92, y - 50) + ' ' + P(x + 84, y - 42) +
        'C' + P(x + 70, y - 14) + ' ' + P(x + 40, y - 6) + ' ' + P(x, y - 6) + 'C' + P(x - 40, y - 6) + ' ' + P(x - 70, y - 14) + ' ' + P(x - 80, y - 40) +
        'C' + P(x - 88, y - 48) + ' ' + P(x - 86, y - 56) + ' ' + P(x - 94, y - 60) + 'C' + P(x - 100, y - 50) + ' ' + P(x - 94, y - 40) + ' ' + P(x - 86, y - 30) + 'Z';
      var mast = 'M' + P(x - 2, y - 6) + 'V' + n(y - 124) + 'H' + n(x + 2) + 'V' + n(y - 6) + 'Z';
      var sail = 'M' + P(x - 44, y - 112) + 'H' + n(x + 44) + 'C' + P(x + 48, y - 80) + ' ' + P(x + 46, y - 50) + ' ' + P(x + 40, y - 30) + 'H' + n(x - 40) + 'C' + P(x - 46, y - 50) + ' ' + P(x - 48, y - 80) + ' ' + P(x - 44, y - 112) + 'Z';
      var stripes = [];
      for (var k = 0; k < 5; k++) stripes.push('M' + P(x - 44 + k * 17.6 + (k ? 0 : 0), y - 112) + 'h17.6V' + n(y - 30) + 'h-17.6Z');
      var shields = []; for (var s = 0; s < 7; s++) shields.push([x - 54 + s * 18, y - 4]);
      var yard = 'M' + P(x - 50, y - 116) + 'H' + n(x + 50) + 'V' + n(y - 111) + 'H' + n(x - 50) + 'Z';
      return { hull: hull, mast: mast + yard, sail: sail, stripes: stripes, shields: shields };
    }
    var SHIPD = ship();
    var STARS = (function () { var r = rng(3131), o = []; for (var i = 0; i < 40; i++) { var x = 250 + r() * 500, y = 260 + r() * 200; if (Math.hypot(x - 500, y - 500) > 215) continue; if (Math.abs(x - SHIP.x) < 60 && y > 380) continue; o.push([x, y, 1 + Math.pow(r(), 4) * 7]); } return o; })();

    function field(u) {
      var RR = R0 + 40;
      var defs = rg(u + '-xs', 500, 500, RR, [[0, '#000', 0], [(R0 - 36) / RR, '#00283a', 0.5], [(R0 - 16) / RR, '#ffffff', 0.0], [(R0 - 2) / RR, '#ffffff', 0.32], [(R0 + 10) / RR, '#ffffff', 0.0], [(R0 + 26) / RR, '#002a30', 0.4], [1, '#001a20', 0.7]]) +
        lg(u + '-sea', 0, 470, 0, 840, [[0, '#2a6cf0'], [0.4, '#163ba8'], [1, '#0a1a5c']]) +
        lg(u + '-sea2', 0, 470, 0, 840, [[0, '#4D8DFF'], [1, '#1d47c0']]) +
        lg(u + '-sky', 0, 230, 0, 520, [[0, '#0d1a4a', 0.55], [1, '#1d47c0', 0.0]]) +
        rg(u + '-eye', 0, 0, 10, [[0, '#ffffff'], [0.4, '#7ff6ff'], [1, '#19D3FF']]) +
        blurF(u + '-b4', 4);
      var out = '<defs>' + defs + '</defs>';
      // sky inside the ring: a light navy wash fading into the silver
      out += '<rect x="140" y="140" width="720" height="400" fill="url(#' + u + '-sky)"/>';
      var hl = ''; for (var y = 232; y < 520; y += 9) hl += 'M180,' + y + 'H820';
      out += path(hl, 'stroke="#0a1a5c" stroke-opacity=".2" stroke-width="1.2" fill="none"');
      out += STARS.map(function (s) { return s[2] > 3.5 ? path(star4(s[0], s[1], s[2], 0.14, 0), 'fill="#ffffff"') : ''; }).join('');
      // waves + ship
      var r0 = ROWS[0], r1 = ROWS[1], r2 = ROWS[2];
      out += path(r0.body, 'fill="url(#' + u + '-sea2)"') + path(r0.lines, 'stroke="#bfe0ff" stroke-opacity=".5" stroke-width="1.6" fill="none"');
      out += path(SHIPD.sail, 'fill="#0b1d5c"');
      out += SHIPD.stripes.map(function (d, k) { return path(d, 'fill="' + (k % 2 ? '#46E6A6' : '#19D3FF') + '"'); }).join('');
      out += path(SHIPD.mast, 'fill="#08123a"') + path(SHIPD.hull, 'fill="#08123a"');
      out += SHIPD.shields.map(function (s, k) { return '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="6.5" fill="' + (k % 2 ? '#46E6A6' : '#19D3FF') + '"/>'; }).join('');
      out += path(r1.body, 'fill="url(#' + u + '-sea)"') + path(r1.lines, 'stroke="#bfe0ff" stroke-opacity=".45" stroke-width="1.8" fill="none"');
      out += path(r2.body, 'fill="url(#' + u + '-sea)"') + path(r2.lines, 'stroke="#bfe0ff" stroke-opacity=".4" stroke-width="2.2" fill="none"');
      // serpent: spines, body ramp, cross shading, scales
      out += path(SPINES, 'fill="#0a8a6a"');
      var SR = [[0, '#19D3FF'], [0.45, '#18c9b4'], [1, '#2bd88f']];
      out += SEGS.map(function (g) { var c = ramp(SR, g.s); return '<path d="' + g.d + '" fill="' + c + '" stroke="' + c + '" stroke-width=".8"/>'; }).join('');
      out += path(BODY, 'fill="url(#' + u + '-xs)"');
      out += path(BELLY.band, 'fill="#d9fff4" fill-opacity=".5"');
      // head
      out += '<g transform="' + HEAD_TF + '">' + path(HEAD_HORNS, 'fill="#0c8f72"') + path(HEAD, 'fill="#46E6A6"') +
        path('M-52,-30C-30,-34 -6,-36 14,-30C32,-25 52,-20 70,-14C80,-11 84,-6 80,-2L44,-4L16,4L-56,4Z', 'fill="#ffffff" fill-opacity=".12"') +
        '<circle cx="' + (EYE.x) + '" cy="' + EYE.y + '" r="14" fill="#19D3FF" fill-opacity=".5" filter="url(#' + u + '-b4)"/>' +
        '<ellipse cx="' + EYE.x + '" cy="' + EYE.y + '" rx="8" ry="6" fill="url(#' + u + '-eye)"/><ellipse cx="' + (EYE.x + 1) + '" cy="' + EYE.y + '" rx="1.6" ry="5" fill="#04202a"/></g>';
      return out;
    }
    function inkMask(u) {
      var m = FULL;
      // the sky is bare mirror silver except the faint wash; stars bare
      m += '<rect x="140" y="140" width="720" height="400" fill="#000" fill-opacity=".35"/>';
      // waves: enamel bodies; crest foam curls and wave lines in bare silver
      ROWS.forEach(function (r, k) {
        m += path(r.body, 'fill="#fff"') + path(r.lines, 'stroke="#000" stroke-width="' + (1.6 + k * 0.3) + '" fill="none" stroke-linecap="round"') +
          path(r.foam, 'stroke="#000" stroke-width="' + (3 + k) + '" fill="none" stroke-linecap="round"') + path(r.top, 'fill="none" stroke="#000" stroke-width="2.4"');
        if (k === 0) m += path(SHIPD.sail + SHIPD.mast + SHIPD.hull, 'fill="#fff"') + SHIPD.shields.map(function (s) { return '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="6.5" fill="#fff" stroke="#000" stroke-width="1.6"/>'; }).join('') +
          path(SHIPD.stripes.join(''), 'fill="none" stroke="#000" stroke-width="1.4"') + path(SHIPD.hull, 'fill="none" stroke="#000" stroke-width="1.6"');
      });
      m += STARS.map(function (s) { return s[2] > 3.5 ? path(star4(s[0], s[1], s[2], 0.14, 0), 'fill="#000"') : '<circle cx="' + n(s[0]) + '" cy="' + n(s[1]) + '" r="' + n(s[2] * 0.5) + '" fill="#000"/>'; }).join('');
      // serpent: enamel, with bare-silver scale wires, belly plates and outline
      m += path(SPINES, 'fill="#fff" stroke="#000" stroke-width="2"');
      m += path(BODY, 'fill="#fff"');
      m += path(SCALES, 'stroke="#000" stroke-width="1.7" fill="none" stroke-linecap="round"');
      m += path(BELLY.lines, 'stroke="#000" stroke-width="1.6" fill="none"');
      m += path(BODY, 'fill="none" stroke="#000" stroke-width="2.6"');
      m += '<g transform="' + HEAD_TF + '">' + path(HEAD_HORNS + HEAD, 'fill="#fff" stroke="#000" stroke-width="2.4"') + path(HEAD_LINES, 'stroke="#000" stroke-width="1.8" fill="none"') +
        path(FANGS, 'fill="#000"') + '<ellipse cx="' + EYE.x + '" cy="' + EYE.y + '" rx="10" ry="8" fill="#fff" stroke="#000" stroke-width="2"/></g>';
      return m;
    }
    function relief(u) {
      var inner = path(BODY, 'fill-opacity=".9"') + path(SPINES, 'fill-opacity=".6"') + '<g transform="' + HEAD_TF + '">' + path(HEAD + HEAD_HORNS, 'fill-opacity="1"') + '</g>' +
        ROWS.map(function (r, k) { return path(r.body, 'fill-opacity="' + (0.25 + k * 0.1) + '"'); }).join('') + path(SHIPD.hull + SHIPD.sail, 'fill-opacity=".6"');
      return reliefWrap(u, inner, 2.4);
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
    valkyrie: VALKYRIE,
    heimdall: HEIMDALL,
    jormungandr: JORMUNGANDR,
    koi: placeholder('au', '#FF7A6B', '#19D3FF')
  };
})();
