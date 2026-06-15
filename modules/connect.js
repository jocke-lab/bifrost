/* ============================================================================
   connect.js — "Connections": the live HUD hub for Slack + Google (Calendar,
   Gmail, Drive), plus a "Connect Google" button and integration status.
   Talks to the bifrost serverless API (/api/*). On the local static preview the
   API isn't present, so it shows a graceful "live on bifrostlkl.com" note.
   ========================================================================== */
(function () {
  const H = window.HELM;
  const TABS = [
    { id: 'overview', label: 'Overview', icon: '🔌' },
    { id: 'slack', label: 'Slack', icon: '💬' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'gmail', label: 'Gmail', icon: '✉️' },
    { id: 'drive', label: 'Drive', icon: '📁' },
    { id: 'wearables', label: 'Wearables', icon: '⌚' }
  ];
  let active = 'overview', rootEl = null, status = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmtDate(s) { if (!s) return ''; const d = new Date(isNaN(s) ? s : Number(s)); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  async function api(path, opts) { opts = opts || {}; try { let token = null; try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {} const headers = Object.assign({}, opts.headers || {}); if (token) headers.Authorization = 'Bearer ' + token; const r = await fetch(path, Object.assign({}, opts, { headers })); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { ok: false, _offline: true }; } } catch (e) { return { ok: false, _offline: true, error: e.message }; } }
  const dot = on => `<span class="conn-dot ${on ? 'on' : 'off'}"></span>`;
  const needPanel = (title, html) => `<div class="conn-need-panel"><div class="conn-need-ico">🔌</div><h3>Connect ${esc(title)}</h3><p>${html}</p><p class="conn-muted">Add the env var(s) in Vercel → project <b>bifrost</b> → Settings → Environment Variables, then redeploy.</p></div>`;
  const section = (title, rows) => `<section class="conn-panel"><h3>${title}</h3><div class="conn-rows">${rows}</div></section>`;
  const emptyRow = t => `<div class="conn-row conn-muted">${esc(t)}</div>`;

  function render(root) {
    rootEl = root;
    root.innerHTML = `
      <div class="conn">
        <header class="conn-head">
          <div><h1 class="conn-title">Connections</h1>
          <p class="conn-sub">Your company's tools, in one deck — Slack, Google Calendar, Gmail and Drive.</p></div>
        </header>
        <nav class="conn-tabs">${TABS.map(t => `<button class="conn-tab${t.id === active ? ' active' : ''}" data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('')}</nav>
        <div class="conn-body" id="conn-body"></div>
      </div>`;
    root.querySelectorAll('.conn-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.tab; root.querySelectorAll('.conn-tab').forEach(x => x.classList.toggle('active', x === b)); paint(); }));
    paint();
  }

  async function paint() {
    const body = rootEl.querySelector('#conn-body'); if (!body) return;
    body.innerHTML = `<div class="conn-loading"><span class="conn-spin"></span> Loading…</div>`;
    status = await api('/api/status');
    if (active === 'overview') return paintOverview(body);
    if (active === 'slack') return paintSlack(body);
    if (active === 'wearables') return paintWearables(body);
    return paintGoogle(body, active);
  }

  function paintOverview(body) {
    const i = (status && status.integrations) || {};
    const offline = status && status._offline;
    body.innerHTML = `
      ${offline ? `<div class="conn-note">⚠ The serverless API isn't reachable here (local preview). On the live site <b>bifrostlkl.com</b> these light up automatically.</div>` : ''}
      <div class="conn-cards">
        <div class="conn-card">
          <div class="conn-card-h">${dot(i.nft_admin)}<b>NFT platform admin</b></div>
          <p>Create dealers, approve collections, mint certificates, link NFC — the whole circle.</p>
          <div class="conn-status">${i.nft_admin ? '<span class="conn-ok">● Connected</span>' : '<span class="conn-need">needs <code>OPULENCE_TECH_SERVICE_ROLE</code></span>'}</div>
        </div>
        <div class="conn-card">
          <div class="conn-card-h">${dot(i.slack)}<b>Slack</b></div>
          <p>Channels and posting from inside bifrost.</p>
          <div class="conn-status">${i.slack ? '<button class="conn-btn" data-go="slack">Open Slack HUD →</button>' : '<span class="conn-need">needs <code>SLACK_BOT_TOKEN</code></span>'}</div>
        </div>
        <div class="conn-card">
          <div class="conn-card-h">${dot(i.google)}<b>Google Workspace</b></div>
          <p>Calendar, Gmail and Drive, unified.</p>
          <div class="conn-status">${i.google ? '<a class="conn-btn primary" href="/api/google-start">🔗 Connect Google</a>' : '<span class="conn-need">needs <code>GOOGLE_CLIENT_ID</code> + <code>SECRET</code></span>'}</div>
        </div>
        <div class="conn-card">
          <div class="conn-card-h">${dot(i.whoop || i.oura)}<b>Wearables</b></div>
          <p>Whoop &amp; Oura recovery, sleep and strain.</p>
          <div class="conn-status"><button class="conn-btn" data-go="wearables">Open Wearables →</button></div>
        </div>
      </div>
      <div class="conn-help">
        <h3>What each needs (one-time)</h3>
        <ul>
          <li><b>NFT admin</b> — Supabase → opulence-tech → Settings → API → <code>service_role</code> → save as <code>OPULENCE_TECH_SERVICE_ROLE</code> (+ <code>BIFROST_SERVICE_ROLE</code> from the bifrost project).</li>
          <li><b>Slack</b> — api.slack.com/apps → create app → Bot token <code>xoxb-…</code> (scopes: channels:read, channels:history, chat:write, users:read) → <code>SLACK_BOT_TOKEN</code>.</li>
          <li><b>Google</b> — Google Cloud → enable Gmail/Calendar/Drive APIs → OAuth web client, redirect <code>https://bifrostlkl.com/api/google-callback</code> → <code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code>.</li>
        </ul>
      </div>`;
    body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { active = b.dataset.go; rootEl.querySelectorAll('.conn-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === active)); paint(); }));
  }

  async function paintSlack(body) {
    const i = (status && status.integrations) || {};
    if (!i.slack) { body.innerHTML = needPanel('Slack', 'Create a Slack app and add a Bot Token <code>xoxb-…</code> (scopes: channels:read, channels:history, chat:write, users:read) as <code>SLACK_BOT_TOKEN</code>.'); return; }
    body.innerHTML = `<div class="conn-loading"><span class="conn-spin"></span> Loading Slack…</div>`;
    const hud = await api('/api/slack-hud');
    if (!hud.ok) { body.innerHTML = needPanel('Slack', 'Slack API error: <code>' + esc(hud.error || 'unknown') + '</code>'); return; }
    body.innerHTML = `
      <div class="conn-slack">
        <aside class="conn-slack-side"><div class="conn-slack-team">${esc(hud.team || 'Slack')}</div><div class="conn-chan-list" id="chan-list"></div></aside>
        <section class="conn-slack-main">
          <div class="conn-msgs" id="slack-msgs"><div class="conn-muted" style="padding:20px">Pick a channel to view messages.</div></div>
          <div class="conn-composer"><input id="slack-text" placeholder="Message a channel…" disabled/><button class="conn-btn primary" id="slack-send" disabled>Send</button></div>
        </section>
      </div>`;
    const list = body.querySelector('#chan-list'); let current = null;
    (hud.channels || []).forEach(c => {
      const b = H.el(`<button class="conn-chan"><span># ${esc(c.name)}</span><span class="conn-muted">${c.num_members || 0}</span></button>`);
      b.addEventListener('click', () => {
        current = c; body.querySelectorAll('.conn-chan').forEach(x => x.classList.toggle('active', x === b));
        const text = body.querySelector('#slack-text'); text.disabled = false; text.placeholder = 'Message #' + c.name + '…';
        body.querySelector('#slack-send').disabled = false; loadMsgs(c);
      });
      list.appendChild(b);
    });
    async function loadMsgs(c) {
      const m = body.querySelector('#slack-msgs'); m.innerHTML = '<div class="conn-loading"><span class="conn-spin"></span></div>';
      const r = await api('/api/slack-hud?channel=' + encodeURIComponent(c.id));
      if (!r.ok) { m.innerHTML = '<div class="conn-muted" style="padding:20px">' + esc(r.error || 'Could not load (is the bot in this channel?)') + '</div>'; return; }
      const users = hud.users || {};
      m.innerHTML = (r.messages || []).slice().reverse().map(x => `<div class="conn-msg"><b>${esc(users[x.user] || x.user || '·')}</b><span>${esc(x.text || '')}</span></div>`).join('') || '<div class="conn-muted" style="padding:20px">No messages.</div>';
      m.scrollTop = m.scrollHeight;
    }
    const send = body.querySelector('#slack-send'), text = body.querySelector('#slack-text');
    send.addEventListener('click', async () => {
      if (!current || !text.value.trim()) return;
      const t = text.value.trim(); text.value = '';
      const r = await api('/api/slack-post', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: current.id, text: t }) });
      if (r.ok) { H.toast('Sent to #' + current.name, 'success'); loadMsgs(current); } else H.toast('Slack: ' + (r.error || 'failed'), 'warn');
    });
    text.addEventListener('keydown', e => { if (e.key === 'Enter') send.click(); });
  }

  async function paintGoogle(body, which) {
    const i = (status && status.integrations) || {};
    if (!i.google) { body.innerHTML = needPanel('Google', 'In Google Cloud, enable Gmail/Calendar/Drive APIs, create an OAuth web client (redirect <code>https://bifrostlkl.com/api/google-callback</code>), then add <code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code>.'); return; }
    body.innerHTML = `<div class="conn-loading"><span class="conn-spin"></span> Loading Google…</div>`;
    const hud = await api('/api/google-hud');
    if (hud.ok && hud.connected === false) { body.innerHTML = `<div class="conn-connect"><div class="conn-need-ico">🔗</div><p>Google is configured — connect your account to see your ${esc(which)}.</p><a class="conn-btn primary" href="/api/google-start">Connect Google</a></div>`; return; }
    if (!hud.ok) { body.innerHTML = needPanel('Google', 'Error: <code>' + esc(hud.error || 'unknown') + '</code>'); return; }
    if (which === 'calendar') body.innerHTML = section('📅 Upcoming · ' + esc(hud.email || ''), (hud.calendar || []).map(e => `<div class="conn-row"><b>${esc(e.summary || '(no title)')}</b><span class="conn-muted">${esc(fmtDate(e.start))}${e.location ? ' · ' + esc(e.location) : ''}</span></div>`).join('') || emptyRow('No upcoming events'));
    if (which === 'gmail') body.innerHTML = section('✉️ Inbox · ' + esc(hud.email || ''), (hud.gmail || []).map(m => `<div class="conn-row"><b>${esc(m.subject || '(no subject)')}</b><span class="conn-muted">${esc(m.from || '')}</span><span class="conn-snip">${esc(m.snippet || '')}</span></div>`).join('') || emptyRow('Inbox empty'));
    if (which === 'drive') body.innerHTML = section('📁 Recent files · ' + esc(hud.email || ''), (hud.drive || []).map(f => `<div class="conn-row"><b><a href="${esc(f.webViewLink || '#')}" target="_blank" rel="noopener">${esc(f.name)}</a></b><span class="conn-muted">${esc(fmtDate(f.modifiedTime))}</span></div>`).join('') || emptyRow('No files'));
  }

  async function paintWearables(body) {
    body.innerHTML = `<div class="conn-loading"><span class="conn-spin"></span> Loading wearables…</div>`;
    const hud = await api('/api/wearables-hud');
    const cfg = (hud && hud.configured) || {};
    function card(name, key, data, env) {
      const connected = data && data.connected;
      let inner;
      if (!cfg[key]) inner = `<p class="conn-need">needs <code>${env}</code> + secret in Vercel</p>`;
      else if (connected) {
        inner = key === 'whoop'
          ? `<div class="conn-metrics"><div><b>${data.recovery ?? '—'}%</b><span>Recovery</span></div><div><b>${data.hrv ? Math.round(data.hrv) : '—'}</b><span>HRV ms</span></div><div><b>${data.resting_hr ?? '—'}</b><span>RHR</span></div><div><b>${data.sleep_performance ?? '—'}%</b><span>Sleep</span></div></div>`
          : `<div class="conn-metrics"><div><b>${data.readiness ?? '—'}</b><span>Readiness</span></div><div><b>${data.sleep_score ?? '—'}</b><span>Sleep</span></div></div>`;
      } else inner = `<a class="conn-btn primary" href="/api/${key}-start">🔗 Connect ${name}</a>`;
      return `<div class="conn-card"><div class="conn-card-h">${dot(connected)}<b>${name}</b></div>${inner}</div>`;
    }
    body.innerHTML = `
      ${hud && hud._offline ? `<div class="conn-note">⚠ Live on bifrostlkl.com — the API isn't reachable in this local preview.</div>` : ''}
      <div class="conn-cards">
        ${card('Whoop', 'whoop', hud && hud.whoop, 'WHOOP_CLIENT_ID')}
        ${card('Oura Ring', 'oura', hud && hud.oura, 'OURA_CLIENT_ID')}
      </div>
      <div class="conn-help"><h3>Enable wearables</h3><ul>
        <li><b>Whoop</b> — developer.whoop.com → create app, redirect <code>https://bifrostlkl.com/api/whoop-callback</code> → <code>WHOOP_CLIENT_ID</code> + <code>WHOOP_CLIENT_SECRET</code>.</li>
        <li><b>Oura</b> — cloud.ouraring.com → OAuth app, redirect <code>https://bifrostlkl.com/api/oura-callback</code> → <code>OURA_CLIENT_ID</code> + <code>OURA_CLIENT_SECRET</code>.</li>
      </ul></div>`;
  }

  H.register({ id: 'connect', label: 'Connections', icon: '🔌', scope: 'company', render });
})();
