/* ============================================================================
   pdfsign-core.js — shared, reusable PDF VIEWER + SIGNER (no backend, no keys).
     window.PdfView.open({ bytes|url, title, fileName, onDownload, onSign, onSend, sendLabel })
         → opens an in-site modal that VIEWS the PDF (native iframe), with a
           toolbar. Returns { close, setBytes(bytes) }.
     window.PdfSign.openSigner(bytes, { title, fileName, saveLabel, onSave })
         → opens a full signing surface (pdf.js render + draw/type/place signature),
           and on save calls onSave(signedBytes) — the caller decides what to do
           (download, or upload back to the invoice). Falls back to download if no
           onSave is given.
   Reuses the .psign-* styles from pdfsign.css; adds .pdfx-* shell styles in CSS.
   ========================================================================== */
(function () {
  const H = () => window.HELM;
  const toast = (m, t) => { try { H() && H().toast(m, t); } catch (e) {} };
  const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const PDFLIB_SRC = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some(s => s.src === src)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
  }
  let libsP = null;
  function ensureLibs() {
    if (libsP) return libsP;
    libsP = (async () => {
      if (!window.pdfjsLib) await loadScript(PDFJS_SRC);
      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      if (!window.PDFLib) await loadScript(PDFLIB_SRC);
    })();
    return libsP;
  }
  const toBytes = (b) => b instanceof Uint8Array ? b : new Uint8Array(b);
  function blobUrl(bytes) { return URL.createObjectURL(new Blob([toBytes(bytes)], { type: 'application/pdf' })); }
  function downloadBytes(bytes, name) {
    const url = blobUrl(bytes); const a = document.createElement('a'); a.href = url; a.download = name || 'document.pdf';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function trim(src) {
    const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (d[(y * w + x) * 4 + 3] > 12) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    if (!found) return src;
    const pad = 10; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
    const out = document.createElement('canvas'); out.width = Math.max(1, maxX - minX); out.height = Math.max(1, maxY - minY);
    out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height); return out;
  }
  function dataURLtoBytes(durl) { const b = atob(durl.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  /* ════════════════════════════════════════════════════════════════════════
     VIEWER
     ════════════════════════════════════════════════════════════════════════ */
  function openViewer(opts) {
    opts = opts || {};
    let curBytes = opts.bytes ? toBytes(opts.bytes) : null;
    let url = opts.url || (curBytes ? blobUrl(curBytes) : null);
    const ov = document.createElement('div'); ov.className = 'pdfx-overlay';
    ov.innerHTML = `
      <div class="pdfx-shell">
        <div class="pdfx-bar">
          <div class="pdfx-title">${esc(opts.title || 'PDF')}</div>
          <div class="pdfx-actions">
            ${opts.onSign ? '<button class="pdfx-btn" data-sign>✍ Sign</button>' : ''}
            ${opts.onSend ? '<button class="pdfx-btn go" data-send>' + esc(opts.sendLabel || 'Send') + '</button>' : ''}
            <button class="pdfx-btn" data-dl>⤓ Download</button>
            <button class="pdfx-btn" data-tab>↗ New tab</button>
            <button class="pdfx-btn ghost" data-x>✕ Close</button>
          </div>
        </div>
        <div class="pdfx-body"><iframe class="pdfx-frame" title="PDF"></iframe></div>
      </div>`;
    document.body.appendChild(ov);
    const frame = ov.querySelector('.pdfx-frame');
    const setSrc = (u) => { frame.src = u + '#toolbar=1&navpanes=0'; };
    if (url) setSrc(url);
    const close = () => { try { if (curBytes && url) URL.revokeObjectURL(url); } catch (e) {} ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('[data-x]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-dl]').addEventListener('click', () => { if (curBytes) downloadBytes(curBytes, opts.fileName); else if (url) window.open(url, '_blank', 'noopener'); });
    ov.querySelector('[data-tab]').addEventListener('click', () => { if (url) window.open(url, '_blank', 'noopener'); });
    const signBtn = ov.querySelector('[data-sign]');
    if (signBtn) signBtn.addEventListener('click', () => { if (opts.onSign) opts.onSign(curBytes, api); });
    const sendBtn = ov.querySelector('[data-send]');
    if (sendBtn) sendBtn.addEventListener('click', () => { if (opts.onSend) opts.onSend(curBytes, api); });
    const api = {
      close,
      setBytes(bytes) { try { if (curBytes && url) URL.revokeObjectURL(url); } catch (e) {} curBytes = toBytes(bytes); url = blobUrl(curBytes); setSrc(url); }
    };
    return api;
  }

  /* ════════════════════════════════════════════════════════════════════════
     SIGNER
     ════════════════════════════════════════════════════════════════════════ */
  async function openSigner(bytes, opts) {
    opts = opts || {};
    const state = { bytes: toBytes(bytes), fileName: opts.fileName || 'document.pdf', sigPng: null, sigAspect: 0.35, placements: [], placeMode: false, pageWraps: [] };
    const ov = document.createElement('div'); ov.className = 'pdfx-overlay signer';
    ov.innerHTML = `
      <div class="pdfx-shell">
        <div class="pdfx-bar">
          <div class="pdfx-title">${esc(opts.title || 'Sign document')}</div>
          <div class="pdfx-actions">
            <button class="pdfx-btn" data-sig>✍ Create signature</button>
            <button class="pdfx-btn" data-place disabled>📍 Place</button>
            <button class="pdfx-btn go" data-save disabled>${esc(opts.saveLabel || '✓ Save signed')}</button>
            <button class="pdfx-btn ghost" data-x>✕ Close</button>
          </div>
        </div>
        <div class="pdfx-hint" data-hint hidden></div>
        <div class="pdfx-body psign-doc" data-doc></div>
      </div>`;
    document.body.appendChild(ov);
    const docEl = ov.querySelector('[data-doc]'), hint = ov.querySelector('[data-hint]');
    const btnSig = ov.querySelector('[data-sig]'), btnPlace = ov.querySelector('[data-place]'), btnSave = ov.querySelector('[data-save]');
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('[data-x]').addEventListener('click', close);
    btnSig.addEventListener('click', openSigModal);
    btnPlace.addEventListener('click', togglePlace);
    btnSave.addEventListener('click', save);

    try { await ensureLibs(); await renderPdf(); }
    catch (e) { toast('Could not open signer: ' + e.message, 'danger'); close(); return; }

    async function renderPdf() {
      docEl.innerHTML = ''; state.pageWraps = [];
      const pdf = await window.pdfjsLib.getDocument({ data: state.bytes.slice() }).promise;
      const maxW = Math.min(820, docEl.clientWidth || 820);
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i);
        const scale = maxW / pg.getViewport({ scale: 1 }).width;
        const vp = pg.getViewport({ scale });
        const wrap = document.createElement('div'); wrap.className = 'psign-page';
        wrap.style.width = vp.width + 'px'; wrap.style.height = vp.height + 'px';
        const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
        wrap.appendChild(canvas); docEl.appendChild(wrap); state.pageWraps.push(wrap);
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        wrap.addEventListener('click', e => { if (state.placeMode && (e.target === wrap || e.target.tagName === 'CANVAS')) placeAt(wrap, e); });
      }
    }
    function openSigModal() {
      const m = document.createElement('div'); m.className = 'psign-modal';
      m.innerHTML = `
        <div class="psign-modal-box">
          <div class="psign-modal-head"><b>Create your signature</b><button class="psign-x" data-c>✕</button></div>
          <div class="psign-modal-tabs"><button class="psm-tab on" data-mode="draw">✍ Draw</button><button class="psm-tab" data-mode="type">⌨ Type</button></div>
          <div class="psign-pad" data-pane="draw"><canvas class="psign-canvas" width="620" height="200"></canvas></div>
          <div class="psign-pad" data-pane="type" hidden><input class="psign-typed" placeholder="Type your full name" /><div class="psign-typed-preview"></div></div>
          <div class="psign-modal-foot"><span class="psign-legal">Legal equivalent of your handwritten signature.</span><span class="row gap-sm"><button class="psign-btn ghost" data-clear>Clear</button><button class="psign-btn primary" data-use>Use signature</button></span></div>
        </div>`;
      ov.appendChild(m);
      const canvas = m.querySelector('.psign-canvas'), ctx = canvas.getContext('2d');
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1220';
      let drawing = false, last = null, has = false, mode = 'draw';
      const pos = e => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) }; };
      const start = e => { drawing = true; last = pos(e); e.preventDefault(); };
      const mv = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; has = true; e.preventDefault(); };
      const end = () => { drawing = false; };
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', mv); window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', mv, { passive: false }); canvas.addEventListener('touchend', end);
      const ti = m.querySelector('.psign-typed'), tp = m.querySelector('.psign-typed-preview');
      ti.addEventListener('input', () => { tp.textContent = ti.value; });
      m.querySelectorAll('.psm-tab').forEach(t => t.addEventListener('click', () => { mode = t.dataset.mode; m.querySelectorAll('.psm-tab').forEach(x => x.classList.toggle('on', x === t)); m.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== mode); }));
      m.querySelector('[data-clear]').addEventListener('click', () => { if (mode === 'draw') { ctx.clearRect(0, 0, canvas.width, canvas.height); has = false; } else { ti.value = ''; tp.textContent = ''; } });
      const cl = () => m.remove();
      m.querySelector('[data-c]').addEventListener('click', cl);
      m.addEventListener('click', e => { if (e.target === m) cl(); });
      m.querySelector('[data-use]').addEventListener('click', () => {
        let out;
        if (mode === 'draw') { if (!has) { toast('Draw your signature first', 'warn'); return; } out = trim(canvas); }
        else { const name = ti.value.trim(); if (!name) { toast('Type your name first', 'warn'); return; } const c = document.createElement('canvas'); c.width = 640; c.height = 200; const cx = c.getContext('2d'); cx.fillStyle = '#0b1220'; cx.textBaseline = 'middle'; cx.font = '70px "Segoe Script","Brush Script MT",cursive'; cx.fillText(name, 24, 104); out = trim(c); }
        state.sigPng = out.toDataURL('image/png'); state.sigAspect = out.height / out.width; cl();
        btnPlace.disabled = false; toast('Signature ready — click the document to place it', 'success');
        if (!state.placeMode) togglePlace();
      });
    }
    function togglePlace() {
      if (!state.sigPng) { openSigModal(); return; }
      state.placeMode = !state.placeMode; btnPlace.classList.toggle('on', state.placeMode); docEl.classList.toggle('placing', state.placeMode);
      hint.hidden = !state.placeMode; if (state.placeMode) hint.textContent = '📍 Click the document to drop your signature. Drag to move, −/+ to resize, ✕ to remove.';
    }
    function placeAt(wrap, e) {
      const r = wrap.getBoundingClientRect();
      const w0 = Math.min(200, wrap.clientWidth * 0.32), h0 = w0 * state.sigAspect;
      let x = e.clientX - r.left - w0 / 2, y = e.clientY - r.top - h0 / 2;
      x = Math.max(0, Math.min(wrap.clientWidth - w0, x)); y = Math.max(0, Math.min(wrap.clientHeight - h0, y));
      const el = document.createElement('div'); el.className = 'psign-sig';
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w0 + 'px'; el.style.height = h0 + 'px';
      el.innerHTML = `<img src="${state.sigPng}" draggable="false"/><div class="psign-sig-bar"><button data-a="sm">−</button><button data-a="lg">+</button><button data-a="rm">✕</button></div>`;
      wrap.appendChild(el);
      const pl = { pageIndex: state.pageWraps.indexOf(wrap), el, wrap }; state.placements.push(pl); makeDraggable(el, wrap);
      el.querySelector('[data-a="rm"]').addEventListener('click', ev => { ev.stopPropagation(); el.remove(); state.placements = state.placements.filter(p => p !== pl); upd(); });
      el.querySelector('[data-a="sm"]').addEventListener('click', ev => { ev.stopPropagation(); resizeEl(el, 0.85, wrap); });
      el.querySelector('[data-a="lg"]').addEventListener('click', ev => { ev.stopPropagation(); resizeEl(el, 1.18, wrap); });
      upd();
    }
    function resizeEl(el, f, wrap) { let w = el.offsetWidth * f; w = Math.max(40, Math.min(wrap.clientWidth, w)); el.style.width = w + 'px'; el.style.height = (w * state.sigAspect) + 'px'; }
    function makeDraggable(el, wrap) {
      let sx, sy, ox, oy, drag = false;
      el.addEventListener('mousedown', e => { if (e.target.closest('.psign-sig-bar')) return; drag = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; el.classList.add('drag'); e.preventDefault(); });
      window.addEventListener('mousemove', e => { if (!drag) return; let nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy); nx = Math.max(0, Math.min(wrap.clientWidth - el.offsetWidth, nx)); ny = Math.max(0, Math.min(wrap.clientHeight - el.offsetHeight, ny)); el.style.left = nx + 'px'; el.style.top = ny + 'px'; });
      window.addEventListener('mouseup', () => { if (drag) { drag = false; el.classList.remove('drag'); } });
    }
    function upd() { btnSave.disabled = state.placements.length === 0; }
    async function save() {
      if (!state.placements.length) { toast('Place your signature first', 'warn'); return; }
      try {
        const { PDFDocument } = window.PDFLib;
        const pdf = await PDFDocument.load(state.bytes);
        const png = await pdf.embedPng(dataURLtoBytes(state.sigPng));
        const pgs = pdf.getPages();
        state.placements.forEach(pl => {
          const p = pgs[pl.pageIndex]; if (!p) return; const sz = p.getSize();
          const cw = pl.wrap.clientWidth, ch = pl.wrap.clientHeight;
          const dw = (pl.el.offsetWidth / cw) * sz.width, dh = (pl.el.offsetHeight / ch) * sz.height;
          const x = (pl.el.offsetLeft / cw) * sz.width, y = sz.height - (pl.el.offsetTop / ch) * sz.height - dh;
          p.drawImage(png, { x, y, width: dw, height: dh });
        });
        const signed = await pdf.save();
        if (H() && H().audit) { try { H().audit.log({ action: 'doc.signed', entityType: 'Document', entityId: state.fileName, summary: ((H().session && H().session.user && H().session.user.name) || 'You') + ' signed "' + state.fileName + '"', after: { placements: state.placements.length }, module: 'sign' }); } catch (e) {} }
        close();
        if (opts.onSave) await opts.onSave(signed);
        else downloadBytes(signed, state.fileName.replace(/\.pdf$/i, '') + ' (signed).pdf');
        toast('Signed ✓', 'success');
      } catch (e) { toast('Sign failed: ' + e.message, 'danger'); }
    }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.PdfView = { open: openViewer };
  window.PdfSign = { openSigner, downloadBytes };
})();
