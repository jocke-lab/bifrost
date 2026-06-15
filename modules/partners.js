/* ============================================================================
   partners.js — Partners.
   Every counterparty we buy from, sell to or deal with — each with a LOGO.
   ----------------------------------------------------------------------------
   Layout:
     view-head (with "＋ Add partner")
     · KPI row (Partners · Vendors · Buyers · Spend YTD)
     · directory table — colored monogram LOGO tile, name, kind tag, country,
       org/VAT id, totals
     · clicking a partner → detail panel: logo + identifiers, address, primary
       contact, created/updated + "last modified by" metadata, and a HISTORY
       list (payments / costs / deals / documents) drawn from the audit stream —
       making clear the record is referenced by Ledger and Audit.
     · "＋ Add partner" overlay form (org/VAT/EIN fields by country) writes
       HELM.audit.log and is gated by HELM.session.can('partners.write').
   Follows the HELM module contract (see command.js). Deterministic data only.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'partners',
    label: 'Partners',
    icon: '🤝',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;
      const team = S.team;

      /* ── money helper: Swedish company → render as " kr" ─────────────────
         H.fmt.money treats a '' currency as falsy and falls back to '$', so we
         strip the symbol and append a ' kr' suffix (same trick as customers). */
      const kr = n => H.fmt.money(n).replace(/^(-?)\$/, '$1') + ' kr';

      /* ── accent palette for monogram logo tiles (tokens only) ─────────────
         Each partner gets a stable tint derived from its name hash. */
      /* tints are token-derived: bg/border are color-mixes of the SAME token
         used for fg, so the module ships no hardcoded colours (audit item 2). */
      const tint = (token, bgPct, bdPct) => ({
        bg: `color-mix(in srgb, ${token} ${bgPct}%, transparent)`,
        fg: token,
        bd: `color-mix(in srgb, ${token} ${bdPct}%, transparent)`
      });
      const TINTS = [
        Object.assign({ key: 'aqua' },   tint('var(--accent1)', 14, 32)),
        Object.assign({ key: 'sky' },    tint('var(--accent2)', 14, 32)),
        Object.assign({ key: 'violet' }, tint('var(--accent3)', 16, 34)),
        Object.assign({ key: 'amber' },  tint('var(--warn)',    14, 32)),
        Object.assign({ key: 'rose' },   tint('var(--danger)',  13, 30))
      ];
      const tintOf = name => TINTS[D.int('pt-tint-' + name, 0, TINTS.length - 1)];

      // KIND → tag severity class for colour
      const KIND_CLS = { Vendor: 'warn', Buyer: 'ok', Both: 'info', Partner: '' };
      const COUNTRY_FLAG = { SE: '🇸🇪', DE: '🇩🇪', IE: '🇮🇪', US: '🇺🇸', NL: '🇳🇱', GB: '🇬🇧', FR: '🇫🇷', FI: '🇫🇮' };

      /* ── partner roster (deterministic; ~14 realistic SE/EU counterparties) ─
         id used as the audit entityId so Ledger/Audit can reference the record.
         spend = what WE pay them (vendors) · billed = what THEY pay US (buyers). */
      const ROSTER = [
        { id: 'pt-postnord', name: 'PostNord Sverige AB', kind: 'Vendor', cat: 'Logistics & shipping', country: 'SE', city: 'Solna', org: '556711-5695', vat: 'SE556711569501', contact: 'Logistik · kundtjänst', email: 'foretag@postnord.se', owner: 'u-lena', since: '2025' },
        { id: 'pt-northwind', name: 'Northwind AB', kind: 'Both', cat: 'Wholesale & resale', country: 'SE', city: 'Stockholm', org: '556034-8772', vat: 'SE556034877201', contact: 'Erik Wahl', email: 'erik@northwind.se', owner: 'u-sofia', since: '2024' },
        { id: 'pt-stripe', name: 'Stripe Payments Europe Ltd', kind: 'Vendor', cat: 'Payments & fees', country: 'IE', city: 'Dublin', org: 'IE513174', vat: 'IE3206488LH', contact: 'Billing support', email: 'support@stripe.com', owner: 'u-ola', since: '2024' },
        { id: 'pt-fortnox', name: 'Fortnox AB', kind: 'Vendor', cat: 'Accounting software', country: 'SE', city: 'Växjö', org: '556469-6291', vat: 'SE556469629101', contact: 'Partner desk', email: 'partner@fortnox.se', owner: 'u-ola', since: '2024' },
        { id: 'pt-aws', name: 'Amazon Web Services EMEA SARL', kind: 'Vendor', cat: 'Cloud infrastructure', country: 'NL', city: 'Amsterdam', org: 'L-186284', vat: 'LU26888617', contact: 'Account team', email: 'aws-eu@amazon.com', owner: 'u-noah', since: '2024' },
        { id: 'pt-figma', name: 'Figma Inc', kind: 'Vendor', cat: 'Design software', country: 'US', city: 'San Francisco', org: '46-1234567', vat: '—', contact: 'Subscriptions', email: 'billing@figma.com', owner: 'u-noah', since: '2025' },
        { id: 'pt-tink', name: 'Tink AB', kind: 'Vendor', cat: 'Open-banking data', country: 'SE', city: 'Stockholm', org: '556898-2192', vat: 'SE556898219201', contact: 'API support', email: 'support@tink.com', owner: 'u-ola', since: '2025' },
        { id: 'pt-lykke', name: 'Lykke Studios AB', kind: 'Buyer', cat: 'Creative agency', country: 'SE', city: 'Göteborg', org: '559088-4421', vat: 'SE559088442101', contact: 'Nora Lykke', email: 'nora@lykkestudios.se', owner: 'u-sofia', since: '2025' },
        { id: 'pt-forsberg', name: 'Forsberg Konsult AB', kind: 'Buyer', cat: 'Consulting', country: 'SE', city: 'Malmö', org: '556982-1077', vat: 'SE556982107701', contact: 'Anders Forsberg', email: 'anders@forsbergkonsult.se', owner: 'u-sofia', since: '2024' },
        { id: 'pt-aurora', name: 'Aurora Fintech AB', kind: 'Buyer', cat: 'Fintech', country: 'SE', city: 'Stockholm', org: '559210-3380', vat: 'SE559210338001', contact: 'Petra Sund', email: 'petra@aurorafintech.se', owner: 'u-sofia', since: '2023' },
        { id: 'pt-hetzner', name: 'Hetzner Online GmbH', kind: 'Vendor', cat: 'Dedicated servers', country: 'DE', city: 'Gunzenhausen', org: 'HRB 3204', vat: 'DE812871812', contact: 'Support', email: 'info@hetzner.com', owner: 'u-noah', since: '2025' },
        { id: 'pt-slack', name: 'Slack Technologies Ltd', kind: 'Vendor', cat: 'Team comms', country: 'IE', city: 'Dublin', org: 'IE603640', vat: 'IE3336483PH', contact: 'Billing', email: 'billing@slack.com', owner: 'u-mira', since: '2024' },
        { id: 'pt-hubspot', name: 'HubSpot Ireland Ltd', kind: 'Vendor', cat: 'CRM & marketing', country: 'IE', city: 'Dublin', org: 'IE503484', vat: 'IE9826985H', contact: 'Customer success', email: 'support@hubspot.com', owner: 'u-kai', since: '2025' },
        { id: 'pt-solvik', name: 'Solvik Energi AB', kind: 'Both', cat: 'Energy & utilities', country: 'SE', city: 'Västerås', org: '556745-1190', vat: 'SE556745119001', contact: 'Maria Sol', email: 'maria@solvik.se', owner: 'u-lena', since: '2023' }
      ];

      // derive deterministic totals + dates per partner
      ROSTER.forEach(p => {
        const isVendorish = p.kind === 'Vendor' || p.kind === 'Both';
        const isBuyerish = p.kind === 'Buyer' || p.kind === 'Both';
        p.spend = isVendorish ? D.int('pt-spend-' + p.id, 8000, 420000) : 0;   // we pay them (YTD, kr)
        p.billed = isBuyerish ? D.int('pt-bill-' + p.id, 24000, 680000) : 0;   // they pay us (YTD, kr)
        p.txns = D.int('pt-txn-' + p.id, 3, 64);
        p.trend = D.series('pt-tr-' + p.id, 12, Math.max(p.spend, p.billed) * 0.6, Math.max(p.spend, p.billed), 0.16);
        // a "created" date in early 2025, a recent "updated" date in June 2026
        const cDay = D.int('pt-cday-' + p.id, 1, 27);
        const cMon = D.int('pt-cmon-' + p.id, 1, 11);
        p.createdAt = `2025-${String(cMon).padStart(2, '0')}-${String(cDay).padStart(2, '0')}`;
        p.updatedAt = `2026-06-${String(D.int('pt-uday-' + p.id, 1, 14)).padStart(2, '0')}`;
        p.createdBy = D.pick('pt-cby-' + p.id, ['u-arvid', 'u-mira', 'u-ola']);
        p.updatedBy = D.pick('pt-uby-' + p.id, ['u-arvid', 'u-mira', 'u-ola', 'u-sofia', 'u-lena']);
      });

      // newly-added partners live here (session-local, from the Add form)
      const ADDED = [];
      const allPartners = () => ADDED.concat(ROSTER);

      const personName = id => { const p = team.find(t => t.id === id); return p ? p.name : id; };
      const initials = name => H.data.initials(name);

      /* ── KPI figures (derived from the roster so they can't drift) ───────── */
      const vendorCount = () => allPartners().filter(p => p.kind === 'Vendor' || p.kind === 'Both').length;
      const buyerCount = () => allPartners().filter(p => p.kind === 'Buyer' || p.kind === 'Both').length;
      const spendYtd = () => allPartners().reduce((a, p) => a + (p.spend || 0), 0);

      /* ── permission gate for mutating actions ───────────────────────────── */
      const canWrite = S.can('partners.write');

      /* ====================================================================
         VIEW HEAD
         ==================================================================== */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🤝</div>
            <div>
              <h1>Partners</h1>
              <p>Every counterparty we buy from, sell to or deal with — each with a logo.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="export">⤓ Export</button>
            <button class="btn btn-primary btn-sm" data-act="add"${canWrite ? '' : ' disabled title="Needs member role"'}>＋ Add partner</button>
          </div>
        </div>
      `));

      /* ====================================================================
         KPI ROW — Partners · Vendors · Buyers · Spend YTD
         ==================================================================== */
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      const kpis = [
        { label: 'PARTNERS', count: allPartners().length, fmt: 'num', trend: '+3 · 30d', dir: 'up', ico: '🤝' },
        { label: 'VENDORS', count: vendorCount(), fmt: 'num', trend: 'we buy', dir: 'flat', ico: '📥' },
        { label: 'BUYERS', count: buyerCount(), fmt: 'num', trend: 'we sell', dir: 'flat', ico: '📤' },
        { label: 'SPEND · YTD', count: spendYtd(), fmt: 'num', suffix: ' kr', trend: '+8.4%', dir: 'up', ico: '💸' }
      ];
      kpis.forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi partners-kpi" data-kpi="${k.label}">
            <div class="kpi-label">${k.ico} ${k.label}</div>
            <div class="kpi-value sm" data-count="${k.count}" data-fmt="${k.fmt}"${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
            <span class="kpi-trend ${k.dir}">${k.trend}</span>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ====================================================================
         MAIN ROW — directory table (span 2) | detail panel
         ==================================================================== */
      const main = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // ----- DIRECTORY TABLE -----
      const tableCard = H.el(`
        <div class="card span-2 flush partners-table-card">
          <div class="card-head partners-table-head">
            <h3><span class="hico">📇</span> Partner Directory</h3>
            <span class="ch-meta partners-count-meta"></span>
          </div>
          <div class="partners-filters">
            <button class="partners-filter active" data-filter="all">All</button>
            <button class="partners-filter" data-filter="Vendor">Vendors</button>
            <button class="partners-filter" data-filter="Buyer">Buyers</button>
            <button class="partners-filter" data-filter="Both">Both</button>
            <button class="partners-filter" data-filter="Partner">Partners</button>
          </div>
          <div class="partners-table-scroll">
            <table class="table partners-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Kind</th>
                  <th>Country</th>
                  <th>Org / VAT</th>
                  <th class="num">Spend</th>
                  <th class="num">Billed</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = tableCard.querySelector('tbody');
      const countMeta = tableCard.querySelector('.partners-count-meta');
      let activeFilter = 'all';

      // a namespaced monogram LOGO tile
      const logoTile = (name, lg) => {
        const t = tintOf(name);
        return `<div class="partners-logo${lg ? ' lg' : ''}" style="background:${t.bg};color:${t.fg};border-color:${t.bd}">${initials(name)}</div>`;
      };

      function rowFor(p) {
        const tr = H.el(`
          <tr data-pt="${p.id}" class="partners-row">
            <td>
              <div class="partners-cell">
                ${logoTile(p.name)}
                <div class="partners-cell-body">
                  <div class="partners-cell-name">${p.name}</div>
                  <div class="partners-cell-sub">${p.cat}</div>
                </div>
              </div>
            </td>
            <td><span class="tag ${KIND_CLS[p.kind]}">${p.kind}</span></td>
            <td class="partners-country">${COUNTRY_FLAG[p.country] || '🏳'} ${p.country}</td>
            <td class="mono partners-ids">
              <div class="partners-id-org">${p.org}</div>
              <div class="partners-id-vat">${p.vat}</div>
            </td>
            <td class="num mono">${p.spend ? kr(p.spend) : '—'}</td>
            <td class="num mono">${p.billed ? kr(p.billed) : '—'}</td>
          </tr>
        `);
        return tr;
      }

      function paintTable() {
        tbody.innerHTML = '';
        const list = allPartners().filter(p => {
          if (activeFilter === 'all') return true;
          if (activeFilter === 'Vendor') return p.kind === 'Vendor' || p.kind === 'Both';
          if (activeFilter === 'Buyer') return p.kind === 'Buyer' || p.kind === 'Both';
          return p.kind === activeFilter;
        }).sort((a, b) => (b.spend + b.billed) - (a.spend + a.billed));
        list.forEach(p => {
          const tr = rowFor(p);
          if (selected && p.id === selected.id) tr.classList.add('is-selected');
          tbody.appendChild(tr);
        });
        countMeta.textContent = `${list.length} OF ${allPartners().length} · SORTED BY VALUE`;
      }

      // ----- DETAIL PANEL -----
      const detailCard = H.el(`
        <div class="card partners-detail">
          <div class="card-head">
            <h3><span class="hico">🪪</span> Partner Record</h3>
            <span class="ch-meta">REFERENCED BY LEDGER · AUDIT</span>
          </div>
          <div class="partners-detail-body"></div>
        </div>
      `);
      const detailBody = detailCard.querySelector('.partners-detail-body');

      // history is derived from the audit stream — events that link to this
      // partner id, plus a deterministic synthetic ledger of payments/costs/
      // deals/documents so a record always shows referenced activity.
      const HIST_ICO = { payment: '💸', cost: '📒', deal: '🎯', document: '🖊️', invoice: '🧾', shipment: '🚚' };
      function historyFor(p) {
        const out = [];
        // 1) real audit events linked to this partner
        H.audit.list({ limit: 200 }).forEach(e => {
          const linked = (e.links || []).some(l => l.entityType === 'Partner' && l.entityId === p.id) ||
            (e.entityType === 'Partner' && e.entityId === p.id);
          if (!linked) return;
          out.push({
            type: /payment|invoice|paid/.test(e.action) ? 'payment' : /cost/.test(e.action) ? 'cost' : /deal/.test(e.action) ? 'deal' : 'document',
            title: e.summary,
            sub: (e.context && e.context.module ? e.context.module : 'audit') + ' · ' + e.action,
            ts: e.ts.slice(0, 10),
            amount: e.amount ? e.amount.value : null,
            real: true
          });
        });
        // 2) deterministic synthetic history so every record reads as live
        const kinds = [];
        if (p.spend) kinds.push(['cost', 'Cost booked', 'ledger'], ['payment', 'Payment sent', 'billing']);
        if (p.billed) kinds.push(['payment', 'Invoice paid', 'billing'], ['deal', 'Deal renewed', 'pipeline']);
        kinds.push(['document', 'Agreement filed', 'vault']);
        const n = 4;
        for (let i = 0; i < n; i++) {
          const [type, label, mod] = kinds[D.int('pt-h-' + p.id + '-' + i, 0, kinds.length - 1)];
          const amt = (type === 'document') ? null : D.int('pt-ha-' + p.id + '-' + i, 1200, p.kind === 'Buyer' ? 84000 : 42000);
          const day = D.int('pt-hd-' + p.id + '-' + i, 1, 13);
          out.push({
            type, title: `${label} · ${personName(p.updatedBy).split(' ')[0]}`,
            sub: `${mod} · ${p.name.split(' ')[0]}`, ts: `2026-06-${String(day).padStart(2, '0')}`,
            amount: amt, real: false
          });
        }
        return out.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8);
      }

      function renderDetail(p) {
        const t = tintOf(p.name);
        const total = (p.spend || 0) + (p.billed || 0);
        const hist = historyFor(p);
        detailBody.innerHTML = `
          <div class="partners-detail-top">
            ${logoTile(p.name, true)}
            <div class="partners-detail-id">
              <div class="partners-detail-name">${p.name}</div>
              <div class="partners-detail-meta">${p.cat} · ${COUNTRY_FLAG[p.country] || ''} ${p.city}</div>
              <div class="partners-detail-tags">
                <span class="tag ${KIND_CLS[p.kind]}">${p.kind}</span>
                <span class="pill info">SINCE ${p.since}</span>
              </div>
            </div>
          </div>

          <div class="partners-detail-ids">
            <div class="stat-row"><span class="sr-label">${p.country === 'US' ? 'EIN' : 'Org. nr'}</span><span class="sr-val mono">${p.org}</span></div>
            <div class="stat-row"><span class="sr-label">VAT no.</span><span class="sr-val mono">${p.vat}</span></div>
            <div class="stat-row"><span class="sr-label">Address</span><span class="sr-val">${p.city}, ${p.country}</span></div>
          </div>

          <div class="partners-detail-contact">
            <div class="avatar">${initials(p.contact)}</div>
            <div class="partners-detail-contact-body">
              <div class="partners-detail-contact-name">${p.contact}</div>
              <div class="partners-detail-contact-role">${p.email}</div>
            </div>
            <span class="pill ok">PRIMARY</span>
          </div>

          <div class="partners-detail-totals">
            <div class="partners-total">
              <div class="partners-total-label">SPEND · YTD</div>
              <div class="partners-total-val">${p.spend ? kr(p.spend) : '—'}</div>
            </div>
            <div class="partners-total">
              <div class="partners-total-label">BILLED · YTD</div>
              <div class="partners-total-val">${p.billed ? kr(p.billed) : '—'}</div>
            </div>
            <div class="partners-total">
              <div class="partners-total-label">TRANSACTIONS</div>
              <div class="partners-total-val">${p.txns}</div>
            </div>
          </div>

          <div class="partners-detail-spark">
            <div class="row between">
              <span class="partners-detail-sparklabel">VALUE · 12 MO</span>
              <span class="mono partners-detail-sparkval">${kr(total)}</span>
            </div>
            <div class="spark">${H.charts.spark(p.trend, { height: 38 })}</div>
          </div>

          <div class="section-title">History · payments · costs · deals · docs</div>
          <div class="list partners-history"></div>

          <div class="partners-meta-line">
            <span>Created ${p.createdAt} by ${personName(p.createdBy)}</span>
            <span class="partners-meta-dot">·</span>
            <span>Updated ${p.updatedAt} · last modified by <b>${personName(p.updatedBy)}</b></span>
          </div>

          <div class="partners-detail-actions row gap-sm">
            <button class="btn btn-sm" data-d-act="ledger">📒 Open in Ledger</button>
            <button class="btn btn-sm" data-d-act="audit">🔎 Audit trail</button>
            <button class="btn btn-sm" data-d-act="email">✉</button>
          </div>
        `;

        // fill history list
        const histList = detailBody.querySelector('.partners-history');
        if (!hist.length) {
          histList.innerHTML = `<div class="partners-history-empty muted">No referenced activity yet.</div>`;
        } else {
          hist.forEach(h => {
            histList.appendChild(H.el(`
              <div class="list-item partners-history-item">
                <div class="li-ico">${HIST_ICO[h.type] || '•'}</div>
                <div class="li-body">
                  <div class="li-title">${h.title}</div>
                  <div class="li-sub">${h.sub}${h.real ? ' · <span class="partners-hist-real">audit</span>' : ''}</div>
                </div>
                <span class="li-meta">${h.amount != null ? kr(h.amount) : ''}<br>${h.ts.slice(5)}</span>
              </div>
            `));
          });
        }

        // wire detail actions
        detailBody.querySelector('[data-d-act="ledger"]').addEventListener('click', () => {
          if (H._internal && H._internal.byId && H._internal.byId.ledger) H.show('ledger');
          else H.toast('Opening ' + p.name + ' in Ledger…', 'info');
        });
        detailBody.querySelector('[data-d-act="audit"]').addEventListener('click', () => {
          if (H._internal && H._internal.byId && H._internal.byId.audit) H.show('audit');
          else H.toast('Audit trail for ' + p.name, 'info');
        });
        detailBody.querySelector('[data-d-act="email"]').addEventListener('click', () =>
          H.toast('Drafting email to ' + p.contact, 'info'));
      }

      // selection state + table click
      let selected = ROSTER[0];
      tbody.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-pt]');
        if (!tr) return;
        const p = allPartners().find(x => x.id === tr.dataset.pt);
        if (!p) return;
        selected = p;
        tbody.querySelectorAll('tr').forEach(r => r.classList.toggle('is-selected', r === tr));
        renderDetail(p);
      });

      // filter chips
      tableCard.querySelectorAll('.partners-filter').forEach(b => {
        b.addEventListener('click', () => {
          activeFilter = b.dataset.filter;
          tableCard.querySelectorAll('.partners-filter').forEach(x => x.classList.toggle('active', x === b));
          paintTable();
        });
      });

      main.appendChild(tableCard);
      main.appendChild(detailCard);
      root.appendChild(main);

      // initial paint
      paintTable();
      renderDetail(selected);

      /* ====================================================================
         SECONDARY ROW — split by spend (vendors) + a cross-reference note
         ==================================================================== */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // top vendors by spend (bar chart)
      const topVendors = ROSTER.filter(p => p.spend).sort((a, b) => b.spend - a.spend).slice(0, 6);
      const vendorBars = topVendors.map(p => ({ label: initials(p.name), value: p.spend, color: 'url(#hcBar)' }));
      row2.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📊</span> Top Vendors · Spend YTD</h3>
            <span class="ch-meta">${topVendors.length} OF ${vendorCount()}</span>
          </div>
          <div class="chart" style="height:188px">
            ${H.charts.bars(vendorBars, { height: 188 })}
          </div>
        </div>
      `));

      // cross-reference note card — makes the shared-entity story explicit
      row2.appendChild(H.el(`
        <div class="card partners-xref">
          <div class="card-head">
            <h3><span class="hico">🔗</span> Linked Records</h3>
            <span class="ch-meta">ONE SOURCE</span>
          </div>
          <p class="muted partners-xref-note">Each partner is a single record. Ledger posts <b>costs &amp; payments</b> against it, Pipeline ties <b>deals</b> to it, and every change is stamped to the <b>Audit</b> log.</p>
          <div class="partners-xref-stats">
            <div class="stat-row"><span class="sr-label">Used by Ledger</span><span class="sr-val">${ROSTER.filter(p => p.spend).length} vendors</span></div>
            <div class="stat-row"><span class="sr-label">Used by Pipeline</span><span class="sr-val">${buyerCount()} buyers</span></div>
            <div class="stat-row"><span class="sr-label">Audit events</span><span class="sr-val">${H.audit.list({ entityType: 'Partner' }).length} on record</span></div>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="audit-all">Open audit log →</button>
        </div>
      `));
      root.appendChild(row2);

      /* ====================================================================
         ADD PARTNER OVERLAY (self-contained, namespaced, tokens only)
         ==================================================================== */
      function countryFields(country) {
        // org/VAT/EIN labelling shifts by country
        if (country === 'US') return { idLabel: 'EIN (Tax ID)', idPh: '46-1234567', vatLabel: 'Sales tax ID', vatPh: '—' };
        if (country === 'SE') return { idLabel: 'Org. nr', idPh: '556000-0000', vatLabel: 'VAT (momsreg.)', vatPh: 'SE556000000001' };
        return { idLabel: 'Company reg. no.', idPh: 'e.g. HRB 3204', vatLabel: 'EU VAT', vatPh: 'DE123456789' };
      }

      function openAddForm() {
        if (!canWrite) { H.toast('Needs member role to add a partner', 'warn'); return; }
        const cf = countryFields('SE');
        const overlay = H.el(`
          <div class="partners-overlay">
            <div class="partners-overlay-scrim" data-x="close"></div>
            <div class="partners-overlay-box" role="dialog" aria-label="Add partner">
              <div class="partners-overlay-head">
                <div class="partners-overlay-title">＋ Add partner</div>
                <button class="icon-btn partners-overlay-x" data-x="close" aria-label="Close">✕</button>
              </div>
              <div class="partners-overlay-body">
                <div class="partners-form-preview">
                  <div class="partners-logo lg" data-preview-logo>NP</div>
                  <div class="partners-form-preview-hint">Logo monogram updates as you type the name.</div>
                </div>
                <div class="partners-form-grid">
                  <label class="partners-field span-full"><span>Company name</span>
                    <input type="text" data-f="name" placeholder="e.g. Northwind AB" autocomplete="off"></label>
                  <label class="partners-field"><span>Relationship</span>
                    <select data-f="kind">
                      <option value="Vendor">Vendor (we buy)</option>
                      <option value="Buyer">Buyer (we sell)</option>
                      <option value="Both">Both</option>
                      <option value="Partner">Partner</option>
                    </select></label>
                  <label class="partners-field"><span>Category</span>
                    <input type="text" data-f="cat" placeholder="e.g. Logistics &amp; shipping" autocomplete="off"></label>
                  <label class="partners-field"><span>Country</span>
                    <select data-f="country">
                      <option value="SE">🇸🇪 Sweden</option>
                      <option value="DE">🇩🇪 Germany</option>
                      <option value="IE">🇮🇪 Ireland</option>
                      <option value="NL">🇳🇱 Netherlands</option>
                      <option value="FI">🇫🇮 Finland</option>
                      <option value="GB">🇬🇧 United Kingdom</option>
                      <option value="US">🇺🇸 United States</option>
                    </select></label>
                  <label class="partners-field"><span>City</span>
                    <input type="text" data-f="city" placeholder="e.g. Stockholm" autocomplete="off"></label>
                  <label class="partners-field" data-grp="org"><span data-lbl="org">${cf.idLabel}</span>
                    <input type="text" data-f="org" placeholder="${cf.idPh}" autocomplete="off"></label>
                  <label class="partners-field" data-grp="vat"><span data-lbl="vat">${cf.vatLabel}</span>
                    <input type="text" data-f="vat" placeholder="${cf.vatPh}" autocomplete="off"></label>
                  <label class="partners-field"><span>Primary contact</span>
                    <input type="text" data-f="contact" placeholder="e.g. Erik Wahl" autocomplete="off"></label>
                  <label class="partners-field"><span>Contact email</span>
                    <input type="email" data-f="email" placeholder="name@company.com" autocomplete="off"></label>
                </div>
                <div class="partners-form-note muted">Saving writes an entry to the <b>Audit</b> log (action <code>partner.created</code>) so Ledger and Audit can reference this record.</div>
              </div>
              <div class="partners-overlay-foot">
                <button class="btn btn-ghost btn-sm" data-x="close">Cancel</button>
                <button class="btn btn-primary btn-sm" data-x="save">Save partner</button>
              </div>
            </div>
          </div>
        `);
        document.body.appendChild(overlay);

        const get = f => overlay.querySelector(`[data-f="${f}"]`);
        const previewLogo = overlay.querySelector('[data-preview-logo]');
        // live logo preview + tint
        get('name').addEventListener('input', () => {
          const v = get('name').value.trim() || 'New Partner';
          previewLogo.textContent = initials(v);
          const t = tintOf(v);
          previewLogo.style.background = t.bg; previewLogo.style.color = t.fg; previewLogo.style.borderColor = t.bd;
        });
        // country re-labels the id/vat fields
        get('country').addEventListener('change', () => {
          const c2 = countryFields(get('country').value);
          overlay.querySelector('[data-lbl="org"]').textContent = c2.idLabel;
          overlay.querySelector('[data-lbl="vat"]').textContent = c2.vatLabel;
          get('org').setAttribute('placeholder', c2.idPh);
          get('vat').setAttribute('placeholder', c2.vatPh);
        });
        get('name').focus();

        const close = () => { overlay.classList.add('closing'); setTimeout(() => overlay.remove(), 180); };

        function save() {
          const name = get('name').value.trim();
          if (!name) { get('name').classList.add('partners-invalid'); get('name').focus(); H.toast('A company name is required', 'warn'); return; }
          const kind = get('kind').value;
          const isVendorish = kind === 'Vendor' || kind === 'Both';
          const isBuyerish = kind === 'Buyer' || kind === 'Both';
          const rec = {
            id: 'pt-new-' + (ADDED.length + 1) + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8),
            name, kind,
            cat: get('cat').value.trim() || 'Uncategorised',
            country: get('country').value,
            city: get('city').value.trim() || '—',
            org: get('org').value.trim() || '—',
            vat: get('vat').value.trim() || '—',
            contact: get('contact').value.trim() || name,
            email: get('email').value.trim() || '—',
            owner: S.user.id,
            since: '2026',
            spend: isVendorish ? 0 : 0,
            billed: isBuyerish ? 0 : 0,
            txns: 0,
            trend: D.series('pt-tr-new-' + name, 12, 0, 1000, 0.2),
            createdAt: new Date().toISOString().slice(0, 10),
            updatedAt: new Date().toISOString().slice(0, 10),
            createdBy: S.user.id,
            updatedBy: S.user.id
          };
          ADDED.unshift(rec);

          // AUDIT — required on every data-changing action
          H.audit.log({
            action: 'partner.created',
            entityType: 'Partner',
            entityId: rec.id,
            summary: `${S.user.name} added ${rec.name} as a ${rec.kind.toLowerCase()} partner`,
            links: [{ entityType: 'Partner', entityId: rec.id }],
            after: { kind: rec.kind, country: rec.country, org: rec.org, vat: rec.vat },
            module: 'partners'
          });

          // refresh KPIs + table + select the new record
          refreshKpis();
          selected = rec;
          activeFilter = 'all';
          tableCard.querySelectorAll('.partners-filter').forEach(x => x.classList.toggle('active', x.dataset.filter === 'all'));
          paintTable();
          renderDetail(rec);
          const tr = tbody.querySelector(`tr[data-pt="${rec.id}"]`);
          tr && tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

          close();
          H.toast(`${rec.name} added · logged to Audit`, 'success');
        }

        overlay.addEventListener('click', e => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') close();
          else if (x.dataset.x === 'save') save();
        });
        // Esc closes the form
        const onKey = ev => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
      }

      function refreshKpis() {
        const map = {
          'PARTNERS': allPartners().length,
          'VENDORS': vendorCount(),
          'BUYERS': buyerCount(),
          'SPEND · YTD': spendYtd()
        };
        Object.keys(map).forEach(label => {
          const card = kpiRow.querySelector(`[data-kpi="${CSS.escape(label)}"] .kpi-value`);
          if (!card) return;
          card.__counted = false;
          card.setAttribute('data-count', map[label]);
          H.count(card);
        });
      }

      /* ====================================================================
         WIRE view-head + misc actions (no global keys)
         ==================================================================== */
      const addBtn = root.querySelector('[data-act="add"]');
      addBtn && addBtn.addEventListener('click', openAddForm);

      const exportBtn = root.querySelector('[data-act="export"]');
      exportBtn && exportBtn.addEventListener('click', () => {
        const n = allPartners().length;
        // a data export is an auditable action — stamp it so Audit shows the egress
        H.audit.log({
          action: 'partner.exported',
          entityType: 'Partner',
          entityId: '*',
          summary: `${S.user.name} exported ${n} partner records (CSV)`,
          after: { count: n, format: 'csv' },
          module: 'partners'
        });
        H.toast(`Exported ${n} partner records (CSV) — ids match Ledger & Audit`, 'success');
      });
      const auditAll = root.querySelector('[data-act="audit-all"]');
      auditAll && auditAll.addEventListener('click', () => {
        if (H._internal && H._internal.byId && H._internal.byId.audit) H.show('audit');
        else H.toast('Opening the audit log…', 'info');
      });

      // count-ups auto-run by the shell after render().
    }
  });
})();
