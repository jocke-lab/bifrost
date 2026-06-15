// GET /api/oura-callback — exchange code → store token PER-EMPLOYEE → back to app.
// The browser arrives here from Oura (no hub bearer present), so the acting
// person is resolved from the single-use nonce in oauth_states (state param).
// The nonce is rejected if missing/consumed and marked consumed before the
// token exchange. redirect_uri must match oura-start.
const { json, supa, PUBLIC_ORIGIN } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const id = process.env.OURA_CLIENT_ID, secret = process.env.OURA_CLIENT_SECRET;
    if (!id || !secret) return json(res, 200, { ok: false, configured: false, need: 'OURA_CLIENT_ID/SECRET' });
    const url = new URL(req.url, 'http://x');
    const code = url.searchParams.get('code');
    const nonce = url.searchParams.get('state');
    if (!code) { res.statusCode = 400; return res.end('missing code'); }
    if (!nonce) { res.statusCode = 400; return res.end('missing state'); }

    const rows = await supa('hub', 'oauth_states?nonce=eq.' + encodeURIComponent(nonce) + '&provider=eq.oura&select=nonce,person_id,consumed');
    const st = Array.isArray(rows) ? rows[0] : null;
    if (!st || !st.person_id) { res.statusCode = 400; return res.end('invalid state'); }
    if (st.consumed) { res.statusCode = 400; return res.end('state already used'); }
    await supa('hub', 'oauth_states?nonce=eq.' + encodeURIComponent(nonce), { method: 'PATCH', prefer: 'return=minimal', body: { consumed: true } });
    const uid = st.person_id;

    const tr = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: id, client_secret: secret, redirect_uri: PUBLIC_ORIGIN + '/api/oura-callback' })
    });
    const tok = await tr.json();
    if (tok.error) { res.statusCode = 400; return res.end('token error: ' + (tok.error_description || tok.error)); }

    await supa('hub', 'wearable_connections?on_conflict=person_id,provider', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        person_id: uid, provider: 'oura', status: 'connected',
        access_token: tok.access_token || null,
        refresh_token: tok.refresh_token || null,
        scopes: tok.scope || null,
        expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }
    });
    res.statusCode = 302; res.setHeader('Location', PUBLIC_ORIGIN + '/#vitals'); res.end();
  } catch (e) { res.statusCode = 500; res.end('callback error: ' + e.message); }
};
