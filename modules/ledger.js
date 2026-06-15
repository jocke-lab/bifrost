/* ============================================================================
   ledger.js — the Ledger.
   Finance & cash flow: the fuel gauges of the company.
   Answers "how much fuel, and how long does it last?"
   Follows the command.js reference shape exactly:
     1) HELM.register({ id, label, icon, render })
     2) render(root) builds DOM with ONLY documented .classes + HELM.charts
     3) deterministic data (HELM.data); no Math.random / no Date at eval
     4) every number through HELM.fmt or [data-count]; every button wired
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'ledger',
    label: 'Ledger',
    icon: '⛽',
    render(root) {
      const D = H.data;
      const S = H.session;
      const SEK = 'kr';
      const kr = n => H.fmt.money(n, SEK + ' ');
      // read the acting person fresh (used in audit summaries + write gates)
      const me = () => (S.user || { id: 'system', name: 'System', role: 'system' });
      const canWrite = S.can('ledger.write');
      const initials = name => D.initials(name);

      /* ── shared partner roster (mirrors the Partners module counterparties)
         so the cost SOURCE/VENDOR picker references the same vendors, each with
         a stable monogram tint derived from its name hash (tokens only). ──── */
      const PARTNER_TINTS = [
        { bg: 'rgba(0,229,209,.14)',  fg: 'var(--accent1)', bd: 'rgba(0,229,209,.32)' },
        { bg: 'rgba(52,195,255,.14)',  fg: 'var(--accent2)', bd: 'rgba(52,195,255,.32)' },
        { bg: 'rgba(124,108,255,.16)', fg: 'var(--accent3)', bd: 'rgba(124,108,255,.34)' },
        { bg: 'rgba(245,165,36,.14)',  fg: 'var(--warn)',    bd: 'rgba(245,165,36,.32)' },
        { bg: 'rgba(255,77,109,.13)',  fg: 'var(--danger)',  bd: 'rgba(255,77,109,.30)' }
      ];
      const tintOf = name => PARTNER_TINTS[D.int('led-pt-tint-' + name, 0, PARTNER_TINTS.length - 1)];
      const monogram = (name, lg) => {
        const t = tintOf(name);
        return `<span class="ledger-mono${lg ? ' lg' : ''}" style="background:${t.bg};color:${t.fg};border-color:${t.bd}">${initials(name)}</span>`;
      };
      // vendor/source names available in the picker (subset of the Partners roster + 2 internal)
      const PARTNERS = [
        'Northwind Hosting AB', 'Amazon Web Services', 'Fortnox AB', 'Slack Technologies',
        'HubSpot Ireland', 'Figma Inc', 'Hetzner Online GmbH', 'Castellum AB',
        'PostNord Sverige AB', 'Google Ads', 'Tink AB', 'Stripe Payments', 'Skatteverket', 'Crew · Payroll'
      ];

      /* ── deterministic finance numbers ─────────────────────────────────
         Canonical company numbers (must match the Shell tape):
           CASH 284.5K · MRR 48.2K · RUNWAY 14.2 MO · monthly burn ~38K.
         This is a Swedish company shown in kr; magnitudes are ~10× the $
         tape (2,845,000 kr ≈ $284.5K, 386,000 kr ≈ $38.6K). Runway is the
         canonical 14.2 mo, derived from TOTAL available fuel (operating
         cash + tax reserve + near-term receivables) ÷ net monthly burn —
         NOT bare operating cash, which would (incorrectly) read 7.4 mo. ── */
      const cash = 2845000;                 // operating cash on hand (SEK) ≈ $284.5K
      const burn = 386000;                  // monthly gross burn ≈ $38.6K
      const revMo = 482000;                 // monthly revenue / MRR ≈ $48.2K (tape MRR)
      const net = revMo - burn;             // monthly net (+96K)
      // total fuel = operating cash (incl. tax reserve account) + near-term AR.
      // NB: cash already includes the Swedbank tax-reserve balance, so don't
      // add it again here — only add receivables not yet in the bank.
      const receivables = 2636000;          // outstanding AR collectible < 90d
      const totalFuel = cash + receivables; // 5,481,000
      const runway = +(totalFuel / burn).toFixed(1); // 14.2 — matches Shell tape
      const runwayShown = runway;           // canonical Shell-tape figure (14.2 mo)
      const runwayMax = 24;

      // 12-month cash-in vs burn (revenue inflow trends up to ~MRR, burn flat ~38K)
      const cashIn = D.series('led-in', 12, 340000, 520000, 0.13);
      const burns = D.series('led-burn', 12, 360000, 392000, 0.06);
      const months12 = D.months.slice(0); // JAN..DEC

      // KPI sparks (end values track the headline figures above, in kr-thousands)
      const cashSpark = D.series('led-cash-sp', 16, 2600, 2845, 0.05);
      const burnSpark = D.series('led-burn-sp', 16, 372, 386, 0.04);
      const netSpark = D.series('led-net-sp', 16, 60, 96, 0.18);
      const runSpark = D.series('led-run-sp', 16, 12, 14.2, 0.05);

      /* ── markup: view head ─────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">⛽</div>
            <div>
              <h1>Ledger</h1>
              <p>Fuel gauges of the company — how much cash, and how long it lasts.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="export">↧ Export P&amp;L</button>
            <button class="btn btn-primary btn-sm" data-act="forecast">◇ Cash forecast</button>
          </div>
        </div>
      `));

      /* ── ROW 1: runway gauge (span) + hero KPI row ─────────────────── */
      const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // runway gauge card — uses canonical 14.2 mo (matches Shell tape)
      const runWarn = runwayShown < 12;
      const gauge = H.el(`
        <div class="card glow ledger-runway">
          <div class="card-head">
            <h3><span class="hico">⛽</span> Runway</h3>
            <span class="pill ${runWarn ? 'warn' : 'ok'}">${runWarn ? '● LOW FUEL' : '● NOMINAL'}</span>
          </div>
          <div class="ledger-gaugewrap">
            ${H.charts.gauge(runwayShown, { max: runwayMax, size: 230, arc: 250 })}
            <div class="ledger-gaugecore">
              <div class="ledger-gaugenum"><span data-count="${runwayShown}" data-dp="1">0</span><i>mo</i></div>
              <div class="ledger-gaugesub">FUEL REMAINING</div>
            </div>
          </div>
          <div class="ledger-fuelmeta">
            <div><span class="faint">At current burn</span><b>${kr(burn)}/mo</b></div>
            <div><span class="faint">Dry tank</span><b class="ledger-dry">≈ Aug 2027</b></div>
          </div>
        </div>
      `);
      // the gauge svg prints its own big number — hide it, use our overlay
      const gtext = gauge.querySelector('svg text');
      if (gtext) gtext.style.display = 'none';
      row1.appendChild(gauge);

      // hero KPI strip (span 2 -> inner cols-2 of KPI tiles)
      const kpis = H.el(`
        <div class="span-2">
          <div class="grid cols-2 ledger-kpis"></div>
        </div>
      `);
      const kgrid = kpis.querySelector('.ledger-kpis');
      [
        // currency KPIs use 'num' (K/M abbrev, no symbol) + a 'kr ' prefix —
        // NOT 'money', whose formatter hardcodes '$' and would print "kr $2.8M".
        { label: 'CASH ON HAND', count: cash, fmt: 'num', cur: true, trend: '+4.2%', dir: 'up', sub: 'across 3 accounts', spark: cashSpark },
        { label: 'MONTHLY BURN', count: burn, fmt: 'num', cur: true, trend: '+1.8%', dir: 'flat', sub: 'rolling 3-mo avg', spark: burnSpark },
        { label: 'MONTHLY NET', count: net, fmt: 'num', cur: true, trend: '+12.4%', dir: 'up', sub: 'revenue − burn', spark: netSpark },
        { label: 'RUNWAY', count: runwayShown, fmt: '', dp: 1, suffix: ' mo', trend: '+0.8 mo', dir: 'up', sub: 'total fuel ÷ burn', spark: runSpark }
      ].forEach(v => {
        const sparkColor = v.dir === 'down' && v.label !== 'MONTHLY BURN' ? 'var(--warn)' : null;
        kgrid.appendChild(H.el(`
          <div class="card kpi ledger-kpi">
            <div class="kpi-label">${v.label}</div>
            <div class="kpi-value sm" data-count="${v.count}" ${v.fmt ? `data-fmt="${v.fmt}"` : ''} ${v.dp != null ? `data-dp="${v.dp}"` : ''} ${v.suffix ? `data-suffix="${v.suffix}"` : ''} ${v.cur ? `data-prefix="${SEK} "` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${v.dir}">${v.trend}</span>
              <span class="kpi-sub">${v.sub}</span>
            </div>
            <div class="spark">${H.charts.spark(v.spark, sparkColor ? { color: sparkColor } : {})}</div>
          </div>
        `));
      });
      row1.appendChild(kpis);
      root.appendChild(row1);

      /* ════════════════════════════════════════════════════════════════
         EXPENSES OVERVIEW — separates MONTHLY RECURRING spend (rent, SaaS,
         salaries, tools, insurance) from ONE-TIME spend (equipment, legal,
         hardware, one-off services). A segmented [Monthly recurring | One-
         time | All] toggle (.ledger-seg) re-renders the body + toasts.
         Recurring shows a per-month headline (count-up) + annualized ×12 and
         an interval pill; one-time shows a this-period headline + a date per
         row. Each view has a category donut. A combined strip totals this
         month and a 6-month grouped bars chart compares recurring vs one-time.
         These are the SAME records the add-cost form writes into (a recurring
         cost lands here as Monthly; a one-time cost lands in the one-time list).
         ════════════════════════════════════════════════════════════════ */

      // category → donut/tag colour token (shared by both expense classes)
      const EXP_CAT_COLOR = {
        'Salaries': 'var(--accent1)', 'Rent': 'var(--warn)', 'SaaS': 'var(--accent2)',
        'Tools': 'var(--accent3)', 'Insurance': '#5ad1b0', 'Marketing': 'var(--danger)',
        'Equipment': 'var(--accent2)', 'Legal & setup': 'var(--accent3)',
        'Hardware': 'var(--accent1)', 'Services': 'var(--warn)', 'Other': 'var(--text-faint)'
      };
      const catColorOf = c => EXP_CAT_COLOR[c] || 'var(--text-faint)';

      // ── recurring ledger (each row is billed MONTHLY) ─────────────────
      // kr-scale tuned so the monthly recurring sum sits at the ~38K burn band.
      const recurringExp = [
        { id: 'rx-payroll', name: 'Crew payroll', cat: 'Salaries', vendor: 'Crew · Payroll',       amount: 17800, next: '25 Jun' },
        { id: 'rx-rent',    name: 'Office · Kungsgatan 12', cat: 'Rent', vendor: 'Castellum AB',    amount: 8200,  next: '28 Jun' },
        { id: 'rx-aws',     name: 'AWS · eu-north-1', cat: 'SaaS', vendor: 'Amazon Web Services',   amount: 3100,  next: '01 Jul' },
        { id: 'rx-hubspot', name: 'HubSpot · Pro ×6', cat: 'SaaS', vendor: 'HubSpot Ireland',       amount: 2350,  next: '04 Jul' },
        { id: 'rx-slack',   name: 'Slack · Business+', cat: 'Tools', vendor: 'Slack Technologies',  amount: 1280,  next: '06 Jul' },
        { id: 'rx-figma',   name: 'Figma · Org seats', cat: 'Tools', vendor: 'Figma Inc',           amount: 980,   next: '09 Jul' },
        { id: 'rx-fortnox', name: 'Fortnox · Plus', cat: 'SaaS', vendor: 'Fortnox AB',              amount: 690,   next: '11 Jul' },
        { id: 'rx-ins',     name: 'Liability & cyber', cat: 'Insurance', vendor: 'Trygg-Hansa',     amount: 3600,  next: '15 Jul' }
      ];
      // ── one-time ledger (each row is a single dated charge this period) ─
      const oneTimeExp = [
        { id: 'ot-laptops', name: '3× MacBook Pro M4', cat: 'Hardware', vendor: 'Apple Sweden',     amount: 84000, date: '03 Jun' },
        { id: 'ot-legal',   name: 'Series-Seed paperwork', cat: 'Legal & setup', vendor: 'Vinge Advokat', amount: 42000, date: '06 Jun' },
        { id: 'ot-desks',   name: 'Standing desks ×6', cat: 'Equipment', vendor: 'Input Interiör',  amount: 23400, date: '09 Jun' },
        { id: 'ot-brand',   name: 'Brand & logo system', cat: 'Services', vendor: 'Lykke Studios',  amount: 38000, date: '11 Jun' },
        { id: 'ot-nas',     name: 'Synology NAS + drives', cat: 'Hardware', vendor: 'Dustin AB',    amount: 14900, date: '12 Jun' }
      ];

      const recTotal = () => recurringExp.reduce((a, e) => a + e.amount, 0);
      const oneTotal = () => oneTimeExp.reduce((a, e) => a + e.amount, 0);

      // build [{label,value,color}] category breakdown for a list of expenses
      function catBreakdown(list) {
        const map = new Map();
        list.forEach(e => map.set(e.cat, (map.get(e.cat) || 0) + e.amount));
        return Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value, color: catColorOf(label) }));
      }

      // 6-month recurring vs one-time (recurring ~flat near monthly sum; one-time lumpy)
      const recBars = D.series('led-exp-rec', 6, 35000, recTotal(), 0.05);
      const oneBars = D.series('led-exp-one', 6, 60000, oneTotal(), 0.42);
      const last6 = D.months.slice(0, 6); // JAN..JUN labels for the 6-mo window

      let expSeg = 'recurring'; // 'recurring' | 'onetime' | 'all'

      const expCard = H.el(`
        <div class="card ledger-expoview" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">📂</span> Expenses overview</h3>
            <div class="ledger-seg" role="tablist" aria-label="Expense view">
              <button type="button" class="ledger-seg-btn active" data-seg="recurring" role="tab">⟳ Monthly recurring</button>
              <button type="button" class="ledger-seg-btn" data-seg="onetime" role="tab">◇ One-time</button>
              <button type="button" class="ledger-seg-btn" data-seg="all" role="tab">⊞ All</button>
            </div>
          </div>

          <!-- combined strip: this month = recurring + one-time = total -->
          <div class="ledger-expstrip">
            <div class="ledger-expstrip-sums">
              <div class="ledger-expsum">
                <span class="ledger-expsum-k">Recurring · mo</span>
                <span class="ledger-expsum-v ledger-amt-out" data-recsum>${kr(recTotal())}</span>
              </div>
              <span class="ledger-expsum-op">＋</span>
              <div class="ledger-expsum">
                <span class="ledger-expsum-k">One-time · period</span>
                <span class="ledger-expsum-v ledger-amt-out" data-onesum>${kr(oneTotal())}</span>
              </div>
              <span class="ledger-expsum-op">＝</span>
              <div class="ledger-expsum ledger-expsum-total">
                <span class="ledger-expsum-k">This month</span>
                <span class="ledger-expsum-v" data-allsum>${kr(recTotal() + oneTotal())}</span>
              </div>
            </div>
            <div class="ledger-expbars">
              <div class="row gap-sm" style="margin-bottom:6px">
                <span class="pill ok">● RECURRING</span>
                <span class="ledger-legend-burn"><i></i>ONE-TIME</span>
                <span class="fill"></span>
                <span class="ch-meta">LAST 6 MONTHS · ${SEK}</span>
              </div>
              <div class="chart" style="height:104px">
                ${H.charts.bars(recBars.map((v, i) => ({ label: last6[i], value: v })), { height: 104, b: oneBars })}
              </div>
            </div>
          </div>

          <!-- segmented body: headline + donut + list (re-rendered on toggle) -->
          <div class="ledger-expbody" data-expbody></div>
        </div>
      `);

      const expBody = expCard.querySelector('[data-expbody]');

      // one expense row (recurring shows interval pill + next charge; one-time shows date)
      function expRow(e, mode) {
        const isRec = mode === 'recurring';
        const dateBit = isRec
          ? `<span class="ledger-exprow-when">next ${e.next}</span><span class="pill info ledger-exprow-iv">⟳ Monthly</span>`
          : `<span class="ledger-exprow-when">${e.date}</span><span class="pill ledger-exprow-iv">◇ One-time</span>`;
        return H.el(`
          <div class="ledger-exprow" data-exp="${e.id}">
            ${monogram(e.vendor)}
            <div class="ledger-exprow-body">
              <div class="ledger-exprow-top">
                <span class="ledger-exprow-name">${e.name}</span>
                <span class="ledger-tagdot tag" style="color:${catColorOf(e.cat)};border-color:color-mix(in srgb,${catColorOf(e.cat)} 32%,transparent)"><i style="background:${catColorOf(e.cat)}"></i>${e.cat}</span>
              </div>
              <div class="ledger-exprow-sub faint">${e.vendor}</div>
            </div>
            <div class="ledger-exprow-right">
              <span class="ledger-exprow-amt ledger-amt-out">−${kr(e.amount)}${isRec ? '<i>/mo</i>' : ''}</span>
              <span class="ledger-exprow-meta">${dateBit}</span>
            </div>
          </div>
        `);
      }

      // a labeled list block (header total + rows)
      function expListBlock(title, ico, list, mode, totalNote) {
        const wrap = H.el(`
          <div class="ledger-explist">
            <div class="ledger-explist-head">
              <span class="ledger-explist-title"><span class="hico">${ico}</span> ${title}</span>
              <span class="ch-meta">${totalNote}</span>
            </div>
            <div class="ledger-explist-rows"></div>
          </div>
        `);
        const rows = wrap.querySelector('.ledger-explist-rows');
        if (!list.length) {
          rows.appendChild(H.el(`<div class="ledger-exprow-empty faint">No expenses in this class yet.</div>`));
        } else {
          list.forEach(e => rows.appendChild(expRow(e, mode)));
        }
        return wrap;
      }

      // headline + donut header for the active segment
      function expHeader(seg) {
        if (seg === 'recurring') {
          const mo = recTotal();
          return `
            <div class="ledger-exphead">
              <div class="ledger-exphero">
                <div class="ledger-exphero-main">
                  <div class="kpi-label">PER MONTH · RECURRING</div>
                  <div class="big-num ledger-amt-out" data-count="${mo}" data-fmt="num" data-prefix="${SEK} ">0</div>
                  <div class="ledger-exphero-ann">≈ <b data-count="${mo * 12}" data-fmt="num" data-prefix="${SEK} ">0</b> / year <span class="pill info">×12 ANNUALIZED</span></div>
                </div>
                <div class="ledger-exphero-donut">
                  ${H.charts.donut(catBreakdown(recurringExp), { size: 132, thickness: 18, center: { value: H.fmt.num(mo), label: 'KR/MO' } })}
                </div>
              </div>
            </div>`;
        }
        if (seg === 'onetime') {
          const per = oneTotal();
          return `
            <div class="ledger-exphead">
              <div class="ledger-exphero">
                <div class="ledger-exphero-main">
                  <div class="kpi-label">THIS PERIOD · ONE-TIME</div>
                  <div class="big-num ledger-amt-out" data-count="${per}" data-fmt="num" data-prefix="${SEK} ">0</div>
                  <div class="ledger-exphero-ann">${oneTimeExp.length} one-off charges · Jun 2026 <span class="pill">◇ NON-RECURRING</span></div>
                </div>
                <div class="ledger-exphero-donut">
                  ${H.charts.donut(catBreakdown(oneTimeExp), { size: 132, thickness: 18, center: { value: H.fmt.num(per), label: 'KR' } })}
                </div>
              </div>
            </div>`;
        }
        // all — both headline figures side by side, combined donut
        const mo = recTotal(), per = oneTotal();
        return `
          <div class="ledger-exphead">
            <div class="ledger-exphero">
              <div class="ledger-exphero-main">
                <div class="grid cols-2" style="gap:12px">
                  <div class="panel center">
                    <div class="kpi-sub">Recurring / mo</div>
                    <div class="big-num ledger-amt-out" style="font-size:24px" data-count="${mo}" data-fmt="num" data-prefix="${SEK} ">0</div>
                  </div>
                  <div class="panel center">
                    <div class="kpi-sub">One-time / period</div>
                    <div class="big-num ledger-amt-out" style="font-size:24px" data-count="${per}" data-fmt="num" data-prefix="${SEK} ">0</div>
                  </div>
                </div>
                <div class="ledger-exphero-ann">Annualized recurring ≈ <b>${kr(mo * 12)}</b> · combined this month <b>${kr(mo + per)}</b></div>
              </div>
              <div class="ledger-exphero-donut">
                ${H.charts.donut(
                  catBreakdown(recurringExp.concat(oneTimeExp)),
                  { size: 132, thickness: 18, center: { value: H.fmt.num(mo + per), label: 'KR TOTAL' } }
                )}
              </div>
            </div>
          </div>`;
      }

      // (re)paint the segmented body, refresh the combined strip, re-run count-ups
      function paintExpenses() {
        expBody.innerHTML = '';
        expBody.appendChild(H.el(expHeader(expSeg)));
        if (expSeg === 'recurring') {
          expBody.appendChild(expListBlock('Recurring expenses', '⟳', recurringExp, 'recurring', kr(recTotal()) + ' / MO'));
        } else if (expSeg === 'onetime') {
          expBody.appendChild(expListBlock('One-time expenses', '◇', oneTimeExp, 'onetime', kr(oneTotal()) + ' THIS PERIOD'));
        } else {
          const dual = H.el(`<div class="grid cols-2 ledger-expdual"></div>`);
          dual.appendChild(expListBlock('Recurring', '⟳', recurringExp, 'recurring', kr(recTotal()) + ' / MO'));
          dual.appendChild(expListBlock('One-time', '◇', oneTimeExp, 'onetime', kr(oneTotal()) + ' PERIOD'));
          expBody.appendChild(dual);
        }
        // keep the combined strip in sync with any newly-booked expenses
        const rs = expCard.querySelector('[data-recsum]');
        const os = expCard.querySelector('[data-onesum]');
        const as = expCard.querySelector('[data-allsum]');
        if (rs) rs.textContent = kr(recTotal());
        if (os) os.textContent = kr(oneTotal());
        if (as) as.textContent = kr(recTotal() + oneTotal());
        // count-ups inside the freshly-built body
        expBody.querySelectorAll('[data-count]').forEach(n => { n.__counted = false; H.count(n); });
      }

      // wire the segmented toggle: switch segment → repaint → toast
      const SEG_LABEL = { recurring: 'Monthly recurring', onetime: 'One-time', all: 'All expenses' };
      expCard.querySelectorAll('.ledger-seg-btn').forEach(b => {
        b.addEventListener('click', () => {
          if (b.dataset.seg === expSeg) return;
          expSeg = b.dataset.seg;
          expCard.querySelectorAll('.ledger-seg-btn').forEach(x => x.classList.toggle('active', x === b));
          paintExpenses();
          H.toast(`Showing ${SEG_LABEL[expSeg]} expenses`, 'info');
        });
      });

      paintExpenses();
      root.appendChild(expCard);

      /* ── ROW 2: cash-in vs burn bars (span 2) + bank accounts ──────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      row2.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📊</span> Cash-in vs Burn</h3>
            <span class="ch-meta">TRAILING 12 MONTHS · ${SEK}</span>
          </div>
          <div class="row gap-sm" style="margin-bottom:10px">
            <span class="pill ok">● CASH IN</span>
            <span class="ledger-legend-burn"><i></i>BURN</span>
            <span class="fill"></span>
            <span class="ch-meta">NET +${kr(net)}/MO</span>
          </div>
          <div class="chart" style="height:230px">
            ${H.charts.bars(cashIn.map((v, i) => ({ label: months12[i], value: v })), { height: 230, b: burns })}
          </div>
        </div>
      `));

      // bank accounts panel (Tink-linked)
      const accounts = [
        { bank: 'SEB', name: 'Operating · 5012-44 821', bal: 1842000, sync: 'ok', ic: '🏦' },
        { bank: 'Swedbank', name: 'Tax & VAT reserve · 8327-9', bal: 612000, sync: 'ok', ic: '🏛️' },
        { bank: 'Wise', name: 'USD/EUR FX · multi-cur', bal: 391000, sync: 'warn', ic: '🌐' }
      ];
      const bankCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🔗</span> Bank Accounts</h3>
            <span class="tag info">TINK</span>
          </div>
          <div class="list ledger-banks"></div>
          <div class="row between mt">
            <span class="kpi-sub">Total linked</span>
            <span class="big-num" style="font-size:20px">${kr(accounts.reduce((a, b) => a + b.bal, 0))}</span>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="link-bank"${canWrite ? '' : ' disabled title="Needs finance role"'}>＋ Link another account</button>
        </div>
      `);
      const banks = bankCard.querySelector('.ledger-banks');
      accounts.forEach(a => {
        const syncPill = a.sync === 'ok'
          ? '<span class="pill ok">● SYNCED</span>'
          : '<span class="pill warn">● 2H AGO</span>';
        banks.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${a.ic}</div>
            <div class="li-body">
              <div class="li-title">${a.bank} <span class="ledger-acctmeta">${syncPill}</span></div>
              <div class="li-sub">${a.name}</div>
            </div>
            <span class="li-meta ledger-bal">${kr(a.bal)}</span>
          </div>
        `));
      });
      row2.appendChild(bankCard);
      root.appendChild(row2);

      /* ── ROW 3: expense donut + P&L snapshot + recent transactions ── */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // expense breakdown donut
      const expenses = [
        { label: 'Payroll', value: 178000, color: 'var(--accent1)' },
        { label: 'Cloud & SaaS', value: 64000, color: 'var(--accent2)' },
        { label: 'Marketing', value: 58000, color: 'var(--accent3)' },
        { label: 'Office & rent', value: 41000, color: 'var(--warn)' },
        { label: 'Other', value: 45000, color: 'var(--text-faint)' }
      ];
      const expTotal = expenses.reduce((a, e) => a + e.value, 0);
      const donutCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🍩</span> Where the fuel goes</h3>
            <span class="ch-meta">THIS MONTH</span>
          </div>
          <div class="ledger-donutwrap">
            <div class="ledger-donut">
              ${H.charts.donut(expenses, { size: 188, thickness: 24, center: { value: H.fmt.money(expTotal, ''), label: 'TOTAL ' + SEK } })}
            </div>
            <div class="ledger-legend"></div>
          </div>
        </div>
      `);
      const legend = donutCard.querySelector('.ledger-legend');
      expenses.forEach(e => {
        legend.appendChild(H.el(`
          <div class="ledger-legrow">
            <span class="ledger-legdot" style="background:${e.color}"></span>
            <span class="ledger-leglab">${e.label}</span>
            <span class="ledger-legval">${kr(e.value)}</span>
            <span class="ledger-legpct">${Math.round(e.value / expTotal * 100)}%</span>
          </div>
        `));
      });
      row3.appendChild(donutCard);

      // P&L snapshot (stat-rows) — revenue shares the headline MRR basis
      const revenue = revMo, cogs = 154000;  // 482K rev, 32% COGS
      const gross = revenue - cogs;           // 328K (68% gross margin)
      const opex = 196000;                    // payroll + cloud + mktg + office
      const ebitda = gross - opex;            // 132K
      const netInc = ebitda - 18000;          // 114K after taxes/interest
      const pnlCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🧾</span> P&amp;L Snapshot</h3>
            <span class="ch-meta">MTD · ${SEK}</span>
          </div>
          <div class="ledger-pnl"></div>
        </div>
      `);
      const pnl = pnlCard.querySelector('.ledger-pnl');
      [
        ['Revenue', revenue, ''],
        ['COGS', -cogs, 'neg'],
        ['Gross profit', gross, 'pos strong'],
        ['Operating expenses', -opex, 'neg'],
        ['EBITDA', ebitda, 'pos strong'],
        ['Net income', netInc, 'pos strong']
      ].forEach(([label, val, cls]) => {
        const sign = val < 0 ? '−' : '';
        const valTxt = sign + kr(Math.abs(val));
        pnl.appendChild(H.el(`
          <div class="stat-row ${cls && cls.includes('strong') ? 'ledger-srstrong' : ''}">
            <span class="sr-label">${label}</span>
            <span class="sr-val ${cls && cls.includes('neg') ? 'ledger-neg' : cls && cls.includes('pos') ? 'ledger-pos' : ''}">${valTxt}</span>
          </div>
        `));
      });
      pnl.appendChild(H.el(`
        <div class="row between mt-sm">
          <span class="kpi-sub">Gross margin</span>
          <span class="pill ok">${Math.round(gross / revenue * 100)}%</span>
        </div>
      `));
      row3.appendChild(pnlCard);

      // recent transactions table
      const txns = [
        ['15 Jun', 'Stripe payout', 'Revenue', 'SEB', 84200, 'in'],
        ['14 Jun', 'Northwind AB · inv #2294', 'Revenue', 'SEB', 42000, 'in'],
        ['14 Jun', 'AWS — eu-north-1', 'Cloud', 'SEB', -18640, 'out'],
        ['13 Jun', 'Payroll run · 6 crew', 'Payroll', 'SEB', -178000, 'out'],
        ['12 Jun', 'Lykke Studios deposit', 'Revenue', 'Wise', 31500, 'in'],
        ['11 Jun', 'Forsberg Konsult', 'Consulting', 'SEB', -24000, 'out'],
        ['10 Jun', 'Google Ads', 'Marketing', 'SEB', -22400, 'out']
      ];
      const catColor = {
        Revenue: 'ok', Cloud: 'info', Payroll: 'warn', Consulting: 'info', Marketing: 'bad'
      };
      const txCard = H.el(`
        <div class="card flush">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">💳</span> Recent Transactions</h3>
            <button class="btn btn-ghost btn-sm" data-act="all-tx">View all</button>
          </div>
          <div class="ledger-txscroll">
            <table class="table ledger-txtable">
              <thead><tr>
                <th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="num">Amount</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = txCard.querySelector('tbody');
      txns.forEach(([date, desc, cat, acct, amt, dir]) => {
        const sign = amt < 0 ? '−' : '+';
        tbody.appendChild(H.el(`
          <tr>
            <td class="mono">${date}</td>
            <td>${desc}</td>
            <td><span class="tag ${catColor[cat] || ''}">${cat}</span></td>
            <td class="muted">${acct}</td>
            <td class="num mono ledger-amt-${dir}">${sign}${kr(Math.abs(amt))}</td>
          </tr>
        `));
      });
      row3.appendChild(txCard);
      root.appendChild(row3);

      /* ════════════════════════════════════════════════════════════════
         COSTS — ＋ Add cost form + Fixed (recurring) and Variable lists.
         Each cost row carries a partner monogram, category tag, amount,
         source. New costs prepend, audit-log, and toast. Write-gated.
         ════════════════════════════════════════════════════════════════ */

      // seed cost ledgers (session-local; new costs prepend here)
      const fixedCosts = [
        { id: 'co-rent',    cat: 'Office & rent',   amount: 41000,  vendor: 'Castellum AB',        vat: 25, note: 'Kungsgatan 12 · monthly' },
        { id: 'co-payroll', cat: 'Salaries',        amount: 178000, vendor: 'Crew · Payroll',      vat: 0,  note: '6 crew · gross' },
        { id: 'co-aws',     cat: 'Cloud & SaaS',    amount: 18640,  vendor: 'Amazon Web Services', vat: 25, note: 'eu-north-1 · committed' },
        { id: 'co-fortnox', cat: 'Accounting SW',   amount: 1290,   vendor: 'Fortnox AB',          vat: 25, note: 'Plus plan · monthly' },
        { id: 'co-hubspot', cat: 'CRM & marketing', amount: 9400,   vendor: 'HubSpot Ireland',     vat: 25, note: 'Pro seats × 6' }
      ];
      const variableCosts = [
        { id: 'co-ads',     cat: 'Marketing',  amount: 22400, vendor: 'Google Ads',         vat: 25, note: 'Midsummer push' },
        { id: 'co-freight', cat: 'Logistics',  amount: 14600, vendor: 'PostNord Sverige AB', vat: 25, note: 'Q2 freight' },
        { id: 'co-fees',    cat: 'Payments',   amount: 6820,  vendor: 'Stripe Payments',     vat: 0,  note: 'Processing fees' },
        { id: 'co-figma',   cat: 'Design SW',  amount: 1640,  vendor: 'Figma Inc',           vat: 25, note: 'Overage seats' }
      ];

      // category → tag severity colour
      const COST_CAT_CLS = {
        'Office & rent': 'warn', 'Salaries': 'warn', 'Cloud & SaaS': 'info', 'Accounting SW': 'info',
        'CRM & marketing': 'bad', 'Marketing': 'bad', 'Logistics': '', 'Payments': 'info', 'Design SW': 'info'
      };

      const costsRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // ── add-cost form card ──────────────────────────────────────────
      const catOpts = ['Office & rent', 'Salaries', 'Cloud & SaaS', 'Accounting SW', 'CRM & marketing', 'Marketing', 'Logistics', 'Payments', 'Design SW', 'Other']
        .map(c => `<option value="${c}">${c}</option>`).join('');
      const vendorOpts = PARTNERS.map(p => `<option value="${p}">${p}</option>`).join('');
      const vatOpts = [25, 12, 6, 0].map(v => `<option value="${v}">${v}% VAT</option>`).join('');
      const formCard = H.el(`
        <div class="card ledger-costform">
          <div class="card-head">
            <h3><span class="hico">＋</span> Add cost</h3>
            <span class="tag ${canWrite ? 'ok' : 'warn'}">${canWrite ? 'BOOKKEEPER' : 'READ-ONLY'}</span>
          </div>
          <div class="ledger-form">
            <div class="ledger-field">
              <label>Amount (${SEK})</label>
              <input type="number" min="0" step="1" inputmode="numeric" placeholder="4 200" data-f="amount">
            </div>
            <div class="ledger-field">
              <label>Category</label>
              <select data-f="cat">${catOpts}</select>
            </div>
            <div class="ledger-field ledger-field-full">
              <label>Cost type</label>
              <div class="ledger-toggle" data-f="type" role="tablist">
                <button type="button" class="ledger-tg active" data-type="fixed">⟳ Fixed</button>
                <button type="button" class="ledger-tg" data-type="variable">↗ Variable</button>
              </div>
            </div>
            <div class="ledger-field ledger-field-full">
              <label>Recurrence · expense class</label>
              <div class="ledger-toggle" data-f="rec" role="tablist">
                <button type="button" class="ledger-tg active" data-rec="recurring">⟳ Recurring · Monthly</button>
                <button type="button" class="ledger-tg" data-rec="onetime">◇ One-time</button>
              </div>
            </div>
            <div class="ledger-field">
              <label>Source / vendor</label>
              <select data-f="vendor">${vendorOpts}</select>
            </div>
            <div class="ledger-field">
              <label>VAT rate</label>
              <select data-f="vat">${vatOpts}</select>
            </div>
            <div class="ledger-field">
              <label>Date</label>
              <input type="date" data-f="date" value="2026-06-15">
            </div>
            <div class="ledger-field ledger-vatprev">
              <label>VAT amount</label>
              <div class="ledger-vatprev-val" data-vatprev>${kr(0)}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-block mt" data-act="add-cost"${canWrite ? '' : ' disabled title="Needs finance role"'}>
            ＋ Book cost
          </button>
          <div class="ledger-formnote faint">${canWrite ? 'Posts a voucher + writes to the audit trail.' : 'Needs finance role to book costs.'}</div>
        </div>
      `);
      costsRow.appendChild(formCard);

      // ── recurring FIXED costs list ──────────────────────────────────
      const fixedCard = H.el(`
        <div class="card flush ledger-costcard">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">⟳</span> Recurring · Fixed</h3>
            <span class="ch-meta ledger-fixedtotal"></span>
          </div>
          <div class="ledger-coststream" data-list="fixed"></div>
        </div>
      `);
      // ── variable / "moving" costs list ──────────────────────────────
      const varCard = H.el(`
        <div class="card flush ledger-costcard">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">↗</span> Variable · Moving</h3>
            <span class="ch-meta ledger-vartotal"></span>
          </div>
          <div class="ledger-coststream" data-list="variable"></div>
        </div>
      `);

      const costRow = c => H.el(`
        <div class="ledger-costrow" data-cost="${c.id}">
          ${monogram(c.vendor)}
          <div class="ledger-costbody">
            <div class="ledger-costtop">
              <span class="tag ${COST_CAT_CLS[c.cat] || ''}">${c.cat}</span>
              <span class="ledger-costsrc">${c.vendor}</span>
            </div>
            <div class="ledger-costnote faint">${c.note || ''}${c.vat ? ' · ' + c.vat + '% VAT' : ' · VAT exempt'}</div>
          </div>
          <span class="ledger-costamt ledger-amt-out">−${kr(c.amount)}</span>
        </div>
      `);

      const fixedStream = fixedCard.querySelector('[data-list="fixed"]');
      const varStream = varCard.querySelector('[data-list="variable"]');
      const fixedTotalEl = fixedCard.querySelector('.ledger-fixedtotal');
      const varTotalEl = varCard.querySelector('.ledger-vartotal');
      function paintCosts() {
        fixedStream.innerHTML = '';
        varStream.innerHTML = '';
        fixedCosts.forEach(c => fixedStream.appendChild(costRow(c)));
        variableCosts.forEach(c => varStream.appendChild(costRow(c)));
        fixedTotalEl.textContent = kr(fixedCosts.reduce((a, c) => a + c.amount, 0)) + ' / MO';
        varTotalEl.textContent = kr(variableCosts.reduce((a, c) => a + c.amount, 0)) + ' MTD';
      }
      paintCosts();
      costsRow.appendChild(fixedCard);
      costsRow.appendChild(varCard);
      root.appendChild(costsRow);

      /* ════════════════════════════════════════════════════════════════
         AUTO-ACCOUNTING — stream of auto-posted double-entry vouchers
         (BAS-style debit/credit), each with a confidence pill + a caption
         of "what the system booked". Manual override gated by ledger.write.
         ════════════════════════════════════════════════════════════════ */
      const autoRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // BAS-account book (Swedish chart of accounts)
      const vouchers = [
        { id: 'V-2294', src: 'Stripe payout', conf: 99, debit: ['1930', 'Företagskonto'], credit: ['3001', 'Försäljning Sverige'], amount: 84200, why: 'Matched Stripe settlement to invoice #2294 — booked as sales revenue.' },
        { id: 'V-2295', src: 'AWS invoice', conf: 96, debit: ['5420', 'Programvaror'], credit: ['2440', 'Leverantörsskulder'], amount: 18640, vat: 4660, why: 'Recognised cloud spend + 25% input VAT (2640) from AWS eu-north-1.' },
        { id: 'V-2296', src: 'Payroll run', conf: 92, debit: ['7010', 'Löner kollektivanställda'], credit: ['1930', 'Företagskonto'], amount: 178000, why: 'Posted June payroll for 6 crew against the operating account.' },
        { id: 'V-2297', src: 'Google Ads', conf: 74, debit: ['5910', 'Annonsering'], credit: ['2440', 'Leverantörsskulder'], amount: 22400, vat: 5600, why: 'Classified ad spend — low confidence, vendor category ambiguous.' },
        { id: 'V-2298', src: 'Castellum rent', conf: 98, debit: ['5010', 'Lokalhyra'], credit: ['1930', 'Företagskonto'], amount: 41000, vat: 10250, why: 'Recurring office rent recognised with 25% deductible input VAT.' }
      ];
      const confPill = c => c >= 95 ? 'ok' : c >= 85 ? 'info' : 'warn';
      const confLabel = c => c >= 95 ? 'HIGH' : c >= 85 ? 'GOOD' : 'REVIEW';

      const autoCard = H.el(`
        <div class="card span-2 flush ledger-autocard">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">⚙️</span> Auto-accounting feed</h3>
            <span class="pill ok ledger-autolive">● AUTO-POSTING</span>
          </div>
          <div class="ledger-autosub" style="padding:0 16px 8px">
            Double-entry vouchers the system booked from payments, costs &amp; invoices.
          </div>
          <div class="ledger-vouchers"></div>
        </div>
      `);
      const vStream = autoCard.querySelector('.ledger-vouchers');
      function voucherEl(v) {
        const cls = confPill(v.conf);
        const node = H.el(`
          <div class="ledger-voucher" data-v="${v.id}">
            <div class="ledger-voucher-head">
              <span class="ledger-vid mono">${v.id}</span>
              <span class="ledger-vsrc">${v.src}</span>
              <span class="pill ${cls} ledger-vconf">● ${v.conf}% ${confLabel(v.conf)}</span>
              <span class="fill"></span>
              <span class="ledger-vamt mono">${kr(v.amount)}</span>
            </div>
            <div class="ledger-entries">
              <div class="ledger-entry">
                <span class="ledger-dc ledger-dc-d">DEBIT</span>
                <span class="ledger-acct mono">${v.debit[0]}</span>
                <span class="ledger-acctname">${v.debit[1]}</span>
                <span class="ledger-entry-amt mono">${kr(v.amount)}</span>
              </div>
              ${v.vat ? `
              <div class="ledger-entry">
                <span class="ledger-dc ledger-dc-d">DEBIT</span>
                <span class="ledger-acct mono">2640</span>
                <span class="ledger-acctname">Ingående moms</span>
                <span class="ledger-entry-amt mono">${kr(v.vat)}</span>
              </div>` : ''}
              <div class="ledger-entry">
                <span class="ledger-dc ledger-dc-c">CREDIT</span>
                <span class="ledger-acct mono">${v.credit[0]}</span>
                <span class="ledger-acctname">${v.credit[1]}</span>
                <span class="ledger-entry-amt mono">${kr(v.amount + (v.vat || 0))}</span>
              </div>
            </div>
            <div class="ledger-vwhy"><span class="ledger-vwhy-ico">🤖</span> ${v.why}</div>
            <div class="ledger-vactions">
              <button class="btn btn-sm" data-v-act="explain">Why?</button>
              <button class="btn btn-sm" data-v-act="override"${canWrite ? '' : ' disabled title="Needs finance role"'}>✎ Override</button>
            </div>
          </div>
        `);
        node.querySelector('[data-v-act="explain"]').addEventListener('click', () =>
          H.toast(`${v.id}: ${v.why}`, 'info'));
        node.querySelector('[data-v-act="override"]').addEventListener('click', () => {
          if (!canWrite) { H.toast('Needs finance role to override a voucher', 'warn'); return; }
          H.audit.log({
            action: 'voucher.overridden',
            entityType: 'Voucher',
            entityId: v.id,
            summary: `${me().name} manually overrode auto-voucher ${v.id} (${v.src})`,
            amount: { value: v.amount, currency: 'SEK' },
            links: [{ entityType: 'Voucher', entityId: v.id }],
            before: { debit: v.debit[0], credit: v.credit[0], auto: true },
            after: { reclassified: true, by: me().id },
            module: 'ledger'
          });
          node.classList.add('ledger-voucher-edited');
          const pill = node.querySelector('.ledger-vconf');
          pill.className = 'pill info ledger-vconf';
          pill.textContent = '● MANUAL';
          H.toast(`${v.id} reclassified manually · logged to Audit`, 'success');
        });
        return node;
      }
      vouchers.forEach(v => vStream.appendChild(voucherEl(v)));
      autoRow.appendChild(autoCard);

      // ── auto-accounting health side card ────────────────────────────
      const autoMatched = vouchers.length;
      const autoLow = vouchers.filter(v => v.conf < 85).length;
      const autoHealthCard = H.el(`
        <div class="card ledger-autohealth">
          <div class="card-head">
            <h3><span class="hico">🧠</span> Bookkeeping AI</h3>
            <span class="tag info">FORTNOX</span>
          </div>
          <div class="ledger-gaugewrap">
            ${H.charts.gauge(94, { max: 100, size: 188, arc: 250 })}
            <div class="ledger-gaugecore">
              <div class="ledger-gaugenum"><span data-count="94">0</span><i>%</i></div>
              <div class="ledger-gaugesub">AUTO-MATCHED</div>
            </div>
          </div>
          <div class="ledger-fuelmeta">
            <div><span class="faint">Vouchers today</span><b>18</b></div>
            <div><span class="faint">Need review</span><b class="${autoLow ? 'ledger-dry' : ''}">${autoLow}</b></div>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="post-batch"${canWrite ? '' : ' disabled title="Needs finance role"'}>Post ${autoMatched} vouchers to Fortnox</button>
        </div>
      `);
      const ahGauge = autoHealthCard.querySelector('svg text');
      if (ahGauge) ahGauge.style.display = 'none';
      autoRow.appendChild(autoHealthCard);
      root.appendChild(autoRow);

      /* ── ROW 4: VAT / moms status + upcoming bills ─────────────────── */
      const row4 = H.el(`<div class="grid cols-2"></div>`);

      // VAT / moms (Fortnox) — output vs input, net to pay, period, draft declaration
      const vatOutput = 231400;
      const vatInput = 88600;
      const vatOwed = vatOutput - vatInput;   // 142,800 net to pay
      const vatPeriod = 'May–Jun 2026';
      const vatCard = H.el(`
        <div class="card ledger-vat">
          <div class="card-head">
            <h3><span class="hico">🧮</span> VAT / Moms</h3>
            <span class="tag info">${vatPeriod.toUpperCase()}</span>
          </div>
          <div class="attn warn ledger-vatbanner">
            <span class="a-ico">📅</span>
            <div class="a-body">
              <div class="a-title">Next filing due · 12 Jul 2026</div>
              <div class="a-sub">VAT return for ${vatPeriod} · draft ready in Fortnox</div>
            </div>
            <button class="btn btn-sm" data-act="vat-review">Review</button>
          </div>
          <div class="grid cols-2 mt">
            <div class="panel center">
              <div class="kpi-sub">Output VAT (sales)</div>
              <div class="big-num ledger-pos" style="font-size:22px">${kr(vatOutput)}</div>
            </div>
            <div class="panel center">
              <div class="kpi-sub">Input VAT (purch.)</div>
              <div class="big-num" style="font-size:22px">−${kr(vatInput)}</div>
            </div>
          </div>
          <div class="panel ledger-vatnet mt-sm">
            <div>
              <div class="kpi-sub">Net to pay · Skatteverket</div>
              <div class="ledger-vatnet-sub faint">Period ${vatPeriod} · settle by 12 Jul</div>
            </div>
            <div class="big-num ledger-neg" style="font-size:26px">${kr(vatOwed)}</div>
          </div>
          <div class="stat-row mt-sm">
            <span class="sr-label">Reserved in tax account</span>
            <span class="sr-val ledger-pos">${kr(612000)}</span>
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">● FULLY COVERED</span>
            <span class="kpi-sub">Auto-synced 18 vouchers today</span>
          </div>
          <button class="btn btn-primary btn-block mt-sm" data-act="vat-draft"${canWrite ? '' : ' disabled title="Needs finance role"'}>📝 Draft declaration</button>
        </div>
      `);
      row4.appendChild(vatCard);

      // upcoming bills
      const bills = [
        { who: 'Payroll · 6 crew', when: '25 Jun', amt: 178000, ic: '👥', tag: 'warn', tt: 'RECURRING' },
        { who: 'Office rent · Castellum', when: '28 Jun', amt: 41000, ic: '🏢', tag: '', tt: 'RECURRING' },
        { who: 'Skatteverket · VAT', when: '12 Jul', amt: 142800, ic: '🏛️', tag: 'info', tt: 'FILING' },
        { who: 'AWS invoice', when: '01 Jul', amt: 19200, ic: '☁️', tag: '', tt: 'EST.' },
        { who: 'DHL freight · Q2', when: '03 Jul', amt: 14600, ic: '📦', tag: '', tt: 'EST.' }
      ];
      const billsTotal = bills.reduce((a, b) => a + b.amt, 0);
      const billCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📤</span> Upcoming Bills</h3>
            <span class="ch-meta">NEXT 30 DAYS</span>
          </div>
          <div class="list ledger-bills"></div>
          <div class="row between mt">
            <span class="kpi-sub">Total outflow scheduled</span>
            <span class="big-num" style="font-size:20px">${kr(billsTotal)}</span>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="schedule-pay"${canWrite ? '' : ' disabled title="Needs finance role"'}>Schedule all payments</button>
        </div>
      `);
      const billList = billCard.querySelector('.ledger-bills');
      bills.forEach(b => {
        billList.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${b.ic}</div>
            <div class="li-body">
              <div class="li-title">${b.who}</div>
              <div class="li-sub"><span class="tag ${b.tag}">${b.tt}</span> due ${b.when}</div>
            </div>
            <span class="li-meta ledger-bal ledger-amt-out">−${kr(b.amt)}</span>
          </div>
        `));
      });
      row4.appendChild(billCard);
      root.appendChild(row4);

      /* ── ADD-COST form: fixed/variable toggle, recurrence toggle, VAT
            preview, submit. costType drives the existing Fixed/Variable
            lists; recMode routes the same entry into the Expenses overview
            (recurring vs one-time). ───────────────────────────────────── */
      let costType = 'fixed';   // 'fixed' | 'variable'  → Recurring/Variable cost lists
      let recMode = 'recurring'; // 'recurring' | 'onetime' → Expenses overview lists
      const amountInput = formCard.querySelector('[data-f="amount"]');
      const catSelect = formCard.querySelector('[data-f="cat"]');
      const vendorSelect = formCard.querySelector('[data-f="vendor"]');
      const vatSelect = formCard.querySelector('[data-f="vat"]');
      const dateInput = formCard.querySelector('[data-f="date"]');
      const vatPrevEl = formCard.querySelector('[data-vatprev]');
      const typeToggle = formCard.querySelector('[data-f="type"]');
      const recToggle = formCard.querySelector('[data-f="rec"]');

      // map the form's detailed category → the overview's coarse expense category,
      // so new entries land in a sensible donut slice in the Expenses overview.
      const CAT_TO_EXP = {
        'Office & rent': 'Rent', 'Salaries': 'Salaries', 'Cloud & SaaS': 'SaaS',
        'Accounting SW': 'SaaS', 'CRM & marketing': 'SaaS', 'Marketing': 'Marketing',
        'Logistics': 'Services', 'Payments': 'Services', 'Design SW': 'Tools', 'Other': 'Other'
      };

      function updateVatPreview() {
        const amt = parseFloat(amountInput.value) || 0;
        const rate = parseFloat(vatSelect.value) || 0;
        // amount entered is treated as gross; VAT = gross − gross/(1+rate)
        const vat = rate ? amt - amt / (1 + rate / 100) : 0;
        vatPrevEl.textContent = kr(Math.round(vat));
      }
      amountInput.addEventListener('input', updateVatPreview);
      vatSelect.addEventListener('change', updateVatPreview);

      // each toggle group is wired independently (scoped to its own container)
      typeToggle.querySelectorAll('.ledger-tg').forEach(b => {
        b.addEventListener('click', () => {
          costType = b.dataset.type;
          typeToggle.querySelectorAll('.ledger-tg').forEach(x => x.classList.toggle('active', x === b));
        });
      });
      recToggle.querySelectorAll('.ledger-tg').forEach(b => {
        b.addEventListener('click', () => {
          recMode = b.dataset.rec;
          recToggle.querySelectorAll('.ledger-tg').forEach(x => x.classList.toggle('active', x === b));
        });
      });

      let costCounter = 0;
      function submitCost() {
        if (!canWrite) { H.toast('Needs finance role to book costs', 'warn'); return; }
        const amount = Math.round(parseFloat(amountInput.value) || 0);
        if (amount <= 0) { H.toast('Enter a cost amount first', 'warn'); amountInput.focus(); return; }
        const cat = catSelect.value;
        const vendor = vendorSelect.value;
        const vat = parseFloat(vatSelect.value) || 0;
        const when = dateInput.value || '2026-06-15';
        const id = 'co-new-' + (++costCounter);
        const rec = { id, cat, amount, vendor, vat, note: 'Added ' + when };

        if (costType === 'fixed') fixedCosts.unshift(rec); else variableCosts.unshift(rec);

        // ALSO mirror into the Expenses overview as recurring (Monthly) or one-time.
        // Reuse the same id so the audit trail references a single Cost entity.
        const expCat = CAT_TO_EXP[cat] || 'Other';
        const niceDate = D.months[(parseInt(when.slice(5, 7), 10) || 6) - 1] + ' ' + (when.slice(8, 10) || '15');
        if (recMode === 'recurring') {
          recurringExp.unshift({ id, name: cat + ' · ' + vendor, cat: expCat, vendor, amount, next: niceDate });
        } else {
          oneTimeExp.unshift({ id, name: cat + ' · ' + vendor, cat: expCat, vendor, amount, date: niceDate });
        }
        // jump the overview to the segment we just added into, then repaint
        if (expSeg !== 'all') expSeg = recMode;
        expCard.querySelectorAll('.ledger-seg-btn').forEach(x => x.classList.toggle('active', x.dataset.seg === expSeg));
        paintExpenses();

        // AUDIT — required on every data-changing action
        H.audit.log({
          action: 'cost.added',
          entityType: 'Cost',
          entityId: id,
          summary: `${me().name} booked ${kr(amount)} ${recMode === 'recurring' ? 'recurring (monthly)' : 'one-time'} ${costType} cost from ${vendor}`,
          amount: { value: amount, currency: 'SEK' },
          links: [{ entityType: 'Cost', entityId: id }],
          after: { costType, recurrence: recMode === 'recurring' ? 'monthly' : 'one-time', expenseCategory: expCat, category: cat, vendor, vatRate: vat },
          module: 'ledger'
        });

        paintCosts();
        // flash the new row
        const stream = costType === 'fixed' ? fixedStream : varStream;
        const fresh = stream.querySelector(`[data-cost="${id}"]`);
        if (fresh) { fresh.classList.add('ledger-costrow-new'); fresh.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        // flash the matching overview row too
        const expFresh = expBody.querySelector(`[data-exp="${id}"]`);
        if (expFresh) expFresh.classList.add('ledger-costrow-new');
        // reset amount
        amountInput.value = '';
        updateVatPreview();
        H.toast(`${kr(amount)} ${recMode === 'recurring' ? 'recurring' : 'one-time'} cost booked · logged to Audit`, 'success');
      }

      /* ── wire actions (no global keys; shell owns ⌘K) ──────────────── */
      const wire = (sel, fn) => { const e = root.querySelector(sel); if (e) e.addEventListener('click', fn); };
      wire('[data-act="export"]', () => H.toast('Exporting P&L statement (PDF)…', 'info'));
      wire('[data-act="forecast"]', () => H.toast('Building 18-month cash forecast…', 'info'));
      wire('[data-act="link-bank"]', () => {
        if (!canWrite) { H.toast('Needs finance role to link a bank account', 'warn'); return; }
        H.audit.log({
          action: 'bank.link.started',
          entityType: 'BankAccount',
          entityId: 'tink-link',
          summary: `${me().name} started linking a new bank account via Tink`,
          links: [{ entityType: 'Integration', entityId: 'tink' }],
          after: { provider: 'tink', status: 'connecting' },
          module: 'ledger'
        });
        H.toast('Opening Tink bank-link flow…', 'info');
      });
      wire('[data-act="all-tx"]', () => H.toast('Loading full transaction ledger…', 'info'));
      wire('[data-act="add-cost"]', submitCost);
      wire('[data-act="post-batch"]', () => {
        if (!canWrite) { H.toast('Needs finance role to post vouchers', 'warn'); return; }
        H.audit.log({
          action: 'vouchers.posted',
          entityType: 'Voucher',
          entityId: 'batch-' + vouchers.length,
          summary: `${me().name} posted ${vouchers.length} auto-vouchers to Fortnox`,
          links: vouchers.map(v => ({ entityType: 'Voucher', entityId: v.id })),
          after: { count: vouchers.length, destination: 'fortnox' },
          module: 'ledger'
        });
        H.toast(`${vouchers.length} vouchers posted to Fortnox · logged to Audit`, 'success');
      });
      wire('[data-act="vat-review"]', () => H.toast('Opening Fortnox VAT draft for review…', 'info'));
      wire('[data-act="vat-draft"]', () => {
        if (!canWrite) { H.toast('Needs finance role to draft the declaration', 'warn'); return; }
        H.audit.log({
          action: 'vat.declaration.drafted',
          entityType: 'VatDeclaration',
          entityId: 'vat-2026-mayjun',
          summary: `${me().name} drafted the VAT declaration for ${vatPeriod} — net ${kr(vatOwed)} to pay`,
          amount: { value: vatOwed, currency: 'SEK' },
          links: [{ entityType: 'VatDeclaration', entityId: 'vat-2026-mayjun' }],
          after: { period: vatPeriod, output: vatOutput, input: vatInput, net: vatOwed },
          module: 'ledger'
        });
        H.toast(`VAT declaration drafted · net ${kr(vatOwed)} · logged to Audit`, 'success');
      });
      wire('[data-act="schedule-pay"]', () => {
        if (!canWrite) { H.toast('Needs finance role to schedule payments', 'warn'); return; }
        H.audit.log({
          action: 'payments.scheduled',
          entityType: 'Payment',
          entityId: 'batch-bills-' + bills.length,
          summary: `${me().name} scheduled ${bills.length} upcoming payments — total ${kr(billsTotal)}`,
          amount: { value: billsTotal, currency: 'SEK' },
          links: bills.map((b, i) => ({ entityType: 'Payment', entityId: 'bill-' + i })),
          after: { count: bills.length, total: billsTotal },
          module: 'ledger'
        });
        H.toast(`${bills.length} payments scheduled — total ${kr(billsTotal)} · logged to Audit`, 'success');
      });

      // count-ups are auto-run by the shell after render(); nothing else needed.
    }
  });
})();
