// GET /api/status — which integrations are configured (drives the UI's connected state).
const { json } = require('./_lib');
module.exports = (req, res) => {
  const has = (e) => !!process.env[e];
  json(res, 200, {
    ok: true,
    integrations: {
      nft_admin: has('OPULENCE_TECH_SERVICE_ROLE'),
      hub_admin: has('BIFROST_SERVICE_ROLE'),
      slack: has('SLACK_BOT_TOKEN'),
      google: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET')
    }
  });
};
