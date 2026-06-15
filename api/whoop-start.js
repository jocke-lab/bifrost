// GET /api/whoop-start — begin Whoop OAuth
const { json } = require('./_lib');
module.exports = (req, res) => {
  const id = process.env.WHOOP_CLIENT_ID;
  if (!id) return json(res, 200, { ok: false, configured: false, need: 'WHOOP_CLIENT_ID' });
  const origin = 'https://' + (req.headers.host || 'bifrostlkl.com');
  const u = 'https://api.prod.whoop.com/oauth/oauth2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: origin + '/api/whoop-callback', response_type: 'code',
    scope: 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement', state: 'bifrost'
  });
  res.statusCode = 302; res.setHeader('Location', u); res.end();
};
