/* ============================================================================
   bifrost · NFT Site — operator admin for the numismatic NFT trading platform.
   Reads LIVE data from the opulence-tech project (window.DB.nft).
   Public catalog (coins/collections/drops/dealers/sales/certs) reads with the
   publishable key. Privileged tables (orders / royalty_payouts /
   withdrawal_requests / counterfeit_reports) are RLS-locked → they unlock via
   the serverless admin API once the service_role key is set in Vercel env.
   ========================================================================== */
(function () {
  const H = window.HELM;

  const TABS = [
    { id: 'overview',    label: 'Overview',    icon: '🛰️' },
    { id: 'catalog',     label: 'Catalog',     icon: '🪙' },
    { id: 'collections', label: 'Collections', icon: '🗂️' },
    { id: 'drops',       label: 'Drops',       icon: '🚀' },
    { id: 'dealers',     label: 'Dealers',     icon: '🏷️' },
    { id: 'sales',       label: 'Sales',       icon: '💶' }
  ];

  let active = 'overview';
  let rootEl = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const eur = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const thumb = (url, alt) => url ? `<img class="nft-thumb" loading="lazy" src="${esc(url)}" alt="${esc(alt || '')}">` : `<div class="nft-thumb nft-noimg">◇</div>`;
  const DBok = () => !!(window.DB && window.DB.nft);

  function render(root) {
    rootEl = root;
    root.innerHTML = `
      <div class="nftsite">
        <header class="nft-head">
          <div class="nft-headmain">
            <h1 class="nft-title">NFT Site <span class="nft-live" id="nft-live">● live</span></h1>
            <p class="nft-sub">Operator console · numismatic NFT trading platform · opulence-tech</p>
          </div>
          <div class="nft-kpis" id="nft-kpis">${'<div class="nft-kpi skel"></div>'.repeat(8)}</div>
        </header>
        <nav class="nft-tabs">
          ${TABS.map(t => `<button class="nft-tab${t.id === active ? ' active' : ''}" data-tab="${t.id}"><span class="nt-ico">${t.icon}</span>${t.label}</button>`).join('')}
        </nav>
        <div class="nft-body" id="nft-body"></div>
      </div>`;

    root.querySelectorAll('.nft-tab').forEach(b => b.addEventListener('click', () => {
      active = b.dataset.tab;
      root.querySelectorAll('.nft-tab').forEach(x => x.classList.toggle('active', x === b));
      paint();
    }));

    if (!DBok()) {
      const live = root.querySelector('#nft-live');
      if (live) { live.textContent = '● offline'; live.classList.add('off'); }
    }
    loadKpis();
    paint();
  }

  async function loadKpis() {
    const box = rootEl && rootEl.querySelector('#nft-kpis'); if (!box) return;
    if (!DBok()) { box.innerHTML = `<div class="nft-warn">Data layer offline — check Supabase config / network.</div>`; return; }
    const defs = [['coins','Coins'],['collections','Collections'],['listings','Listings'],['drops','Drops'],['dealers','Dealers'],['certificates','Certs'],['sets','Sets'],['sales','Sales']];
    try {
      const counts = await Promise.all(defs.map(([t]) => window.DB.nft_count(t)));
      // Set values directly (no count-up): rAF is paused on backgrounded tabs, which would freeze the number at 0.
      box.innerHTML = defs.map(([t, l], i) => `<div class="nft-kpi"><span class="k">${Number(counts[i] || 0).toLocaleString('en-US')}</span><span class="l">${l}</span></div>`).join('');
    } catch (e) { box.innerHTML = `<div class="nft-warn">${esc(e.message)}</div>`; }
  }

  async function paint() {
    const body = rootEl && rootEl.querySelector('#nft-body'); if (!body) return;
    if (!DBok()) { body.innerHTML = lockedNote('The live data layer is offline. Ensure assets/data.js and the Supabase script loaded (needs network for the CDN).'); return; }
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading live data…</div>`;
    try {
      if (active === 'overview')    return void await paintOverview(body);
      if (active === 'catalog')     return void await paintCatalog(body);
      if (active === 'collections') return void await paintCollections(body);
      if (active === 'drops')       return void await paintDrops(body);
      if (active === 'dealers')     return void await paintDealers(body);
      if (active === 'sales')       return void await paintSales(body);
    } catch (e) { body.innerHTML = `<div class="nft-warn">Failed to load: ${esc(e.message)}</div>`; }
  }

  const lockedNote = (msg) => `<div class="nft-locked">🔒 ${esc(msg)}</div>`;
  const privTile = (label, note) => `<div class="nft-priv"><span class="pv-l">${esc(label)}</span><span class="pv-lock">🔒 needs service key</span><span class="pv-n">${esc(note)}</span></div>`;

  async function paintOverview(body) {
    const [sales, listings, colls] = await Promise.all([
      window.DB.nft_read('sales', { select: 'id,price_eur,rail,royalty_eur,platform_fee_eur,created_at', order: { col: 'created_at', asc: false }, limit: 6 }),
      window.DB.nft_read('listings', { select: 'id,price_eur,status,kind,created_at', eq: { status: 'active' }, order: { col: 'created_at', asc: false }, limit: 8 }),
      window.DB.nft_read('collections', { select: 'id,name,cover_url,verified,featured,royalty_bps', order: { col: 'created_at', asc: false }, limit: 6 })
    ]);
    const salesRows = (sales.data || []).map(s => `<tr><td>${when(s.created_at)}</td><td class="num">${eur(s.price_eur)}</td><td><span class="nft-chip">${esc(s.rail || '—')}</span></td><td class="num">${eur(s.royalty_eur)}</td><td class="num">${eur(s.platform_fee_eur)}</td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No sales visible.</td></tr>`;
    const listRows = (listings.data || []).map(l => `<tr><td>${when(l.created_at)}</td><td class="num">${eur(l.price_eur)}</td><td><span class="nft-chip">${esc(l.kind || 'fixed')}</span></td><td><span class="nft-chip ok">${esc(l.status)}</span></td></tr>`).join('') || `<tr><td colspan="4" class="nft-muted">No active listings.</td></tr>`;
    const collCards = (colls.data || []).map(c => `<div class="nft-card"><div class="nft-cardimg">${thumb(c.cover_url, c.name)}</div><div class="nft-cardmeta"><b>${esc(c.name)}</b><span class="nft-muted">${(c.royalty_bps || 0) / 100}% royalty${c.verified ? ' · ✓ verified' : ''}</span></div></div>`).join('') || `<div class="nft-muted">No collections.</div>`;
    body.innerHTML = `
      <div class="nft-grid2">
        <section class="nft-panel">
          <h3>Recent sales</h3>
          <table class="nft-table"><thead><tr><th>Date</th><th class="num">Price</th><th>Rail</th><th class="num">Royalty</th><th class="num">Fee</th></tr></thead><tbody>${salesRows}</tbody></table>
        </section>
        <section class="nft-panel">
          <h3>Active listings</h3>
          <table class="nft-table"><thead><tr><th>Date</th><th class="num">Price</th><th>Kind</th><th>Status</th></tr></thead><tbody>${listRows}</tbody></table>
        </section>
      </div>
      <section class="nft-panel">
        <h3>Latest collections</h3>
        <div class="nft-cards">${collCards}</div>
      </section>
      <section class="nft-panel">
        <h3>Operator controls <span class="nft-muted">— unlock with the opulence-tech service key</span></h3>
        <div class="nft-privgrid">
          ${privTile('Orders & fulfilment', 'approve, ship, refund')}
          ${privTile('Royalty payouts', 'review & release dealer royalties')}
          ${privTile('Withdrawals', 'approve dealer balance withdrawals')}
          ${privTile('Counterfeit reports', 'triage flagged certificates')}
        </div>
      </section>`;
  }

  async function paintCatalog(body) {
    const { data } = await window.DB.nft_read('coins', { select: 'id,name,metal,year,edition_no,edition_total,image_url,created_at', order: { col: 'created_at', asc: false }, limit: 60 });
    const cards = (data || []).map(c => `
      <div class="nft-card">
        <div class="nft-cardimg">${thumb(c.image_url, c.name)}</div>
        <div class="nft-cardmeta">
          <b>${esc(c.name || 'Untitled')}</b>
          <span class="nft-muted">${esc(c.metal || '—')}${c.year ? ' · ' + esc(c.year) : ''}${c.edition_no ? ` · #${esc(c.edition_no)}/${esc(c.edition_total || '?')}` : ''}</span>
        </div>
      </div>`).join('') || `<div class="nft-muted">No coins.</div>`;
    body.innerHTML = `<section class="nft-panel"><h3>Catalog <span class="nft-muted">— newest 60 coins</span></h3><div class="nft-cards">${cards}</div></section>`;
  }

  async function paintCollections(body) {
    const { data } = await window.DB.nft_read('collections', { select: 'id,name,slug,cover_url,royalty_bps,published,verified,featured,chain,contract_address', order: { col: 'created_at', asc: false }, limit: 60 });
    const cards = (data || []).map(c => `
      <div class="nft-card">
        <div class="nft-cardimg">${thumb(c.cover_url, c.name)}</div>
        <div class="nft-cardmeta">
          <b>${esc(c.name)} ${c.verified ? '<span class="nft-chip ok">✓</span>' : ''}${c.featured ? '<span class="nft-chip">★</span>' : ''}</b>
          <span class="nft-muted">${esc(c.slug || '')} · ${(c.royalty_bps || 0) / 100}% · ${c.published ? 'published' : 'draft'}</span>
          ${c.contract_address ? `<span class="nft-mono">${esc(String(c.contract_address).slice(0, 10))}…</span>` : ''}
        </div>
      </div>`).join('') || `<div class="nft-muted">No collections.</div>`;
    body.innerHTML = `<section class="nft-panel"><h3>Collections</h3><div class="nft-cards">${cards}</div></section>`;
  }

  async function paintDrops(body) {
    const { data } = await window.DB.nft_read('drops', { select: '*', order: { col: 'launch_at', asc: false }, limit: 40 });
    const rows = (data || []).map(d => `<tr><td><b>${esc(d.title)}</b></td><td>${when(d.launch_at)}</td><td class="num">${d.supply ?? '—'}</td><td class="num">${eur(d.price_eur)}</td><td><span class="nft-chip ${d.status === 'live' ? 'ok' : ''}">${esc(d.status || '—')}</span></td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No drops.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><h3>Drops</h3><table class="nft-table"><thead><tr><th>Title</th><th>Launch</th><th class="num">Supply</th><th class="num">Price</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  async function paintDealers(body) {
    const { data } = await window.DB.nft_read('dealers', { select: 'id,name,slug,logo_url,verified,status,default_royalty_bps,website', order: { col: 'created_at', asc: false }, limit: 40 });
    const rows = (data || []).map(d => `<tr><td><div class="nft-inline">${thumb(d.logo_url, d.name)}<b>${esc(d.name)}</b></div></td><td>${esc(d.slug || '')}</td><td class="num">${(d.default_royalty_bps || 0) / 100}%</td><td><span class="nft-chip ${d.verified ? 'ok' : ''}">${d.verified ? 'verified' : 'unverified'}</span></td><td><span class="nft-chip">${esc(d.status || '—')}</span></td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No dealers.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><h3>Dealers</h3><table class="nft-table"><thead><tr><th>Dealer</th><th>Slug</th><th class="num">Royalty</th><th>Verified</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  async function paintSales(body) {
    const { data } = await window.DB.nft_read('sales', { select: '*', order: { col: 'created_at', asc: false }, limit: 60 });
    const rows = (data || []).map(s => `<tr><td>${when(s.created_at)}</td><td class="num">${eur(s.price_eur)}</td><td><span class="nft-chip">${esc(s.rail || '—')}</span></td><td class="num">${eur(s.royalty_eur)}</td><td class="num">${eur(s.platform_fee_eur)}</td><td class="nft-mono">${s.tx_hash ? esc(String(s.tx_hash).slice(0, 10)) + '…' : '—'}</td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No sales.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><h3>Sales ledger</h3><table class="nft-table"><thead><tr><th>Date</th><th class="num">Price</th><th>Rail</th><th class="num">Royalty</th><th class="num">Platform fee</th><th>Tx</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  H.register({ id: 'nft-site', label: 'NFT Site', icon: '🪙', scope: 'company', render });
})();
