/* ============================================================================
   pdfsign.js — "Sign PDF" tool. Thin wrapper over the shared engine
   (assets/pdfsign-core.js): drop a PDF → view it in-site → sign → download.
   Fully client-side; the file never leaves the browser.
   ========================================================================== */
(function () {
  const H = window.HELM;

  function render(root) {
    root.innerHTML = `
      <div class="psign">
        <header class="psign-head">
          <div>
            <h1 class="psign-title">Sign PDF</h1>
            <p class="psign-sub">Open a PDF, view it here, drop your signature and save it signed — all in your browser, nothing uploaded.</p>
          </div>
        </header>
        <div class="psign-drop" id="ps-drop">
          <div class="psign-drop-ico">${window.icon('fileText')}</div>
          <div class="psign-drop-title">Drop a PDF here, or click to choose</div>
          <div class="psign-drop-sub">Contracts, NDAs, offers — any PDF. It stays on your device.</div>
          <input type="file" accept="application/pdf,.pdf" id="ps-file" hidden />
        </div>
        <div class="psign-hint" id="ps-hint" hidden></div>
      </div>`;

    const drop = root.querySelector('#ps-drop'), fileInput = root.querySelector('#ps-file'), hint = root.querySelector('#ps-hint');
    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

    async function loadFile(file) {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { H.toast('Please choose a PDF file', 'warn'); return; }
      hint.hidden = false; hint.textContent = 'Opening ' + file.name + '…';
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const baseName = file.name.replace(/\.pdf$/i, '');
        hint.hidden = true;
        const signFlow = (b, viewer) => window.PdfSign.openSigner(b, {
          title: 'Sign ' + file.name, fileName: file.name,
          onSave: (signed) => { window.PdfSign.downloadBytes(signed, baseName + ' (signed).pdf'); if (viewer && viewer.setBytes) viewer.setBytes(signed); }
        });
        if (window.PdfView) {
          window.PdfView.open({ bytes, title: file.name, fileName: file.name, onSign: signFlow });
        } else if (window.PdfSign) {
          signFlow(bytes, null);
        } else { H.toast('Signer engine not loaded', 'warn'); }
      } catch (e) { hint.hidden = false; hint.textContent = 'Could not open PDF: ' + e.message; H.toast('PDF open failed: ' + e.message, 'danger'); }
    }
  }

  H.register({ id: 'sign', label: 'Sign PDF', icon: window.icon('signature'), scope: 'company', render });
})();
