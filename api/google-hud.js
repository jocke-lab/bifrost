// GET /api/google-hud — live Calendar events + Gmail inbox + Drive files
const { json, supa } = require('./_lib');

async function freshAccess() {
  const rows = await supa('hub', 'bifrost_integrations?id=eq.google&select=refresh_token,account_email');
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.refresh_token) return null;
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: row.refresh_token, grant_type: 'refresh_token' })
  });
  const tok = await tr.json();
  return tok.access_token ? { access: tok.access_token, email: row.account_email } : null;
}

module.exports = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return json(res, 200, { ok: false, configured: false, need: 'GOOGLE_CLIENT_ID' });
  try {
    const t = await freshAccess();
    if (!t) return json(res, 200, { ok: true, configured: true, connected: false });
    const H = { Authorization: 'Bearer ' + t.access };
    const now = new Date().toISOString();
    const [cal, gl, drive] = await Promise.all([
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams({ timeMin: now, maxResults: '10', singleEvents: 'true', orderBy: 'startTime' }), { headers: H }).then(r => r.json()).catch(() => ({})),
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=in:inbox', { headers: H }).then(r => r.json()).catch(() => ({})),
      fetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ pageSize: '10', orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' }), { headers: H }).then(r => r.json()).catch(() => ({}))
    ]);
    let gmail = [];
    if (gl.messages) {
      gmail = (await Promise.all(gl.messages.slice(0, 8).map(m =>
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject', { headers: H })
          .then(r => r.json()).then(d => { const h = {}; ((d.payload && d.payload.headers) || []).forEach(x => h[x.name] = x.value); return { id: d.id, from: h.From, subject: h.Subject, snippet: d.snippet, date: Number(d.internalDate) }; }).catch(() => null)
      ))).filter(Boolean);
    }
    return json(res, 200, {
      ok: true, configured: true, connected: true, email: t.email,
      calendar: (cal.items || []).map(e => ({ id: e.id, summary: e.summary, start: (e.start && (e.start.dateTime || e.start.date)), location: e.location, htmlLink: e.htmlLink })),
      gmail,
      drive: (drive.files || [])
    });
  } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
};
