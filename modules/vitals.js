/* ============================================================================
   vitals.js — Vitals. Your real metabolic calculator + live wearable readout.
   NO fake data. Two honest parts:
     1) Body & Metabolism — you enter weight/height/age/sex/activity, it computes
        BMR · TDEE · BMI · lean mass · body water with REAL physiology
        (Mifflin-St Jeor / Boer). Saved to localStorage('helm.body') so the
        Dashboard and every reload share one source of truth.
     2) Recovery & Sleep — fetched live from /api/wearables-hud (Whoop / Oura).
        If nothing is connected it says so and points to Connections → Wearables.
        It never invents recovery / strain / sleep numbers.
   ========================================================================== */
(function () {
  const H = window.HELM;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ACT = [
    { key: 'sedentary', mult: 1.20, label: 'Sedentary', sub: 'desk · little exercise' },
    { key: 'light', mult: 1.375, label: 'Light', sub: '1–3 workouts / week' },
    { key: 'moderate', mult: 1.55, label: 'Moderate', sub: '3–5 workouts / week' },
    { key: 'active', mult: 1.725, label: 'Active', sub: '6–7 workouts / week' },
    { key: 'athlete', mult: 1.90, label: 'Athlete', sub: 'twice-daily / physical job' }
  ];

  function loadBody() {
    try { const b = JSON.parse(localStorage.getItem('helm.body')); return (b && typeof b === 'object') ? b : {}; }
    catch (e) { return {}; }
  }
  function saveBody(b) {
    try { localStorage.setItem('helm.body', JSON.stringify(b)); } catch (e) {}
    // mirror onto the live session user so the Dashboard reads it without a reload
    const u = (H.session && H.session.user);
    if (u) u.body = Object.assign({}, u.body, b);
    try { document.dispatchEvent(new CustomEvent('helm:body')); } catch (e) {}
  }

  function render(root) {
    const stored = loadBody();
    // working copy
    const body = {
      weightKg: stored.weightKg ?? null,
      heightCm: stored.heightCm ?? null,
      age: stored.age ?? null,
      sex: stored.sex ?? 'male',
      activity: Number.isInteger(stored.activity) ? stored.activity : 2 // moderate
    };

    root.innerHTML = `
      <div class="view-head">
        <div class="vh-title">
          <div class="vh-ico">💗</div>
          <div>
            <h1>Vitals</h1>
            <p>Your metabolic calculator and live wearable readout — real numbers, nothing invented.</p>
          </div>
        </div>
      </div>

      <div class="grid cols-3" style="margin-bottom:var(--gap)">
        <div class="card span-2 vitals-body">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Body &amp; Metabolism</h3>
            <span class="ch-meta">MIFFLIN-ST JEOR · LIVE</span>
          </div>
          <div class="vitals-body-grid">
            <div class="vitals-inputs">
              <label class="vitals-field">
                <span class="vitals-field-k">Weight</span>
                <span class="vitals-field-in"><input type="number" data-b="weightKg" min="35" max="250" step="0.5" placeholder="—" value="${body.weightKg ?? ''}"><em>kg</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Height</span>
                <span class="vitals-field-in"><input type="number" data-b="heightCm" min="130" max="220" step="1" placeholder="—" value="${body.heightCm ?? ''}"><em>cm</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Age</span>
                <span class="vitals-field-in"><input type="number" data-b="age" min="14" max="100" step="1" placeholder="—" value="${body.age ?? ''}"><em>yr</em></span>
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
                <div class="vitals-result-v" data-out="bmr">—</div>
                <div class="vitals-result-u">kcal / day at rest</div>
              </div>
              <div class="vitals-result vitals-result--hero">
                <div class="vitals-result-k">TDEE <small>maintenance</small></div>
                <div class="vitals-result-v" data-out="tdee">—</div>
                <div class="vitals-result-u">kcal / day · <span data-out="actlabel">—</span></div>
              </div>
              <div class="vitals-result">
                <div class="vitals-result-k">Targets <small>from TDEE</small></div>
                <div class="vitals-target-rows">
                  <div class="stat-row"><span class="sr-label">Lose (−0.5 kg/wk)</span><span class="sr-val" data-out="cut">—</span></div>
                  <div class="stat-row"><span class="sr-label">Gain (+0.5 kg/wk)</span><span class="sr-val" data-out="bulk">—</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="vitals-formula">
            <span class="vitals-formula-tag">FORMULA</span>
            <code data-out="formula">Enter your weight, height and age to compute BMR &amp; TDEE.</code>
          </div>
        </div>

        <div class="card vitals-bmi">
          <div class="card-head">
            <h3><span class="hico">⚖️</span> Body Mass Index</h3>
            <span class="ch-meta">LIVE</span>
          </div>
          <div class="vitals-bmi-big"><span data-out="bmi">—</span><small>BMI</small></div>
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
      </div>

      <div class="card vitals-devices" id="vitals-wear">
        <div class="card-head">
          <h3><span class="hico">⌚</span> Recovery &amp; Sleep</h3>
          <span class="ch-meta" id="vitals-wear-meta">CHECKING…</span>
        </div>
        <div id="vitals-wear-body"><div class="nft-loading" style="padding:16px"><span class="nft-spin"></span> Reading wearables…</div></div>
      </div>`;

    // ── activity segmented control ──
    const actWrap = root.querySelector('[data-seg="act"]');
    ACT.forEach((a, i) => {
      actWrap.appendChild(H.el(`<button data-act-idx="${i}" class="${i === body.activity ? 'active' : ''}" title="${a.sub}"><b>${a.label}</b><small>×${a.mult}</small></button>`));
    });

    /* ── REAL physiology ── */
    const calcBMR = b => Math.round(10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + (b.sex === 'female' ? -161 : 5));
    const calcBMI = b => +(b.weightKg / Math.pow(b.heightCm / 100, 2)).toFixed(1);
    const out = k => root.querySelector(`[data-out="${k}"]`);
    const num = n => Number(n).toLocaleString('en-US');
    const complete = () => body.weightKg > 0 && body.heightCm > 0 && body.age > 0;

    function recompute() {
      const a = ACT[body.activity] || ACT[2];
      root.querySelector('.vitals-actmult').textContent = '×' + a.mult;
      if (!complete()) {
        ['bmr', 'tdee', 'cut', 'bulk', 'bmi', 'lean', 'water', 'bmirange'].forEach(k => { if (out(k)) out(k).textContent = '—'; });
        out('actlabel').textContent = a.label.toLowerCase();
        out('bmicat').textContent = '—';
        out('bmicat').className = 'vitals-bmi-cat';
        out('formula').textContent = 'Enter your weight, height and age to compute BMR & TDEE.';
        return;
      }
      const bmr = calcBMR(body);
      const tdee = Math.round(bmr * a.mult);
      out('bmr').textContent = num(bmr) + ' kcal';
      out('tdee').textContent = num(tdee) + ' kcal';
      out('actlabel').textContent = a.label.toLowerCase() + ' ×' + a.mult;
      out('cut').textContent = num(tdee - 550) + ' kcal';
      out('bulk').textContent = num(tdee + 350) + ' kcal';

      const bmi = calcBMI(body);
      const cat = bmi < 18.5 ? { l: 'Underweight', s: 'warn' } : bmi < 25 ? { l: 'Normal', s: 'ok' } : bmi < 30 ? { l: 'Overweight', s: 'warn' } : { l: 'Obese', s: 'bad' };
      out('bmi').textContent = bmi;
      out('bmicat').textContent = cat.l;
      out('bmicat').className = 'vitals-bmi-cat vitals-' + cat.s;
      out('bmimark').style.left = (Math.max(0, Math.min(1, (bmi - 12) / (42 - 12))) * 100) + '%';
      const hMin = (18.5 * (body.heightCm / 100) ** 2).toFixed(0);
      const hMax = (24.9 * (body.heightCm / 100) ** 2).toFixed(0);
      out('bmirange').textContent = hMin + '–' + hMax + ' kg';
      const sexF = body.sex === 'female';
      const lean = sexF ? 0.252 * body.weightKg + 0.473 * body.heightCm - 48.3 : 0.407 * body.weightKg + 0.267 * body.heightCm - 19.2;
      out('lean').textContent = lean.toFixed(1) + ' kg';
      out('water').textContent = ((sexF ? 0.50 : 0.58) * body.weightKg).toFixed(1) + ' L';
      out('formula').textContent = `BMR = 10·${body.weightKg} + 6.25·${body.heightCm} − 5·${body.age} ${sexF ? '− 161' : '+ 5'} = ${bmr} kcal   →   TDEE = ${bmr} × ${a.mult} = ${tdee} kcal`;
    }

    let saveT = null;
    function persist() { clearTimeout(saveT); saveT = setTimeout(() => saveBody(body), 250); }

    root.querySelectorAll('input[data-b]').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.getAttribute('data-b');
        const v = parseFloat(inp.value);
        body[k] = isNaN(v) ? null : v;
        recompute(); persist();
      });
    });
    root.querySelectorAll('[data-sex]').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('[data-sex]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      body.sex = b.getAttribute('data-sex');
      recompute(); persist();
    }));
    actWrap.querySelectorAll('[data-act-idx]').forEach(b => b.addEventListener('click', () => {
      actWrap.querySelectorAll('[data-act-idx]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      body.activity = parseInt(b.getAttribute('data-act-idx'), 10);
      recompute(); persist();
    }));

    recompute();
    loadWearables(root);
  }

  /* ── live wearables (real, via the serverless API) ── */
  async function api(path) {
    try {
      let token = null;
      try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
      const r = await fetch(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const t = await r.text();
      try { return JSON.parse(t); } catch (e) { return { _offline: true }; }
    } catch (e) { return { _offline: true, error: e.message }; }
  }

  async function loadWearables(root) {
    const bodyEl = root.querySelector('#vitals-wear-body');
    const metaEl = root.querySelector('#vitals-wear-meta');
    if (!bodyEl) return;
    const hud = await api('/api/wearables-hud');
    const cfg = (hud && hud.configured) || {};
    const whoop = hud && hud.whoop, oura = hud && hud.oura;
    const whoopOn = whoop && whoop.connected, ouraOn = oura && oura.connected;

    if (hud && hud._offline) {
      metaEl.textContent = 'OFFLINE';
      bodyEl.innerHTML = `<p class="muted" style="padding:4px 2px 0">Live on <b>bifrostlkl.com</b> — the wearables API isn't reachable in this local preview. Connect Whoop or Oura under <b>Connections → Wearables</b>.</p>`;
      return;
    }
    if (whoopOn || ouraOn) {
      metaEl.textContent = ((whoopOn ? 1 : 0) + (ouraOn ? 1 : 0)) + ' CONNECTED';
      const tiles = [];
      if (whoopOn) tiles.push(metric('Recovery', (whoop.recovery ?? '—') + '%'), metric('HRV', whoop.hrv ? Math.round(whoop.hrv) + ' ms' : '—'), metric('Resting HR', (whoop.resting_hr ?? '—') + ' bpm'), metric('Sleep', (whoop.sleep_performance ?? '—') + '%'));
      if (ouraOn) tiles.push(metric('Readiness', oura.readiness ?? '—'), metric('Sleep score', oura.sleep_score ?? '—'));
      bodyEl.innerHTML = `<div class="vitals-metric-grid">${tiles.join('')}</div>`;
      return;
    }
    // configured-but-not-connected, or not configured → honest CTA
    metaEl.textContent = 'NOT CONNECTED';
    bodyEl.innerHTML = `
      <p class="muted" style="padding:2px 2px 12px">No wearable is connected, so there's nothing real to show here yet. Connect one to see live recovery, HRV, resting heart rate and sleep.</p>
      <div class="row gap-sm">
        ${cfg.whoop ? `<a class="btn btn-sm btn-primary" href="/api/whoop-start">🔗 Connect Whoop</a>` : ''}
        ${cfg.oura ? `<a class="btn btn-sm btn-primary" href="/api/oura-start">🔗 Connect Oura</a>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="open-conn">Open Connections →</button>
      </div>`;
    const b = bodyEl.querySelector('[data-act="open-conn"]');
    if (b) b.addEventListener('click', () => H.show('connect'));
  }
  function metric(label, val) {
    return `<div class="vitals-metric"><b>${esc(val)}</b><span>${esc(label)}</span></div>`;
  }

  H.register({ id: 'vitals', label: 'Vitals', icon: '💗', scope: 'personal', render });
})();
