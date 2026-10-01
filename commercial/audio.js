/* ============================================================================
   audio.js — window.BVAudio
   Bifrost Vault commercial · fully procedural 60 s score + SFX, pure WebAudio.

   - BVAudio.render()  -> Promise<AudioBuffer>  (OfflineAudioContext, 48 kHz stereo, cached)
   - BVAudio.wav()     -> Promise<ArrayBuffer>  (16-bit PCM stereo WAV of render())
   - BVAudio.enable()  -> Promise               (user gesture: AudioContext + live playback synced to BV;
                                                  while sound runs BV.clock follows the audible audio position,
                                                  so picture and sound stay locked; starts/stops/seeks are faded)
   - BVAudio.muted / BVAudio.setMuted(bool)
   - BVAudio.CUES      -> the active cue sheet (CUES30 for the v2 30 s cut, CUES60 for the 60 s arc;
                          chosen from BV.duration || BV_CONFIG.film.duration). Both scores live in this file.

   Deterministic: every noise buffer / random choice comes from mulberry32(2026).
   No external libraries; no Math.random; no casino sounds (no reel spins, no
   coin-hopper payouts, no slot bells / buzzers).
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ CUES
  // 120 BPM -> beat 0.5 s, bar 2.0 s. D minor, Picardy lift to D MAJOR at 23.0.
  const CUES60 = {
    version: '60s', bpm: 120, beat: 0.5, bar: 2.0, key: 'D minor -> D major @ 23.0',
    scenes: [
      { id: 'nft-era',        start: 0,  end: 3,  name: 'The NFT Era' },
      { id: 'weighs',         start: 3,  end: 6,  name: 'Now It Weighs Something' },
      { id: 'every-pack',     start: 6,  end: 10, name: 'Every Pack Hits' },
      { id: 'rip',            start: 10, end: 14, name: 'Rip It' },
      { id: 'tiers',          start: 14, end: 20, name: 'Silver, Rare, Gold' },
      { id: 'legendary',      start: 20, end: 26, name: 'Legendary Gold' },
      { id: 'minted',         start: 26, end: 30, name: 'Minted. Verified.' },
      { id: 'your-call',      start: 30, end: 34, name: 'Your Pull. Your Call.' },
      { id: 'ship',           start: 34, end: 38, name: 'Ship It Home' },
      { id: 'trade',          start: 38, end: 45, name: 'Trade On-Chain: The Floor' },
      { id: 'buyback',        start: 45, end: 50, name: '80% Buyback. Instant.' },
      { id: 'endcard',        start: 50, end: 60, name: 'Callback + End Card' }
    ],
    nftSlams: [0.0, 0.5, 1.0, 1.5],
    tapeStop: [2.0, 2.6], scaleBeeps: [2.3, 2.6], deadAir: [2.7, 3.0],
    reverseWhoosh: [3.0, 3.6], dieSlam: [3.6, 4.0],
    strike: 4.0, lcdTicks: [4.1, 4.5], goldLand: 4.8, spin: [5.2, 5.85], whipToPack: 5.85,
    introGroove: [6.0, 10.0], specularSweeps: [6.6, 8.9], gjallarhorn: 7.2, packFlip: 8.0,
    stampNoEmptyPulls: 8.4, packFlipBack: 9.4,
    riser: [10.0, 11.5], silence1: [11.5, 12.0],
    drop1Tear: 12.0, slowmo1: [12.25, 13.5], ripShatter: 12.6, bifrostChord: 13.5,
    groove: [14.0, 20.0], tiers: { silver: 14.0, rare: 15.5, gold: 17.0 }, rimLeaks: [15.25, 16.75],
    fourthCoinRide: [18.5, 19.7], filterDown: [18.5, 20.0],
    heartbeats: [20.0, 20.8, 21.4, 21.8], silence2: [21.93, 22.0],
    drop2Legendary: 22.0, slowmo2: [22.0, 23.0], majorLift: 23.0, oneOf25: 23.2,
    engrave: [23.6, 24.2], auDing: 24.4, chatStorm: [23.1, 25.9],
    whipPan: 26.0, dataGroove: [26.0, 30.0], hashBlips: [26.675, 26.95], mintTicks: [26.3, 26.8, 27.0, 27.2],
    nfc: 28.6, verified: 28.85,
    halfTime: [30.0, 34.0], stamps: [31.0, 31.5, 32.0, 32.5], vaultDoor: 32.9,
    warm: [34.0, 38.0], offerTink: 34.1, swipe: 34.4, capsuleSnap: 34.6, sealSlap: 35.0,
    boxFlaps: [35.3, 35.4, 35.5, 35.6], tapeZip: 35.62, labelPrinter: [35.8, 36.6], doorChime: 37.2,
    drop3: 38.0, bids: [38.4, 38.8, 39.2, 39.6, 40.0, 40.4, 40.8], escrowLatch: 41.0, release: 42.6,
    royaltySparkle: 43.0, confirmations: [43.6, 45.0],
    filteredHalfBar: [45.0, 45.5], silence3: [45.5, 46.0],
    drop4: 46.0, silverCascade: 8, meterSweep: [46.0, 46.5], confirmChord: 46.5, instant: 46.6,
    buybackTags: [47.7, 48.1, 48.5, 48.9],
    callbacks: [50.0, 50.5, 51.0, 51.5], finalImpact: 52.0, logoArc: [52.4, 52.8],
    violetDot: 52.8, mintDotRing: 52.92, glint: 58.5, tailEnd: 59.8,
    silences: [[2.7, 3.0], [11.5, 12.0], [21.93, 22.0], [45.5, 46.0]],
    dips: [[51.93, 52.0, 0.3]]   // pre-hit 'suck' (gain) so the final impact reads as a peak
  };
  // v2 30 s app-first cut (ARCH.md v2 / SCRIPT_V2.md; mirrors BVShared.CUES)
  const CUES30 = {
    version: '30s', bpm: 120, beat: 0.5, bar: 2.0, key: 'D minor -> D major @ 12.3',
    scenes: [
      { id: 'hook', start: 0.0, end: 2.2 }, { id: 'app-pack', start: 2.0, end: 4.2 }, { id: 'rip', start: 4.0, end: 6.2 },
      { id: 'reveal', start: 6.0, end: 10.2 }, { id: 'legendary', start: 10.0, end: 14.2 }, { id: 'decide', start: 14.0, end: 22.2 },
      { id: 'proof', start: 22.0, end: 24.7 }, { id: 'endcard', start: 24.5, end: 30.0 }
    ],
    hookStab: 0.0, strike: 1.0, intoPhone: 1.7, groove: 2.0, everyPackHits: 2.4, silverOrGold: 3.0, tapRip: 3.5,
    rip: 4.0, tear: 4.6, slowmo: [4.6, 5.4], slowOut: 5.4,
    tiers: { silver: 6.0, rare: 7.3, gold: 8.6 }, filterDown: [9.2, 10.0],
    heartbeats: [10.0, 10.8], silence: [11.4, 11.5], legendary: 11.5, oneOf25: 12.3, majorLift: 12.3, engrave: 12.6, backIntoPhone: 13.4,
    decide: [14.0, 16.0, 18.0, 20.0], ringMeter: [18.3, 18.9], confirmChord: 18.9, vaultClunk: 20.6, vaultLine: 20.8,
    proof: 22.0, nfcTap: 22.5, mintLog: 23.2, endCard: 24.5, logo: 25.3, glint: 28.8, tailEnd: 29.8,
    silences: [[11.4, 11.5]],
    dips: [[24.43, 24.5, 0.3]]   // pre-hit 'suck' under the reverse cymbal into the final impact
  };
  const cuesFor = (d) => (d < 45 ? CUES30 : CUES60);

  const SR = 48000;
  const TARGET_LUFS = -14;
  const CEIL_DBTP = -1.8;

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
    return (bv && bv.duration) || (cfg && cfg.film && cfg.film.duration) || 60;
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
  //  SCORE BUILDER
  //  Every voice is synthesised in JS (seeded) and mixed into a handful of stem
  //  buffers; the stems then run through the WebAudio bus graph (sidechain duck,
  //  saturation, automated filters, reverbs/delay, glue compressor, limiter) in
  //  an OfflineAudioContext. This keeps the live node count tiny, so the whole
  //  minute renders in a few seconds.
  // =====================================================================
  async function build(opts) {
    opts = opts || {};
    const dur = getDuration();
    const END = dur;
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
    stem('bass', 1); stem('sub', 1); stem('music', 1, 3.0);
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
    // variable-rate playback (tape stop, scratch, half-speed crash): rate(tt) per output sample
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

    // ---------------------------------------------------- source material (seeded)
    const noise = mk(6, 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
    const NL = noise[0].length;
    const clickB = mk(0.008, 1, (d) => {
      // beater / UI click: 3 kHz HP + 9 kHz LP (a knock, not a full-band digital spike)
      const hp = jsBiquad('hp', 3000, 0.7), lp = jsBiquad('lp', 9000, 0.7);
      for (let i = 0; i < d.length; i++) d[i] = 1.25 * lp(hp((i < 2 ? 1 : 0) + (rnd() * 2 - 1) * Math.exp(-i / (0.0008 * SR)) * 0.7));
    });
    function hatBuf(decay) {
      return mk(decay * 1.6, 1, (d) => {
        const fr = [263, 400, 421, 474, 587, 845].map((f) => f * 1.55), ph = fr.map(() => rnd());
        const h1 = jsBiquad('hp', 7200, 0.9), h2 = jsBiquad('hp', 7200, 0.9), bp = jsBiquad('bp', 10500, 0.6);
        for (let i = 0; i < d.length; i++) {
          const t = i / SR; let s = 0;
          for (let k = 0; k < 6; k++) s += ((ph[k] + fr[k] * t) % 1) < 0.5 ? 1 : -1;
          s = s / 6 * 0.8 + (rnd() * 2 - 1) * 0.5;
          d[i] = h2(h1(bp(s))) * Math.exp(-t / (decay / 4.6)) * Math.min(1, t / 0.0006) * 1.6;
        }
      });
    }
    const hatC = hatBuf(0.055), hatO = hatBuf(0.32);
    const clapB = mk(0.4, 2, (d, c) => {
      const bp = jsBiquad('bp', 1350 + c * 120, 1.4), hp = jsBiquad('hp', 2500, 0.7);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, n = rnd() * 2 - 1;
        let e = 0;
        for (let k = 0; k < 3; k++) { const tk = t - k * 0.0105; if (tk >= 0) e = Math.max(e, Math.exp(-tk / 0.0035)); }
        if (t > 0.021) e = Math.max(e, 0.75 * Math.exp(-(t - 0.021) / 0.07));
        d[i] = bp(n) * e * 2.2 + hp(n) * Math.exp(-t / 0.03) * 0.35 + Math.sin(TAU * 185 * t) * Math.exp(-t / 0.045) * 0.55;
      }
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
    // Chiptune segment (0..2.95 s): 4-bit, 8 kHz sample-and-hold, D minor
    await slice();
    const chipB = mk(2.95, 1, (d) => {
      const LEAD = [74, 77, 81, 86, 81, 77, 74, 81, 72, 76, 79, 84, 81, 79, 77, 76];
      const STAB = [62, 65, 69, 74];
      let pl = 0, pb = 0, held = 0, lfsr = 1;
      const ps = STAB.map(() => 0);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, step = Math.floor(t / 0.125), lt = t - step * 0.125;
        pl += mtof(LEAD[step % 16]) / SR;
        let s = ((pl % 1) < 0.25 ? 1 : -1) * 0.16 * (lt < 0.095 ? Math.exp(-lt / 0.12) : 0);
        const b8 = Math.floor(t / 0.25); pb += mtof(b8 % 2 ? 50 : 38) / SR;
        s += (1 - 4 * Math.abs((pb % 1) - 0.5)) * 0.22 * ((t - b8 * 0.25) < 0.2 ? 1 : 0);
        const k = Math.floor(t / 0.5), st = t - k * 0.5;
        if (k < 4 && st < 0.17) { // gated 8-bit stab on each word slam
          const gate = (st % 0.034) < 0.022 ? 1 : 0, blip = 1 + 0.6 * Math.exp(-st / 0.008);
          for (let j = 0; j < 4; j++) { ps[j] += mtof(STAB[j]) * blip / SR; s += ((ps[j] % 1) < 0.5 ? 1 : -1) * 0.1 * gate * Math.exp(-st / 0.2); }
        }
        const e8 = t - Math.floor(t / 0.25) * 0.25, odd = Math.floor(t / 0.25) % 2 === 1;
        if (i % 8 === 0) { const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); }
        s += ((lfsr & 1) ? 1 : -1) * (odd ? 0.1 : 0.04) * Math.exp(-e8 / (odd ? 0.05 : 0.015));
        const eb = t - Math.floor(t / 0.5) * 0.5;
        s += Math.sin(TAU * (60 * eb + 900 * 0.012 * (1 - Math.exp(-eb / 0.012)))) * 0.3 * Math.exp(-eb / 0.08);
        if (i % 6 === 0) held = Math.round(clamp(s, -1, 1) * 7) / 7;
        d[i] = held;
      }
    });
    const scratchB = mk(0.6, 1, (d) => {
      const bp = jsBiquad('bp', 1400, 1.1); let p = 0;
      for (let i = 0; i < d.length; i++) { p += 190 / SR; d[i] = bp(((p % 1) * 2 - 1) * 0.6 + (rnd() * 2 - 1) * 0.5) * 2.2; }
    });
    function crinkleBuf(seconds, dens, flick) {
      return mk(seconds, 2, (d) => {
        const hp = jsBiquad('hp', 2200, 0.7), bp = jsBiquad('bp', 5200, 0.8);
        let e = 0, amp = 0, sign = 1;
        for (let i = 0; i < d.length; i++) {
          const u = i / d.length, t = i / SR;
          if (rnd() < dens(u) * 0.004) { e = 1; amp = rr(0.2, 1); sign = rnd() < 0.5 ? -1 : 1; }
          e *= 0.93;
          const f = flick ? (0.65 + 0.35 * Math.sin(TAU * 12 * t)) : 1;
          d[i] = bp(hp((rnd() * 2 - 1) * e * amp * sign)) * 3.2 * f;
        }
      });
    }
    const crinkleSweep = crinkleBuf(0.7, (u) => Math.sin(Math.PI * u) * 0.9, false);
    const crinkleRise = crinkleBuf(1.55, (u) => 0.25 + 1.6 * u * u, true);
    await slice();
    const tearB = mk(0.42, 2, () => {});
    (function () { // tear crackle: 40 ms grains rising 2 -> 9 kHz + rip texture
      for (let c = 0; c < 2; c++) {
        const d = tearB[c], grains = [];
        for (let g = 0; g < 11; g++) grains.push({ t0: g * 0.03 + rr(0, 0.012), f: 2000 * Math.pow(4.5, g / 10) * rr(0.85, 1.15), a: rr(0.5, 1) });
        const filt = grains.map((g) => jsBiquad('bp', g.f, 1.6)), hp = jsBiquad('hp', 1500, 0.7);
        let am = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / SR; let s = 0;
          for (let g = 0; g < grains.length; g++) {
            const tl = t - grains[g].t0, y = filt[g](tl >= 0 && tl < 0.04 ? rnd() * 2 - 1 : 0);
            if (tl >= 0 && tl < 0.06) s += y * grains[g].a * Math.sin(Math.PI * Math.min(1, tl / 0.04));
          }
          if (rnd() < 0.02) am = rr(0.3, 1);
          am *= 0.995;
          s += hp(rnd() * 2 - 1) * am * 0.6 * Math.exp(-t / 0.2);
          d[i] = s * 1.4;
        }
      }
    })();
    await slice();
    const engraveB = mk(0.62, 1, (d) => {
      const hp = jsBiquad('hp', 4200, 0.7), bp = jsBiquad('bp', 6800, 6); let e = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        if (rnd() < 0.012) e = rr(0.4, 1);
        e *= 0.9;
        const n = rnd() * 2 - 1, jit = 0.6 + 0.4 * Math.sin(i * 0.013) * Math.sin(i * 0.0021);
        d[i] = (hp(n * e) * 1.4 + bp(n) * 1.1 * jit) * Math.sin(Math.PI * u) * 1.2;
      }
    });
    const zipB = mk(0.34, 1, (d) => {
      const bp = jsBiquad('bp', 2600, 0.9); let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length; ph += (45 + 95 * u) / SR;
        d[i] = bp(rnd() * 2 - 1) * Math.pow(0.5 + 0.5 * Math.sin(TAU * ph), 3) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 2.6;
      }
    });
    const printerB = mk(0.82, 1, (d) => {
      const hp = jsBiquad('hp', 1800, 0.8), bp = jsBiquad('bp', 900, 3); let p = 0, e = 0, next = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, burst = (t % 0.16) < 0.11 ? 1 : 0.1;
        if (i >= next) { e = burst; next = i + Math.round(SR / rr(48, 62)); }
        e *= 0.86; p += 96 / SR;
        d[i] = hp((rnd() * 2 - 1) * e) * 0.9 + bp(((p % 1) < 0.5 ? 1 : -1) * 0.18 * burst) * 1.4;
      }
    });
    function shepardBuf(seconds, octPerSec) { // Shepard riser: octave-spaced tones under a Gaussian window
      return mk(seconds, 2, (d, c) => {
        const NO = 7, base = 46.25, ph = new Float64Array(NO), det = c ? 1.004 : 1;
        for (let i = 0; i < d.length; i++) {
          const t = i / SR, u = i / d.length, p = octPerSec * t; let s = 0;
          for (let k = 0; k < NO; k++) {
            const lp = (k + p) % NO; ph[k] += base * Math.pow(2, lp) * det / SR;
            const w = Math.exp(-Math.pow(lp - NO * 0.55, 2) / (2 * 1.25 * 1.25));
            s += w * (Math.sin(TAU * ph[k]) + 0.25 * Math.sin(2 * TAU * ph[k]));
          }
          d[i] = s * 0.32 * (0.15 + 0.85 * u * u) * Math.min(1, u * 20);
        }
      });
    }
    await slice();
    const shep1 = shepardBuf(1.5, 0.9), shep2 = shepardBuf(1.93, 1.0);

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
    const sfx = G(1, mix);
    const subBus = G(0.5); subBus.connect(shaper(1.4, sfx));
    const musicOut = G(1, mix);
    const musicLP = F('lowpass', 20000, 0.8, musicOut);
    const musicPre = G(1, musicLP);
    const duck = G(1, musicPre);
    const drumLP = F('lowpass', 20000, 0.9, musicPre);
    const drumBus = G(0.9); drumBus.connect(shaper(1.25, drumLP));
    const bassLP = F('lowpass', 650, 0.7, duck);
    const bassBus = G(0.42); bassBus.connect(shaper(2.4, bassLP));
    const padLP = F('lowpass', 2200, 0.6, duck);
    const padBus = G(1.45, padLP);
    const arpBus = G(1.35, duck);
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
    function clap(t, v, o) { o = o || {}; mixIn('drum', clapB, t, v, { rev: o.rev == null ? 0.22 : o.rev, pan: o.pan || 0 }); }
    let hatN = 0;
    function hat(t, v, open) { mixIn('drum', open ? hatO : hatC, t, v, { pan: (hatN++ % 2) ? 0.28 : -0.28 }); }
    function crash(t, v, o) {
      o = o || {};
      mixIn('sfx', o.rate === 0.5 ? crashHalf : crashB, t, v, { rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 });
    }
    function revCymbal(tEnd, len, v, o) {
      o = o || {};
      const n = revCrashB[0].length, k = n - Math.round(len * SR);
      mixIn('sfx', [revCrashB[0].subarray(k), revCrashB[1].subarray(k)], tEnd - len, v,
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
      const n = Math.round(d * SR), out = new Float32Array(n), off = Math.floor(rr(0, 2.5) * SR), ch = noise[hatN++ % 2];
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
      const n = Math.round((decay + 0.1) * SR), out = new Float32Array(n), off = Math.floor(rr(0, 3) * SR), ch = noise[hatN++ % 2];
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
    function chatPop(t, v, pan) { tick(t, 1600, v, pan == null ? 0.55 : pan, 0.02, 'sine', { f1: 1200 }); }
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
    // vinyl scratch: wobbling playback rate + chopped gain
    const scratchShape = (function () {
      const rate = [[0, 0.4], [0.045, 2.3], [0.09, 0.3], [0.14, 1.7], [1, 1.7]];
      const gain = [[0, 0], [0.006, 1], [0.08, 1], [0.095, 0.15], [0.11, 0.8], [0.17, 0], [1, 0]];
      const lin = (tab, x) => { for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return tab[tab.length - 1][1]; };
      const v = varispeed(scratchB, 0.18, (tt) => lin(rate, tt));
      for (let i = 0; i < v.length; i++) v[i] *= lin(gain, i / SR);
      return v;
    })();
    function scratch(t, v) { mixIn('sfx', scratchShape, t, v, { pan: 0, rev: 0.1 }); }
    function heartbeat(t, v, gap) {
      [[0, 1], [gap || 0.17, 0.62]].forEach(([dt, a]) => {
        const tt0 = t + dt, d = new Float32Array(Math.round(0.5 * SR)), h = new Float32Array(Math.round(0.3 * SR)); let ph = 0;
        for (let i = 0; i < d.length; i++) { const tt = i / SR; ph += pw(82, 55, tt / 0.06) / SR; d[i] = Math.sin(TAU * ph) * env1(tt, 0.006, 0.3 / 4.6) * v * a; }
        for (let i = 0; i < h.length; i++) { const tt = i / SR; h[i] = Math.sin(TAU * 110 * tt) * env1(tt, 0.006, 0.16 / 4.6) * v * a * 0.22; }
        mixIn('sub', d, tt0, 1); mixIn('sfx', h, tt0, 1, {});
        noiseBurst(tt0, v * a * 0.18, 420, 120, 0.1, { rev: 0.05 });
      });
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

    // ---------------------------------------------------------- harmony
    const CH = {
      Dm: { pad: [57, 62, 65, 69], root: 26, arp: [74, 77, 81, 86, 89] },
      Dm9: { pad: [57, 62, 64, 65, 69], root: 26, arp: [74, 77, 81, 84, 88] },
      Bb: { pad: [58, 62, 65, 70], root: 34, arp: [70, 74, 77, 82, 86] },
      F: { pad: [57, 60, 65, 69], root: 29, arp: [72, 77, 81, 84, 89] },
      Asus: { pad: [57, 62, 64, 69], root: 33, arp: [69, 74, 76, 81, 86] },
      A: { pad: [57, 61, 64, 69], root: 33, arp: [73, 76, 81, 85, 88] },
      D: { pad: [57, 62, 66, 69], root: 26, arp: [74, 78, 81, 86, 90] },
      G: { pad: [59, 62, 66, 67], root: 31, arp: [71, 74, 79, 83, 86] },
      Bm: { pad: [59, 62, 66, 71], root: 35, arp: [71, 74, 78, 83, 86] }
    };
    const STY = {
      intro: { lv: 0.85, k: [0, 4, 8, 12], c: [], h: 1, oh: [], hv: 0.32, b: [[0, 1.85]], arp: null },
      groove: { lv: 0.92, k: [0, 4, 8, 12], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.36, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'pluck8' },
      lift: { lv: 1.0, k: [0, 4, 8, 12], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.4, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      data: { lv: 0.72, k: [0, 6, 10], c: [4, 12], h: 1, oh: [14], hv: 0.3, b: [[0, 1.0], [10, 0.6]], arp: 'pluck16' },
      half: { lv: 0.85, k: [0, 11], c: [8], h: 2, oh: [], hv: 0.32, b: [[0, 1.4], [11, 0.5]], arp: 'bellHalf' },
      warm: { lv: 0.6, k: [0, 10], c: [4, 12], cv: 0.35, h: 2, oh: [], hv: 0.22, b: [[0, 1.6]], arp: 'ep' },
      drop: { lv: 1.05, k: [0, 4, 8, 12, 14], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.46, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      filtered: { lv: 0.8, k: [0, 4], c: [], h: 1, oh: [2], hv: 0.3, b: [[0, 0.5]], arp: 'bell16' },
      drop4: { lv: 1.05, k: [0, 4, 8, 12, 14], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.44, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      callback: { lv: 0.95, k: [0, 2, 4, 6, 8, 10, 12, 14], c: [4, 12], h: 1, oh: [], hv: 0.4, b: [[0, 0.24], [4, 0.24], [8, 0.24], [12, 0.24]], arp: null }
    };
    function forSteps(t0, t1, fn) {
      for (let s = Math.ceil(t0 / 0.125 - 1e-6); s * 0.125 < t1 - 1e-6; s++) fn(s * 0.125, ((s % 16) + 16) % 16, s);
    }
    async function runSections(SECTIONS) {
      for (const S of SECTIONS) {
        await slice();
        const ch = CH[S.ch], st = STY[S.st];
        padLPset('setValueAtTime', S.lp, S.t0);
        if (S.lpTo) padLPset('exponentialRampToValueAtTime', S.lpTo[0], S.lpTo[1]);
        pad(S.t0, S.t1, ch.pad, S.pad, { a: S.a, r: S.r });
        if (!st) continue;
        const drop = S.st === 'drop' || S.st === 'drop4';
        forSteps(S.t0, S.t1, (t, i, s) => {
          const lv = st.lv || 1;
          if (st.k.indexOf(i) >= 0) kick(t, (i === 0 ? 1 : 0.92) * lv);
          if (st.c.indexOf(i) >= 0) clap(t, (st.cv || 0.62) * (drop ? 1.12 : 1) * lv);
          if (st.h === 1 || (st.h === 2 && i % 2 === 0)) {
            const accent = (i % 4 === 2) ? 1 : (i % 2 ? 0.55 : 0.75), open = st.oh.indexOf(i) >= 0;
            hat(t + (i % 2 ? 0.006 : 0), st.hv * accent * (open ? 0.75 : 1) * lv, open);
          }
          st.b.forEach(([bi, len]) => {
            if (bi !== i) return;
            const L = Math.min(len, S.t1 - t - 0.02);
            if (L <= 0.05) return;
            const glide = (S.glideIn && t === S.t0) ? 38 : (bi === 10 && last808 != null ? last808 + 12 : null);
            b808(t, ch.root, L, (S.st === 'warm' ? 0.42 : 0.6) * lv, glide != null ? { glideFrom: glide, glide: (S.glideIn && t === S.t0) ? 0.28 : 0.07 } : {});
          });
          const arp = st.arp;
          if (arp === 'bell16') {
            const pat = [0, 2, 1, 3, 2, 4, 3, 1];
            const m = ch.arp[pat[s % 8]] + (s % 16 >= 8 ? 12 : 0);
            bell(t, mtof(m), (S.st === 'drop' ? 0.075 : 0.06) * (i % 4 === 0 ? 1.2 : 0.85), (s % 2 ? 0.45 : -0.45), 0.42,
              { dest: 'arp', ratio: 3, index: 0.9, rev: 0.12, dly: 0.2 });
          } else if (arp === 'pluck8' && i % 2 === 0) {
            const pat = [0, 2, 1, 3, 0, 2, 4, 2];
            pluck(t, ch.arp[pat[(s / 2) % 8]] - 12, 0.05, (s % 4 ? 0.35 : -0.35), { cut: 3200, dec: 0.16 });
          } else if (arp === 'pluck16') {
            const pat = [0, 1, 2, 3, 4, 3, 2, 1];
            pluck(t, ch.arp[pat[s % 8]], 0.032 * (i % 4 === 0 ? 1.3 : 1), (s % 2 ? 0.5 : -0.5), { cut: 2600, dec: 0.1, type: 'square' });
          } else if (arp === 'bellHalf' && [0, 3, 6, 10, 12].indexOf(i) >= 0) {
            bell(t, mtof(ch.arp[[0, 3, 6, 10, 12].indexOf(i)]), 0.06, (i % 2 ? 0.4 : -0.4), 0.9, { dest: 'arp', ratio: 3, index: 1.1, dly: 0.25 });
          } else if (arp === 'ep' && [0, 3, 6, 10, 12].indexOf(i) >= 0) {
            ch.pad.forEach((m, j) => bell(t + j * 0.012, mtof(m + 12), 0.035, -0.4 + j * 0.27, 1.1, { dest: 'arp', ratio: 1, index: 1.3, rev: 0.25 }));
          }
        });
      }
    }
    musicLP.frequency.setValueAtTime(20000, 0);
    drumLP.frequency.setValueAtTime(20000, 0);
    padLPset('setValueAtTime', 2200, 0);

    // =========================================================== 60 s score (FINAL_SCRIPT.json arc)
    async function score60() {
      const SECTIONS = [
        { t0: 4.0, t1: 6.0, ch: 'Dm', st: 'ambient', pad: 0.045, lp: 900, a: 0.6, r: 0.25 },
        { t0: 6.0, t1: 8.0, ch: 'Dm', st: 'intro', pad: 0.05, lp: 1400, lpTo: [2400, 10.0], glideIn: true },
        { t0: 8.0, t1: 10.0, ch: 'Bb', st: 'intro', pad: 0.055, lp: 1800 },
        { t0: 10.0, t1: 11.5, ch: 'Asus', st: 'riser', pad: 0.05, lp: 1200, r: 0.02 },
        { t0: 12.25, t1: 13.5, ch: 'Dm', st: 'slowmo', pad: 0.05, lp: 700, a: 0.3, r: 0.1 },
        { t0: 13.5, t1: 14.0, ch: 'Dm9', st: 'chord', pad: 0.05, lp: 2600, a: 0.05, r: 0.1 },
        { t0: 14.0, t1: 16.0, ch: 'Dm', st: 'groove', pad: 0.055, lp: 2600 },
        { t0: 16.0, t1: 18.0, ch: 'F', st: 'groove', pad: 0.058, lp: 3000 },
        { t0: 18.0, t1: 20.0, ch: 'Bb', st: 'groove', pad: 0.06, lp: 3000, r: 0.02 },
        { t0: 22.0, t1: 23.0, ch: 'Dm', st: 'legend', pad: 0.05, lp: 900, a: 0.05, r: 0.03 },
        { t0: 23.0, t1: 26.0, ch: 'D', st: 'lift', pad: 0.06, lp: 3600, a: 0.02 },
        { t0: 26.0, t1: 28.0, ch: 'Bm', st: 'data', pad: 0.045, lp: 2000 },
        { t0: 28.0, t1: 30.0, ch: 'G', st: 'data', pad: 0.045, lp: 2000 },
        { t0: 30.0, t1: 32.0, ch: 'D', st: 'half', pad: 0.055, lp: 2400 },
        { t0: 32.0, t1: 34.0, ch: 'A', st: 'half', pad: 0.055, lp: 2400 },
        { t0: 34.0, t1: 36.0, ch: 'G', st: 'warm', pad: 0.05, lp: 1500 },
        { t0: 36.0, t1: 38.0, ch: 'A', st: 'warm', pad: 0.05, lp: 1700 },
        { t0: 38.0, t1: 40.0, ch: 'D', st: 'drop', pad: 0.06, lp: 5000 },
        { t0: 40.0, t1: 42.0, ch: 'Bm', st: 'drop', pad: 0.06, lp: 5000 },
        { t0: 42.0, t1: 44.0, ch: 'G', st: 'drop', pad: 0.06, lp: 5000 },
        { t0: 44.0, t1: 45.0, ch: 'A', st: 'drop', pad: 0.06, lp: 5000 },
        { t0: 45.0, t1: 45.5, ch: 'A', st: 'filtered', pad: 0.06, lp: 5000, r: 0.01 },
        { t0: 46.0, t1: 48.0, ch: 'D', st: 'drop4', pad: 0.06, lp: 4500 },
        { t0: 48.0, t1: 50.0, ch: 'G', st: 'drop4', pad: 0.06, lp: 4500 },
        { t0: 50.0, t1: 51.0, ch: 'Bm', st: 'callback', pad: 0.055, lp: 4000 },
        { t0: 51.0, t1: 52.0, ch: 'A', st: 'callback', pad: 0.055, lp: 4000 },
        { t0: 52.0, t1: 55.2, ch: 'D', st: 'end', pad: 0.055, lp: 2600, a: 0.02, r: 2.0 }
      ];
      await runSections(SECTIONS);
      // whole-music-bus filter sweeps & snaps
      const mlp = musicLP.frequency;
      mlp.setValueAtTime(20000, 12.25); mlp.exponentialRampToValueAtTime(800, 12.5); mlp.setValueAtTime(800, 13.4); mlp.exponentialRampToValueAtTime(20000, 13.5);
      mlp.setValueAtTime(20000, 18.5); mlp.exponentialRampToValueAtTime(320, 20.0); mlp.setValueAtTime(20000, 20.02);
      mlp.setValueAtTime(1100, 22.0); mlp.setValueAtTime(1100, 22.98); mlp.exponentialRampToValueAtTime(20000, 23.0);
      mlp.setValueAtTime(20000, 44.95); mlp.exponentialRampToValueAtTime(650, 45.05); mlp.exponentialRampToValueAtTime(380, 45.5); mlp.setValueAtTime(20000, 46.0);
      // intro: kick/drums through a lowpass opening 300 Hz -> 3 kHz
      drumLP.frequency.setValueAtTime(300, 6.0); drumLP.frequency.exponentialRampToValueAtTime(3000, 9.95); drumLP.frequency.setValueAtTime(20000, 10.0);

      // ================================================================ SFX / CUES
      // (1) 0-2 NFT era: bitcrushed chiptune, gated stabs + vinyl scratch per word; tape-stop at 2.0
      await slice();
      {
        const tape = varispeed(chipB, 2.75, (tt) => (tt < 2.0 ? 1 : Math.max(0.03, 1 - (tt - 2.0) / 0.6 * 0.97)));
        let flt = null;
        for (let i = 0; i < tape.length; i++) {
          const tt = i / SR;
          if ((i & 31) === 0) flt = jsBiquadState(flt, 'lp', tt < 2.0 ? 12000 : pw(12000, 700, (tt - 2.0) / 0.6), 0.707);
          tape[i] = flt.run(tape[i]) * 0.85 * (tt < 2.4 ? 1 : Math.max(0, 1 - (tt - 2.4) / 0.22));
        }
        mixIn('music', tape, 0, 1);
        CUES60.nftSlams.forEach((t, i) => {
          scratch(t + 0.01, 0.32);
          kick(t, 0.55, { duck: false, dec: 0.25 });
          noiseBurst(t, 0.12, 6000, 1200, 0.12, { type: 'highpass', rev: 0.05, pan: i % 2 ? 0.3 : -0.3 });
        });
        [2.3, 2.6].forEach((t) => { tick(t, 2000, 0.14, 0, 0.06, 'square', { a: 0.002 }); tick(t, 2000, 0.12, 0, 0.06, 'sine'); });
      }
      // (2/3) 3.0-4.0 reverse whoosh + pixel gather + hydraulic hiss; 4.0 THE STRIKE; 4.8 THE GOLD RING
      await slice();
      {
        whoosh(3.0, 0.62, 500, 6000, 0.42, -0.6, 0.2, { peak: 0.95, rev: 0.3 });
        for (let i = 0; i < 26; i++) {
          const u = i / 26, t = 3.0 + 0.6 * Math.sqrt(u) + rr(0, 0.02);
          tick(t, mtof(74 + Math.floor(u * 24) + [0, 3, 7][i % 3]), 0.05 + 0.04 * u, rr(-0.8, 0.8), 0.025, 'square');
        }
        whoosh(3.2, 0.8, 2500, 9000, 0.28, 0, 0, { type: 'highpass', q: 0.7, peak: 0.97, rev: 0.1 });
        whoosh(3.6, 0.4, 3000, 300, 0.35, 0, 0, { peak: 0.9, rev: 0.15 });
        subDrop(4.0, 70, 40, 0.08, 1.0, 1.5);
        kick(4.0, 0.9, { duck: false, dec: 0.6 });
        [3150, 4720, 6930, 9810, 12400].forEach((f, i) => tick(4.0, f, 0.06 / (1 + i * 0.3), (i % 2 ? 0.3 : -0.3), 0.09, 'sine', { rev: 0.2 }));
        noiseBurst(4.0, 0.4, 9000, 1500, 0.12, { type: 'highpass', rev: 0.25, huge: 0.15 });
        silverRing(4.0, 1.0, 0, { huge: 0.15 });
        sparkle(4.05, 7, 0.5, 0.05, 0, 1, 2);
        whoosh(4.1, 0.5, 6000, 2500, 0.16, 0, 0, { type: 'highpass', q: 0.7, peak: 0.15, rev: 0.1 });
        for (let i = 0; i < 16; i++) tick(4.1 + i * 0.025, 3300, 0.03, 0.15, 0.008, 'square');
        tick(4.52, 1760, 0.06, 0.15, 0.08, 'sine'); tick(4.6, 2349, 0.05, 0.15, 0.1, 'sine');
        thud(4.8, 98, 0.28, { slap: 0.3, rev: 0.2 });
        goldRing(4.8, 1.0, 0.25);
        for (let i = 0; i < 8; i++) tick(4.86 + i * 0.022, 3000, 0.022, 0.15, 0.008, 'square');
        whoosh(5.2, 0.4, 800, 2400, 0.08, 0.2, 0.8, { rev: 0.1 });
        { // HUGINN spins: 3 decelerating turns -> pulsing whoosh
          const n = Math.round(0.65 * SR), d = new Float32Array(n), off = Math.round(1.3 * SR); let flt = null;
          for (let i = 0; i < n; i++) {
            const u = i / n, th = 6 * Math.PI * (1 - (1 - u) * (1 - u));
            if ((i & 31) === 0) flt = jsBiquadState(flt, 'bp', pw(2600, 900, u), 1.6);
            d[i] = flt.run(noise[0][off + i]) * 0.2 * Math.pow(Math.abs(Math.sin(th)), 2) * (1 - 0.6 * u);
          }
          mixIn('sfx', d, 5.2, 1, { rev: 0.2 });
        }
        whoosh(5.82, 0.2, 1500, 9000, 0.45, -0.3, 0.3, { peak: 0.85, rev: 0.15 });
        drone(4.0, 5.9, [38], 'sine', 0.08, 0.5, 0.1);
        drone(4.0, 5.9, [50], 'tri', 0.024, 0.5, 0.1);
      }
      // (4) 6-10 intro groove sfx
      await slice();
      {
        whoosh(5.95, 0.4, 600, 4000, 0.32, -0.7, 0.4, { peak: 0.25, rev: 0.25 });
        subDrop(6.0, 80, 36, 0.3, 0.55, 0.9);
        crash(6.0, 0.25);
        tick(6.2, 2349, 0.035, -0.6, 0.06, 'sine', { rev: 0.2 }); tick(6.26, 3136, 0.03, -0.6, 0.06, 'sine', { rev: 0.2 });
        [6.6, 7.6, 8.75].forEach((t) => chatPop(t, 0.07, 0.6));
        [6.6, 8.9].forEach((t) => { // foil-crinkle grains panned with the specular sweeps
          play(crinkleSweep, t - 0.1, 0.24, { pan: [-0.8, 0.8, t - 0.1, t + 0.6], rev: 0.2 });
          sparkle(t, 5, 0.5, 0.025, 0, 2, 3);
        });
        horn(7.2, [38, 45, 50, 53, 57], 1.15, 0.05, { a: 0.3, cut: 1200, rev: 0.35, huge: 0.3, rel: 0.25 }); // Gjallarhorn
        subDrop(7.2, 60, 37, 0.2, 0.5, 1.2);
        crash(7.2, 0.18, { huge: 0.2 });
        whoosh(7.95, 0.35, 900, 5000, 0.3, 0.6, -0.6, { peak: 0.6 });
        thud(8.4, 62, 0.75, { slap: 0.7, rev: 0.25 }); // 'NO EMPTY PULLS' stamp
        crash(8.4, 0.12);
        whoosh(9.35, 0.32, 900, 5000, 0.22, -0.6, 0.6, { peak: 0.6 });
      }
      // (5) 10-11.5 crinkle intensifies + Shepard riser (drums out); 11.5-12 TOTAL SILENCE
      await slice();
      {
        tick(10.0, 2600, 0.05, 0.5, 0.02, 'sine', { rev: 0.1 });
        play(crinkleRise, 9.95, 0.32, { pan: 0.35, rev: 0.2, stop: 11.5 });
        play(shep1, 10.0, 0.5, { rev: 0.2, stop: 11.5 });
        whoosh(10.0, 1.5, 300, 7000, 0.3, -0.2, 0.2, { peak: 0.99, q: 1.4, rev: 0.25 });
        for (let i = 0; i < 6; i++) tick(10.2 + i * 0.2, 1200 + i * 150, 0.02, -0.7, 0.03, 'sine');
        drone(10.0, 11.47, [33], 'saw', 0.06, 1.2, 0.02, { lp: 300, q: 1 });
      }
      // (6) 12.0 DROP 1 — THE TEAR; (7) 12.25-13.5 slow-mo; 13.5 THE BIFROST CHORD
      await slice();
      {
        const t = 12.0;
        noiseBurst(t, 0.9, 2000, 9000, 0.35, { type: 'bandpass', q: 1.4, sweep: 0.25, rev: 0.25, huge: 0.2 });
        play(tearB, t, 0.9, { rev: 0.2, huge: 0.15 });
        subDrop(t, 110, 35, 0.5, 1.0, 1.6);
        kick(t, 1.0, { duck: false });
        crash(t, 0.7, { huge: 0.35 });
        noiseBurst(t, 0.4, 3000, 200, 0.4, { huge: 0.3 });
        thud(t, 55, 0.5, { slap: 0.5 });
        choir(12.25, 13.35, [50, 57, 62, 65, 69], 0.11, { a: 0.4, r: 0.25 });
        crash(12.25, 0.22, { rate: 0.5, huge: 0.6, rev: 0 });
        subDrop(12.3, 60, 30, 0.8, 0.45, 1.2);
        for (let i = 0; i < 12; i++) bell(12.6 + rr(0, 0.35), mtof(86 + Math.floor(rr(0, 14))) * 0.5, 0.03, rr(-0.8, 0.8), 0.9, { ratio: 2.76, index: 0.4, huge: 0.4, rev: 0 });
        revCymbal(13.5, 1.0, 0.5);
        whoosh(13.38, 0.24, 700, 7000, 0.4, -0.5, 0.5, { peak: 0.5 });
        [74, 77, 81, 84, 88].forEach((m, i) => bell(13.5 + i * 0.09, mtof(m), 0.17, -0.8 + i * 0.4, 1.2, { ratio: 3, index: 1.4, rev: 0.35, dly: 0.15, huge: 0.15 }));
        subDrop(13.5, 90, 38, 0.3, 0.5, 0.8);
        noiseBurst(13.5, 0.15, 9000, 3000, 0.6, { type: 'highpass', rev: 0.4 });
        sparkle(13.55, 14, 0.5, 0.035, 0, 2, 3);
      }
      // (8) 14-20 tier escalation (each louder and brighter)
      await slice();
      {
        [[13.4, 0.3], [14.9, 0.34], [16.4, 0.4]].forEach(([t, v]) => whoosh(t, 0.6, 700, 3800, v, -0.75, 0.05, { peak: 0.85, rev: 0.2 }));
        // SILVER 14.0: D5 ping + silver ring
        bell(14.0, mtof(74), 0.2, 0, 1.2, { ratio: 3, index: 1.2, rev: 0.3, dly: 0.15 });
        silverRing(14.0, 0.75, -0.1);
        sparkle(14.02, 5, 0.3, 0.03, 0, 2, 3);
        whoosh(14.0, 0.25, 4000, 900, 0.18, -0.9, -0.2, { peak: 0.2 });
        for (let i = 0; i < 12; i++) tick(14.2 + i * 0.028, 2900, 0.018, 0.4, 0.008, 'square');
        chatPop(14.6, 0.07); whoosh(14.6, 0.2, 2500, 900, 0.07, 0, 0.2, { peak: 0.3 });
        // RARE SILVER 15.5: F5 + sparkle layer, +2 dB (rim leak 0.25 s before)
        whoosh(15.2, 0.32, 3000, 9000, 0.1, 0, 0, { type: 'highpass', peak: 0.95, rev: 0.4 });
        const r2 = Math.pow(10, 2 / 20);
        bell(15.5, mtof(77), 0.2 * r2, 0, 1.3, { ratio: 3, index: 1.3, rev: 0.32, dly: 0.15 });
        silverRing(15.5, 0.75 * r2, 0.1);
        sparkle(15.5, 16, 0.55, 0.045 * r2, 0, 2, 4);
        subDrop(15.5, 90, 40, 0.2, 0.35, 0.6);
        for (let i = 0; i < 12; i++) tick(15.7 + i * 0.028, 3100, 0.018, 0.4, 0.008, 'square');
        chatPop(16.1, 0.07);
        // GOLD 17.0: A5 + gold ring + Gjallarhorn stab + 808 boom, +4 dB
        whoosh(16.7, 0.32, 2000, 7000, 0.14, 0, 0, { peak: 0.95, rev: 0.4 });
        const r4 = Math.pow(10, 4 / 20);
        bell(17.0, mtof(81), 0.2 * r4, 0, 1.5, { ratio: 3, index: 1.4, rev: 0.35, dly: 0.18 });
        goldRing(17.0, 0.8 * r4, 0);
        horn(17.0, [41, 48, 53, 57, 60, 65], 0.5, 0.055, { a: 0.06, cut: 1700, rev: 0.35, huge: 0.3, rel: 0.2, scoop: 30 });
        subDrop(17.0, 75, 36, 0.4, 0.9, 1.6);
        crash(17.0, 0.4, { huge: 0.25 });
        sparkle(17.02, 18, 0.7, 0.04 * r4, 0, 2, 3);
        for (let i = 0; i < 14; i++) tick(17.2 + i * 0.028, 2500, 0.02, 0.4, 0.008, 'square');
        bell(17.65, mtof(93), 0.04, -0.3, 0.6, { ratio: 3.5, index: 0.6 });
        chatPop(17.6, 0.08);
        [14.85, 16.35, 17.85].forEach((t, i) => glassTick(t, mtof(86 + i * 2), 0.05, 0.0, { dec: 0.3 }));
        whoosh(18.5, 1.2, 500, 2200, 0.16, -0.75, 0.0, { peak: 0.75, rev: 0.3 }); // 4th coin rides slowly
      }
      // (9) 20.0 hard cut: heartbeat under a Shepard riser; 21.93-22.0 silence
      await slice();
      {
        CUES60.heartbeats.forEach((t, i) => {
          heartbeat(t, 0.8 + 0.07 * i, [0.17, 0.16, 0.14, 0.1][i]);
          whoosh(t, 0.5, 4000, 9000, 0.03 + 0.012 * i, 0, 0, { type: 'highpass', peak: 0.15, rev: 0.4 });
        });
        play(shep2, 20.0, 0.42, { rev: 0.2, stop: 21.93 });
        drone(20.0, 21.9, [33, 45], 'saw', 0.07, 1.5, 0.02, { lp: 200, lp1: 900, q: 1.5, det: [0, 6] });
        revCymbal(21.93, 0.9, 0.45, { cut: 21.93 });
        whoosh(20.9, 1.03, 300, 6000, 0.18, 0, 0, { peak: 0.99, q: 1.5, rev: 0.1 });
      }
      // (10) 22.0 DROP 2 — LEGENDARY; 23.0 D MAJOR lift
      await slice();
      {
        const t = 22.0;
        subDrop(t, 62, 40, 0.15, 1.0, 2.4);
        impact(t, 1.0, { huge: 0.4, crashV: 0.7 });
        horn(t, [38, 45, 50, 53, 57, 62], 0.95, 0.065, { a: 0.07, cut: 1600, rev: 0.4, huge: 0.5, rel: 0.12, scoop: 35 });
        choir(t, 23.0, [50, 57, 62, 65, 69, 74], 0.12, { a: 0.12, r: 0.1, huge: 0.6 });
        whoosh(22.2, 0.6, 1200, 8000, 0.14, -0.9, 0.9, { peak: 0.5, rev: 0.35, huge: 0.3 });
        tick(22.5, 2349, 0.05, 0, 0.6, 'sine', { rev: 0.5, f1: 4699 });
        whoosh(22.82, 0.2, 800, 8000, 0.42, 0.4, -0.4, { peak: 0.85 });
        impact(23.0, 0.65, { huge: 0.25, crashV: 0.5, subDec: 1.0 });
        horn(23.0, [38, 45, 50, 54, 57, 62, 66], 0.55, 0.06, { a: 0.03, cut: 2000, rev: 0.35, huge: 0.3, rel: 0.25, scoop: 20 });
        choir(23.0, 24.6, [50, 57, 62, 66, 69, 74], 0.075, { a: 0.05, r: 0.8, huge: 0.45 });
        goldRing(23.0, 0.95, 0, { decay: 4.0, huge: 0.2 });
        sparkle(23.0, 18, 0.8, 0.04, 0, 2, 4);
        thud(23.2, 73, 0.45, { slap: 0.4 }); // '1 OF 25 · GOLD'
        play(engraveB, 23.6, 0.22, { pan: [-0.4, 0.4, 23.6, 24.2], rev: 0.25 }); // engraving crackle
        bell(24.22, mtof(98), 0.045, 0.4, 0.5, { ratio: 3.5, index: 0.5 });
        for (let i = 0; i < 12; i++) tick(24.05 + i * 0.026, 2700, 0.018, -0.4, 0.008, 'square');
        bell(24.4, mtof(86), 0.09, -0.4, 1.0, { ratio: 3, index: 1.2, rev: 0.35 }); // AU odometer ding
        let tt = 23.1; // chat-pop storm, rate tied to the hype meter
        while (tt < 25.9) { chatPop(tt, 0.045 + 0.02 * rnd(), 0.35 + 0.4 * rnd()); tt += 0.13 - 0.07 * Math.min(1, (tt - 23.1) / 1.5) + rr(-0.02, 0.02); }
        whoosh(24.7, 1.0, 3000, 9000, 0.05, -0.5, 0.5, { type: 'highpass', peak: 0.5, rev: 0.4 });
      }
      // (11) 26-30 data groove: hash blips, mint ticks, NFC two-tone, verified chime
      await slice();
      {
        whoosh(25.85, 0.26, 900, 6000, 0.38, 0.8, -0.8, { peak: 0.6 });
        for (let i = 0; i < 6; i++) tick(26.02 + i * 0.05, 3000 + i * 300, 0.03, 0.5, 0.02, 'sine', { rev: 0.15 });
        for (let i = 0; i < 12; i++) tick(26.675 + i * 0.025, 2000, 0.045, 0.45, 0.02, 'square', { a: 0.001 });
        tick(27.25, 1760, 0.05, 0.45, 0.08, 'sine'); tick(27.31, 2637, 0.045, 0.45, 0.1, 'sine');
        [[26.3, 86], [26.8, 88], [27.0, 90], [27.2, 93]].forEach(([t, m], i) => glassTick(t, mtof(m), 0.09, -0.3 + i * 0.15, { dly: 0.15 }));
        [26.8, 27.0, 27.2].forEach((t) => whoosh(t - 0.35, 0.4, 1500, 5000, 0.06, -0.5, 0.2, { peak: 0.85 }));
        glassTick(27.45, mtof(93), 0.06, 0.45, { dec: 0.3 });
        thud(28.0, 180, 0.22, { slap: 0.3, dec: 0.15 });
        whoosh(28.05, 0.5, 600, 3500, 0.22, 0.9, 0.1, { peak: 0.8 });
        tick(28.6, 1760, 0.16, 0.1, 0.09, 'sine', { a: 0.004, rev: 0.25 });
        tick(28.71, 2349, 0.16, 0.1, 0.12, 'sine', { a: 0.004, rev: 0.25 });
        [0, 0.12, 0.24].forEach((d) => whoosh(28.6 + d, 0.3, 4000, 7000, 0.025, 0, 0, { type: 'highpass', peak: 0.3, rev: 0.3 }));
        [86, 90, 93, 98].forEach((m, i) => bell(28.86 + i * 0.05, mtof(m), 0.07, -0.2 + i * 0.15, 1.0, { ratio: 3, index: 1.0, rev: 0.4, dly: 0.15 }));
      }
      // (12) 30-34 half-time: four stamp thuds a step higher each, vault-door clunk at 32.9
      await slice();
      {
        whoosh(29.6, 0.42, 5000, 600, 0.2, 0, 0, { peak: 0.95, rev: 0.3 });
        whoosh(30.0, 0.6, 2000, 8000, 0.06, -0.8, 0.8, { type: 'highpass', peak: 0.5, rev: 0.4 });
        [30.35, 30.5, 30.65, 30.8].forEach((t, i) => tick(t, mtof(81 + [0, 2, 4, 7][i]), 0.035, [-0.6, 0.6, -0.3, 0.3][i], 0.08, 'sine', { rev: 0.3 }));
        [[31.0, 55, -0.6, 1.0], [31.5, 61.7, 0.6, 0.8], [32.0, 69.3, -0.3, 0.85], [32.5, 73.4, 0.3, 0.9]].forEach(([t, f, p, v]) => {
          thud(t, f, 0.85 * v, { slap: 0.8, rev: 0.25, pan: p * 0.4 });
          bell(t, f * 8, 0.05, p * 0.4, 0.5, { ratio: 1.5, index: 0.6, rev: 0.2 });
          whoosh(t + 0.05, 0.35, 2500, 700, 0.1, 0, p, { peak: 0.35 });
        });
        sparkle(31.02, 10, 0.4, 0.04, -0.4, 2, 3);
        for (let i = 0; i < 7; i++) tick(32.62 + i * 0.04, 1900 + i * 60, 0.05, 0.3, 0.015, 'square', { rev: 0.1 });
        const t = 32.9; // vault-door clunk + lock
        subDrop(t, 70, 42, 0.12, 0.85, 1.2);
        [180, 287, 419, 610, 873, 1240].forEach((f, i) => tick(t, f, 0.07 / (1 + i * 0.4), 0.2, 0.7 - i * 0.07, 'sine', { rev: 0.3, huge: 0.35 }));
        noiseBurst(t, 0.45, 1400, 200, 0.16, { rev: 0.3, huge: 0.4 });
        play(clickB, t, 0.6, { pan: null }); play(clickB, t + 0.045, 0.4, { pan: null });
        kick(t, 0.7, { depth: 0.4 });
        drone(32.95, 33.8, [33], 'saw', 0.07, 0.4, 0.3, { lp: 260, q: 2 }); // SECURED IN LIECHTENSTEIN
        whoosh(33.0, 1.0, 4000, 9000, 0.05, -0.6, 0.6, { type: 'highpass', peak: 0.5, rev: 0.5, huge: 0.3 });
        sparkle(33.05, 8, 0.8, 0.03, 0, 2, 4);
      }
      // (13) 34-38 warm: offer tink, swipe, capsule snap, seal slap, flaps, tape zip, label printer, door chime
      await slice();
      {
        whoosh(33.85, 0.26, 6000, 700, 0.32, 0, 0, { peak: 0.5 });
        [[3520, 0.1], [8180, 0.035]].forEach(([f, v]) => tick(34.1, f, v, 0.2, 0.28, 'sine', { rev: 0.35, dly: 0.1 }));
        whoosh(34.4, 0.3, 900, 4000, 0.2, 0.0, 0.9, { peak: 0.5 });
        noiseBurst(34.6, 0.3, 2800, 2200, 0.025, { type: 'bandpass', q: 1.5, rev: 0.15 });
        tick(34.6, 1150, 0.08, 0, 0.03, 'triangle'); play(clickB, 34.6, 0.4, { pan: null });
        thud(35.0, 150, 0.32, { slap: 0.9, dec: 0.12, rev: 0.12 });
        bell(35.02, mtof(93), 0.03, 0.1, 0.4, { ratio: 3.5, index: 0.5 });
        thud(35.15, 90, 0.3, { slap: 0.4, dec: 0.2 });
        [35.3, 35.4, 35.5, 35.6].forEach((t, i) => noiseBurst(t, 0.22, 600, 150, 0.08, { rev: 0.1, pan: i % 2 ? 0.3 : -0.3 }));
        play(zipB, 35.62, 0.3, { pan: [-0.5, 0.5, 35.62, 35.95], rev: 0.15 });
        play(printerB, 35.8, 0.17, { pan: 0.15, rev: 0.1 });
        whoosh(36.6, 0.6, 800, 2500, 0.07, -0.6, 0.6, { peak: 0.6, rev: 0.3 });
        bell(37.2, mtof(78), 0.11, -0.1, 1.4, { ratio: 1.0, index: 0.8, rev: 0.4, a: 0.004 });
        bell(37.5, mtof(74), 0.11, 0.1, 1.6, { ratio: 1.0, index: 0.8, rev: 0.4, a: 0.004 });
        thud(37.6, 120, 0.15, { slap: 0.3, dec: 0.12 });
        tick(37.8, 1760, 0.05, 0.1, 0.05, 'sine'); tick(37.86, 2349, 0.05, 0.1, 0.07, 'sine');
      }
      // (14) 38.0 DROP 3 — brightest: horn countermelody, bids, escrow, release, royalties, confirmations
      await slice();
      {
        whoosh(37.78, 0.24, 700, 8000, 0.4, -0.6, 0.6, { peak: 0.85 });
        impact(38.0, 0.7, { crashV: 0.6, subDec: 1.2 });
        crash(42.0, 0.3);
        const MEL = [
          [38.0, 0.5, 69], [38.5, 0.75, 74], [39.25, 0.25, 73], [39.5, 0.25, 74], [39.75, 0.25, 76],
          [40.0, 0.75, 78], [40.75, 0.25, 76], [41.0, 0.5, 74], [41.5, 0.5, 71],
          [42.0, 0.5, 74], [42.5, 0.25, 76], [42.75, 0.25, 78], [43.0, 0.75, 79], [43.75, 0.25, 78],
          [44.0, 0.5, 76], [44.5, 0.5, 73]
        ];
        MEL.forEach(([t, d, m]) => horn(t, [m - 12, m], d * 0.92, 0.042, { a: 0.04, cut: 2400, rev: 0.25, rel: 0.08, scoop: 25 }));
        tick(38.2, 2349, 0.05, 0.5, 0.06, 'sine'); tick(38.27, 2960, 0.05, 0.5, 0.08, 'sine');
        const LON = [10.75, 139.7, -46.6, -79.4, 13.4, 127.0, 18.1]; // Oslo, Tokyo, Sao Paulo, Toronto, Berlin, Seoul, Stockholm
        const PENT = [74, 76, 78, 81, 83, 86, 88];
        CUES60.bids.forEach((t, i) => {
          const pan = clamp(LON[i] / 150, -0.9, 0.9);
          glassTick(t, mtof(PENT[i] + 12), 0.1, pan, { dec: 0.35, dly: 0.1 });
          whoosh(t, 0.25, 1500, 4000, 0.04, pan, 0.4, { peak: 0.6, rev: 0.2 });
        });
        play(clickB, 41.0, 0.6, { pan: null }); play(clickB, 41.055, 0.5, { pan: null }); // escrow latch
        tick(41.0, 2200, 0.08, 0.3, 0.08, 'triangle'); tick(41.055, 1650, 0.1, 0.3, 0.12, 'triangle', { rev: 0.2 });
        thud(41.055, 110, 0.35, { slap: 0.4, dec: 0.15 });
        [41.25, 41.6, 42.1].forEach((t, i) => tick(t, mtof(81 + i * 2), 0.04, 0.3, 0.05, 'sine'));
        bell(42.6, 880, 0.12, 0.3, 0.8, { ratio: 3, index: 0.6, rev: 0.3 }); bell(42.72, 1318.5, 0.12, 0.3, 1.0, { ratio: 3, index: 0.6, rev: 0.3 });
        sparkle(43.0, 12, 0.48, 0.07, 0.4, 3, 1.5, { desc: true });
        whoosh(43.4, 0.5, 900, 4000, 0.12, -0.7, 0.7, { peak: 0.6 });
        for (let i = 0; i < 8; i++) glassTick(43.62 + i * 0.19, mtof([86, 90, 93, 88, 91, 95, 93, 98][i]), 0.06, (i % 2 ? 0.6 : -0.6), { dec: 0.3, dly: 0.08 });
      }
      // (15) 45.0 whip to centre, filtered half-bar, silence 45.5-46.0
      whoosh(44.86, 0.22, 6000, 900, 0.3, 0.5, 0, { peak: 0.5 });
      // (16) 46.0 DROP 4 on '80%': 808 + crash + cascade of 8 silver rings; meter sweep -> confirm chord; INSTANT
      await slice();
      {
        const t = 46.0;
        impact(t, 1.0, { crashV: 0.75, huge: 0.3 });
        subDrop(t, 75, 37, 0.35, 0.6, 1.4);
        for (let i = 0; i < 8; i++) silverRing(t + 0.02 + i * 0.065, 0.42 * (1 - i * 0.05), (i % 2 ? 1 : -1) * (0.2 + 0.09 * i), { rev: 0.25, dly: 0.03 });
        sweepTone(t, 46.5, 440, 1174.7, 0.07, { rev: 0.2 });
        [86, 90, 93, 98].forEach((m, i) => bell(46.5, mtof(m), 0.08, -0.45 + i * 0.3, 1.2, { ratio: 3, index: 1.0, rev: 0.35, dly: 0.12 }));
        thud(46.6, 73.4, 0.85, { slap: 0.9, rev: 0.25 });
        tick(47.0, 1760, 0.06, 0.2, 0.06, 'sine'); tick(47.07, 2349, 0.06, 0.2, 0.09, 'sine');
        whoosh(47.15, 0.35, 3000, 900, 0.08, 0, 0.4, { peak: 0.4 });
        CUES60.buybackTags.forEach((tt, i) => glassTick(tt, mtof([86, 88, 90, 93][i]), 0.08, -0.6 + i * 0.4, { dec: 0.35 }));
      }
      // (17) 50-52 double-time callback: tear / gold ring / offer tink / bid tick
      await slice();
      {
        noiseBurst(50.0, 0.65, 2000, 9000, 0.3, { type: 'bandpass', q: 1.4, sweep: 0.25, rev: 0.25 });
        play(tearB, 50.0, 0.6, { rev: 0.2 });
        impact(50.0, 0.6, { crashV: 0.4, subDec: 0.5 });
        goldRing(50.5, 0.75, -0.3, { decay: 1.6 }); impact(50.5, 0.45, { crash: false, subDec: 0.4 });
        [[3520, 0.12], [8180, 0.04]].forEach(([f, v]) => tick(51.0, f, v, 0.3, 0.28, 'sine', { rev: 0.35, dly: 0.1 }));
        impact(51.0, 0.45, { crash: false, subDec: 0.4 });
        glassTick(51.5, mtof(88), 0.14, 0.5, { dec: 0.35 }); impact(51.5, 0.5, { crash: false, subDec: 0.4 });
        [50.42, 50.92, 51.42].forEach((t, i) => whoosh(t, 0.12, 900, 7000, 0.22, (i % 2 ? 0.6 : -0.6), (i % 2 ? -0.6 : 0.6), { peak: 0.8 }));
        for (let i = 0; i < 8; i++) clap(51.0 + i * 0.0625, 0.18 + 0.05 * i, { rev: 0.1 });
        whoosh(51.0, 1.0, 400, 9000, 0.22, 0, 0, { peak: 0.99, q: 1.3 });
        revCymbal(52.0, 0.9, 0.4);
      }
      // (18) 52.0 final impact + THE BIFROST CHORD in D major panned L -> R + silver ring on the mint dot
      await slice();
      {
        const t = 52.0;
        impact(t, 1.05, { crashV: 0.8, huge: 0.0, subDec: 2.4 });
        b808(t, 26, 2.6, 0.55, { glideFrom: 33, glide: 0.12 });
        horn(t, [38, 45, 50, 54, 57, 62], 1.1, 0.06, { a: 0.05, cut: 1800, rev: 0.35, rel: 0.4, scoop: 20 });
        choir(t, 54.0, [50, 57, 62, 66, 69], 0.06, { a: 0.1, r: 1.2, huge: 0, rev: 0.3 });
        sparkle(52.02, 16, 0.8, 0.035, 0, 2, 4);
        [74, 78, 81, 86].forEach((m, i) => bell(52.4 + i * 0.1, mtof(m), 0.17, -0.85 + i * 0.57, 1.6, { ratio: 3, index: 1.4, rev: 0.4, dly: 0.12 }));
        tick(52.8, 600, 0.07, -0.7, 0.05, 'sine', { f1: 1300 }); // violet dot pop
        silverRing(52.92, 0.9, 0.7, { rev: 0.35 });
        bell(58.5, 4186, 0.012, 0.2, 0.5, { ratio: 2.76, index: 0.3, rev: 0, dly: 0 }); // glint (dry, gone by 59.1)
      }
    }

    // =========================================================== v2: 30 s "app-first" cut
    async function score30() {
      const C = CUES30;
      await runSections([
        { t0: 1.0, t1: 2.0, ch: 'Dm', st: 'ambient', pad: 0.04, lp: 900, a: 0.4, r: 0.1 },
        { t0: 2.0, t1: 4.0, ch: 'Dm', st: 'intro', pad: 0.05, lp: 1200, lpTo: [2600, 3.95], glideIn: true },
        { t0: 4.0, t1: 4.6, ch: 'Asus', st: 'riser', pad: 0.05, lp: 1200, a: 0.3, r: 0.02 },
        { t0: 4.6, t1: 5.4, ch: 'Dm', st: 'slowmo', pad: 0.05, lp: 700, a: 0.25, r: 0.1 },
        { t0: 5.4, t1: 6.0, ch: 'Dm9', st: 'chord', pad: 0.05, lp: 2600, a: 0.05, r: 0.1 },
        { t0: 6.0, t1: 8.0, ch: 'Dm', st: 'groove', pad: 0.055, lp: 2600 },
        { t0: 8.0, t1: 10.0, ch: 'F', st: 'groove', pad: 0.06, lp: 3000, r: 0.02 },
        { t0: 11.5, t1: 12.3, ch: 'Dm', st: 'legend', pad: 0.05, lp: 900, a: 0.05, r: 0.03 },
        { t0: 12.3, t1: 14.0, ch: 'D', st: 'lift', pad: 0.06, lp: 3600, a: 0.02 },
        { t0: 14.0, t1: 16.0, ch: 'D', st: 'half', pad: 0.055, lp: 2400 },
        { t0: 16.0, t1: 18.0, ch: 'Bm', st: 'half', pad: 0.055, lp: 2400 },
        { t0: 18.0, t1: 20.0, ch: 'G', st: 'half', pad: 0.055, lp: 2600 },
        { t0: 20.0, t1: 22.0, ch: 'A', st: 'half', pad: 0.055, lp: 2600 },
        { t0: 22.0, t1: 24.0, ch: 'Bm', st: 'data', pad: 0.045, lp: 2200 },
        { t0: 24.0, t1: 24.5, ch: 'A', st: 'callback', pad: 0.05, lp: 3000, r: 0.02 },
        { t0: 24.5, t1: 27.0, ch: 'D', st: 'end', pad: 0.055, lp: 2600, a: 0.02, r: 1.8 }
      ]);
      const mlp = musicLP.frequency;
      mlp.setValueAtTime(20000, 4.75); mlp.exponentialRampToValueAtTime(800, 4.95); mlp.setValueAtTime(800, 5.3); mlp.exponentialRampToValueAtTime(20000, 5.4);
      mlp.setValueAtTime(20000, 9.2); mlp.exponentialRampToValueAtTime(320, 10.0); mlp.setValueAtTime(20000, 10.02);
      mlp.setValueAtTime(1100, 11.5); mlp.setValueAtTime(1100, 12.28); mlp.exponentialRampToValueAtTime(20000, 12.3);
      drumLP.frequency.setValueAtTime(300, 2.0); drumLP.frequency.exponentialRampToValueAtTime(3000, 3.95); drumLP.frequency.setValueAtTime(20000, 4.0);
      const uiTap = (t, pan) => { tick(t, 2600, 0.06, pan || 0, 0.018, 'sine', { rev: 0.1 }); play(clickB, t, 0.25, { pan: pan || 0 }); };
      const sheet = (t) => whoosh(t, 0.28, 700, 3200, 0.14, 0, 0, { peak: 0.55, rev: 0.15 });
      const toast = (t, m) => { glassTick(t, mtof(m), 0.08, 0.2, { dec: 0.35 }); glassTick(t + 0.07, mtof(m + 5), 0.07, 0.2, { dec: 0.45 }); };

      // 01 HOOK 0.0-2.2: bitcrushed stab on '0.00 g'; 1.0 STRIKE + THE SILVER RING; 1.7 spin/whip into the phone
      await slice();
      {
        const tape = varispeed(chipB, 1.0, (tt) => (tt < 0.62 ? 1 : Math.max(0.03, 1 - (tt - 0.62) / 0.3 * 0.97)));
        let flt = null;
        for (let i = 0; i < tape.length; i++) {
          const tt = i / SR;
          if ((i & 31) === 0) flt = jsBiquadState(flt, 'lp', tt < 0.62 ? 12000 : pw(12000, 700, (tt - 0.62) / 0.3), 0.707);
          tape[i] = flt.run(tape[i]) * 0.85 * (tt < 0.8 ? 1 : Math.max(0, 1 - (tt - 0.8) / 0.12));
        }
        mixIn('music', tape, 0, 1);
        [0.0, 0.5].forEach((t, i) => {
          scratch(t + 0.01, 0.32);
          kick(t, 0.55, { duck: false, dec: 0.25 });
          noiseBurst(t, 0.12, 6000, 1200, 0.12, { type: 'highpass', rev: 0.05, pan: i % 2 ? 0.3 : -0.3 });
        });
        tick(0.3, 2000, 0.12, 0, 0.06, 'square', { a: 0.002 }); // scale beep, '0.00 g'
        whoosh(0.7, 0.32, 500, 6000, 0.38, -0.5, 0.2, { peak: 0.95, rev: 0.3 }); // pixels suck away
        for (let i = 0; i < 14; i++) { const u = i / 14; tick(0.7 + 0.28 * Math.sqrt(u), mtof(74 + Math.floor(u * 24) + [0, 3, 7][i % 3]), 0.05 + 0.04 * u, rr(-0.8, 0.8), 0.025, 'square'); }
        const t = C.strike;
        subDrop(t, 70, 40, 0.08, 1.0, 1.4);
        kick(t, 0.9, { duck: false, dec: 0.6 });
        [3150, 4720, 6930, 9810, 12400].forEach((f, i) => tick(t, f, 0.06 / (1 + i * 0.3), (i % 2 ? 0.3 : -0.3), 0.09, 'sine', { rev: 0.2 }));
        noiseBurst(t, 0.4, 9000, 1500, 0.12, { type: 'highpass', rev: 0.25, huge: 0.15 });
        crash(t, 0.3, { huge: 0.2 });
        silverRing(t, 1.0, 0, { huge: 0.15 });
        sparkle(t + 0.05, 7, 0.5, 0.05, 0, 1, 2);
        for (let i = 0; i < 16; i++) tick(1.1 + i * 0.022, 3300, 0.03, 0.15, 0.008, 'square'); // LCD 0.00 -> 31.10 g
        tick(1.47, 1760, 0.06, 0.15, 0.08, 'sine'); tick(1.54, 2349, 0.05, 0.15, 0.1, 'sine');
        whoosh(1.7, 0.32, 900, 3000, 0.16, 0.0, 0.5, { peak: 0.7, rev: 0.15 }); // spin
        whoosh(1.86, 0.18, 1500, 9000, 0.42, -0.3, 0.3, { peak: 0.85, rev: 0.15 }); // whip into the phone
        drone(1.0, 1.95, [38], 'sine', 0.07, 0.3, 0.05);
      }
      // 02 APP · PACK 2.0-4.2: groove opens, Gjallarhorn on EVERY PACK HITS, UI tap on 'Rip pack'
      await slice();
      {
        whoosh(1.98, 0.32, 600, 3000, 0.22, 0.5, 0, { peak: 0.3, rev: 0.2 }); // phone settles (spring)
        subDrop(2.0, 80, 36, 0.3, 0.55, 0.9);
        crash(2.0, 0.22);
        play(crinkleSweep, 2.2, 0.2, { pan: [-0.8, 0.8, 2.2, 2.9], rev: 0.2 }); // foil specular sweep
        horn(C.everyPackHits, [38, 45, 50, 53, 57], 0.95, 0.05, { a: 0.1, cut: 1300, rev: 0.35, huge: 0.3, rel: 0.25 });
        subDrop(C.everyPackHits, 60, 37, 0.2, 0.5, 1.0);
        thud(C.everyPackHits, 58, 0.38, { slap: 0.55, rev: 0.2 }); // super slam under the blast
        crash(C.everyPackHits, 0.16, { huge: 0.2 });
        thud(C.silverOrGold, 62, 0.45, { slap: 0.5, rev: 0.2 });
        sparkle(C.silverOrGold, 6, 0.4, 0.03, 0.3, 2, 3);
        uiTap(C.tapRip, 0); tick(C.tapRip + 0.02, 180, 0.15, 0, 0.06, 'sine'); // press-in + haptic
      }
      // 03 RIP 4.0-6.2: crinkle + riser, 4.6 DROP 1 tear, slow-mo choir, reverse cymbal into the 5.4 whip
      await slice();
      {
        play(crinkleRise, 3.98, 0.32, { pan: 0.35, rev: 0.2, stop: 4.6 });
        play(shep1, 4.0, 0.42, { rev: 0.2, stop: 4.6 });
        whoosh(4.0, 0.6, 300, 7000, 0.3, -0.2, 0.2, { peak: 0.99, q: 1.4, rev: 0.25 });
        drone(4.0, 4.58, [33], 'saw', 0.06, 0.4, 0.02, { lp: 300, q: 1 });
        const t = C.tear;
        noiseBurst(t, 0.9, 2000, 9000, 0.35, { type: 'bandpass', q: 1.4, sweep: 0.25, rev: 0.25, huge: 0.2 });
        play(tearB, t, 0.9, { rev: 0.2, huge: 0.15 });
        subDrop(t, 110, 35, 0.5, 1.0, 1.5);
        kick(t, 1.0, { duck: false });
        crash(t, 0.7, { huge: 0.35 });
        noiseBurst(t, 0.4, 3000, 200, 0.4, { huge: 0.3 });
        thud(t, 55, 0.5, { slap: 0.5 }); // 'RIP IT.' slam
        choir(4.75, 5.3, [50, 57, 62, 65, 69], 0.11, { a: 0.2, r: 0.2 });
        crash(4.75, 0.2, { rate: 0.5, huge: 0.6, rev: 0 });
        for (let i = 0; i < 8; i++) bell(4.8 + rr(0, 0.4), mtof(86 + Math.floor(rr(0, 14))) * 0.5, 0.03, rr(-0.8, 0.8), 0.8, { ratio: 2.76, index: 0.4, huge: 0.4, rev: 0 });
        revCymbal(C.slowOut, 0.7, 0.45);
        whoosh(5.3, 0.22, 700, 7000, 0.4, -0.5, 0.5, { peak: 0.5 });
        subDrop(C.slowOut, 90, 38, 0.3, 0.45, 0.7);
        [74, 77, 81].forEach((m, i) => bell(5.4 + i * 0.07, mtof(m), 0.1, -0.5 + i * 0.5, 0.9, { ratio: 3, index: 1.2, rev: 0.3, dly: 0.12 }));
        [5.55, 5.65, 5.75, 5.85].forEach((tt, i) => thud(tt, 140 + i * 10, 0.12, { slap: 0.25, dec: 0.1, pan: -0.3 + i * 0.2 })); // 4 coins drop in
      }
      // 04 REVEAL 6.0-10.2: SILVER / RARE / GOLD, each louder and brighter
      await slice();
      {
        const [p1, p2, p3] = [6.0, 7.3, 8.6];
        whoosh(5.7, 0.3, 700, 3800, 0.22, -0.5, 0, { peak: 0.85, rev: 0.2 });
        bell(p1, mtof(74), 0.2, 0, 1.1, { ratio: 3, index: 1.2, rev: 0.3, dly: 0.15 });
        silverRing(p1, 0.75, -0.1);
        sparkle(p1 + 0.02, 5, 0.3, 0.03, 0, 2, 3);
        whoosh(p1, 0.22, 4000, 900, 0.16, 0.9, 0.3, { peak: 0.2 }); // super slam
        const r2 = Math.pow(10, 2 / 20), r4 = Math.pow(10, 4 / 20);
        whoosh(7.0, 0.3, 900, 3000, 0.12, 0.2, -0.6, { peak: 0.5 }); // card slides left
        whoosh(7.08, 0.24, 3000, 9000, 0.1, 0, 0, { type: 'highpass', peak: 0.95, rev: 0.4 }); // violet leak
        bell(p2, mtof(77), 0.2 * r2, 0, 1.2, { ratio: 3, index: 1.3, rev: 0.32, dly: 0.15 });
        silverRing(p2, 0.75 * r2, 0.1);
        sparkle(p2, 16, 0.55, 0.045 * r2, 0, 2, 4);
        subDrop(p2, 90, 40, 0.2, 0.35, 0.6);
        whoosh(8.3, 0.3, 900, 3000, 0.12, 0.2, -0.6, { peak: 0.5 });
        whoosh(8.36, 0.26, 2000, 7000, 0.14, 0, 0, { peak: 0.95, rev: 0.4 }); // gold leak
        bell(p3, mtof(81), 0.2 * r4, 0, 1.4, { ratio: 3, index: 1.4, rev: 0.35, dly: 0.18 });
        goldRing(p3, 0.8 * r4, 0);
        horn(p3, [41, 48, 53, 57, 60, 65], 0.45, 0.055, { a: 0.06, cut: 1700, rev: 0.35, huge: 0.3, rel: 0.2, scoop: 30 });
        subDrop(p3, 75, 36, 0.4, 0.9, 1.4);
        crash(p3, 0.4, { huge: 0.25 });
        sparkle(p3 + 0.02, 18, 0.7, 0.04 * r4, 0, 2, 3);
        [p1, p2, p3].forEach((t, i) => { // 'Minted on Base' chip ticks on 0.4 s after each flip + counter
          glassTick(t + 0.4, mtof(86 + i * 2), 0.06, 0.25, { dec: 0.3 });
          for (let k = 0; k < 8; k++) tick(t + 0.15 + k * 0.025, 2900 + i * 200, 0.016, 0.3, 0.008, 'square');
        });
        whoosh(9.3, 0.7, 500, 2000, 0.1, -0.3, 0.2, { peak: 0.75, rev: 0.3 }); // last card arrives while the groove filters down
      }
      // 05 LEGENDARY 10.0-14.2: heartbeat + Shepard riser, 11.4-11.5 black, 11.5 DROP 2, 12.3 D MAJOR lift
      await slice();
      {
        C.heartbeats.forEach((t, i) => { heartbeat(t, 0.85 + 0.08 * i, 0.16); whoosh(t, 0.5, 4000, 9000, 0.035 + 0.015 * i, 0, 0, { type: 'highpass', peak: 0.15, rev: 0.4 }); });
        heartbeat(11.2, 0.95, 0.1);
        play(shep2, 10.0, 0.42, { rev: 0.2, stop: 11.4 });
        drone(10.0, 11.38, [33, 45], 'saw', 0.07, 1.0, 0.02, { lp: 200, lp1: 900, q: 1.5, det: [0, 6] });
        revCymbal(11.4, 0.8, 0.45, { cut: 11.4 });
        whoosh(10.6, 0.8, 300, 6000, 0.18, 0, 0, { peak: 0.99, q: 1.5, rev: 0.1 });
        const t = C.legendary;
        subDrop(t, 62, 40, 0.15, 1.0, 2.2);
        impact(t, 1.0, { huge: 0.4, crashV: 0.7 });
        horn(t, [38, 45, 50, 53, 57, 62], 0.75, 0.065, { a: 0.07, cut: 1600, rev: 0.4, huge: 0.5, rel: 0.12, scoop: 35 });
        choir(t, 12.3, [50, 57, 62, 65, 69, 74], 0.12, { a: 0.12, r: 0.1, huge: 0.6 });
        whoosh(11.6, 0.6, 1200, 8000, 0.14, -0.9, 0.9, { peak: 0.5, rev: 0.35, huge: 0.3 }); // flip / anamorphic flare
        whoosh(12.12, 0.2, 800, 8000, 0.42, 0.4, -0.4, { peak: 0.85 });
        impact(C.oneOf25, 0.65, { huge: 0.25, crashV: 0.5, subDec: 1.0 });
        horn(C.oneOf25, [38, 45, 50, 54, 57, 62, 66], 0.5, 0.06, { a: 0.03, cut: 2000, rev: 0.35, huge: 0.3, rel: 0.25, scoop: 20 });
        choir(C.oneOf25, 13.6, [50, 57, 62, 66, 69, 74], 0.075, { a: 0.05, r: 0.7, huge: 0.45 });
        goldRing(C.oneOf25, 0.95, 0, { decay: 4.0, huge: 0.2 });
        sparkle(C.oneOf25, 16, 0.7, 0.04, 0, 2, 4);
        play(engraveB, C.engrave, 0.22, { pan: [-0.4, 0.4, C.engrave, C.engrave + 0.6], rev: 0.25 });
        bell(C.engrave + 0.62, mtof(98), 0.045, 0.4, 0.5, { ratio: 3.5, index: 0.5 });
        whoosh(13.3, 0.4, 6000, 700, 0.3, 0.6, 0, { peak: 0.4, rev: 0.2 }); // back into the phone
        thud(13.72, 120, 0.25, { slap: 0.35, dec: 0.15 }); // lands in 'Your pulls'
      }
      // 06 DECIDE 14.0-22.2: tap row -> sheet swish -> button tap -> confirm -> toast, per choice; stamp a step higher each
      await slice();
      {
        CHOICES30.forEach((t, i) => {
          if (i) whoosh(t - 0.12, 0.2, 5000, 900, 0.14, 0.4, -0.2, { peak: 0.4 });
          uiTap(t + 0.15, -0.1); sheet(t + 0.3); uiTap(t + 0.75, 0.05);
        });
        // ship: label created + route line LI -> HOME
        toast(15.2, 86); whoosh(15.3, 0.5, 800, 2500, 0.07, -0.5, 0.5, { peak: 0.6, rev: 0.25 });
        play(printerB, 14.95, 0.1, { pan: 0.1, rev: 0.1, stop: 15.2 });
        // trade: LISTED + 3 new offers + Base tx chip
        tick(16.9, 2349, 0.06, 0.3, 0.06, 'sine'); tick(16.97, 2960, 0.05, 0.3, 0.08, 'sine');
        toast(17.3, 88); for (let k = 0; k < 6; k++) tick(17.45 + k * 0.025, 2000, 0.03, 0.4, 0.02, 'square');
        // sell back 80%: ring meter rising sine resolving into a confirm chord at 18.9
        sweepTone(18.3, 18.9, 440, 1174.7, 0.07, { rev: 0.2 });
        [86, 90, 93, 98].forEach((m, k) => bell(18.9, mtof(m), 0.08, -0.45 + k * 0.3, 1.1, { ratio: 3, index: 1.0, rev: 0.35, dly: 0.12 }));
        // vault: wheel ratchet -> clunk 20.6 -> SECURED IN LIECHTENSTEIN
        for (let k = 0; k < 7; k++) tick(20.3 + k * 0.04, 1900 + k * 60, 0.05, 0.2, 0.015, 'square', { rev: 0.1 });
        const v = C.vaultClunk;
        subDrop(v, 70, 42, 0.12, 0.8, 1.1);
        [180, 287, 419, 610, 873, 1240].forEach((f, k) => tick(v, f, 0.07 / (1 + k * 0.4), 0.2, 0.7 - k * 0.07, 'sine', { rev: 0.3, huge: 0.35 }));
        noiseBurst(v, 0.45, 1400, 200, 0.16, { rev: 0.3, huge: 0.4 });
        play(clickB, v, 0.6, { pan: null }); play(clickB, v + 0.045, 0.4, { pan: null });
        kick(v, 0.7, { depth: 0.4 });
        drone(C.vaultLine, 21.7, [33], 'saw', 0.06, 0.3, 0.3, { lp: 260, q: 2 });
        whoosh(C.vaultLine, 1.0, 4000, 9000, 0.05, -0.6, 0.6, { type: 'highpass', peak: 0.5, rev: 0.5, huge: 0.3 });
        sparkle(C.vaultLine + 0.05, 8, 0.8, 0.03, 0, 2, 4);
        // status stamps SHIPPING / LISTED / SOLD BACK / VAULTED, each a step higher
        [[15.35, 55], [17.05, 61.7], [19.05, 69.3], [20.75, 73.4]].forEach(([t, f], k) => thud(t, f, 0.5 + 0.05 * k, { slap: 0.6, rev: 0.2, pan: 0.15 }));
      }
      // 07 PROOF 22.0-24.7: NFC two-tone + verified chime, hash blips
      await slice();
      {
        whoosh(21.85, 0.24, 900, 6000, 0.36, 0.8, -0.8, { peak: 0.6 });
        thud(22.0, 90, 0.3, { slap: 0.3, dec: 0.2 });
        whoosh(22.05, 0.45, 600, 3500, 0.22, 0.9, 0.1, { peak: 0.8 }); // phone swings in
        tick(C.nfcTap, 1760, 0.16, 0.1, 0.09, 'sine', { a: 0.004, rev: 0.25 });
        tick(C.nfcTap + 0.11, 2349, 0.16, 0.1, 0.12, 'sine', { a: 0.004, rev: 0.25 });
        [0, 0.12, 0.24].forEach((d) => whoosh(C.nfcTap + d, 0.3, 4000, 7000, 0.025, 0, 0, { type: 'highpass', peak: 0.3, rev: 0.3 }));
        [86, 90, 93, 98].forEach((m, i) => bell(C.nfcTap + 0.26 + i * 0.05, mtof(m), 0.07, -0.2 + i * 0.15, 1.0, { ratio: 3, index: 1.0, rev: 0.4, dly: 0.15 }));
        for (let i = 0; i < 12; i++) tick(C.mintLog + 0.25 + i * 0.025, 2000, 0.045, 0.3, 0.02, 'square', { a: 0.001 });
        glassTick(23.3, mtof(90), 0.07, 0.4, { dec: 0.35 }); glassTick(23.62, mtof(93), 0.06, 0.4, { dec: 0.3 });
        for (let i = 0; i < 8; i++) clap(24.0 + i * 0.0625, 0.16 + 0.05 * i, { rev: 0.1 }); // build into the end card
        whoosh(23.8, 0.7, 400, 9000, 0.22, 0, 0, { peak: 0.99, q: 1.3 });
        revCymbal(C.endCard, 0.8, 0.4);
      }
      // 08 END CARD 24.5-30.0: final impact, coins fan up, BIFROST CHORD in D major L -> R, silver ring on the mint dot
      await slice();
      {
        const t = C.endCard;
        impact(t, 1.05, { crashV: 0.8, huge: 0.0, subDec: 2.2 });
        b808(t, 26, 2.2, 0.55, { glideFrom: 33, glide: 0.12 });
        horn(t, [38, 45, 50, 54, 57, 62], 0.8, 0.06, { a: 0.05, cut: 1800, rev: 0.35, rel: 0.4, scoop: 20 });
        choir(t, 26.2, [50, 57, 62, 66, 69], 0.06, { a: 0.1, r: 1.0, huge: 0, rev: 0.3 });
        [74, 76, 78, 81, 83, 86].forEach((m, i) => glassTick(t + 0.1 + i * 0.1, mtof(m + 12), 0.05, -0.8 + i * 0.32, { dec: 0.4 })); // 6 coins fan up
        const L = C.logo;
        [74, 78, 81, 86].forEach((m, i) => bell(L + i * 0.1, mtof(m), 0.17, -0.85 + i * 0.57, 1.6, { ratio: 3, index: 1.4, rev: 0.4, dly: 0.12 }));
        tick(L + 0.4, 600, 0.07, -0.7, 0.05, 'sine', { f1: 1300 }); // violet dot pop
        silverRing(L + 0.52, 0.9, 0.7, { rev: 0.35 }); // mint dot
        sparkle(L + 0.02, 10, 0.6, 0.03, 0, 2, 4);
        bell(C.glint, 4186, 0.012, 0.2, 0.45, { ratio: 2.76, index: 0.3, rev: 0, dly: 0 }); // glint (dry)
      }
    }

    const CHOICES30 = CUES30.decide;
    if (dur < 45) await score30(); else await score60();
    await slice();

    // ---------------------------------------------------- FX pass (24 kHz): hall + huge reverbs, ping-pong delay
    const fxN = Math.ceil(N / 2);
    const fx = new Ctx(2, fxN, FX_SR);
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
    const fxSrc = (data, dest) => {
      const b = fx.createBuffer(1, fxN, FX_SR); b.copyToChannel(data, 0);
      const s = fx.createBufferSource(); s.buffer = b; s.connect(dest); s.start(0); return s;
    };
    function irBuf(seconds, rt60, pre, brightHz, darkHz) {
      const n = Math.round(seconds * FX_SR), b = fx.createBuffer(2, n, FX_SR);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c), tau = rt60 / 6.91, preN = Math.round(pre * FX_SR); let y = 0, y2 = 0;
        for (let i = 0; i < n; i++) {
          if (i < preN) { d[i] = 0; continue; }
          const t = (i - preN) / FX_SR, fc = darkHz + (brightHz - darkHz) * Math.exp(-t / (rt60 * 0.3)), a = 1 - Math.exp(-TAU * fc / FX_SR);
          y += a * ((rnd() * 2 - 1) - y); y2 += a * (y - y2);
          const er = (t < 0.09 && rnd() < 0.008) ? (rnd() * 2 - 1) * 2.5 : 0;
          d[i] = (y2 * 1.6 + er) * Math.exp(-t / tau) * Math.min(1, t / 0.006);
        }
      }
      return b;
    }
    const fG = (v, dest) => { const g = fx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const fF = (type, f, q, dest) => { const n = fx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (dest) n.connect(dest); return n; };
    const fxOut = fG(1, fx.destination);
    const hall = fx.createConvolver(); hall.buffer = irBuf(2.7, 2.3, 0.018, 9000, 1800); hall.connect(fG(0.95, fxOut));
    const hugeC = fx.createConvolver(); hugeC.buffer = irBuf(4.2, 3.8, 0.03, 7000, 1200); hugeC.connect(fG(0.9, fxOut));
    const revIn = fF('highpass', 220, 0.7, hall), hugeIn = fF('highpass', 160, 0.7, hugeC);
    const dL = fx.createDelay(1.0), dR = fx.createDelay(1.0); dL.delayTime.value = 0.375; dR.delayTime.value = 0.375;
    const dlyRet = fG(0.55, fxOut); dlyRet.connect(fG(0.25, revIn));
    const pL = fx.createStereoPanner(); pL.pan.value = -0.85; pL.connect(dlyRet);
    const pR = fx.createStereoPanner(); pR.pan.value = 0.85; pR.connect(dlyRet);
    const dlyIn = fG(1, dL); dL.connect(pL); dL.connect(dR); dR.connect(pR);
    const fbLP = fF('lowpass', 3800, 0.6); dR.connect(fbLP); fbLP.connect(fG(0.36, dL));
    // bus-level sends: pads (post pad lowpass) and arps feed the hall
    const fxPadLP = fF('lowpass', 2200, 0.6, fG(0.22, revIn));
    padAuto.forEach(([m, v, t]) => fxPadLP.frequency[m](v, t));
    fxSrc(decim(sendRev), revIn); fxSrc(decim(sendHuge), hugeIn); fxSrc(decim(sendDly), dlyIn);
    fxSrc(decim(stems.pad.L, stems.pad.R), fxPadLP);
    fxSrc(decim(stems.arp.L, stems.arp.R), fG(0.18, revIn));

    // ---------------------------------------------------- stems -> main graph, then render
    const play0 = (name, dest) => { if (opts.solo && opts.solo !== name) return; const s = ctx.createBufferSource(); s.buffer = stems[name].buf; s.connect(dest); s.start(0); };
    play0('drum', drumBus); play0('bass', bassBus); play0('pad', padBus); play0('arp', arpBus);
    play0('lead', leadBus); play0('music', musicPre); play0('sfx', sfx); play0('sub', subBus);

    return fx.startRendering().then((fxBuf) => {
      if (!opts.dry && !opts.solo) {
        const s = ctx.createBufferSource(); s.buffer = fxBuf; // 24 kHz buffer, resampled by the source
        s.connect(F('lowpass', 10500, 0.7, mix)); s.start(0);
      }
      return ctx.startRendering();
    });
  }

  // =====================================================================
  //  MASTERING (JS): loudness normalise to -14 LUFS, true-peak limit to -1.5 dBTP
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
    const cs = cuesFor(L.length / SR);
    cs.silences.forEach(([a, b]) => { ramp(a - 0.006, a, 1, 0); zero(a, b - 0.0015); ramp(b - 0.0015, b, 0, 1); });
    (cs.dips || []).forEach(([a, b, g]) => { ramp(a - 0.025, a, 1, g); ramp(a, b - 0.0015, g, g); ramp(b - 0.0015, b, g, 1); });
    const end = L.length / SR;
    ramp(end - 1.0, end - 0.2, 1, 0); zero(end - 0.2, end);
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
    // final safety: hard ceiling on samples (never clip), and silence after 59.8 s
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
  let renderPromise = null;
  function render() {
    if (!renderPromise) {
      renderPromise = Promise.all([build(), probeLatency()]).then((r) => master(r[0], r[1])).catch((e) => { renderPromise = null; throw e; });
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
    get CUES() { return cuesFor(getDuration()); },
    CUES60: CUES60,
    CUES30: CUES30,
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
    _renderRaw: function (o) { return build(o); },
    _toWav: toWav,
    _lufs: integratedLUFS
  };
  window.BVAudio = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }
})();
