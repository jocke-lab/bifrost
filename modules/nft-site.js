/* ============================================================================
   bifrost · NFT Platform — the operator control center for the numismatic NFT
   trading platform (opulence-tech). This IS the admin panel: every function the
   old opulence-tech /admin had now lives here.

   Reads/writes go through the keyless Supabase Edge Function `admin` on the nft
   project (mumnyvmxyzsgducbbvxi). It holds the service_role automatically and
   gates on a HUB-JWT + ADMIN_EMAILS allowlist — so no service key lives in the
   browser. Public catalog browsing still reads with the publishable key
   (window.DB.nft).
   ========================================================================== */
(function () {
  const H = window.HELM;

  // ── Sidebar navigation (grouped, control-center style) ──
  const NAV = [
    { group: 'Operate', items: [
      { id: 'overview',    label: 'Needs you',        icon: '🛰️' },
      { id: 'provision',   label: 'Provisioning',     icon: '🃏' },
      { id: 'orders',      label: 'Orders & escrow',  icon: '📦' },
      { id: 'dealers',     label: 'Dealers',          icon: '🏷️' },
      { id: 'cards',       label: 'Card issuance',    icon: '📮' }
    ]},
    { group: 'Money', items: [
      { id: 'sales',       label: 'Sales & royalties', icon: '💶' },
      { id: 'accounting',  label: 'Accounting',        icon: '📊' },
      { id: 'payouts',     label: 'Payouts',           icon: '⬇️' }
    ]},
    { group: 'Trust & chain', items: [
      { id: 'messages',    label: 'Messages',          icon: '💬' },
      { id: 'reports',     label: 'Counterfeit',       icon: '🛡️' },
      { id: 'chain',       label: 'Chain & gas',       icon: '⛓️' },
      { id: 'audit',       label: 'Audit log',         icon: '📜' }
    ]},
    { group: 'Catalog', items: [
      { id: 'catalog',     label: 'Coins',             icon: '🪙' },
      { id: 'collections', label: 'Collections',       icon: '🗂️' },
      { id: 'drops',       label: 'Drops',             icon: '🚀' },
      { id: 'nfc',         label: 'NFC cards',         icon: '📡' },
      { id: 'map',         label: 'Atlas',             icon: '🗺️' }
    ]}
  ];
  const VIEW_META = {
    overview:   ['Needs you', 'Your attention queue. Empty sections mean the platform is running itself.'],
    provision:  ['Collections & card provisioning', 'Approve collections, feature them, and issue one-time-claimable NFC cards per coin.'],
    orders:     ['Orders & escrow', 'Disputes freeze funds until you rule. Escrow releases on confirmed delivery.'],
    dealers:    ['Dealers', 'Approval flips the owner’s account to creator and unlocks the studio.'],
    cards:      ['Card issuance', 'Bulk-issue blank tags to dealers and move card-production orders. Claim codes appear once.'],
    sales:      ['Sales & royalties', 'The settlement ledger — every trade, the fee we kept, the royalty we routed.'],
    accounting: ['Accounting', 'Books derived live from sales. Platform revenue, royalties pass-through, VAT helper.'],
    payouts:    ['Payouts', 'Dealer balance withdrawals awaiting a manual release.'],
    messages:   ['Messages', 'Order issues, dealer lines and trade conversations — reply as the platform.'],
    reports:    ['Counterfeit & authenticity', 'Triage flagged certificates and chips.'],
    chain:      ['Chain & gas', 'The Base settlement queue (mints / transfers). Gas is sponsored by the platform.'],
    audit:      ['Audit log', 'Append-only record of every operator and system action.'],
    catalog:    ['Coins', 'The live catalogue — click a coin to inspect its certificates.'],
    collections:['Collections', 'Every collection on the platform — open one to browse its coins.'],
    drops:      ['Drops', 'Scheduled and live launches.'],
    nfc:        ['NFC cards', 'Every chip — register, link, unlink or deactivate.'],
    map:        ['Atlas', 'A constellation of every collection, sized by how many coins it holds.']
  };
  const PUBLIC_VIEWS = new Set(['catalog', 'collections', 'drops', 'sales', 'map']); // read with publishable key, no sign-in

  let active = 'overview';
  let rootEl = null;

  // ── formatting helpers ──
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const eur = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const eurc = (n) => { n = Number(n || 0); if (n >= 1e6) return '€' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '€' + (n / 1e3).toFixed(1) + 'k'; return '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const ago = (iso) => { if (!iso) return '—'; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (isNaN(s)) return '—'; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; const d = Math.floor(s / 86400); return d < 30 ? d + 'd ago' : Math.floor(d / 30) + 'mo ago'; };
  const sid = (s) => s ? esc(String(s).slice(0, 8)) : '—';
  const thumb = (url, alt) => url ? `<img class="nft-thumb" loading="lazy" src="${esc(url)}" alt="${esc(alt || '')}">` : `<div class="nft-thumb nft-noimg">◇</div>`;
  const DBok = () => !!(window.DB && window.DB.nft);

  function csvDownload(name, header, rows) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const body = [header.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function copyText(t) { try { navigator.clipboard.writeText(t); H.toast('Copied ✓', 'success'); } catch (e) { H.toast('Copy failed', 'warn'); } }

  // ── API: the keyless edge function ──
  const ADMIN_RES = ['dealers', 'collections', 'coins', 'certificates', 'nfc', 'ops', 'accounting', 'console', 'orders', 'provision', 'tags'];
  async function apiCall(path, opts) {
    opts = opts || {};
    try {
      let token = null;
      try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = 'Bearer ' + token;
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
  let _dealerList = null;
  async function dealerList() { if (_dealerList) return _dealerList; const r = await apiCall('/api/dealers'); _dealerList = (r && r.dealers) || []; return _dealerList; }

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
    let ov = document.querySelector('.nft-modal:not(.nft-signin)');
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
      </div>`).join('') || '<div class="nft-muted">No certificate issued for this coin yet — issue one from Provisioning.</div>';
      mb.innerHTML = `<div class="nft-cert-list">${certs}</div>`;
    } catch (e) { mb.innerHTML = `<div class="nft-warn">${esc(e.message)}</div>`; }
  }

  // ── shell ──
  function render(root) {
    rootEl = root;
    const links = NAV.map(g => `
      <div class="nfc-grp-h">${esc(g.group)}</div>
      ${g.items.map(t => `<button class="nfc-link${t.id === active ? ' on' : ''}" data-tab="${t.id}"><span class="nfc-ico">${t.icon}</span>${esc(t.label)}<span class="nfc-badge" data-badge="${t.id}" hidden></span></button>`).join('')}
    `).join('');
    root.innerHTML = `
      <div class="nftsite">
        <div class="nfc-shell">
          <aside class="nfc-aside">
            <div class="nfc-brand">
              <div class="nfc-logo">🌉</div>
              <div class="nfc-bt"><b>NFT Platform</b><span>Operator console</span></div>
            </div>
            <div class="nfc-chips">
              <span class="nft-live" id="nft-live">● live</span>
              <span class="nft-live off" id="nft-auth" style="cursor:pointer">🔐 sign in</span>
            </div>
            <nav class="nfc-nav">${links}</nav>
          </aside>
          <main class="nfc-main">
            <div class="nfc-viewhead" id="nft-vh"></div>
            <div class="nft-body" id="nft-body"></div>
          </main>
        </div>
      </div>`;

    root.querySelectorAll('.nfc-link').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
    if (!DBok()) { const live = root.querySelector('#nft-live'); if (live) { live.textContent = '● offline'; live.classList.add('off'); } }
    updateAuthChip(root);
    paint();
  }

  function go(id) {
    active = id;
    rootEl.querySelectorAll('.nfc-link').forEach(x => x.classList.toggle('on', x.dataset.tab === id));
    const main = rootEl.querySelector('.nfc-main'); if (main) main.scrollIntoView({ block: 'nearest' });
    paint();
  }
  function setBadge(id, n) {
    const el = rootEl && rootEl.querySelector(`[data-badge="${id}"]`); if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; } else { el.hidden = true; }
  }

  async function paint() {
    const vh = rootEl && rootEl.querySelector('#nft-vh');
    const body = rootEl && rootEl.querySelector('#nft-body'); if (!body) return;
    if (vh) { const m = VIEW_META[active] || ['', '']; vh.innerHTML = `<h1>${esc(m[0])}</h1><p>${esc(m[1])}</p>`; }
    if (!DBok()) { body.innerHTML = lockedNote('The live data layer is offline. Ensure assets/data.js and the Supabase script loaded (needs network for the CDN).'); return; }
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Loading…</div>`;
    try {
      const fn = {
        overview: paintOverview, provision: paintProvision, orders: paintOrders, dealers: paintDealers,
        cards: paintCards, sales: paintSales, accounting: paintAccounting, payouts: paintPayouts,
        messages: paintMessages, reports: paintReports, chain: paintChain, audit: paintAudit,
        catalog: paintCatalog, collections: paintCollections, drops: paintDrops, nfc: paintNfc, map: paintMap
      }[active];
      if (fn) await fn(body);
    } catch (e) { body.innerHTML = `<div class="nft-warn">Failed to load: ${esc(e.message)}</div>`; }
  }

  const lockedNote = (msg) => `<div class="nft-locked">🔒 ${esc(msg)}</div>`;
  const kpis = (arr) => `<div class="nft-kpis" style="grid-template-columns:repeat(${Math.min(arr.length, 4)},1fr);margin-bottom:18px">${arr.map(k => `<div class="nft-kpi ${k.cls || ''}"><span class="k">${k.k}</span><span class="l">${esc(k.l)}</span>${k.s ? `<span class="s">${esc(k.s)}</span>` : ''}</div>`).join('')}</div>`;

  // shared gate: returns true if signed in, else paints a sign-in prompt
  async function gate(body) {
    let token = null;
    try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
    if (token) return true;
    body.innerHTML = `<div class="nft-adm-warn">🔐 Sign in with your admin email to manage this — <button class="nft-adm-mini" data-si>Sign in</button></div>`;
    const btn = body.querySelector('[data-si]'); if (btn) btn.onclick = () => openSignIn();
    return false;
  }

  // status chips
  const ORDER_LABEL = { awaiting_shipment: 'awaiting shipment', shipped: 'shipped', delivered: 'delivered', completed: 'completed', cancelled: 'cancelled', refunded: 'refunded', disputed: 'disputed' };
  const orderChip = (s) => `<span class="nft-chip ${s === 'completed' || s === 'delivered' ? 'ok' : s === 'disputed' || s === 'cancelled' || s === 'refunded' ? 'bad' : 'info'}">${esc(ORDER_LABEL[s] || s || '—')}</span>`;
  const dealerChip = (s) => `<span class="nft-chip ${s === 'approved' ? 'ok' : s === 'suspended' ? 'bad' : 'warn'}">${esc(s || '—')}</span>`;
  const cardChip = (s) => `<span class="nft-chip ${s === 'delivered' ? 'ok' : s === 'rejected' ? 'bad' : 'warn'}">${esc(s || '—')}</span>`;

  // ── OVERVIEW · attention queue ──
  async function paintOverview(body) {
    if (!(await gate(body))) return;
    const [ops, ord, dealers, cardsR, chainR, acct, certCount] = await Promise.all([
      apiCall('/api/ops'), apiCall('/api/orders'), apiCall('/api/dealers'),
      apiCall('/api/console?view=cards'), apiCall('/api/console?view=chain'),
      apiCall('/api/accounting'), window.DB.nft_count('certificates').catch(() => 0)
    ]);
    const disputes = ((ord && ord.rows) || []).filter(o => o.status === 'disputed');
    const apps = ((dealers && dealers.dealers) || []).filter(d => d.status === 'pending');
    const cardReq = ((cardsR && cardsR.rows) || []).filter(c => c.status === 'requested');
    const payouts = (ops && ops.withdrawals) || [];
    const counterfeit = (ops && ops.counterfeit) || [];
    const issues = (ops && ops.issues) || [];
    const queued = (chainR && chainR.counts && chainR.counts.queued) || 0;
    const t = (acct && acct.totals) || {};
    const open = disputes.length + apps.length + cardReq.length + payouts.length + counterfeit.length + issues.length + queued;

    setBadge('orders', disputes.length); setBadge('dealers', apps.length); setBadge('cards', cardReq.length);
    setBadge('payouts', payouts.length); setBadge('reports', counterfeit.length); setBadge('messages', issues.length); setBadge('chain', queued);

    const sec = (title, count, tone, inner) => `<section class="nft-panel"><div class="a-head">${esc(title)} <span class="nft-chip ${count ? tone : 'ok'}">${count || 'clear'}</span></div>${count ? inner : '<div class="nfc-empty-ok">✓ Nothing waiting</div>'}</section>`;
    const row = (left, goId, btn) => `<div class="nft-adm-row"><span>${left}</span><button class="nft-adm-mini" data-go="${goId}">${esc(btn)} →</button></div>`;

    body.innerHTML =
      kpis([
        { k: eur(t.fees), l: 'Fee revenue', cls: 'rev' },
        { k: eurc(t.volume), l: 'Settled volume' },
        { k: Number(certCount || 0).toLocaleString('en-US'), l: 'Live certificates' },
        { k: open, l: 'Open actions', cls: open ? 'amber' : '' }
      ]) +
      `<div class="nfc-attn">
        ${sec('Disputed trades', disputes.length, 'bad', disputes.map(d => row(`<span class="nft-mono">${esc(d.label_code || sid(d.id))}</span> · ${esc(d.coin_name || 'coin')} · ${eur(d.total_eur)} · <span class="nft-muted">${esc(d.dispute_reason || 'disputed')}</span>`, 'orders', 'Rule')).join(''))}
        ${sec('Dealer applications', apps.length, 'warn', apps.map(d => row(`<b>${esc(d.name)}</b> <span class="nft-muted">/${esc(d.slug || '')}</span> · ${ago(d.created_at)}`, 'dealers', 'Review')).join(''))}
        ${sec('Card-production requests', cardReq.length, 'warn', cardReq.map(c => row(`${esc(c.dealer_name || sid(c.dealer_id))} · <b>${c.quantity}</b> cards · ${ago(c.created_at)}`, 'cards', 'Open')).join(''))}
        ${sec('Manual payouts', payouts.length, 'warn', payouts.map(w => row(`${eur(w.amount_eur)} · ${esc(w.method || '—')} · ${ago(w.created_at)}`, 'payouts', 'Process')).join(''))}
        ${sec('Counterfeit reports', counterfeit.length, 'bad', counterfeit.map(c => row(`${esc(c.reason || 'report')}${c.tag_uid ? ' · tag ' + esc(c.tag_uid) : ''} · ${ago(c.created_at)}`, 'reports', 'Triage')).join(''))}
        ${sec('Order issues', issues.length, 'warn', issues.map(i => row(`order <span class="nft-mono">${sid(i.order_id)}</span> · ${esc(i.reason || 'issue')} · ${ago(i.created_at)}`, 'messages', 'Open')).join(''))}
        ${sec('Chain queue', queued, 'info', `<div class="nft-adm-row"><span>${queued} job(s) waiting to settle on Base.</span><button class="nft-adm-mini" data-go="chain">Open chain →</button></div>`)}
      </div>`;
    body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  }

  // ── PROVISIONING ──
  async function paintProvision(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/provision');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const rows = r.rows || [];
    const totalCoins = rows.reduce((a, c) => a + (c.coins || 0), 0);
    const totalCards = rows.reduce((a, c) => a + (c.cards_issued || 0), 0);
    const pending = rows.filter(c => !c.approved).length;
    const certBase = (d) => (d && d.custom_domain && d.custom_domain_verified) ? `https://${d.custom_domain}/c/` : 'opulence-tech.vercel.app/c/';
    body.innerHTML =
      kpis([
        { k: rows.length, l: 'Collections' },
        { k: totalCoins.toLocaleString('en-US'), l: 'Coins' },
        { k: totalCards.toLocaleString('en-US'), l: 'Cards issued' },
        { k: pending, l: 'Awaiting approval', cls: pending ? 'amber' : '' }
      ]) +
      (rows.length ? `<div class="nfc-prov">${rows.map(c => {
        const left = `${c.coins - c.cards_issued} of ${c.coins} coins still need a card`;
        return `<section class="nft-panel"><div class="nfc-prov-row">
          <div class="nfc-prov-meta">
            <div class="pm-t">${esc(c.name)} ${c.approved ? '<span class="nft-chip ok">approved</span>' : '<span class="nft-chip warn">pending</span>'}${c.published ? '<span class="nft-chip ok">published</span>' : '<span class="nft-chip">draft</span>'}${c.verified ? '<span class="nft-chip info">✓ verified</span>' : ''}${c.featured ? '<span class="nft-chip special">★ featured</span>' : ''}</div>
            <div class="pm-s"><span>Dealer <b>${esc((c.dealer && c.dealer.name) || '—')}</b></span><span>Coins <b>${c.coins}</b></span><span>Cards <b>${c.cards_issued}</b></span><span>Royalty <b>${(c.royalty_bps || 0) / 100}%</b></span></div>
            <div class="pm-s"><span class="nft-mono">${esc(certBase(c.dealer))}…</span></div>
            <div class="nft-muted" style="margin-top:6px">${esc(left)}</div>
          </div>
          <div class="nfc-prov-act">
            ${!c.approved ? `<button class="nft-adm-btn" data-approve="${esc(c.id)}">Approve &amp; publish</button>` : ''}
            <button class="nft-adm-mini" data-feature="${esc(c.id)}" data-on="${c.featured ? 1 : 0}">${c.featured ? 'Unfeature' : 'Feature'}</button>
            <button class="nft-adm-btn" data-provision="${esc(c.id)}" data-name="${esc(c.name)}" ${c.coins - c.cards_issued <= 0 ? 'disabled style="opacity:.5"' : ''}>Issue ${Math.max(0, c.coins - c.cards_issued)} cards</button>
          </div>
        </div><div class="nfc-prov-out" data-out="${esc(c.id)}"></div></section>`;
      }).join('')}</div>` : `<section class="nft-panel"><div class="nft-muted">No collections yet.</div></section>`);

    body.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; const r2 = await apiCall('/api/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve', id: b.dataset.approve }) });
      if (r2.ok) { H.toast('Approved & published ✓', 'success'); paintProvision(body); } else { b.disabled = false; H.toast('Failed: ' + (r2.error || ''), 'danger'); }
    }));
    body.querySelectorAll('[data-feature]').forEach(b => b.addEventListener('click', async () => {
      const want = b.dataset.on !== '1'; const r2 = await apiCall('/api/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'feature', id: b.dataset.feature, featured: want }) });
      if (r2.ok) { H.toast(want ? 'Featured ✓' : 'Unfeatured', 'success'); paintProvision(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
    body.querySelectorAll('[data-provision]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.provision, name = b.dataset.name, out = body.querySelector(`[data-out="${id}"]`);
      b.disabled = true; b.textContent = 'Issuing…';
      const r2 = await apiCall('/api/provision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collection_id: id }) });
      if (!r2.ok) { b.disabled = false; b.textContent = 'Issue cards'; H.toast('Failed: ' + (r2.error || ''), 'danger'); return; }
      const cards = r2.cards || [];
      if (!cards.length) { out.innerHTML = `<div class="nft-muted" style="margin-top:10px">Every coin already has a card.</div>`; b.textContent = 'All carded'; return; }
      out.innerHTML = `
        <div class="nfc-once">⚠ These claim codes are shown once — download or copy them now.</div>
        <table class="nfc-codes"><thead><tr><th>Coin</th><th>Edition</th><th>UID</th><th>Claim code</th></tr></thead>
        <tbody>${cards.map(c => `<tr><td>${esc(c.coin_name || '')}</td><td>${c.edition_no != null ? '#' + esc(c.edition_no) : '—'}</td><td>${esc(c.uid)}</td><td class="code">${esc(c.claim_code)}</td></tr>`).join('')}</tbody></table>
        <div class="nfc-row-actions" style="margin-top:10px"><button class="nft-adm-mini" data-csv="${id}">⬇ Download CSV</button></div>`;
      out.querySelector('[data-csv]').addEventListener('click', () => csvDownload(`cards-${name.replace(/\W+/g, '-')}.csv`, ['coin', 'edition', 'uid', 'claim_code'], cards.map(c => [c.coin_name, c.edition_no, c.uid, c.claim_code])));
      H.toast(`Issued ${cards.length} card(s) ✓`, 'success'); b.textContent = 'Issue more';
      b.disabled = false;
    }));
  }

  // ── ORDERS & ESCROW ──
  async function paintOrders(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/orders');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const rows = r.rows || [], t = r.totals || {};
    const disputes = rows.filter(o => o.status === 'disputed');
    const tableRows = rows.map(o => `<tr><td class="nft-mono">${esc(o.label_code || sid(o.id))}</td><td>${esc(o.coin_name || '—')}</td><td class="nft-mono">${sid(o.buyer_id)} ← ${sid(o.seller_id)}</td><td>${orderChip(o.status)}</td><td class="num">${eur(o.total_eur)}</td><td>${ago(o.created_at)}</td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No orders.</td></tr>`;
    body.innerHTML =
      kpis([
        { k: eur(t.open_escrow), l: 'Open escrow' },
        { k: t.in_flight || 0, l: 'Orders in flight' },
        { k: t.disputes || 0, l: 'Disputes', cls: t.disputes ? 'bad' : '' }
      ]) +
      (disputes.length ? `<section class="nft-panel"><h3>Disputes <span class="nft-muted">— funds are frozen until you rule</span></h3>${disputes.map(d => `
        <div class="nft-adm-row" style="flex-wrap:wrap;gap:10px">
          <span><span class="nft-mono">${esc(d.label_code || sid(d.id))}</span> · ${esc(d.coin_name || 'coin')} · ${eur(d.total_eur)} · <span class="nft-muted">${esc(d.dispute_reason || 'disputed')}</span></span>
          <span class="nfc-row-actions"><button class="nft-adm-mini" data-rel="${esc(d.id)}">Release to seller</button><button class="nft-adm-mini" data-ref="${esc(d.id)}" style="color:var(--danger);border-color:var(--danger)">Refund buyer</button></span>
        </div>`).join('')}</section>` : '') +
      `<section class="nft-panel"><h3>All orders <span class="nft-muted">— latest 100</span></h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Order</th><th>Coin</th><th>Buyer ← Seller</th><th>Status</th><th class="num">Escrow</th><th>Age</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
    const rule = async (id, toSeller) => {
      const r2 = await apiCall('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'order_status', id, status: toSeller ? 'completed' : 'refunded' }) });
      if (r2.ok) { H.toast(toSeller ? 'Released to seller ✓' : 'Refunded buyer ✓', 'success'); paintOrders(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    };
    body.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => rule(b.dataset.rel, true)));
    body.querySelectorAll('[data-ref]').forEach(b => b.addEventListener('click', () => rule(b.dataset.ref, false)));
  }

  // ── DEALERS ──
  async function paintDealers(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/dealers'); _dealerList = (r && r.dealers) || null;
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const dealers = r.dealers || [];
    const apps = dealers.filter(d => d.status === 'pending');
    const active2 = dealers.filter(d => d.status !== 'pending');
    const domainCell = (d) => d.custom_domain ? `${esc(d.custom_domain)} ${d.custom_domain_verified ? '<span class="nft-chip ok">verified</span>' : '<span class="nft-chip warn">unverified</span>'}` : '<span class="nft-muted">default domain</span>';
    body.innerHTML =
      kpis([
        { k: dealers.length, l: 'Dealers' },
        { k: apps.length, l: 'Applications', cls: apps.length ? 'amber' : '' },
        { k: dealers.filter(d => d.verified).length, l: 'Verified' }
      ]) +
      (apps.length ? `<section class="nft-panel"><h3>Applications <span class="nft-muted">— approval unlocks the studio</span></h3>${apps.map(d => `
        <div class="nft-adm-row" style="flex-wrap:wrap;gap:10px">
          <span><b>${esc(d.name)}</b> <span class="nft-muted">/${esc(d.slug || '')} · ${(d.default_royalty_bps || 0) / 100}% · ${ago(d.created_at)}</span>${d.website ? ` · <a href="${esc(d.website)}" target="_blank" rel="noopener" style="color:var(--accent1)">site ↗</a>` : ''}${d.bio ? `<br><span class="nft-muted">${esc(String(d.bio).slice(0, 160))}</span>` : ''}</span>
          <span class="nfc-row-actions"><button class="nft-adm-btn" data-d-approve="${esc(d.id)}">Approve</button><button class="nft-adm-mini" data-d-suspend="${esc(d.id)}" style="color:var(--danger);border-color:var(--danger)">Reject</button></span>
        </div>`).join('')}</section>` : '') +
      `<section class="nft-panel"><h3>Active dealers</h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Dealer</th><th>Contact</th><th>Domain</th><th class="num">Royalty</th><th>Status</th><th></th></tr></thead><tbody>${active2.map(d => `
        <tr>
          <td><div class="nft-inline">${thumb(d.logo_url, d.name)}<b>${esc(d.name)}</b></div><div class="nft-muted">/${esc(d.slug || '')}</div></td>
          <td>${esc(d.contact_email || '—')}${d.contact_phone ? '<br><span class="nft-muted">' + esc(d.contact_phone) + '</span>' : ''}</td>
          <td>${domainCell(d)}</td>
          <td class="num">${(d.default_royalty_bps || 0) / 100}%</td>
          <td>${dealerChip(d.status)} ${d.verified ? '<span class="nft-chip info">✓</span>' : ''}</td>
          <td><div class="nfc-row-actions">
            ${!d.verified ? `<button class="nft-adm-mini" data-d-verify="${esc(d.id)}">Verify</button>` : ''}
            ${d.status !== 'suspended' ? `<button class="nft-adm-mini" data-d-suspend="${esc(d.id)}" style="color:var(--danger);border-color:var(--danger)">Suspend</button>` : `<button class="nft-adm-mini" data-d-reinstate="${esc(d.id)}">Reinstate</button>`}
            ${d.custom_domain ? (d.custom_domain_verified ? `<button class="nft-adm-mini" data-dom-off="${esc(d.id)}">Unverify domain</button>` : `<button class="nft-adm-mini" data-dom-on="${esc(d.id)}">Mark domain verified</button>`) : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No active dealers.</td></tr>`}</tbody></table></div></section>`;

    const patch = async (payload, msg) => { const r2 = await apiCall('/api/dealers', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); if (r2.ok) { H.toast(msg, 'success'); _dealerList = null; paintDealers(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger'); };
    body.querySelectorAll('[data-d-approve]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.dApprove, action: 'approve' }, 'Dealer approved ✓ — owner is now a creator')));
    body.querySelectorAll('[data-d-verify]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.dVerify, verified: true }, 'Verified ✓')));
    body.querySelectorAll('[data-d-suspend]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.dSuspend, action: 'set_status', status: 'suspended' }, 'Suspended')));
    body.querySelectorAll('[data-d-reinstate]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.dReinstate, action: 'set_status', status: 'approved' }, 'Reinstated ✓')));
    body.querySelectorAll('[data-dom-on]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.domOn, action: 'domain_verified', verified: true }, 'Domain marked verified ✓')));
    body.querySelectorAll('[data-dom-off]').forEach(b => b.addEventListener('click', () => patch({ id: b.dataset.domOff, action: 'domain_verified', verified: false }, 'Domain unverified')));
  }

  // ── CARD ISSUANCE (bulk tags) + card-production orders ──
  async function paintCards(body) {
    if (!(await gate(body))) return;
    const [dealers, cardsR] = await Promise.all([dealerList(), apiCall('/api/console?view=cards')]);
    const dealerOpts = (dealers || []).filter(d => d.status === 'approved').map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    const rows = (cardsR && cardsR.rows) || [];
    const requested = rows.filter(o => o.status === 'requested').length;
    const next = { requested: 'approved', approved: 'shipped', shipped: 'delivered' };
    const orderRows = rows.map(o => `<tr><td>${esc(o.dealer_name || sid(o.dealer_id))}</td><td class="num">${o.quantity}</td><td>${cardChip(o.status)}</td><td>${o.design_url ? `<a href="${esc(o.design_url)}" target="_blank" rel="noopener" style="color:var(--accent1)">design ↗</a>` : ''} ${esc(o.notes || '')}</td><td>${ago(o.created_at)}</td><td><div class="nfc-row-actions">${next[o.status] ? `<button class="nft-adm-mini" data-card="${esc(o.id)}" data-status="${next[o.status]}">Mark ${next[o.status]}</button>` : ''}${o.status === 'requested' ? `<button class="nft-adm-mini" data-card="${esc(o.id)}" data-status="rejected" style="color:var(--danger);border-color:var(--danger)">Reject</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No card orders.</td></tr>`;
    body.innerHTML = `
      <section class="nft-panel"><h3>Issue blank tags to a dealer <span class="nft-muted">— claim codes appear once, never stored in plaintext</span></h3>
        <div class="nfc-seg" style="flex-wrap:wrap;gap:8px">
          <select class="nft-in" id="tag-dealer" style="min-width:200px"><option value="">Select dealer…</option>${dealerOpts}</select>
          <input class="nft-in" id="tag-count" type="number" min="1" max="1000" value="10" style="width:110px" placeholder="count"/>
          <button class="nft-adm-btn" id="tag-go">Issue tags</button>
        </div>
        <div id="tag-out"></div>
      </section>
      <section class="nft-panel"><h3>Card-production orders <span class="nft-muted">${requested ? requested + ' awaiting approval' : '— the physical NFC cards you ship to dealers'}</span></h3>
        <div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Dealer</th><th class="num">Qty</th><th>Status</th><th>Design / notes</th><th>Age</th><th></th></tr></thead><tbody>${orderRows}</tbody></table></div>
      </section>`;
    body.querySelector('#tag-go').addEventListener('click', async () => {
      const dealer_id = body.querySelector('#tag-dealer').value, count = Number(body.querySelector('#tag-count').value || 0);
      if (!dealer_id) return H.toast('Pick a dealer', 'warn');
      if (count < 1) return H.toast('Count must be ≥ 1', 'warn');
      const btn = body.querySelector('#tag-go'); btn.disabled = true; btn.textContent = 'Issuing…';
      const r2 = await apiCall('/api/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dealer_id, count }) });
      btn.disabled = false; btn.textContent = 'Issue tags';
      if (!r2.ok) return H.toast('Failed: ' + (r2.error || ''), 'danger');
      const tags = r2.tags || [];
      const out = body.querySelector('#tag-out');
      out.innerHTML = `<div class="nfc-once">⚠ ${tags.length} tag(s) — claim codes shown once.</div>
        <table class="nfc-codes"><thead><tr><th>UID</th><th>Claim code</th></tr></thead><tbody>${tags.map(t => `<tr><td>${esc(t.uid)}</td><td class="code">${esc(t.claim_code)}</td></tr>`).join('')}</tbody></table>
        <div class="nfc-row-actions" style="margin-top:10px"><button class="nft-adm-mini" id="tag-csv">⬇ Download CSV</button></div>`;
      out.querySelector('#tag-csv').addEventListener('click', () => csvDownload('tags.csv', ['uid', 'claim_code'], tags.map(t => [t.uid, t.claim_code])));
      H.toast(`Issued ${tags.length} tag(s) ✓`, 'success');
    });
    body.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', async () => {
      const r2 = await apiCall('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'card_status', id: b.dataset.card, status: b.dataset.status }) });
      if (r2.ok) { H.toast(b.dataset.status + ' ✓', 'success'); paintCards(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
  }

  // ── SALES (public ledger) ──
  async function paintSales(body) {
    const { data } = await window.DB.nft_read('sales', { select: '*', order: { col: 'created_at', asc: false }, limit: 100 });
    const rows = data || [];
    let vol = 0, fee = 0, roy = 0; rows.forEach(s => { vol += Number(s.price_eur || 0); fee += Number(s.platform_fee_eur || 0); roy += Number(s.royalty_eur || 0); });
    const trs = rows.map(s => `<tr><td>${when(s.created_at)}</td><td class="num">${eur(s.price_eur)}</td><td><span class="nft-chip">${esc(s.rail || '—')}</span></td><td class="num">${eur(s.royalty_eur)}</td><td class="num">${eur(s.platform_fee_eur)}</td><td class="nft-mono">${s.tx_hash ? esc(String(s.tx_hash).slice(0, 10)) + '…' : '—'}</td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No sales.</td></tr>`;
    body.innerHTML =
      kpis([
        { k: eurc(vol), l: 'Volume (last 100)' },
        { k: eur(fee), l: 'Platform fees', cls: 'rev' },
        { k: eur(roy), l: 'Royalties routed' }
      ]) +
      `<section class="nft-panel"><h3>Settlement ledger <span class="nft-muted">— latest 100 trades</span></h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Date</th><th class="num">Price</th><th>Rail</th><th class="num">Royalty</th><th class="num">Platform fee</th><th>Tx</th></tr></thead><tbody>${trs}</tbody></table></div></section>`;
  }

  // ── ACCOUNTING ──
  async function paintAccounting(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/accounting');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const t = r.totals || {}, monthly = r.monthly || [];
    const net = Number(t.fees || 0), momsNet = net / 1.25, moms = net - momsNet;
    const rows = monthly.map(m => `<tr><td>${esc(m.month)}</td><td class="num">${m.count}</td><td class="num">${eur(m.volume)}</td><td class="num">${eur(m.fees)}</td><td class="num">${eur(m.royalties)}</td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No sales yet.</td></tr>`;
    body.innerHTML =
      kpis([
        { k: eur(t.fees), l: 'Fee revenue', cls: 'rev' },
        { k: eurc(t.volume), l: 'Gross volume' },
        { k: eur(t.royalties), l: 'Royalties pass-through' },
        { k: eur(t.payouts), l: 'Payouts paid' }
      ]) +
      `<section class="nft-panel"><h3>Monthly books <span class="nft-muted">— last 12 months, derived live</span></h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Month</th><th class="num">Trades</th><th class="num">Volume</th><th class="num">Fee revenue</th><th class="num">Royalties</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="nfc-row-actions" style="margin-top:12px"><button class="nft-adm-mini" id="acct-csv">⬇ Download monthly CSV</button></div></section>
      <section class="nft-panel"><h3>VAT helper <span class="nft-muted">— Swedish moms 25%, estimate</span></h3>
        <div class="pm-s"><span>Gross fee revenue <b>${eur(net)}</b></span><span>Net (÷1.25) <b>${eur(momsNet)}</b></span><span>Moms to report <b>${eur(moms)}</b></span></div></section>`;
    body.querySelector('#acct-csv').addEventListener('click', () => csvDownload('accounting-monthly.csv', ['month', 'trades', 'volume_eur', 'fee_revenue_eur', 'royalties_eur'], monthly.map(m => [m.month, m.count, m.volume, m.fees, m.royalties])));
  }

  // ── PAYOUTS ──
  async function paintPayouts(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/ops');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const wd = r.withdrawals || [];
    body.innerHTML =
      (wd.length ? `<div class="nft-adm-warn">⬇ ${wd.length} payout(s) awaiting release</div>` : `<div class="nft-adm-ok">No pending payouts — withdrawals are self-serve via Stripe.</div>`) +
      `<section class="nft-panel"><h3>Pending withdrawals</h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>User</th><th class="num">Amount</th><th>Method</th><th>Requested</th><th></th></tr></thead><tbody>${wd.map(w => `<tr><td class="nft-mono">${sid(w.user_id)}</td><td class="num">${eur(w.amount_eur)}</td><td>${esc(w.method || '—')}</td><td>${ago(w.created_at)}</td><td><div class="nfc-row-actions"><button class="nft-adm-mini" data-pay="${esc(w.id)}" data-st="paid">Mark paid</button><button class="nft-adm-mini" data-pay="${esc(w.id)}" data-st="rejected" style="color:var(--danger);border-color:var(--danger)">Reject</button></div></td></tr>`).join('') || `<tr><td colspan="5" class="nft-muted">Nothing pending.</td></tr>`}</tbody></table></div></section>`;
    body.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', async () => {
      const r2 = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'process_withdrawal', id: b.dataset.pay, status: b.dataset.st }) });
      if (r2.ok) { H.toast(b.dataset.st === 'paid' ? 'Marked paid ✓' : 'Rejected', 'success'); paintPayouts(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
  }

  // ── MESSAGES ──
  async function paintMessages(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/ops');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const issues = r.issues || [], convs = r.conversations || [];
    body.innerHTML =
      `<section class="nft-panel"><h3>Order issues ${issues.length ? `<span class="nft-chip bad">${issues.length}</span>` : ''}</h3>${issues.length ? issues.map(i => `<div class="nft-adm-row"><span>order <span class="nft-mono">${sid(i.order_id)}</span> · ${esc(i.reason || 'issue')} <span class="nft-chip">${esc(i.status)}</span> · ${ago(i.created_at)}</span><button class="nft-adm-mini" data-resolve="${esc(i.id)}">Resolve</button></div>`).join('') : '<div class="nfc-empty-ok">✓ No open issues</div>'}</section>
       <section class="nft-panel"><h3>Conversations <span class="nft-muted">— dealer lines &amp; trade chats</span></h3>${convs.length ? convs.map(c => `<div class="nft-adm-row"><span>${esc(c.kind || 'chat')}${c.order_id ? ' · order ' + sid(c.order_id) : c.dealer_id ? ' · dealer ' + sid(c.dealer_id) : ''} <span class="nft-muted">${ago(c.last_message_at)}</span></span><button class="nft-adm-mini" data-conv="${esc(c.id)}">Open chat</button></div>`).join('') : '<div class="nft-muted">No conversations.</div>'}</section>`;
    body.querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', async () => {
      const r2 = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resolve_issue', id: b.dataset.resolve }) });
      if (r2.ok) { H.toast('Resolved ✓', 'success'); paintMessages(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
    body.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => openChat(b.dataset.conv)));
  }

  async function openChat(convId) {
    let ov = document.querySelector('.nft-modal:not(.nft-signin)');
    if (!ov) { ov = document.createElement('div'); ov.className = 'nft-modal'; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="nft-modal-box"><div class="nft-modal-head"><b>Conversation</b><button class="nft-modal-x" data-x>✕</button></div><div class="nft-modal-body"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div><div class="nft-chatbox"><input class="nft-in" id="nft-chat-in" placeholder="Reply as the platform…"/><button class="nft-adm-btn" id="nft-chat-send">Send</button></div></div>`;
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

  // ── COUNTERFEIT REPORTS ──
  async function paintReports(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/ops');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const reports = r.counterfeit || [];
    const opts = ['open', 'reviewing', 'resolved', 'dismissed'];
    body.innerHTML = `<section class="nft-panel"><h3>Counterfeit & authenticity reports ${reports.length ? `<span class="nft-chip bad">${reports.length} open</span>` : ''}</h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Tag / coin</th><th>Reason</th><th>Reporter</th><th>Age</th><th>Status</th></tr></thead><tbody>${reports.map(c => `<tr><td class="nft-mono">${esc(c.tag_uid || '—')}</td><td>${esc(c.reason || '—')}</td><td>${esc(c.reporter_email || 'anon')}</td><td>${ago(c.created_at)}</td><td><select class="nft-in" data-report="${esc(c.id)}" style="height:32px">${opts.map(o => `<option value="${o}" ${c.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('') || `<tr><td colspan="5" class="nfc-empty-ok">✓ No open reports</td></tr>`}</tbody></table></div></section>`;
    body.querySelectorAll('[data-report]').forEach(sel => sel.addEventListener('change', async () => {
      const r2 = await apiCall('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'report_status', id: sel.dataset.report, status: sel.value }) });
      if (r2.ok) H.toast('Updated ✓', 'success'); else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
  }

  // ── CHAIN & GAS ──
  async function paintChain(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/console?view=chain');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'error')}</div>`; return; }
    const c = r.counts || {};
    const rows = (r.jobs || []).map(j => `<tr><td><span class="nft-chip">${esc(j.type)}</span></td><td>${j.to_address ? '<span class="nft-mono">' + esc(String(j.to_address).slice(0, 10)) + '…</span>' : '—'}</td><td><span class="nft-chip ${j.status === 'done' ? 'ok' : j.status === 'failed' ? 'bad' : 'info'}">${esc(j.status)}</span>${j.tx_hash ? ' <span class="nft-mono">' + esc(String(j.tx_hash).slice(0, 10)) + '…</span>' : ''}</td><td class="num">${j.attempts}</td><td>${ago(j.created_at)}</td><td><div class="nfc-row-actions">${j.status === 'failed' ? `<button class="nft-adm-mini" data-retry="${esc(j.id)}">Retry</button>` : ''}${j.status !== 'done' ? `<button class="nft-adm-mini" data-done="${esc(j.id)}">Mark done…</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="6" class="nft-muted">No chain jobs.</td></tr>`;
    body.innerHTML =
      kpis([
        { k: r.balance_eth != null ? r.balance_eth.toFixed(4) + ' Ξ' : '—', l: 'Gas tank (Base)' },
        { k: c.queued || 0, l: 'Queued', cls: c.queued ? 'amber' : '' },
        { k: c.done || 0, l: 'Settled' },
        { k: c.failed || 0, l: 'Failed', cls: c.failed ? 'bad' : '' }
      ]) +
      `<div class="nft-locked">The processor drains this queue automatically on a Vercel cron. Use <b>Retry</b> to re-queue a failed job, or <b>Mark done</b> to record a manual on-chain settlement.</div>
       <section class="nft-panel" style="margin-top:14px"><h3>Chain jobs <span class="nft-muted">— mint / transfer queue</span></h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Type</th><th>To</th><th>Status</th><th class="num">Tries</th><th>Age</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    body.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', async () => { const r2 = await apiCall('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'retry_chain', id: b.dataset.retry }) }); if (r2.ok) { H.toast('Re-queued ✓', 'success'); paintChain(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger'); }));
    body.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', async () => {
      const tx = prompt('Transaction hash (0x…) — leave blank to mark failed:');
      if (tx === null) return;
      const r2 = await apiCall('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'mark_chain_job', id: b.dataset.done, tx: tx.trim() || undefined, failed: tx.trim() ? false : true }) });
      if (r2.ok) { H.toast('Updated ✓', 'success'); paintChain(body); } else H.toast('Failed: ' + (r2.error || ''), 'danger');
    }));
  }

  // ── AUDIT ──
  let auditQ = '';
  async function paintAudit(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/console?view=audit' + (auditQ ? '&q=' + encodeURIComponent(auditQ) : ''));
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'error')}</div>`; return; }
    const rows = (r.rows || []).map(a => `<tr><td>${when(a.created_at)}</td><td><span class="nft-chip ${String(a.action).includes('fail') ? 'bad' : ''}">${esc(a.action)}</span></td><td class="nft-mono">${a.target ? esc(String(a.target).slice(0, 18)) : '—'}</td><td class="nft-mono">${a.actor_id ? sid(a.actor_id) : 'system'}</td></tr>`).join('') || `<tr><td colspan="4" class="nft-muted">No audit entries.</td></tr>`;
    body.innerHTML = `<section class="nft-panel"><div style="display:flex;gap:8px;margin-bottom:12px"><input class="nft-in" id="aud-q" placeholder="Filter by action…" value="${esc(auditQ)}" style="max-width:280px"/><button class="nft-adm-mini" id="aud-go">Search</button>${auditQ ? '<button class="nft-adm-mini" id="aud-clear">Clear</button>' : ''}</div><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    body.querySelector('#aud-go').addEventListener('click', () => { auditQ = body.querySelector('#aud-q').value.trim(); paintAudit(body); });
    body.querySelector('#aud-q').addEventListener('keydown', e => { if (e.key === 'Enter') { auditQ = e.target.value.trim(); paintAudit(body); } });
    const cl = body.querySelector('#aud-clear'); if (cl) cl.addEventListener('click', () => { auditQ = ''; paintAudit(body); });
  }

  // ── CATALOG (public) ──
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
    const { data } = await window.DB.nft_read('collections', { select: 'id,name,slug,cover_url,royalty_bps,published,verified,featured', order: { col: 'created_at', asc: false }, limit: 60 });
    const cards = (data || []).map(c => `
      <button class="nft-card nft-card-btn" data-coll="${esc(c.id)}" data-name="${esc(c.name)}">
        <div class="nft-cardimg">${thumb(c.cover_url, c.name)}</div>
        <div class="nft-cardmeta">
          <b>${esc(c.name)} ${c.verified ? '<span class="nft-chip ok">✓</span>' : ''}${c.featured ? '<span class="nft-chip special">★</span>' : ''}</b>
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
    body.innerHTML = `<section class="nft-panel"><h3>Drops</h3><div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>Title</th><th>Launch</th><th class="num">Supply</th><th class="num">Price</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  // ── NFC cards (admin) ──
  async function paintNfc(body) {
    if (!(await gate(body))) return;
    const r = await apiCall('/api/nfc');
    if (!r.ok) { body.innerHTML = `<div class="nft-warn">${esc(r.error || 'could not load')}</div>`; return; }
    const tags = r.tags || [];
    const STAT = ['unassigned', 'assigned', 'claimed', 'revoked'];
    const byStatus = {}; tags.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    const chipCls = s => (s === 'assigned' || s === 'claimed') ? 'ok' : s === 'revoked' ? 'bad' : '';
    const rowsFor = f => {
      const list = f === 'all' ? tags : tags.filter(t => t.status === f);
      return list.map(t => `<tr>
        <td class="nft-mono">${esc(t.uid)}</td>
        <td><span class="nft-chip ${chipCls(t.status)}">${esc(t.status)}</span></td>
        <td class="nft-mono">${t.coin_id ? sid(t.coin_id) : '—'}</td>
        <td class="num">${t.tap_count ?? 0}</td>
        <td><div class="nfc-row-actions">${t.coin_id ? `<button class="nft-adm-mini" data-nfc="unlink" data-id="${esc(t.id)}">Unlink</button>` : `<button class="nft-adm-mini" data-nfc="link" data-id="${esc(t.id)}">Link…</button>`} ${t.status !== 'revoked' ? `<button class="nft-adm-mini" data-nfc="deactivate" data-id="${esc(t.id)}">Deactivate</button>` : ''}</div></td>
      </tr>`).join('') || `<tr><td colspan="5" class="nft-muted">No cards.</td></tr>`;
    };
    body.innerHTML = `
      ${kpis(STAT.map(s => ({ k: byStatus[s] || 0, l: s })))}
      <section class="nft-panel"><h3>Register a new card</h3><div class="nfc-seg"><input class="nft-in" id="nfc-uid" placeholder="New tag UID (from your NFC reader)" style="max-width:380px"/><button class="nft-adm-btn" id="nfc-reg">Register</button></div></section>
      <section class="nft-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0">Cards <span class="nft-muted">${tags.length}</span></h3>
          <div class="nft-tabs" style="border:0;margin:0">${['all', ...STAT].map(f => `<button class="nft-tab${f === 'all' ? ' active' : ''}" data-filter="${f}">${f}</button>`).join('')}</div></div>
        <div class="nfc-tablewrap"><table class="nft-table"><thead><tr><th>UID</th><th>Status</th><th>Coin</th><th class="num">Taps</th><th></th></tr></thead><tbody id="nfc-rows">${rowsFor('all')}</tbody></table></div>
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

  // ── ATLAS: constellation map of collections ──
  async function paintMap(body) {
    body.innerHTML = `<div class="nft-loading"><span class="nft-spin"></span> Building the atlas…</div>`;
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
      const col = c.verified ? '#46E6A6' : (c.published ? '#19D3FF' : '#5a6b82');
      conns += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
      nodes += `<g class="nft-mapnode" data-id="${esc(c.id)}" data-name="${esc(c.name)}">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" fill="${col}" opacity="0.85"/>
        ${c.featured ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad + 4}" fill="none" stroke="#F5A524" stroke-width="1.5"/>` : ''}
        ${c.coins >= Math.max(2, maxC * 0.25) ? `<text x="${x.toFixed(1)}" y="${(y + rad + 12).toFixed(1)}" text-anchor="middle" font-size="10">${esc(c.name).slice(0, 18)}</text>` : ''}
        <title>${esc(c.name)} · ${c.coins} coins${c.verified ? ' · verified' : ''}</title>
      </g>`;
    });
    body.innerHTML = `
      <section class="nft-panel">
        <h3>Platform atlas <span class="nft-muted">— ${list.length} collections sized by coins · 🟢 verified · 🔵 published · ⚪ draft · click to open</span></h3>
        <div class="nft-map"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMid meet">
          ${conns}
          <circle class="nft-hub" cx="${cx}" cy="${cy}" r="26"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#07111a">OPV</text>
          ${nodes}
        </svg></div>
      </section>`;
    body.querySelectorAll('.nft-mapnode').forEach(n => n.addEventListener('click', () => { active = 'collections'; rootEl.querySelectorAll('.nfc-link').forEach(x => x.classList.toggle('on', x.dataset.tab === 'collections')); const b = rootEl.querySelector('#nft-body'); const vh = rootEl.querySelector('#nft-vh'); const m = VIEW_META.collections; vh.innerHTML = `<h1>${esc(m[0])}</h1><p>${esc(m[1])}</p>`; paintCollectionDetail(b, n.dataset.id, n.dataset.name); }));
  }

  H.register({ id: 'nft-site', label: 'NFT Platform', icon: '🪙', scope: 'company', render });
})();
