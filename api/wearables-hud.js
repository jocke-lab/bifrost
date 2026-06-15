// GET /api/wearables-hud — latest Whoop + Oura metrics (refreshes tokens as needed)
const { json, supa } = require('./_lib');

async function freshToken(id, refreshUrl, clientId, clientSecret) {
  const rows = await supa('hub', 'bifrost_integrations?id=eq.' + id + '&select=access_token,refresh_token,expires_at,status');
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.status !== 'connected') return null;
  const expSoon = !row.expires_at || new Date(row.expires_at) < new Date(Date.now() + 60000);
  if (row.refresh_token && clientId && clientSecret && expSoon) {
    try {
      const tr = await fetch(refreshUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: clientId, client_secret: clientSecret, scope: 'offline' }) });
      const t = await tr.json();
      if (t.access_token) {
        await supa('hub', 'bifrost_integrations?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: { access_token: t.access_token, refresh_token: t.refresh_token || row.refresh_token, expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null } });
        return t.access_token;
      }
    } catch (e) {}
  }
  return row.access_token;
}

module.exports = async (req, res) => {
  const out = { ok: true, configured: { whoop: !!process.env.WHOOP_CLIENT_ID, oura: !!process.env.OURA_CLIENT_ID }, whoop: null, oura: null };
  try {
    if (out.configured.whoop) {
      const at = await freshToken('whoop', 'https://api.prod.whoop.com/oauth/oauth2/token', process.env.WHOOP_CLIENT_ID, process.env.WHOOP_CLIENT_SECRET);
      if (!at) out.whoop = { connected: false };
      else {
        const H = { Authorization: 'Bearer ' + at };
        const [rec, sl] = await Promise.all([
          fetch('https://api.prod.whoop.com/developer/v1/recovery?limit=1', { headers: H }).then(r => r.json()).catch(() => ({})),
          fetch('https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1', { headers: H }).then(r => r.json()).catch(() => ({}))
        ]);
        const r0 = (rec.records && rec.records[0] && rec.records[0].score) || {};
        const s0 = (sl.records && sl.records[0] && sl.records[0].score) || {};
        out.whoop = { connected: true, recovery: r0.recovery_score, resting_hr: r0.resting_heart_rate, hrv: r0.hrv_rmssd_milli, sleep_performance: s0.sleep_performance_percentage };
      }
    }
    if (out.configured.oura) {
      const at = await freshToken('oura', 'https://api.ouraring.com/oauth/token', process.env.OURA_CLIENT_ID, process.env.OURA_CLIENT_SECRET);
      if (!at) out.oura = { connected: false };
      else {
        const H = { Authorization: 'Bearer ' + at };
        const today = new Date().toISOString().slice(0, 10);
        const [rd, sl] = await Promise.all([
          fetch('https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=' + today, { headers: H }).then(r => r.json()).catch(() => ({})),
          fetch('https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=' + today, { headers: H }).then(r => r.json()).catch(() => ({}))
        ]);
        const r0 = (rd.data && rd.data[0]) || {};
        const s0 = (sl.data && sl.data[0]) || {};
        out.oura = { connected: true, readiness: r0.score, sleep_score: s0.score };
      }
    }
    return json(res, 200, out);
  } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
};
