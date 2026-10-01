#!/usr/bin/env node
/*
 * tools/render-commercial.mjs - deterministic MP4 renderer for the Bifrost Vault commercial.
 *
 * Opens commercial/index.html?render=1&format=<f> in headless Chromium (Playwright), waits for
 * BV.ready, then for every frame i calls BV.seek(i / fps), screenshots the 1:1 logical stage and
 * pipes the images into ffmpeg (libx264, yuv420p, BT.709). The soundtrack comes from
 * BVAudio.wav() (offline render, base64 transfer) and is muxed as AAC 192k / 48 kHz.
 *
 * Usage:
 *   node tools/render-commercial.mjs                      # both cuts, full length
 *   node tools/render-commercial.mjs --format portrait    # 9:16 only
 *   node tools/render-commercial.mjs --from 18 --to 26    # preview slice -> *-preview.mp4
 *   node tools/render-commercial.mjs --stills "1.5,12,24.3" --format landscape
 *                                                        # PNGs in <out>/stills/<format>-<t>.png
 * Options:
 *   --format landscape|portrait|both   cut(s) to render (default both)
 *   --fps N                            frame rate (default BV.fps, else 30)
 *   --out DIR                          output directory (default commercial/dist)
 *   --from S / --to S                  render only [from, to) seconds; output gets a -preview suffix
 *   --stills "t1,t2,..."               save PNG stills at those times and exit (no video, no audio)
 *   --crf N                            x264 CRF (default 18)
 *   --preset NAME                      x264 preset (default slow)
 *   --no-audio                         render a silent video
 *   --no-poster                        skip poster-16x9.jpg / poster-9x16.jpg (end card, t = duration - 1.5)
 *   --image jpeg|png                   frame transport: jpeg q94 (default) or lossless png (slower)
 *   --quality N                        JPEG frame quality (default 94)
 *   --frames                           also write every frame to <out>/frames/<format>/NNNNNN.<ext>
 *   --verbose                          forward all page console output (errors/warnings always are)
 *   --url URL|PATH                     testing: render another page that implements the BV contract
 *
 * Outputs (in --out): bifrost-vault-commercial-16x9.mp4, bifrost-vault-commercial-9x16.mp4,
 *                     poster-16x9.jpg, poster-9x16.jpg
 * Requires: Node 18+, ffmpeg + ffprobe on PATH (or FFMPEG_PATH / FFPROBE_PATH), Playwright with
 * Chromium (bare 'playwright' or /opt/node-tools/node_modules/playwright). No npm dependencies.
 * Exit codes: 0 ok, 1 render failure, 2 usage error, 130 interrupted.
 */

import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fsp, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DEFAULT_PAGE = path.join(REPO, 'commercial', 'index.html');
const DEFAULT_OUT = path.join(REPO, 'commercial', 'dist');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const READY_TIMEOUT_MS = 120_000;
const SEEK_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 300_000;
const WAV_CHUNK = 3 * 1024 * 1024;
const POSTER_FROM_END = 1.5;
const FORMATS = {
  landscape: { W: 1920, H: 1080, tag: '16x9' },
  portrait: { W: 1080, H: 1920, tag: '9x16' },
};
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];
// Flags that keep Chromium output GPU-free, colour-managed as sRGB and identical run to run.
const CHROME_ARGS = [
  '--disable-gpu',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-checker-imaging',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion,PaintHolding',
  '--mute-audio',
  '--allow-file-access-from-files',
];

class UsageError extends Error {}

// ---------------------------------------------------------------------------------------------
// logging

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const warn = (...a) => process.stderr.write('[render] warning: ' + a.join(' ') + '\n');
const errln = (...a) => process.stderr.write(a.join(' ') + '\n');

function fmtDur(sec) {
  if (!isFinite(sec) || sec < 0) return '--';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}m` : m ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}
const fmtT = (t) => String(Number(Number(t).toFixed(3)));
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

// ---------------------------------------------------------------------------------------------
// CLI

const USAGE = `Usage: node tools/render-commercial.mjs [--format landscape|portrait|both] [--fps 30]
       [--out commercial/dist] [--from S] [--to S] [--stills "1.5,12"] [--crf 18] [--preset slow]
       [--no-audio] [--no-poster] [--image jpeg|png] [--quality 94] [--frames] [--verbose] [--url URL]`;

function parseArgs(argv) {
  const o = {
    format: 'both', fps: null, out: null, from: null, to: null, stills: null, crf: 18, preset: 'slow',
    audio: true, poster: true, image: 'jpeg', quality: 94, frames: false, verbose: false, url: null, help: false,
  };
  const valued = new Set(['format', 'fps', 'out', 'from', 'to', 'stills', 'crf', 'preset', 'image', 'quality', 'url']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '-h' || a === '--help') { o.help = true; continue; }
    if (!a.startsWith('--')) throw new UsageError(`unexpected argument "${a}"`);
    a = a.slice(2);
    let val = null;
    const eq = a.indexOf('=');
    if (eq >= 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    if (valued.has(a)) {
      if (val === null) {
        if (i + 1 >= argv.length) throw new UsageError(`--${a} needs a value`);
        val = argv[++i];
      }
    } else if (val !== null) {
      throw new UsageError(`--${a} does not take a value`);
    }
    const num = (name, v, lo, hi) => {
      const n = Number(v);
      if (v === '' || !Number.isFinite(n) || n < lo || n > hi) throw new UsageError(`--${name} must be a number in [${lo}, ${hi}], got "${v}"`);
      return n;
    };
    switch (a) {
      case 'format':
        if (!['landscape', 'portrait', 'both'].includes(val)) throw new UsageError(`--format must be landscape, portrait or both`);
        o.format = val; break;
      case 'fps': o.fps = num('fps', val, 1, 240); break;
      case 'out': o.out = path.resolve(val); break;
      case 'from': o.from = num('from', val, 0, 86400); break;
      case 'to': o.to = num('to', val, 0, 86400); break;
      case 'crf': o.crf = num('crf', val, 0, 51); break;
      case 'quality': o.quality = Math.round(num('quality', val, 1, 100)); break;
      case 'preset':
        if (!PRESETS.includes(val)) throw new UsageError(`--preset must be one of ${PRESETS.join(', ')}`);
        o.preset = val; break;
      case 'image':
        if (!['jpeg', 'jpg', 'png'].includes(val)) throw new UsageError(`--image must be jpeg or png`);
        o.image = val === 'png' ? 'png' : 'jpeg'; break;
      case 'stills': {
        const ts = String(val).split(/[,\s]+/).filter(Boolean).map((s) => num('stills', s, 0, 86400));
        if (!ts.length) throw new UsageError('--stills needs at least one time, e.g. --stills "1.5,12"');
        o.stills = ts; break;
      }
      case 'url': o.url = val; break;
      case 'no-audio': o.audio = false; break;
      case 'no-poster': o.poster = false; break;
      case 'frames': o.frames = true; break;
      case 'verbose': o.verbose = true; break;
      default: throw new UsageError(`unknown option --${a}`);
    }
  }
  if (o.from != null && o.to != null && o.to <= o.from) throw new UsageError(`--to (${o.to}) must be greater than --from (${o.from})`);
  o.out = o.out || DEFAULT_OUT;
  o.formats = o.format === 'both' ? ['landscape', 'portrait'] : [o.format];
  o.preview = o.from != null || o.to != null;
  return o;
}

// ---------------------------------------------------------------------------------------------
// cleanup / signals

const cleanups = [];
let cleaning = null;
function runCleanups() {
  if (!cleaning) {
    cleaning = (async () => {
      while (cleanups.length) {
        const fn = cleanups.pop();
        try { await fn(); } catch { /* best effort */ }
      }
    })();
  }
  return cleaning;
}
function defer(fn) { cleanups.push(fn); return () => { const i = cleanups.indexOf(fn); if (i >= 0) cleanups.splice(i, 1); }; }

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    errln(`\n[render] ${sig} received, cleaning up...`);
    await runCleanups();
    process.exit(130);
  });
}

// ---------------------------------------------------------------------------------------------
// dependencies

function loadPlaywright() {
  const tried = [];
  for (const id of ['playwright', '/opt/node-tools/node_modules/playwright', 'playwright-core']) {
    try {
      const pw = require(id);
      if (pw && pw.chromium) return pw;
      tried.push(`${id}: no chromium export`);
    } catch (e) {
      tried.push(`${id}: ${e.code || e.message}`);
    }
  }
  throw new Error('Playwright not found. Tried:\n  ' + tried.join('\n  ') +
    '\nInstall it globally or make /opt/node-tools/node_modules/playwright available.');
}

function checkBinary(bin, label) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(`${label} not usable (${bin}): ${r.error ? r.error.message : (r.stderr || '').trim().split('\n')[0]}. ` +
      `Install ffmpeg or set ${label === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'}.`);
  }
  return true;
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------------------------
// network bridge: when an HTTPS proxy is configured (corporate / sandbox egress with its own CA),
// Chromium may not trust the proxy CA. Remote requests (Google Fonts) are then fetched by Node,
// which honours HTTPS_PROXY + NODE_EXTRA_CA_CERTS with normal TLS verification, and cached per run.

const netCache = new Map();
const netWarned = new Set();
async function installNetBridge(context) {
  await context.route(/^https?:\/\//i, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.continue();
    try {
      let hit = netCache.get(url);
      if (!hit) {
        const resp = await route.fetch({ timeout: 45_000 });
        const headers = { ...resp.headers() };
        delete headers['content-encoding'];
        delete headers['content-length'];
        delete headers['transfer-encoding'];
        hit = { status: resp.status(), headers, body: await resp.body() };
        if (hit.status < 400) netCache.set(url, hit);
      }
      await route.fulfill(hit);
    } catch (e) {
      const host = (() => { try { return new URL(url).host; } catch { return url; } })();
      if (!netWarned.has(host)) { netWarned.add(host); warn(`could not fetch ${host} (${e.message.split('\n')[0]}); fonts/assets from it will fall back`); }
      await route.abort('failed').catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------------------------
// film session: one browser context + page per format

async function openFilm(browser, format, opts) {
  const spec = FORMATS[format];
  const context = await browser.newContext({
    viewport: { width: spec.W, height: spec.H },
    screen: { width: spec.W, height: spec.H },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  const undefer = defer(() => context.close());
  const bridged = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
  if (bridged) await installNetBridge(context);
  const page = await context.newPage();
  const tag = `[page:${format}]`;

  // Fail loudly: any uncaught page exception / crash aborts the render.
  let fatal = null;
  let rejectFatal;
  const fatalP = new Promise((_, rej) => { rejectFatal = rej; });
  fatalP.catch(() => {});
  const setFatal = (e) => { if (!fatal) { fatal = e; rejectFatal(e); } };
  page.on('pageerror', (e) => {
    errln(`${tag} UNCAUGHT ${e && e.stack ? e.stack : e}`);
    setFatal(new Error(`page error: ${e && e.message ? e.message : e}`));
  });
  page.on('crash', () => setFatal(new Error('page crashed (out of memory?)')));
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning' || opts.verbose) {
      const loc = msg.location();
      const where = loc && loc.url ? ` (${loc.url.replace(/^.*\/commercial\//, 'commercial/')}:${loc.lineNumber})` : '';
      errln(`${tag} console.${type}: ${msg.text()}${where}`);
    }
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (bridged && /^https?:/i.test(u)) return; // the network bridge reports its own failures
    errln(`${tag} request failed: ${u.length > 160 ? u.slice(0, 160) + '...' : u} (${req.failure() ? req.failure().errorText : '?'})`);
  });
  const guard = (p) => Promise.race([p, fatalP]);

  // Build URL
  let url;
  if (opts.url) {
    url = /^[a-z][a-z0-9+.-]*:/i.test(opts.url) ? new URL(opts.url) : pathToFileURL(path.resolve(opts.url));
  } else {
    if (!existsSync(DEFAULT_PAGE)) throw new Error(`film page not found: ${DEFAULT_PAGE}`);
    url = pathToFileURL(DEFAULT_PAGE);
  }
  url.searchParams.set('render', '1');
  url.searchParams.set('format', format);

  const t0 = Date.now();
  await guard(page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: READY_TIMEOUT_MS }));
  try {
    await guard(page.waitForFunction(() => !!(window.BV && window.BV.ready), null, { timeout: READY_TIMEOUT_MS, polling: 100 }));
  } catch (e) {
    if (fatal) throw fatal;
    throw new Error(`window.BV / BV.ready never appeared within ${READY_TIMEOUT_MS / 1000}s at ${url.href} (${e.message.split('\n')[0]})`);
  }
  const left = Math.max(1000, READY_TIMEOUT_MS - (Date.now() - t0));
  await guard(withTimeout(page.evaluate(() => Promise.resolve(window.BV.ready).then(() => true)), left, 'BV.ready'));
  if (fatal) throw fatal;

  const readInfo = () => page.evaluate(() => {
    const BV = window.BV;
    const root = BV.root || document.getElementById('bv-stage');
    const r = root ? root.getBoundingClientRect() : null;
    const fams = {};
    if (document.fonts) document.fonts.forEach((f) => {
      const k = f.family.replace(/["']/g, '');
      const e = (fams[k] = fams[k] || { loaded: 0, error: 0, total: 0 });
      e.total++; if (f.status === 'loaded') e.loaded++; if (f.status === 'error') e.error++;
    });
    return {
      W: BV.W, H: BV.H, duration: BV.duration, fps: BV.fps, render: BV.render, portrait: !!BV.portrait,
      canSetFormat: typeof BV.setFormat === 'function',
      hasAudio: typeof window.BVAudio !== 'undefined' && window.BVAudio && typeof window.BVAudio.wav === 'function',
      rect: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null,
      vw: window.innerWidth, vh: window.innerHeight, fonts: fams,
    };
  });

  let info = await readInfo();
  if (info.portrait !== (format === 'portrait')) {
    if (!info.canSetFormat) throw new Error(`page ignored ?format=${format} and has no BV.setFormat()`);
    warn(`page did not honour ?format=${format}; calling BV.setFormat`);
    await guard(page.evaluate((f) => Promise.resolve(window.BV.setFormat(f)).then(() => window.BV.ready).then(() => 0), format));
    info = await readInfo();
  }
  if (!(info.W > 0 && info.H > 0) || !Number.isFinite(info.W) || !Number.isFinite(info.H)) throw new Error(`invalid BV.W/BV.H: ${info.W}x${info.H}`);
  if (!(info.duration > 0) || !Number.isFinite(info.duration)) throw new Error(`invalid BV.duration: ${info.duration}`);
  if (info.W % 2 || info.H % 2) throw new Error(`stage ${info.W}x${info.H} must have even dimensions for yuv420p`);
  if (info.render !== true) warn('BV.render is not true - is ?render=1 honoured? UI or autoplay may leak into frames');
  if (info.W !== spec.W || info.H !== spec.H) warn(`stage is ${info.W}x${info.H}, expected ${spec.W}x${spec.H} for ${format}`);
  if (info.vw !== info.W || info.vh !== info.H) {
    await page.setViewportSize({ width: info.W, height: info.H });
    await guard(page.evaluate((t) => { const r = window.BV.seek(t); return Promise.resolve(r).then(() => 0); }, 0));
    info = await readInfo();
  }

  // The stage must sit 1:1 at the viewport origin. If the page letterboxes/scales it, pin it.
  const stageOk = (i) => i.rect && Math.abs(i.rect.x) < 0.5 && Math.abs(i.rect.y) < 0.5 &&
    Math.abs(i.rect.w - i.W) < 0.5 && Math.abs(i.rect.h - i.H) < 0.5;
  if (!info.rect) throw new Error('no stage element (BV.root / #bv-stage) found');
  if (!stageOk(info)) {
    warn(`stage rect is ${JSON.stringify(info.rect)} (expected 0,0 ${info.W}x${info.H}); pinning it`);
    await page.addStyleTag({ content: '#bv-stage{position:fixed!important;left:0!important;top:0!important;margin:0!important;transform:none!important;}' });
    info = await readInfo();
    if (!stageOk(info)) throw new Error(`stage is not ${info.W}x${info.H} at the viewport origin: ${JSON.stringify(info.rect)}`);
  }

  // Font report: a family whose faces all failed renders in a fallback font.
  const fontLines = [];
  for (const [fam, s] of Object.entries(info.fonts)) {
    if (s.loaded === 0 && s.error > 0) warn(`font "${fam}" failed to load (${s.error}/${s.total} faces errored) - text will use a fallback font`);
    fontLines.push(`${fam} ${s.loaded ? 'ok' : s.error ? 'FAILED' : 'unused'}`);
  }

  const clip = { x: 0, y: 0, width: info.W, height: info.H };
  const seek = async (t) => {
    const n = await guard(withTimeout(page.evaluate(async (tt) => {
      const r = window.BV.seek(tt);
      if (r && typeof r.then === 'function') await r;
      // Never capture a frame with an undecoded image (new src set during seek).
      const pending = [];
      const imgs = document.images;
      for (let k = 0; k < imgs.length; k++) {
        const im = imgs[k];
        if (!im.complete) pending.push(im.decode().catch(() => {}));
      }
      if (pending.length) await Promise.race([Promise.all(pending), new Promise((res) => setTimeout(res, 10000))]);
      if (document.fonts && document.fonts.status !== 'loaded') await document.fonts.ready;
      return pending.length;
    }, t), SEEK_TIMEOUT_MS, `BV.seek(${fmtT(t)})`));
    if (fatal) throw fatal;
    return n;
  };
  const shot = async (type, quality) => {
    const o = { type, clip, animations: 'allow', caret: 'hide', scale: 'css', timeout: 60_000 };
    if (type === 'jpeg') o.quality = quality;
    const buf = await guard(page.screenshot(o));
    if (fatal) throw fatal;
    return buf;
  };
  const close = async () => { undefer(); await context.close().catch(() => {}); };

  return { format, spec, page, info, fontLines, seek, shot, close, guard, url: url.href, loadMs: Date.now() - t0 };
}

// ---------------------------------------------------------------------------------------------
// audio

async function fetchWav(film, tmpDir) {
  const t0 = Date.now();
  const n = await film.guard(withTimeout(film.page.evaluate(async () => {
    let ab = await window.BVAudio.wav();
    if (typeof Blob !== 'undefined' && ab instanceof Blob) ab = await ab.arrayBuffer();
    if (ab && ArrayBuffer.isView(ab)) ab = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
    if (!(ab instanceof ArrayBuffer)) throw new Error('BVAudio.wav() did not resolve to an ArrayBuffer');
    window.__bvWavBytes = new Uint8Array(ab);
    return ab.byteLength;
  }), AUDIO_TIMEOUT_MS, 'BVAudio.wav()'));
  const parts = [];
  for (let off = 0; off < n; off += WAV_CHUNK) {
    const b64 = await film.page.evaluate(([o, len]) => {
      const u = window.__bvWavBytes.subarray(o, o + len);
      let s = '';
      for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
      return btoa(s);
    }, [off, WAV_CHUNK]);
    parts.push(Buffer.from(b64, 'base64'));
  }
  await film.page.evaluate(() => { delete window.__bvWavBytes; });
  const buf = Buffer.concat(parts);
  if (buf.length !== n) throw new Error(`WAV transfer size mismatch (${buf.length} != ${n})`);
  const meta = parseWav(buf);
  const file = path.join(tmpDir, 'soundtrack.wav');
  await fsp.writeFile(file, buf);
  log(`[audio] BVAudio.wav(): ${mb(n)}, ${meta.sampleRate} Hz, ${meta.channels} ch, ${meta.bits}-bit, ${meta.duration.toFixed(2)}s (${fmtDur((Date.now() - t0) / 1000)})`);
  return { file, ...meta };
}

function parseWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('BVAudio.wav() did not return a RIFF/WAVE file');
  }
  let off = 12, fmt = null, dataLen = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), byteRate: buf.readUInt32LE(off + 16), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { dataLen = Math.min(len, buf.length - off - 8); break; }
    off += 8 + len + (len & 1);
  }
  if (!fmt || dataLen == null) throw new Error('WAV from BVAudio.wav() is missing its fmt/data chunk');
  return { ...fmt, duration: fmt.byteRate ? dataLen / fmt.byteRate : 0 };
}

// ---------------------------------------------------------------------------------------------
// ffmpeg sink

class FFmpegSink {
  constructor(args, label) {
    this.label = label;
    this.stderr = '';
    this.exited = false;
    this.code = null;
    this.proc = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-20000); });
    this.stdinError = null;
    this.proc.stdin.on('error', (e) => { this.stdinError = e; });
    this.done = new Promise((resolve) => {
      this.proc.on('error', (e) => { this.spawnError = e; this.exited = true; resolve(); });
      this.proc.on('close', (code, signal) => { this.exited = true; this.code = code; this.signal = signal; resolve(); });
    });
  }
  failure() {
    if (this.spawnError) return new Error(`could not start ffmpeg: ${this.spawnError.message}`);
    const tail = this.stderr.trim().split('\n').slice(-25).join('\n    ');
    return new Error(`ffmpeg (${this.label}) exited with ${this.signal || this.code}${tail ? ':\n    ' + tail : ''}`);
  }
  async write(buf) {
    if (this.exited) throw this.failure();
    if (this.proc.stdin.write(buf)) return;
    await Promise.race([
      new Promise((res) => this.proc.stdin.once('drain', res)),
      this.done.then(() => { throw this.failure(); }),
    ]);
  }
  async finish() {
    if (!this.exited) this.proc.stdin.end();
    await this.done;
    if (this.spawnError || this.code !== 0) throw this.failure();
    return this.stderr;
  }
  kill() { if (!this.exited) { try { this.proc.kill('SIGKILL'); } catch { /* gone */ } } }
}

function ffprobe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-count_packets', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_packets,duration,sample_rate,channels:format=duration,size',
    '-of', 'json', file], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// ---------------------------------------------------------------------------------------------
// render modes

async function renderStills(film, opts, fps) {
  const dir = path.join(opts.out, 'stills');
  await fsp.mkdir(dir, { recursive: true });
  const { duration } = film.info;
  for (const t0 of opts.stills) {
    let t = t0;
    if (t >= duration) { t = Math.max(0, duration - 1 / fps); warn(`still ${fmtT(t0)}s is past the end (${duration}s); using ${fmtT(t)}s`); }
    await film.seek(t);
    const buf = await film.shot('png');
    const file = path.join(dir, `${film.format}-${fmtT(t0)}.png`);
    await fsp.writeFile(file, buf);
    log(`[stills] ${path.relative(process.cwd(), file) || file}  (t=${fmtT(t)}s, ${film.info.W}x${film.info.H})`);
  }
}

async function renderVideo(film, opts, fps, wav) {
  const { duration, W, H } = film.info;
  const from = opts.from != null ? opts.from : 0;
  let to = opts.to != null ? opts.to : duration;
  if (from >= duration) throw new UsageError(`--from ${from} is not before the film end (${duration}s)`);
  if (to > duration) { if (opts.to != null) warn(`--to ${opts.to} clamped to duration ${duration}`); to = duration; }
  const f0 = Math.round(from * fps);
  const f1 = Math.round(to * fps);
  const total = f1 - f0;
  if (total <= 0) throw new UsageError(`nothing to render between ${from}s and ${to}s at ${fps} fps`);
  const segStart = f0 / fps;
  const segDur = total / fps;

  await fsp.mkdir(opts.out, { recursive: true });
  const name = `bifrost-vault-commercial-${film.spec.tag}${opts.preview ? '-preview' : ''}.mp4`;
  const finalPath = path.join(opts.out, name);
  const partPath = path.join(opts.out, `.${name.replace(/\.mp4$/, '')}.partial.${process.pid}.mp4`);
  let frameDir = null;
  if (opts.frames) {
    frameDir = path.join(opts.out, 'frames', film.format);
    await fsp.mkdir(frameDir, { recursive: true });
  }

  const input = opts.image === 'png'
    ? ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0']
    : ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0'];
  // Screenshots are sRGB. Go through RGB explicitly so the encode is true BT.709 limited range
  // (JPEG frames decode as full-range BT.601 YCbCr; swscale cannot change matrix YUV->YUV).
  const vf = opts.image === 'png'
    ? 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p'
    : 'scale=in_color_matrix=bt601:in_range=full:flags=accurate_rnd+full_chroma_int,format=gbrp,' +
      'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p';
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-y', ...input];
  if (wav) args.push('-ss', segStart.toFixed(6), '-t', segDur.toFixed(6), '-i', wav.file);
  args.push('-map', '0:v:0');
  if (wav) args.push('-map', '1:a:0');
  args.push('-vf', vf, '-c:v', 'libx264', '-preset', opts.preset, '-crf', String(opts.crf), '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  if (wav) args.push('-af', `apad=whole_dur=${segDur.toFixed(6)}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-f', 'mp4', partPath);

  log(`[${film.format}] rendering ${W}x${H} @ ${fps} fps, frames ${f0}..${f1 - 1} (${total}, t=${fmtT(segStart)}..${fmtT(to)}s), ` +
    `${opts.image} -> x264 crf ${opts.crf} ${opts.preset}${wav ? ' + AAC 192k' : ', silent'}`);
  const sink = new FFmpegSink(args, film.format);
  const undefer = defer(async () => { sink.kill(); await fsp.rm(partPath, { force: true }); });

  const t0 = Date.now();
  const ext = opts.image === 'png' ? 'png' : 'jpg';
  let undecodedFrames = 0;
  try {
    for (let i = f0; i < f1; i++) {
      if (await film.seek(i / fps)) undecodedFrames++;
      const buf = await film.shot(opts.image, opts.quality);
      await sink.write(buf);
      if (frameDir) await fsp.writeFile(path.join(frameDir, `${String(i).padStart(6, '0')}.${ext}`), buf);
      const done = i - f0 + 1;
      if (done % 30 === 0 || done === total) {
        const el = (Date.now() - t0) / 1000;
        const rate = done / el;
        log(`[${film.format}] frame ${String(done).padStart(String(total).length)}/${total} ` +
          `${(100 * done / total).toFixed(1).padStart(5)}%  t=${(i / fps).toFixed(2)}s  ${rate.toFixed(1)} fps  ` +
          `elapsed ${fmtDur(el)}  ETA ${fmtDur((total - done) / rate)}`);
      }
    }
    log(`[${film.format}] frames captured, finishing encode...`);
    const ffWarn = (await sink.finish()).trim();
    if (ffWarn) warn(`ffmpeg (${film.format}) said:\n    ` + ffWarn.split('\n').slice(-10).join('\n    '));
    await fsp.rename(partPath, finalPath);
  } catch (e) {
    sink.kill();
    await fsp.rm(partPath, { force: true });
    throw e;
  } finally {
    undefer();
  }
  if (undecodedFrames) warn(`${undecodedFrames} frame(s) had images still decoding after BV.seek (waited for them)`);

  const el = (Date.now() - t0) / 1000;
  const st = await fsp.stat(finalPath);
  log(`[${film.format}] wrote ${path.relative(process.cwd(), finalPath) || finalPath}  ${mb(st.size)}  ${segDur.toFixed(3)}s  ` +
    `${total} frames in ${fmtDur(el)} (${(total / el).toFixed(1)} fps)`);
  const probe = ffprobe(finalPath);
  if (probe) {
    const v = probe.streams.find((s) => s.codec_type === 'video');
    const a = probe.streams.find((s) => s.codec_type === 'audio');
    log(`[${film.format}] ffprobe: video ${v ? `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate} ${v.nb_read_packets} frames` : 'MISSING'}` +
      `; audio ${a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch ${Number(a.duration).toFixed(3)}s` : 'none'}` +
      `; container ${Number(probe.format.duration).toFixed(3)}s`);
    if (!v || Number(v.nb_read_packets) !== total) throw new Error(`encoded frame count ${v ? v.nb_read_packets : 0} != ${total}`);
    if (wav && !a) throw new Error('audio stream missing from output');
  }
  return finalPath;
}

async function renderPoster(film) {
  const t = Math.max(0, film.info.duration - POSTER_FROM_END);
  await film.seek(t);
  const buf = await film.shot('jpeg', 95);
  const file = path.join(film.opts.out, `poster-${film.spec.tag}.jpg`);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, buf);
  log(`[${film.format}] poster ${path.relative(process.cwd(), file) || file} (t=${fmtT(t)}s)`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    errln(`[render] ${e.message}\n${USAGE}`);
    return 2;
  }
  if (opts.help) { log(USAGE); return 0; }

  const started = Date.now();
  const pw = loadPlaywright();
  if (!opts.stills) { checkBinary(FFMPEG, 'ffmpeg'); }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bv-render-'));
  defer(() => fsp.rm(tmpDir, { recursive: true, force: true }));

  const launch = { headless: true, args: CHROME_ARGS };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) launch.proxy = { server: proxy, bypass: 'localhost,127.0.0.1,::1' };
  const browser = await pw.chromium.launch(launch);
  defer(() => browser.close());
  log(`[render] Chromium ${browser.version()} | out ${opts.out}${opts.url ? ` | url override ${opts.url}` : ''}`);

  let wav = null;
  let audioDecided = !opts.audio || !!opts.stills;
  const outputs = [];
  for (const format of opts.formats) {
    const film = await openFilm(browser, format, opts);
    film.opts = opts;
    try {
      const fps = opts.fps || (Number(film.info.fps) > 0 ? Number(film.info.fps) : 30);
      log(`[${format}] ready in ${fmtDur(film.loadMs / 1000)}: ${film.info.W}x${film.info.H}, ${film.info.duration}s, ${fps} fps` +
        (film.fontLines.length ? ` | fonts: ${film.fontLines.join(', ')}` : ''));
      if (opts.stills) {
        await renderStills(film, opts, fps);
        continue;
      }
      if (!audioDecided) {
        audioDecided = true;
        if (film.info.hasAudio) {
          wav = await fetchWav(film, tmpDir);
          if (Math.abs(wav.duration - film.info.duration) > 0.1) warn(`soundtrack is ${wav.duration.toFixed(2)}s, film is ${film.info.duration}s (padded/trimmed to video)`);
        } else {
          warn('window.BVAudio.wav is not available - rendering SILENT video');
        }
      }
      outputs.push(await renderVideo(film, opts, fps, wav));
      if (opts.poster) await renderPoster(film);
    } finally {
      await film.close();
    }
  }
  if (outputs.length) log(`[render] done in ${fmtDur((Date.now() - started) / 1000)}:\n  ` + outputs.join('\n  '));
  else log(`[render] done in ${fmtDur((Date.now() - started) / 1000)}`);
  return 0;
}

main()
  .then(async (code) => { await runCleanups(); process.exit(code); })
  .catch(async (e) => {
    errln(`[render] FAILED: ${e && e.stack && !(e instanceof UsageError) && process.env.BV_RENDER_DEBUG ? e.stack : (e && e.message) || e}`);
    await runCleanups();
    process.exit(e instanceof UsageError ? 2 : 1);
  });
