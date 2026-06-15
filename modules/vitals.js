/* ============================================================================
   vitals.js — Vitals. Per-employee health command center (scope: personal).
   Follows the HELM module contract (see command.js for the canonical shape):
     • register({id,label,icon,scope:'personal',render})
     • READ HELM.session.user FRESH at the top of render() — the shell re-renders
       this module on a user switch, so every person sees their own body.
     • build DOM with H.el(...) using ONLY documented classes + .vitals-* tweaks
     • deterministic data via H.data (no Math.random / no Date at eval)
     • the BMR / TDEE / BMI / calorie math is REAL (Mifflin-St Jeor) and recomputes
       live when the body inputs change.
     • wire every button to H.toast / H.show / local state, audit body edits.

   Sections:
     1) TODAY ring row — Recovery%, Strain, Sleep, Resting HR, HRV (+ status pills)
     2) HR / HRV trend area over the day
     3) BODY panel — editable weight/height/age/sex → BMR · TDEE · burned · BMI live
     4) Calendar stress — pulls today's events, flags stressful ones + suggestion
     5) Weekly trends — sleep / strain / steps bars + sparks
     6) Connect device card — Whoop / Google Fit / Apple Health
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'vitals',
    label: 'Vitals',
    icon: '💗',
    scope: 'personal',
    render(root) {
      const D = H.data;
      const S = H.session;
      const me = S.user;                          // READ FRESH — re-rendered per user
      const ns = 'vitals-' + me.id;               // unique seed namespace per person

      /* ── per-person body stats ────────────────────────────────────────────
         The seed leaves body:{weightKg,heightCm,age,sex} null for everyone, so
         we hydrate realistic Swedish/EU stats per employee ONCE, write them onto
         the live session.user.body, and from then on read/edit that object. */
      const BODY_SEED = {
        'u-arvid': { weightKg: 82, heightCm: 183, age: 41, sex: 'male' },
        'u-mira':  { weightKg: 64, heightCm: 170, age: 38, sex: 'female' },
        'u-ola':   { weightKg: 91, heightCm: 179, age: 47, sex: 'male' },
        'u-sofia': { weightKg: 68, heightCm: 174, age: 33, sex: 'female' },
        'u-noah':  { weightKg: 77, heightCm: 181, age: 29, sex: 'male' },
        'u-lena':  { weightKg: 71, heightCm: 168, age: 44, sex: 'female' },
        'u-kai':   { weightKg: 79, heightCm: 177, age: 31, sex: 'male' },
        'u-isa':   { weightKg: 59, heightCm: 165, age: 26, sex: 'female' }
      };
      const body = me.body || (me.body = {});
      if (body.weightKg == null) {
        const seed = BODY_SEED[me.id] || { weightKg: 75, heightCm: 175, age: 35, sex: 'male' };
        body.weightKg = seed.weightKg; body.heightCm = seed.heightCm;
        body.age = seed.age; body.sex = seed.sex;
      }

      /* activity multiplier — remembered in local module state (not persisted,
         this is a personal what-if dial). Defaults vary a little per person. */
      const ACT = [
        { key: 'sedentary',   mult: 1.20, label: 'Sedentary',   sub: 'desk · little exercise' },
        { key: 'light',       mult: 1.375, label: 'Light',       sub: '1–3 workouts / week' },
        { key: 'moderate',    mult: 1.55, label: 'Moderate',    sub: '3–5 workouts / week' },
        { key: 'active',      mult: 1.725, label: 'Active',      sub: '6–7 workouts / week' },
        { key: 'athlete',     mult: 1.90, label: 'Athlete',     sub: 'twice-daily / physical job' }
      ];
      let actIdx = D.int(ns + '-act', 1, 3);      // start light..active, per person

      /* ── deterministic biometric "today" snapshot per person ──────────────
         Whoop-style scales: Recovery 0–100%, Strain 0–21, Sleep hrs, RHR bpm,
         HRV ms. Seeded so each employee gets a stable, different reading. */
      const recovery = D.int(ns + '-rec', 38, 92);          // %
      const strain = +(D.seed(ns + '-strain')() * 12 + 6).toFixed(1);  // 6.0–18.0
      const sleepH = +(D.seed(ns + '-sleep')() * 2.7 + 5.4).toFixed(1); // 5.4–8.1 h
      const sleepNeed = 8.0;
      const rhr = D.int(ns + '-rhr', 48, 70);               // bpm
      const hrv = D.int(ns + '-hrv', 32, 96);               // ms
      const spo2 = D.int(ns + '-spo2', 95, 99);             // %
      const respRate = +(D.seed(ns + '-rr')() * 4 + 13).toFixed(1);    // br/min
      const steps = D.int(ns + '-steps', 3200, 13800);
      const activeMin = D.int(ns + '-amin', 18, 92);

      /* status helpers → which pill class + word for a metric */
      const sev = (v, good, ok) => (v >= good ? 'ok' : v >= ok ? 'warn' : 'bad');
      const recSev = sev(recovery, 67, 34);
      const recWord = recovery >= 67 ? 'PRIMED' : recovery >= 34 ? 'ADEQUATE' : 'LOW';
      const strainSev = strain >= 14 ? 'bad' : strain >= 10 ? 'warn' : 'ok';
      const strainWord = strain >= 14 ? 'HIGH' : strain >= 10 ? 'MODERATE' : 'LIGHT';
      const sleepSev = sleepH >= 7 ? 'ok' : sleepH >= 6 ? 'warn' : 'bad';
      const rhrSev = rhr <= 56 ? 'ok' : rhr <= 64 ? 'warn' : 'bad';
      const hrvSev = hrv >= 65 ? 'ok' : hrv >= 45 ? 'warn' : 'bad';

      /* ── REAL physiology math (Mifflin-St Jeor) ──────────────────────────
         BMR(male)   = 10·kg + 6.25·cm − 5·age + 5
         BMR(female) = 10·kg + 6.25·cm − 5·age − 161
         TDEE        = BMR · activityMultiplier
         BMI         = kg / (m²) ; burned-so-far estimated from elapsed day. */
      function calcBMR(b) {
        const base = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age;
        return Math.round(base + (b.sex === 'female' ? -161 : 5));
      }
      function calcTDEE(b, mult) { return Math.round(calcBMR(b) * mult); }
      function calcBMI(b) {
        const m = b.heightCm / 100;
        return +(b.weightKg / (m * m)).toFixed(1);
      }
      function bmiCat(bmi) {
        if (bmi < 18.5) return { label: 'Underweight', sev: 'warn', frac: bmi / 40 };
        if (bmi < 25) return { label: 'Normal', sev: 'ok', frac: bmi / 40 };
        if (bmi < 30) return { label: 'Overweight', sev: 'warn', frac: bmi / 40 };
        return { label: 'Obese', sev: 'bad', frac: Math.min(1, bmi / 40) };
      }
      /* fraction of the day elapsed — fixed (no wall-clock at eval) at ~62% so
         "burned today" is a believable partial figure that updates with inputs. */
      const DAY_FRAC = 0.62;
      function burnedToday(b, mult) {
        // resting burn pro-rated + the day's logged active minutes (~7 kcal/min)
        const resting = calcTDEE(b, mult) * DAY_FRAC;
        const active = activeMin * 6.4;
        return Math.round(resting + active);
      }

      /* ── trend series (deterministic, unique names per person) ───────────── */
      const hrDay = D.series(ns + '-hrday', 24, rhr + 6, rhr + 34, 0.18);   // bpm over day
      const hrvDay = D.series(ns + '-hrvday', 24, Math.max(20, hrv - 18), hrv + 14, 0.2);
      const sleepWk = D.series(ns + '-slpwk', 7, 5.6, 8.1, 0.14);
      const strainWk = D.series(ns + '-strwk', 7, 7, 17, 0.2);
      const stepsWk = D.series(ns + '-stpwk', 7, 4200, 13200, 0.22);
      const recWk = D.series(ns + '-recwk', 14, 40, 90, 0.16);
      const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

      /* ============================================================ VIEW HEAD */
      const presenceDot = me.presence || S.presence || 'available';
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">💗</div>
            <div>
              <h1>Vitals</h1>
              <p>${esc(me.name.split(' ')[0])}'s health deck — recovery, strain, sleep & live body metrics.</p>
            </div>
          </div>
          <div class="vh-actions">
            <span class="vitals-who"><span class="pdot ${esc(presenceDot)}"></span>${esc(me.name)} · ${esc(me.title)}</span>
            <button class="btn btn-ghost btn-sm" data-act="sync">⟳ Sync devices</button>
            <button class="btn btn-primary btn-sm" data-act="log">＋ Log workout</button>
          </div>
        </div>
      `));

      /* ════════════════════════════════════ 1 · TODAY — ring row + waveform */
      const todayRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* — Recovery ring (hero, span 1) — */
      const recCard = H.el(`
        <div class="card glow pad-lg vitals-rec">
          <div class="card-head">
            <h3><span class="hico">🟢</span> Recovery</h3>
            <span class="pill ${recSev}">${recWord}</span>
          </div>
          <div class="vitals-ring">
            ${H.charts.gauge(recovery, { max: 100, size: 200, arc: 280 })}
            <div class="vitals-ring-core">
              <div class="vitals-ring-num" data-count="${recovery}" data-suffix="%">0</div>
              <div class="vitals-ring-lbl">RECOVERY</div>
            </div>
          </div>
          <div class="vitals-rec-meta">
            <div class="vitals-mini"><span class="vitals-mini-k">HRV</span><span class="vitals-mini-v">${hrv} ms</span></div>
            <div class="vitals-mini"><span class="vitals-mini-k">RHR</span><span class="vitals-mini-v">${rhr} bpm</span></div>
            <div class="vitals-mini"><span class="vitals-mini-k">SpO₂</span><span class="vitals-mini-v">${spo2}%</span></div>
          </div>
        </div>
      `);
      // hide the gauge's built-in number — the overlay core shows it
      const rsvg = recCard.querySelector('.vitals-ring svg text');
      if (rsvg) rsvg.style.display = 'none';
      todayRow.appendChild(recCard);

      /* — Strain gauge (span 1) — */
      const strainCard = H.el(`
        <div class="card pad-lg vitals-rec">
          <div class="card-head">
            <h3><span class="hico">🔥</span> Day Strain</h3>
            <span class="pill ${strainSev}">${strainWord}</span>
          </div>
          <div class="vitals-ring">
            ${H.charts.gauge(strain, { max: 21, size: 200, arc: 280 })}
            <div class="vitals-ring-core">
              <div class="vitals-ring-num" data-count="${strain}" data-dp="1">0</div>
              <div class="vitals-ring-lbl">/ 21 STRAIN</div>
            </div>
          </div>
          <div class="vitals-rec-meta">
            <div class="vitals-mini"><span class="vitals-mini-k">ACTIVE</span><span class="vitals-mini-v">${activeMin} min</span></div>
            <div class="vitals-mini"><span class="vitals-mini-k">STEPS</span><span class="vitals-mini-v">${H.fmt.num(steps)}</span></div>
            <div class="vitals-mini"><span class="vitals-mini-k">RESP</span><span class="vitals-mini-v">${respRate}/min</span></div>
          </div>
        </div>
      `);
      const ssvg = strainCard.querySelector('.vitals-ring svg text');
      if (ssvg) ssvg.style.display = 'none';
      todayRow.appendChild(strainCard);

      /* — three stacked KPI tiles (Sleep / RHR / HRV) — */
      const kpiCol = H.el(`<div class="col vitals-kpicol"></div>`);
      [
        { label: 'SLEEP', ico: '😴', value: sleepH, suffix: 'h', dp: 1, sub: `need ${sleepNeed}h`, sevc: sleepSev, spark: sleepWk },
        { label: 'RESTING HR', ico: '❤️', value: rhr, suffix: ' bpm', dp: 0, sub: '7-day avg', sevc: rhrSev, spark: D.series(ns + '-rhrwk', 7, rhr - 5, rhr + 5, 0.12) },
        { label: 'HRV', ico: '〰️', value: hrv, suffix: ' ms', dp: 0, sub: 'rmssd', sevc: hrvSev, spark: D.series(ns + '-hrvwk', 7, hrv - 12, hrv + 12, 0.16) }
      ].forEach(k => {
        kpiCol.appendChild(H.el(`
          <div class="card kpi vitals-kpi">
            <div class="row between">
              <div class="kpi-label">${k.ico} ${k.label}</div>
              <span class="vitals-dot ${k.sevc}"></span>
            </div>
            <div class="kpi-value sm" data-count="${k.value}" data-dp="${k.dp}" data-suffix="${k.suffix}">0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <div class="vitals-kspark spark">${H.charts.spark(k.spark, { height: 26 })}</div>
            </div>
          </div>
        `));
      });
      todayRow.appendChild(kpiCol);
      root.appendChild(todayRow);

      /* ════════════════════════════════════ 2 · HR / HRV TREND (area) */
      const trendCard = H.el(`
        <div class="card" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">📈</span> Heart Rate · HRV — Today</h3>
            <div class="row" style="gap:8px">
              <span class="vitals-leg hr"><i></i>HEART RATE</span>
              <span class="vitals-leg hrv"><i></i>HRV</span>
              <span class="ch-meta">00:00 → 24:00</span>
            </div>
          </div>
          <div class="chart" style="height:210px">
            ${H.charts.area(hrDay, { height: 210, v2: hrvDay, labels: ['00', '06', '12', '18', '24'] })}
          </div>
          <div class="vitals-trend-foot">
            <div class="stat-row"><span class="sr-label">Avg HR</span><span class="sr-val">${Math.round(hrDay.reduce((a, b) => a + b, 0) / hrDay.length)} bpm</span></div>
            <div class="stat-row"><span class="sr-label">Peak HR</span><span class="sr-val">${Math.max.apply(null, hrDay)} bpm</span></div>
            <div class="stat-row"><span class="sr-label">Avg HRV</span><span class="sr-val">${Math.round(hrvDay.reduce((a, b) => a + b, 0) / hrvDay.length)} ms</span></div>
            <div class="stat-row"><span class="sr-label">Min HR</span><span class="sr-val">${Math.min.apply(null, hrDay)} bpm</span></div>
          </div>
        </div>
      `);
      root.appendChild(trendCard);

      /* ════════════════════════════════════ 3 · BODY PANEL — live BMR/TDEE/BMI */
      const bodyRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const canEditBody = true; // your own body — always editable for the acting user
      const bodyCard = H.el(`
        <div class="card span-2 vitals-body">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Body & Metabolism</h3>
            <span class="ch-meta">MIFFLIN-ST JEOR · LIVE</span>
          </div>
          <div class="vitals-body-grid">
            <div class="vitals-inputs">
              <label class="vitals-field">
                <span class="vitals-field-k">Weight</span>
                <span class="vitals-field-in"><input type="number" data-b="weightKg" min="35" max="250" step="0.5" value="${body.weightKg}"><em>kg</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Height</span>
                <span class="vitals-field-in"><input type="number" data-b="heightCm" min="130" max="220" step="1" value="${body.heightCm}"><em>cm</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Age</span>
                <span class="vitals-field-in"><input type="number" data-b="age" min="14" max="100" step="1" value="${body.age}"><em>yr</em></span>
              </label>
              <div class="vitals-field">
                <span class="vitals-field-k">Sex</span>
                <div class="vitals-seg" data-seg="sex">
                  <button data-sex="male" class="${body.sex === 'male' ? 'active' : ''}">Male</button>
                  <button data-sex="female" class="${body.sex === 'female' ? 'active' : ''}">Female</button>
                </div>
              </div>
              <div class="vitals-field vitals-field--full">
                <span class="vitals-field-k">Activity level <em class="vitals-actmult"></em></span>
                <div class="vitals-act" data-seg="act"></div>
              </div>
            </div>
            <div class="vitals-results">
              <div class="vitals-result">
                <div class="vitals-result-k">BMR <small>basal</small></div>
                <div class="vitals-result-v" data-out="bmr">0</div>
                <div class="vitals-result-u">kcal / day at rest</div>
              </div>
              <div class="vitals-result vitals-result--hero">
                <div class="vitals-result-k">TDEE <small>maintenance</small></div>
                <div class="vitals-result-v" data-out="tdee">0</div>
                <div class="vitals-result-u">kcal / day · <span data-out="actlabel">—</span></div>
              </div>
              <div class="vitals-result">
                <div class="vitals-result-k">Burned today <small>est.</small></div>
                <div class="vitals-result-v" data-out="burned">0</div>
                <div class="vitals-result-u"><span data-out="burnpct">0%</span> of TDEE · ${activeMin} active min</div>
                <div class="progress" style="margin-top:8px"><div class="bar" data-out="burnbar" style="width:0"></div></div>
              </div>
            </div>
          </div>
          <div class="vitals-formula">
            <span class="vitals-formula-tag">FORMULA</span>
            <code data-out="formula"></code>
          </div>
        </div>
      `);

      // build activity segmented control
      const actWrap = bodyCard.querySelector('[data-seg="act"]');
      ACT.forEach((a, i) => {
        actWrap.appendChild(H.el(`
          <button data-act-idx="${i}" class="${i === actIdx ? 'active' : ''}" title="${a.sub}">
            <b>${a.label}</b><small>×${a.mult}</small>
          </button>
        `));
      });

      // BMI sidecard
      const bmiCard = H.el(`
        <div class="card vitals-bmi">
          <div class="card-head">
            <h3><span class="hico">⚖️</span> Body Mass Index</h3>
            <span class="ch-meta">LIVE</span>
          </div>
          <div class="vitals-bmi-big"><span data-out="bmi">0</span><small>BMI</small></div>
          <div class="vitals-bmi-cat" data-out="bmicat">—</div>
          <div class="vitals-bmi-scale">
            <div class="vitals-bmi-seg" style="--c:var(--accent2)"><span>Under</span></div>
            <div class="vitals-bmi-seg" style="--c:var(--success)"><span>Normal</span></div>
            <div class="vitals-bmi-seg" style="--c:var(--warn)"><span>Over</span></div>
            <div class="vitals-bmi-seg" style="--c:var(--danger)"><span>Obese</span></div>
            <div class="vitals-bmi-marker" data-out="bmimark"></div>
          </div>
          <div class="vitals-bmi-rows">
            <div class="stat-row"><span class="sr-label">Healthy range</span><span class="sr-val" data-out="bmirange">—</span></div>
            <div class="stat-row"><span class="sr-label">Lean mass est.</span><span class="sr-val" data-out="lean">—</span></div>
            <div class="stat-row"><span class="sr-label">Water (TBW)</span><span class="sr-val" data-out="water">—</span></div>
          </div>
        </div>
      `);

      bodyRow.appendChild(bodyCard);
      bodyRow.appendChild(bmiCard);
      root.appendChild(bodyRow);

      /* — the live recompute engine — */
      const out = (k) => root.querySelector(`[data-out="${k}"]`);
      function recompute(opts) {
        opts = opts || {};
        const b = body;
        const a = ACT[actIdx];
        const bmr = calcBMR(b);
        const tdee = calcTDEE(b, a.mult);
        const burned = burnedToday(b, a.mult);
        const burnPct = Math.round((burned / tdee) * 100);
        const bmi = calcBMI(b);
        const cat = bmiCat(bmi);
        const sexF = b.sex === 'female';

        // counters animate on first paint, snap instantly on edits
        setOut(out('bmr'), bmr, opts.animate, ' kcal');
        setOut(out('tdee'), tdee, opts.animate, ' kcal');
        setOut(out('burned'), burned, opts.animate, ' kcal');
        out('burnpct').textContent = burnPct + '%';
        out('actlabel').textContent = a.label.toLowerCase() + ' ×' + a.mult;
        const bbar = out('burnbar');
        bbar.style.width = Math.min(100, burnPct) + '%';
        bbar.className = 'bar' + (burnPct > 90 ? ' warn' : '');

        // BMI side
        setOut(out('bmi'), bmi, opts.animate, '', 1);
        const bcat = out('bmicat');
        bcat.textContent = cat.label;
        bcat.className = 'vitals-bmi-cat vitals-' + cat.sev;
        out('bmimark').style.left = (Math.max(0, Math.min(1, (bmi - 12) / (42 - 12))) * 100) + '%';
        const hMin = (18.5 * (b.heightCm / 100) ** 2).toFixed(0);
        const hMax = (24.9 * (b.heightCm / 100) ** 2).toFixed(0);
        out('bmirange').textContent = hMin + '–' + hMax + ' kg';
        // crude lean-mass (Boer) + total body water (Watson-ish simplified)
        const lean = sexF
          ? 0.252 * b.weightKg + 0.473 * b.heightCm - 48.3
          : 0.407 * b.weightKg + 0.267 * b.heightCm - 19.2;
        out('lean').textContent = lean.toFixed(1) + ' kg';
        const tbw = (sexF ? 0.50 : 0.58) * b.weightKg;
        out('water').textContent = tbw.toFixed(1) + ' L';

        out('formula').textContent =
          `BMR = 10·${b.weightKg} + 6.25·${b.heightCm} − 5·${b.age} ${sexF ? '− 161' : '+ 5'} = ${bmr} kcal   →   TDEE = ${bmr} × ${a.mult} = ${tdee} kcal`;

        root.querySelector('.vitals-actmult').textContent = '×' + a.mult;
      }
      function setOut(node, val, animate, suffix, dp) {
        if (!node) return;
        suffix = suffix || ''; dp = dp || 0;
        if (animate) {
          node.setAttribute('data-count', val);
          node.setAttribute('data-dp', dp);
          if (suffix) node.setAttribute('data-suffix', suffix);
          node.__counted = false;
          H.count(node);
        } else {
          node.textContent = val.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + suffix;
        }
      }

      // wire body inputs
      bodyCard.querySelectorAll('input[data-b]').forEach(inp => {
        inp.addEventListener('input', () => {
          const key = inp.getAttribute('data-b');
          let v = parseFloat(inp.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(inp.min), Math.min(parseFloat(inp.max), v));
          body[key] = v;
          recompute({ animate: false });
        });
        inp.addEventListener('change', () => {
          // clamp display + audit the body edit
          inp.value = body[inp.getAttribute('data-b')];
          auditBody();
        });
      });
      // sex segmented
      bodyCard.querySelectorAll('[data-sex]').forEach(b => {
        b.addEventListener('click', () => {
          bodyCard.querySelectorAll('[data-sex]').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          body.sex = b.getAttribute('data-sex');
          recompute({ animate: false });
          auditBody();
        });
      });
      // activity segmented
      actWrap.querySelectorAll('[data-act-idx]').forEach(b => {
        b.addEventListener('click', () => {
          actWrap.querySelectorAll('[data-act-idx]').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          actIdx = parseInt(b.getAttribute('data-act-idx'), 10);
          recompute({ animate: false });
          H.toast(`Activity → ${ACT[actIdx].label} (×${ACT[actIdx].mult}) · TDEE ${H.fmt.num(calcTDEE(body, ACT[actIdx].mult))} kcal`, 'info');
        });
      });
      let _auditT = null;
      function auditBody() {
        clearTimeout(_auditT);
        _auditT = setTimeout(() => {
          H.audit.log({
            action: 'vitals.body.updated',
            entityType: 'Person',
            entityId: me.id,
            summary: `${me.name} updated body metrics — ${body.weightKg} kg · ${body.heightCm} cm · ${body.age} yr · ${body.sex}`,
            after: { weightKg: body.weightKg, heightCm: body.heightCm, age: body.age, sex: body.sex },
            links: [{ entityType: 'Person', entityId: me.id }],
            module: 'vitals'
          });
        }, 600);
      }

      /* ════════════════════════════════════ 4 · CALENDAR STRESS */
      /* today's events (mirrors calendar.js taxonomy). Each gets a stress score
         from rules: back-to-back, high-stakes keyword, late/early, long. */
      const TYPE_COLOR = {
        meeting: 'var(--accent2)', deadline: 'var(--danger)', focus: 'var(--accent3)',
        finance: 'var(--warn)', personal: 'var(--accent1)'
      };
      const EVENTS = [
        { start: '08:30', end: '09:00', title: 'Daily standup', type: 'meeting' },
        { start: '09:00', end: '10:00', title: 'Investor sync — Q2 metrics', type: 'meeting' },
        { start: '10:00', end: '11:30', title: 'Board prep w/ ' + (me.id === 'u-mira' ? 'Arvid' : 'Mira'), type: 'meeting' },
        { start: '11:30', end: '12:00', title: 'Pipeline review', type: 'meeting' },
        { start: '13:00', end: '13:45', title: 'Payroll cutoff — Fortnox Lön', type: 'finance' },
        { start: '15:30', end: '16:00', title: '1:1 w/ Sofia', type: 'meeting' },
        { start: '19:30', end: '20:30', title: 'Q3 deck — final pass', type: 'deadline' }
      ];
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const HIGH_STAKES = /investor|board|payroll|deadline|deck|q[0-9]|review|tax|moms|vat|legal/i;

      function scoreEvent(ev, prevEnd) {
        const reasons = [];
        let score = 0;
        const sMin = toMin(ev.start), eMin = toMin(ev.end);
        const dur = eMin - sMin;
        if (prevEnd != null && sMin - prevEnd <= 5) { score += 2; reasons.push('back-to-back'); }
        if (HIGH_STAKES.test(ev.title)) { score += 3; reasons.push('high-stakes'); }
        if (ev.type === 'deadline') { score += 2; reasons.push('deadline'); }
        if (ev.type === 'finance') { score += 1; reasons.push('financial'); }
        if (sMin >= 18 * 60 || sMin < 8 * 60) { score += 2; reasons.push(sMin >= 18 * 60 ? 'after-hours' : 'early-start'); }
        if (dur >= 75) { score += 1; reasons.push('long block'); }
        return { score, reasons, dur };
      }
      let prevEnd = null;
      let totalStress = 0, backToBack = 0, bookedMin = 0;
      const scored = EVENTS.map(ev => {
        const s = scoreEvent(ev, prevEnd);
        if (s.reasons.includes('back-to-back')) backToBack++;
        prevEnd = toMin(ev.end);
        totalStress += s.score;
        bookedMin += s.dur;
        return Object.assign({}, ev, s);
      });
      const stressIdx = Math.min(100, Math.round((totalStress / (EVENTS.length * 5)) * 100) + 18);
      const stressSev = stressIdx >= 60 ? 'bad' : stressIdx >= 38 ? 'warn' : 'ok';
      const stressWord = stressIdx >= 60 ? 'HEAVY' : stressIdx >= 38 ? 'ELEVATED' : 'BALANCED';
      // suggestion engine
      const topStress = scored.slice().sort((a, b) => b.score - a.score)[0];
      const SUGGESTION = stressIdx >= 60
        ? `Your recovery is ${recovery}% and the day reads ${stressWord.toLowerCase()}. Add a 15-min buffer before “${topStress.title}” and decline one of the ${backToBack} back-to-back blocks.`
        : stressIdx >= 38
          ? `Protect a focus block after “${topStress.title}”. Consider moving the after-hours item earlier to keep sleep on track.`
          : `Day looks balanced. Keep a short walk between meetings to bank an easy ${Math.round((calcTDEE(body, ACT[actIdx].mult) - calcBMR(body)) * 0.05)} kcal.`;

      const stressRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
      const stressCard = H.el(`
        <div class="card span-2 vitals-stress">
          <div class="card-head">
            <h3><span class="hico">🗓️</span> Calendar Stress — Today</h3>
            <div class="row" style="gap:8px">
              <span class="pill ${stressSev}">${stressWord} · ${stressIdx}</span>
              <button class="btn btn-ghost btn-sm" data-go="calendar">Open calendar</button>
            </div>
          </div>
          <div class="vitals-stress-list"></div>
        </div>
      `);
      const slist = stressCard.querySelector('.vitals-stress-list');
      scored.forEach(ev => {
        const lvl = ev.score >= 5 ? 'bad' : ev.score >= 3 ? 'warn' : 'ok';
        const tags = ev.reasons.length
          ? ev.reasons.map(r => `<span class="vitals-rtag">${r}</span>`).join('')
          : '<span class="vitals-rtag ok">clear</span>';
        const node = H.el(`
          <div class="vitals-ev vitals-ev--${lvl}">
            <span class="vitals-ev-time">${ev.start}<small>${ev.end}</small></span>
            <span class="vitals-ev-rail" style="--cc:${TYPE_COLOR[ev.type]}"></span>
            <div class="vitals-ev-body">
              <div class="vitals-ev-title">${esc(ev.title)}</div>
              <div class="vitals-ev-tags">${tags}</div>
            </div>
            <span class="vitals-ev-score vitals-${lvl}">${ev.score >= 3 ? '⚠ ' : ''}${ev.score}</span>
          </div>
        `);
        slist.appendChild(node);
      });

      const adviceCard = H.el(`
        <div class="card vitals-advice">
          <div class="card-head">
            <h3><span class="hico">🧠</span> Coach</h3>
            <span class="pill ${recSev}">${recWord}</span>
          </div>
          <div class="vitals-advice-ring">
            ${H.charts.donut(
              [
                { label: 'Meetings', value: scored.filter(e => e.type === 'meeting').length, color: TYPE_COLOR.meeting },
                { label: 'Finance', value: scored.filter(e => e.type === 'finance').length, color: TYPE_COLOR.finance },
                { label: 'Deadline', value: scored.filter(e => e.type === 'deadline').length, color: TYPE_COLOR.deadline }
              ],
              { size: 132, thickness: 16, center: { value: scored.length, label: 'EVENTS' } }
            )}
          </div>
          <div class="vitals-advice-text">${esc(SUGGESTION)}</div>
          <div class="vitals-advice-rows">
            <div class="stat-row"><span class="sr-label">Booked time</span><span class="sr-val">${Math.floor(bookedMin / 60)}h ${bookedMin % 60}m</span></div>
            <div class="stat-row"><span class="sr-label">Back-to-back</span><span class="sr-val vitals-${backToBack >= 2 ? 'warn' : 'ok'}">${backToBack}</span></div>
            <div class="stat-row"><span class="sr-label">Stress index</span><span class="sr-val vitals-${stressSev}">${stressIdx}/100</span></div>
          </div>
          <button class="btn btn-block btn-sm vitals-protect" style="margin-top:11px">🛡 Protect a recovery block</button>
        </div>
      `);
      stressRow.appendChild(stressCard);
      stressRow.appendChild(adviceCard);
      root.appendChild(stressRow);

      /* ════════════════════════════════════ 5 · WEEKLY TRENDS */
      const wkRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const sleepBars = sleepWk.map((v, i) => ({ label: DOW[i], value: +v.toFixed(1), color: v >= 7 ? undefined : 'var(--warn)' }));
      const strainBars = strainWk.map((v, i) => ({ label: DOW[i], value: Math.round(v), color: v >= 14 ? 'var(--danger)' : undefined }));
      const stepBars = stepsWk.map((v, i) => ({ label: DOW[i], value: Math.round(v / 100), color: v >= 8000 ? undefined : 'var(--accent3)' }));

      wkRow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">😴</span> Sleep · 7d</h3>
            <span class="ch-meta">HRS · NEED 8</span>
          </div>
          <div class="chart" style="height:128px">${H.charts.bars(sleepBars, { height: 128, warnAt: 999 })}</div>
          <div class="row between mt-sm">
            <span class="kpi-sub">Avg ${(sleepWk.reduce((a, b) => a + b, 0) / 7).toFixed(1)}h</span>
            <span class="pill ${sleepWk.reduce((a, b) => a + b, 0) / 7 >= 7 ? 'ok' : 'warn'}">${sleepWk.reduce((a, b) => a + b, 0) / 7 >= 7 ? 'ON TARGET' : 'SHORT'}</span>
          </div>
        </div>
      `));

      wkRow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🔥</span> Strain · 7d</h3>
            <span class="ch-meta">0–21</span>
          </div>
          <div class="chart" style="height:128px">${H.charts.bars(strainBars, { height: 128 })}</div>
          <div class="row between mt-sm">
            <span class="kpi-sub">Avg ${(strainWk.reduce((a, b) => a + b, 0) / 7).toFixed(1)}</span>
            <span class="pill info">${strainWk.filter(v => v >= 14).length} hard days</span>
          </div>
        </div>
      `));

      wkRow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">👟</span> Steps · 7d</h3>
            <span class="ch-meta">×100</span>
          </div>
          <div class="chart" style="height:128px">${H.charts.bars(stepBars, { height: 128 })}</div>
          <div class="row between mt-sm">
            <span class="kpi-sub">Avg ${H.fmt.num(Math.round(stepsWk.reduce((a, b) => a + b, 0) / 7))}</span>
            <span class="pill ${stepsWk.reduce((a, b) => a + b, 0) / 7 >= 8000 ? 'ok' : 'warn'}">goal 8k</span>
          </div>
        </div>
      `));
      root.appendChild(wkRow);

      /* recovery sparkline strip (14d) */
      root.appendChild(H.el(`
        <div class="card" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">📉</span> Recovery Trend · 14 days</h3>
            <span class="ch-meta">${recWk[recWk.length - 1] >= recWk[0] ? '▲ TRENDING UP' : '▼ TRENDING DOWN'}</span>
          </div>
          <div class="chart" style="height:96px">${H.charts.area(recWk, { height: 96, grid: false, labels: ['14d', '10d', '7d', '3d', 'NOW'] })}</div>
        </div>
      `));

      /* ════════════════════════════════════ 6 · CONNECT DEVICE CARD */
      const conn = me.connections || {};
      const DEVICES = [
        { key: 'whoop', name: 'WHOOP 4.0', ico: '⌚', sub: 'Recovery · strain · HRV · sleep', on: !!conn.whoop, accent: 'var(--accent1)' },
        { key: 'googleFit', name: 'Google Fit', ico: '🟢', sub: 'Steps · workouts · heart rate', on: !!conn.googleFit, accent: 'var(--accent2)' },
        { key: 'appleHealth', name: 'Apple Health', ico: '🍎', sub: 'Activity rings · ECG · sleep', on: !!conn.appleHealth, accent: 'var(--accent3)' },
        { key: 'oura', name: 'Oura Ring', ico: '💍', sub: 'Sleep stages · temp · readiness', on: !!conn.oura, accent: 'var(--warn)' }
      ];
      const devCard = H.el(`
        <div class="card vitals-devices">
          <div class="card-head">
            <h3><span class="hico">🔗</span> Connect a Device</h3>
            <span class="ch-meta">${DEVICES.filter(d => d.on).length} CONNECTED</span>
          </div>
          <div class="vitals-dev-grid"></div>
          <p class="muted vitals-dev-note">Data stays on ${esc(H.session.org.name)}'s tenant. Each employee connects their own wearable — readings are private to ${esc(me.name.split(' ')[0])}.</p>
        </div>
      `);
      const dgrid = devCard.querySelector('.vitals-dev-grid');
      DEVICES.forEach(d => {
        const node = H.el(`
          <div class="vitals-dev ${d.on ? 'vitals-dev--on' : ''}" style="--da:${d.accent}">
            <div class="vitals-dev-ico">${d.ico}</div>
            <div class="vitals-dev-body">
              <div class="vitals-dev-name">${d.name}</div>
              <div class="vitals-dev-sub">${d.sub}</div>
            </div>
            <button class="btn btn-sm ${d.on ? '' : 'btn-primary'} vitals-dev-btn">${d.on ? '● Connected' : 'Connect'}</button>
          </div>
        `);
        const btn = node.querySelector('.vitals-dev-btn');
        btn.addEventListener('click', () => {
          const nowOn = !node.classList.contains('vitals-dev--on');
          node.classList.toggle('vitals-dev--on', nowOn);
          btn.textContent = nowOn ? '● Connected' : 'Connect';
          btn.classList.toggle('btn-primary', !nowOn);
          // persist for the acting user so the state survives a re-render / user switch
          (me.connections || (me.connections = {}))[d.key] = nowOn;
          H.toast(`${d.name} ${nowOn ? 'connected — pulling 30 days of history…' : 'disconnected'}`, nowOn ? 'success' : 'info');
          if (nowOn) {
            H.audit.log({
              action: 'vitals.device.connected',
              entityType: 'Integration',
              entityId: 'dev-' + d.key,
              summary: `${me.name} connected ${d.name} to Vitals`,
              after: { device: d.key },
              links: [{ entityType: 'Person', entityId: me.id }],
              module: 'vitals'
            });
          }
          devCard.querySelector('.ch-meta').textContent =
            (dgrid.querySelectorAll('.vitals-dev--on').length) + ' CONNECTED';
        });
        dgrid.appendChild(node);
      });
      root.appendChild(devCard);

      /* ════════════════════════════════════ WIRE view-head + misc actions */
      root.querySelector('[data-act="sync"]').addEventListener('click', () => {
        H.toast('Syncing wearables…', 'info');
        setTimeout(() => H.toast(`Vitals up to date · recovery ${recovery}% · ${H.fmt.num(steps)} steps`, 'success'), 900);
      });
      root.querySelector('[data-act="log"]').addEventListener('click', () => {
        H.toast('Workout logged — strain +1.4, ~480 kcal', 'success');
        H.audit.log({
          action: 'vitals.workout.logged',
          entityType: 'Workout',
          entityId: 'wo-' + me.id,
          summary: `${me.name} logged a workout (≈480 kcal)`,
          links: [{ entityType: 'Person', entityId: me.id }],
          module: 'vitals'
        });
      });
      stressCard.querySelector('[data-go="calendar"]').addEventListener('click', () => H.show('calendar'));
      adviceCard.querySelector('.vitals-protect').addEventListener('click', () =>
        H.toast('Recovery block held 16:00–16:45 — calendar updated', 'success'));

      /* first paint: animate the result counters once, fill bars */
      recompute({ animate: true });

      // ring/kpi count-ups (data-count) run automatically by the shell.
    }
  });

  /* tiny local escape (shell esc isn't exported) */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
