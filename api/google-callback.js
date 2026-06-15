// GET /api/google-callback — exchange code → store tokens in hub → back to the app
const { json, supa } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) return json(res, 200, { ok: false, configured: false, need: 'GOOGLE_CLIENT_ID/SECRET' });
    const u = new URL(req.url, 'http://x'); const code = u.searchParams.get('code');
    if (!code) { res.statusCode = 400; return res.end('missing code'); }
    const origin = 'https://' + (req.headers.host || 'bifrostlkl.com');
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: origin + '/api/google-callback', grant_type: 'authorization_code' })
    });
    const tok = await tr.json();
    if (tok.error) { res.statusCode = 400; return res.end('token error: ' + tok.error); }
    let email = null;
    try { const me = await (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } })).json(); email = me.email; } catch (e) {}
    await supa('hub', 'bifrost_integrations?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        id: 'google', status: 'connected', account_email: email,
        access_token: tok.access_token || null, refresh_token: tok.refresh_token || null,
        scope: tok.scope || null, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }
    });
    res.statusCode = 302; res.setHeader('Location', '/#connect'); res.end();
  } catch (e) { res.statusCode = 500; res.end('callback error: ' + e.message); }
};
