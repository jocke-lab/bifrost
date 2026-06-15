// GET /api/oura-start — begin Oura OAuth
const { json } = require('./_lib');
module.exports = (req, res) => {
  const id = process.env.OURA_CLIENT_ID;
  if (!id) return json(res, 200, { ok: false, configured: false, need: 'OURA_CLIENT_ID' });
  const origin = 'https://' + (req.headers.host || 'bifrostlkl.com');
  const u = 'https://cloud.ouraring.com/oauth/authorize?' + new URLSearchParams({
    client_id: id, redirect_uri: origin + '/api/oura-callback', response_type: 'code', scope: 'personal daily', state: 'bifrost'
  });
  res.statusCode = 302; res.setHeader('Location', u); res.end();
};
