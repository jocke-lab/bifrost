/* ============================================================================
   command.js — Dashboard. REAL data only (no mock).
   Live NFT-platform pulse + "needs you" queue + recent sales + your vitals.
   Reads the NFT platform via window.DB.nft (publishable key, public reads).
   ========================================================================== */
(function () {
  const H = window.HELM;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const when = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
  const DBok = () => !!(window.DB && window.DB.nft);

  function render(root) {
    root.innerHTML = `
      <div class="nftsite">
        <header class="nft-head">
          <div class="nft-headmain">
            <h1 class="nft-title">Dashboard <span class="nft-live" id="dash-live">● live</span></h1>
            <p class="nft-sub">Your company at a glance — the NFT platform, what needs you today, and your vitals.</p>
          </div>
          <div class="nft-kpis" id="dash-kpis">${'<div class="nft-kpi skel"></div>'.repeat(6)}</div>
        </header>
        <div class="nft-grid2">
          <section class="nft-panel"><h3>Needs your attention</h3><div id="dash-attn"><div class="nft-loading"><span class="nft-spin"></span> Checking the platform…</div></div></section>
          <section class="nft-panel"><h3>Recent sales</h3><div id="dash-sales"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div></section>
        </div>
        <section class="nft-panel"><h3>Your vitals</h3><div id="dash-vitals"></div></section>
      </div>`;
    if (!DBok()) { const l = root.querySelector('#dash-live'); if (l) { l.textContent = '● offline'; l.classList.add('off'); } }
    loadKpis(root); loadAttn(root); loadSales(root); loadVitals(root);
    // live-refresh the vitals card when body metrics are saved elsewhere
    if (!render._wired) {
      render._wired = true;
      document.addEventListener('helm:body', () => { const r = document.getElementById('view-command'); if (r) loadVitals(r); });
    }
  }

  async function loadKpis(root) {
    const box = root.querySelector('#dash-kpis'); if (!box) return;
    if (!DBok()) { box.innerHTML = '<div class="nft-warn">Live data layer offline.</div>'; return; }
    const defs = [['coins', 'Coins'], ['collections', 'Collections'], ['listings', 'Listings'], ['sales', 'Sales'], ['dealers', 'Dealers'], ['certificates', 'Certificates']];
    try {
      const counts = await Promise.all(defs.map(([t]) => window.DB.nft_count(t)));
      box.innerHTML = defs.map(([t, l], i) => `<div class="nft-kpi"><span class="k">${Number(counts[i] || 0).toLocaleString('en-US')}</span><span class="l">${l}</span></div>`).join('');
    } catch (e) { box.innerHTML = '<div class="nft-warn">' + esc(e.message) + '</div>'; }
  }

  async function loadAttn(root) {
    const host = root.querySelector('#dash-attn'); if (!host) return;
    if (!DBok()) { host.innerHTML = '<span class="nft-muted">Offline.</span>'; return; }
    try {
      const [dz, cz] = await Promise.all([
        window.DB.nft_read('dealers', { select: 'name,status', eq: { status: 'pending' }, limit: 50 }),
        window.DB.nft_read('collections', { select: 'name,approved', eq: { approved: false }, limit: 50 })
      ]);
      const pd = dz.data || [], pc = cz.data || [];
      if (!pd.length && !pc.length) { host.innerHTML = '<span class="nft-muted">✓ All clear — no pending dealers or collection requests.</span>'; return; }
      host.innerHTML =
        pd.map(d => `<div class="nft-adm-row"><span>🏷️ Dealer application — <b>${esc(d.name)}</b></span><span class="nft-muted">NFT Site → Admin</span></div>`).join('') +
        pc.map(c => `<div class="nft-adm-row"><span>🗂️ Collection request — <b>${esc(c.name)}</b></span><span class="nft-muted">NFT Site → Admin</span></div>`).join('');
    } catch (e) { host.innerHTML = '<span class="nft-muted">' + esc(e.message) + '</span>'; }
  }

  async function loadSales(root) {
    const host = root.querySelector('#dash-sales'); if (!host) return;
    if (!DBok()) { host.innerHTML = '<span class="nft-muted">Offline.</span>'; return; }
    try {
      const { data } = await window.DB.nft_read('sales', { select: 'price_eur,rail,royalty_eur,created_at', order: { col: 'created_at', asc: false }, limit: 8 });
      host.innerHTML = `<table class="nft-table"><thead><tr><th>Date</th><th class="num">Price</th><th>Rail</th><th class="num">Royalty</th></tr></thead><tbody>${(data || []).map(s => `<tr><td>${when(s.created_at)}</td><td class="num">${eur(s.price_eur)}</td><td><span class="nft-chip">${esc(s.rail || '—')}</span></td><td class="num">${eur(s.royalty_eur)}</td></tr>`).join('') || '<tr><td colspan="4" class="nft-muted">No sales yet.</td></tr>'}</tbody></table>`;
    } catch (e) { host.innerHTML = '<span class="nft-muted">' + esc(e.message) + '</span>'; }
  }

  function loadVitals(root) {
    const host = root.querySelector('#dash-vitals'); if (!host) return;
    const vitalsOff = (H.sectionEnabled && !H.sectionEnabled('vitals'));
    const panel = host.closest('.nft-panel');
    if (vitalsOff) { if (panel) panel.style.display = 'none'; return; }
    if (panel) panel.style.display = '';
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('helm.body')) || {}; } catch (e) {}
    const u = (H.session && H.session.user) || {};
    const body = Object.assign({}, u.body, stored);
    const kg = body.weightKg, cm = body.heightCm, age = body.age, sex = body.sex;
    const ACT = [1.20, 1.375, 1.55, 1.725, 1.90];
    const mult = ACT[Number.isInteger(body.activity) ? body.activity : 2] || 1.55;
    let bmr = null, tdee = null;
    if (kg && cm && age) { bmr = Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5)); tdee = Math.round(bmr * mult); }
    host.innerHTML = `
      <div class="nft-kpis">
        <div class="nft-kpi"><span class="k">${bmr ? bmr.toLocaleString('en-US') : '—'}</span><span class="l">BMR kcal</span></div>
        <div class="nft-kpi"><span class="k">${tdee ? tdee.toLocaleString('en-US') : '—'}</span><span class="l">TDEE kcal</span></div>
        <div class="nft-kpi"><span class="k">${kg ? kg + ' kg' : '—'}</span><span class="l">Weight</span></div>
        <div class="nft-kpi"><span class="k">${cm ? cm + ' cm' : '—'}</span><span class="l">Height</span></div>
      </div>
      <p class="nft-muted" style="margin-top:10px">${bmr ? 'Calculated from your body stats (edit in Vitals).' : 'Add your body stats in Vitals to see BMR/TDEE.'} Connect Whoop or Oura in <b>Connections → Wearables</b> for live recovery, sleep and strain.</p>`;
  }

  H.register({ id: 'command', label: 'Dashboard', icon: '🛰️', scope: 'company', render });
})();
