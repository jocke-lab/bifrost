// GET /api/google-start — kick off Google OAuth (Calendar + Drive + Gmail)
const { json } = require('./_lib');
module.exports = (req, res) => {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return json(res, 200, { ok: false, configured: false, need: 'GOOGLE_CLIENT_ID', message: 'Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to Vercel env to enable Google.' });
  const origin = 'https://' + (req.headers.host || 'bifrostlkl.com');
  const scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.readonly'
  ].join(' ');
  const u = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: origin + '/api/google-callback',
    response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope
  });
  res.statusCode = 302; res.setHeader('Location', u); res.end();
};
