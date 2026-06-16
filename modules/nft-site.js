/* ============================================================================
   OPX · NFT Platform — operator console (v3)
   The control room for running the numismatic NFT marketplace. Quiet-luxury
   obsidian + champagne, a cohesive line-icon set (no emoji), plain language.
   Global search + Cmd-K, command center, users/dealers with full record detail
   + levers, orders & escrow + dispute resolution, marketplace moderation, a
   live chat inbox, finance, blockchain settlement, trust & safety, audit.

   Privileged reads/writes go through the keyless `admin` Supabase Edge Function
   (service role + HUB-JWT + ADMIN_EMAILS allowlist). No service key in browser.
   ========================================================================== */
(function () {
  const H = window.HELM;
  const EDGE = 'https://mumnyvmxyzsgducbbvxi.supabase.co/functions/v1/admin/';
  const PUBKEY = 'sb_publishable__oUKNAdEnZrqxyxvkUadmQ_tjdg74my';
  const ADMIN_RES = new Set(['stats', 'search', 'users', 'balance', 'listings', 'royalties', 'inbox', 'dealers', 'collections', 'coins', 'certificates', 'nfc', 'ops', 'accounting', 'console', 'orders', 'provision', 'tags', 'sales']);

  /* ── line-icon set (injected at build; Lucide-grade) ── */
  const ICON = {"overview":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/></svg>","users":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19\"/><circle cx=\"10\" cy=\"7.5\" r=\"3.2\"/><path d=\"M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4\"/><path d=\"M15.5 4.6a3.2 3.2 0 0 1 0 6\"/></svg>","dealers":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 9.5V20h16V9.5\"/><path d=\"M3 9.5 4.6 4h14.8L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z\"/><path d=\"M10 20v-4.5h4V20\"/></svg>","orders":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 8 12 3 3 8v8l9 5 9-5V8Z\"/><path d=\"M3 8l9 5 9-5\"/><path d=\"M12 13v8\"/><path d=\"M7.5 5.5 16.5 10.5\"/></svg>","listings":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3.5 12.5 11 5a2 2 0 0 1 1.4-.6H19a1.5 1.5 0 0 1 1.5 1.5v6.6a2 2 0 0 1-.6 1.4l-7.5 7.5a2 2 0 0 1-2.8 0L3.5 15.3a2 2 0 0 1 0-2.8Z\"/><circle cx=\"16\" cy=\"8\" r=\"1.3\"/></svg>","sales":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 3h11a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z\"/><path d=\"M14 8.5a3 3 0 1 0 0 5\"/><path d=\"M8 10h5\"/><path d=\"M8 12.5h5\"/></svg>","drops":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3c2.8 1.4 4.5 4.3 4.5 7.5 0 2.2-.8 4-2 5.5h-5c-1.2-1.5-2-3.3-2-5.5C7.5 7.3 9.2 4.4 12 3Z\"/><circle cx=\"12\" cy=\"9.5\" r=\"1.6\"/><path d=\"M9.5 16c-1.8.6-2.8 2.2-3 4.5 2.3-.2 3.9-1.2 4.5-3\"/><path d=\"M14.5 16c1.8.6 2.8 2.2 3 4.5-2.3-.2-3.9-1.2-4.5-3\"/></svg>","collections":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3 3 7.5 12 12l9-4.5L12 3Z\"/><path d=\"M3 12l9 4.5L21 12\"/><path d=\"M3 16.5 12 21l9-4.5\"/></svg>","coins":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"9\" cy=\"9\" r=\"5.5\"/><path d=\"M15.5 5.2a5.5 5.5 0 0 1 0 11.6\"/><path d=\"M13.5 18.8a5.5 5.5 0 0 1-9-4.2\"/></svg>","provision":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.5\"/><circle cx=\"8.5\" cy=\"11\" r=\"2\"/><path d=\"M5.5 16c.4-1.5 1.6-2.3 3-2.3s2.6.8 3 2.3\"/><path d=\"M14.5 10h4\"/><path d=\"M14.5 13.5h3\"/></svg>","nfc":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 8.5a10 10 0 0 1 0 7\"/><path d=\"M8.5 6.5a14 14 0 0 1 0 11\"/><path d=\"M12 4.5a18 18 0 0 1 0 15\"/><circle cx=\"17.5\" cy=\"12\" r=\"1.3\"/></svg>","finance":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 4v15a1 1 0 0 0 1 1h15\"/><rect x=\"7\" y=\"12\" width=\"3\" height=\"5\" rx=\"0.5\"/><rect x=\"12\" y=\"8\" width=\"3\" height=\"9\" rx=\"0.5\"/><rect x=\"17\" y=\"5\" width=\"3\" height=\"12\" rx=\"0.5\"/></svg>","payouts":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4v10\"/><path d=\"M8 10l4 4 4-4\"/><path d=\"M5 19h14\"/></svg>","royalties":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 8l3.5 9h9L20 8l-4.5 3.5L12 6 8.5 11.5 4 8Z\"/><path d=\"M7 20h10\"/></svg>","inbox":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3.5V17a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z\"/><path d=\"M8.5 9.5h7\"/><path d=\"M8.5 12.5h4\"/></svg>","disputes":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4v16\"/><path d=\"M7 7h10\"/><path d=\"M7 7 4 13h6L7 7Z\"/><path d=\"M17 7l-3 6h6l-3-6Z\"/><path d=\"M8 20h8\"/></svg>","counterfeit":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3 5 6v5.5c0 4.2 2.8 7.3 7 9 4.2-1.7 7-4.8 7-9V6l-7-3Z\"/><path d=\"M12 8.5v3.5\"/><path d=\"M12 15.2h.01\"/></svg>","chain":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5\"/><path d=\"M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5\"/></svg>","audit":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6l1.5 1.5L8 5\"/><path d=\"M4 12l1.5 1.5L8 11\"/><path d=\"M4 18l1.5 1.5L8 17\"/><path d=\"M11 6h9\"/><path d=\"M11 12h9\"/><path d=\"M11 18h9\"/></svg>","search":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"M20 20l-4.8-4.8\"/></svg>","command":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 9h6v6H9V9Z\"/><path d=\"M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Z\"/><path d=\"M15 9h2.5A2.5 2.5 0 1 0 15 6.5V9Z\"/><path d=\"M9 15v2.5A2.5 2.5 0 1 1 6.5 15H9Z\"/><path d=\"M15 15h2.5A2.5 2.5 0 1 1 15 17.5V15Z\"/></svg>","refresh":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 11a8 8 0 1 0-1.5 5.5\"/><path d=\"M20 5v6h-6\"/></svg>","close":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 6l12 12\"/><path d=\"M18 6 6 18\"/></svg>","menu":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 7h16\"/><path d=\"M4 12h16\"/><path d=\"M4 17h16\"/></svg>","copy":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg>","send":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 3 10.5 13.5\"/><path d=\"M21 3 14.5 21l-4-7.5L3 9.5 21 3Z\"/></svg>","external":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 4h6v6\"/><path d=\"M20 4 10 14\"/><path d=\"M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5\"/></svg>","plus":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14\"/><path d=\"M5 12h14\"/></svg>","check":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5 10 17.5 19.5 7\"/></svg>","alert":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4 2.5 20h19L12 4Z\"/><path d=\"M12 10v4\"/><path d=\"M12 17h.01\"/></svg>","chevronRight":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 5l7 7-7 7\"/></svg>","wallet":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1 1 0 0 1 1 1v1.5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"12\" rx=\"2.5\"/><path d=\"M21 11h-4a2 2 0 0 0 0 4h4\"/><path d=\"M16.5 13h.01\"/></svg>","shield":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3 5 6v5.5c0 4.2 2.8 7.3 7 9 4.2-1.7 7-4.8 7-9V6l-7-3Z\"/></svg>","clock":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/></svg>","image":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><circle cx=\"8.5\" cy=\"9\" r=\"1.6\"/><path d=\"M4 17l4.5-4.5a2 2 0 0 1 2.8 0L17 18\"/><path d=\"M14 15l1.8-1.8a2 2 0 0 1 2.8 0L21 15.5\"/></svg>","dot":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3.5\" fill=\"currentColor\" stroke=\"none\"/></svg>","brand":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 16a9 9 0 0 1 18 0\"/><path d=\"M12 3.5 18 9l-6 7.5L6 9l6-5.5Z\"/></svg>"};
  const icRaw = (k) => (ICON[k] || '').replace('<svg ', '<svg class="opx-ic" ');
  const ic = (k) => '<span class="opx-icw">' + icRaw(k) + '</span>';

  /* ── helpers ── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const eur2 = (n) => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eurc = (n) => { n = Number(n || 0); if (Math.abs(n) >= 1e6) return '€' + (n / 1e6).toFixed(2) + 'M'; if (Math.abs(n) >= 1e3) return '€' + (n / 1e3).toFixed(1) + 'k'; return '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const dt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const ago = (iso) => { if (!iso) return '—'; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (isNaN(s)) return '—'; if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; const d = Math.floor(s / 86400); return d < 30 ? d + 'd' : Math.floor(d / 30) + 'mo'; };
  const sid = (s) => s ? String(s).slice(0, 8) : '—';
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const mono = (s) => `<span class="opx-id">${esc(s)}</span>`;
  const copyable = (s) => s ? `<span class="opx-idcell"><span class="opx-id">${esc(String(s).slice(0, 10))}${String(s).length > 10 ? '…' : ''}</span><span class="opx-copy" data-copy="${esc(s)}" title="Copy">${icRaw('copy')}</span></span>` : '—';
  const img = (url, cls) => url ? `<img class="opx-av ${cls || ''}" loading="lazy" src="${esc(url)}" alt="">` : `<div class="opx-av opx-av-ph ${cls || ''}">${icRaw('image')}</div>`;

  const TONE = {
    order: (s) => (['completed', 'delivered'].includes(s) ? 'ok' : ['disputed', 'cancelled', 'refunded'].includes(s) ? 'bad' : 'info'),
    dealer: (s) => (s === 'approved' ? 'ok' : s === 'suspended' ? 'bad' : 'warn'),
    listing: (s) => (s === 'active' ? 'ok' : s === 'sold' ? 'info' : 'mut'),
    nfc: (s) => (['assigned', 'claimed'].includes(s) ? 'ok' : s === 'revoked' ? 'bad' : 'mut'),
    card: (s) => (s === 'delivered' ? 'ok' : s === 'rejected' ? 'bad' : 'warn'),
    chain: (s) => (s === 'done' ? 'ok' : s === 'failed' ? 'bad' : 'info'),
    role: (s) => (s === 'admin' ? 'info' : s === 'creator' ? 'ok' : 'mut'),
  };
  const pill = (text, tone, dot) => `<span class="opx-pill ${tone || 'mut'}${dot ? ' dot' : ''}">${esc(text || '—')}</span>`;

  function toast(msg, kind) {
    msg = String(msg).replace(/[✓✕⚠⬇★◇⧉]/g, '').replace(/\s+/g, ' ').trim();
    let w = document.querySelector('.opx-toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'opx-toast-wrap'; document.body.appendChild(w); }
    const t = document.createElement('div'); t.className = 'opx-toast ' + (kind || ''); t.textContent = msg; w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; setTimeout(() => t.remove(), 260); }, 2600);
  }
  const emptyState = (icon, title, sub) => `<div class="opx-empty">${icRaw(icon || 'check')}<div class="et">${esc(title)}</div>${sub ? `<div class="es">${esc(sub)}</div>` : ''}</div>`;

  /* ── API ── */
  async function token() { try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; return s && s.access_token; } catch (e) { return null; } }
  async function api(path, opts) {
    opts = opts || {};
    try {
      const headers = Object.assign({}, opts.headers || {});
      const tk = await token(); if (tk) headers.Authorization = 'Bearer ' + tk;
      let target = path;
      const mm = path.match(/^\/api\/([a-z-]+)(.*)$/);
      if (mm && ADMIN_RES.has(mm[1])) { target = EDGE + mm[1] + (mm[2] || ''); headers.apikey = PUBKEY; }
      const r = await fetch(target, Object.assign({}, opts, { headers }));
      const txt = await r.text(); let data; try { data = JSON.parse(txt); } catch (e) { return { ok: false, _offline: true }; }
      if (r.status === 401 || r.status === 403 || data.unauthorized || data.forbidden) { data.unauthorized = true; openSignIn(); }
      return data;
    } catch (e) { return { ok: false, _offline: true, error: e.message }; }
  }
  const get = (p) => api(p);
  const post = (res, body) => api('/api/' + res, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const patch = (res, body) => api('/api/' + res, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  /* ── auth ── */
  let myId = null;
  async function whoami() { try { const u = await window.DB.auth.getUser(); myId = u && u.id; return u; } catch (e) { return null; } }
  function openSignIn() {
    if (document.querySelector('#opx-signin')) return;
    const ov = document.createElement('div'); ov.className = 'opx-modal'; ov.id = 'opx-signin';
    ov.innerHTML = `<div class="opx-modal-box"><h4>Operator sign-in</h4><p>Sign in with your admin email to take control of the platform.</p>
      <input class="opx-inp" id="si-e" type="email" value="arivd.arvidsson@gmail.com" placeholder="email" style="width:100%;margin-bottom:8px"/>
      <input class="opx-inp" id="si-p" type="password" placeholder="password" style="width:100%"/>
      <div class="opx-modal-acts"><button class="opx-btn ghost" id="si-magic">Magic link</button><button class="opx-btn pri" id="si-go">Sign in</button></div>
      <div id="si-m" style="font-size:12px;color:var(--t3);margin-top:8px"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    const msg = ov.querySelector('#si-m');
    ov.querySelector('#si-go').onclick = async () => {
      const e = ov.querySelector('#si-e').value.trim(), p = ov.querySelector('#si-p').value; if (!e || !p) { msg.textContent = 'Enter email + password.'; return; }
      msg.textContent = 'Signing in…';
      try { const r = await window.DB.auth.signInPassword(e, p); if (r && r.error) { msg.textContent = r.error.message; return; } toast('Signed in', 'ok'); ov.remove(); whoami().then(() => { updateAuth(); paint(); }); } catch (x) { msg.textContent = x.message; }
    };
    ov.querySelector('#si-magic').onclick = async () => { const e = ov.querySelector('#si-e').value.trim(); if (!e) { msg.textContent = 'Enter email first.'; return; } try { const r = await window.DB.auth.signInMagicLink(e); msg.textContent = (r && r.error) ? r.error.message : 'Magic link sent — open it, then return.'; } catch (x) { msg.textContent = x.message; } };
  }
  async function updateAuth() {
    const el = root && root.querySelector('#opx-auth'); if (!el) return;
    let u = null; try { u = await window.DB.auth.getUser(); } catch (e) {}
    if (u && u.email) { el.textContent = u.email.split('@')[0]; el.title = 'Signed in — click to sign out'; el.onclick = async () => { try { await window.DB.auth.signOut(); } catch (e) {} toast('Signed out'); updateAuth(); paint(); }; }
    else { el.textContent = 'sign in'; el.onclick = openSignIn; }
  }

  /* ── primitives ── */
  function kpis(items, cols) {
    return `<div class="opx-kpis" style="grid-template-columns:repeat(${cols || Math.min(items.length, 4)},1fr)">${items.map((k) => `
      <div class="opx-kpi ${k.cls || ''}">
        <span class="l">${esc(k.l)}</span>
        <span class="v opx-num">${k.v}</span>
        ${k.s ? `<span class="s">${k.s}</span>` : ''}
      </div>`).join('')}</div>`;
  }
  function table(cols, rows, opts) {
    opts = opts || {};
    const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.h)}</th>`).join('');
    const body = rows.length ? rows.map((r) => `<tr class="${opts.click ? 'click' : ''}" ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="empty" colspan="${cols.length}">${esc(opts.empty || 'Nothing here.')}</td></tr>`;
    return `<div class="opx-tablewrap"><table class="opx-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const loading = () => `<div class="opx-loading"><span class="opx-spin"></span> Loading…</div>`;
  function wireCopy(scope) { scope.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); try { navigator.clipboard.writeText(b.dataset.copy); toast('Copied', 'ok'); } catch (x) {} })); }

  /* ── slide-over ── */
  function sheet(title, metaHtml, bodyHtml, actsHtml) {
    let ov = document.querySelector('#opx-over'); if (!ov) { ov = document.createElement('div'); ov.id = 'opx-over'; ov.className = 'opx-over'; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="opx-sheet"><div class="opx-sheet-h"><div style="min-width:0"><div class="ttl">${title}</div><div class="meta">${metaHtml || ''}</div></div><button class="opx-sheet-x" data-x>${icRaw('close')}</button></div><div class="opx-sheet-b">${bodyHtml}</div>${actsHtml ? `<div class="opx-sheet-acts">${actsHtml}</div>` : ''}</div>`;
    ov.classList.add('open');
    ov.querySelector('[data-x]').onclick = () => ov.classList.remove('open');
    ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
    wireCopy(ov);
    return ov;
  }
  const facts = (pairs) => `<div class="opx-facts">${pairs.map((p) => `<div class="opx-fact"><div class="k">${esc(p[0])}</div><div class="v">${p[1]}</div></div>`).join('')}</div>`;

  /* ── confirm (with optional reason) ── */
  function confirmAct(opts) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'opx-modal';
      ov.innerHTML = `<div class="opx-modal-box"><h4>${esc(opts.title)}</h4><p>${esc(opts.body || '')}</p>
        ${opts.reason ? `<input class="opx-inp" id="cf-r" placeholder="${esc(opts.reasonPlaceholder || 'Reason (logged)')}" style="width:100%"/>` : ''}
        <div class="opx-modal-acts"><button class="opx-btn ghost" data-c>Cancel</button><button class="opx-btn ${opts.danger ? 'danger' : 'pri'}" data-ok>${esc(opts.ok || 'Confirm')}</button></div></div>`;
      document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
      ov.querySelector('[data-c]').onclick = () => done(null);
      ov.querySelector('[data-ok]').onclick = () => done({ reason: opts.reason ? (ov.querySelector('#cf-r').value || '') : true });
      const r = ov.querySelector('#cf-r'); if (r) r.focus();
    });
  }

  /* ── navigation ── */
  const NAV = [
    { g: 'Command', items: [{ id: 'overview', l: 'Overview' }] },
    { g: 'People', items: [{ id: 'users', l: 'Users' }, { id: 'dealers', l: 'Dealers' }] },
    { g: 'Commerce', items: [{ id: 'orders', l: 'Orders & escrow' }, { id: 'listings', l: 'Listings' }, { id: 'sales', l: 'Sales' }, { id: 'drops', l: 'Drops' }] },
    { g: 'Catalog', items: [{ id: 'collections', l: 'Collections' }, { id: 'coins', l: 'Coins' }, { id: 'provision', l: 'Provisioning' }, { id: 'nfc', l: 'NFC cards' }] },
    { g: 'Money', items: [{ id: 'finance', l: 'Finance' }, { id: 'payouts', l: 'Payouts' }, { id: 'royalties', l: 'Royalties' }] },
    { g: 'Trust & ops', items: [{ id: 'inbox', l: 'Inbox' }, { id: 'disputes', l: 'Disputes' }, { id: 'counterfeit', l: 'Counterfeit' }, { id: 'chain', l: 'Blockchain' }, { id: 'audit', l: 'Audit log' }] },
  ];
  const META = {
    overview: ['Command center', 'Live health of the platform and everything that needs you right now.'],
    users: ['Users', 'Every collector and account — open one to inspect, credit, role, or suspend.'],
    dealers: ['Dealers', 'Sellers and their lifecycle — approve, verify, suspend, set royalties, connect domains.'],
    orders: ['Orders & escrow', 'Funds are held until delivery. Resolve disputes, refund, release or cancel.'],
    listings: ['Marketplace listings', 'Everything for sale — moderate, take down, inspect.'],
    sales: ['Sales ledger', 'Every settled trade, the fee kept and the royalty routed.'],
    drops: ['Drops', 'Scheduled and live launches.'],
    collections: ['Collections', 'Approve, feature and inspect every collection.'],
    coins: ['Coins', 'The live catalogue.'],
    provision: ['Provisioning', 'Issue one-time-claimable NFC cards for each coin.'],
    nfc: ['NFC cards', 'Every chip — register, link, unlink, deactivate.'],
    finance: ['Finance', 'Platform revenue, volume, royalties pass-through and the VAT helper.'],
    payouts: ['Payouts', 'Dealer withdrawals awaiting a manual release.'],
    royalties: ['Royalties', 'Creator royalty payouts routed at settlement.'],
    inbox: ['Inbox', 'Every conversation on the platform — read and reply as the operator.'],
    disputes: ['Disputes', 'Frozen trades awaiting your ruling.'],
    counterfeit: ['Counterfeit & authenticity', 'Triage flagged chips and certificates.'],
    chain: ['Blockchain', 'Certificate creation & transfer activity on Base — network fees are covered by us.'],
    audit: ['Audit log', 'Append-only record of every action.'],
  };
  const ALL = NAV.flatMap((g) => g.items);

  let root = null, active = 'overview', statsCache = null;

  function render(el) {
    root = el;
    const links = NAV.map((g) => `<div class="opx-grp">${esc(g.g)}</div>${g.items.map((t) => `<button class="opx-link${t.id === active ? ' on' : ''}" data-tab="${t.id}">${ic(t.id)}${esc(t.l)}<span class="ct" data-badge="${t.id}" hidden></span></button>`).join('')}`).join('');
    el.innerHTML = `<div class="opx"><div class="opx-shell">
      <aside class="opx-rail" id="opx-rail">
        <div class="opx-brand"><div class="mk">${icRaw('brand')}</div><div><b>NFT Platform</b><span>Operator console</span></div></div>
        <nav class="opx-nav">${links}</nav>
        <div class="opx-railfoot"><span class="opx-live" id="opx-live">live</span><span id="opx-auth" style="cursor:pointer;margin-left:auto;text-decoration:underline">sign in</span></div>
      </aside>
      <main class="opx-main">
        <div class="opx-top">
          <button class="opx-topbtn opx-burger" id="opx-burger">${icRaw('menu')}</button>
          <div class="opx-search">
            <span class="sx">${icRaw('search')}</span>
            <input id="opx-q" placeholder="Search users, dealers, coins, orders, certificates, tags…" autocomplete="off"/>
            <span class="kbd">⌘K</span>
            <div class="opx-results" id="opx-res" style="display:none"></div>
          </div>
          <button class="opx-topbtn" id="opx-refresh" title="Refresh">${icRaw('refresh')}</button>
        </div>
        <div class="opx-body" id="opx-body"></div>
      </main>
    </div></div>`;

    el.querySelectorAll('.opx-link').forEach((b) => b.addEventListener('click', () => { go(b.dataset.tab); el.querySelector('#opx-rail').classList.remove('open'); }));
    el.querySelector('#opx-burger').onclick = () => el.querySelector('#opx-rail').classList.toggle('open');
    el.querySelector('#opx-refresh').onclick = () => { statsCache = null; paint(); toast('Refreshed'); };
    setupSearch(el);
    setupCmdK();
    if (!(window.DB && window.DB.nft)) { const lv = el.querySelector('#opx-live'); if (lv) { lv.textContent = 'offline'; lv.classList.add('off'); } }
    whoami().then(updateAuth);
    loadBadges();
    paint();
  }

  function go(id) {
    if (!META[id]) return;
    active = id;
    root.querySelectorAll('.opx-link').forEach((x) => x.classList.toggle('on', x.dataset.tab === id));
    paint();
  }
  function setBadge(id, n, bad) { const el = root && root.querySelector(`[data-badge="${id}"]`); if (!el) return; if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; el.classList.toggle('bad', !!bad); } else el.hidden = true; }

  async function loadBadges() {
    const s = await get('/api/stats'); if (!s || !s.ok) return; statsCache = s; const c = s.counts || {};
    setBadge('orders', c.disputes, true); setBadge('dealers', c.dealer_pending); setBadge('payouts', c.withdrawals);
    setBadge('counterfeit', c.counterfeit, true); setBadge('chain', c.chain_queued); setBadge('disputes', c.disputes, true);
  }

  async function paint() {
    const body = root && root.querySelector('#opx-body'); if (!body) return;
    body.innerHTML = loading();
    try {
      const fn = VIEWS[active]; if (fn) await fn(body); else body.innerHTML = emptyState('clock', 'Coming soon');
    } catch (e) { body.innerHTML = emptyState('alert', 'Failed to load', e.message); }
    wireCopy(body);
  }
  function headHTML(id, actions) { const m = META[id]; return `<div class="opx-head"><div><h1>${esc(m[0])}</h1><p>${esc(m[1])}</p></div>${actions ? `<div class="opx-actions">${actions}</div>` : ''}</div>`; }

  /* ── global search ── */
  function setupSearch(el) {
    const inp = el.querySelector('#opx-q'), box = el.querySelector('#opx-res');
    const run = debounce(async () => {
      const q = inp.value.trim(); if (q.length < 2) { box.style.display = 'none'; return; }
      const r = await get('/api/search?q=' + encodeURIComponent(q));
      const res = (r && r.results) || {};
      const grp = (title, arr, fmt) => arr && arr.length ? `<div class="opx-res-grp">${title}</div>${arr.map(fmt).join('')}` : '';
      box.innerHTML = [
        grp('Users', res.users, (u) => `<div class="opx-res" data-nav="user:${esc(u.id)}"><span class="rt">${esc(u.username || u.display_name || 'user')}</span><span class="rs">${esc(u.role || '')}</span></div>`),
        grp('Dealers', res.dealers, (d) => `<div class="opx-res" data-nav="dealer:${esc(d.id)}"><span class="rt">${esc(d.name)}</span><span class="rs">${esc(d.status || '')}</span></div>`),
        grp('Coins', res.coins, (c) => `<div class="opx-res" data-nav="coins"><span class="rt">${esc(c.name)}</span><span class="rs">coin</span></div>`),
        grp('Collections', res.collections, (c) => `<div class="opx-res" data-nav="collections"><span class="rt">${esc(c.name)}</span><span class="rs">collection</span></div>`),
        grp('Orders', res.orders, (o) => `<div class="opx-res" data-nav="order:${esc(o.id)}"><span class="rt">${esc(o.label_code || sid(o.id))}</span><span class="rs">${esc(o.status || '')}</span></div>`),
        grp('Certificates', res.certificates, (c) => `<div class="opx-res" data-nav="coins"><span class="rt">${esc(c.serial)}</span><span class="rs">certificate</span></div>`),
        grp('NFC tags', res.tags, (t) => `<div class="opx-res" data-nav="nfc"><span class="rt">${esc(t.uid)}</span><span class="rs">${esc(t.status || '')}</span></div>`),
      ].join('') || `<div class="opx-res-grp">No matches</div>`;
      box.style.display = 'block';
      box.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { box.style.display = 'none'; inp.value = ''; navTo(b.dataset.nav); }));
    }, 220);
    inp.addEventListener('input', run);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.style.display = 'none'; inp.blur(); } });
    document.addEventListener('click', (e) => { if (!el.querySelector('.opx-search').contains(e.target)) box.style.display = 'none'; });
  }
  function navTo(spec) {
    const [kind, id] = spec.split(':');
    if (kind === 'user') return userDetail(id);
    if (kind === 'dealer') return dealerDetail(id);
    if (kind === 'order') return orderDetail(id);
    go(kind);
  }

  /* ── command palette ── */
  function setupCmdK() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); }
    });
  }
  function openCmd() {
    if (document.querySelector('#opx-cmd')) return;
    const ov = document.createElement('div'); ov.id = 'opx-cmd'; ov.className = 'opx-cmd open';
    const cmds = ALL.map((t) => ({ label: t.l, key: t.id, run: () => go(t.id), hint: 'Go' }));
    ov.innerHTML = `<div class="opx-cmd-box"><input class="opx-cmd-in" placeholder="Jump to… or search the platform" /><div class="opx-cmd-list"></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('.opx-cmd-in'), list = ov.querySelector('.opx-cmd-list'); let sel = 0, items = [];
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    function rebuild() {
      const q = inp.value.trim().toLowerCase();
      items = cmds.filter((c) => !q || c.label.toLowerCase().includes(q));
      if (q.length >= 2) items.push({ label: `Search platform for “${inp.value.trim()}”`, key: 'search', hint: 'Search', run: () => { const s = root.querySelector('#opx-q'); s.value = inp.value.trim(); s.dispatchEvent(new Event('input')); s.focus(); } });
      sel = 0; draw();
    }
    function draw() { list.innerHTML = items.map((c, i) => `<div class="opx-cmd-i ${i === sel ? 'sel' : ''}" data-i="${i}">${ic(c.key)}${esc(c.label)}<span class="hint">${esc(c.hint)}</span></div>`).join('') || `<div class="opx-cmd-i">No commands</div>`; list.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { items[+b.dataset.i].run(); close(); })); }
    inp.addEventListener('input', rebuild);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return close();
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) { items[sel].run(); close(); } }
    });
    rebuild(); inp.focus();
  }

  /* ════════════════ VIEWS ════════════════ */
  const VIEWS = {};

  VIEWS.overview = async (body) => {
    const s = statsCache && statsCache.ok ? statsCache : await get('/api/stats');
    if (!s || !s.ok) { body.innerHTML = headHTML('overview') + emptyState('shield', 'Sign in to load the command center', 'Use your admin email from the bottom-left of the rail.'); return; }
    statsCache = s; const c = s.counts || {};
    const take = s.gmv ? ((s.fee_all / s.gmv) * 100).toFixed(1) + '%' : '—';
    const maxBar = Math.max(1, ...s.series.map((d) => d.volume));
    const bars = s.series.map((d) => `<div class="opx-bar" style="height:${Math.max(2, Math.round((d.volume / maxBar) * 100))}%" title="${d.day}: ${eur(d.volume)}"></div>`).join('');
    const attn = [
      { id: 'disputes', n: c.disputes, l: 'Disputes', cls: c.disputes ? 'hot' : 'calm' },
      { id: 'dealers', n: c.dealer_pending, l: 'Dealer applications', cls: c.dealer_pending ? 'warm' : 'calm' },
      { id: 'payouts', n: c.withdrawals, l: 'Payouts to release', cls: c.withdrawals ? 'warm' : 'calm' },
      { id: 'counterfeit', n: c.counterfeit, l: 'Counterfeit reports', cls: c.counterfeit ? 'hot' : 'calm' },
      { id: 'chain', n: c.chain_queued, l: 'Certificates to mint', cls: c.chain_queued ? 'warm' : 'calm' },
      { id: 'provision', n: c.card_requests, l: 'Card requests', cls: c.card_requests ? 'warm' : 'calm' },
    ];
    const glance = [['users', 'Users', c.users], ['dealers', 'Dealers', c.dealers], ['collections', 'Collections', c.collections], ['coins', 'Coins', c.coins], ['shield', 'Certificates', c.certificates], ['listings', 'Active listings', c.listings_active], ['orders', 'Orders in flight', c.orders_open]];
    body.innerHTML = headHTML('overview') +
      kpis([
        { l: 'GMV (all-time)', v: eurc(s.gmv), cls: 'accent', s: 'gross merchandise value' },
        { l: 'Volume · 30d', v: eurc(s.vol30) },
        { l: 'Platform revenue', v: eurc(s.fee_all), cls: 'ok', s: `${take} take rate` },
        { l: 'Open escrow actions', v: num(c.disputes + c.withdrawals), cls: (c.disputes + c.withdrawals) ? 'warn' : '' },
      ]) +
      `<div class="opx-panel"><div class="opx-panel-h"><h3>Needs you</h3><span class="sub">— resolve these to keep the platform healthy</span></div>
        <div class="opx-panel-b"><div class="opx-attn">${attn.map((a) => `<div class="opx-attn-c ${a.n ? a.cls : 'calm'}" data-go="${a.id}"><div class="n opx-num">${a.n || 0}</div><div class="lbl">${ic(a.id)}${esc(a.l)}</div><div class="go">${a.n ? 'Open →' : 'All clear'}</div></div>`).join('')}</div></div></div>
      <div class="opx-grid2">
        <div class="opx-panel"><div class="opx-panel-h"><h3>Volume · last 30 days</h3><span class="sub">${eur(s.vol30)} total</span></div><div class="opx-panel-b"><div class="opx-bars">${bars}</div></div></div>
        <div class="opx-panel"><div class="opx-panel-h"><h3>Platform at a glance</h3></div><div class="opx-panel-b flush">
          ${table([{ h: 'Entity', cell: (r) => `<span style="display:inline-flex;align-items:center;gap:9px">${ic(r[0])}${esc(r[1])}</span>` }, { h: '', num: true, cell: (r) => `<b class="opx-num">${num(r[2])}</b>` }], glance)}
        </div></div>
      </div>`;
    body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  };

  /* USERS */
  VIEWS.users = async (body) => {
    body.innerHTML = headHTML('users', `<input class="opx-inp" id="u-q" placeholder="Search username / name…" style="width:240px"/>`);
    const wrap = document.createElement('div'); body.appendChild(wrap);
    const load = async (q) => {
      wrap.innerHTML = loading();
      const r = await get('/api/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      if (!r.ok) { wrap.innerHTML = emptyState('alert', 'Could not load', r.error); return; }
      wrap.innerHTML = `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
        { h: 'User', cell: (u) => `<div class="opx-idcell">${img(u.avatar_url, 'round')}<div><div class="opx-strong">${esc(u.username || u.display_name || 'user')}</div><div class="opx-id">${sid(u.id)}</div></div></div>` },
        { h: 'Role', cell: (u) => pill(u.role || 'collector', TONE.role(u.role)) },
        { h: 'Wallet', cell: (u) => u.wallet_address ? copyable(u.wallet_address) : '<span style="color:var(--t4)">—</span>' },
        { h: 'Status', cell: (u) => u.suspended ? pill('suspended', 'bad', true) : pill('active', 'ok', true) },
        { h: 'Joined', num: true, cell: (u) => `<span style="color:var(--t3)">${when(u.created_at)}</span>` },
      ], r.users || [], { click: true, empty: 'No users.', rowAttr: (u) => `data-u="${esc(u.id)}"` }) + `</div></div>`;
      wrap.querySelectorAll('[data-u]').forEach((tr) => tr.addEventListener('click', () => userDetail(tr.dataset.u)));
      wireCopy(wrap);
    };
    body.querySelector('#u-q').addEventListener('input', debounce((e) => load(e.target.value.trim()), 250));
    load('');
  };
  async function userDetail(id) {
    sheet('Loading…', '', loading());
    const r = await get('/api/users?id=' + encodeURIComponent(id));
    if (!r.ok) { sheet('User', '', emptyState('alert', r.error || 'Not found')); return; }
    const u = r.user;
    const ttl = `${esc(u.username || u.display_name || 'User')} ${u.suspended ? pill('suspended', 'bad') : pill(u.role || 'collector', TONE.role(u.role))}`;
    const meta = `${copyable(u.id)} · joined ${when(u.created_at)}`;
    const body = `
      ${facts([['Balance', `<span class="opx-num">${eur2(r.balance)}</span>`], ['Certificates', `<span class="opx-num">${r.certs_count}</span>`], ['Wallet', u.wallet_address ? copyable(u.wallet_address) : '—'], ['Dealer', r.dealer ? esc(r.dealer.name) : '—']])}
      <div><div class="opx-sec-t">Role</div><div style="display:flex;gap:8px"><select class="opx-inp" id="u-role" style="flex:1">${['collector', 'creator', 'admin'].map((x) => `<option ${u.role === x ? 'selected' : ''}>${x}</option>`).join('')}</select><button class="opx-btn" id="u-role-save">Set role</button></div></div>
      <div><div class="opx-sec-t">Credit / adjust balance</div><div style="display:flex;gap:8px"><input class="opx-inp" id="u-amt" type="number" placeholder="€ (+/-)" style="width:120px"/><input class="opx-inp" id="u-note" placeholder="note" style="flex:1"/><button class="opx-btn" id="u-credit">Apply</button></div></div>
      ${r.orders && r.orders.length ? `<div><div class="opx-sec-t">Recent orders</div>${table([{ h: 'Order', cell: (o) => mono(o.label_code || sid(o.id)) }, { h: 'Status', cell: (o) => pill(o.status, TONE.order(o.status)) }, { h: '€', num: true, cell: (o) => eur(o.total_eur) }], r.orders, { click: true, rowAttr: (o) => `data-o="${esc(o.id)}"` })}</div>` : ''}
      ${r.certs && r.certs.length ? `<div><div class="opx-sec-t">Owned certificates (${r.certs_count})</div>${table([{ h: 'Serial', cell: (c) => mono(c.serial) }, { h: 'Minted', cell: (c) => c.minted ? pill('on blockchain', 'ok') : pill('off-chain', 'mut') }], r.certs.slice(0, 12))}</div>` : ''}`;
    const acts = `<button class="opx-btn ${u.suspended ? '' : 'danger'}" id="u-susp">${u.suspended ? 'Unsuspend' : 'Suspend account'}</button>`;
    const ov = sheet(ttl, meta, body, acts);
    ov.querySelector('#u-role-save').onclick = async () => { const r2 = await patch('users', { id, role: ov.querySelector('#u-role').value }); if (r2.ok) { toast('Role updated', 'ok'); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    ov.querySelector('#u-credit').onclick = async () => { const amt = Number(ov.querySelector('#u-amt').value); if (!amt) return toast('Enter an amount', 'warn'); const r2 = await post('balance', { action: 'adjust', user_id: id, amount_eur: amt, note: ov.querySelector('#u-note').value }); if (r2.ok) { toast('Balance adjusted', 'ok'); userDetail(id); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    ov.querySelector('#u-susp').onclick = async () => { const want = !u.suspended; const c = await confirmAct({ title: want ? 'Suspend account?' : 'Unsuspend account?', body: want ? 'They will be flagged as suspended.' : 'Restore this account.', reason: want, danger: want, ok: want ? 'Suspend' : 'Unsuspend' }); if (!c) return; const r2 = await patch('users', { id, suspended: want, reason: c.reason }); if (r2.ok) { toast('Done', 'ok'); userDetail(id); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    ov.querySelectorAll('[data-o]').forEach((tr) => tr.addEventListener('click', () => orderDetail(tr.dataset.o)));
  }

  /* DEALERS */
  VIEWS.dealers = async (body) => {
    const r = await get('/api/dealers'); if (!r.ok) { body.innerHTML = headHTML('dealers') + emptyState('alert', 'Could not load', r.error); return; }
    const dealers = r.dealers || [], apps = dealers.filter((d) => d.status === 'pending'), act = dealers.filter((d) => d.status !== 'pending');
    body.innerHTML = headHTML('dealers') +
      kpis([{ l: 'Dealers', v: num(dealers.length) }, { l: 'Applications', v: num(apps.length), cls: apps.length ? 'warn' : '' }, { l: 'Verified', v: num(dealers.filter((d) => d.verified).length) }], 3) +
      (apps.length ? `<div class="opx-panel"><div class="opx-panel-h"><h3>Applications</h3><span class="sub">approval unlocks the studio</span></div><div class="opx-panel-b flush">` + table([
        { h: 'Dealer', cell: (d) => `<div class="opx-idcell">${img(d.logo_url)}<div><div class="opx-strong">${esc(d.name)}</div><div class="opx-id">/${esc(d.slug || '')}</div></div></div>` },
        { h: 'Royalty', num: true, cell: (d) => ((d.default_royalty_bps || 0) / 100) + '%' },
        { h: 'Applied', num: true, cell: (d) => `<span style="color:var(--t3)">${ago(d.created_at)} ago</span>` },
        { h: '', num: true, cell: (d) => `<div class="opx-rowacts"><button class="opx-mini" data-app="${esc(d.id)}">Approve</button><button class="opx-mini danger" data-rej="${esc(d.id)}">Reject</button></div>` },
      ], apps, { click: true, rowAttr: (d) => `data-d="${esc(d.id)}"` }) + `</div></div>` : '') +
      `<div class="opx-panel"><div class="opx-panel-h"><h3>All dealers</h3></div><div class="opx-panel-b flush">` + table([
        { h: 'Dealer', cell: (d) => `<div class="opx-idcell">${img(d.logo_url)}<div><div class="opx-strong">${esc(d.name)}</div><div class="opx-id">/${esc(d.slug || '')}</div></div></div>` },
        { h: 'Contact', cell: (d) => `<span style="color:var(--t2)">${esc(d.contact_email || '—')}</span>` },
        { h: 'Domain', cell: (d) => d.custom_domain ? (d.custom_domain_verified ? pill(d.custom_domain, 'ok') : pill(d.custom_domain, 'warn')) : '<span style="color:var(--t4)">default</span>' },
        { h: 'Royalty', num: true, cell: (d) => ((d.default_royalty_bps || 0) / 100) + '%' },
        { h: 'Status', cell: (d) => `${pill(d.status, TONE.dealer(d.status), true)}${d.verified ? ' ' + pill('verified', 'info') : ''}` },
      ], act, { click: true, empty: 'No dealers.', rowAttr: (d) => `data-d="${esc(d.id)}"` }) + `</div></div>`;
    const quickPatch = async (payload, msg) => { const r2 = await patch('dealers', payload); if (r2.ok) { toast(msg, 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    body.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); quickPatch({ id: b.dataset.app, action: 'approve' }, 'Approved — owner is now a creator'); }));
    body.querySelectorAll('[data-rej]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); quickPatch({ id: b.dataset.rej, action: 'set_status', status: 'suspended' }, 'Rejected'); }));
    body.querySelectorAll('[data-d]').forEach((tr) => tr.addEventListener('click', () => dealerDetail(tr.dataset.d)));
  };
  async function dealerDetail(id) {
    sheet('Loading…', '', loading());
    const r = await get('/api/dealers?id=' + encodeURIComponent(id)); if (!r.ok) { sheet('Dealer', '', emptyState('alert', r.error || 'Not found')); return; }
    const d = r.dealer;
    const ttl = `${esc(d.name)} ${pill(d.status, TONE.dealer(d.status))}${d.verified ? ' ' + pill('verified', 'info') : ''}`;
    const body = `
      ${facts([['Volume', `<span class="opx-num">${eur(r.volume)}</span>`], ['Royalties', `<span class="opx-num">${eur(r.royalties)}</span>`], ['Sales', `<span class="opx-num">${r.sales_count}</span>`], ['Royalty rate', ((d.default_royalty_bps || 0) / 100) + '%'], ['Email', esc(d.contact_email || '—')], ['Domain', d.custom_domain ? (d.custom_domain_verified ? pill(d.custom_domain, 'ok') : pill(d.custom_domain, 'warn')) : '—']])}
      ${d.bio ? `<div><div class="opx-sec-t">Bio</div><p style="font-size:13px;color:var(--t2);margin:0;line-height:1.5">${esc(d.bio)}</p></div>` : ''}
      ${r.collections && r.collections.length ? `<div><div class="opx-sec-t">Collections (${r.collections.length})</div>${table([{ h: 'Name', cell: (c) => esc(c.name) }, { h: 'State', cell: (c) => c.published ? pill('published', 'ok') : pill('draft', 'mut') }], r.collections)}</div>` : ''}`;
    const acts = `${d.status !== 'approved' ? `<button class="opx-btn pri" data-a="approve">Approve</button>` : ''}${!d.verified ? `<button class="opx-btn" data-a="verify">Verify</button>` : ''}${d.custom_domain ? `<button class="opx-btn" data-a="domain">${d.custom_domain_verified ? 'Unverify domain' : 'Verify domain'}</button>` : ''}${d.status !== 'suspended' ? `<button class="opx-btn danger" data-a="suspend">Suspend</button>` : `<button class="opx-btn" data-a="reinstate">Reinstate</button>`}`;
    const ov = sheet(ttl, copyable(d.id), body, acts);
    // Chats with this dealer — pulled from the inbox, opened in a modal.
    const sb = ov.querySelector('.opx-sheet-b');
    if (sb) {
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="opx-sec-t">Chats with this dealer</div><div id="dlr-chats"><div class="opx-loading" style="padding:14px 0"><span class="opx-spin"></span> Loading…</div></div>`;
      sb.appendChild(sec);
      get('/api/inbox').then((ir) => {
        const host = sec.querySelector('#dlr-chats'); if (!host) return;
        const convs = ((ir && ir.rows) || []).filter((c) => c.dealer_id === id);
        if (!convs.length) { host.innerHTML = '<div style="color:var(--t3);font-size:12.5px">No conversations with this dealer yet.</div>'; return; }
        host.innerHTML = convs.map((c) => `<button class="opx-btn ghost" data-chat="${esc(c.id)}" style="width:100%;justify-content:space-between;margin-bottom:6px"><span>${esc(c.party || c.kind || 'conversation')} · ${ago(c.last_message_at)}</span><span style="color:var(--ac)">Open chat →</span></button>`).join('');
        host.querySelectorAll('[data-chat]').forEach((b) => b.addEventListener('click', () => openChatModal(b.dataset.chat, d.name)));
      });
    }
    const run = async (payload, msg) => { const r2 = await patch('dealers', payload); if (r2.ok) { toast(msg, 'ok'); dealerDetail(id); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    ov.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'approve') run({ id, action: 'approve' }, 'Approved');
      if (a === 'verify') run({ id, verified: true }, 'Verified');
      if (a === 'domain') run({ id, action: 'domain_verified', verified: !d.custom_domain_verified }, 'Domain updated');
      if (a === 'suspend') confirmAct({ title: 'Suspend dealer?', body: 'They lose selling access.', reason: true, danger: true, ok: 'Suspend' }).then((c) => { if (c) run({ id, action: 'set_status', status: 'suspended' }, 'Suspended'); });
      if (a === 'reinstate') run({ id, action: 'set_status', status: 'approved' }, 'Reinstated');
    }));
  }

  /* ORDERS */
  VIEWS.orders = async (body) => {
    const status = VIEWS.orders._f || '';
    const r = await get('/api/orders' + (status ? '?status=' + status : '')); if (!r.ok) { body.innerHTML = headHTML('orders') + emptyState('alert', 'Could not load', r.error); return; }
    const t = r.totals || {};
    const seg = ['', 'disputed', 'awaiting_shipment', 'shipped', 'delivered', 'completed', 'refunded', 'cancelled'];
    body.innerHTML = headHTML('orders') +
      kpis([{ l: 'Open escrow', v: eurc(t.open_escrow), cls: 'accent' }, { l: 'In flight', v: num(t.in_flight) }, { l: 'Disputes', v: num(t.disputes), cls: t.disputes ? 'bad' : '' }], 3) +
      `<div class="opx-panel"><div class="opx-filters"><div class="opx-seg">${seg.map((s) => `<button class="${status === s ? 'on' : ''}" data-f="${s}">${s ? s.replace(/_/g, ' ') : 'All'}</button>`).join('')}</div></div><div class="opx-panel-b flush">` +
      table([
        { h: 'Order', cell: (o) => mono(o.label_code || sid(o.id)) },
        { h: 'Coin', cell: (o) => esc(o.coin_name || '—') },
        { h: 'Buyer ← Seller', cell: (o) => `<span class="opx-id">${sid(o.buyer_id)} ← ${sid(o.seller_id)}</span>` },
        { h: 'Status', cell: (o) => pill((o.status || '').replace(/_/g, ' '), TONE.order(o.status), true) },
        { h: 'Escrow', num: true, cell: (o) => eur(o.total_eur) },
        { h: 'Age', num: true, cell: (o) => `<span style="color:var(--t3)">${ago(o.created_at)}</span>` },
      ], r.rows || [], { click: true, empty: 'No orders.', rowAttr: (o) => `data-o="${esc(o.id)}"` }) + `</div></div>`;
    body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { VIEWS.orders._f = b.dataset.f; paint(); }));
    body.querySelectorAll('[data-o]').forEach((tr) => tr.addEventListener('click', () => orderDetail(tr.dataset.o)));
  };
  async function orderDetail(id) {
    sheet('Loading…', '', loading());
    const r = await get('/api/orders?id=' + encodeURIComponent(id)); if (!r.ok) { sheet('Order', '', emptyState('alert', r.error || 'Not found')); return; }
    const o = r.order;
    const ttl = `${esc(o.label_code || sid(o.id))} ${pill((o.status || '').replace(/_/g, ' '), TONE.order(o.status))}`;
    const events = (r.events || []).map((e) => `<div class="opx-tl-i"><div class="opx-tl-dot"></div><div class="opx-tl-c"><div class="tt">${esc((e.type || '').replace(/_/g, ' '))}${e.note ? ' — ' + esc(e.note) : ''}</div><div class="td">${dt(e.created_at)}</div></div></div>`).join('') || '<div style="color:var(--t3);font-size:12.5px">No events.</div>';
    const body = `
      ${facts([['Item', eur(o.item_price_eur)], ['Total escrow', `<span class="opx-num">${eur(o.total_eur)}</span>`], ['Rail', esc(o.rail || '—')], ['Coin', esc(r.coin ? r.coin.name : '—')], ['Buyer', copyable(o.buyer_id)], ['Seller', copyable(o.seller_id)]])}
      ${o.dispute_reason ? `<div><div class="opx-sec-t">Dispute reason</div><p style="font-size:13px;color:var(--bad);margin:0">${esc(o.dispute_reason)}</p></div>` : ''}
      ${o.ship_to ? `<div><div class="opx-sec-t">Ship to</div><p style="font-size:12.5px;color:var(--t2);margin:0">${esc(typeof o.ship_to === 'string' ? o.ship_to : JSON.stringify(o.ship_to))}</p></div>` : ''}
      <div><div class="opx-sec-t">Timeline</div><div class="opx-tl">${events}</div></div>`;
    const acts = `${o.status === 'disputed' ? `<button class="opx-btn pri" data-s="completed">Release to seller</button><button class="opx-btn danger" data-s="refunded">Refund buyer</button>` : ''}${!['completed', 'cancelled', 'refunded'].includes(o.status) ? `<button class="opx-btn" data-s="completed">Mark completed</button><button class="opx-btn danger" data-s="cancelled">Cancel</button>` : ''}`;
    const ov = sheet(ttl, copyable(o.id), body, acts || '<span style="color:var(--t3);font-size:12.5px">Order is closed.</span>');
    ov.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', async () => {
      const st = b.dataset.s; const c = await confirmAct({ title: 'Set order ' + st + '?', body: 'This moves escrow accordingly.', reason: true, danger: ['refunded', 'cancelled'].includes(st), ok: 'Confirm' }); if (!c) return;
      const r2 = await post('orders', { action: 'order_status', id, status: st, note: c.reason }); if (r2.ok) { toast('Order ' + st, 'ok'); orderDetail(id); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad');
    }));
  }

  /* LISTINGS */
  VIEWS.listings = async (body) => {
    const status = VIEWS.listings._f || 'active';
    const r = await get('/api/listings?status=' + status); if (!r.ok) { body.innerHTML = headHTML('listings') + emptyState('alert', 'Could not load', r.error); return; }
    const seg = ['active', 'sold', 'cancelled'];
    body.innerHTML = headHTML('listings') +
      `<div class="opx-panel"><div class="opx-filters"><div class="opx-seg">${seg.map((s) => `<button class="${status === s ? 'on' : ''}" data-f="${s}">${s}</button>`).join('')}</div><span class="sub" style="color:var(--t3);font-size:12px;margin-left:auto">${(r.rows || []).length} listings</span></div><div class="opx-panel-b flush">` +
      table([
        { h: 'Coin', cell: (l) => `<div class="opx-idcell">${img(l.coin_image)}<span class="opx-strong">${esc(l.coin_name || '—')}</span></div>` },
        { h: 'Seller', cell: (l) => `<span class="opx-id">${sid(l.seller_id)}</span>` },
        { h: 'Kind', cell: (l) => pill(l.kind || 'fixed', 'mut') },
        { h: 'Price', num: true, cell: (l) => eur(l.price_eur) },
        { h: 'Top bid', num: true, cell: (l) => l.top_bid_eur ? eur(l.top_bid_eur) : '—' },
        { h: 'Status', cell: (l) => pill(l.status, TONE.listing(l.status), true) },
        { h: '', num: true, cell: (l) => l.status === 'active' ? `<button class="opx-mini danger" data-cancel="${esc(l.id)}">Take down</button>` : `<span style="color:var(--t3)">${ago(l.created_at)}</span>` },
      ], r.rows || [], { empty: 'No listings.' }) + `</div></div>`;
    body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { VIEWS.listings._f = b.dataset.f; paint(); }));
    body.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { const c = await confirmAct({ title: 'Take down listing?', body: 'Removes it from the marketplace.', danger: true, ok: 'Take down' }); if (!c) return; const r2 = await post('listings', { action: 'cancel', id: b.dataset.cancel }); if (r2.ok) { toast('Taken down', 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); }));
  };

  /* SALES */
  VIEWS.sales = async (body) => {
    const r = await get('/api/sales'); const rows = (r && r.rows) || [];
    let vol = 0, fee = 0, roy = 0; rows.forEach((s) => { vol += Number(s.price_eur || 0); fee += Number(s.platform_fee_eur || 0); roy += Number(s.royalty_eur || 0); });
    body.innerHTML = headHTML('sales') +
      kpis([{ l: 'Volume (last 120)', v: eurc(vol) }, { l: 'Platform fees', v: eur(fee), cls: 'ok' }, { l: 'Royalties routed', v: eur(roy) }], 3) +
      `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
        { h: 'Date', cell: (s) => when(s.created_at) },
        { h: 'Price', num: true, cell: (s) => eur(s.price_eur) },
        { h: 'Fee', num: true, cell: (s) => eur(s.platform_fee_eur) },
        { h: 'Royalty', num: true, cell: (s) => eur(s.royalty_eur) },
        { h: 'Rail', cell: (s) => pill(s.rail || '—', 'mut') },
        { h: 'Tx', cell: (s) => s.tx_hash ? copyable(s.tx_hash) : '—' },
      ], rows, { empty: 'No sales yet.' }) + `</div></div>`;
  };

  /* FINANCE */
  VIEWS.finance = async (body) => {
    const r = await get('/api/accounting'); if (!r.ok) { body.innerHTML = headHTML('finance') + emptyState('alert', 'Could not load', r.error); return; }
    const t = r.totals || {}, net = Number(t.fees || 0), momsNet = net / 1.25;
    body.innerHTML = headHTML('finance') +
      kpis([{ l: 'Fee revenue', v: eur(t.fees), cls: 'ok' }, { l: 'Gross volume', v: eurc(t.volume) }, { l: 'Royalties pass-through', v: eur(t.royalties) }, { l: 'Payouts paid', v: eur(t.payouts) }]) +
      `<div class="opx-panel"><div class="opx-panel-h"><h3>Monthly books</h3><span class="sub">last 12 months</span></div><div class="opx-panel-b flush">` + table([
        { h: 'Month', cell: (m) => m.month }, { h: 'Trades', num: true, cell: (m) => num(m.count) }, { h: 'Volume', num: true, cell: (m) => eur(m.volume) }, { h: 'Fee revenue', num: true, cell: (m) => eur(m.fees) }, { h: 'Royalties', num: true, cell: (m) => eur(m.royalties) },
      ], r.monthly || [], { empty: 'No data.' }) + `</div></div>
      <div class="opx-panel"><div class="opx-panel-h"><h3>VAT helper</h3><span class="sub">Swedish moms 25% · estimate</span></div><div class="opx-panel-b">${facts([['Gross fee revenue', eur(net)], ['Net (÷1.25)', eur(momsNet)], ['Moms to report', eur(net - momsNet)]])}</div></div>`;
  };

  /* PAYOUTS */
  VIEWS.payouts = async (body) => {
    const r = await get('/api/ops'); const wd = (r && r.withdrawals) || [];
    body.innerHTML = headHTML('payouts') +
      `<div class="opx-panel"><div class="opx-panel-h"><h3>Pending withdrawals</h3><span class="sub">${wd.length} awaiting release</span></div><div class="opx-panel-b flush">` + table([
        { h: 'User', cell: (w) => copyable(w.user_id) }, { h: 'Amount', num: true, cell: (w) => eur(w.amount_eur) }, { h: 'Method', cell: (w) => pill(w.method || '—', 'mut') }, { h: 'Requested', num: true, cell: (w) => `<span style="color:var(--t3)">${ago(w.created_at)}</span>` },
        { h: '', num: true, cell: (w) => `<div class="opx-rowacts"><button class="opx-mini" data-pay="${esc(w.id)}" data-st="paid">Mark paid</button><button class="opx-mini danger" data-pay="${esc(w.id)}" data-st="rejected">Reject</button></div>` },
      ], wd, { empty: 'Nothing pending — withdrawals are self-serve via Stripe.' }) + `</div></div>`;
    body.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => { const r2 = await post('ops', { action: 'process_withdrawal', id: b.dataset.pay, status: b.dataset.st }); if (r2.ok) { toast(b.dataset.st === 'paid' ? 'Marked paid' : 'Rejected', 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); }));
  };

  /* ROYALTIES */
  VIEWS.royalties = async (body) => {
    const r = await get('/api/royalties'); const rows = (r && r.rows) || [];
    body.innerHTML = headHTML('royalties') + `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
      { h: 'Beneficiary', cell: (x) => copyable(x.beneficiary_id) }, { h: 'Label', cell: (x) => esc(x.label || x.kind || '—') }, { h: 'Rate', num: true, cell: (x) => ((x.bps || 0) / 100) + '%' }, { h: 'Amount', num: true, cell: (x) => eur(x.amount_eur) }, { h: 'When', num: true, cell: (x) => when(x.created_at) },
    ], rows, { empty: 'No royalty payouts yet.' }) + `</div></div>`;
  };

  /* DISPUTES */
  VIEWS.disputes = async (body) => {
    const r = await get('/api/ops'); const d = (r && r.disputes) || [];
    body.innerHTML = headHTML('disputes') + (d.length ? `<div class="opx-panel"><div class="opx-panel-h"><h3>Frozen trades</h3><span class="sub">${d.length} awaiting a ruling</span></div><div class="opx-panel-b flush">` + table([
      { h: 'Order', cell: (o) => mono(o.label_code || sid(o.id)) }, { h: 'Coin', cell: (o) => esc(o.coin_name || '—') }, { h: 'Reason', cell: (o) => `<span style="color:var(--t2)">${esc(o.dispute_reason || 'disputed')}</span>` }, { h: 'Amount', num: true, cell: (o) => eur(o.total_eur) },
      { h: '', num: true, cell: (o) => `<div class="opx-rowacts"><button class="opx-mini" data-rel="${esc(o.id)}">Release</button><button class="opx-mini danger" data-ref="${esc(o.id)}">Refund</button></div>` },
    ], d, { click: true, rowAttr: (o) => `data-o="${esc(o.id)}"` }) + `</div></div>` : emptyState('check', 'No disputes need a ruling', 'Frozen trades will appear here.'));
    const rule = async (id, st) => { const c = await confirmAct({ title: st === 'completed' ? 'Release to seller?' : 'Refund buyer?', reason: true, danger: st === 'refunded', ok: 'Confirm' }); if (!c) return; const r2 = await post('orders', { action: 'order_status', id, status: st, note: c.reason }); if (r2.ok) { toast('Resolved', 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    body.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); rule(b.dataset.rel, 'completed'); }));
    body.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); rule(b.dataset.ref, 'refunded'); }));
    body.querySelectorAll('[data-o]').forEach((tr) => tr.addEventListener('click', () => orderDetail(tr.dataset.o)));
  };

  /* COUNTERFEIT */
  VIEWS.counterfeit = async (body) => {
    const r = await get('/api/ops'); const c = (r && r.counterfeit) || []; const opts = ['open', 'reviewing', 'resolved', 'dismissed'];
    body.innerHTML = headHTML('counterfeit') + (c.length ? `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
      { h: 'Tag', cell: (x) => mono(x.tag_uid || '—') }, { h: 'Reason', cell: (x) => esc(x.reason || '—') }, { h: 'Reporter', cell: (x) => `<span style="color:var(--t2)">${esc(x.reporter_email || 'anon')}</span>` }, { h: 'Age', num: true, cell: (x) => `<span style="color:var(--t3)">${ago(x.created_at)}</span>` },
      { h: 'Status', cell: (x) => `<select class="opx-inp" data-report="${esc(x.id)}" style="height:32px">${opts.map((o) => `<option ${x.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` },
    ], c, {}) + `</div></div>` : emptyState('shield', 'No open reports', 'Flagged chips and certificates will appear here.'));
    body.querySelectorAll('[data-report]').forEach((s) => s.addEventListener('change', async () => { const r2 = await post('ops', { action: 'report_status', id: s.dataset.report, status: s.value }); if (r2.ok) toast('Updated', 'ok'); else toast('Failed', 'bad'); }));
  };

  /* BLOCKCHAIN */
  VIEWS.chain = async (body) => {
    const r = await get('/api/console?view=chain'); if (!r.ok) { body.innerHTML = headHTML('chain') + emptyState('alert', r.error || 'Error'); return; }
    const c = r.counts || {};
    body.innerHTML = headHTML('chain') +
      kpis([{ l: 'Network wallet', v: r.balance_eth != null ? r.balance_eth.toFixed(4) + ' ETH' : '—', cls: 'accent', s: 'Base · covers your users’ fees' }, { l: 'Queued', v: num(c.queued || 0), cls: c.queued ? 'warn' : '' }, { l: 'Completed', v: num(c.done || 0), cls: 'ok' }, { l: 'Failed', v: num(c.failed || 0), cls: c.failed ? 'bad' : '' }]) +
      `<div class="opx-panel"><div class="opx-panel-h"><h3>Mint & transfer activity</h3><span class="sub">processed automatically in batches</span></div><div class="opx-panel-b flush">` + table([
        { h: 'Action', cell: (j) => pill(j.type === 'mint' ? 'create certificate' : j.type, 'mut') }, { h: 'To', cell: (j) => j.to_address ? `<span class="opx-id">${sid(j.to_address)}…</span>` : '—' }, { h: 'Status', cell: (j) => `${pill(j.status, TONE.chain(j.status), true)}${j.tx_hash ? ' ' + copyable(j.tx_hash) : ''}` }, { h: 'Tries', num: true, cell: (j) => j.attempts }, { h: 'Age', num: true, cell: (j) => `<span style="color:var(--t3)">${ago(j.created_at)}</span>` },
        { h: '', num: true, cell: (j) => `<div class="opx-rowacts">${j.status === 'failed' ? `<button class="opx-mini" data-retry="${esc(j.id)}">Retry</button>` : ''}${j.status !== 'done' ? `<button class="opx-mini" data-done="${esc(j.id)}">Mark…</button>` : ''}</div>` },
      ], r.jobs || [], { empty: 'No activity.' }) + `</div></div>`;
    body.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => { const r2 = await post('console', { action: 'retry_chain', id: b.dataset.retry }); if (r2.ok) { toast('Re-queued', 'ok'); paint(); } else toast('Failed', 'bad'); }));
    body.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => { const tx = prompt('Transaction hash (0x…) — blank = mark failed:'); if (tx === null) return; const r2 = await post('console', { action: 'mark_chain_job', id: b.dataset.done, tx: tx.trim() || undefined, failed: !tx.trim() }); if (r2.ok) { toast('Updated', 'ok'); paint(); } else toast('Failed', 'bad'); }));
  };

  /* AUDIT */
  let auditQ = '';
  VIEWS.audit = async (body) => {
    const r = await get('/api/console?view=audit' + (auditQ ? '&q=' + encodeURIComponent(auditQ) : ''));
    const rows = (r && r.rows) || [];
    body.innerHTML = headHTML('audit', `<input class="opx-inp" id="a-q" placeholder="Filter action…" value="${esc(auditQ)}" style="width:220px"/>`) +
      `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
        { h: 'When', cell: (a) => dt(a.created_at) }, { h: 'Action', cell: (a) => pill((a.action || '').replace(/[._]/g, ' '), String(a.action).includes('fail') ? 'bad' : 'mut') }, { h: 'Target', cell: (a) => a.target ? copyable(a.target) : '—' }, { h: 'Actor', cell: (a) => a.actor_id ? `<span class="opx-id">${sid(a.actor_id)}</span>` : 'system' },
      ], rows, { empty: 'No audit entries.' }) + `</div></div>`;
    const inp = body.querySelector('#a-q'); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { auditQ = e.target.value.trim(); paint(); } });
  };

  /* INBOX */
  VIEWS.inbox = async (body) => {
    const r = await get('/api/inbox'); const convs = (r && r.rows) || [];
    body.innerHTML = headHTML('inbox') + `<div class="opx-inbox"><div class="opx-convs" id="opx-convs">${convs.length ? convs.map((c) => `<div class="opx-conv" data-c="${esc(c.id)}"><div class="cp">${ic(c.dealer_id ? 'dealers' : 'orders')}${esc(c.party || 'conversation')}</div><div class="cm">${esc(c.kind || 'chat')}${c.order_id ? ' · order ' + sid(c.order_id) : ''} · ${ago(c.last_message_at)}</div></div>`).join('') : emptyState('inbox', 'No conversations')}</div><div class="opx-thread" id="opx-thread">${emptyState('inbox', 'Select a conversation', 'Read and reply as the platform.')}</div></div>`;
    const convEls = body.querySelectorAll('[data-c]');
    convEls.forEach((el) => el.addEventListener('click', () => { convEls.forEach((x) => x.classList.toggle('on', x === el)); openThread(el.dataset.c, body.querySelector('#opx-thread')); }));
  };
  async function openThread(cid, host) {
    host.innerHTML = `<div class="opx-thread-h">Conversation ${mono(sid(cid))}</div><div class="opx-msgs" id="opx-msgs">${loading()}</div><div class="opx-compose"><input class="opx-inp" id="opx-reply" placeholder="Reply as the platform…"/><button class="opx-btn pri" id="opx-send">Send</button></div>`;
    const msgsEl = host.querySelector('#opx-msgs');
    const load = async () => {
      const r = await post('ops', { action: 'messages', conversation_id: cid });
      const msgs = (r && r.messages) || [];
      msgsEl.innerHTML = msgs.length ? msgs.map((m) => `<div class="opx-msg ${m.sender_id && m.sender_id === myId ? 'me' : 'them'}">${esc(m.body || '')}<div class="mt">${dt(m.created_at)}</div></div>`).join('') : `<div style="color:var(--t3);font-size:12.5px;text-align:center;padding:20px">No messages yet.</div>`;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    };
    await load();
    const send = async () => { const inp = host.querySelector('#opx-reply'); const v = inp.value.trim(); if (!v) return; inp.value = ''; const r = await post('ops', { action: 'reply', conversation_id: cid, body: v }); if (r.ok) load(); else toast('Send failed', 'bad'); };
    host.querySelector('#opx-send').onclick = send;
    host.querySelector('#opx-reply').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }
  // Open a conversation thread in a modal (used from a dealer record).
  function openChatModal(cid, title) {
    const ov = document.createElement('div'); ov.className = 'opx-modal';
    ov.innerHTML = `<div class="opx-modal-box" style="padding:0;width:min(560px,96vw);height:72vh;max-height:72vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line);font-weight:600;font-size:14px">${ic('inbox')}${esc(title || 'Conversation')}<button data-x style="margin-left:auto;width:30px;height:30px;border:0;background:var(--panel);border-radius:var(--r1);color:var(--t2);cursor:pointer;display:grid;place-items:center">${icRaw('close')}</button></div>
      <div class="opx-thread" style="flex:1;min-height:0" id="opx-cm-host"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('[data-x]').onclick = () => ov.remove();
    openThread(cid, ov.querySelector('#opx-cm-host'));
  }

  /* PROVISIONING */
  VIEWS.provision = async (body) => {
    const r = await get('/api/provision'); if (!r.ok) { body.innerHTML = headHTML('provision') + emptyState('alert', 'Could not load', r.error); return; }
    const rows = r.rows || [];
    const certBase = (d) => (d && d.custom_domain && d.custom_domain_verified) ? d.custom_domain : 'opulence-tech.vercel.app';
    body.innerHTML = headHTML('provision') + (rows.length ? rows.map((c) => `
      <div class="opx-panel"><div class="opx-panel-h"><h3>${esc(c.name)}</h3>${c.approved ? pill('approved', 'ok') : pill('pending', 'warn')}${c.featured ? pill('featured', 'info') : ''}<div class="right">
        ${!c.approved ? `<button class="opx-btn sm" data-approve="${esc(c.id)}">Approve & publish</button>` : ''}
        <button class="opx-btn sm" data-feature="${esc(c.id)}" data-on="${c.featured ? 1 : 0}">${c.featured ? 'Unfeature' : 'Feature'}</button>
        <button class="opx-btn sm pri" data-prov="${esc(c.id)}" data-name="${esc(c.name)}" ${(c.coins - c.cards_issued) <= 0 ? 'disabled' : ''}>Issue ${Math.max(0, c.coins - c.cards_issued)} cards</button>
      </div></div><div class="opx-panel-b"><div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--t2)">
        <span>Dealer <b style="color:var(--t1)">${esc((c.dealer && c.dealer.name) || '—')}</b></span><span>Coins <b style="color:var(--t1)" class="opx-num">${c.coins}</b></span><span>Cards <b style="color:var(--t1)" class="opx-num">${c.cards_issued}</b></span><span>Royalty <b style="color:var(--t1)">${(c.royalty_bps || 0) / 100}%</b></span><span class="opx-id">${esc(certBase(c.dealer))}/c/…</span>
      </div><div data-out="${esc(c.id)}"></div></div></div>`).join('') : emptyState('collections', 'No collections'));
    body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => { const r2 = await post('collections', { action: 'approve', id: b.dataset.approve }); if (r2.ok) { toast('Approved', 'ok'); paint(); } else toast('Failed', 'bad'); }));
    body.querySelectorAll('[data-feature]').forEach((b) => b.addEventListener('click', async () => { const want = b.dataset.on !== '1'; const r2 = await post('collections', { action: 'feature', id: b.dataset.feature, featured: want }); if (r2.ok) { toast(want ? 'Featured' : 'Unfeatured', 'ok'); paint(); } else toast('Failed', 'bad'); }));
    body.querySelectorAll('[data-prov]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.prov, name = b.dataset.name, out = body.querySelector(`[data-out="${id}"]`); b.disabled = true; b.textContent = 'Issuing…';
      const r2 = await post('provision', { collection_id: id }); b.textContent = 'Issue cards'; b.disabled = false;
      if (!r2.ok) return toast('Failed: ' + (r2.error || ''), 'bad');
      const cards = r2.cards || []; if (!cards.length) { out.innerHTML = `<p style="color:var(--t3);font-size:12.5px;margin-top:10px">Every coin already has a card.</p>`; return; }
      out.innerHTML = `<p style="color:var(--warn);font-size:12px;margin:12px 0 6px;font-weight:600">Claim codes are shown once — download them now.</p>` + table([{ h: 'Coin', cell: (c) => esc(c.coin_name || '') }, { h: 'UID', cell: (c) => mono(c.uid) }, { h: 'Claim code', cell: (c) => `<b style="color:var(--ac)" class="opx-mono">${esc(c.claim_code)}</b>` }], cards) + `<button class="opx-btn sm" id="csv-${id}" style="margin-top:10px">Download CSV</button>`;
      out.querySelector(`#csv-${id}`).onclick = () => { const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; const csv = ['coin,uid,claim_code', ...cards.map((c) => [q(c.coin_name), q(c.uid), q(c.claim_code)].join(','))].join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'cards-' + name.replace(/\W+/g, '-') + '.csv'; a.click(); };
      toast('Issued ' + cards.length + ' card(s)', 'ok');
    }));
  };

  /* COLLECTIONS */
  VIEWS.collections = async (body) => {
    const r = await get('/api/collections'); const rows = (r && r.collections) || [];
    body.innerHTML = headHTML('collections') + `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
      { h: 'Collection', cell: (c) => `<span class="opx-strong">${esc(c.name)}</span> <span class="opx-id">/${esc(c.slug || '')}</span>` },
      { h: 'Royalty', num: true, cell: (c) => ((c.royalty_bps || 0) / 100) + '%' },
      { h: 'State', cell: (c) => `${c.approved ? pill('approved', 'ok') : pill('pending', 'warn')} ${c.published ? pill('published', 'info') : pill('draft', 'mut')}${c.featured ? ' ' + pill('featured', 'info') : ''}` },
      { h: '', num: true, cell: (c) => `<div class="opx-rowacts">${!c.approved ? `<button class="opx-mini" data-ap="${esc(c.id)}">Approve</button>` : ''}<button class="opx-mini" data-ft="${esc(c.id)}" data-on="${c.featured ? 1 : 0}">${c.featured ? 'Unfeature' : 'Feature'}</button></div>` },
    ], rows, { empty: 'No collections.' }) + `</div></div>`;
    body.querySelectorAll('[data-ap]').forEach((b) => b.addEventListener('click', async () => { const r2 = await post('collections', { action: 'approve', id: b.dataset.ap }); if (r2.ok) { toast('Approved', 'ok'); paint(); } else toast('Failed', 'bad'); }));
    body.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', async () => { const want = b.dataset.on !== '1'; const r2 = await post('collections', { action: 'feature', id: b.dataset.ft, featured: want }); if (r2.ok) { toast('Updated', 'ok'); paint(); } else toast('Failed', 'bad'); }));
  };

  /* COINS (public read) */
  VIEWS.coins = async (body) => {
    let rows = [];
    try { const { data } = await window.DB.nft_read('coins', { select: 'id,name,metal,year,edition_no,edition_total,image_url,collection_id,created_at', order: { col: 'created_at', asc: false }, limit: 80 }); rows = data || []; } catch (e) {}
    body.innerHTML = headHTML('coins') + `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
      { h: 'Coin', cell: (c) => `<div class="opx-idcell">${img(c.image_url)}<span class="opx-strong">${esc(c.name || 'Untitled')}</span></div>` },
      { h: 'Metal', cell: (c) => esc(c.metal || '—') }, { h: 'Year', num: true, cell: (c) => c.year || '—' }, { h: 'Edition', num: true, cell: (c) => c.edition_no ? `#${c.edition_no}/${c.edition_total || '?'}` : '—' }, { h: 'Added', num: true, cell: (c) => when(c.created_at) },
    ], rows, { empty: 'No coins.' }) + `</div></div>`;
  };

  /* NFC */
  VIEWS.nfc = async (body) => {
    const r = await get('/api/nfc'); const tags = (r && r.tags) || []; const STAT = ['unassigned', 'assigned', 'claimed', 'revoked'];
    const by = {}; tags.forEach((t) => by[t.status] = (by[t.status] || 0) + 1);
    body.innerHTML = headHTML('nfc') + kpis(STAT.map((s) => ({ l: s, v: num(by[s] || 0) })), 4) +
      `<div class="opx-panel"><div class="opx-filters"><input class="opx-inp" id="nfc-uid" placeholder="Register new tag UID…" style="width:280px"/><button class="opx-btn sm" id="nfc-reg">Register</button></div><div class="opx-panel-b flush">` + table([
        { h: 'UID', cell: (t) => mono(t.uid) }, { h: 'Status', cell: (t) => pill(t.status, TONE.nfc(t.status), true) }, { h: 'Coin', cell: (t) => t.coin_id ? mono(sid(t.coin_id)) : '—' }, { h: 'Taps', num: true, cell: (t) => t.tap_count || 0 },
        { h: '', num: true, cell: (t) => `<div class="opx-rowacts">${t.coin_id ? `<button class="opx-mini danger" data-nfc="unlink" data-id="${esc(t.id)}">Unlink</button>` : `<button class="opx-mini" data-nfc="link" data-id="${esc(t.id)}">Link</button>`}${t.status !== 'revoked' ? `<button class="opx-mini danger" data-nfc="deactivate" data-id="${esc(t.id)}">Revoke</button>` : ''}</div>` },
      ], tags, { empty: 'No cards.' }) + `</div></div>`;
    body.querySelector('#nfc-reg').onclick = async () => { const uid = body.querySelector('#nfc-uid').value.trim(); if (!uid) return toast('UID required', 'warn'); const r2 = await post('nfc', { uid }); if (r2.ok) { toast('Registered', 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); };
    body.querySelectorAll('[data-nfc]').forEach((b) => b.addEventListener('click', async () => { const act = b.dataset.nfc, id = b.dataset.id; let payload = { action: act, tag_id: id }; if (act === 'link') { const coin = prompt('Coin ID to link:'); if (!coin) return; payload.coin_id = coin.trim(); } const r2 = await post('nfc', payload); if (r2.ok) { toast(act, 'ok'); paint(); } else toast('Failed: ' + (r2.error || ''), 'bad'); }));
  };

  /* DROPS (public read) */
  VIEWS.drops = async (body) => {
    let rows = [];
    try { const { data } = await window.DB.nft_read('drops', { select: '*', order: { col: 'launch_at', asc: false }, limit: 40 }); rows = data || []; } catch (e) {}
    body.innerHTML = headHTML('drops') + `<div class="opx-panel"><div class="opx-panel-b flush">` + table([
      { h: 'Title', cell: (d) => `<span class="opx-strong">${esc(d.title)}</span>` }, { h: 'Launch', cell: (d) => when(d.launch_at) }, { h: 'Supply', num: true, cell: (d) => d.supply ?? '—' }, { h: 'Price', num: true, cell: (d) => eur(d.price_eur) }, { h: 'Status', cell: (d) => pill(d.status || '—', d.status === 'live' ? 'ok' : 'mut', true) },
    ], rows, { empty: 'No drops.' }) + `</div></div>`;
  };

  H.register({ id: 'nft-site', label: 'NFT Platform', icon: '◆', scope: 'company', render });
})();
