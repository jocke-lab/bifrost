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
    { id: 'sales',       label: 'Sales',       icon: '💶' },
    { id: 'admin',       label: 'Admin',       icon: '⚙️' }
  ];

  let active = 'overview';
  let rootEl = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const eur = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const thumb = (url, alt) => url ? `<img class="nft-thumb" loading="lazy" src="${esc(url)}" alt="${esc(alt || '')}">` : `<div class="nft-thumb nft-noimg">◇</div>`;
  const DBok = () => !!(window.DB && window.DB.nft);
  async function apiCall(path, opts) { try { const r = await fetch(path, opts); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { ok: false, _offline: true }; } } catch (e) { return { ok: false, _offline: true, error: e.message }; } }
  let _collMap = null;
  async function collMap() { if (_collMap) return _collMap; const { data } = await window.DB.nft_read('collections', { select: 'id,name', limit: 200 }); _collMap = {}; (data || []).forEach(c => { _collMap[c.id] = c.name; }); return _collMap; }

  // a clickable coin card (opens its certificate detail)
  function coinCardHTML(c, cm) {
    const collLine = cm ? `<span class="nft-muted">${esc(cm[c.collection_id] || 'No collection')}</span>` : '';
    return `<button class="nft-card nft-card-btn" data-coin-id="${esc(c.id)}" data-coin-name="${esc(c.name || 'Untitled')}">
      <div class="nft-cardimg">${thumb(c.image_url, c.name)}</div>
      <div class="nft-cardmeta">
        <b>${esc(c.name || 'Untitled')}</b>
        ${collLine}
        <span class="nft-muted">${esc(c.metal || '—')}${c.year ? ' · ' + esc(c.year) : ''}${c.edition_no ? ` · #${esc(c.edition_no)}/${esc(c.edition_total || '?')}` : ''}</span>
      </div>
    </button>`;
  }
  function wireCoins(container) {
    container.querySelectorAll('[data-coin-id]').forEach(b => b.addEventListener('click', () => openCoinModal(b.dataset.coinId, b.dataset.coinName)));
  }
  async function openCoinModal(coinId, name) {
    let ov = document.querySelector('.nft-modal');
    if (!ov) { ov = document.createElement('div'); ov.className = 'nft-modal'; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="nft-modal-box"><div class="nft-modal-head"><b>${esc(name)}</b><button class="nft-modal-x" data-x>✕</button></div><div class="nft-modal-body"><div class="nft-loading"><span class="nft-spin"></span> Loading certificate…</div></div></div>`;
    ov.classList.add('open');
    ov.querySelector('[data-x]').addEventListener('click', () => ov.classList.remove('open'));
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
    const mb = ov.querySelector('.nft-modal-body');
    try {
      const { data } = await window.DB.nft_read('certificates', { select: 'id,serial,minted,minted_at,token_id,onchain_owner,tag_id,created_at', eq: { coin_id: coinId }, order: { col: 'created_at', asc: false }, limit: 20 });
      const certs = (data || []).map(ct => `<div class="nft-cert">
        <div class="nft-cert-top"><span class="nft-mono">${esc(ct.serial)}</span>${ct.minted ? '<span class="nft-chip ok">minted</span>' : '<span class="nft-chip">unminted</span>'}${ct.tag_id ? '<span class="nft-chip ok">🔗 NFC chip</span>' : '<span class="nft-chip">no chip</span>'}</div>
        <div class="nft-muted">${ct.token_id ? 'Token #' + esc(ct.token_id) + ' · ' : ''}${ct.onchain_owner ? 'owner ' + esc(String(ct.onchain_owner).slice(0, 12)) + '…' : 'off-chain'}</div>
      </div>`).join('') || '<div class="nft-muted">No certificate issued for this coin yet — issue one from the Admin tab.</div>';
      mb.innerHTML = `<div class="nft-cert-list">${certs}</div>`;
    } catch (e) { mb.innerHTML = `<div class="nft-warn">${esc(e.message)}</div>`; }
  }

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
      if (active === 'admin')       return void await paintAdmin(body);
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
    const [res, cm] = await Promise.all([
      window.DB.nft_read('coins', { select: 'id,name,metal,year,edition_no,edition_total,image_url,collection_id,created_at', order: { col: 'created_at', asc: false }, limit: 60 }),
      collMap()
    ]);
    const cards = (res.data || []).map(c => coinCardHTML(c, cm)).join('') || `<div class="nft-muted">No coins.</div>`;
    body.innerHTML = `<section class="nft-panel"><h3>Catalog <span class="nft-muted">— newest 60 coins · click a coin for its certificate</span></h3><div class="nft-cards">${cards}</div></section>`;
    wireCoins(body);
  }

  async function paintCollections(body) {
    const { data } = await window.DB.nft_read('collections', { select: 'id,name,slug,cover_url,royalty_bps,published,verified,featured,chain,contract_address', order: { col: 'created_at', asc: false }, limit: 60 });
    const cards = (data || []).map(c => `
      <button class="nft-card nft-card-btn" data-coll="${esc(c.id)}" data-name="${esc(c.name)}">
        <div class="nft-cardimg">${thumb(c.cover_url, c.name)}</div>
        <div class="nft-cardmeta">
          <b>${esc(c.name)} ${c.verified ? '<span class="nft-chip ok">✓</span>' : ''}${c.featured ? '<span class="nft-chip">★</span>' : ''}</b>
          <span class="nft-muted">${esc(c.slug || '')} · ${(c.royalty_bps || 0) / 100}% · ${c.published ? 'published' : 'draft'}</span>
        </div>
      </button>`).join('') || `<div class="nft-muted">No collections.</div>`;
    body.innerHTML = `<section class="nft-panel"><h3>Collections <span class="nft-muted">— click one to view its coins</span></h3><div class="nft-cards">${cards}</div></section>`;
    body.querySelectorAll('[data-coll]').forEach(b => b.addEventListener('click', () => paintCollectionDetail(body, b.dataset.coll, b.dataset.name)));
  }

  async function paintCollectionDetail(body, collId, name) {
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading ${esc(name)}…</div>`;
    const { data } = await window.DB.nft_read('coins', { select: 'id,name,metal,year,edition_no,edition_total,image_url', eq: { collection_id: collId }, order: { col: 'created_at', asc: false }, limit: 200 });
    const cards = (data || []).map(c => coinCardHTML(c)).join('') || `<div class="nft-muted">No coins in this collection yet.</div>`;
    body.innerHTML = `
      <div class="nft-detail-head">
        <button class="nft-back" data-back>← Collections</button>
        <h3>${esc(name)} <span class="nft-muted">${(data || []).length} coins · click a coin for its certificate</span></h3>
      </div>
      <div class="nft-cards">${cards}</div>`;
    body.querySelector('[data-back]').addEventListener('click', () => paintCollections(body));
    wireCoins(body);
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

  // ── Admin tab: the full operator "circle" (writes via the serverless API) ──
  async function paintAdmin(body) {
    const st = await apiCall('/api/status');
    const configured = !!(st && st.integrations && st.integrations.nft_admin);
    const banner = configured
      ? `<div class="nft-adm-ok">● Admin connected — these actions write live to the platform.</div>`
      : `<div class="nft-adm-warn">🔒 Admin writes need <code>OPULENCE_TECH_SERVICE_ROLE</code> in Vercel (project <b>bifrost</b> → Settings → Environment Variables). Every form below works the instant it's added.${st && st._offline ? ' Note: the API only runs on the live site (bifrostlkl.com), not this local preview.' : ''}</div>`;
    body.innerHTML = `${banner}<div class="nft-adm-grid" id="nft-adm"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div>`;
    const host = body.querySelector('#nft-adm');
    const [dz, cz] = await Promise.all([apiCall('/api/dealers'), apiCall('/api/collections')]);
    const dealers = (dz && dz.dealers) || [], collections = (cz && cz.collections) || [];
    const dealerOpts = dealers.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    const collOpts = collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const card = (title, inner) => `<div class="nft-adm-card"><h4>${title}</h4>${inner}</div>`;
    host.innerHTML = [
      card('➕ New dealer', `
        <input class="nft-in" data-f="d_name" placeholder="Dealer name"/>
        <input class="nft-in" data-f="d_email" placeholder="Contact email (optional)"/>
        <input class="nft-in" data-f="d_roy" type="number" placeholder="Royalty bps (default 500)"/>
        <button class="nft-adm-btn" data-act="dealer-create">Create dealer</button>`),
      card('✓ Dealers — approve', `<div class="nft-adm-list">${dealers.length ? dealers.map(d => `<div class="nft-adm-row"><span>${esc(d.name)} <span class="nft-chip ${d.status === 'approved' ? 'ok' : ''}">${esc(d.status)}</span></span>${d.status !== 'approved' ? `<button class="nft-adm-mini" data-approve-dealer="${esc(d.id)}">Approve</button>` : '<span class="nft-muted">✓</span>'}</div>`).join('') : '<div class="nft-muted">No dealers yet.</div>'}</div>`),
      card('➕ New collection', `
        <select class="nft-in" data-f="c_dealer"><option value="">Select dealer…</option>${dealerOpts}</select>
        <input class="nft-in" data-f="c_name" placeholder="Collection name"/>
        <input class="nft-in" data-f="c_roy" type="number" placeholder="Royalty bps (default 500)"/>
        <button class="nft-adm-btn" data-act="coll-create">Create collection</button>`),
      card('✓ Collection requests — approve', `<div class="nft-adm-list">${collections.length ? collections.map(c => `<div class="nft-adm-row"><span>${esc(c.name)} <span class="nft-chip ${c.approved ? 'ok' : ''}">${c.approved ? 'approved' : 'pending'}</span></span>${!c.approved ? `<button class="nft-adm-mini" data-approve-coll="${esc(c.id)}">Approve</button>` : '<span class="nft-muted">✓</span>'}</div>`).join('') : '<div class="nft-muted">No collections.</div>'}</div>`),
      card('➕ New coin', `
        <select class="nft-in" data-f="coin_coll"><option value="">Select collection…</option>${collOpts}</select>
        <input class="nft-in" data-f="coin_name" placeholder="Coin name"/>
        <input class="nft-in" data-f="coin_metal" placeholder="Metal (optional)"/>
        <button class="nft-adm-btn" data-act="coin-create">Create coin</button>`),
      card('🎫 Issue certificate (+ NFC)', `
        <input class="nft-in" data-f="cert_coin" placeholder="Coin ID"/>
        <input class="nft-in" data-f="cert_tag" placeholder="NFC tag ID (optional)"/>
        <button class="nft-adm-btn" data-act="cert-create">Issue certificate</button>`),
      card('🏷️ NFC tags', `
        <input class="nft-in" data-f="nfc_uid" placeholder="New tag UID"/>
        <button class="nft-adm-btn" data-act="nfc-register">Register tag</button>
        <div class="nft-adm-sep"></div>
        <input class="nft-in" data-f="nfc_tag" placeholder="Tag ID"/>
        <input class="nft-in" data-f="nfc_coin" placeholder="Coin ID"/>
        <button class="nft-adm-btn" data-act="nfc-link">Link tag → coin</button>`)
    ].join('');

    const val = f => { const el = host.querySelector(`[data-f="${f}"]`); return el ? el.value.trim() : ''; };
    async function post(path, bodyObj, okMsg, method) {
      const r = await apiCall(path, { method: method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) });
      if (r.ok) { H.toast(okMsg, 'success'); paintAdmin(body); }
      else if (r.configured === false) { H.toast('Add OPULENCE_TECH_SERVICE_ROLE in Vercel to enable this', 'warn'); }
      else H.toast('Failed: ' + (r.error || (r._offline ? 'API runs on the live site only' : 'error')), 'danger');
    }
    host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'dealer-create') { if (!val('d_name')) return H.toast('Name required', 'warn'); post('/api/dealers', { name: val('d_name'), contact_email: val('d_email') || undefined, royalty_bps: val('d_roy') || undefined }, 'Dealer created'); }
      if (a === 'coll-create') { if (!val('c_dealer') || !val('c_name')) return H.toast('Dealer + name required', 'warn'); post('/api/collections', { dealer_id: val('c_dealer'), name: val('c_name'), royalty_bps: val('c_roy') || undefined }, 'Collection created'); }
      if (a === 'coin-create') { if (!val('coin_coll') || !val('coin_name')) return H.toast('Collection + name required', 'warn'); post('/api/coins', { collection_id: val('coin_coll'), name: val('coin_name'), metal: val('coin_metal') || undefined }, 'Coin created'); }
      if (a === 'cert-create') { if (!val('cert_coin')) return H.toast('Coin ID required', 'warn'); post('/api/certificates', { coin_id: val('cert_coin'), tag_id: val('cert_tag') || undefined }, 'Certificate issued'); }
      if (a === 'nfc-register') { if (!val('nfc_uid')) return H.toast('UID required', 'warn'); post('/api/nfc', { uid: val('nfc_uid') }, 'Tag registered'); }
      if (a === 'nfc-link') { if (!val('nfc_tag') || !val('nfc_coin')) return H.toast('Tag + coin required', 'warn'); post('/api/nfc', { action: 'link', tag_id: val('nfc_tag'), coin_id: val('nfc_coin') }, 'Tag linked'); }
    }));
    host.querySelectorAll('[data-approve-dealer]').forEach(b => b.addEventListener('click', () => post('/api/dealers', { id: b.dataset.approveDealer, action: 'approve' }, 'Dealer approved', 'PATCH')));
    host.querySelectorAll('[data-approve-coll]').forEach(b => b.addEventListener('click', () => post('/api/collections', { id: b.dataset.approveColl, action: 'approve' }, 'Collection approved')));
  }

  H.register({ id: 'nft-site', label: 'NFT Site', icon: '🪙', scope: 'company', render });
})();
