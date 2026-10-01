/* ============================================================================
   audio.js — window.BVAudio
   Bifrost Vault commercial · fully procedural 60 s score + SFX, pure WebAudio.

   - BVAudio.render()  -> Promise<AudioBuffer>  (OfflineAudioContext, 48 kHz stereo, cached)
   - BVAudio.wav()     -> Promise<ArrayBuffer>  (16-bit PCM stereo WAV of render())
   - BVAudio.enable()  -> Promise               (user gesture: AudioContext + live playback synced to BV)
   - BVAudio.muted / BVAudio.setMuted(bool)
   - BVAudio.CUES      -> the cue sheet below (mirrors the scene timings of the script)

   Deterministic: every noise buffer / random choice comes from mulberry32(2026).
   No external libraries; no Math.random; no casino sounds (no reel spins, no
   coin-hopper payouts, no slot bells / buzzers).
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ CUES
  // 120 BPM -> beat 0.5 s, bar 2.0 s. D minor, Picardy lift to D MAJOR at 23.0.
  const CUES = {
    bpm: 120, beat: 0.5, bar: 2.0, key: 'D minor -> D major @ 23.0',
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
    silences: [[2.7, 3.0], [11.5, 12.0], [21.93, 22.0], [45.5, 46.0]]
  };

  const SR = 48000;
  const TARGET_LUFS = -14;
  const CEIL_DBTP = -1.5;

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

  // =====================================================================
  //  SCORE BUILDER
  // =====================================================================
  function build(opts) {
    opts = opts || {};
    const dur = getDuration();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(2, Math.round(SR * dur), SR);
    const rnd = mulberry32(2026);
    const rr = (a, b) => a + (b - a) * rnd();
    const END = dur;

    // ---------------------------------------------------- node helpers
    function G(v, dest) { const g = ctx.createGain(); g.gain.value = v == null ? 1 : v; if (dest) g.connect(dest); return g; }
    function F(type, f, q, dest) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q == null ? 0.707 : q; if (dest) n.connect(dest); return n; }
    function PAN(p, dest) { const n = ctx.createStereoPanner(); n.pan.value = p; if (dest) n.connect(dest); return n; }
    function OSC(type, f, t0, t1, dest) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, Math.max(0, t0));
      if (dest) o.connect(dest); o.start(Math.max(0, t0)); o.stop(Math.min(END, Math.max(t0 + 0.01, t1))); return o;
    }
    function SRC(b, t0, dest, rate, offset, len) {
      const s = ctx.createBufferSource(); s.buffer = b;
      if (rate) s.playbackRate.setValueAtTime(rate, t0);
      if (dest) s.connect(dest);
      if (len != null) s.start(t0, offset || 0, len); else s.start(t0, offset || 0);
      return s;
    }
    function shaper(drive, dest) {
      const w = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n), k = Math.tanh(drive);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / k; }
      w.curve = c; w.oversample = '2x'; if (dest) w.connect(dest); return w;
    }
    function send(node, amt, target) { if (amt > 0) { const g = G(amt, target); node.connect(g); } }
    // Output strip: returns an input GainNode -> [panner] -> dest, with reverb/delay sends post-pan
    function strip(dest, o) {
      o = o || {};
      const g = ctx.createGain();
      let node = g;
      if (o.pan != null) {
        const p = ctx.createStereoPanner();
        if (Array.isArray(o.pan)) {
          p.pan.setValueAtTime(o.pan[0], o.pan[2]); p.pan.linearRampToValueAtTime(o.pan[1], o.pan[3]);
        } else p.pan.value = o.pan;
        g.connect(p); node = p;
      }
      node.connect(dest);
      send(node, o.rev || 0, revIn); send(node, o.huge || 0, hugeIn); send(node, o.dly || 0, dlyIn);
      return g;
    }
    // envelope: linear attack to peak, exponential-ish decay (decay = time to about -40 dB)
    function perc(param, t, peak, a, decay) {
      param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a);
      param.setTargetAtTime(0, t + a, Math.max(0.001, decay / 4.6));
    }
    function sustain(param, t0, t1, peak, a, r) {
      param.setValueAtTime(0, t0); param.linearRampToValueAtTime(peak, t0 + a);
      param.setValueAtTime(peak, Math.max(t0 + a, t1)); param.linearRampToValueAtTime(0, Math.max(t0 + a, t1) + r);
    }
    function buf(seconds, chans, fill) {
      const n = Math.max(2, Math.round(seconds * SR)); const b = ctx.createBuffer(chans, n, SR);
      for (let c = 0; c < chans; c++) fill(b.getChannelData(c), c, n);
      return b;
    }

    // ---------------------------------------------------- JS-synth buffers
    const noiseB = buf(6, 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
    const clickB = buf(0.008, 1, (d) => {
      const hp = jsBiquad('hp', 3000, 0.7);
      for (let i = 0; i < d.length; i++) d[i] = hp((i < 2 ? 1 : 0) + (rnd() * 2 - 1) * Math.exp(-i / (0.0008 * SR)) * 0.7);
    });
    function hatBuf(decay) {
      return buf(decay * 1.6, 1, (d) => {
        const fr = [263, 400, 421, 474, 587, 845].map((f) => f * 1.55), ph = fr.map(() => rnd());
        const h1 = jsBiquad('hp', 7200, 0.9), h2 = jsBiquad('hp', 7200, 0.9), bp = jsBiquad('bp', 10500, 0.6);
        for (let i = 0; i < d.length; i++) {
          const t = i / SR; let s = 0;
          for (let k = 0; k < 6; k++) s += ((ph[k] + fr[k] * t) % 1) < 0.5 ? 1 : -1;
          s = s / 6 * 0.8 + (rnd() * 2 - 1) * 0.5;
          const e = Math.exp(-t / (decay / 4.6)) * Math.min(1, t / 0.0006);
          d[i] = h2(h1(bp(s))) * e * 1.6;
        }
      });
    }
    const hatC = hatBuf(0.055), hatO = hatBuf(0.32);
    const clapB = buf(0.4, 2, (d, c) => {
      const bp = jsBiquad('bp', 1350 + c * 120, 1.4), hp = jsBiquad('hp', 2500, 0.7);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; const n = rnd() * 2 - 1;
        let e = 0;
        for (let k = 0; k < 3; k++) { const tk = t - k * 0.0105; if (tk >= 0) e = Math.max(e, Math.exp(-tk / 0.0035)); }
        if (t > 0.021) e = Math.max(e, 0.75 * Math.exp(-(t - 0.021) / 0.07));
        const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.045) * 0.55;
        d[i] = bp(n) * e * 2.2 + hp(n) * Math.exp(-t / 0.03) * 0.35 + body;
      }
    });
    const crashB = buf(2.8, 2, (d) => {
      const P = 36, fr = [], ph = [], am = [];
      for (let k = 0; k < P; k++) { fr.push(rr(3200, 13500)); ph.push(rnd() * 6.283); am.push(rr(0.3, 1)); }
      const hp = jsBiquad('hp', 2600, 0.6), hp2 = jsBiquad('hp', 900, 0.6);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; let s = 0;
        if (i % 2 === 0 || true) for (let k = 0; k < P; k += 3) s += am[k] * Math.sin(ph[k] + 6.283 * fr[k] * t);
        const e = Math.exp(-t / 0.75) * (0.55 + 0.45 * Math.exp(-t / 0.08)) * Math.min(1, t / 0.0015);
        d[i] = (hp(rnd() * 2 - 1) * 0.9 + hp2(s * 0.09)) * e;
      }
    });
    function reversed(b, seconds) {
      const n = Math.min(b.length, Math.round(seconds * SR));
      return buf(n / SR, b.numberOfChannels, (d, c) => {
        const s = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = s[n - 1 - i] * Math.min(1, (d.length - i) / (0.004 * SR));
      });
    }
    const revCrashB = reversed(crashB, 1.6);

    // impulse responses (seeded noise, exponential decay, progressive darkening, decorrelated L/R)
    function irBuf(seconds, rt60, pre, brightHz, darkHz) {
      return buf(seconds, 2, (d, c) => {
        const tau = rt60 / 6.91; let y = 0, y2 = 0;
        const preN = Math.round(pre * SR);
        for (let i = 0; i < d.length; i++) {
          if (i < preN) { d[i] = 0; continue; }
          const t = (i - preN) / SR;
          const fc = darkHz + (brightHz - darkHz) * Math.exp(-t / (rt60 * 0.3));
          const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
          y += a * ((rnd() * 2 - 1) - y); y2 += a * (y - y2);
          let er = 0;
          if (t < 0.09 && rnd() < 0.004) er = (rnd() * 2 - 1) * 2.5;
          d[i] = (y2 * 1.6 + er) * Math.exp(-t / tau) * Math.min(1, t / 0.006);
        }
      });
    }
    const irHall = irBuf(3.4, 2.5, 0.018, 9000, 1800);
    const irHuge = irBuf(5.5, 4.6, 0.03, 7000, 1200);

    // Chiptune segment (0..2.95 s): 4-bit, 8 kHz sample-and-hold, D minor
    const chipB = buf(2.95, 1, (d) => {
      const LEAD = [74, 77, 81, 86, 81, 77, 74, 81, 72, 76, 79, 84, 81, 79, 77, 76];
      const STAB = [62, 65, 69, 74];
      let pl = 0, pb = 0, held = 0, lfsr = 1;
      const ps = STAB.map(() => 0);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, step = Math.floor(t / 0.125), lt = t - step * 0.125;
        // lead: 25% pulse, staccato
        pl += mtof(LEAD[step % 16]) / SR;
        let s = ((pl % 1) < 0.25 ? 1 : -1) * 0.16 * (lt < 0.095 ? Math.exp(-lt / 0.12) : 0);
        // bass: 8th-note octave triangle on D
        const b8 = Math.floor(t / 0.25); pb += mtof(b8 % 2 ? 50 : 38) / SR;
        const tri = 1 - 4 * Math.abs((pb % 1) - 0.5);
        s += tri * 0.22 * ((t - b8 * 0.25) < 0.2 ? 1 : 0);
        // gated 8-bit stab on each word slam (0, .5, 1, 1.5)
        const k = Math.floor(t / 0.5), st = t - k * 0.5;
        if (k < 4 && st < 0.17) {
          const gate = (st % 0.034) < 0.022 ? 1 : 0, blip = 1 + 0.6 * Math.exp(-st / 0.008);
          for (let j = 0; j < 4; j++) { ps[j] += mtof(STAB[j] + (k % 2 ? 0 : 0)) * blip / SR; s += ((ps[j] % 1) < 0.5 ? 1 : -1) * 0.1 * gate * Math.exp(-st / 0.2); }
        }
        // chip noise drum on the off-beats
        const e8 = t - Math.floor(t / 0.25) * 0.25;
        if (i % 8 === 0) { const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); }
        const odd = Math.floor(t / 0.25) % 2 === 1;
        s += ((lfsr & 1) ? 1 : -1) * (odd ? 0.1 : 0.04) * Math.exp(-e8 / (odd ? 0.05 : 0.015));
        // chip kick on the beats
        const eb = t - Math.floor(t / 0.5) * 0.5;
        s += Math.sin(2 * Math.PI * (60 * eb + 900 * 0.012 * (1 - Math.exp(-eb / 0.012)))) * 0.3 * Math.exp(-eb / 0.08);
        // sample & hold (8 kHz) + 4-bit quantise
        if (i % 6 === 0) held = Math.round(clamp(s, -1, 1) * 7) / 7;
        d[i] = held;
      }
    });
    // vinyl-scratch source (voice-ish grit, played with a wobbling playbackRate)
    const scratchB = buf(0.4, 1, (d) => {
      const bp = jsBiquad('bp', 1400, 1.1); let p = 0;
      for (let i = 0; i < d.length; i++) { p += 190 / SR; d[i] = bp(((p % 1) * 2 - 1) * 0.6 + (rnd() * 2 - 1) * 0.5) * 2.2; }
    });
    // foil crinkle grains: density(u) 0..1 over the buffer
    function crinkleBuf(seconds, dens, flick) {
      return buf(seconds, 2, (d) => {
        const hp = jsBiquad('hp', 2200, 0.7), bp = jsBiquad('bp', 5200, 0.8);
        let e = 0, amp = 0, sign = 1;
        for (let i = 0; i < d.length; i++) {
          const u = i / d.length, t = i / SR;
          if (rnd() < dens(u) * 0.004) { e = 1; amp = rr(0.2, 1); sign = rnd() < 0.5 ? -1 : 1; }
          e *= 0.93;
          const f = flick ? (0.65 + 0.35 * Math.sin(2 * Math.PI * 12 * t)) : 1;
          d[i] = bp(hp((rnd() * 2 - 1) * e * amp * sign)) * 3.2 * f;
        }
      });
    }
    const crinkleSweep = crinkleBuf(0.7, (u) => Math.sin(Math.PI * u) * 0.9, false);
    const crinkleRise = crinkleBuf(1.55, (u) => 0.25 + 1.6 * u * u, true);
    // tear crackle: 40 ms grains rising 2 -> 9 kHz over 0.36 s + rip texture
    const tearB = buf(0.42, 2, (d, c) => {
      const grains = [];
      for (let g = 0; g < 11; g++) grains.push({ t0: g * 0.03 + rr(0, 0.012), f: 2000 * Math.pow(4.5, g / 10) * rr(0.85, 1.15), a: rr(0.5, 1) });
      const filt = grains.map((g) => jsBiquad('bp', g.f, 1.6));
      const hp = jsBiquad('hp', 1500, 0.7);
      let am = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; let s = 0;
        for (let g = 0; g < grains.length; g++) {
          const tl = t - grains[g].t0;
          const n = rnd() * 2 - 1;
          const y = filt[g](tl >= 0 && tl < 0.04 ? n : 0);
          if (tl >= 0 && tl < 0.06) s += y * grains[g].a * Math.sin(Math.PI * Math.min(1, tl / 0.04));
        }
        if (rnd() < 0.02) am = rr(0.3, 1);
        am *= 0.995;
        s += hp(rnd() * 2 - 1) * am * 0.6 * Math.exp(-t / 0.2);
        d[i] = s * 1.4;
      }
    });
    // engraving crackle + cutting sizzle (0.62 s)
    const engraveB = buf(0.62, 1, (d) => {
      const hp = jsBiquad('hp', 4200, 0.7), bp = jsBiquad('bp', 6800, 6);
      let e = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        if (rnd() < 0.012) e = rr(0.4, 1);
        e *= 0.9;
        const n = rnd() * 2 - 1;
        const jit = 0.6 + 0.4 * Math.sin(i * 0.013) * Math.sin(i * 0.0021);
        d[i] = (hp(n * e) * 1.4 + bp(n) * 1.1 * jit) * Math.sin(Math.PI * u) * 1.2;
      }
    });
    // tape zip: AM noise, rate rising 45 -> 140 Hz (echoes the rip)
    const zipB = buf(0.34, 1, (d) => {
      const bp = jsBiquad('bp', 2600, 0.9); let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length; ph += (45 + 95 * u) / SR;
        const am = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * ph), 3);
        d[i] = bp(rnd() * 2 - 1) * am * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 2.6;
      }
    });
    // label-printer chatter (stepper ticks + motor buzz, printing in bursts)
    const printerB = buf(0.82, 1, (d) => {
      const hp = jsBiquad('hp', 1800, 0.8), bp = jsBiquad('bp', 900, 3); let p = 0, e = 0, next = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; const burst = (t % 0.16) < 0.11 ? 1 : 0.1;
        if (i >= next) { e = burst; next = i + Math.round(SR / rr(48, 62)); }
        e *= 0.86; p += 96 / SR;
        const buzz = ((p % 1) < 0.5 ? 1 : -1) * 0.18 * burst;
        d[i] = hp((rnd() * 2 - 1) * e) * 0.9 + bp(buzz) * 1.4;
      }
    });
    // Shepard riser (octave-spaced sines under a Gaussian log-frequency window)
    function shepardBuf(seconds, octPerSec) {
      return buf(seconds, 2, (d, c) => {
        const NO = 7, base = 46.25, ph = new Float64Array(NO); const det = c ? 1.004 : 1;
        for (let i = 0; i < d.length; i++) {
          const t = i / SR, u = i / d.length, p = octPerSec * t; let s = 0;
          for (let k = 0; k < NO; k++) {
            const lp = (k + p) % NO, f = base * Math.pow(2, lp) * det;
            ph[k] += f / SR;
            const w = Math.exp(-Math.pow(lp - NO * 0.55, 2) / (2 * 1.25 * 1.25));
            s += w * (Math.sin(2 * Math.PI * ph[k]) + 0.25 * Math.sin(4 * Math.PI * ph[k]));
          }
          d[i] = s * 0.32 * (0.15 + 0.85 * u * u) * Math.min(1, u * 20);
        }
      });
    }
    const shep1 = shepardBuf(1.5, 0.9), shep2 = shepardBuf(1.93, 1.0);

    // ---------------------------------------------------------- the graph
    const out = G(1);                      // final, gated (silences)
    out.connect(ctx.destination);
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -17; glue.knee.value = 8; glue.ratio.value = 2.4; glue.attack.value = 0.012; glue.release.value = 0.2;
    const mix = G(0.62);
    mix.connect(glue); glue.connect(lim); lim.connect(G(1, out));

    const sfxIn = G(opts.only === 'music' ? 0 : 1, mix);
    const sfx = G(1, sfxIn);
    const subBus = G(1); subBus.connect(shaper(1.4, sfx));
    const musicGate = G(opts.only === 'sfx' ? 0 : 1, mix);
    const musicOut = G(1, musicGate);
    const musicLP = F('lowpass', 20000, 0.8, musicOut);
    const musicPre = G(1, musicLP);
    const duck = G(1, musicPre);
    const drumLP = F('lowpass', 20000, 0.9, musicPre);
    const drumBus = G(0.9); drumBus.connect(shaper(1.25, drumLP));
    const bassLP = F('lowpass', 650, 0.7, duck);
    const bassBus = G(0.8); bassBus.connect(shaper(2.4, bassLP));
    const padLP = F('lowpass', 2200, 0.6, duck);
    const padBus = G(1, padLP);
    const arpBus = G(1, duck);
    const hornBus = G(1, musicOut);
    const choirBus = G(1, musicOut);
    const hatBusL = PAN(-0.28, drumBus), hatBusR = PAN(0.28, drumBus);

    // reverbs + ping-pong delay (returns go straight to the mix)
    const hall = ctx.createConvolver(); hall.buffer = irHall; hall.connect(G(opts.only === 'dry' ? 0 : 0.95, mix));
    const hugeC = ctx.createConvolver(); hugeC.buffer = irHuge; hugeC.connect(G(opts.only === 'dry' ? 0 : 0.9, mix));
    const revIn = F('highpass', 220, 0.7, hall);
    const hugeIn = F('highpass', 160, 0.7, hugeC);
    const dlyIn = G(1);
    const dL = ctx.createDelay(1.0), dR = ctx.createDelay(1.0);
    dL.delayTime.value = 0.375; dR.delayTime.value = 0.375;
    const dlyRet = G(0.55, mix); send(dlyRet, 0.25, revIn);
    dlyIn.connect(dL); dL.connect(PAN(-0.85, dlyRet)); dL.connect(dR); dR.connect(PAN(0.85, dlyRet));
    const fbLP = F('lowpass', 3800, 0.6); dR.connect(fbLP); fbLP.connect(G(0.36, dL));

    // ---------------------------------------------------------- instruments
    const duckTimes = [];
    function kick(t, v, o) {
      v = v == null ? 1 : v; o = o || {};
      const ko = OSC('sine', 190, t, t + 0.7);
      ko.frequency.exponentialRampToValueAtTime(o.f1 || 54, t + 0.065);
      ko.frequency.exponentialRampToValueAtTime(o.f2 || 43, t + 0.4);
      const g = G(0, drumBus); perc(g.gain, t, v * 0.95, 0.002, o.dec || 0.5); ko.connect(g);
      const cg = G(v * 0.42, drumBus); SRC(clickB, t, cg);
      if (o.duck !== false) duckTimes.push([t, o.depth || 0.3]);
    }
    function clap(t, v, o) {
      o = o || {};
      const g = strip(drumBus, { rev: o.rev == null ? 0.22 : o.rev, pan: o.pan || 0 }); g.gain.value = v;
      const s = SRC(clapB, t, g, o.rate || 1); s.stop(t + 0.45);
    }
    let hatN = 0;
    function hat(t, v, open) {
      const g = G(v, (hatN++ % 2) ? hatBusR : hatBusL);
      SRC(open ? hatO : hatC, t, g);
    }
    function crash(t, v, o) {
      o = o || {};
      const g = strip(sfx, { rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 }); g.gain.value = v;
      const s = SRC(crashB, t, g, o.rate || 1); s.stop(Math.min(END, t + 2.8 / (o.rate || 1)));
    }
    function revCymbal(tEnd, len, v, o) {
      o = o || {};
      const g = strip(sfx, { rev: 0.25, pan: o.pan == null ? 0 : o.pan }); g.gain.value = v;
      const n = revCrashB.duration; const s = SRC(revCrashB, tEnd - len, g, 1, n - len); s.stop(o.cut || tEnd);
    }
    let last808 = null;
    function b808(t, midi, len, v, o) {
      o = o || {};
      const f = mtof(midi);
      const so = OSC('sine', f, t, t + len + 0.1);
      if (o.glideFrom != null) { so.frequency.setValueAtTime(mtof(o.glideFrom), t); so.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.09)); }
      else { so.frequency.setValueAtTime(f * 1.9, t); so.frequency.exponentialRampToValueAtTime(f, t + 0.035); }
      const g = G(0, o.dest || bassBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
      g.gain.setTargetAtTime(v * 0.55, t + 0.05, 0.35); g.gain.setValueAtTime(v * 0.55 * Math.exp(-(len - 0.05) / 0.35) + 0.0001, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.04);
      so.connect(g);
      last808 = midi;
    }
    function pad(t0, t1, notes, v, o) {
      o = o || {};
      const a = o.a == null ? 0.12 : o.a, r = o.r == null ? 0.25 : o.r;
      [[-12, -0.8, 1], [0, 0, 0.7], [12, 0.8, 1]].forEach(([det, p, lv]) => {
        const g = G(0, PAN(p, o.dest || padBus)); sustain(g.gain, t0, t1, v * lv, a, r);
        notes.forEach((m) => {
          const os = OSC('sawtooth', mtof(m), t0, t1 + r + 0.05, g);
          os.detune.value = det + rr(-3, 3);
        });
      });
    }
    const padSend = G(0.22, revIn); padLP.connect(padSend);
    const arpSend = G(0.18, revIn); arpBus.connect(arpSend);
    function pluck(t, midi, v, pan, o) {
      o = o || {};
      const g = strip(arpBus, { pan: pan, dly: o.dly == null ? 0.22 : o.dly });
      const lp = F('lowpass', o.cut || 4200, 2.2, g);
      lp.frequency.setValueAtTime(o.cut || 4200, t); lp.frequency.exponentialRampToValueAtTime(o.cutEnd || 500, t + (o.dec || 0.22));
      const os = OSC(o.type || 'sawtooth', mtof(midi), t, t + (o.dec || 0.22) * 2.2, lp);
      const os2 = OSC('square', mtof(midi) * 1.004, t, t + (o.dec || 0.22) * 2.2, lp);
      os2.detune.value = 7;
      perc(g.gain, t, v, 0.003, (o.dec || 0.22) * 2);
    }
    // FM glass bell (sine carrier + 3rd-harmonic FM)
    function bell(t, f, v, pan, decay, o) {
      o = o || {};
      const g = strip(o.dest || sfx, { pan: pan || 0, rev: o.rev == null ? 0.3 : o.rev, dly: o.dly || 0, huge: o.huge || 0 });
      const car = OSC('sine', f, t, t + decay + 0.1, g);
      const mod = OSC('sine', f * (o.ratio || 3), t, t + decay + 0.1);
      const mg = G(0, car.frequency); mod.connect(mg);
      const idx = o.index == null ? 1.6 : o.index;
      mg.gain.setValueAtTime(f * idx, t); mg.gain.setTargetAtTime(f * idx * 0.12, t, decay * 0.18);
      perc(g.gain, t, v, o.a || 0.002, decay);
      return g;
    }
    const RATIOS = [1, 2.76, 5.40, 8.93];
    function silverRing(t, v, pan, o) {
      o = o || {};
      const g = strip(sfx, { pan: pan || 0, rev: o.rev == null ? 0.32 : o.rev, dly: o.dly || 0.05, huge: o.huge || 0 }); g.gain.value = v;
      const decs = [2.5, 1.75, 1.1, 0.7], amps = [0.30, 0.17, 0.10, 0.055];
      RATIOS.forEach((r, i) => {
        const e = G(0, g); perc(e.gain, t, amps[i], 0.0012, decs[i]);
        OSC('sine', 1320 * r, t, t + decs[i] + 0.1, e);
      });
      const e2 = G(0, g); perc(e2.gain, t, 0.09, 0.0012, 2.4); OSC('sine', 1320 * 1.0021, t, t + 2.5, e2);
      const cg = G(0.35, g); SRC(clickB, t, cg);
    }
    function goldRing(t, v, pan, o) {
      o = o || {};
      const lp = F('lowpass', 6000, 0.7);
      const g = strip(sfx, { pan: pan || 0, rev: o.rev == null ? 0.38 : o.rev, dly: o.dly || 0.05, huge: o.huge || 0 }); g.gain.value = v;
      lp.connect(g);
      const D = o.decay || 3.5;
      const decs = [D, D * 0.72, D * 0.48, D * 0.3], amps = [0.36, 0.2, 0.11, 0.06];
      RATIOS.forEach((r, i) => {
        const e = G(0, lp); perc(e.gain, t, amps[i], 0.009, decs[i]);
        OSC('sine', 880 * r, t, t + decs[i] + 0.1, e);
      });
      const e2 = G(0, lp); perc(e2.gain, t, 0.1, 0.009, D); OSC('sine', 880 * 0.9986, t, t + D + 0.1, e2);
    }
    function horn(t, notes, len, v, o) {
      o = o || {};
      const att = o.a == null ? 0.3 : o.a, cut = o.cut || 1200;
      const g = strip(o.dest || hornBus, { rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 });
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, t + len); g.gain.setTargetAtTime(0, t + len, o.rel || 0.12);
      const lp = F('lowpass', 300, 1.1, g);
      lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(cut, t + att * 0.9);
      lp.frequency.setTargetAtTime(cut * 0.65, t + att, len * 0.6 + 0.05);
      const pl = PAN(-0.55, lp), pr = PAN(0.55, lp);
      notes.forEach((m) => {
        [-14, -5, 5, 14].forEach((d, i) => {
          const os = OSC('sawtooth', mtof(m), t, t + len + (o.rel || 0.12) * 6, i % 2 ? pr : pl);
          os.detune.setValueAtTime(d - (o.scoop == null ? 45 : o.scoop), t); os.detune.linearRampToValueAtTime(d, t + 0.11);
        });
      });
    }
    function choir(t0, t1, notes, v, o) {
      o = o || {};
      const g = strip(choirBus, { huge: o.huge == null ? 0.55 : o.huge, rev: 0.25 });
      sustain(g.gain, t0, t1, v, o.a || 0.35, o.r || 0.7);
      const lfo = OSC('sine', 5.1, t0, t1 + 1.5); const lg = G(10); lfo.connect(lg);
      const banks = [-0.6, 0.6].map((p) => {
        const inp = G(1); const pn = PAN(p, g);
        [[730, 7, 1], [1120, 9, 0.6], [2600, 12, 0.24], [3350, 14, 0.12]].forEach(([f, q, a]) => {
          const bp = F('bandpass', f, q); inp.connect(bp); bp.connect(G(a * 2.4, pn));
        });
        return inp;
      });
      let k = 0;
      notes.forEach((m) => {
        [-11, 0, 11].forEach((d) => {
          const os = OSC('sawtooth', mtof(m), t0, t1 + (o.r || 0.7) + 0.1, banks[k++ % 2]);
          os.detune.value = d + rr(-4, 4); lg.connect(os.detune);
        });
      });
    }
    function whoosh(t, d, f0, f1, v, p0, p1, o) {
      o = o || {};
      const s = SRC(noiseB, t, null, 1, rr(0, 2.5)); s.stop(t + d + 0.05);
      const bp = F(o.type || 'bandpass', f0, o.q || 1.1);
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d);
      s.connect(bp);
      const g = strip(o.dest || sfx, { pan: [p0, p1, t, t + d], rev: o.rev == null ? 0.22 : o.rev, huge: o.huge || 0 });
      bp.connect(g);
      const pk = o.peak == null ? 0.65 : o.peak;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + d * pk); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    }
    function subDrop(t, f0, f1, drop, v, decay) {
      const so = OSC('sine', f0, t, t + decay + 0.2);
      so.frequency.exponentialRampToValueAtTime(f1, t + drop);
      const g = G(0, subBus); perc(g.gain, t, v, 0.004, decay); so.connect(g);
    }
    function noiseBurst(t, v, f0, f1, decay, o) {
      o = o || {};
      const s = SRC(noiseB, t, null, 1, rr(0, 3)); s.stop(t + decay + 0.1);
      const lp = F(o.type || 'lowpass', f0, o.q || 0.8); lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(f1, t + decay);
      s.connect(lp);
      const g = strip(sfx, { pan: o.pan || 0, rev: o.rev == null ? 0.3 : o.rev, huge: o.huge || 0 }); lp.connect(g);
      perc(g.gain, t, v, o.a || 0.002, decay);
    }
    function impact(t, v, o) {
      o = o || {};
      subDrop(t, o.f0 || 95, o.f1 || 33, o.drop || 0.65, v * 0.95, o.subDec || 1.8);
      noiseBurst(t, v * 0.55, 2600, 140, 0.55, { rev: 0.35, huge: o.huge == null ? 0.25 : o.huge });
      if (o.crash !== false) crash(t, v * (o.crashV || 0.55), { huge: o.huge == null ? 0.2 : o.huge });
      kick(t, v * 0.9, { duck: true, depth: 0.15 });
    }
    function thud(t, f, v, o) {
      o = o || {};
      const so = OSC('sine', f * 2.6, t, t + 0.6);
      so.frequency.exponentialRampToValueAtTime(f, t + 0.045);
      const g = strip(sfx, { rev: o.rev == null ? 0.18 : o.rev, pan: o.pan || 0 }); perc(g.gain, t, v, 0.002, o.dec || 0.38); so.connect(g);
      const so2 = OSC('triangle', f * 2, t, t + 0.3, g);
      so2.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.1);
      noiseBurst(t, v * (o.slap == null ? 0.5 : o.slap), 1600, 300, 0.09, { pan: o.pan || 0, rev: 0.15 });
      const cg = G(v * 0.4, sfx); SRC(clickB, t, cg);
    }
    function tick(t, f, v, pan, d, type, o) {
      o = o || {};
      const g = strip(o.dest || sfx, { pan: pan || 0, rev: o.rev || 0, dly: o.dly || 0 });
      const os = OSC(type || 'sine', f, t, t + d * 2 + 0.02, g);
      if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + d);
      perc(g.gain, t, v, o.a || 0.001, d);
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
        let m;
        if (o.desc) m = PENT[(n - i) % 5] + 12 * Math.floor(lo + (hi - lo) * (1 - i / n));
        else m = PENT[Math.floor(rnd() * 5)] + 12 * Math.floor(rr(lo, hi));
        bell(tt, mtof(m), v * rr(0.5, 1), clamp((pan || 0) + rr(-0.5, 0.5), -1, 1), rr(0.25, 0.6), { ratio: 3.5, index: 0.5, rev: 0.4, dly: 0.1 });
      }
    }
    function scratch(t, v) {
      const g = strip(sfx, { rev: 0.1 }); const s = SRC(scratchB, t, g, 0.5); s.stop(t + 0.2);
      const pr = s.playbackRate; pr.setValueAtTime(0.4, t); pr.linearRampToValueAtTime(2.3, t + 0.045); pr.linearRampToValueAtTime(0.3, t + 0.09); pr.linearRampToValueAtTime(1.7, t + 0.14);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v, t + 0.08);
      g.gain.linearRampToValueAtTime(v * 0.15, t + 0.095); g.gain.linearRampToValueAtTime(v * 0.8, t + 0.11); g.gain.linearRampToValueAtTime(0, t + 0.17);
    }
    function play(b, t, v, o) {
      o = o || {};
      const g = strip(o.dest || sfx, { pan: o.pan == null ? 0 : o.pan, rev: o.rev || 0, huge: o.huge || 0, dly: o.dly || 0 }); g.gain.value = v;
      const s = SRC(b, t, g, o.rate || 1); if (o.stop) s.stop(o.stop);
      return g;
    }
    function heartbeat(t, v) {
      [[0, 1], [0.17, 0.62]].forEach(([dt, a]) => {
        const tt = t + dt;
        const so = OSC('sine', 82, tt, tt + 0.5); so.frequency.exponentialRampToValueAtTime(55, tt + 0.06);
        const g = G(0, subBus); perc(g.gain, tt, v * a, 0.006, 0.3); so.connect(g);
        const h = OSC('sine', 110, tt, tt + 0.3); const hg = G(0, sfx); perc(hg.gain, tt, v * a * 0.22, 0.006, 0.16); h.connect(hg);
        noiseBurst(tt, v * a * 0.18, 420, 120, 0.1, { rev: 0.05 });
      });
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
    // section table: chord + style + pad level + pad lowpass
    const SECTIONS = [
      { t0: 4.0, t1: 6.0, ch: 'Dm', st: 'ambient', pad: 0.045, lp: 900, a: 0.6, r: 0.25 },
      { t0: 6.0, t1: 8.0, ch: 'Dm', st: 'intro', pad: 0.05, lp: 1400 },
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
    const STY = {
      intro: { k: [0, 4, 8, 12], c: [], h: 1, oh: [], hv: 0.32, b: [[0, 1.85]], arp: null },
      groove: { k: [0, 4, 8, 12], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.36, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'pluck8' },
      lift: { k: [0, 4, 8, 12], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.4, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      data: { k: [0, 6, 10], c: [4, 12], h: 1, oh: [14], hv: 0.3, b: [[0, 1.0], [10, 0.6]], arp: 'pluck16' },
      half: { k: [0, 11], c: [8], h: 2, oh: [], hv: 0.32, b: [[0, 1.4], [11, 0.5]], arp: 'bellHalf' },
      warm: { k: [0, 10], c: [4, 12], cv: 0.35, h: 2, oh: [], hv: 0.22, b: [[0, 1.6]], arp: 'ep' },
      drop: { k: [0, 4, 8, 12, 14], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.46, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      filtered: { k: [0, 4], c: [], h: 1, oh: [2], hv: 0.3, b: [[0, 0.5]], arp: 'bell16' },
      drop4: { k: [0, 4, 8, 12, 14], c: [4, 12], h: 1, oh: [2, 6, 10, 14], hv: 0.44, b: [[0, 0.7], [6, 0.4], [10, 0.85]], arp: 'bell16' },
      callback: { k: [0, 2, 4, 6, 8, 10, 12, 14], c: [4, 12], h: 1, oh: [], hv: 0.4, b: [[0, 0.24], [4, 0.24], [8, 0.24], [12, 0.24]], arp: null }
    };
    function forSteps(t0, t1, fn) {
      for (let s = Math.ceil(t0 / 0.125 - 1e-6); s * 0.125 < t1 - 1e-6; s++) fn(s * 0.125, ((s % 16) + 16) % 16, s);
    }

    // automation: lowpass of the pads per section
    padLP.frequency.setValueAtTime(2200, 0);
    SECTIONS.forEach((S) => {
      const ch = CH[S.ch];
      padLP.frequency.setValueAtTime(S.lp, S.t0);
      if (S.st === 'intro' && S.t0 === 6.0) padLP.frequency.exponentialRampToValueAtTime(2400, 10.0);
      pad(S.t0, S.t1, ch.pad, S.pad, { a: S.a, r: S.r });
      const st = STY[S.st];
      if (!st) return;
      forSteps(S.t0, S.t1, (t, i, s) => {
        if (st.k.indexOf(i) >= 0) kick(t, i === 0 ? 1 : 0.92);
        if (st.c.indexOf(i) >= 0) clap(t, (st.cv || 0.62) * (S.st === 'drop' || S.st === 'drop4' ? 1.12 : 1));
        if (st.h === 1 || (st.h === 2 && i % 2 === 0)) {
          const accent = (i % 4 === 2) ? 1 : (i % 2 ? 0.55 : 0.75);
          const open = st.oh.indexOf(i) >= 0;
          hat(t + (i % 2 ? 0.006 : 0), st.hv * accent * (open ? 0.75 : 1), open);
        }
        st.b.forEach(([bi, len]) => {
          if (bi !== i) return;
          const L = Math.min(len, S.t1 - t - 0.02);
          if (L <= 0.05) return;
          const glide = (S.st === 'intro' && t === 6.0) ? 38 : (bi === 10 && last808 != null ? last808 + 12 : null);
          b808(t, ch.root, L, S.st === 'warm' ? 0.42 : 0.6, glide != null ? { glideFrom: glide, glide: t === 6.0 ? 0.28 : 0.07 } : {});
        });
        // arps / comping
        const arp = st.arp;
        if (arp === 'bell16') {
          const pat = [0, 2, 1, 3, 2, 4, 3, 1];
          const m = ch.arp[pat[s % 8]] + (s % 16 >= 8 ? 12 : 0) - (S.st === 'drop' ? 0 : 0);
          bell(t, mtof(m), (S.st === 'drop' ? 0.075 : 0.06) * (i % 4 === 0 ? 1.2 : 0.85), (s % 2 ? 0.45 : -0.45), 0.42,
            { dest: arpBus, ratio: 3, index: 0.9, rev: 0.12, dly: 0.2 });
        } else if (arp === 'pluck8' && i % 2 === 0) {
          const pat = [0, 2, 1, 3, 0, 2, 4, 2];
          pluck(t, ch.arp[pat[(s / 2) % 8]] - 12, 0.05, (s % 4 ? 0.35 : -0.35), { cut: 3200, dec: 0.16 });
        } else if (arp === 'pluck16') {
          const pat = [0, 1, 2, 3, 4, 3, 2, 1];
          pluck(t, ch.arp[pat[s % 8]], 0.032 * (i % 4 === 0 ? 1.3 : 1), (s % 2 ? 0.5 : -0.5), { cut: 2600, dec: 0.1, type: 'square' });
        } else if (arp === 'bellHalf' && [0, 3, 6, 10, 12].indexOf(i) >= 0) {
          bell(t, mtof(ch.arp[[0, 3, 6, 10, 12].indexOf(i)]), 0.06, (i % 2 ? 0.4 : -0.4), 0.9, { dest: arpBus, ratio: 3, index: 1.1, dly: 0.25 });
        } else if (arp === 'ep' && [0, 3, 6, 10, 12].indexOf(i) >= 0) {
          ch.pad.forEach((m, j) => bell(t + j * 0.012, mtof(m + 12), 0.035, -0.4 + j * 0.27, 1.1, { dest: arpBus, ratio: 1, index: 1.3, rev: 0.25 }));
        }
      });
    });
    // groove filter-downs & snaps (whole music bus)
    const mlp = musicLP.frequency;
    mlp.setValueAtTime(20000, 0);
    mlp.setValueAtTime(20000, 12.25); mlp.exponentialRampToValueAtTime(800, 12.5); mlp.setValueAtTime(800, 13.4); mlp.exponentialRampToValueAtTime(20000, 13.5);
    mlp.setValueAtTime(20000, 18.5); mlp.exponentialRampToValueAtTime(320, 20.0); mlp.setValueAtTime(20000, 20.02);
    mlp.setValueAtTime(1100, 22.0); mlp.setValueAtTime(1100, 22.98); mlp.exponentialRampToValueAtTime(20000, 23.0);
    mlp.setValueAtTime(20000, 44.95); mlp.exponentialRampToValueAtTime(650, 45.05); mlp.exponentialRampToValueAtTime(380, 45.5); mlp.setValueAtTime(20000, 46.0);
    // intro: kick/drums through a lowpass opening 300 Hz -> 3 kHz
    drumLP.frequency.setValueAtTime(300, 6.0); drumLP.frequency.exponentialRampToValueAtTime(3000, 9.95); drumLP.frequency.setValueAtTime(20000, 10.0);

    // ================================================================ SFX / CUES
    // (1) 0-2 NFT era: chiptune + stabs + vinyl scratches, tape-stop at 2.0
    {
      const g = G(0.85, musicPre);
      const lp = F('lowpass', 12000, 0.7, g);
      const s = SRC(chipB, 0, lp); s.stop(2.75);
      s.playbackRate.setValueAtTime(1, 2.0); s.playbackRate.linearRampToValueAtTime(0.03, 2.6);
      lp.frequency.setValueAtTime(12000, 2.0); lp.frequency.exponentialRampToValueAtTime(700, 2.6);
      g.gain.setValueAtTime(0.85, 2.4); g.gain.linearRampToValueAtTime(0, 2.62);
      CUES.nftSlams.forEach((t, i) => {
        scratch(t + 0.01, 0.32);
        kick(t, 0.55, { duck: false, dec: 0.25 });
        noiseBurst(t, 0.12, 6000, 1200, 0.12, { type: 'highpass', rev: 0.05, pan: i % 2 ? 0.3 : -0.3 });
      });
      // two scale beeps (2 kHz, 60 ms) on '0.00 g'
      [2.3, 2.6].forEach((t) => { tick(t, 2000, 0.14, 0, 0.06, 'square', { a: 0.002 }); tick(t, 2000, 0.12, 0, 0.06, 'sine'); });
    }
    // (2/3) 3.0-4.0 reverse whoosh + pixel gather + hydraulic hiss riser; die slams
    {
      whoosh(3.0, 0.62, 500, 6000, 0.42, -0.6, 0.2, { peak: 0.95, rev: 0.3 });
      for (let i = 0; i < 26; i++) {
        const u = i / 26, t = 3.0 + 0.6 * Math.sqrt(u) + rr(0, 0.02);
        tick(t, mtof(74 + Math.floor(u * 24) + [0, 3, 7][i % 3]), 0.05 + 0.04 * u, rr(-0.8, 0.8), 0.025, 'square');
      }
      whoosh(3.2, 0.8, 2500, 9000, 0.28, 0, 0, { type: 'highpass', q: 0.7, peak: 0.97, rev: 0.1 });
      whoosh(3.6, 0.4, 3000, 300, 0.35, 0, 0, { peak: 0.9, rev: 0.15 });
      // THE STRIKE at 4.0: 40 Hz thud + metallic transient + THE SILVER RING
      subDrop(4.0, 70, 40, 0.08, 1.0, 1.5);
      kick(4.0, 0.9, { duck: false, dec: 0.6 });
      [3150, 4720, 6930, 9810, 12400].forEach((f, i) => tick(4.0, f, 0.06 / (1 + i * 0.3), (i % 2 ? 0.3 : -0.3), 0.09, 'sine', { rev: 0.2 }));
      noiseBurst(4.0, 0.4, 9000, 1500, 0.12, { type: 'highpass', rev: 0.25, huge: 0.15 });
      silverRing(4.0, 1.0, 0, { huge: 0.15 });
      sparkle(4.05, 7, 0.5, 0.05, 0, 1, 2);
      // hydraulic release hiss as the die lifts
      whoosh(4.1, 0.5, 6000, 2500, 0.16, 0, 0, { type: 'highpass', q: 0.7, peak: 0.15, rev: 0.1 });
      // LCD digit roll 0.00 -> 31.10 g
      for (let i = 0; i < 16; i++) tick(4.1 + i * 0.025, 3300, 0.03, 0.15, 0.008, 'square');
      tick(4.52, 1760, 0.06, 0.15, 0.08, 'sine'); tick(4.6, 2349, 0.05, 0.15, 0.1, 'sine');
      // THE GOLD RING at 4.8
      thud(4.8, 98, 0.28, { slap: 0.3, rev: 0.2 });
      goldRing(4.8, 1.0, 0.25);
      for (let i = 0; i < 8; i++) tick(4.86 + i * 0.022, 3000, 0.022, 0.15, 0.008, 'square');
      // gold slides off, HUGINN spins (3 decelerating turns) and whips into the pack edge
      whoosh(5.2, 0.4, 800, 2400, 0.08, 0.2, 0.8, { rev: 0.1 });
      {
        const s = SRC(noiseB, 5.2, null, 1, 1.3); s.stop(5.9);
        const bp = F('bandpass', 1800, 1.6); s.connect(bp);
        const g = strip(sfx, { rev: 0.2 }); bp.connect(g);
        const N = 160, curve = new Float32Array(N);
        for (let i = 0; i < N; i++) { const u = i / (N - 1); const th = 6 * Math.PI * (1 - (1 - u) * (1 - u)); curve[i] = 0.2 * Math.pow(Math.abs(Math.sin(th)), 2) * (1 - 0.6 * u) + 0.0001; }
        g.gain.setValueCurveAtTime(curve, 5.2, 0.65);
        bp.frequency.setValueAtTime(2600, 5.2); bp.frequency.exponentialRampToValueAtTime(900, 5.85);
      }
      whoosh(5.82, 0.2, 1500, 9000, 0.45, -0.3, 0.3, { peak: 0.85, rev: 0.15 });
      // low drone under 4-6
      const dr = G(0, padBus); sustain(dr.gain, 4.0, 5.9, 0.08, 0.5, 0.1);
      OSC('sine', mtof(38), 4.0, 6.0, dr); OSC('triangle', mtof(50), 4.0, 6.0, G(0.3, dr));
    }
    // (4) 6-10 intro groove sfx
    {
      whoosh(5.95, 0.4, 600, 4000, 0.32, -0.7, 0.4, { peak: 0.25, rev: 0.25 });
      subDrop(6.0, 80, 36, 0.3, 0.55, 0.9);
      crash(6.0, 0.25);
      tick(6.2, 2349, 0.035, -0.6, 0.06, 'sine', { rev: 0.2 }); tick(6.26, 3136, 0.03, -0.6, 0.06, 'sine', { rev: 0.2 });
      [6.6, 7.6, 8.75].forEach((t) => chatPop(t, 0.07, 0.6));
      // foil-crinkle grains panned with the pack's specular sweeps
      [6.6, 8.9].forEach((t) => {
        play(crinkleSweep, t - 0.1, 0.16, { pan: null, rev: 0.25 });
        const g = strip(sfx, { pan: [-0.8, 0.8, t - 0.1, t + 0.6], rev: 0.2 }); g.gain.value = 0.2; SRC(crinkleSweep, t - 0.1, g);
        sparkle(t, 5, 0.5, 0.025, 0, 2, 3);
      });
      // the Gjallarhorn on EVERY PACK HITS
      horn(7.2, [38, 45, 50, 53, 57], 1.15, 0.05, { a: 0.3, cut: 1200, rev: 0.35, huge: 0.3, rel: 0.25 });
      subDrop(7.2, 60, 37, 0.2, 0.5, 1.2);
      crash(7.2, 0.18, { huge: 0.2 });
      // flip whip, stamp thud 'NO EMPTY PULLS', flip back
      whoosh(7.95, 0.35, 900, 5000, 0.3, 0.6, -0.6, { peak: 0.6 });
      thud(8.4, 62, 0.75, { slap: 0.7, rev: 0.25 });
      crash(8.4, 0.12);
      whoosh(9.35, 0.32, 900, 5000, 0.22, -0.6, 0.6, { peak: 0.6 });
    }
    // (5) 10-11.5 crinkle intensifies + Shepard riser; 11.5-12 TOTAL SILENCE
    {
      tick(10.0, 2600, 0.05, 0.5, 0.02, 'sine', { rev: 0.1 });
      play(crinkleRise, 9.95, 0.32, { pan: 0.35, rev: 0.2, stop: 11.5 });
      play(shep1, 10.0, 0.5, { rev: 0.2, stop: 11.5 });
      whoosh(10.0, 1.5, 300, 7000, 0.3, -0.2, 0.2, { peak: 0.99, q: 1.4, rev: 0.25 });
      for (let i = 0; i < 6; i++) tick(10.2 + i * 0.2, 1200 + i * 150, 0.02, -0.7, 0.03, 'sine');
      const sw = G(0, padBus); sustain(sw.gain, 10.0, 11.47, 0.06, 1.2, 0.02);
      OSC('sawtooth', mtof(33), 10.0, 11.5, F('lowpass', 300, 1, sw));
    }
    // (6) 12.0 DROP 1 — THE TEAR
    {
      const t = 12.0;
      const s = SRC(noiseB, t, null, 1, 0.7); s.stop(t + 0.4);
      const bp = F('bandpass', 2000, 1.4); bp.frequency.setValueAtTime(2000, t); bp.frequency.exponentialRampToValueAtTime(9000, t + 0.25);
      s.connect(bp); const g = strip(sfx, { rev: 0.25, huge: 0.2 }); bp.connect(g); perc(g.gain, t, 0.9, 0.002, 0.35);
      play(tearB, t, 0.9, { rev: 0.2, huge: 0.15 });
      subDrop(t, 110, 35, 0.5, 1.0, 1.6);
      kick(t, 1.0, { duck: false });
      crash(t, 0.7, { huge: 0.35 });
      noiseBurst(t, 0.4, 3000, 200, 0.4, { huge: 0.3 });
      thud(t, 55, 0.5, { slap: 0.5 });
      // (7) slow-motion: choir + stretched crash (0.5x) into the huge reverb + slowed boom
      choir(12.25, 13.35, [50, 57, 62, 65, 69], 0.11, { a: 0.4, r: 0.25 });
      crash(12.25, 0.22, { rate: 0.5, huge: 0.6, rev: 0 });
      subDrop(12.3, 60, 30, 0.8, 0.45, 1.2);
      { // shards shatter at 12.6 (slowed)
        for (let i = 0; i < 12; i++) bell(12.6 + rr(0, 0.35), mtof(86 + Math.floor(rr(0, 14))) * 0.5, 0.03, rr(-0.8, 0.8), 0.9, { ratio: 2.76, index: 0.4, huge: 0.4, rev: 0 });
      }
      // reverse cymbal ending exactly at 13.5 + whip whoosh + THE BIFROST CHORD (D-F-A-C-E)
      revCymbal(13.5, 1.0, 0.5);
      whoosh(13.38, 0.24, 700, 7000, 0.4, -0.5, 0.5, { peak: 0.5 });
      [74, 77, 81, 84, 88].forEach((m, i) => bell(13.5 + i * 0.09, mtof(m), 0.17, -0.8 + i * 0.4, 1.2, { ratio: 3, index: 1.4, rev: 0.35, dly: 0.15, huge: 0.15 }));
      subDrop(13.5, 90, 38, 0.3, 0.5, 0.8);
      noiseBurst(13.5, 0.15, 9000, 3000, 0.6, { type: 'highpass', rev: 0.4 });
      sparkle(13.55, 14, 0.5, 0.035, 0, 2, 3);
    }
    // (8) 14-20 tier escalation
    {
      // coin rides the bridge: doppler whoosh 0.6 s before each landing
      [[13.4, 0.3], [14.9, 0.34], [16.4, 0.4]].forEach(([t, v]) => {
        whoosh(t, 0.6, 700, 3800, v, -0.75, 0.05, { peak: 0.85, rev: 0.2 });
      });
      // SILVER 14.0: D5 ping + silver ring
      bell(14.0, mtof(74), 0.2, 0, 1.2, { ratio: 3, index: 1.2, rev: 0.3, dly: 0.15 });
      silverRing(14.0, 0.75, -0.1);
      sparkle(14.02, 5, 0.3, 0.03, 0, 2, 3);
      whoosh(14.0, 0.25, 4000, 900, 0.18, -0.9, -0.2, { peak: 0.2 }); // banner slam
      for (let i = 0; i < 12; i++) tick(14.2 + i * 0.028, 2900, 0.018, 0.4, 0.008, 'square');
      chatPop(14.6, 0.07); whoosh(14.6, 0.2, 2500, 900, 0.07, 0, 0.2, { peak: 0.3 });
      // RARE 15.5: F5 + sparkle layer, +2 dB (rim leak 0.25 s before)
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
      // docking clinks into the PULLS rail
      [14.85, 16.35, 17.85].forEach((t, i) => glassTick(t, mtof(86 + i * 2), 0.05, 0.0, { dec: 0.3 }));
      // 4th coin rides slowly while the groove filters down
      whoosh(18.5, 1.2, 500, 2200, 0.16, -0.75, 0.0, { peak: 0.75, rev: 0.3 });
    }
    // (9) 20.0 hard cut: heartbeat under a Shepard riser; 21.93-22.0 silence
    {
      CUES.heartbeats.forEach((t, i) => {
        heartbeat(t, 0.8 + 0.07 * i);
        whoosh(t, 0.5, 4000, 9000, 0.03 + 0.012 * i, 0, 0, { type: 'highpass', peak: 0.15, rev: 0.4 });
      });
      play(shep2, 20.0, 0.42, { rev: 0.2, stop: 21.93 });
      const dr = G(0, padBus); sustain(dr.gain, 20.0, 21.9, 0.07, 1.5, 0.02);
      const dlp = F('lowpass', 200, 1.5, dr); dlp.frequency.setValueAtTime(200, 20.0); dlp.frequency.exponentialRampToValueAtTime(900, 21.9);
      OSC('sawtooth', mtof(33), 20.0, 21.93, dlp); OSC('sawtooth', mtof(45), 20.0, 21.93, dlp).detune.value = 6;
      revCymbal(21.93, 0.9, 0.45, { cut: 21.93 });
      whoosh(20.9, 1.03, 300, 6000, 0.18, 0, 0, { peak: 0.99, q: 1.5, rev: 0.1 });
    }
    // (10) 22.0 DROP 2 — LEGENDARY
    {
      const t = 22.0;
      subDrop(t, 62, 40, 0.15, 1.0, 2.4);
      impact(t, 1.0, { huge: 0.4, crashV: 0.7 });
      horn(t, [38, 45, 50, 53, 57, 62], 0.95, 0.065, { a: 0.07, cut: 1600, rev: 0.4, huge: 0.5, rel: 0.12, scoop: 35 });
      choir(t, 23.0, [50, 57, 62, 65, 69, 74], 0.12, { a: 0.12, r: 0.1, huge: 0.6 });
      whoosh(22.2, 0.6, 1200, 8000, 0.14, -0.9, 0.9, { peak: 0.5, rev: 0.35, huge: 0.3 }); // anamorphic flare at 90deg
      tick(22.5, 2349, 0.05, 0, 0.6, 'sine', { rev: 0.5, f1: 4699 });
      // 23.0 snap -> D MAJOR lift (F -> F#)
      whoosh(22.82, 0.2, 800, 8000, 0.42, 0.4, -0.4, { peak: 0.85 });
      impact(23.0, 0.65, { huge: 0.25, crashV: 0.5, subDec: 1.0 });
      horn(23.0, [38, 45, 50, 54, 57, 62, 66], 0.55, 0.06, { a: 0.03, cut: 2000, rev: 0.35, huge: 0.3, rel: 0.25, scoop: 20 });
      choir(23.0, 24.6, [50, 57, 62, 66, 69, 74], 0.075, { a: 0.05, r: 0.8, huge: 0.45 });
      goldRing(23.0, 0.95, 0, { decay: 4.0, huge: 0.2 });
      sparkle(23.0, 18, 0.8, 0.04, 0, 2, 4);
      // '1 OF 25 · GOLD' punch
      thud(23.2, 73, 0.45, { slap: 0.4 });
      // engraving crackle 23.6-24.2
      play(engraveB, 23.6, 0.22, { pan: [-0.4, 0.4, 23.6, 24.2], rev: 0.25 });
      bell(24.22, mtof(98), 0.045, 0.4, 0.5, { ratio: 3.5, index: 0.5 });
      // AU odometer roll + ding
      for (let i = 0; i < 12; i++) tick(24.05 + i * 0.026, 2700, 0.018, -0.4, 0.008, 'square');
      bell(24.4, mtof(86), 0.09, -0.4, 1.0, { ratio: 3, index: 1.2, rev: 0.35 });
      // chat-pop storm (rate tied to the hype meter)
      let tt = 23.1; let k = 0;
      while (tt < 25.9) { chatPop(tt, 0.045 + 0.02 * rnd(), 0.35 + 0.4 * rnd()); tt += 0.13 - 0.07 * Math.min(1, (tt - 23.1) / 1.5) + rr(-0.02, 0.02); k++; }
      // key-light sweep during the beauty hold
      whoosh(24.7, 1.0, 3000, 9000, 0.05, -0.5, 0.5, { type: 'highpass', peak: 0.5, rev: 0.4 });
    }
    // (11) 26-30 data groove
    {
      whoosh(25.85, 0.26, 900, 6000, 0.38, 0.8, -0.8, { peak: 0.6 });
      for (let i = 0; i < 6; i++) tick(26.02 + i * 0.05, 3000 + i * 300, 0.03, 0.5, 0.02, 'sine', { rev: 0.15 });
      // hash blips: square 2 kHz, 20 ms, one per hash character (40 chars/s)
      for (let i = 0; i < 12; i++) tick(26.675 + i * 0.025, 2000, 0.045, 0.45, 0.02, 'square', { a: 0.001 });
      tick(27.25, 1760, 0.05, 0.45, 0.08, 'sine'); tick(27.31, 2637, 0.045, 0.45, 0.1, 'sine');
      // ascending D-pentatonic glass ticks per minted certificate
      [[26.3, 86], [26.8, 88], [27.0, 90], [27.2, 93]].forEach(([t, m], i) => glassTick(t, mtof(m), 0.09, -0.3 + i * 0.15, { dly: 0.15 }));
      [26.8, 27.0, 27.2].forEach((t) => whoosh(t - 0.35, 0.4, 1500, 5000, 0.06, -0.5, 0.2, { peak: 0.85 }));
      glassTick(27.45, mtof(93), 0.06, 0.45, { dec: 0.3 });
      // capsule drop, phone swoop, NFC two-tone, verified chime
      thud(28.0, 180, 0.22, { slap: 0.3, dec: 0.15 });
      whoosh(28.05, 0.5, 600, 3500, 0.22, 0.9, 0.1, { peak: 0.8 });
      tick(28.6, 1760, 0.16, 0.1, 0.09, 'sine', { a: 0.004, rev: 0.25 });
      tick(28.71, 2349, 0.16, 0.1, 0.12, 'sine', { a: 0.004, rev: 0.25 });
      [0, 0.12, 0.24].forEach((d) => whoosh(28.6 + d, 0.3, 4000, 7000, 0.025, 0, 0, { type: 'highpass', peak: 0.3, rev: 0.3 }));
      [86, 90, 93, 98].forEach((m, i) => bell(28.86 + i * 0.05, mtof(m), 0.07, -0.2 + i * 0.15, 1.0, { ratio: 3, index: 1.0, rev: 0.4, dly: 0.15 }));
    }
    // (12) 30-34 half-time: stamp thuds a step higher each, vault-door clunk at 32.9
    {
      whoosh(29.6, 0.42, 5000, 600, 0.2, 0, 0, { peak: 0.95, rev: 0.3 });
      whoosh(30.0, 0.6, 2000, 8000, 0.06, -0.8, 0.8, { type: 'highpass', peak: 0.5, rev: 0.4 }); // logo arc draws
      [30.35, 30.5, 30.65, 30.8].forEach((t, i) => tick(t, mtof(81 + [0, 2, 4, 7][i]), 0.035, [-0.6, 0.6, -0.3, 0.3][i], 0.08, 'sine', { rev: 0.3 }));
      const STAMP = [[31.0, 55, -0.6, 1.0], [31.5, 61.7, 0.6, 0.8], [32.0, 69.3, -0.3, 0.85], [32.5, 73.4, 0.3, 0.9]];
      STAMP.forEach(([t, f, p, v], i) => {
        thud(t, f, 0.85 * v, { slap: 0.8, rev: 0.25, pan: p * 0.4 });
        bell(t, f * 8, 0.05, p * 0.4, 0.5, { ratio: 1.5, index: 0.6, rev: 0.2 });
        whoosh(t + 0.05, 0.35, 2500, 700, 0.1, 0, p, { peak: 0.35 });
      });
      sparkle(31.02, 10, 0.4, 0.04, -0.4, 2, 3);
      // vault wheel ratchet -> clunk -> lock
      for (let i = 0; i < 7; i++) tick(32.62 + i * 0.04, 1900 + i * 60, 0.05, 0.3, 0.015, 'square', { rev: 0.1 });
      {
        const t = 32.9;
        subDrop(t, 70, 42, 0.12, 0.85, 1.2);
        [180, 287, 419, 610, 873, 1240].forEach((f, i) => {
          const g = strip(sfx, { rev: 0.3, huge: 0.35, pan: 0.2 }); perc(g.gain, t, 0.07 / (1 + i * 0.4), 0.002, 0.7 - i * 0.07); OSC('sine', f, t, t + 0.8, g);
        });
        noiseBurst(t, 0.45, 1400, 200, 0.16, { rev: 0.3, huge: 0.4 });
        const cg = G(0.6, sfx); SRC(clickB, t, cg); const cg2 = G(0.4, sfx); SRC(clickB, t + 0.045, cg2);
        kick(t, 0.7, { duck: true, depth: 0.4 });
        // SECURED IN LIECHTENSTEIN: deep resonant door swell + aurora shimmer
        const hum = G(0, padBus); sustain(hum.gain, 32.95, 33.8, 0.07, 0.4, 0.3);
        OSC('sawtooth', mtof(33), 32.95, 34.2, F('lowpass', 260, 2, hum));
        whoosh(33.0, 1.0, 4000, 9000, 0.05, -0.6, 0.6, { type: 'highpass', peak: 0.5, rev: 0.5, huge: 0.3 });
        sparkle(33.05, 8, 0.8, 0.03, 0, 2, 4);
      }
    }
    // (13) 34-38 warm: toast tink, swipe, capsule snap, seal slap, flaps, tape zip, label printer, door chime
    {
      whoosh(33.85, 0.26, 6000, 700, 0.32, 0, 0, { peak: 0.5 });
      // offer tink (glass, never a cash register)
      [[3520, 0.1], [8180, 0.035]].forEach(([f, v]) => tick(34.1, f, v, 0.2, 0.28, 'sine', { rev: 0.35, dly: 0.1 }));
      whoosh(34.4, 0.3, 900, 4000, 0.2, 0.0, 0.9, { peak: 0.5 });
      // capsule halves snap
      noiseBurst(34.6, 0.3, 2800, 2200, 0.025, { type: 'bandpass', q: 1.5, rev: 0.15 });
      tick(34.6, 1150, 0.08, 0, 0.03, 'triangle'); const cs = G(0.4, sfx); SRC(clickB, 34.6, cs);
      // NFC seal slap
      thud(35.0, 150, 0.32, { slap: 0.9, dec: 0.12, rev: 0.12 });
      bell(35.02, mtof(93), 0.03, 0.1, 0.4, { ratio: 3.5, index: 0.5 });
      thud(35.15, 90, 0.3, { slap: 0.4, dec: 0.2 });
      [35.3, 35.4, 35.5, 35.6].forEach((t, i) => noiseBurst(t, 0.22, 600, 150, 0.08, { rev: 0.1, pan: i % 2 ? 0.3 : -0.3 }));
      play(zipB, 35.62, 0.3, { pan: [-0.5, 0.5, 35.62, 35.95], rev: 0.15 });
      play(printerB, 35.8, 0.17, { pan: 0.15, rev: 0.1 });
      whoosh(36.6, 0.6, 800, 2500, 0.07, -0.6, 0.6, { peak: 0.6, rev: 0.3 }); // route draws
      // two-note door chime
      bell(37.2, mtof(78), 0.11, -0.1, 1.4, { ratio: 1.0, index: 0.8, rev: 0.4, a: 0.004 });
      bell(37.5, mtof(74), 0.11, 0.1, 1.6, { ratio: 1.0, index: 0.8, rev: 0.4, a: 0.004 });
      thud(37.6, 120, 0.15, { slap: 0.3, dec: 0.12 });
      tick(37.8, 1760, 0.05, 0.1, 0.05, 'sine'); tick(37.86, 2349, 0.05, 0.1, 0.07, 'sine');
    }
    // (14) 38.0 DROP 3 — brightest: horn countermelody, bids, escrow, release, royalties, confirmations
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
      tick(38.2, 2349, 0.05, 0.5, 0.06, 'sine'); tick(38.27, 2960, 0.05, 0.5, 0.08, 'sine'); // LISTED
      const CITY = [['Oslo', 10.75], ['Tokyo', 139.7], ['Sao Paulo', -46.6], ['Toronto', -79.4], ['Berlin', 13.4], ['Seoul', 127.0], ['Stockholm', 18.1]];
      const PENT = [74, 76, 78, 81, 83, 86, 88];
      CUES.bids.forEach((t, i) => {
        const pan = clamp(CITY[i][1] / 150, -0.9, 0.9);
        glassTick(t, mtof(PENT[i] + 12), 0.1, pan, { dec: 0.35, dly: 0.1 });
        whoosh(t, 0.25, 1500, 4000, 0.04, pan, 0.4, { peak: 0.6, rev: 0.2 });
      });
      // escrow latch at 41.0
      const lg = G(0.6, sfx); SRC(clickB, 41.0, lg); const lg2 = G(0.5, sfx); SRC(clickB, 41.055, lg2);
      tick(41.0, 2200, 0.08, 0.3, 0.08, 'triangle'); tick(41.055, 1650, 0.1, 0.3, 0.12, 'triangle', { rev: 0.2 });
      thud(41.055, 110, 0.35, { slap: 0.4, dec: 0.15 });
      [41.25, 41.6, 42.1].forEach((t, i) => tick(t, mtof(81 + i * 2), 0.04, 0.3, 0.05, 'sine'));
      // release two-tone A5 -> E6
      bell(42.6, 880, 0.12, 0.3, 0.8, { ratio: 3, index: 0.6, rev: 0.3 }); bell(42.72, 1318.5, 0.12, 0.3, 1.0, { ratio: 3, index: 0.6, rev: 0.3 });
      // descending royalty sparkle
      sparkle(43.0, 12, 0.48, 0.07, 0.4, 3, 1.5, { desc: true });
      whoosh(43.4, 0.5, 900, 4000, 0.12, -0.7, 0.7, { peak: 0.6 });
      for (let i = 0; i < 8; i++) glassTick(43.62 + i * 0.19, mtof([86, 90, 93, 88, 91, 95, 93, 98][i]), 0.06, (i % 2 ? 0.6 : -0.6), { dec: 0.3, dly: 0.08 });
    }
    // (15) 45.0 whip to centre, filtered half-bar, silence 45.5-46.0
    whoosh(44.86, 0.22, 6000, 900, 0.3, 0.5, 0, { peak: 0.5 });
    // (16) 46.0 DROP 4 on '80%'
    {
      const t = 46.0;
      impact(t, 1.0, { crashV: 0.75, huge: 0.3 });
      subDrop(t, 75, 37, 0.35, 0.6, 1.4);
      for (let i = 0; i < 8; i++) silverRing(t + 0.02 + i * 0.065, 0.42 * (1 - i * 0.05), (i % 2 ? 1 : -1) * (0.2 + 0.09 * i), { rev: 0.25, dly: 0.03 });
      // ring meter fill: rising sine resolving into a confirm chord at 46.5
      const sg = strip(sfx, { rev: 0.2 }); const so = OSC('sine', 440, t, 46.55, sg); so.frequency.exponentialRampToValueAtTime(1174.7, 46.5);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.07, 46.48); sg.gain.linearRampToValueAtTime(0, 46.53);
      [86, 90, 93, 98].forEach((m, i) => bell(46.5, mtof(m), 0.08, -0.45 + i * 0.3, 1.2, { ratio: 3, index: 1.0, rev: 0.35, dly: 0.12 }));
      thud(46.6, 73.4, 0.85, { slap: 0.9, rev: 0.25 }); // INSTANT stamp
      tick(47.0, 1760, 0.06, 0.2, 0.06, 'sine'); tick(47.07, 2349, 0.06, 0.2, 0.09, 'sine'); // SOLD BACK · CONFIRMED
      whoosh(47.15, 0.35, 3000, 900, 0.08, 0, 0.4, { peak: 0.4 });
      CUES.buybackTags.forEach((tt, i) => glassTick(tt, mtof([86, 88, 90, 93][i]), 0.08, -0.6 + i * 0.4, { dec: 0.35 }));
    }
    // (17) 50-52 double-time callback hits re-using tear / gold ring / offer tink / bid tick
    {
      // 50.0 tear
      const s = SRC(noiseB, 50.0, null, 1, 2.2); s.stop(50.4);
      const bp = F('bandpass', 2000, 1.4); bp.frequency.setValueAtTime(2000, 50.0); bp.frequency.exponentialRampToValueAtTime(9000, 50.25);
      s.connect(bp); const g = strip(sfx, { rev: 0.25 }); bp.connect(g); perc(g.gain, 50.0, 0.65, 0.002, 0.3);
      play(tearB, 50.0, 0.6, { rev: 0.2 });
      impact(50.0, 0.6, { crashV: 0.4, subDec: 0.5 });
      // 50.5 gold ring
      goldRing(50.5, 0.75, -0.3, { decay: 1.6 }); impact(50.5, 0.45, { crash: false, subDec: 0.4 });
      // 51.0 offer tink
      [[3520, 0.12], [8180, 0.04]].forEach(([f, v]) => tick(51.0, f, v, 0.3, 0.28, 'sine', { rev: 0.35, dly: 0.1 }));
      impact(51.0, 0.45, { crash: false, subDec: 0.4 });
      // 51.5 bid tick
      glassTick(51.5, mtof(88), 0.14, 0.5, { dec: 0.35 }); impact(51.5, 0.5, { crash: false, subDec: 0.4 });
      [50.42, 50.92, 51.42].forEach((t, i) => whoosh(t, 0.12, 900, 7000, 0.22, (i % 2 ? 0.6 : -0.6), (i % 2 ? -0.6 : 0.6), { peak: 0.8 }));
      // snare roll + riser into 52
      for (let i = 0; i < 8; i++) clap(51.0 + i * 0.0625, 0.18 + 0.05 * i, { rev: 0.1 });
      whoosh(51.0, 1.0, 400, 9000, 0.22, 0, 0, { peak: 0.99, q: 1.3 });
      revCymbal(52.0, 0.9, 0.4);
    }
    // (18) 52.0 final impact + THE BIFROST CHORD (D major) L -> R + silver ring at 52.92
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
      // single specular glint at 58.5 (dry, short — gone by 59.2)
      bell(58.5, 4186, 0.012, 0.2, 0.5, { ratio: 2.76, index: 0.3, rev: 0, dly: 0 });
    }

    // ---------------------------------------------------- sidechain duck
    duckTimes.sort((a, b) => a[0] - b[0]);
    duck.gain.setValueAtTime(1, 0);
    duckTimes.forEach(([t, depth]) => {
      duck.gain.setTargetAtTime(depth, t, 0.004);
      duck.gain.setTargetAtTime(1, t + 0.03, 0.085);
    });

    // ---------------------------------------------------- silences (hard gates on the final bus)
    const og = out.gain;
    og.setValueAtTime(1, 0);
    CUES.silences.forEach(([a, b]) => {
      og.setValueAtTime(1, a - 0.006); og.linearRampToValueAtTime(0, a);
      og.setValueAtTime(0, b - 0.0015); og.linearRampToValueAtTime(1, b);
    });
    og.setValueAtTime(1, Math.min(59.0, END - 1)); og.linearRampToValueAtTime(0, Math.min(59.8, END - 0.1));

    return ctx.startRendering();
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
  function limit(L, R, gain, ceil) {
    const n = L.length, oL = new Float32Array(n), oR = new Float32Array(n);
    for (let i = 0; i < n; i++) { oL[i] = L[i] * gain; oR[i] = R[i] * gain; }
    const thr = ceil * 0.55;
    const tl = tpTrack(oL, thr), tr = tpTrack(oR, thr);
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
  function master(buffer) {
    const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
    const ceil = Math.pow(10, CEIL_DBTP / 20);
    const l0 = integratedLUFS(L, R);
    let gain = Math.pow(10, (TARGET_LUFS - l0) / 20);
    let res = limit(L, R, gain, ceil);
    for (let it = 0; it < 2; it++) {
      const l1 = integratedLUFS(res[0], res[1]);
      if (Math.abs(l1 - TARGET_LUFS) < 0.05) break;
      gain *= Math.pow(10, (TARGET_LUFS - l1) / 20);
      res = limit(L, R, gain, ceil);
    }
    // final safety: hard ceiling on samples (never clip), and silence after 59.8 s
    const end = Math.round(59.8 * SR);
    for (let c = 0; c < 2; c++) {
      const src = res[c], dst = buffer.getChannelData(c);
      for (let i = 0; i < dst.length; i++) {
        let v = src[i];
        if (v > ceil) v = ceil; else if (v < -ceil) v = -ceil;
        dst[i] = i >= end ? 0 : v;
      }
    }
    buffer._bvStats = { inputLUFS: l0, gain: gain };
    return buffer;
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================
  let renderPromise = null;
  function render() {
    if (!renderPromise) {
      renderPromise = build().then(master).catch((e) => { renderPromise = null; throw e; });
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
  const live = { ctx: null, gain: null, src: null, startCtx: 0, offset: 0, wired: false, enabled: false, buffer: null };
  let muted = false;
  function srcPos() { return live.offset + (live.ctx.currentTime - live.startCtx); }
  function stopSrc() {
    if (live.src) { try { live.src.onended = null; live.src.stop(); } catch (e) { /* already stopped */ } try { live.src.disconnect(); } catch (e) { /* noop */ } live.src = null; }
  }
  function startAt(t) {
    stopSrc();
    if (!live.ctx || !live.buffer) return;
    t = Math.max(0, t || 0);
    if (t >= live.buffer.duration - 0.01) return;
    if (live.ctx.state === 'suspended') live.ctx.resume();
    const s = live.ctx.createBufferSource(); s.buffer = live.buffer; s.connect(live.gain);
    s.start(0, t); live.src = s; live.startCtx = live.ctx.currentTime; live.offset = t;
    s.onended = () => { if (live.src === s) live.src = null; };
  }
  function wire() {
    const BV = window.BV;
    if (live.wired || !BV || typeof BV.on !== 'function') return;
    live.wired = true;
    BV.on('play', () => { if (live.enabled) startAt(BV.t); });
    BV.on('pause', stopSrc);
    BV.on('end', stopSrc);
    BV.on('time', (tt) => {
      if (!live.enabled) return;
      const t = typeof tt === 'number' ? tt : BV.t;
      if (!BV.playing) { if (live.src) stopSrc(); return; }
      if (!live.src) { startAt(t); return; }
      if (Math.abs(srcPos() - t) > 0.25) startAt(t);
    });
    BV.on('format', () => { if (live.enabled && BV.playing) startAt(BV.t); else stopSrc(); });
  }
  function enable() {
    if (!live.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('WebAudio unavailable'));
      live.ctx = new AC({ latencyHint: 'playback' });
      live.gain = live.ctx.createGain(); live.gain.gain.value = muted ? 0 : 1; live.gain.connect(live.ctx.destination);
    }
    const resumed = live.ctx.state === 'suspended' ? live.ctx.resume().catch(() => {}) : Promise.resolve();
    return Promise.all([render(), resumed]).then(([b]) => {
      live.buffer = b; live.enabled = true; wire();
      const BV = window.BV;
      if (BV && BV.playing) startAt(BV.t);
    });
  }
  function setMuted(b) {
    muted = !!b;
    if (live.gain && live.ctx) live.gain.gain.setTargetAtTime(muted ? 0 : 1, live.ctx.currentTime, 0.015);
  }

  const api = {
    CUES: CUES,
    render: render,
    wav: wav,
    enable: enable,
    setMuted: setMuted,
    get muted() { return muted; },
    set muted(b) { setMuted(b); },
    get enabled() { return live.enabled; },
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
