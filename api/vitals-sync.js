// POST (or GET) /api/vitals-sync — pull TODAY's wearable data for the SIGNED-IN
// employee and persist it as vitals_samples rows (per-person).
//
// For each connected provider on this user:
//   Whoop → recovery, hrv, resting_hr, sleep_performance, day strain (kJ→kcal
//           as calories_active)
//   Oura  → readiness→recovery, sleep_score, steps, active calories→calories_active
//
// Samples are written DIRECTLY to the hub via supa('hub','vitals_samples',...)
// with the service role and person_id=uid (we already hold the service role, so
// this avoids a second round-trip to the company edge function). Resilient: a
// provider that isn't connected, has no creds, or returns nothing is skipped
// and reported in {synced}. Tokens never reach the browser.
const { json, supa, requireUser, fail } = require('./_lib');

const todayStr = () => new Date().toISOString().slice(0, 10);

// Refresh-if-expired for one (person, provider) row. Returns access token | null.
async function freshToken(uid, provider, refreshUrl, clientId, clientSecret) {
  const rows = await supa('hub', 'wearable_connections?person_id=eq.' + encodeURIComponent(uid) + '&provider=eq.' + provider + '&select=access_token,refresh_token,expires_at,status,scopes');
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.status !== 'connected') return null;
  const expSoon = !row.expires_at || new Date(row.expires_at) < new Date(Date.now() + 60000);
  if (row.refresh_token && clientId && clientSecret && expSoon) {
    try {
      const tr = await fetch(refreshUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: clientId, client_secret: clientSecret }) });
      const t = await tr.json();
      if (t.access_token) {
        await supa('hub', 'wearable_connections?person_id=eq.' + encodeURIComponent(uid) + '&provider=eq.' + provider, {
          method: 'PATCH', prefer: 'return=minimal',
          body: { access_token: t.access_token, refresh_token: t.refresh_token || row.refresh_token, scopes: t.scope || row.scopes || null, expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }
        });
        return t.access_token;
      }
    } catch (e) {}
  }
  return row.access_token;
}

// Write a batch of samples for this person. Skips empty/NaN values.
async function writeSamples(uid, device, list) {
  const rows = (list || [])
    .filter(s => s && s.value != null && Number.isFinite(Number(s.value)))
    .map(s => ({ person_id: uid, kind: s.kind, value: Number(s.value), unit: s.unit || null, taken_at: s.taken_at || new Date().toISOString(), device_source: device }));
  if (!rows.length) return 0;
  await supa('hub', 'vitals_samples', { method: 'POST', prefer: 'return=minimal', body: rows });
  return rows.length;
}

async function syncWhoop(uid) {
  if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) return { connected: false, reason: 'needs WHOOP creds' };
  const at = await freshToken(uid, 'whoop', 'https://api.prod.whoop.com/oauth/oauth2/token', process.env.WHOOP_CLIENT_ID, process.env.WHOOP_CLIENT_SECRET);
  if (!at) return { connected: false };
  const H = { Authorization: 'Bearer ' + at };
  const [rec, sl, cyc] = await Promise.all([
    fetch('https://api.prod.whoop.com/developer/v1/recovery?limit=1', { headers: H }).then(r => r.json()).catch(() => ({})),
    fetch('https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1', { headers: H }).then(r => r.json()).catch(() => ({})),
    fetch('https://api.prod.whoop.com/developer/v1/cycle?limit=1', { headers: H }).then(r => r.json()).catch(() => ({}))
  ]);
  const r0 = (rec.records && rec.records[0] && rec.records[0].score) || {};
  const s0 = (sl.records && sl.records[0] && sl.records[0].score) || {};
  const c0 = (cyc.records && cyc.records[0] && cyc.records[0].score) || {};
  const taken = new Date().toISOString();
  // Whoop day strain is reported as kilojoules; kJ → kcal (×0.239006).
  const kj = c0.kilojoule;
  const calActive = (kj != null && Number.isFinite(Number(kj))) ? Math.round(Number(kj) * 0.239006) : null;
  const n = await writeSamples(uid, 'whoop', [
    { kind: 'recovery', value: r0.recovery_score, unit: '%', taken_at: taken },
    { kind: 'hrv', value: r0.hrv_rmssd_milli, unit: 'ms', taken_at: taken },
    { kind: 'resting_hr', value: r0.resting_heart_rate, unit: 'bpm', taken_at: taken },
    { kind: 'sleep_score', value: s0.sleep_performance_percentage, unit: '%', taken_at: taken },
    { kind: 'calories_active', value: calActive, unit: 'kcal', taken_at: taken }
  ]);
  return { connected: true, samples: n };
}

async function syncOura(uid) {
  if (!process.env.OURA_CLIENT_ID || !process.env.OURA_CLIENT_SECRET) return { connected: false, reason: 'needs OURA creds' };
  const at = await freshToken(uid, 'oura', 'https://api.ouraring.com/oauth/token', process.env.OURA_CLIENT_ID, process.env.OURA_CLIENT_SECRET);
  if (!at) return { connected: false };
  const H = { Authorization: 'Bearer ' + at };
  const day = todayStr();
  const [rd, sl, act] = await Promise.all([
    fetch('https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=' + day, { headers: H }).then(r => r.json()).catch(() => ({})),
    fetch('https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=' + day, { headers: H }).then(r => r.json()).catch(() => ({})),
    fetch('https://api.ouraring.com/v2/usercollection/daily_activity?start_date=' + day, { headers: H }).then(r => r.json()).catch(() => ({}))
  ]);
  const r0 = (rd.data && rd.data[0]) || {};
  const s0 = (sl.data && sl.data[0]) || {};
  const a0 = (act.data && act.data[0]) || {};
  const taken = new Date().toISOString();
  const n = await writeSamples(uid, 'oura', [
    { kind: 'recovery', value: r0.score, unit: '%', taken_at: taken },
    { kind: 'sleep_score', value: s0.score, unit: '%', taken_at: taken },
    { kind: 'steps', value: a0.steps, unit: 'steps', taken_at: taken },
    { kind: 'calories_active', value: a0.active_calories, unit: 'kcal', taken_at: taken }
  ]);
  return { connected: true, samples: n };
}

module.exports = async (req, res) => {
  let uid;
  try { ({ uid } = await requireUser(req)); } catch (e) { return fail(res, e); }
  const synced = {};
  try {
    // Run both; isolate failures so one provider can't sink the other.
    try { synced.whoop = await syncWhoop(uid); } catch (e) { synced.whoop = { connected: false, error: e.message }; }
    try { synced.oura = await syncOura(uid); } catch (e) { synced.oura = { connected: false, error: e.message }; }
    return json(res, 200, { ok: true, synced });
  } catch (e) { return fail(res, e); }
};
