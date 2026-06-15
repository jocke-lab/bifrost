// GET /api/oura-callback — exchange code → store token in hub → back to app
const { json, supa } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const id = process.env.OURA_CLIENT_ID, secret = process.env.OURA_CLIENT_SECRET;
    if (!id || !secret) return json(res, 200, { ok: false, configured: false, need: 'OURA_CLIENT_ID/SECRET' });
    const code = new URL(req.url, 'http://x').searchParams.get('code');
    if (!code) { res.statusCode = 400; return res.end('missing code'); }
    const origin = 'https://' + (req.headers.host || 'bifrostlkl.com');
    const tr = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: id, client_secret: secret, redirect_uri: origin + '/api/oura-callback' })
    });
    const tok = await tr.json();
    if (tok.error) { res.statusCode = 400; return res.end('token error: ' + (tok.error_description || tok.error)); }
    await supa('hub', 'bifrost_integrations?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { id: 'oura', status: 'connected', access_token: tok.access_token || null, refresh_token: tok.refresh_token || null, scope: tok.scope || null, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }
    });
    res.statusCode = 302; res.setHeader('Location', '/#connect'); res.end();
  } catch (e) { res.statusCode = 500; res.end('callback error: ' + e.message); }
};
