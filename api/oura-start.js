// GET /api/oura-start — begin Oura OAuth for the SIGNED-IN employee.
// Requires a valid hub session; mints a single-use nonce in oauth_states keyed
// to this person, then redirects to Oura with state=nonce. redirect_uri is
// computed from PUBLIC_ORIGIN (must match the Oura console + the callback).
const { json, supa, requireUser, PUBLIC_ORIGIN, fail } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  const id = process.env.OURA_CLIENT_ID;
  if (!id) return json(res, 200, { ok: false, configured: false, need: 'OURA_CLIENT_ID' });
  try {
    const { uid } = await requireUser(req);
    const nonce = crypto.randomBytes(24).toString('hex');
    await supa('hub', 'oauth_states', { method: 'POST', prefer: 'return=minimal', body: { nonce, person_id: uid, provider: 'oura' } });
    const u = 'https://cloud.ouraring.com/oauth/authorize?' + new URLSearchParams({
      client_id: id,
      redirect_uri: PUBLIC_ORIGIN + '/api/oura-callback',
      response_type: 'code',
      scope: 'personal daily',
      state: nonce
    });
    res.statusCode = 302; res.setHeader('Location', u); res.end();
  } catch (e) { return fail(res, e); }
};
