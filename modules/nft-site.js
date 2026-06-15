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
    { id: 'map',         label: 'Atlas',       icon: '🗺️' },
    { id: 'catalog',     label: 'Catalog',     icon: '🪙' },
    { id: 'collections', label: 'Collections', icon: '🗂️' },
    { id: 'drops',       label: 'Drops',       icon: '🚀' },
    { id: 'dealers',     label: 'Dealers',     icon: '🏷️' },
    { id: 'sales',       label: 'Sales',       icon: '💶' },
    { id: 'accounting',  label: 'Accounting',  icon: '📊' },
    { id: 'nfc',         label: 'NFC Cards',   icon: '🏷️' },
    { id: 'cards',       label: 'Card orders', icon: '📮' },
    { id: 'support',     label: 'Support',     icon: '🛟' },
    { id: 'chain',       label: 'Chain',       icon: '⛓️' },
    { id: 'admin',       label: 'Admin',       icon: '⚙️' },
    { id: 'audit',       label: 'Audit',       icon: '📜' }
  ];

  let active = 'overview';
  let rootEl = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const eur = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const thumb = (url, alt) => url ? `<img class="nft-thumb" loading="lazy" src="${esc(url)}" alt="${esc(alt || '')}">` : `<div class="nft-thumb nft-noimg">◇</div>`;
  const DBok = () => !!(window.DB && window.DB.nft);
  async function apiCall(path, opts) {
    opts = opts || {};
    try {
      let token = null;
      try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = 'Bearer ' + token;
      // NFT-admin calls go to the Supabase Edge Function (it holds the service role automatically — no key needed anywhere).
      const ADMIN_RES = ['dealers', 'collections', 'coins', 'certificates', 'nfc', 'ops', 'accounting', 'console'];
      let target = path;
      const mm = path.match(/^\/api\/([a-z-]+)(.*)$/);
      if (mm && ADMIN_RES.includes(mm[1])) { target = 'https://mumnyvmxyzsgducbbvxi.supabase.co/functions/v1/admin/' + mm[1] + (mm[2] || ''); headers.apikey = 'sb_publishable__oUKNAdEnZrqxyxvkUadmQ_tjdg74my'; }
      const r = await fetch(target, Object.assign({}, opts, { headers }));
      const t = await r.text();
      let data; try { data = JSON.parse(t); } catch (e) { return { ok: false, _offline: true }; }
      if (r.status === 401 || r.status === 403 || data.unauthorized || data.forbidden) { data.unauthorized = true; openSignIn(); }
      return data;
    } catch (e) { return { ok: false, _offline: true, error: e.message }; }
  }
  function openSignIn() {
    if (document.querySelector('.nft-signin')) return;
    const ov = document.createElement('div'); ov.className = 'nft-modal nft-signin open';
    ov.innerHTML = `<div class="nft-modal-box" style="max-width:380px"><div class="nft-modal-head"><b>🔐 Admin sign-in</b><button class="nft-modal-x" data-x>✕</button></div><div class="nft-modal-body" style="display:block"><p class="nft-muted" style="margin:0 0 12px">Sign in with your admin email to manage the platform.</p><input class="nft-in" id="si-email" type="email" placeholder="email" value="arivd.arvidsson@gmail.com" style="margin-bottom:8px"/><input class="nft-in" id="si-pass" type="password" placeholder="password" style="margin-bottom:8px"/><button class="nft-adm-btn" id="si-go" style="width:100%">Sign in</button><button class="nft-adm-mini" id="si-magic" style="width:100%;margin-top:8px">Email me a magic link instead</button><div class="nft-muted" id="si-msg" style="margin-top:10px"></div></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('[data-x]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    const msg = ov.querySelector('#si-msg');
    ov.querySelector('#si-go').addEventListener('click', async () => {
      const email = ov.querySelector('#si-email').value.trim(), pass = ov.querySelector('#si-pass').value;
      if (!email || !pass) { msg.textContent = 'Enter email + password.'; return; }
      msg.textContent = 'Signing in…';
      try { const r = await window.DB.auth.signInPassword(email, pass); if (r && r.error) { msg.textContent = r.error.message; return; } H.toast('Signed in ✓', 'success'); close(); updateAuthChip(); paint(); } catch (e) { msg.textContent = e.message; }
    });
    ov.querySelector('#si-magic').addEventListener('click', async () => {
      const email = ov.querySelector('#si-email').value.trim(); if (!email) { msg.textContent = 'Enter your email first.'; return; }
      try { const r = await window.DB.auth.signInMagicLink(email); msg.textContent = (r && r.error) ? r.error.message : 'Magic link sent — open it, then return here.'; } catch (e) { msg.textContent = e.message; }
    });
  }
  async function updateAuthChip(root) {
    const el = (root || document).querySelector('#nft-auth'); if (!el) return;
    let u = null; try { u = window.DB && window.DB.auth ? await window.DB.auth.getUser() : null; } catch (e) {}
    if (u && u.email) { el.textContent = '✓ ' + u.email.split('@')[0]; el.classList.remove('off'); el.onclick = async () => { try { await window.DB.auth.signOut(); } catch (e) {} H.toast('Signed out', 'info'); updateAuthChip(); paint(); }; }
    else { el.textContent = '🔐 sign in'; el.classList.add('off'); el.onclick = () => openSignIn(); }
  }
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
            <h1 class="nft-title">NFT Site <span class="nft-live" id="nft-live">● live</span> <span class="nft-live off" id="nft-auth" style="cursor:pointer">🔐 sign in</span></h1>
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
    updateAuthChip(root);
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
      if (active === 'map')         return void await paintMap(body);
      if (active === 'catalog')     return void await paintCatalog(body);
      if (active === 'collections') return void await paintCollections(body);
      if (active === 'drops')       return void await paintDrops(body);
      if (active === 'dealers')     return void await paintDealers(body);
      if (active === 'sales')       return void await paintSales(body);
      if (active === 'accounting')  return void await paintAccounting(body);
      if (active === 'nfc')         return void await paintNfc(body);
      if (active === 'cards')       return void await paintCards(body);
      if (active === 'support')     return void await paintSupport(body);
      if (active === 'chain')       return void await paintChain(body);
      if (active === 'admin')       return void await paintAdmin(body);
      if (active === 'audit')       return void await paintAudit(body);
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

  // ── Atlas: constellation map of collections (Nexus-style magnitude + golden spiral) ──
  async function paintMap(body) {
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Building the atlas…</div>`;
    if (!(window.DB && window.DB.nft)) { body.innerHTML = `<div class="nft-warn">Data layer offline.</div>`; return; }
    const [colls, coins] = await Promise.all([
      window.DB.nft_read('collections', { select: 'id,name,published,verified,featured', order: { col: 'created_at', asc: false }, limit: 200 }),
      window.DB.nft_read('coins', { select: 'collection_id', limit: 2000 })
    ]);
    const cnt = {}; (coins.data || []).forEach(c => { if (c.collection_id) cnt[c.collection_id] = (cnt[c.collection_id] || 0) + 1; });
    const list = (colls.data || []).map(c => ({ ...c, coins: cnt[c.id] || 0 }));
    if (!list.length) { body.innerHTML = `<section class="nft-panel"><div class="nft-muted">No collections to map yet.</div></section>`; return; }
    const maxC = Math.max(1, ...list.map(c => c.coins));
    const W = 900, Hh = 560, cx = W / 2, cy = Hh / 2, GOLD = Math.PI * (3 - Math.sqrt(5));
    let nodes = '', conns = '';
    list.forEach((c, i) => {
      const ang = i * GOLD, r = 64 + 30 * Math.sqrt(i);
      const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
      const rad = 9 + Math.round(16 * Math.sqrt(c.coins / maxC));
      const col = c.verified ? '#46E6A6' : (c.published ? 'var(--accent1, #19D3FF)' : '#5a6b82');
      conns += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
      nodes += `<g class="nft-mapnode" data-id="${esc(c.id)}" data-name="${esc(c.name)}">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" fill="${col}" opacity="0.85"/>
        ${c.featured ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad + 4}" fill="none" stroke="#F5A524" stroke-width="1.5"/>` : ''}
        ${c.coins >= Math.max(2, maxC * 0.25) ? `<text x="${x.toFixed(1)}" y="${(y + rad + 12).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted, #8aa4bc)">${esc(c.name).slice(0, 18)}</text>` : ''}
        <title>${esc(c.name)} · ${c.coins} coins${c.verified ? ' · verified' : ''}</title>
      </g>`;
    });
    body.innerHTML = `
      <section class="nft-panel">
        <h3>Platform atlas <span class="nft-muted">— ${list.length} collections sized by coins · 🟢 verified · 🔵 published · ⚪ draft · click to open</span></h3>
        <div class="nft-map"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMid meet">
          ${conns}
          <circle cx="${cx}" cy="${cy}" r="26" fill="var(--accent3, #7C5CFF)"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#07111a">OPV</text>
          ${nodes}
        </svg></div>
      </section>`;
    body.querySelectorAll('.nft-mapnode').forEach(n => n.addEventListener('click', () => paintCollectionDetail(body, n.dataset.id, n.dataset.name)));
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

  // ── Accounting tab: live P&L (volume, platform revenue, royalties, payouts) ──
  async function paintAccounting(body) {
    if (!(await gate(body, 'Accounting', '📊'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading P&amp;L…</div>`;
    const r = await apiCall('/api/accounting');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const t = r.totals || {};
    const kpi = (v, l) => `<div class="nft-kpi"><span class="k">${v}</span><span class="l">${l}</span></div>`;
    const rows = (r.monthly || []).map(m => `<tr><td>${esc(m.month)}</td><td class="num">${eur(m.volume)}</td><td class="num">${eur(m.fees)}</td><td class="num">${eur(m.royalties)}</td><td class="num">${m.count}</td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No sales yet.</td></tr>`;
    body.innerHTML = `
      <div class="nft-kpis" style="margin-bottom:16px">${kpi(eur(t.volume), 'Volume')}${kpi(eur(t.fees), 'Platform revenue')}${kpi(eur(t.royalties), 'Royalties paid')}${kpi(eur(t.payouts), 'Payouts')}${kpi(t.sales || 0, 'Sales')}</div>
      <section class="nft-panel"><h3>Monthly P&amp;L <span class="nft-muted">— last 12 months</span></h3>
        <table class="nft-table"><thead><tr><th>Month</th><th class="num">Volume</th><th class="num">Platform rev</th><th class="num">Royalties</th><th class="num">Sales</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  // ── NFC Cards tab: manage every chip — register, link, unlink, deactivate ──
  async function paintNfc(body) {
    if (!(await gate(body, 'NFC card management', '🏷️'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading NFC cards…</div>`;
    const r = await apiCall('/api/nfc');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const tags = r.tags || [];
    const STAT = ['unassigned', 'assigned', 'claimed', 'revoked'];
    const byStatus = {}; tags.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    const chipCls = s => (s === 'assigned' || s === 'claimed') ? 'ok' : '';
    const rowsFor = f => {
      const list = f === 'all' ? tags : tags.filter(t => t.status === f);
      return list.map(t => `<tr>
        <td class="nft-mono">${esc(t.uid)}</td>
        <td><span class="nft-chip ${chipCls(t.status)}">${esc(t.status)}</span></td>
        <td class="nft-mono">${t.coin_id ? esc(String(t.coin_id).slice(0, 8)) : '—'}</td>
        <td class="num">${t.tap_count ?? 0}</td>
        <td>${t.coin_id ? `<button class="nft-adm-mini" data-nfc="unlink" data-id="${esc(t.id)}">Unlink</button>` : `<button class="nft-adm-mini" data-nfc="link" data-id="${esc(t.id)}">Link…</button>`} ${t.status !== 'revoked' ? `<button class="nft-adm-mini" data-nfc="deactivate" data-id="${esc(t.id)}">Deactivate</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No cards.</td></tr>`;
    };
    body.innerHTML = `
      <div class="nft-kpis" style="margin-bottom:16px">${STAT.map(s => `<div class="nft-kpi"><span class="k">${byStatus[s] || 0}</span><span class="l">${s}</span></div>`).join('')}</div>
      <section class="nft-panel"><h3>Register a new card</h3><div style="display:flex;gap:8px;max-width:480px"><input class="nft-in" id="nfc-uid" placeholder="New tag UID (from your NFC reader)"/><button class="nft-adm-btn" id="nfc-reg">Register</button></div></section>
      <section class="nft-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0">Cards <span class="nft-muted">${tags.length}</span></h3>
          <div class="nft-tabs" style="border:0;margin:0">${['all', ...STAT].map(f => `<button class="nft-tab${f === 'all' ? ' active' : ''}" data-filter="${f}">${f}</button>`).join('')}</div></div>
        <table class="nft-table"><thead><tr><th>UID</th><th>Status</th><th>Coin</th><th class="num">Taps</th><th></th></tr></thead><tbody id="nfc-rows">${rowsFor('all')}</tbody></table>
      </section>`;
    const wire = () => body.querySelectorAll('[data-nfc]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.nfc, id = b.dataset.id;
      if (act === 'link') { const coin = prompt('Coin ID to link this card to:'); if (!coin) return; const rr = await apiCall('/api/nfc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'link', tag_id: id, coin_id: coin.trim() }) }); if (rr.ok) { H.toast('Linked ✓', 'success'); paintNfc(body); } else H.toast('Failed: ' + (rr.error || ''), 'danger'); return; }
      const rr = await apiCall('/api/nfc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: act, tag_id: id }) });
      if (rr.ok) { H.toast(act + ' ✓', 'success'); paintNfc(body); } else H.toast('Failed: ' + (rr.error || ''), 'danger');
    }));
    body.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { body.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b)); body.querySelector('#nfc-rows').innerHTML = rowsFor(b.dataset.filter); wire(); }));
    body.querySelector('#nfc-reg').addEventListener('click', async () => { const uid = body.querySelector('#nfc-uid').value.trim(); if (!uid) return H.toast('UID required', 'warn'); const rr = await apiCall('/api/nfc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid }) }); if (rr.ok) { H.toast('Card registered ✓', 'success'); paintNfc(body); } else H.toast('Failed: ' + (rr.error || ''), 'danger'); });
    wire();
  }

  // ── Support tab: handle any trade dispute, issue, chat, counterfeit, withdrawal ──
  async function paintSupport(body) {
    if (!(await gate(body, 'Support & dispute tools', '🛟'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading support queue…</div>`;
    const ops = await apiCall('/api/ops');
    if (!ops.ok) { body.innerHTML = `<div class="nft-warn">${esc(ops.error || 'could not load')}</div>`; return; }
    const rows = (arr, fn, empty) => (arr && arr.length) ? arr.map(fn).join('') : `<div class="nft-muted">${empty}</div>`;
    const total = (ops.issues || []).length + (ops.counterfeit || []).length + (ops.withdrawals || []).length + (ops.disputes || []).length;
    body.innerHTML = `
      <div class="${total ? 'nft-adm-warn' : 'nft-adm-ok'}">🛟 ${total ? total + ' item(s) need your attention' : 'All clear — no open disputes, issues, counterfeit reports or withdrawals.'}</div>
      <section class="nft-panel"><h3>Disputed trades</h3>${rows(ops.disputes, d => `<div class="nft-adm-row"><span><span class="nft-mono">${esc(String(d.id).slice(0, 8))}</span> · €${esc(d.total_eur)} · ${esc(d.dispute_reason || 'disputed')}</span><span><button class="nft-adm-mini" data-op="order_status" data-id="${esc(d.id)}" data-status="refunded">Refund buyer</button> <button class="nft-adm-mini" data-op="order_status" data-id="${esc(d.id)}" data-status="completed">Release to seller</button></span></div>`, 'No disputed trades ✓')}</section>
      <section class="nft-panel"><h3>Order issues</h3>${rows(ops.issues, i => `<div class="nft-adm-row"><span><span class="nft-mono">${esc(String(i.order_id).slice(0, 8))}</span> · ${esc(i.reason)} <span class="nft-chip">${esc(i.status)}</span></span><button class="nft-adm-mini" data-op="resolve_issue" data-id="${esc(i.id)}">Resolve</button></div>`, 'No open issues ✓')}</section>
      <section class="nft-panel"><h3>Counterfeit reports</h3>${rows(ops.counterfeit, c => `<div class="nft-adm-row"><span>${esc(c.reason)}${c.tag_uid ? ' · tag ' + esc(c.tag_uid) : ''} <span class="nft-chip">${esc(c.status)}</span></span><span><button class="nft-adm-mini" data-op="resolve_counterfeit" data-id="${esc(c.id)}" data-status="dismissed">Dismiss</button> <button class="nft-adm-mini" data-op="resolve_counterfeit" data-id="${esc(c.id)}" data-status="confirmed">Confirm</button></span></div>`, 'No counterfeit reports ✓')}</section>
      <section class="nft-panel"><h3>Withdrawal requests</h3>${rows(ops.withdrawals, w => `<div class="nft-adm-row"><span>€${esc(w.amount_eur)} · ${esc(w.method)} <span class="nft-chip">${esc(w.status)}</span></span><span><button class="nft-adm-mini" data-op="process_withdrawal" data-id="${esc(w.id)}" data-status="paid">Mark paid</button> <button class="nft-adm-mini" data-op="process_withdrawal" data-id="${esc(w.id)}" data-status="rejected">Reject</button></span></div>`, 'No pending withdrawals ✓')}</section>
      <section class="nft-panel"><h3>Conversations</h3>${rows(ops.conversations, c => `<div class="nft-adm-row"><span>${esc(c.kind)}${c.order_id ? ' · order ' + esc(String(c.order_id).slice(0, 8)) : ''} <span class="nft-muted">${esc(when(c.last_message_at))}</span></span><button class="nft-adm-mini" data-conv="${esc(c.id)}">Open chat</button></div>`, 'No conversations.')}</section>`;
    body.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', async () => {
      const payload = { action: b.dataset.op, id: b.dataset.id };
      if (b.dataset.status) payload.status = b.dataset.status;
      const r = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { H.toast('Done ✓', 'success'); paintSupport(body); }
      else H.toast('Failed: ' + (r.error || 'error'), 'danger');
    }));
    body.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => openChat(b.dataset.conv)));
  }

  async function openChat(convId) {
    let ov = document.querySelector('.nft-modal');
    if (!ov) { ov = document.createElement('div'); ov.className = 'nft-modal'; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="nft-modal-box"><div class="nft-modal-head"><b>Conversation</b><button class="nft-modal-x" data-x>✕</button></div><div class="nft-modal-body"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div><div class="nft-chatbox"><input class="nft-in" id="nft-chat-in" placeholder="Reply as operator…"/><button class="nft-adm-btn" id="nft-chat-send">Send</button></div></div>`;
    ov.classList.add('open');
    ov.querySelector('[data-x]').addEventListener('click', () => ov.classList.remove('open'));
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
    const mb = ov.querySelector('.nft-modal-body');
    async function load() {
      const r = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'messages', conversation_id: convId }) });
      mb.innerHTML = (r.messages || []).map(m => `<div class="nft-cert"><div class="nft-muted">${esc(when(m.created_at))}</div><div>${esc(m.body || '')}</div></div>`).join('') || '<div class="nft-muted">No messages.</div>';
      mb.scrollTop = mb.scrollHeight;
    }
    load();
    ov.querySelector('#nft-chat-send').addEventListener('click', async () => {
      const inp = ov.querySelector('#nft-chat-in'); const t = inp.value.trim(); if (!t) return; inp.value = '';
      const r = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reply', conversation_id: convId, body: t }) });
      if (r.ok) load(); else H.toast('Send failed: ' + (r.error || ''), 'danger');
    });
  }

  // shared gate: returns true if the service key is configured, else paints the notice
  async function gate(body, label, icon) {
    let token = null;
    try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
    if (token) return true;
    body.innerHTML = `<div class="nft-adm-warn">${icon} ${label} — <button class="nft-adm-mini" data-si>🔐 sign in</button> to manage (one-time, just your email — no keys).</div>`;
    const btn = body.querySelector('[data-si]'); if (btn) btn.onclick = () => openSignIn();
    return false;
  }

  // ── Chain & gas: mint/transfer queue + platform wallet balance ──
  async function paintChain(body) {
    if (!(await gate(body, 'Chain & gas monitor', '⛓️'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading chain…</div>`;
    const r = await apiCall('/api/console?view=chain');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'error')}</div>`; return; }
    const c = r.counts || {};
    const kpi = (v, l) => `<div class="nft-kpi"><span class="k">${v}</span><span class="l">${l}</span></div>`;
    const rows = (r.jobs || []).map(j => `<tr><td><span class="nft-chip">${esc(j.type)}</span></td><td><span class="nft-chip ${j.status === 'done' ? 'ok' : ''}">${esc(j.status)}</span></td><td class="num">${j.attempts}</td><td class="nft-mono">${j.tx_hash ? esc(String(j.tx_hash).slice(0, 12)) + '…' : (j.last_error ? esc(String(j.last_error).slice(0, 32)) : '—')}</td><td>${when(j.created_at)}</td><td>${j.status === 'failed' ? `<button class="nft-adm-mini" data-retry="${esc(j.id)}">Retry</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No chain jobs.</td></tr>`;
    body.innerHTML = `
      <div class="nft-kpis" style="margin-bottom:16px">${kpi(r.balance_eth != null ? r.balance_eth.toFixed(4) + ' Ξ' : '—', 'Wallet (Base ETH)')}${kpi(c.queued || 0, 'Queued')}${kpi(c.processing || 0, 'Processing')}${kpi(c.done || 0, 'Done')}${kpi(c.failed || 0, 'Failed')}</div>
      <section class="nft-panel"><h3>Chain jobs <span class="nft-muted">— mint / transfer queue</span></h3><table class="nft-table"><thead><tr><th>Type</th><th>Status</th><th class="num">Attempts</th><th>Tx / error</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`;
    body.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', async () => { const rr = await apiCall('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'retry_chain', id: b.dataset.retry }) }); if (rr.ok) { H.toast('Re-queued ✓', 'success'); paintChain(body); } else H.toast('Failed: ' + (rr.error || ''), 'danger'); }));
  }

  // ── Card production: dealer NFC-card orders → approve / ship / deliver ──
  async function paintCards(body) {
    if (!(await gate(body, 'Card production', '📮'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading card orders…</div>`;
    const r = await apiCall('/api/console?view=cards');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'error')}</div>`; return; }
    const next = { requested: 'approved', approved: 'shipped', shipped: 'delivered' };
    const rows = (r.rows || []).map(o => `<tr><td class="nft-mono">${esc(String(o.dealer_id).slice(0, 8))}</td><td class="num">${o.quantity}</td><td><span class="nft-chip ${o.status === 'delivered' ? 'ok' : ''}">${esc(o.status)}</span></td><td>${esc(o.notes || '')}</td><td>${when(o.created_at)}</td><td>${next[o.status] ? `<button class="nft-adm-mini" data-card="${esc(o.id)}" data-status="${next[o.status]}">Mark ${next[o.status]}</button> ` : ''}${o.status === 'requested' ? `<button class="nft-adm-mini" data-card="${esc(o.id)}" data-status="rejected">Reject</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No card orders.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><h3>Dealer card-production orders <span class="nft-muted">— the NFC cards you ship to dealers</span></h3><table class="nft-table"><thead><tr><th>Dealer</th><th class="num">Qty</th><th>Status</th><th>Notes</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`;
    body.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', async () => { const rr = await apiCall('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'card_status', id: b.dataset.card, status: b.dataset.status }) }); if (rr.ok) { H.toast(b.dataset.status + ' ✓', 'success'); paintCards(body); } else H.toast('Failed: ' + (rr.error || ''), 'danger'); }));
  }

  // ── Audit log: every operator/system action ──
  async function paintAudit(body) {
    if (!(await gate(body, 'Audit log', '📜'))) return;
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading audit log…</div>`;
    const r = await apiCall('/api/console?view=audit');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'error')}</div>`; return; }
    const rows = (r.rows || []).map(a => `<tr><td>${when(a.created_at)}</td><td><span class="nft-chip">${esc(a.action)}</span></td><td class="nft-mono">${a.target ? esc(String(a.target).slice(0, 16)) : '—'}</td><td class="nft-mono">${a.actor_id ? esc(String(a.actor_id).slice(0, 8)) : 'system'}</td></tr>`).join('') || `<tr><td colspan="4" class="nft-muted">No audit entries.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><h3>Audit log <span class="nft-muted">— last 200 actions</span></h3><table class="nft-table"><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  // ── Admin tab: the full operator "circle" (writes via the serverless API) ──
  async function paintAdmin(body) {
    if (!(await gate(body, 'Admin', '⚙️'))) return;
    body.innerHTML = `<div class="nft-adm-ok">● Admin — these actions write live to the platform.</div><div class="nft-adm-grid" id="nft-adm"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div>`;
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
