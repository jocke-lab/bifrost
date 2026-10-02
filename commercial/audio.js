/* ============================================================================
   audio.js — window.BVAudio
   Bifrost Vault commercial · v3 "the real thing" (30 s) · procedural score + the
   client's real recorded foley, pure WebAudio, mastered to -14 LUFS / <= -1 dBTP.

   - BVAudio.render()  -> Promise<AudioBuffer>  (OfflineAudioContext, 48 kHz stereo, cached)
   - BVAudio.wav()     -> Promise<ArrayBuffer>  (16-bit PCM stereo WAV of render())
   - BVAudio.enable()  -> Promise               (user gesture: AudioContext + live playback synced to BV;
                                                  while sound runs BV.clock follows the audible audio position,
                                                  so picture and sound stay locked; starts/stops/seeks are faded)
   - BVAudio.muted / BVAudio.setMuted(bool)
   - BVAudio.CUES      -> the v3 cue sheet (times mirror BVShared.CUES in scenes/00-shared.js)
   - BVAudio.foley     -> after render(): which recorded sources were used ('recorded' | 'procedural')

   Sound direction (SCRIPT_V3 "Sound"): premium and restrained, never EDM, never casino.
   A sparse low pulse and pads, a few big, beautiful hits on the key moments, glassy
   shimmers, near-silence before the case opens. No reel spins, coin hoppers, slot bells,
   buzzers, scratches or chiptune.

   Recorded material (fetched at render time, relative to this script; fetch -> XHR fallback
   so it also works from file:// in the render tool; if both fail the score falls back to
   procedural stand-ins and still renders):
   - assets/sound/bifrost-recorded-foley.wav  CC0 jewellery-box foley (see sound-credits.txt):
       clasp 2.90-3.62 s (clicks 3.225 / 3.315), latch 3.88-4.60 (clicks 3.93 / 4.03),
       leather + lid 4.62-6.14, lid settle 6.18-6.72 (click 6.37), lift rustle 8.18-9.08.
   - assets/sound/box-film-audio.wav  the sealed-case film's own track (vault-opening-hq.mp4,
       0-4.6 s, mono 48 kHz): rising low bed 0-2.9 s, release hit at 3.085 s.

   Deterministic: every noise buffer / random choice comes from mulberry32(2026); the recorded
   files are decoded losslessly (PCM WAV at the context rate, no resampling).
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ CUES (v3, 30 s)
  // 120 BPM -> beat 0.5 s, bar 2.0 s. D minor; the coin clearing the rim (16.1) lifts to D MAJOR.
  const CUES = {
    version: 'v3-30s', bpm: 120, beat: 0.5, bar: 2.0, key: 'D minor -> D major @ 16.1',
    scenes: [
      { id: 'hook', start: 0.0, end: 2.5 }, { id: 'five', start: 2.5, end: 5.0 }, { id: 'mint', start: 5.0, end: 10.0 },
      { id: 'box', start: 10.0, end: 20.0 }, { id: 'decide', start: 20.0, end: 25.0 }, { id: 'end', start: 25.0, end: 30.0 }
    ],
    // 01 hook
    hookSweep: 0.0, caughtYourEye: 0.9, hookPullBack: 1.6,
    // 02 the five (hard cuts on the half-beats), pitched per coin
    five: [2.5, 3.0, 3.5, 4.0, 4.5], fivePitch: [74, 77, 81, 84, 86], fiveRow: 4.6,   // the row snaps together 4.58-4.86 (02-five T_ROW)
    // 03 mint the one you love (premium groove 5.0-10.0)
    mint: 5.0, tapCoin: 5.8, sheet: 6.4, tapMint: 7.2, confirmed: 8.2, certificate: 8.6,
    // 04 or let the box choose
    box: 10.0, nearSilence: [10.0, 12.6], seamPulses: [11.1, 12.2], release: 12.65, latch: 13.0,
    slowmo: [13.0, 15.0], freeze: 15.0, rise: 15.2, clearsRim: 16.1, result: 17.0,
    // 05 your coin, your call
    decide: [20.0, 21.25, 22.5, 23.75], buybackRing: [23.8, 24.5], buybackConfirm: 24.5,
    // 06 end card
    end: 25.0, logo: 25.8, glint: 28.8, tailEnd: 29.8,
    // recorded foley placement: src = [in, out] seconds in bifrost-recorded-foley.wav,
    // align = the source moment that lands exactly on `at`, rate < 1 = slowed (and pitched down)
    foley: {
      clasp: { src: [2.90, 3.62], align: 3.315, at: 13.0, rate: 1, gain: 0.30, pan: -0.25 },
      latch: { src: [3.88, 4.60], align: 4.03, at: 13.0, rate: 1, gain: 0.62, pan: 0.15 },
      lid: { src: [4.62, 6.14], align: 4.62, at: 13.04, rate: 0.76, gain: 0.8, pan: 0.1 },
      settle: { src: [6.18, 6.72], align: 6.3682, at: 15.0, rate: 0.85, gain: 0.16, pan: 0.2 },     // the lid stops on the freeze
      rustle: { src: [8.40, 9.08], align: 8.4379, at: 15.2, rate: 0.85, gain: 1.2, pan: 0 }        // first brush on the rise, to ~15.96
    },
    // the case film's own track: the seam bed at 1x under 10.0-12.9 (film 0-2.9), then the release
    // slowed like the picture (film 3.0-4.375 over 13.0-15.0 = rate 0.6875) with its hit on the latch
    film: {
      bed: { src: [0.0, 2.9], at: 10.0, rate: 1, gain: 0.07 },
      release: { src: [2.98, 4.6], align: 3.085, at: 13.0, rate: 0.6875, gain: 0.5 }
    },
    silences: [],
    dips: [[16.05, 16.1, 0.5], [24.93, 25.0, 0.3]]   // pre-hit 'suck' so the bloom / final impact read as peaks
  };

  // asset URLs resolve against this script (works for the site, scratch pages and file://)
  const SCRIPT_BASE = (function () {
    try { const s = document.currentScript; return (s && s.src) || document.baseURI || ''; } catch (e) { return ''; }
  })();
  const ASSETS = { foley: 'assets/sound/bifrost-recorded-foley.wav', film: 'assets/sound/box-film-audio.wav' };
  const assetURL = (p) => { try { return new URL(p, SCRIPT_BASE).href; } catch (e) { return p; } };

  const SR = 48000;
  const TARGET_LUFS = -14;
  const CEIL_DBTP = -1.5;   // sample-peak ceiling of the 4x-oversampled limiter (measured true peak lands <= -1 dBTP)

  // ------------------------------------------------------------- helpers
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function getDuration() {
    const bv = window.BV, cfg = window.BV_CONFIG;
    return (bv && bv.duration) || (cfg && cfg.film && cfg.film.duration) || 30;
  }

  // RBJ biquad for JS-side buffer synthesis
  function jsBiquad(type, f, q) {
    const w0 = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // band-pass (0 dB peak)
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return function (x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
    };
  }
  // band-limited saw (polyBLEP)
  function blepSaw(p, dt) {
    let v = 2 * p - 1;
    if (p < dt) { const x = p / dt; v -= x + x - x * x - 1; }
    else if (p > 1 - dt) { const x = (p - 1) / dt; v -= x * x + x + x + 1; }
    return v;
  }
  // band-limited square (difference of two polyBLEP saws): +1 for p < 0.5, -1 after
  const blepSq = (p, dt) => blepSaw((p + 0.5) % 1, dt) - blepSaw(p, dt);
  // biquad with re-computable coefficients (state kept across updates): 'lp' | 'hp' | 'bp'
  function jsBiquadState(prev, type, f, q) {
    const st = prev || { x1: 0, x2: 0, y1: 0, y2: 0 };
    const w0 = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cw = Math.cos(w0), al = Math.sin(w0) / (2 * q), a0 = 1 + al;
    if (type === 'hp') { st.b0 = (1 + cw) / 2 / a0; st.b1 = -(1 + cw) / a0; st.b2 = st.b0; }
    else if (type === 'bp') { st.b0 = al / a0; st.b1 = 0; st.b2 = -al / a0; }
    else { st.b0 = (1 - cw) / 2 / a0; st.b1 = (1 - cw) / a0; st.b2 = st.b0; }
    st.a1 = -2 * cw / a0; st.a2 = (1 - al) / a0;
    if (!st.run) st.run = function (x) {
      const y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
      st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y; return y;
    };
    return st;
  }
  const TAU = 2 * Math.PI;

  // Cooperative yielding: the synthesis is long, so it hands the main thread back to the page
  // about every 30 ms (the film keeps animating while the soundtrack renders on enable()).
  // MessageChannel tasks are not throttled in background tabs, unlike setTimeout.
  const yieldTask = (function () {
    if (typeof MessageChannel === 'undefined') return () => new Promise((r) => setTimeout(r, 0));
    const ch = new MessageChannel(), q = [];
    ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
    return () => new Promise((r) => { q.push(r); ch.port2.postMessage(0); });
  })();
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let sliceT = 0;
  function slice() {
    if (nowMs() - sliceT < 30) return Promise.resolve();
    return yieldTask().then(() => { sliceT = nowMs(); });
  }
  const FX_SR = 24000; // reverbs + delay run in a half-rate FX context (their returns are dark anyway)


  // =====================================================================
  //  RECORDED SOURCES: fetch (http/https) -> XHR fallback (file://, the render tool runs Chromium
  //  with --allow-file-access-from-files) -> decodeAudioData. Never rejects: a source that cannot
  //  be loaded resolves to null and the score uses its procedural stand-in.
  // =====================================================================
  function fetchBytes(url) {
    const viaXHR = () => new Promise((resolve, reject) => {
      if (typeof XMLHttpRequest === 'undefined') { reject(new Error('no XHR')); return; }
      const x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
      x.onload = () => {
        const ok = (x.status === 200 || x.status === 0) && x.response && x.response.byteLength > 44;
        if (ok) resolve(x.response); else reject(new Error('XHR ' + x.status));
      };
      x.onerror = () => reject(new Error('XHR failed'));
      try { x.send(); } catch (e) { reject(e); }
    });
    // fetch() does not support file:// in Chromium (it rejects with a console error): go straight to XHR there
    if (typeof fetch !== 'function' || /^file:/i.test(url)) return viaXHR();
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).catch(viaXHR);
  }
  function decode(bytes) {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const c = new Ctx(2, 1, SR);
    return new Promise((resolve, reject) => {
      const p = c.decodeAudioData(bytes, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    }).then((b) => {
      const L = new Float32Array(b.getChannelData(0));
      const R = b.numberOfChannels > 1 ? new Float32Array(b.getChannelData(1)) : L;
      return { L: L, R: R, sr: b.sampleRate, duration: b.duration };
    });
  }
  let samplesPromise = null;
  function loadSamples() {
    if (!samplesPromise) {
      const one = (key) => fetchBytes(assetURL(ASSETS[key])).then(decode).then((s) => {
        if (s.sr !== SR) throw new Error('unexpected sample rate ' + s.sr);
        return s;
      }).catch((e) => {
        if (typeof console !== 'undefined') console.warn('[BVAudio] ' + ASSETS[key] + ' unavailable (' + (e && e.message) + '); using the procedural stand-in');
        return null;
      });
      samplesPromise = Promise.all([one('foley'), one('film')]).then((r) => ({ foley: r[0], film: r[1] }));
    }
    return samplesPromise;
  }
  async function build(opts, samples) {
    opts = opts || {};
    const dur = getDuration();
    const N = Math.round(SR * dur);
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(2, N, SR);
    const rnd = mulberry32(2026);
    const rr = (a, b) => a + (b - a) * rnd();
    const T = (t) => Math.round(t * SR);

    // ---------------------------------------------------- JS buffer helpers
    function mk(seconds, chans, fill) {
      const n = Math.max(2, Math.round(seconds * SR));
      if (chans === 1) { const d = new Float32Array(n); fill(d, 0, n); return d; }
      const L = new Float32Array(n), R = new Float32Array(n); fill(L, 0, n); fill(R, 1, n); return [L, R];
    }
    const memo = new Map();
    function cached(key, seconds, chans, fill) {
      let b = memo.get(key);
      if (!b) { b = mk(seconds, chans, fill); memo.set(key, b); }
      return b;
    }
    const env1 = (tt, a, tau) => (tt < a ? tt / a : Math.exp(-(tt - a) / tau)); // linear attack, exp decay

    // ---------------------------------------------------- stems
    const stems = {};
    function stem(name, chans, seconds) {
      const n = seconds ? Math.min(N, Math.round(seconds * SR)) : N;
      const b = ctx.createBuffer(chans, n, SR);
      stems[name] = { buf: b, L: b.getChannelData(0), R: chans > 1 ? b.getChannelData(1) : null, n: n };
    }
    ['drum', 'pad', 'arp', 'lead', 'sfx'].forEach((s) => stem(s, 2));
    stem('bass', 1); stem('sub', 1); stem('foley', 2);
    const sendRev = new Float32Array(N), sendHuge = new Float32Array(N), sendDly = new Float32Array(N);

    // mix a mono (Float32Array) or stereo ([L, R]) source into a stem, StereoPanner-style panning,
    // pan may be a number, null (no pan law) or [p0, p1, t0, t1] (linear pan ramp, absolute seconds)
    function mixIn(name, src, t, g, o) {
      o = o || {};
      const S = stems[name], st = T(t);
      const stereoSrc = Array.isArray(src);
      const sL = stereoSrc ? src[0] : src, sR = stereoSrc ? src[1] : src;
      let n = sL.length;
      if (o.len != null) n = Math.min(n, Math.max(0, Math.round(o.len * SR)));
      n = Math.min(n, S.n - st);
      if (n <= 0) return;
      const pan = o.pan, panDyn = Array.isArray(pan);
      let gl = 1, gr = 1, xl = 0, xr = 0;
      const setPan = (p) => {
        if (p == null) { gl = gr = 1; xl = xr = 0; return; }
        p = clamp(p, -1, 1);
        if (!stereoSrc) { const x = (p + 1) / 2; gl = Math.cos(x * Math.PI / 2); gr = Math.sin(x * Math.PI / 2); xl = xr = 0; }
        else if (p <= 0) { const x = p + 1; gl = 1; xl = Math.cos(x * Math.PI / 2); gr = Math.sin(x * Math.PI / 2); xr = 0; }
        else { gl = Math.cos(p * Math.PI / 2); xl = 0; gr = 1; xr = Math.sin(p * Math.PI / 2); }
      };
      setPan(panDyn ? pan[0] : pan);
      const rv = o.rev || 0, hg = o.huge || 0, dl = o.dly || 0, anySend = rv || hg || dl;
      const L = S.L, R = S.R;
      // de-click: every source ends with a short raised-cosine fade, so a buffer that is cut
      // (o.len / `stop`, stem end) or whose tail has not fully decayed never ends on a step.
      // Cuts get 4 ms, natural ends 1.5 ms (inaudible on decayed tails).
      const cut = n < sL.length, fN = Math.min(n >> 1, cut ? 192 : 72), f0 = n - fN;
      for (let i = 0; i < n; i++) {
        const j = st + i; if (j < 0) continue;
        if (panDyn && (i & 63) === 0) {
          const u = clamp((t + i / SR - pan[2]) / Math.max(1e-6, pan[3] - pan[2]), 0, 1);
          setPan(pan[0] + (pan[1] - pan[0]) * u);
        }
        const fg = i < f0 ? g : g * (0.5 + 0.5 * Math.cos(Math.PI * (i - f0 + 1) / fN));
        const a = sL[i] * fg, b = sR[i] * fg;
        if (R) { L[j] += a * gl + b * xl; R[j] += b * gr + a * xr; }
        else L[j] += stereoSrc ? (a + b) * 0.5 : a;
        if (anySend) {
          const m = stereoSrc ? (a + b) * 0.5 : a;
          if (rv) sendRev[j] += m * rv;
          if (hg) sendHuge[j] += m * hg;
          if (dl) sendDly[j] += m * dl;
        }
      }
    }
    // variable-rate playback (slowed foley / film audio, half-speed crash): rate(tt) per output sample
    function varispeed(src, outSec, rateFn) {
      const n = Math.round(outSec * SR), out = new Float32Array(n); let pos = 0;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(pos); if (k + 1 >= src.length) break;
        const f = pos - k; out[i] = src[k] * (1 - f) + src[k + 1] * f;
        pos += rateFn(i / SR);
      }
      return out;
    }
    const pw = (a, b, u) => a * Math.pow(b / a, clamp(u, 0, 1)); // exponential interpolation

    const noise = mk(6, 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
    const NL = noise[0].length;
    let noiseN = 0;   // alternates the L/R noise source per whoosh / burst
    const clickB = mk(0.008, 1, (d) => {
      // beater / UI click: 3 kHz HP + 9 kHz LP (a knock, not a full-band digital spike)
      const hp = jsBiquad('hp', 3000, 0.7), lp = jsBiquad('lp', 9000, 0.7);
      for (let i = 0; i < d.length; i++) d[i] = 1.25 * lp(hp((i < 2 ? 1 : 0) + (rnd() * 2 - 1) * Math.exp(-i / (0.0008 * SR)) * 0.7));
    });
    await slice();
    const crashB = mk(2.8, 2, (d) => {
      const fr = [], ph = [], am = [];
      for (let k = 0; k < 12; k++) { fr.push(rr(3200, 13500)); ph.push(rnd() * TAU); am.push(rr(0.3, 1)); }
      const hp = jsBiquad('hp', 2600, 0.6), hp2 = jsBiquad('hp', 900, 0.6);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; let s = 0;
        for (let k = 0; k < 12; k++) s += am[k] * Math.sin(ph[k] + TAU * fr[k] * t);
        const e = Math.exp(-t / 0.75) * (0.55 + 0.45 * Math.exp(-t / 0.08)) * Math.min(1, t / 0.0015);
        d[i] = (hp(rnd() * 2 - 1) * 0.9 + hp2(s * 0.09)) * e;
      }
    });
    const crashHalf = [0, 1].map((c) => varispeed(crashB[c], 5.5, () => 0.5));
    const revCrashB = (function () {
      const n = Math.round(1.6 * SR);
      return [0, 1].map((c) => {
        const s = crashB[c], d = new Float32Array(n);
        for (let i = 0; i < n; i++) d[i] = s[n - 1 - i] * Math.min(1, (n - i) / (0.004 * SR));
        return d;
      });
    })();

    // ---------------------------------------------------------- main bus graph
    const out = ctx.createGain(); out.connect(ctx.destination);            // gated (silences)
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 10; glue.ratio.value = 2; glue.attack.value = 0.012; glue.release.value = 0.2;
    const G = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const F = (type, f, q, dest) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (dest) n.connect(dest); return n; };
    function shaper(drive, dest) {
      const w = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n), k = Math.tanh(drive);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / k; }
      w.curve = c; w.oversample = '2x'; if (dest) w.connect(dest); return w;
    }
    const mix = G(0.3);
    // master tilt EQ: tame the sub, open the top ("expensive" air)
    const eqLo = F('lowshelf', 110, 0.7), eqMid = F('peaking', 2600, 0.9), eqHi = F('highshelf', 6500, 0.7);
    // presence lift at 6.5 kHz, but take the 12 kHz+ sizzle back down (hats/crash/noise stack up there)
    const eqAir = F('highshelf', 12000, 0.7);
    eqLo.gain.value = -3.5; eqMid.gain.value = 1.2; eqHi.gain.value = 2.2; eqAir.gain.value = -2.5;
    mix.connect(eqLo); eqLo.connect(eqMid); eqMid.connect(eqHi); eqHi.connect(eqAir); eqAir.connect(glue); glue.connect(lim); lim.connect(out);
    // DETERMINISM: Chromium sums a node's input connections in hash (pointer) order, and float addition of
    // three or more terms depends on that order, so a render would differ in the last bits from run to run.
    // Every summing point in both graphs therefore takes at most TWO inputs (a + b == b + a exactly).
    const mixA = G(1, mix), mixB = G(1, mix);           // mix <- (music + sfx) + (foley + fx return)
    const sfx = G(1, mixA);
    const subBus = G(0.5); subBus.connect(shaper(1.4, sfx));
    const foleyBus = G(1, F('highpass', 35, 0.7, mixB));   // recorded foley + the film's own track: clean, unsaturated
    const musicOut = G(1, mixA);
    const musicLP = F('lowpass', 20000, 0.8, musicOut);
    const musicPre = G(1, musicLP);
    const duck = G(1, musicPre);
    const drumLP = F('lowpass', 20000, 0.9, musicPre);
    const drumBus = G(0.9); drumBus.connect(shaper(1.25, drumLP));
    const bassLP = F('lowpass', 650, 0.7, duck);
    const bassBus = G(0.42); bassBus.connect(shaper(2.4, bassLP));
    const duckB = G(1, duck);                            // duck <- bass + (pad + arp)
    const padLP = F('lowpass', 2200, 0.6, duckB);
    const padBus = G(1.45, padLP);
    const arpBus = G(1.35, duckB);
    const leadBus = G(1.25, musicOut); // horns + choir (not filtered by the music-bus sweeps)
    const padAuto = [];             // pad lowpass automation, replayed in the FX context
    const padLPset = (m, v, t) => { padAuto.push([m, v, t]); padLP.frequency[m](v, t); };
    duck.gain.setValueAtTime(1, 0);

    // ---------------------------------------------------------- instruments (JS synthesis -> stems)
    function kick(t, v, o) {
      v = v == null ? 1 : v; o = o || {};
      const f1 = o.f1 || 56, f2 = o.f2 || 46, dec = o.dec || 0.42;
      const b = cached('kick' + f1 + '/' + f2 + '/' + dec, dec + 0.15, 1, (d) => {
        const tau = dec / 4.6; let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const tt = i / SR;
          ph += (tt < 0.065 ? pw(190, f1, tt / 0.065) : pw(f1, f2, (tt - 0.065) / 0.335)) / SR;
          d[i] = Math.sin(TAU * ph) * env1(tt, 0.002, tau) * 0.95 + (i < clickB.length ? clickB[i] * 0.44 : 0);
        }
      });
      mixIn('drum', b, t, v);
      if (o.duck !== false) { duck.gain.setTargetAtTime(o.depth || 0.3, t, 0.004); duck.gain.setTargetAtTime(1, t + 0.03, 0.085); }
    }
    function crash(t, v, o) {
      o = o || {};
      mixIn('sfx', o.rate === 0.5 ? crashHalf : crashB, t, v, { rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 });
    }
    function revCymbal(tEnd, len, v, o) {
      o = o || {};
      // a reversed crash cut shorter than its 1.6 s buffer starts mid-decay: fade it in (raised cosine)
      // so the swell starts from nothing instead of a broadband step
      const n = revCrashB[0].length, k = n - Math.round(len * SR), fi = Math.round(Math.min(0.15, len * 0.4) * SR);
      const seg = [0, 1].map((c) => {
        const d = revCrashB[c].slice(k);
        for (let i = 0; i < fi; i++) d[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
        return d;
      });
      mixIn('sfx', seg, tEnd - len, v,
        { rev: 0.25, pan: o.pan == null ? 0 : o.pan, len: (o.cut || tEnd) - (tEnd - len) });
    }
    let last808 = null;
    function b808(t, midi, len, v, o) {
      o = o || {};
      const f = mtof(midi), gl = o.glide || 0.09, ff = o.glideFrom != null ? mtof(o.glideFrom) : f * 1.9, gT = o.glideFrom != null ? gl : 0.035;
      const d = new Float32Array(Math.round((len + 0.05) * SR)); let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const tt = i / SR;
        ph += pw(ff, f, tt / gT) / SR;
        let e = tt < 0.004 ? tt / 0.004 : (tt < 0.05 ? 1 : 0.55 + 0.45 * Math.exp(-(tt - 0.05) / 0.35));
        if (tt > len) e *= Math.max(0, 1 - (tt - len) / 0.04);
        d[i] = Math.sin(TAU * ph) * e * v;
      }
      mixIn('bass', d, t, 1);
      last808 = midi;
    }
    // detuned-saw stack (polyBLEP) with sustain envelope -> mono buffer
    function sawStack(freqs, len, a, r, o) {
      o = o || {};
      const n = Math.round((len + r + 0.02) * SR), d = new Float32Array(n);
      const vo = freqs.map((f) => ({ dt: f / SR, p: rnd() }));
      let flt = null;
      for (let i = 0; i < n; i++) {
        const tt = i / SR;
        if (o.lp && (i & 31) === 0) flt = jsBiquadState(flt, 'lp', o.lp1 ? pw(o.lp, o.lp1, tt / len) : o.lp, o.q || 0.8);
        let s = 0;
        for (let k = 0; k < vo.length; k++) {
          const q = vo[k]; q.p += q.dt; if (q.p >= 1) q.p -= 1;
          s += o.wave === 'sine' ? Math.sin(TAU * q.p) : o.wave === 'tri' ? 1 - 4 * Math.abs(q.p - 0.5) : blepSaw(q.p, q.dt);
        }
        const e = tt < a ? tt / a : (tt < len ? 1 : Math.max(0, 1 - (tt - len) / Math.max(r, 1e-4)));
        d[i] = (flt ? flt.run(s) : s) * e;
      }
      return d;
    }
    function pad(t0, t1, notes, v, o) {
      o = o || {};
      const a = o.a == null ? 0.12 : o.a, r = o.r == null ? 0.25 : o.r;
      [[-12, -0.8, 1], [0, 0, 0.7], [12, 0.8, 1]].forEach(([det, p, lv]) => {
        const fr = notes.map((m) => mtof(m) * Math.pow(2, (det + rr(-3, 3)) / 1200));
        mixIn('pad', sawStack(fr, t1 - t0, a, r), t0, v * lv, { pan: p });
      });
    }
    function drone(t0, t1, midis, wave, v, a, r, o) {
      o = o || {};
      const fr = midis.map((m, i) => mtof(m) * Math.pow(2, ((o.det && o.det[i]) || 0) / 1200));
      mixIn(o.dest || 'pad', sawStack(fr, t1 - t0, a, r, { wave: wave, lp: o.lp, lp1: o.lp1, q: o.q }), t0, v, {});
    }
    function pluck(t, midi, v, pan, o) {
      o = o || {};
      const cutA = o.cut || 4200, cutB = o.cutEnd || 500, dec = o.dec || 0.22, type = o.type || 'sawtooth';
      const b = cached(['pl', midi, cutA, cutB, dec, type].join('/'), dec * 2.2, 1, (d) => {
        const f = mtof(midi), f2 = f * 1.004 * Math.pow(2, 7 / 1200), tau = dec * 2 / 4.6; let p1 = 0, p2 = 0, flt = null;
        for (let i = 0; i < d.length; i++) {
          const tt = i / SR;
          if ((i & 31) === 0) flt = jsBiquadState(flt, 'lp', pw(cutA, cutB, tt / dec), 2.2);
          p1 = (p1 + f / SR) % 1; p2 = (p2 + f2 / SR) % 1;
          const x = (type === 'square' ? blepSq(p1, f / SR) : blepSaw(p1, f / SR)) + blepSq(p2, f2 / SR);
          d[i] = flt.run(x) * env1(tt, 0.003, tau) * 0.5;
        }
      });
      mixIn('arp', b, t, v, { pan: pan, dly: o.dly == null ? 0.22 : o.dly });
    }
    // FM glass bell (sine carrier + 3rd-harmonic FM) — THE BIFROST CHORD voice
    function bellBuf(f, decay, ratio, index, att) {
      f = Math.min(f, 12000);
      return cached(['bell', f.toFixed(3), decay, ratio, index, att].join('/'), decay + 0.1, 1, (d) => {
        const fm = Math.min(23000, f * ratio), tauA = decay / 4.6, tauI = Math.max(0.001, decay * 0.18);
        let pc = 0, pm = 0;
        for (let i = 0; i < d.length; i++) {
          const tt = i / SR, idx = index * (0.12 + 0.88 * Math.exp(-tt / tauI));
          pm += fm / SR; pc += (f + f * idx * Math.sin(TAU * pm)) / SR;
          d[i] = Math.sin(TAU * pc) * env1(tt, att, tauA);
        }
      });
    }
    function bell(t, f, v, pan, decay, o) {
      o = o || {};
      mixIn(o.dest || 'sfx', bellBuf(f, decay, o.ratio || 3, o.index == null ? 1.6 : o.index, o.a || 0.002), t, v,
        { pan: pan || 0, rev: o.rev == null ? 0.3 : o.rev, dly: o.dly || 0, huge: o.huge || 0 });
    }
    const RATIOS = [1, 2.76, 5.40, 8.93];
    // THE SILVER RING: inharmonic partials 1 / 2.76 / 5.40 / 8.93 x 1320 Hz, 2.5 s exponential decay
    const silverB = mk(2.7, 1, (d) => {
      const decs = [2.5, 1.75, 1.1, 0.7], amps = [0.30, 0.17, 0.10, 0.055];
      for (let i = 0; i < d.length; i++) {
        const tt = i / SR; let s = 0;
        for (let k = 0; k < 4; k++) s += amps[k] * Math.sin(TAU * 1320 * RATIOS[k] * tt) * Math.exp(-tt / (decs[k] / 4.6));
        s += 0.09 * Math.sin(TAU * 1320 * 1.0021 * tt) * Math.exp(-tt / (2.4 / 4.6));
        d[i] = s * Math.min(1, tt / 0.0012) + (i < clickB.length ? clickB[i] * 0.35 : 0);
      }
    });
    function silverRing(t, v, pan, o) {
      o = o || {};
      mixIn('sfx', silverB, t, v, { pan: pan || 0, rev: o.rev == null ? 0.32 : o.rev, dly: o.dly || 0.05, huge: o.huge || 0 });
    }
    // THE GOLD RING: same ratios on 880 Hz, softer attack, 6 kHz lowpass, 3.5 s decay
    function goldRing(t, v, pan, o) {
      o = o || {};
      const D = o.decay || 3.5;
      const b = cached('gold' + D, D + 0.2, 1, (d) => {
        const decs = [D, D * 0.72, D * 0.48, D * 0.3], amps = [0.36, 0.2, 0.11, 0.06], lp = jsBiquad('lp', 6000, 0.7);
        for (let i = 0; i < d.length; i++) {
          const tt = i / SR; let s = 0;
          for (let k = 0; k < 4; k++) s += amps[k] * Math.sin(TAU * 880 * RATIOS[k] * tt) * Math.exp(-tt / (decs[k] / 4.6));
          s += 0.1 * Math.sin(TAU * 880 * 0.9986 * tt) * Math.exp(-tt / (D / 4.6));
          d[i] = lp(s * Math.min(1, tt / 0.009));
        }
      });
      mixIn('sfx', b, t, v, { pan: pan || 0, rev: o.rev == null ? 0.38 : o.rev, dly: o.dly || 0.05, huge: o.huge || 0 });
    }
    // Gjallarhorn: detuned saw stack (polyBLEP), pitch scoop, swelling lowpass (stereo)
    function horn(t, notes, len, v, o) {
      o = o || {};
      const att = o.a == null ? 0.3 : o.a, cutF = o.cut || 1200, rel = o.rel || 0.12, scoop = o.scoop == null ? 45 : o.scoop;
      const b = cached(['horn', notes.join(','), len, att, cutF, rel, scoop].join('/'), len + rel * 6, 2, (d, c) => {
        const vo = [];
        notes.forEach((m) => [-14, -5, 5, 14].forEach((dt, i) => vo.push({ f: mtof(m), d: dt, side: i % 2, p: rnd(), dt: 0 })));
        const th = (-0.55 + 1) * Math.PI / 4, near = Math.cos(th), far = Math.sin(th), tauC = len * 0.6 + 0.05;
        let flt = null;
        for (let i = 0; i < d.length; i++) {
          const tt = i / SR;
          if ((i & 31) === 0) {
            const cf = tt < att * 0.9 ? pw(320, cutF, tt / (att * 0.9)) : (tt < att ? cutF : cutF * 0.65 + cutF * 0.35 * Math.exp(-(tt - att) / tauC));
            flt = jsBiquadState(flt, 'lp', cf, 1.1);
            const sc = Math.min(1, tt / 0.11);
            for (let k = 0; k < vo.length; k++) vo[k].dt = vo[k].f * Math.pow(2, (vo[k].d - scoop * (1 - sc)) / 1200) / SR;
          }
          let x = 0;
          for (let k = 0; k < vo.length; k++) {
            const q = vo[k]; q.p += q.dt; if (q.p >= 1) q.p -= 1;
            x += blepSaw(q.p, q.dt) * ((q.side === 0) === (c === 0) ? near : far);
          }
          d[i] = flt.run(x) * (tt < att ? tt / att : (tt < len ? 1 : Math.exp(-(tt - len) / rel)));
        }
      });
      mixIn('lead', b, t, v, { rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 });
    }
    // airy formant choir 'aah' (saw voices + vibrato through two formant banks, L/R)
    function choir(t0, t1, notes, v, o) {
      o = o || {};
      const a = o.a || 0.35, r = o.r || 0.7, hold = t1 - t0, n = Math.round((hold + r + 0.05) * SR);
      const L = new Float32Array(n), R = new Float32Array(n);
      const vo = []; let k = 0;
      notes.forEach((m) => [-11, 0, 11].forEach((d) => vo.push({ f: mtof(m), d: d + rr(-4, 4), p: rnd(), side: k++ % 2, dt: 0 })));
      const FORM = [[730, 7, 1], [1120, 9, 0.6], [2600, 12, 0.24], [3350, 14, 0.12]];
      const banks = [0, 1].map(() => FORM.map(([f, q]) => jsBiquad('bp', f, q)));
      const gN = Math.cos(0.2 * Math.PI / 2), gF = Math.sin(0.2 * Math.PI / 2);
      for (let i = 0; i < n; i++) {
        const tt = i / SR;
        if ((i & 31) === 0) {
          const vib = 10 * Math.sin(TAU * 5.1 * tt);
          for (let j = 0; j < vo.length; j++) vo[j].dt = vo[j].f * Math.pow(2, (vo[j].d + vib) / 1200) / SR;
        }
        let a0 = 0, a1 = 0;
        for (let j = 0; j < vo.length; j++) {
          const q = vo[j]; q.p += q.dt; if (q.p >= 1) q.p -= 1;
          const s = blepSaw(q.p, q.dt); if (q.side) a1 += s; else a0 += s;
        }
        let b0 = 0, b1 = 0;
        for (let f = 0; f < 4; f++) { b0 += banks[0][f](a0) * FORM[f][2] * 2.4; b1 += banks[1][f](a1) * FORM[f][2] * 2.4; }
        const e = (tt < a ? tt / a : (tt < hold ? 1 : Math.max(0, 1 - (tt - hold) / r))) * v;
        L[i] = (b0 * gN + b1 * gF) * e; R[i] = (b1 * gN + b0 * gF) * e;
      }
      mixIn('lead', [L, R], t0, 1, { huge: o.huge == null ? 0.55 : o.huge, rev: o.rev == null ? 0.25 : o.rev });
    }
    // filtered-noise whoosh: swept filter, exponential swell/decay, pan ramp
    function whoosh(t, d, f0, f1, v, p0, p1, o) {
      o = o || {};
      const n = Math.round(d * SR), out = new Float32Array(n), off = Math.floor(rr(0, 2.5) * SR), ch = noise[noiseN++ % 2];
      const type = o.type === 'highpass' ? 'hp' : o.type === 'lowpass' ? 'lp' : 'bp', q = o.q || 1.1, pk = o.peak == null ? 0.65 : o.peak;
      let flt = null;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        if ((i & 31) === 0) flt = jsBiquadState(flt, type, pw(f0, f1, u), q);
        const e = u < pk ? pw(1e-4, v, u / pk) : pw(v, 1e-4, (u - pk) / (1 - pk));
        out[i] = flt.run(ch[(off + i) % NL]) * e;
      }
      mixIn(o.dest || 'sfx', out, t, 1, { pan: [p0, p1, t, t + d], rev: o.rev == null ? 0.22 : o.rev, huge: o.huge || 0 });
    }
    function subDrop(t, f0, f1, drop, v, decay) {
      const d = new Float32Array(Math.round((decay + 0.2) * SR)), tau = decay / 4.6; let ph = 0;
      for (let i = 0; i < d.length; i++) { const tt = i / SR; ph += pw(f0, f1, tt / drop) / SR; d[i] = Math.sin(TAU * ph) * env1(tt, 0.004, tau) * v; }
      mixIn('sub', d, t, 1);
    }
    // noise burst through a swept filter with a percussive envelope
    function noiseBurst(t, v, f0, f1, decay, o) {
      o = o || {};
      const n = Math.round((decay + 0.1) * SR), out = new Float32Array(n), off = Math.floor(rr(0, 3) * SR), ch = noise[noiseN++ % 2];
      const type = o.type === 'highpass' ? 'hp' : o.type === 'bandpass' ? 'bp' : 'lp', a = o.a || 0.002, sw = o.sweep || decay, tau = decay / 4.6;
      let flt = null;
      for (let i = 0; i < n; i++) {
        const tt = i / SR;
        if ((i & 31) === 0) flt = jsBiquadState(flt, type, pw(f0, f1, tt / sw), o.q || 0.8);
        out[i] = flt.run(ch[(off + i) % NL]) * env1(tt, a, tau) * v;
      }
      mixIn('sfx', out, t, 1, { pan: o.pan || 0, rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 });
    }
    function play(src, t, v, o) {
      o = o || {};
      mixIn(o.dest || 'sfx', src, t, v, { pan: o.pan === undefined ? 0 : o.pan, rev: o.rev || 0, huge: o.huge || 0, dly: o.dly || 0, len: o.stop ? o.stop - t : null });
    }
    function impact(t, v, o) {
      o = o || {};
      subDrop(t, o.f0 || 95, o.f1 || 33, o.drop || 0.65, v * 0.95, o.subDec || 1.8);
      noiseBurst(t, v * 0.55, 2600, 140, 0.55, { rev: 0.35, huge: o.huge == null ? 0.25 : o.huge });
      if (o.crash !== false) crash(t, v * (o.crashV || 0.55), { huge: o.huge == null ? 0.2 : o.huge });
      kick(t, v * 0.9, { depth: 0.15 });
    }
    function thud(t, f, v, o) {
      o = o || {};
      const dec = o.dec || 0.38, d = new Float32Array(Math.round((dec + 0.2) * SR)), tau = dec / 4.6; let p1 = 0, p2 = 0;
      for (let i = 0; i < d.length; i++) {
        const tt = i / SR;
        p1 += pw(f * 2.6, f, tt / 0.045) / SR; p2 += pw(f * 2, f * 1.5, tt / 0.1) / SR;
        d[i] = (Math.sin(TAU * p1) + (1 - 4 * Math.abs((p2 % 1) - 0.5))) * env1(tt, 0.002, tau) * v;
      }
      mixIn('sfx', d, t, 1, { pan: o.pan || 0, rev: o.rev == null ? 0.18 : o.rev });
      noiseBurst(t, v * (o.slap == null ? 0.5 : o.slap), 1600, 300, 0.09, { pan: o.pan || 0, rev: 0.15 });
      play(clickB, t, v * 0.4, { pan: null });
    }
    function tick(t, f, v, pan, d, type, o) {
      o = o || {};
      type = type || 'sine';
      const a = o.a || 0.001, f1 = o.f1 || 0;
      const b = cached(['tick', f, d, type, f1, a].join('/'), d * 2 + 0.02, 1, (dd) => {
        let ph = 0; const tau = d / 4.6;
        for (let i = 0; i < dd.length; i++) {
          const tt = i / SR;
          ph += (f1 ? pw(f, f1, tt / d) : f) / SR; const p = ph % 1;
          const w = type === 'square' ? blepSq(p, Math.min(0.5, (f1 ? pw(f, f1, tt / d) : f) / SR)) : type === 'triangle' ? 1 - 4 * Math.abs(p - 0.5) : Math.sin(TAU * p);
          dd[i] = w * env1(tt, a, tau);
        }
      });
      mixIn(o.dest || 'sfx', b, t, v, { pan: pan || 0, rev: o.rev || 0, dly: o.dly || 0, huge: o.huge || 0 });
    }
    function glassTick(t, f, v, pan, o) {
      o = o || {};
      bell(t, f, v, pan, o.dec || 0.45, { ratio: 3.5, index: 0.7, rev: o.rev == null ? 0.35 : o.rev, dly: o.dly || 0.12 });
    }
    function sparkle(t, n, span, v, pan, lo, hi, o) {
      o = o || {};
      const PENT = [74, 76, 78, 81, 83];
      for (let i = 0; i < n; i++) {
        const tt = t + (o.desc ? i / n : rnd()) * span;
        let m = o.desc ? PENT[(n - i) % 5] + 12 * Math.floor(lo + (hi - lo) * (1 - i / n)) : PENT[Math.floor(rnd() * 5)] + 12 * Math.floor(rr(lo, hi));
        m = Math.min(m, 112);
        bell(tt, mtof(m), v * rr(0.5, 1), clamp((pan || 0) + rr(-0.5, 0.5), -1, 1), rr(0.25, 0.6), { ratio: 3.5, index: 0.5, rev: 0.4, dly: 0.1 });
      }
    }
    function sweepTone(t0, t1, f0, f1, v, o) {
      o = o || {};
      const n = Math.round((t1 - t0 + 0.05) * SR), d = new Float32Array(n), L = t1 - t0; let ph = 0;
      for (let i = 0; i < n; i++) {
        const tt = i / SR; ph += pw(f0, f1, tt / L) / SR;
        const e = tt < L - 0.02 ? pw(1e-4, v, tt / (L - 0.02)) : Math.max(0, v * (1 - (tt - (L - 0.02)) / 0.05));
        d[i] = Math.sin(TAU * ph) * e;
      }
      mixIn('sfx', d, t0, 1, { pan: 0, rev: o.rev || 0 });
    }

    function forSteps(t0, t1, fn) { // 16th-note grid (0.125 s at 120 BPM): fn(time, step-in-bar, absolute step)
      for (let s = Math.ceil(t0 / 0.125 - 1e-6); s * 0.125 < t1 - 1e-6; s++) fn(s * 0.125, ((s % 16) + 16) % 16, s);
    }

    // ---------------------------------------------------------- premium hits / UI
    // a big, clean hit: sub boom + body + a breath of air into the big room (no clap, no riser drop)
    function hit(t, v, o) {
      o = o || {};
      subDrop(t, o.f0 || 85, o.f1 || 34, o.drop || 0.45, v * 0.9, o.subDec || 1.6);
      thud(t, o.body || 52, v * 0.42, { slap: o.slap == null ? 0.3 : o.slap, rev: 0.22, dec: o.dec || 0.5, pan: o.pan || 0 });
      noiseBurst(t, v * (o.air == null ? 0.3 : o.air), o.airHz || 5200, 220, o.airDec || 0.7, { rev: 0.4, huge: o.huge == null ? 0.35 : o.huge });
      if (o.crash) crash(t, v * o.crash, { huge: 0.25, rev: 0.25 });
    }
    const uiTap = (t, pan) => {
      tick(t, 2600, 0.09, pan || 0, 0.018, 'sine', { rev: 0.12 }); play(clickB, t, 0.42, { pan: pan || 0 });
      thud(t, 72, 0.2, { slap: 0.12, dec: 0.14, rev: 0.08, pan: pan || 0 });   // the fingertip: a soft, round touch
      duck.gain.setTargetAtTime(0.6, t - 0.004, 0.003); duck.gain.setTargetAtTime(1, t + 0.05, 0.09);
    };
    function chord(t, midis, v, o) { // glass chord, voices fanned L -> R
      o = o || {};
      midis.forEach((m, i) => bell(t + (o.strum || 0) * i, mtof(m), v, midis.length > 1 ? -o.spread + 2 * o.spread * i / (midis.length - 1) : 0, o.dec || 1.4,
        { ratio: o.ratio || 3, index: o.index == null ? 1.1 : o.index, rev: o.rev == null ? 0.35 : o.rev, dly: o.dly == null ? 0.12 : o.dly, huge: o.huge || 0 }));
    }
    // the case's seam pulse: a soft low heartbeat-thump with a faint violet glass tone
    function seamPulse(t, v) {
      subDrop(t, 72, 44, 0.09, v, 0.7);
      thud(t, 46, v * 0.22, { slap: 0.05, dec: 0.3, rev: 0.1 });
      bell(t + 0.01, mtof(81), v * 0.035, 0.15, 1.1, { ratio: 2.76, index: 0.4, rev: 0.2, dly: 0 });
    }

    // ---------------------------------------------------------- recorded sources
    const rec = { foley: samples && samples.foley, film: samples && samples.film };
    const used = { foley: rec.foley ? 'recorded' : 'procedural', film: rec.film ? 'recorded' : 'procedural' };
    // cut [a, b] s out of a decoded source, slow it by `rate` (varispeed: pitch follows), 6 ms fade-in,
    // 20 ms fade-out, peak-normalised so the cue gains read as peak levels
    function recCut(src, a, b, rate) {
      const i0 = Math.max(0, Math.round(a * SR)), i1 = Math.min(src.L.length, Math.round(b * SR));
      let ch = [src.L.subarray(i0, i1), src.R.subarray(i0, i1)];
      if (rate !== 1) ch = ch.map((d) => varispeed(d, (i1 - i0) / SR / rate, () => rate));
      else ch = ch.map((d) => new Float32Array(d));
      const n = ch[0].length, fi = Math.round(0.006 * SR), fo = Math.round(0.02 * SR);
      let pk = 1e-9;
      for (const d of ch) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      for (const d of ch) for (let i = 0; i < n; i++) {
        let g = 1 / pk;
        if (i < fi) g *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
        if (i > n - fo) g *= 0.5 - 0.5 * Math.cos(Math.PI * (n - i) / fo);
        d[i] *= g;
      }
      return ch;
    }
    function placeRec(src, spec, o) {
      o = o || {};
      const seg = recCut(src, spec.src[0], spec.src[1], spec.rate || 1);
      const align = spec.align == null ? spec.src[0] : spec.align;
      const t = spec.at - (align - spec.src[0]) / (spec.rate || 1);
      mixIn('foley', seg, t, spec.gain, { pan: spec.pan == null ? null : spec.pan, rev: o.rev || 0, huge: o.huge || 0, len: o.stop ? o.stop - t : null });
    }

    // =========================================================== v3 score (30 s)
    async function scoreV3() {
      const C = CUES, FO = C.foley, FI = C.film;
      const mlp = musicLP.frequency, dlp = drumLP.frequency;
      musicLP.frequency.setValueAtTime(20000, 0);
      drumLP.frequency.setValueAtTime(2600, 0);
      padLPset('setValueAtTime', 700, 0);

      // ---- 01 HOOK 0.0-2.5: sub swell + light-sweep shimmer, 0.9 type hit, 1.6 whoosh + THE SILVER RING
      await slice();
      {
        drone(0.0, 2.45, [26, 38], 'sine', 0.06, 1.4, 0.3, { dest: 'pad' });       // sub swell D1 + D2
        pad(0.0, 2.45, [50, 57, 62, 65], 0.028, { a: 1.6, r: 0.35 });
        padLPset('setValueAtTime', 600, 0.0); padLPset('exponentialRampToValueAtTime', 1800, 2.4);
        whoosh(0.0, 1.1, 2500, 11000, 0.07, -0.8, 0.8, { type: 'highpass', peak: 0.55, rev: 0.4, huge: 0.2 }); // the hairline arc sweeps
        sparkle(0.12, 7, 0.75, 0.022, 0, 2, 4, { desc: false });
        const t1 = C.caughtYourEye;
        whoosh(t1 - 0.22, 0.24, 800, 5000, 0.12, 0.3, 0, { peak: 0.92, rev: 0.15 });
        hit(t1, 0.62, { huge: 0.25, air: 0.22 });
        chord(t1, [62, 69, 74], 0.05, { spread: 0.4, dec: 1.2 });
        const t2 = C.hookPullBack;
        whoosh(t2 - 0.3, 0.38, 600, 9000, 0.32, -0.6, 0.6, { peak: 0.8, rev: 0.2 });  // whip-zoom pull back
        subDrop(t2, 70, 40, 0.1, 0.45, 0.9);
        silverRing(t2, 0.85, 0.15, { huge: 0.15 });
        sparkle(t2 + 0.05, 6, 0.45, 0.025, 0.2, 2, 3);
        whoosh(2.1, 0.42, 900, 4500, 0.1, 0.4, -0.2, { peak: 0.95 });                  // into the first cut
      }

      // ---- 02 THE FIVE 2.5-5.0: one hit per half-beat cut, pitched per coin; 4.6 the chord as Veritas pulls back into the row of five
      await slice();
      {
        pad(2.5, 4.98, [50, 57, 62, 65, 69], 0.028, { a: 0.5, r: 0.04 });
        padLPset('setValueAtTime', 1500, 2.5); padLPset('exponentialRampToValueAtTime', 2600, 4.9);
        C.five.forEach((t, i) => {
          const m = C.fivePitch[i], pan = [-0.35, 0.3, -0.2, 0.25, 0][i], v = 0.5 + 0.06 * i;
          if (i) whoosh(t - 0.1, 0.12, 1500, 6000, 0.07, -pan, pan, { peak: 0.85, rev: 0.1 });
          hit(t, v, { body: 50 + i * 3, huge: 0.2, air: 0.16, subDec: 0.9, f0: 80 + i * 4 });
          bell(t, mtof(m), 0.13, pan, 1.3, { ratio: 2.76, index: 0.9, rev: 0.3, dly: 0.1 });  // the coin's ring
          bell(t, mtof(m - 12), 0.07, pan, 0.9, { ratio: 3, index: 1.2, rev: 0.25 });
        });
        const t = C.fiveRow;
        chord(t, C.fivePitch, 0.085, { spread: 0.8, strum: 0.005, dec: 1.8, huge: 0.2 });   // the five coins' own notes, fanned L -> R like the row
        choir(t, 5.0, [50, 57, 62, 65, 69], 0.06, { a: 0.18, r: 0.25, huge: 0.4 });
        whoosh(t + 0.02, 0.5, 3000, 10000, 0.05, -0.7, 0.7, { type: 'highpass', peak: 0.4, rev: 0.4 }); // light along the arc (arc draws 4.58-4.94, band sweeps 4.80-)
      }

      // ---- 03 MINT 5.0-10.0: premium groove (soft low pulse, warm pad, glass arp), UI taps, confirm chime
      await slice();
      {
        const BARS = [
          { t0: 5.0, t1: 7.0, pad: [57, 62, 64, 65, 69], root: 26, arp: [74, 77, 81, 84, 88] },   // Dm9
          { t0: 7.0, t1: 8.2, pad: [58, 62, 65, 70], root: 34, arp: [70, 74, 77, 82, 86] },       // Bb
          { t0: 8.2, t1: 10.0, pad: [57, 60, 65, 69], root: 29, arp: [72, 77, 81, 84, 89] }       // F (confirmed)
        ];
        padLPset('setValueAtTime', 1600, 5.0); padLPset('exponentialRampToValueAtTime', 2600, 8.2);
        padLPset('setValueAtTime', 2600, 9.2); padLPset('exponentialRampToValueAtTime', 500, 9.98);
        BARS.forEach((B, bi) => {
          pad(B.t0, B.t1 - 0.02, B.pad, 0.03, { a: bi ? 0.05 : 0.25, r: B.t1 >= 10 ? 0.02 : 0.08 });
          b808(B.t0, B.root, Math.min(1.8, B.t1 - B.t0 - 0.05), 0.3, bi === 0 ? { glideFrom: 33, glide: 0.25 } : {});
          forSteps(B.t0, B.t1 - 0.01, (t, i, s) => {
            if (i % 8 === 0 && Math.abs(t - C.confirmed + 0.1) > 0.15) kick(t, i === 0 ? 0.5 : 0.38, { f1: 52, f2: 44, dec: 0.4, depth: 0.75 });    // the low pulse, half-time (sparse, not four-on-the-floor)
            if (i % 2 === 0) {
              const pat = [0, 2, 1, 3, 0, 2, 4, 2];
              pluck(t, B.arp[pat[(s / 2) % 8]] - 12, 0.026 * (i % 8 === 0 ? 1.2 : 0.9), (s % 4 ? 0.35 : -0.35), { cut: 2800, dec: 0.16, dly: 0.25 });
            }
          });
        });
        dlp.setValueAtTime(2600, 9.2); dlp.exponentialRampToValueAtTime(300, 9.98);
        mlp.setValueAtTime(20000, 9.3); mlp.exponentialRampToValueAtTime(700, 9.98);
        whoosh(4.82, 0.3, 700, 3200, 0.14, 0.6, 0, { peak: 0.6, rev: 0.2 });   // the phone slides in
        uiTap(C.tapCoin, -0.1); tick(C.tapCoin + 0.02, 180, 0.12, 0, 0.05, 'sine');
        glassTick(C.tapCoin + 0.06, mtof(86), 0.05, -0.1, { dec: 0.35 });        // card lifts
        whoosh(C.sheet - 0.16, 0.34, 700, 3200, 0.12, 0, 0, { peak: 0.47, rev: 0.15 }); // checkout sheet (peaks on 6.4)
        uiTap(C.tapMint, 0.05); tick(C.tapMint + 0.02, 160, 0.14, 0, 0.06, 'sine');
        [7.45, 7.62, 7.79, 7.96].forEach((t, k) => glassTick(t, mtof(81 + [0, 2, 4, 5][k]), 0.025, 0.1, { dec: 0.2 })); // progress rail
        const c = C.confirmed;                                                     // 'Payment confirmed'
        chord(c, [77, 81, 84, 89], 0.085, { spread: 0.5, strum: 0.04, dec: 1.3 });
        glassTick(c, mtof(93), 0.08, 0.2, { dec: 0.5 });
        hit(c, 0.42, { f0: 78, f1: 40, drop: 0.2, subDec: 0.8, body: 58, slap: 0.2, air: 0.16, airDec: 0.4, huge: 0.15 });
        whoosh(8.42, 0.4, 900, 7000, 0.18, 0, 0.3, { peak: 0.75, rev: 0.25 });  // coin flies up out of the phone
        const k = C.certificate;                                                   // certificate chip docks
        tick(k, 3300, 0.05, 0.3, 0.02, 'sine', { rev: 0.1 });
        glassTick(k + 0.01, mtof(98), 0.06, 0.3, { dec: 0.45 });
        sparkle(k + 0.03, 5, 0.4, 0.02, 0.3, 2, 3);
        whoosh(9.4, 0.58, 4000, 800, 0.05, 0.2, -0.2, { peak: 0.3, rev: 0.2 });
      }

      // ---- 04 THE BOX 10.0-20.0: near-silence + the film's own seam bed and low pulse, 12.65 swell,
      //      13.0 latch (recorded) + impact, slowed air/choir and lid to 15.0, glitter, 16.1 BLOOM, 17.0 resolve
      await slice();
      {
        // near-silence: just the real seam bed, a breath of sub and the pulses
        // (the music bus stays closed through the cut and reopens smoothly under the release swell)
        mlp.setValueAtTime(700, 12.0); mlp.exponentialRampToValueAtTime(20000, 12.95);
        if (rec.film) placeRec(rec.film, FI.bed);
        else drone(10.0, 12.85, [26, 33], 'saw', 0.035, 2.2, 0.06, { lp: 120, lp1: 320, q: 1.2, dest: 'sfx' });
        drone(10.2, 12.86, [38], 'sine', 0.02, 2.0, 0.04, { dest: 'sfx' });
        whoosh(10.3, 2.5, 5000, 9000, 0.006, -0.3, 0.3, { type: 'highpass', peak: 0.9, rev: 0 }); // faint air in the dark
        C.seamPulses.forEach((t, i) => seamPulse(t, 0.3 + 0.09 * i));
        // 12.65 the light release: a glassy swell that stops just before the latch
        revCymbal(12.88, 0.75, 0.22, { cut: 12.88 });
        whoosh(12.2, 0.7, 250, 4500, 0.07, 0, 0, { peak: 0.99, q: 1.2, rev: 0.05 });
        sweepTone(12.25, 12.86, 220, 440, 0.03);
        whoosh(C.release, 0.25, 6000, 11000, 0.03, -0.4, 0.4, { type: 'highpass', peak: 0.3, rev: 0.4 });
        bell(C.release, mtof(93), 0.045, 0.2, 1.0, { ratio: 2.76, index: 0.4, rev: 0.4, dly: 0 });   // the radial light release
        bell(C.release, mtof(86), 0.03, -0.2, 0.9, { ratio: 2.76, index: 0.3, rev: 0.4, dly: 0 });
        noiseBurst(C.release, 0.035, 9000, 5000, 0.3, { type: 'highpass', a: 0.004, rev: 0.4 });

        // 13.0 THE LATCH: the client's real clasp + latch, the film's own release slowed like the picture, an impact
        const L = C.latch;
        if (rec.foley) { placeRec(rec.foley, FO.clasp, { rev: 0.08 }); placeRec(rec.foley, FO.latch, { rev: 0.12 }); }
        else { tick(L - 0.1, 2400, 0.12, -0.2, 0.012, 'square'); thud(L, 160, 0.3, { slap: 0.6, dec: 0.12 }); play(clickB, L, 0.8, { pan: 0.1 }); }
        if (rec.film) placeRec(rec.film, FI.release, { stop: 15.25 });
        hit(L, 0.95, { f0: 90, f1: 32, drop: 0.6, subDec: 2.0, body: 48, huge: 0.5, air: 0.28, crash: 0.22 });
        // 13.0-15.0 slow motion: lid + leather (recorded, slowed), dark air and a low choir
        if (rec.foley) { placeRec(rec.foley, FO.lid, { rev: 0.1 }); placeRec(rec.foley, FO.settle, { rev: 0.1 }); }
        else whoosh(13.05, 1.9, 300, 900, 0.05, -0.2, 0.2, { type: 'lowpass', peak: 0.5, rev: 0.2 });
        whoosh(13.05, 2.0, 180, 1400, 0.05, -0.4, 0.4, { type: 'lowpass', peak: 0.45, rev: 0.3, huge: 0.3 });
        choir(13.1, 15.0, [50, 57, 62, 64, 65, 69], 0.032, { a: 0.7, r: 0.6, huge: 0.6 });   // under the recorded lid
        drone(13.0, 15.1, [26, 38], 'sine', 0.045, 0.4, 0.5, { dest: 'pad' });
        padLPset('setValueAtTime', 500, 13.0); padLPset('exponentialRampToValueAtTime', 1600, 15.2);
        pad(13.1, 16.08, [50, 57, 62, 64, 65], 0.022, { a: 1.0, r: 0.03 });

        // 15.0 glitter from the case mouth; 15.2-16.1 the coin rises from inside the rim (recorded rustle)
        const g = C.freeze;
        glassTick(g, mtof(98), 0.05, 0.1, { dec: 0.4 });                     // the first grain lands on the freeze
        sparkle(g + 0.04, 18, 1.06, 0.022, 0, 2, 4);
        whoosh(g, 1.2, 6000, 12000, 0.022, -0.5, 0.5, { type: 'highpass', peak: 0.4, rev: 0.4, huge: 0.2 });
        if (rec.foley) placeRec(rec.foley, FO.rustle, { rev: 0.1 });
        else noiseBurst(C.rise, 0.05, 1800, 900, 0.8, { type: 'bandpass', rev: 0.2 });
        sweepTone(C.rise, C.clearsRim - 0.01, 147, 587, 0.04, { rev: 0.2 });
        revCymbal(C.clearsRim, 0.6, 0.35);                 // starts 15.5: leaves the rustle in the clear
        whoosh(C.clearsRim - 0.45, 0.47, 400, 8000, 0.14, 0, 0, { peak: 0.97, q: 1.2, rev: 0.1 });

        // 16.1 THE BLOOM: the coin clears the rim, D MAJOR
        const B = C.clearsRim;
        hit(B, 1.05, { f0: 95, f1: 33, drop: 0.55, subDec: 2.4, body: 50, huge: 0.55, air: 0.32, crash: 0.42 });
        horn(B, [38, 45, 50, 54, 57, 62], 1.1, 0.04, { a: 0.09, cut: 1500, rev: 0.4, huge: 0.45, rel: 0.5, scoop: 25 });
        choir(B, 16.95, [50, 57, 62, 66, 69, 74], 0.06, { a: 0.08, r: 0.6, huge: 0.55 });   // releases into the 17.0 resolve
        chord(B, [62, 66, 69, 74, 78, 81], 0.08, { spread: 0.85, strum: 0.025, dec: 2.2, huge: 0.25 });
        silverRing(B + 0.02, 0.8, 0, { huge: 0.25 });
        sparkle(B + 0.03, 20, 1.0, 0.03, 0, 2, 4);
        b808(B, 26, 1.8, 0.45, { glideFrom: 33, glide: 0.15 });
        pad(B, 20.0, [57, 62, 66, 69, 74], 0.034, { a: 0.05, r: 0.05 });
        padLPset('setValueAtTime', 2800, B); padLPset('setValueAtTime', 2800, 19.2); padLPset('exponentialRampToValueAtTime', 900, 19.98);

        // 17.0 resolve: the result type lands on a soft glass motif; 18.5-20 slow hold
        const R = C.result;
        chord(R, [81, 86, 90, 93], 0.13, { spread: 0.6, strum: 0.006, dec: 1.6, dly: 0.2 });   // above the bloom's bed so it reads
        glassTick(R, mtof(98), 0.07, -0.2, { dec: 0.5 });
        subDrop(R, 70, 38, 0.2, 0.3, 1.2);
        [[17.5, 81], [18.0, 78], [18.5, 74], [19.0, 76], [19.5, 69]].forEach(([t, m], i) =>
          bell(t, mtof(m), 0.035, i % 2 ? 0.4 : -0.4, 1.0, { ratio: 3, index: 0.9, rev: 0.35, dly: 0.2 }));
        sparkle(18.4, 6, 1.4, 0.014, 0, 3, 4);
        whoosh(19.55, 0.45, 900, 5000, 0.12, -0.3, 0.3, { peak: 0.9, rev: 0.15 });
      }

      // ---- 05 YOUR COIN, YOUR CALL 20.0-25.0: four stamp-like hits a step higher each,
      //      23.75 the rising ring (80% meter) into the confirm chord at 24.5
      await slice();
      {
        const STEPS = [
          { pad: [57, 62, 66, 69], root: 26, ring: 74 },   // D   KEEP IT VAULTED.
          { pad: [59, 62, 66, 71], root: 35, ring: 78 },   // Bm  LIST IT.
          { pad: [59, 62, 67, 71], root: 31, ring: 79 },   // G   BRING IT HOME.
          { pad: [57, 61, 64, 69], root: 33, ring: 81 }    // A   OR TAKE 80% BACK.
        ];
        padLPset('setValueAtTime', 1800, 20.0); padLPset('exponentialRampToValueAtTime', 2800, 24.9);
        dlp.setValueAtTime(2200, 20.0);
        C.decide.forEach((t, i) => {
          const S = STEPS[i], t1 = i < 3 ? C.decide[i + 1] : C.end;
          if (i) whoosh(t - 0.16, 0.18, 4500, 900, 0.1, 0.4, -0.2, { peak: 0.5 });
          hit(t, 0.6 + 0.06 * i, { f0: 80 + 6 * i, f1: 38, drop: 0.25, subDec: 1.0, body: 55 + 4 * i, slap: 0.55, huge: 0.15, air: 0.2, airDec: 0.35 });
          bell(t, mtof(S.ring), 0.1, i % 2 ? 0.3 : -0.3, 1.2, { ratio: 2.76, index: 0.8, rev: 0.3, dly: 0.12 });
          pad(t, t1 - 0.02, S.pad, 0.03, { a: 0.04, r: 0.06 });
          b808(t, S.root, Math.min(1.1, t1 - t - 0.06), 0.28);
          kick(t + 0.625, 0.3, { f1: 52, f2: 44, dec: 0.3, depth: 0.8 });               // the low pulse between stamps
          if (i < 3) pluck(t + 0.3125, S.ring - 12, 0.03, i % 2 ? -0.3 : 0.3, { cut: 2600, dec: 0.18, dly: 0.25 });
        });
        // 80% ring meter: a rising tone + a gold ring, resolving into the confirm chord
        sweepTone(C.buybackRing[0], C.buybackRing[1] - 0.03, 440, 1174.7, 0.05, { rev: 0.2 });   // gone by 24.5: the confirm enters clean
        goldRing(C.decide[3] + 0.02, 0.45, 0, { decay: 2.0 });
        chord(C.buybackConfirm, [86, 90, 93, 98], 0.11, { spread: 0.45, strum: 0.01, dec: 1.0, dly: 0.12 });
        glassTick(C.buybackConfirm, mtof(102), 0.05, 0.15, { dec: 0.35 });
        subDrop(C.buybackConfirm, 74, 40, 0.15, 0.25, 0.6);
        // into the end card: suck + reverse air
        revCymbal(C.end, 0.45, 0.38);
        whoosh(C.buybackConfirm + 0.05, 0.45, 400, 9000, 0.14, 0, 0, { peak: 0.97, q: 1.2 });
      }

      // ---- 06 END CARD 25.0-30.0: final impact, THE BIFROST CHORD as the arc draws, tail decayed by 29.8
      await slice();
      {
        const t = C.end;
        hit(t, 1.15, { f0: 95, f1: 32, drop: 0.6, subDec: 2.6, body: 48, huge: 0.4, air: 0.34, crash: 0.55 });
        b808(t, 26, 2.2, 0.5, { glideFrom: 33, glide: 0.12 });
        horn(t, [38, 45, 50, 54, 57, 62], 1.0, 0.05, { a: 0.05, cut: 1700, rev: 0.4, huge: 0.3, rel: 0.6, scoop: 20 });
        choir(t, 26.6, [50, 57, 62, 66, 69, 74], 0.05, { a: 0.1, r: 1.3, huge: 0.4 });
        pad(t, 27.6, [57, 62, 66, 69, 74], 0.034, { a: 0.03, r: 1.5 });
        padLPset('setValueAtTime', 2600, t); padLPset('setValueAtTime', 2600, 26.5); padLPset('exponentialRampToValueAtTime', 700, 29.0);
        // the arc draws through the five coins L -> R: the BIFROST CHORD rises with it
        [62, 66, 69, 74, 78].forEach((m, i) => bell(t + 0.12 + i * 0.13, mtof(m + 12), 0.06, -0.85 + i * 0.425, 1.3, { ratio: 3, index: 1.2, rev: 0.4, dly: 0.12 }));
        const L = C.logo;  // the mark resolves: the full chord, the silver ring on the gold ring
        chord(L, [74, 78, 81, 86], 0.14, { spread: 0.85, strum: 0.04, dec: 1.8, huge: 0.15 });
        silverRing(L, 0.6, 0.5, { rev: 0.35 });
        sparkle(L + 0.02, 10, 0.7, 0.022, 0, 2, 4);
        drone(L, 28.6, [38, 50], 'sine', 0.04, 0.6, 1.2, { dest: 'pad' });
        bell(C.glint, 4186, 0.012, 0.2, 0.45, { ratio: 2.76, index: 0.3, rev: 0, dly: 0 }); // glint (dry, gone by 29.3)
      }
    }

    await scoreV3();
    await slice();
    // ---------------------------------------------------- FX pass (24 kHz, pure JS): hall + huge reverbs, ping-pong delay
    // Computed in JS rather than in a second OfflineAudioContext: Chromium's ConvolverNode / delay-loop
    // graph rendered the returns with run-to-run differences in the last bits, so the whole FX bus is
    // done here (FFT convolution, overlap-add) and is bit-identical on every render.
    const fxN = Math.ceil(N / 2);
    const decim = (a, b) => { // 48k -> 24k (mono-sum of a [+ b]), [1/4 1/2 1/4] anti-alias
      const o = new Float32Array(fxN);
      for (let k = 0; k < fxN; k++) {
        const i = 2 * k, x0 = i > 0 ? a[i - 1] : 0, x1 = a[i] || 0, x2 = i + 1 < a.length ? a[i + 1] : 0;
        let v = 0.25 * x0 + 0.5 * x1 + 0.25 * x2;
        if (b) { const y0 = i > 0 ? b[i - 1] : 0, y1 = b[i] || 0, y2 = i + 1 < b.length ? b[i + 1] : 0; v = 0.5 * (v + 0.25 * y0 + 0.5 * y1 + 0.25 * y2); }
        o[k] = v;
      }
      return o;
    };
    // a biquad at FX_SR: jsBiquad designs at SR, so design at the equivalent frequency
    const fxBq = (type, f, q) => jsBiquad(type, f * SR / FX_SR, q);
    function irBuf(seconds, rt60, pre, brightHz, darkHz) {
      const n = Math.round(seconds * FX_SR), out = [new Float32Array(n), new Float32Array(n)];
      for (let c = 0; c < 2; c++) {
        const d = out[c], tau = rt60 / 6.91, preN = Math.round(pre * FX_SR); let y = 0, y2 = 0;
        for (let i = 0; i < n; i++) {
          if (i < preN) { d[i] = 0; continue; }
          const t = (i - preN) / FX_SR, fc = darkHz + (brightHz - darkHz) * Math.exp(-t / (rt60 * 0.3)), a = 1 - Math.exp(-TAU * fc / FX_SR);
          y += a * ((rnd() * 2 - 1) - y); y2 += a * (y - y2);
          const er = (t < 0.09 && rnd() < 0.008) ? (rnd() * 2 - 1) * 2.5 : 0;
          d[i] = (y2 * 1.6 + er) * Math.exp(-t / tau) * Math.min(1, t / 0.006);
        }
      }
      // ConvolverNode-equivalent normalisation (WebAudio 'normalize': -58 dB calibration, 44.1 kHz reference)
      let pw2 = 0; for (const d of out) for (let i = 0; i < n; i++) pw2 += d[i] * d[i];
      const rms = Math.max(0.000125, Math.sqrt(pw2 / (2 * n))), sc = 0.00125 * (44100 / FX_SR) / rms;
      for (const d of out) for (let i = 0; i < n; i++) d[i] *= sc;
      return out;
    }
    // in-place iterative radix-2 complex FFT (sign -1 forward, +1 inverse, unscaled)
    function fft(re, im, sign) {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = sign * TAU / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < half; k++) {
            const a = i + k, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
            const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
          }
        }
      }
    }
    // mono x convolved with the stereo IR [hL, hR] (overlap-add); both outputs share one inverse FFT
    async function convolve(x, h, gain) {
      const hn = h[0].length; let M = 1; while (M < 2 * hn) M <<= 1;
      const B = M - hn + 1, outL = new Float32Array(x.length), outR = new Float32Array(x.length);
      const HLr = new Float64Array(M), HLi = new Float64Array(M), HRr = new Float64Array(M), HRi = new Float64Array(M);
      HLr.set(h[0]); HRr.set(h[1]); fft(HLr, HLi, -1); fft(HRr, HRi, -1);
      const re = new Float64Array(M), im = new Float64Array(M);
      for (let s0 = 0; s0 < x.length; s0 += B) {
        await slice();
        let any = false;
        re.fill(0); im.fill(0);
        for (let i = 0; i < B && s0 + i < x.length; i++) { re[i] = x[s0 + i]; if (re[i] !== 0) any = true; }
        if (!any) continue;
        fft(re, im, -1);
        // Y = X*HL + i*X*HR  ->  inverse: real part = L, imaginary part = R
        for (let k = 0; k < M; k++) {
          const xr = re[k], xi = im[k];
          const lr = xr * HLr[k] - xi * HLi[k], li = xr * HLi[k] + xi * HLr[k];
          const rr2 = xr * HRr[k] - xi * HRi[k], ri = xr * HRi[k] + xi * HRr[k];
          re[k] = lr - ri; im[k] = li + rr2;
        }
        fft(re, im, 1);
        const g = gain / M;
        for (let i = 0; i < M && s0 + i < x.length; i++) { outL[s0 + i] += re[i] * g; outR[s0 + i] += im[i] * g; }
      }
      return [outL, outR];
    }
    // AudioParam automation replay (setValueAtTime / exponentialRampToValueAtTime) for the pad send filter
    function autoAt(ev, t) {
      let v = ev.length ? ev[0][1] : 2200, tv = 0;
      for (let k = 0; k < ev.length; k++) {
        const [m, val, te] = ev[k];
        if (te > t) {
          if (m === 'exponentialRampToValueAtTime') return v * Math.pow(val / v, (t - tv) / Math.max(1e-9, te - tv));
          return v;
        }
        v = val; tv = te;
      }
      return v;
    }
    await slice();
    const hallIR = irBuf(2.7, 2.3, 0.018, 9000, 1800), hugeIR = irBuf(4.2, 3.8, 0.03, 7000, 1200);
    await slice();
    const fxL = new Float32Array(fxN), fxR = new Float32Array(fxN);
    if (!opts.dry && !opts.solo) {
      // ping-pong delay (3/8 s), feedback through a 3.8 kHz lowpass, taps panned hard-ish L / R
      const dIn = decim(sendDly), D = Math.round(0.375 * FX_SR), lineL = new Float32Array(D), lineR = new Float32Array(D);
      const fbLP = fxBq('lp', 3800, 0.6), gl = Math.cos(0.075 * Math.PI / 2), gr = Math.sin(0.075 * Math.PI / 2);
      const dlyMono = new Float32Array(fxN);
      let p = 0, fbPrev = 0;
      for (let k = 0; k < fxN; k++) {
        const outL = lineL[p], outR = lineR[p];          // dL, dR outputs (written D samples ago)
        lineL[p] = dIn[k] + fbPrev * 0.36;               // dL <- input + feedback(dR)
        lineR[p] = outL;                                  // dR <- dL
        fbPrev = fbLP(outR);
        p = (p + 1) % D;
        // pL (pan -0.85) carries dL, pR (pan +0.85) carries dR, both x 0.55
        fxL[k] += 0.55 * (outL * gl + outR * gr); fxR[k] += 0.55 * (outL * gr + outR * gl);
        dlyMono[k] = 0.55 * (outL + outR) * 0.5;
      }
      await slice();
      // hall input: rev sends + pads (post their lowpass) + arps + a little of the delay, high-passed at 220 Hz
      const padIn = decim(stems.pad.L, stems.pad.R), arpIn = decim(stems.arp.L, stems.arp.R), rv = decim(sendRev);
      const ev = padAuto.slice().sort((a, b) => a[2] - b[2]);
      let pst = null; const hp1 = fxBq('hp', 220, 0.7);
      const hallIn = new Float32Array(fxN);
      for (let k = 0; k < fxN; k++) {
        if ((k & 31) === 0) pst = jsBiquadState(pst, 'lp', autoAt(ev, k / FX_SR) * SR / FX_SR, 0.6);
        hallIn[k] = hp1(rv[k] + 0.22 * pst.run(padIn[k]) + 0.18 * arpIn[k] + 0.25 * dlyMono[k]);
      }
      await slice();
      const hp2 = fxBq('hp', 160, 0.7), hugeIn = decim(sendHuge);
      for (let k = 0; k < fxN; k++) hugeIn[k] = hp2(hugeIn[k]);
      const hall = await convolve(hallIn, hallIR, 0.95), huge = await convolve(hugeIn, hugeIR, 0.9);
      for (let k = 0; k < fxN; k++) { fxL[k] += hall[0][k] + huge[0][k]; fxR[k] += hall[1][k] + huge[1][k]; }
      // the 10.0 cut to black is a real cut: the returns close with the picture and reopen under the
      // 12.65 release swell, so 10.0-12.6 is near-silence (seam bed + pulses only)
      const a0 = CUES.nearSilence[0] - 0.03, a1 = CUES.nearSilence[0] + 0.02, b0 = CUES.nearSilence[1] - 0.1, b1 = CUES.release + 0.1;
      for (let k = Math.floor(a0 * FX_SR); k < Math.min(fxN, Math.ceil(b1 * FX_SR)); k++) {
        const t = k / FX_SR, g = t < a1 ? (a1 - t) / (a1 - a0) : t < b0 ? 0 : (t - b0) / (b1 - b0);
        fxL[k] *= g; fxR[k] *= g;
      }
    }
    await slice();

    // ---------------------------------------------------- stems (+ FX return) -> main graph, then render
    const play0 = (name, dest) => { if (opts.solo && opts.solo !== name) return; const s = ctx.createBufferSource(); s.buffer = stems[name].buf; s.connect(dest); s.start(0); };
    play0('drum', drumBus); play0('bass', bassBus); play0('pad', padBus); play0('arp', arpBus);
    play0('lead', leadBus); play0('sfx', sfx); play0('sub', subBus); play0('foley', foleyBus);
    if (!opts.dry && !opts.solo) {
      const fb = ctx.createBuffer(2, fxN, FX_SR); fb.copyToChannel(fxL, 0); fb.copyToChannel(fxR, 1);
      const s = ctx.createBufferSource(); s.buffer = fb; // 24 kHz buffer, resampled by the source
      s.connect(F('lowpass', 10500, 0.7, mixB)); s.start(0);
    }
    return ctx.startRendering().then((buf) => { buf._bvFoley = used; return buf; });
  }
  // =====================================================================
  //  MASTERING (JS): loudness normalise to -14 LUFS, true-peak limit (ceiling -1.5 dBFS at 4x oversampling)
  // =====================================================================
  function kFilter(x) {
    const y = new Float32Array(x.length);
    // BS.1770 K-weighting @ 48 kHz
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    const b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285, a1 = -1.69065929318241, a2 = 0.73248077421585;
    const c1 = -1.99004745483398, c2 = 0.99007225036621;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      const u = v - 2 * z1 + z2 - c1 * w1 - c2 * w2; z2 = z1; z1 = v; w2 = w1; w1 = u;
      y[i] = u;
    }
    return y;
  }
  function integratedLUFS(L, R) {
    const kl = kFilter(L), kr = kFilter(R), seg = 4800, nSeg = Math.floor(L.length / seg);
    const sl = new Float64Array(nSeg), srr = new Float64Array(nSeg);
    for (let s = 0; s < nSeg; s++) {
      let a = 0, b = 0; for (let i = s * seg; i < (s + 1) * seg; i++) { a += kl[i] * kl[i]; b += kr[i] * kr[i]; }
      sl[s] = a; srr[s] = b;
    }
    const blocks = [];
    for (let s = 0; s + 4 <= nSeg; s++) {
      const z = (sl[s] + sl[s + 1] + sl[s + 2] + sl[s + 3] + srr[s] + srr[s + 1] + srr[s + 2] + srr[s + 3]) / (4 * seg);
      blocks.push(z);
    }
    const ld = (z) => -0.691 + 10 * Math.log10(z + 1e-20);
    let g1 = blocks.filter((z) => ld(z) > -70);
    if (!g1.length) return -70;
    const m1 = g1.reduce((a, b) => a + b, 0) / g1.length;
    const thr = ld(m1) - 10;
    const g2 = g1.filter((z) => ld(z) > thr);
    return ld(g2.reduce((a, b) => a + b, 0) / g2.length);
  }
  // 4x oversampled peak estimate per sample interval (windowed sinc, 16 taps)
  const TP_H = (function () {
    const H = [];
    for (let p = 1; p < 4; p++) {
      const fr = p / 4, h = [];
      for (let k = -7; k <= 8; k++) {
        const x = fr - k; const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const w = 0.5 + 0.5 * Math.cos(Math.PI * x / 8.5);
        h.push(sinc * w);
      }
      H.push(h);
    }
    return H;
  })();
  function tpTrack(x, thr) {
    const n = x.length, tp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = Math.abs(x[i]);
      const nx = i + 1 < n ? Math.abs(x[i + 1]) : 0;
      if ((m > thr || nx > thr) && i >= 7 && i + 8 < n) {
        for (let p = 0; p < 3; p++) {
          const h = TP_H[p]; let s = 0;
          for (let k = 0; k < 16; k++) s += x[i - 7 + k] * h[k];
          const a = Math.abs(s); if (a > m) m = a;
        }
      }
      tp[i] = Math.max(m, nx);
    }
    return tp;
  }
  async function limit(L, R, gain, ceil) {
    const n = L.length, oL = new Float32Array(n), oR = new Float32Array(n);
    for (let i = 0; i < n; i++) { oL[i] = L[i] * gain; oR[i] = R[i] * gain; }
    const thr = ceil * 0.55;
    const tl = tpTrack(oL, thr); await slice();
    const tr = tpTrack(oR, thr); await slice();
    const req = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = Math.max(tl[i], tr[i]); req[i] = p > ceil ? ceil / p : 1; }
    const LA = 96; // 2 ms lookahead
    // forward-looking sliding min (deque)
    const m = new Float32Array(n), dq = new Int32Array(n); let h = 0, tq = 0;
    for (let i = n - 1; i >= 0; i--) {
      while (tq > h && req[dq[tq - 1]] >= req[i]) tq--;
      dq[tq++] = i;
      while (dq[h] > i + LA) h++;
      m[i] = req[dq[h]];
    }
    // release smoothing (gain only recovers slowly), then box-average for attack
    const rel = Math.exp(-1 / (0.08 * SR));
    let r = 1; const rv = new Float32Array(n);
    for (let i = 0; i < n; i++) { r = 1 - (1 - r) * rel; if (m[i] < r) r = m[i]; rv[i] = r; }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += rv[i]; if (i > LA) acc -= rv[i - LA - 1];
      const g = acc / Math.min(i + 1, LA + 1);
      oL[i] *= g; oR[i] *= g;
    }
    return [oL, oR];
  }
  // DynamicsCompressorNode adds a fixed look-ahead delay (browser-specific): measure it with an impulse
  function probeLatency() {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const c = new Ctx(1, 8192, SR), b = c.createBuffer(1, 8192, SR);
    b.getChannelData(0)[2000] = 0.01;
    const s = c.createBufferSource(); s.buffer = b;
    const c1 = c.createDynamicsCompressor(), c2 = c.createDynamicsCompressor();
    s.connect(c1); c1.connect(c2); c2.connect(c.destination); s.start(0);
    return c.startRendering().then((r) => {
      const d = r.getChannelData(0); let k = 2000, m = 0;
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); k = i; }
      return clamp(k - 2000, 0, 4000);
    }).catch(() => 0);
  }
  // hard silences + end fade, applied after latency compensation so they sit exactly on the cue grid
  function gates(L, R) {
    const ramp = (a, b, g0, g1) => { const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = Math.max(0, i0); i < Math.min(L.length, i1); i++) { const g = g0 + (g1 - g0) * (i - i0) / (i1 - i0); L[i] *= g; R[i] *= g; } };
    const zero = (a, b) => { for (let i = Math.max(0, Math.round(a * SR)); i < Math.min(L.length, Math.round(b * SR)); i++) { L[i] = 0; R[i] = 0; } };
    const cs = CUES;
    cs.silences.forEach(([a, b]) => { ramp(a - 0.006, a, 1, 0); zero(a, b - 0.0015); ramp(b - 0.0015, b, 0, 1); });
    (cs.dips || []).forEach(([a, b, g]) => { ramp(a - 0.025, a, 1, g); ramp(a, b - 0.0015, g, g); ramp(b - 0.0015, b, g, 1); });
    const end = L.length / SR;
    ramp(end - 1.2, end - 0.2, 1, 0); zero(end - 0.2, end);   // tail decayed by 29.8
  }
  // DC blocker + 4th-order Butterworth high-pass at 28 Hz: removes infrasonic rumble that no
  // speaker reproduces but that eats limiter headroom (the 808 fundamental at D1 = 36.7 Hz stays)
  function subHP(d) {
    const h1 = jsBiquad('hp', 28, 0.5412), h2 = jsBiquad('hp', 28, 1.3066);
    for (let i = 0; i < d.length; i++) d[i] = h2(h1(d[i]));
  }
  async function master(buffer, latency) {
    const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
    if (latency > 0) for (const d of [L, R]) { d.copyWithin(0, latency); d.fill(0, d.length - latency); }
    subHP(L); subHP(R);
    gates(L, R);
    await slice();
    const ceil = Math.pow(10, CEIL_DBTP / 20);
    const l0 = integratedLUFS(L, R);
    let gain = Math.pow(10, (TARGET_LUFS - l0) / 20);
    await slice();
    let res = await limit(L, R, gain, ceil);
    for (let it = 0; it < 2; it++) {
      await slice();
      const l1 = integratedLUFS(res[0], res[1]);
      await slice();
      gain *= Math.pow(10, (TARGET_LUFS - l1) / 20);
      res = await limit(L, R, gain, ceil);
    }
    // final safety: hard ceiling on samples (never clip), and digital silence for the last 0.2 s
    const end = Math.round((L.length / SR - 0.2) * SR);
    for (let c = 0; c < 2; c++) {
      const src = res[c], dst = buffer.getChannelData(c);
      for (let i = 0; i < dst.length; i++) {
        let v = src[i];
        if (v > ceil) v = ceil; else if (v < -ceil) v = -ceil;
        dst[i] = i >= end ? 0 : v;
      }
    }
    buffer._bvStats = { inputLUFS: l0, gain: gain, latency: latency };
    return buffer;
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================
  let renderPromise = null, lastFoley = null;
  function render() {
    if (!renderPromise) {
      renderPromise = Promise.all([loadSamples().then((s) => build(null, s)), probeLatency()]).then((r) => { lastFoley = r[0]._bvFoley || null; return master(r[0], r[1]); }).catch((e) => { renderPromise = null; throw e; });
    }
    return renderPromise;
  }
  function toWav(buffer) {
    const nch = 2, n = buffer.length, bytes = 44 + n * nch * 2;
    const ab = new ArrayBuffer(bytes), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE');
    ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
    dv.setUint32(24, buffer.sampleRate, true); dv.setUint32(28, buffer.sampleRate * nch * 2, true);
    dv.setUint16(32, nch * 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, n * nch * 2, true);
    const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    let o = 44;
    for (let i = 0; i < n; i++) {
      const a = Math.max(-1, Math.min(1, L[i])), b = Math.max(-1, Math.min(1, R[i]));
      dv.setInt16(o, Math.round(a * 32767), true); dv.setInt16(o + 2, Math.round(b * 32767), true); o += 4;
    }
    return ab;
  }
  function wav() { return render().then(toWav); }

  // ---------------------------------------------------- live playback synced to BV
  // Each run of the soundtrack is one AudioBufferSource through its own gain ("voice"), so every
  // start / stop / seek is a short fade (no clicks) and stopped voices disconnect themselves.
  // While a voice is audible, BV.clock follows the *audible* audio position (output latency
  // included), so picture and sound cannot drift apart; when audio is not running the clock
  // returns NaN and the film falls back to its own timer.
  const FADE_IN = 0.008, FADE_OUT = 0.006 /* setTarget time-constant (~30 ms to silence) */;
  const RESYNC_FREE = 0.25, RESYNC_LOCKED = 0.08;
  const live = { ctx: null, gain: null, voice: null, alive: 0, starts: 0, wired: false, enabled: false, buffer: null, pending: null, lastClock: -1 };
  let muted = false;

  // audible film position of the running voice (seconds), or NaN when nothing is audible
  function heardPos() {
    const v = live.voice, c = live.ctx;
    if (!v || !c || c.state !== 'running') return NaN;
    let x = NaN;
    if (typeof c.getOutputTimestamp === 'function' && typeof performance !== 'undefined') {
      const ts = c.getOutputTimestamp();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) x = ts.contextTime + clamp((performance.now() - ts.performanceTime) / 1000, 0, 0.25);
    }
    if (!(x === x)) x = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    return clamp(v.offset + (x - v.startCtx), v.offset, live.buffer.duration);
  }
  // BV.clock: monotonic within a run
  function clock() {
    const p = heardPos();
    if (!(p === p)) return NaN;
    if (p < live.lastClock) return live.lastClock;
    live.lastClock = p;
    return p;
  }
  function stopVoice(v) {
    if (!v) return;
    const c = live.ctx, t0 = Math.max(c.currentTime, v.fadeEnd);
    try { v.g.gain.setTargetAtTime(0, t0, FADE_OUT); v.src.stop(t0 + FADE_OUT * 6); } catch (e) { /* already stopped */ }
  }
  function stop() { const v = live.voice; live.voice = null; live.lastClock = -1; stopVoice(v); }
  function startAt(t) {
    const c = live.ctx, b = live.buffer;
    stop();
    if (!c || !b) return;
    t = Math.max(0, +t || 0);
    if (t >= b.duration - 0.05) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    const src = c.createBufferSource(), g = c.createGain(), when = c.currentTime;
    src.buffer = b; src.connect(g); g.connect(live.gain);
    const fi = t < 0.001 ? 0.002 : FADE_IN;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + fi);
    src.start(when, t);
    const v = { src: src, g: g, startCtx: when, offset: t, fadeEnd: when + fi };
    live.alive++; live.starts++;
    src.onended = () => {
      if (v.ended) return; v.ended = true;
      live.alive--;
      try { src.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
      if (live.voice === v) live.voice = null;
    };
    live.voice = v;
  }
  // bring audio in line with the film time t (only restarts when it really is out of sync)
  function sync(t) {
    const BV = window.BV;
    if (!live.enabled || !BV) return;
    if (!BV.playing) { if (live.voice) stop(); return; }
    t = typeof t === 'number' && t === t ? t : BV.t;
    if (!live.voice) { startAt(t); return; }
    const locked = BV.clock === clock;
    // a frame that simply applied the value our clock returned is not a seek, however long the
    // frame took to draw (heavy frames / re-layouts on slow devices must not restart the audio)
    if (locked && t === live.lastClock) return;
    const p = heardPos();
    if (!(p === p)) return;               // context not running yet (resume pending): statechange re-syncs
    if (Math.abs(p - t) > (locked ? RESYNC_LOCKED : RESYNC_FREE)) startAt(t);
  }
  function wire() {
    const BV = window.BV;
    if (live.wired || !BV || typeof BV.on !== 'function') return;
    live.wired = true;
    BV.on('play', () => { if (live.enabled) startAt(BV.t); });
    BV.on('pause', stop);
    BV.on('end', stop);
    BV.on('time', sync);
    BV.on('format', () => sync(BV.t)); // a re-layout is not a seek: keep the voice running
  }
  // the film follows the audio clock while sound is enabled (never clobber someone else's clock)
  function lockClock() {
    const BV = window.BV;
    if (BV && live.enabled && (BV.clock == null || BV.clock === clock)) BV.clock = clock;
  }
  // inside a user gesture: resume + play one silent frame (unlocks iOS / Safari output)
  function unlock() {
    const c = live.ctx;
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); s.onended = () => { try { s.disconnect(); } catch (e) { /* noop */ } }; } catch (e) { /* noop */ }
  }
  function enable() {
    if (!live.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('WebAudio unavailable'));
      try { live.ctx = new AC({ latencyHint: 'playback' }); } catch (e) { live.ctx = new AC(); }
      live.gain = live.ctx.createGain(); live.gain.gain.value = muted ? 0 : 1; live.gain.connect(live.ctx.destination);
      // suspended / interrupted (autoplay policy, iOS call, BT switch): resume on the next gesture,
      // and re-sync once the context runs again (a voice does not advance while suspended)
      const kick = () => { if (live.ctx.state !== 'running') unlock(); };
      ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, kick, { capture: true, passive: true }));
      live.ctx.onstatechange = () => { if (live.ctx.state === 'running' && live.enabled && window.BV && window.BV.playing) startAt(window.BV.t); };
    }
    unlock();
    if (!live.pending) {
      live.pending = render().then((b) => {
        live.buffer = b; live.enabled = true;
        wire(); lockClock(); sync();
      }).catch((e) => { live.pending = null; throw e; });
    } else if (live.enabled) { wire(); lockClock(); sync(); }
    return live.pending;
  }
  function setMuted(b) {
    muted = !!b;
    if (live.gain && live.ctx) live.gain.gain.setTargetAtTime(muted ? 0 : 1, live.ctx.currentTime, 0.015);
  }

  const api = {
    CUES: CUES,
    get foley() { return lastFoley; },
    render: render,
    wav: wav,
    enable: enable,
    setMuted: setMuted,
    get muted() { return muted; },
    set muted(b) { setMuted(b); },
    get enabled() { return live.enabled; },
    _state: function () {
      const p = heardPos();
      return { playing: !!live.voice, pos: p === p ? p : null, ctx: live.ctx ? live.ctx.state : null, voices: live.alive, starts: live.starts, clockLocked: !!(window.BV && window.BV.clock === clock) };
    },
    // internal (analysis / stems): uncached render with options { only: 'music'|'sfx'|'dry' }
    _renderRaw: function (o) { return loadSamples().then((s) => build(o, s)); },
    _toWav: toWav,
    _lufs: integratedLUFS
  };
  window.BVAudio = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }
})();
