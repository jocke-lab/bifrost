/* ============================================================================
   pdfsign.js — "Sign PDF": read & sign REAL PDFs, fully client-side.
   pdf.js renders the document, pdf-lib stamps the signature and exports a real
   signed PDF. No backend, no keys — the file never leaves the browser.
   (Saving signed copies into the Vault / Supabase storage arrives once admin
   auth is wired.)
   ========================================================================== */
(function () {
  const H = window.HELM;

  const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const PDFLIB_SRC = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some(s => s.src === src)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
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

  // crop transparent margins so a signature sits tight
  function trim(src) {
    const w = src.width, h = src.height;
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (!found) return src;
    const pad = 10;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
    const out = document.createElement('canvas');
    out.width = Math.max(1, maxX - minX); out.height = Math.max(1, maxY - minY);
    out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  function dataURLtoBytes(durl) {
    const b = atob(durl.split(',')[1]); const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function downloadBytes(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function render(root) {
    const state = { bytes: null, fileName: null, sigPng: null, sigAspect: 0.35, placements: [], placeMode: false, pageWraps: [] };

    root.innerHTML = `
      <div class="psign">
        <header class="psign-head">
          <div>
            <h1 class="psign-title">Sign PDF</h1>
            <p class="psign-sub">Upload a PDF, drop your signature, download it signed — all in your browser, nothing uploaded.</p>
          </div>
          <div class="psign-actions" id="ps-actions" hidden>
            <button class="psign-btn" id="ps-sig">✍ Create signature</button>
            <button class="psign-btn" id="ps-place" disabled>📍 Place signature</button>
            <button class="psign-btn primary" id="ps-export" disabled>⤓ Download signed PDF</button>
            <button class="psign-btn ghost" id="ps-reset">↺ New file</button>
          </div>
        </header>
        <div class="psign-drop" id="ps-drop">
          <div class="psign-drop-ico">📄</div>
          <div class="psign-drop-title">Drop a PDF here, or click to choose</div>
          <div class="psign-drop-sub">Contracts, NDAs, offers — any PDF. It stays on your device.</div>
          <input type="file" accept="application/pdf,.pdf" id="ps-file" hidden />
        </div>
        <div class="psign-hint" id="ps-hint" hidden></div>
        <div class="psign-doc" id="ps-doc"></div>
      </div>`;

    const $ = s => root.querySelector(s);
    const drop = $('#ps-drop'), fileInput = $('#ps-file'), docEl = $('#ps-doc'), hint = $('#ps-hint'), actions = $('#ps-actions');
    const btnSig = $('#ps-sig'), btnPlace = $('#ps-place'), btnExport = $('#ps-export'), btnReset = $('#ps-reset');

    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

    btnSig.addEventListener('click', openSigModal);
    btnPlace.addEventListener('click', togglePlaceMode);
    btnExport.addEventListener('click', exportSigned);
    btnReset.addEventListener('click', () => render(root));

    async function loadFile(file) {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { H.toast('Please choose a PDF file', 'warn'); return; }
      hint.hidden = false; hint.textContent = 'Loading ' + file.name + '…';
      try {
        await ensureLibs();
        state.bytes = new Uint8Array(await file.arrayBuffer());
        state.fileName = file.name;
        await renderPdf();
        drop.hidden = true; actions.hidden = false; hint.hidden = true;
        H.toast('Loaded "' + file.name + '" — create your signature next', 'info');
      } catch (e) { hint.textContent = 'Could not load PDF: ' + e.message; H.toast('PDF load failed: ' + e.message, 'danger'); }
    }

    async function renderPdf() {
      docEl.innerHTML = ''; state.pageWraps = [];
      const pdf = await window.pdfjsLib.getDocument({ data: state.bytes.slice() }).promise;
      const maxW = Math.min(820, docEl.clientWidth || 820);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = maxW / page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale });
        const wrap = document.createElement('div');
        wrap.className = 'psign-page';
        wrap.style.width = vp.width + 'px'; wrap.style.height = vp.height + 'px';
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        wrap.appendChild(canvas);
        docEl.appendChild(wrap);
        state.pageWraps.push(wrap);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        wrap.addEventListener('click', e => { if (state.placeMode && e.target === wrap || (state.placeMode && e.target.tagName === 'CANVAS')) placeAt(wrap, e); });
      }
    }

    function openSigModal() {
      const ov = document.createElement('div');
      ov.className = 'psign-modal';
      ov.innerHTML = `
        <div class="psign-modal-box">
          <div class="psign-modal-head"><b>Create your signature</b><button class="psign-x" data-x>✕</button></div>
          <div class="psign-modal-tabs">
            <button class="psm-tab on" data-mode="draw">✍ Draw</button>
            <button class="psm-tab" data-mode="type">⌨ Type</button>
          </div>
          <div class="psign-pad" data-pane="draw"><canvas class="psign-canvas" width="620" height="200"></canvas></div>
          <div class="psign-pad" data-pane="type" hidden>
            <input class="psign-typed" placeholder="Type your full name" />
            <div class="psign-typed-preview"></div>
          </div>
          <div class="psign-modal-foot">
            <span class="psign-legal">This is the legal equivalent of your handwritten signature.</span>
            <span class="row gap-sm">
              <button class="psign-btn ghost" data-clear>Clear</button>
              <button class="psign-btn primary" data-use>Use signature</button>
            </span>
          </div>
        </div>`;
      root.appendChild(ov);
      const canvas = ov.querySelector('.psign-canvas'), ctx = canvas.getContext('2d');
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1220';
      let drawing = false, last = null, has = false, mode = 'draw';
      const pos = e => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) }; };
      const start = e => { drawing = true; last = pos(e); e.preventDefault(); };
      const move = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; has = true; e.preventDefault(); };
      const end = () => { drawing = false; };
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
      const typedInput = ov.querySelector('.psign-typed'), typedPrev = ov.querySelector('.psign-typed-preview');
      typedInput.addEventListener('input', () => { typedPrev.textContent = typedInput.value; });
      ov.querySelectorAll('.psm-tab').forEach(t => t.addEventListener('click', () => {
        mode = t.dataset.mode;
        ov.querySelectorAll('.psm-tab').forEach(x => x.classList.toggle('on', x === t));
        ov.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== mode);
      }));
      ov.querySelector('[data-clear]').addEventListener('click', () => {
        if (mode === 'draw') { ctx.clearRect(0, 0, canvas.width, canvas.height); has = false; }
        else { typedInput.value = ''; typedPrev.textContent = ''; }
      });
      const close = () => ov.remove();
      ov.querySelector('[data-x]').addEventListener('click', close);
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      ov.querySelector('[data-use]').addEventListener('click', () => {
        let out;
        if (mode === 'draw') { if (!has) { H.toast('Draw your signature first', 'warn'); return; } out = trim(canvas); }
        else {
          const name = typedInput.value.trim(); if (!name) { H.toast('Type your name first', 'warn'); return; }
          const c = document.createElement('canvas'); c.width = 640; c.height = 200;
          const cx = c.getContext('2d'); cx.fillStyle = '#0b1220'; cx.textBaseline = 'middle';
          cx.font = '70px "Segoe Script","Brush Script MT",cursive'; cx.fillText(name, 24, 104);
          out = trim(c);
        }
        state.sigPng = out.toDataURL('image/png');
        state.sigAspect = out.height / out.width;
        close();
        btnPlace.disabled = false;
        H.toast('Signature ready — now click the document to place it', 'success');
        if (!state.placeMode) togglePlaceMode();
      });
    }

    function togglePlaceMode() {
      if (!state.sigPng) { openSigModal(); return; }
      state.placeMode = !state.placeMode;
      btnPlace.classList.toggle('on', state.placeMode);
      docEl.classList.toggle('placing', state.placeMode);
      hint.hidden = !state.placeMode;
      if (state.placeMode) hint.textContent = '📍 Click anywhere on the document to drop your signature. Drag to move, −/+ to resize, ✕ to remove.';
    }

    function placeAt(wrap, e) {
      if (!state.sigPng) { H.toast('Create a signature first', 'warn'); return; }
      const r = wrap.getBoundingClientRect();
      const w0 = Math.min(200, wrap.clientWidth * 0.32), h0 = w0 * state.sigAspect;
      let x = e.clientX - r.left - w0 / 2, y = e.clientY - r.top - h0 / 2;
      x = Math.max(0, Math.min(wrap.clientWidth - w0, x)); y = Math.max(0, Math.min(wrap.clientHeight - h0, y));
      const el = document.createElement('div');
      el.className = 'psign-sig';
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w0 + 'px'; el.style.height = h0 + 'px';
      el.innerHTML = `<img src="${state.sigPng}" draggable="false"/><div class="psign-sig-bar"><button data-a="sm" title="Smaller">−</button><button data-a="lg" title="Bigger">+</button><button data-a="rm" title="Remove">✕</button></div>`;
      wrap.appendChild(el);
      const pl = { pageIndex: state.pageWraps.indexOf(wrap), el, wrap };
      state.placements.push(pl);
      makeDraggable(el, wrap);
      el.querySelector('[data-a="rm"]').addEventListener('click', ev => { ev.stopPropagation(); el.remove(); state.placements = state.placements.filter(p => p !== pl); updateExport(); });
      el.querySelector('[data-a="sm"]').addEventListener('click', ev => { ev.stopPropagation(); resizeEl(el, 0.85, wrap); });
      el.querySelector('[data-a="lg"]').addEventListener('click', ev => { ev.stopPropagation(); resizeEl(el, 1.18, wrap); });
      updateExport();
    }
    function resizeEl(el, f, wrap) {
      let w = el.offsetWidth * f; w = Math.max(40, Math.min(wrap.clientWidth, w));
      el.style.width = w + 'px'; el.style.height = (w * state.sigAspect) + 'px';
    }
    function makeDraggable(el, wrap) {
      let sx, sy, ox, oy, drag = false;
      el.addEventListener('mousedown', e => { if (e.target.closest('.psign-sig-bar')) return; drag = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; el.classList.add('drag'); e.preventDefault(); });
      window.addEventListener('mousemove', e => {
        if (!drag) return;
        let nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
        nx = Math.max(0, Math.min(wrap.clientWidth - el.offsetWidth, nx));
        ny = Math.max(0, Math.min(wrap.clientHeight - el.offsetHeight, ny));
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
      });
      window.addEventListener('mouseup', () => { if (drag) { drag = false; el.classList.remove('drag'); } });
    }
    function updateExport() { btnExport.disabled = state.placements.length === 0; }

    async function exportSigned() {
      if (!state.placements.length) { H.toast('Place your signature first', 'warn'); return; }
      try {
        const { PDFDocument } = window.PDFLib;
        const pdf = await PDFDocument.load(state.bytes);
        const png = await pdf.embedPng(dataURLtoBytes(state.sigPng));
        const pages = pdf.getPages();
        state.placements.forEach(pl => {
          const page = pages[pl.pageIndex]; if (!page) return;
          const sz = page.getSize();
          const cw = pl.wrap.clientWidth, ch = pl.wrap.clientHeight;
          const drawW = (pl.el.offsetWidth / cw) * sz.width;
          const drawH = (pl.el.offsetHeight / ch) * sz.height;
          const x = (pl.el.offsetLeft / cw) * sz.width;
          const y = sz.height - (pl.el.offsetTop / ch) * sz.height - drawH;
          page.drawImage(png, { x, y, width: drawW, height: drawH });
        });
        const outName = (state.fileName || 'document.pdf').replace(/\.pdf$/i, '') + ' (signed).pdf';
        downloadBytes(await pdf.save(), outName);
        if (H.audit) H.audit.log({
          action: 'doc.signed', entityType: 'Document', entityId: state.fileName,
          summary: ((H.session && H.session.user && H.session.user.name) || 'You') + ' signed "' + state.fileName + '" and downloaded the signed PDF',
          after: { signing: 'signed', placements: state.placements.length }, module: 'sign'
        });
        H.toast('Signed PDF downloaded ✓', 'success');
      } catch (e) { H.toast('Export failed: ' + e.message, 'danger'); }
    }
  }

  H.register({ id: 'sign', label: 'Sign PDF', icon: '🖊️', scope: 'company', render });
})();
