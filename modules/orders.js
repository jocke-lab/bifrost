/* ============================================================================
   orders.js — Orders & Fulfillment.
   From paid to delivered. Funnel · carriers · regions · the live order book.
   Follows the HELM module contract: register({id,label,icon,render}), build DOM
   with H.el + documented classes + H.charts, wire every button, never bind
   global keys, never touch another module's DOM.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'orders',
    label: 'Orders',
    icon: '🚀',
    render(root) {
      const D = H.data;

      /* ── deterministic mock data (unique series names → stable + distinct) ── */
      const ordSpark = D.series('ord-24h', 16, 22, 41, 0.22);    // orders / hour-ish
      const aovSpark = D.series('ord-aov', 16, 760, 884, 0.10);   // avg order value
      const fulSpark = D.series('ord-ful', 16, 92, 96.4, 0.04);   // fulfilled rate
      const retSpark = D.series('ord-ret', 16, 4.4, 3.1, 0.18);   // returns rate (↘ good)

      // fulfillment funnel — strictly descending stages
      const funnel = [
        { label: 'PAID', value: 418, color: 'var(--accent2)' },
        { label: 'PACKING', value: 286, color: 'var(--accent1)' },
        { label: 'SHIPPED', value: 244, color: 'var(--accent3)' },
        { label: 'DELIVERED', value: 207, color: '#5ad1b0' }
      ];

      // shipping by carrier (donut)
      const carriers = [
        { label: 'PostNord', value: 187, color: 'var(--accent2)' },
        { label: 'DHL', value: 121, color: 'var(--accent1)' },
        { label: 'Instabox', value: 74, color: 'var(--accent3)' }
      ];
      const carrierTotal = carriers.reduce((a, c) => a + c.value, 0);

      // region breakdown (stat-rows + progress)
      const regions = [
        { name: 'Stockholm', val: 38, n: 159 },
        { name: 'Göteborg', val: 22, n: 92 },
        { name: 'Malmö', val: 16, n: 67 },
        { name: 'Uppsala', val: 11, n: 46 },
        { name: 'EU · Rest', val: 13, n: 54 }
      ];

      // the order book
      const STATUS = {
        paid: { cls: 'info', txt: 'PAID' },
        packing: { cls: 'warn', txt: 'PACKING' },
        shipped: { cls: '', txt: 'SHIPPED' },
        delivered: { cls: 'ok', txt: 'DELIVERED' },
        returned: { cls: 'bad', txt: 'RETURNED' }
      };
      const CARRIER_TAG = {
        PostNord: 'info', DHL: 'warn', Instabox: ''
      };
      const orders = [
        ['#OPL-1048', 'Northwind AB', 3, 2480, 'PostNord', 'packing'],
        ['#OPL-1047', 'Lykke Studios', 1, 884, 'DHL', 'shipped'],
        ['#OPL-1046', 'Forsberg Konsult', 5, 4120, 'PostNord', 'delivered'],
        ['#OPL-1045', 'Bergström Design', 2, 1290, 'Instabox', 'paid'],
        ['#OPL-1044', 'Hedlund & Co', 1, 640, 'DHL', 'delivered'],
        ['#OPL-1043', 'Vasa Interiör', 4, 3360, 'PostNord', 'shipped'],
        ['#OPL-1042', 'Kallio Oy', 2, 1780, 'DHL', 'returned'],
        ['#OPL-1041', 'Lindgren Atelier', 1, 720, 'Instabox', 'delivered'],
        ['#OPL-1040', 'Sundqvist AB', 6, 5240, 'PostNord', 'packing'],
        ['#OPL-1039', 'Aurora Goods', 2, 1460, 'DHL', 'paid']
      ];

      // recent shipments
      const shipments = [
        ['📦', '#OPL-1047 · Lykke Studios', 'DHL · SE372819004 · in transit', '2M'],
        ['🚚', '#OPL-1043 · Vasa Interiör', 'PostNord · out for delivery', '18M'],
        ['✅', '#OPL-1046 · Forsberg Konsult', 'PostNord · delivered · Göteborg', '41M'],
        ['📮', '#OPL-1044 · Hedlund & Co', 'DHL · delivered · signed', '1H'],
        ['🏷️', '#OPL-1040 · Sundqvist AB', 'PostNord · label created', '1H']
      ];

      /* ── VIEW HEAD ──────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🚀</div>
            <div>
              <h1>Orders</h1>
              <p>Orders &amp; fulfillment — from paid to delivered, every parcel tracked.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="export">⭳ Export book</button>
            <button class="btn btn-primary btn-sm" data-act="ship">🚀 Ship next batch</button>
          </div>
        </div>
      `));

      /* ── KPI ROW ────────────────────────────────────────────────────── */
      const kpis = [
        { label: 'ORDERS · 24H', count: 37, fmt: 'num', trend: '+5', dir: 'up', spark: ordSpark },
        { label: 'AVG ORDER VALUE', count: 884, fmt: 'money', trend: '+3.2%', dir: 'up', spark: aovSpark },
        { label: 'FULFILLED RATE', val: '96.4%', trend: '+0.8%', dir: 'up', spark: fulSpark },
        { label: 'RETURNS RATE', val: '3.1%', trend: '-0.9%', dir: 'down', spark: retSpark }
      ];
      const krow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(k => {
        const valHtml = k.count != null
          ? `<div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}">0</div>`
          : `<div class="kpi-value">${k.val}</div>`;
        krow.appendChild(H.el(`
          <div class="card kpi orders-kpi">
            <div class="kpi-label">${k.label}</div>
            ${valHtml}
            <div class="row between mt-sm">
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
              <span class="orders-kpi-tag">${k.dir === 'down' && k.label.includes('RETURN') ? 'IMPROVING' : 'vs · 7D'}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(krow);

      /* ── ROW 2: fulfillment funnel (span 2) + returns gauge ─────────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // FUNNEL — bars chart + a labeled stage strip with conversion %
      const funnelCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🛰️</span> Fulfillment Funnel</h3>
            <span class="ch-meta">PAID → DELIVERED · 7D</span>
          </div>
          <div class="chart" style="height:170px">
            ${H.charts.bars(funnel, { height: 170 })}
          </div>
          <div class="orders-funnel-strip"></div>
        </div>
      `);
      const strip = funnelCard.querySelector('.orders-funnel-strip');
      funnel.forEach((f, i) => {
        const conv = i === 0 ? 100 : Math.round((f.value / funnel[0].value) * 100);
        const drop = i === 0 ? '' : `−${funnel[i - 1].value - f.value}`;
        strip.appendChild(H.el(`
          <div class="orders-stage">
            <span class="os-dot" style="background:${f.color};box-shadow:0 0 8px ${f.color}"></span>
            <div class="os-body">
              <div class="os-name">${f.label}</div>
              <div class="os-num">${H.fmt.num(f.value)}</div>
            </div>
            <div class="os-meta">
              <span class="os-conv">${conv}%</span>
              ${drop ? `<span class="os-drop">${drop}</span>` : '<span class="os-drop ok">start</span>'}
            </div>
          </div>
        `));
      });
      row2.appendChild(funnelCard);

      // RETURNS GAUGE — inverted health (low returns = good). Gauge shows "health"
      // where 100 = zero returns; the core overlay shows the real returns %.
      // Floor 14% keeps a healthy 3.1% rate in the gauge's green band (frac ≥ .75).
      const returnsRate = 3.1;
      const returnsHealth = Math.round((1 - returnsRate / 14) * 100); // 14% = floor
      // 30-day denominator must scale up from the 7D funnel (PAID=418/7D ≈ 1790/30D),
      // so it cannot be smaller than the funnel base. 3.1% of 1773 ≈ 55 returns.
      const returns30dBase = 1773;
      const returns30dCount = Math.round(returnsRate / 100 * returns30dBase); // 55
      const gaugeCard = H.el(`
        <div class="card orders-gauge-card">
          <div class="card-head">
            <h3><span class="hico">↩︎</span> Returns Rate</h3>
            <span class="ch-meta">ROLLING 30D</span>
          </div>
          <div class="orders-gauge">
            ${H.charts.gauge(returnsHealth, { max: 100, size: 190, arc: 250 })}
            <div class="orders-gauge-core">
              <div class="ogc-num">${returnsRate}%</div>
              <div class="ogc-lbl">RETURNED</div>
            </div>
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">▼ −0.9% vs LM</span>
            <span class="muted" style="font-size:11px">${returns30dCount} of ${H.fmt.num(returns30dBase)} orders</span>
          </div>
        </div>
      `);
      // hide the gauge's built-in big number; our overlay shows the returns %
      const gtxt = gaugeCard.querySelector('.orders-gauge svg text');
      if (gtxt) gtxt.style.display = 'none';
      row2.appendChild(gaugeCard);
      root.appendChild(row2);

      /* ── ROW 3: order book (span 2) + carrier donut ────────────────── */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const bookCard = H.el(`
        <div class="card span-2 flush orders-book">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">📋</span> Order Book</h3>
            <div class="ch-meta orders-book-filters">
              <span class="orders-chip active" data-filter="all">ALL</span>
              <span class="orders-chip" data-filter="packing">PACKING</span>
              <span class="orders-chip" data-filter="shipped">SHIPPED</span>
              <span class="orders-chip" data-filter="returned">RETURNS</span>
            </div>
          </div>
          <div class="orders-table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Order</th><th>Customer</th><th class="num">Items</th>
                  <th class="num">Total</th><th>Carrier</th><th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = bookCard.querySelector('tbody');
      orders.forEach(([num, cust, items, total, carrier, status]) => {
        const st = STATUS[status];
        const ctag = CARRIER_TAG[carrier];
        const tr = H.el(`
          <tr data-status="${status}">
            <td class="mono">${num}</td>
            <td>
              <div class="orders-cust">
                <span class="avatar sq" style="width:24px;height:24px;font-size:10px">${D.initials(cust)}</span>
                <span class="nowrap">${cust}</span>
              </div>
            </td>
            <td class="num">${items}</td>
            <td class="num mono">${H.fmt.money(total)}</td>
            <td><span class="tag ${ctag}">${carrier}</span></td>
            <td><span class="pill ${st.cls}">${st.txt}</span></td>
          </tr>
        `);
        tr.addEventListener('click', () => H.toast(`Opening ${num} — ${cust}`, 'info'));
        tbody.appendChild(tr);
      });
      // filter chips
      const chips = bookCard.querySelectorAll('.orders-chip');
      chips.forEach(chip => chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const f = chip.dataset.filter;
        tbody.querySelectorAll('tr').forEach(tr => {
          const match = f === 'all'
            || (f === 'returned' ? tr.dataset.status === 'returned' : tr.dataset.status === f);
          tr.style.display = match ? '' : 'none';
        });
      }));
      row3.appendChild(bookCard);

      // CARRIER DONUT + legend
      const carrierCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🚚</span> By Carrier</h3>
            <span class="ch-meta">SHIPMENTS · 7D</span>
          </div>
          <div class="chart orders-donut" style="height:180px">
            ${H.charts.donut(carriers, { size: 180, thickness: 24, center: { value: carrierTotal, label: 'PARCELS' } })}
          </div>
          <div class="orders-legend"></div>
        </div>
      `);
      const legend = carrierCard.querySelector('.orders-legend');
      carriers.forEach(c => {
        const pct = Math.round((c.value / carrierTotal) * 100);
        legend.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label"><span class="orders-swatch" style="background:${c.color}"></span>${c.label}</span>
            <span class="sr-val">${c.value} · ${pct}%</span>
          </div>
        `));
      });
      row3.appendChild(carrierCard);
      root.appendChild(row3);

      /* ── ROW 4: recent shipments + region breakdown ────────────────── */
      const row4 = H.el(`<div class="grid cols-2"></div>`);

      const shipCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📡</span> Recent Shipments</h3>
            <span class="pill ok" style="font-size:9px">● LIVE</span>
          </div>
          <div class="list"></div>
          <button class="btn btn-ghost btn-sm btn-block mt" data-act="tracking">Open tracking board →</button>
        </div>
      `);
      const shipList = shipCard.querySelector('.list');
      shipments.forEach(([ico, title, sub, ts]) => {
        shipList.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${ico}</div>
            <div class="li-body"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>
            <span class="li-meta">${ts}</span>
          </div>
        `));
      });
      row4.appendChild(shipCard);

      const regionCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🗺️</span> Orders by Region</h3>
            <span class="ch-meta">SHARE · 30D</span>
          </div>
          <div class="orders-regions"></div>
        </div>
      `);
      const regWrap = regionCard.querySelector('.orders-regions');
      regions.forEach((r) => {
        // bars stay accent; flag a thin tail (<15% share) amber so it reads as a watch-item
        const cls = r.val < 15 ? 'warn' : '';
        const node = H.el(`
          <div class="orders-region">
            <div class="row between">
              <span class="or-name">${r.name}</span>
              <span class="or-val mono">${r.val}% · ${r.n}</span>
            </div>
            <div class="progress mt-sm"><div class="bar ${cls}" style="width:0"></div></div>
          </div>
        `);
        regWrap.appendChild(node);
        const bar = node.querySelector('.bar');
        setTimeout(() => { bar.style.width = r.val + '%'; }, 260);
      });
      row4.appendChild(regionCard);
      root.appendChild(row4);

      /* ── WIRE ACTIONS (no global keys; shell owns ⌘K) ──────────────── */
      root.querySelector('[data-act="export"]')
        .addEventListener('click', () => H.toast('Exporting order book to CSV…', 'info'));
      root.querySelector('[data-act="ship"]')
        .addEventListener('click', () => H.toast('Batch of 12 labels queued — PostNord + DHL', 'success'));
      root.querySelector('[data-act="tracking"]')
        .addEventListener('click', () => H.show('integrations'));

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });
})();
