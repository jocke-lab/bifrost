/* ============================================================================
   inventory.js — Inventory module.
   Products & stock: what you have, what is running out.
   Follows the HELM module contract (see command.js):
     1) HELM.register({ id, label, icon, render })
     2) render(root) builds DOM with ONLY documented .classes + HELM.charts
     3) no fonts/colors/global styles; never touch another module's DOM
     4) every on-screen number goes through HELM.fmt or [data-count]
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'inventory',
    label: 'Inventory',
    icon: '📦',
    render(root) {
      const D = H.data;
      const cur = 'kr'; // kronor flavour
      const money = (n) => H.fmt.money(n, cur);

      /* ── deterministic catalogue ─────────────────────────────────────── */
      // movement sparks: deterministic 30-day unit-movement per SKU
      const mv = (key, from, to, vol) => D.series('inv-mv-' + key, 30, from, to, vol);

      // category → palette token (tokens only; five visually distinct hues)
      const CATS = {
        Avionics: 'var(--accent1)',
        Airframe: 'var(--accent2)',
        Propulsion: 'var(--accent3)',
        Fasteners: 'var(--warn)',
        Consumables: 'var(--danger)'
      };

      // products: SKU, name, category, onHand, par, unitCost
      const products = [
        { sku: 'AX-12', name: 'Gyro Stabiliser Unit', cat: 'Avionics', on: 8, par: 20, cost: 4200, spark: mv('ax12', 22, 8, 0.35) },
        { sku: 'TF-90', name: 'Titanium Frame Rail', cat: 'Airframe', on: 142, par: 80, cost: 980, spark: mv('tf90', 96, 142, 0.18) },
        { sku: 'PR-04', name: 'Ion Thruster Nozzle', cat: 'Propulsion', on: 14, par: 24, cost: 18600, spark: mv('pr04', 30, 14, 0.30) },
        { sku: 'HX-22', name: 'Hex Bolt M8 (×500)', cat: 'Fasteners', on: 61, par: 40, cost: 320, spark: mv('hx22', 48, 61, 0.22) },
        { sku: 'LP-08', name: 'Lithium Cell Pack', cat: 'Propulsion', on: 27, par: 30, cost: 5400, spark: mv('lp08', 41, 27, 0.26) },
        { sku: 'CB-15', name: 'Carbon Skin Panel', cat: 'Airframe', on: 73, par: 50, cost: 2650, spark: mv('cb15', 55, 73, 0.2) },
        { sku: 'AV-31', name: 'Flight Control Board', cat: 'Avionics', on: 5, par: 18, cost: 7900, spark: mv('av31', 19, 5, 0.4) },
        { sku: 'CS-77', name: 'Thermal Paste Tube', cat: 'Consumables', on: 210, par: 120, cost: 85, spark: mv('cs77', 150, 210, 0.15) },
        { sku: 'FS-09', name: 'Rivet Kit (assorted)', cat: 'Fasteners', on: 33, par: 60, cost: 460, spark: mv('fs09', 70, 33, 0.28) },
        { sku: 'PR-11', name: 'Turbopump Seal Set', cat: 'Propulsion', on: 12, par: 16, cost: 9300, spark: mv('pr11', 21, 12, 0.27) }
      ];

      const statusOf = (p) => {
        if (p.on <= p.par * 0.4) return { key: 'bad', label: 'Critical' };
        if (p.on < p.par) return { key: 'warn', label: 'Low' };
        if (p.on > p.par * 1.6) return { key: 'info', label: 'Overstock' };
        return { key: 'ok', label: 'Healthy' };
      };

      // KPI roll-ups (deterministic, no wall-clock)
      const stockValue = products.reduce((a, p) => a + p.on * p.cost, 0);
      const skuCount = products.length;
      const unitsOnHand = products.reduce((a, p) => a + p.on, 0);
      const lowStock = products.filter(p => p.on < p.par);
      const lowCount = lowStock.length;

      // SKUs currently at or above their reorder point (shown in the health stats).
      const inStockSkus = products.filter(p => p.on >= p.par).length;
      // order-fill service level — the company-canonical STOCK metric on the
      // shell tape (94%). Distinct from the at-par SKU count above.
      const fillRate = 94;

      // category aggregation for donut (by stock value)
      const catAgg = {};
      products.forEach(p => { catAgg[p.cat] = (catAgg[p.cat] || 0) + p.on * p.cost; });
      const donutSegs = Object.keys(catAgg).map(c => ({ label: c, value: Math.round(catAgg[c] / 1000), color: CATS[c] }));

      // stock by location (units) — a deterministic split of unitsOnHand so the
      // four locations sum EXACTLY to "units on hand" (keeps the KPI coherent).
      const locShares = [
        { label: 'Norrköping HQ', w: 0.47 },
        { label: 'Stockholm DC', w: 0.26 },
        { label: 'Göteborg Hub', w: 0.18 },
        { label: 'Malmö Bay', w: 0.09 }
      ];
      let locAllocated = 0;
      const locations = locShares.map((l, i) => {
        // last location absorbs the rounding remainder so the total is exact
        const value = i === locShares.length - 1
          ? unitsOnHand - locAllocated
          : Math.round(unitsOnHand * l.w);
        locAllocated += value;
        return { label: l.label, value };
      });

      // inbound purchase orders
      const purchaseOrders = [
        { po: 'PO-2041', supplier: 'Northwind AB', sku: 'AX-12', qty: 40, carrier: 'PostNord', eta: 'Jun 18', days: 3, state: 'In transit' },
        { po: 'PO-2042', supplier: 'Forsberg Konsult', sku: 'AV-31', qty: 24, carrier: 'DHL', eta: 'Jun 21', days: 6, state: 'Confirmed' },
        { po: 'PO-2039', supplier: 'Lykke Studios', sku: 'PR-04', qty: 18, carrier: 'DHL', eta: 'Jun 16', days: 1, state: 'Out for delivery' },
        { po: 'PO-2044', supplier: 'Sundström Metall', sku: 'FS-09', qty: 60, carrier: 'PostNord', eta: 'Jun 24', days: 9, state: 'Awaiting dispatch' }
      ];

      /* ── VIEW HEAD ───────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📦</div>
            <div>
              <h1>Inventory</h1>
              <p>What you have, and what is running out. ${lowCount} item${lowCount === 1 ? '' : 's'} below par right now.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="count">◇ Stock count</button>
            <button class="btn btn-primary btn-sm" data-act="po">＋ New purchase order</button>
          </div>
        </div>
      `));

      /* ── KPI ROW ─────────────────────────────────────────────────────── */
      const catCount = Object.keys(CATS).length;
      const kpis = [
        // STOCK VALUE stays in kronor like the rest of the module — the core
        // money formatter prints '$', so use num-compaction + a 'kr' prefix.
        { label: 'STOCK VALUE', count: stockValue, fmt: 'num', prefix: 'kr', sub: 'at landed cost', trend: '+6.2%', dir: 'up', spark: D.series('kpi-val', 14, stockValue * 0.86, stockValue, 0.05) },
        { label: 'ACTIVE SKUS', count: skuCount, fmt: 'num', sub: catCount + ' categories', trend: '+2', dir: 'up', spark: D.series('kpi-sku', 14, 7, skuCount, 0.06) },
        { label: 'UNITS ON HAND', count: unitsOnHand, fmt: 'num', sub: 'across ' + locShares.length + ' locations', trend: '+48', dir: 'up', spark: D.series('kpi-units', 14, unitsOnHand * 0.9, unitsOnHand, 0.07) },
        // low stock is a "bad-when-high" metric — it eased from 8 to 6 this week (good),
        // so use the neutral/flat trend chip to avoid an arrow that fights the sign.
        { label: 'LOW STOCK', count: lowCount, fmt: 'num', sub: 'below reorder point', trend: '−2 WoW', dir: 'flat', spark: D.series('kpi-low', 14, 8, lowCount, 0.18) }
      ];
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card inventory-kpi kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}"${k.prefix ? ` data-prefix="${k.prefix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ── LOW-STOCK ALERTS ────────────────────────────────────────────── */
      const alertCard = H.el(`
        <div class="card span-full inventory-alerts" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">⚠️</span> Running Low — Reorder Now</h3>
            <span class="badge bad">${lowCount}</span>
          </div>
          <div class="inventory-alert-stack"></div>
        </div>
      `);
      const alertStack = alertCard.querySelector('.inventory-alert-stack');
      // order by severity (most critical first)
      lowStock
        .slice()
        .sort((a, b) => (a.on / a.par) - (b.on / b.par))
        .forEach(p => {
          const st = statusOf(p);
          const sev = st.key === 'bad' ? 'bad' : 'warn';
          const gap = p.par - p.on;
          const node = H.el(`
            <div class="attn ${sev}">
              <span class="a-ico">${st.key === 'bad' ? '🔴' : '🟠'}</span>
              <div class="a-body">
                <div class="a-title">${p.name} <span class="mono faint">· ${p.sku}</span></div>
                <div class="a-sub">${p.on} on hand · par ${p.par} · short ${gap} unit${gap === 1 ? '' : 's'} · ${p.cat}</div>
              </div>
              <span class="tag ${sev}">${st.label}</span>
              <button class="btn btn-sm btn-primary" data-reorder="${p.sku}">Reorder</button>
            </div>
          `);
          node.querySelector('[data-reorder]').addEventListener('click', () => {
            H.toast(`Purchase order drafted for ${p.sku} — ${gap} units`, 'success');
          });
          alertStack.appendChild(node);
        });
      root.appendChild(alertCard);

      /* ── MAIN ROW: products table (span 2) + (donut over stock-health) ── */
      const mainRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
      // the 3rd grid cell is a vertical stack so it stays one column-unit wide
      const sideCol = H.el(`<div class="col" style="gap:var(--gap)"></div>`);

      // products table
      const tableCard = H.el(`
        <div class="card span-2 inventory-table-card">
          <div class="card-head">
            <h3><span class="hico">🗃️</span> Products & Stock</h3>
            <span class="ch-meta">${skuCount} SKUS · 30D MOVEMENT</span>
          </div>
          <div class="inventory-table-scroll">
            <table class="table inventory-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th class="num">On hand</th>
                  <th class="num">Par</th>
                  <th>Status</th>
                  <th class="num">Value</th>
                  <th>30-day</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = tableCard.querySelector('tbody');
      products
        .slice()
        .sort((a, b) => (a.on / a.par) - (b.on / b.par)) // most at-risk on top
        .forEach(p => {
          const st = statusOf(p);
          const val = p.on * p.cost;
          const tr = H.el(`
            <tr data-sku="${p.sku}">
              <td class="mono">${p.sku}</td>
              <td>${p.name}</td>
              <td><span class="tag inventory-cat-tag" style="color:${CATS[p.cat]}">${p.cat}</span></td>
              <td class="num">${H.fmt.num(p.on)}</td>
              <td class="num faint">${p.par}</td>
              <td><span class="pill ${st.key}">${st.label}</span></td>
              <td class="num">${money(val)}</td>
              <td class="inventory-cell-spark"><div class="spark">${H.charts.spark(p.spark, { height: 26 })}</div></td>
            </tr>
          `);
          tr.addEventListener('click', () => H.toast(`${p.name} (${p.sku}) — ${p.on} on hand · ${money(val)}`, 'info'));
          tbody.appendChild(tr);
        });
      mainRow.appendChild(tableCard);

      // category donut
      const donutCard = H.el(`
        <div class="card inventory-donut-card">
          <div class="card-head">
            <h3><span class="hico">🍩</span> Value by Category</h3>
            <span class="ch-meta">SHARE OF STOCK</span>
          </div>
          <div class="chart" style="height:200px">
            ${H.charts.donut(donutSegs, { size: 200, thickness: 24, center: { value: money(stockValue), label: 'TOTAL' } })}
          </div>
          <div class="inventory-legend mt"></div>
        </div>
      `);
      const legend = donutCard.querySelector('.inventory-legend');
      Object.keys(catAgg).forEach(c => {
        const share = Math.round((catAgg[c] / stockValue) * 100);
        legend.appendChild(H.el(`
          <div class="inventory-leg-row">
            <span class="inventory-leg-dot" style="background:${CATS[c]}"></span>
            <span class="inventory-leg-name">${c}</span>
            <span class="inventory-leg-val mono">${money(catAgg[c])}</span>
            <span class="inventory-leg-pct mono faint">${share}%</span>
          </div>
        `));
      });
      sideCol.appendChild(donutCard);

      // ── stock-health gauge — surfaces the canonical company STOCK 94% figure
      const healthCard = H.el(`
        <div class="card inventory-health-card">
          <div class="card-head">
            <h3><span class="hico">🩺</span> Stock Health</h3>
            <span class="ch-meta">FILL RATE</span>
          </div>
          <div class="chart inventory-gauge" style="height:184px">
            ${H.charts.gauge(fillRate, { max: 100, size: 184, arc: 260, label: 'IN STOCK', sub: 'SERVICE LEVEL' })}
          </div>
          <div class="inventory-health-stats"></div>
        </div>
      `);
      const healthStats = healthCard.querySelector('.inventory-health-stats');
      [
        ['At / above par', H.fmt.num(inStockSkus) + ' / ' + H.fmt.num(skuCount), 'ok'],
        ['Below reorder', H.fmt.num(lowCount), lowCount ? 'warn' : 'ok'],
        ['Overstocked', H.fmt.num(products.filter(p => p.on > p.par * 1.6).length), 'info']
      ].forEach(([label, val, sev]) => {
        healthStats.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label"><span class="inventory-dot ${sev}"></span>${label}</span>
            <span class="sr-val">${val}</span>
          </div>
        `));
      });
      sideCol.appendChild(healthCard);
      mainRow.appendChild(sideCol);
      root.appendChild(mainRow);

      /* ── BOTTOM ROW: location bars + inbound POs ─────────────────────── */
      const bottomRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // stock by location (bars)
      const totalLoc = locations.reduce((a, l) => a + l.value, 0);
      const locCard = H.el(`
        <div class="card span-2 inventory-loc-card">
          <div class="card-head">
            <h3><span class="hico">📍</span> Stock by Location</h3>
            <span class="ch-meta">UNITS · ${H.fmt.num(totalLoc)} TOTAL</span>
          </div>
          <div class="chart" style="height:200px">
            ${H.charts.bars(locations, { height: 200 })}
          </div>
          <div class="inventory-loc-legend mt"></div>
        </div>
      `);
      const locLegend = locCard.querySelector('.inventory-loc-legend');
      locations.forEach(l => {
        const pct = Math.round((l.value / totalLoc) * 100);
        locLegend.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label">${l.label}</span>
            <span class="sr-val">${H.fmt.num(l.value)} <span class="faint">· ${pct}%</span></span>
          </div>
        `));
      });
      bottomRow.appendChild(locCard);

      // inbound purchase orders
      const poCard = H.el(`
        <div class="card inventory-po-card">
          <div class="card-head">
            <h3><span class="hico">🚚</span> Inbound Orders</h3>
            <span class="badge">${purchaseOrders.length}</span>
          </div>
          <div class="list"></div>
        </div>
      `);
      const poList = poCard.querySelector('.list');
      purchaseOrders
        .slice()
        .sort((a, b) => a.days - b.days)
        .forEach(po => {
          const soon = po.days <= 1;
          const node = H.el(`
            <div class="list-item inventory-po-item" data-po="${po.po}">
              <div class="li-ico">${po.carrier === 'DHL' ? '✈️' : '📮'}</div>
              <div class="li-body">
                <div class="li-title">${po.supplier} <span class="mono faint">· ${po.qty}× ${po.sku}</span></div>
                <div class="li-sub">${po.po} · ${po.carrier} · <span class="${soon ? 'inventory-eta-soon' : ''}">${po.state}</span></div>
              </div>
              <span class="li-meta">ETA ${po.eta}</span>
            </div>
          `);
          node.addEventListener('click', () => H.toast(`${po.po} · ${po.qty}× ${po.sku} from ${po.supplier} · ${po.carrier} ETA ${po.eta}`, 'info'));
          poList.appendChild(node);
        });
      // footer action
      poCard.appendChild(H.el(`<button class="btn btn-sm btn-block mt" data-act="all-po">View all purchase orders</button>`));
      bottomRow.appendChild(poCard);
      root.appendChild(bottomRow);

      /* ── wire view-head + footer actions ─────────────────────────────── */
      root.querySelector('[data-act="po"]').addEventListener('click', () => H.toast('New purchase order — pick a supplier', 'info'));
      root.querySelector('[data-act="count"]').addEventListener('click', () => H.toast('Cycle count started across ' + locShares.length + ' locations', 'info'));
      root.querySelector('[data-act="all-po"]').addEventListener('click', () => H.toast('Opening purchase order ledger…', 'info'));

      // count-ups run automatically by the shell after render().
    }
  });
})();
