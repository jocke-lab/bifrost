/* ============================================================================
   vitals.js — Vitals. A REAL per-employee health tracker.
   ----------------------------------------------------------------------------
   This is the signed-in employee's OWN, PRIVATE data (the hub edge function
   `company` enforces per-user isolation on vitals/*). Nothing here is shared
   with the team and nothing is invented — recovery / sleep / steps only show
   what a connected wearable or your own manual entries report.

   Backed by the hub via window.DB.company('vitals/...'):
     · GET/PUT  vitals/body        — weight/height/age/sex/activity/goal (BMR)
     · GET      vitals/today       — steps · active kcal · dynamic budget · sleep
     · POST     vitals/samples     — log steps / weight / etc.
     · GET/POST/DELETE vitals/workouts
     · GET      vitals/samples?kind=&from=  — history (grouped by day in JS)
     · GET      vitals/connections — which wearables are linked
   Plus the serverless wearable rails reused from Connections:
     · /api/whoop-start · /api/oura-start  (per-user OAuth)
     · POST /api/vitals-sync               (pull today's metrics into samples)

   If the hub / API isn't reachable (local static preview, signed-out), every
   panel degrades gracefully: the Mifflin-St Jeor calculator + manual entry
   work fully offline against localStorage('helm.body'), which the Dashboard
   card also reads (single source of truth).
   ========================================================================== */
(function () {
  const H = window.HELM;
  const DB = window.DB;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n).toLocaleString('en-US');

  /* ── activity ladder (multiplier + the share of TDEE-above-BMR that is
        "baked-in" daily NEAT/exercise — used so logged active calories don't
        double-count what the multiplier already assumes). ──────────────────── */
  const ACT = [
    { key: 'sedentary', mult: 1.20, label: 'Sedentary', sub: 'desk · little exercise' },
    { key: 'light', mult: 1.375, label: 'Light', sub: '1–3 workouts / week' },
    { key: 'moderate', mult: 1.55, label: 'Moderate', sub: '3–5 workouts / week' },
    { key: 'active', mult: 1.725, label: 'Active', sub: '6–7 workouts / week' },
    { key: 'athlete', mult: 1.90, label: 'Athlete', sub: 'twice-daily / physical job' }
  ];
  const GOALS = [
    { key: 'cut', label: 'Cut', delta: -500, sub: 'lose · −0.45 kg/wk' },
    { key: 'maintain', label: 'Maintain', delta: 0, sub: 'hold weight' },
    { key: 'gain', label: 'Gain', delta: 350, sub: 'build · +0.3 kg/wk' }
  ];
  const goalIndex = k => Math.max(0, GOALS.findIndex(g => g.key === k));
  const actIndex = k => { const i = ACT.findIndex(a => a.key === k); return i < 0 ? 2 : i; };

  /* ── physiology ──────────────────────────────────────────────────────────
     BMR (Mifflin-St Jeor): 10·kg + 6.25·cm − 5·age + (male +5 / female −161). */
  const calcBMR = b => Math.round(10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + (b.sex === 'female' ? -161 : 5));
  const calcBMI = b => +(b.weightKg / Math.pow(b.heightCm / 100, 2)).toFixed(1);

  /* ── DYNAMIC CALORIE BUDGET (the headline) ─────────────────────────────────
       budget = TDEE  +  goalDelta  +  movementBonus

       where:
         TDEE          = BMR × activityMult                 (maintenance)
         goalDelta     = cut −500 · maintain 0 · gain +350
         movementBonus = max(0, activeKcal − bakedInActive) (only the EXTRA
                         movement beyond what the activity level already assumes,
                         so we never double-count)
         bakedInActive = (TDEE − BMR) × BAKED_FRACTION
         activeKcal    = the API's calories_active if present, else estimated
                         from steps:  steps × kcalPerStep,
                         kcalPerStep  = weightKg × KCAL_PER_STEP_PER_KG
       The budget visibly RISES as steps / active calories climb — 10 000 steps
       adds a clear chunk on top of maintenance. */
  const BAKED_FRACTION = 0.55;       // ~55% of (TDEE−BMR) is assumed daily NEAT/movement
  const KCAL_PER_STEP_PER_KG = 0.00045; // ≈ 0.037 kcal/step at 82 kg

  function kcalPerStep(weightKg) { return (weightKg || 75) * KCAL_PER_STEP_PER_KG; }

  function computeBudget(body, today) {
    const a = ACT[body.activity] || ACT[2];
    const bmr = (body.weightKg > 0 && body.heightCm > 0 && body.age > 0) ? calcBMR(body) : null;
    if (bmr == null) return null;
    const tdee = Math.round(bmr * a.mult);
    const goal = GOALS[goalIndex(body.goal || 'maintain')];
    const steps = (today && Number(today.steps)) || 0;
    // prefer the API's measured active calories; otherwise estimate from steps
    let activeKcal = (today && Number(today.calories_active)) || 0;
    let activeFromSteps = false;
    if (!activeKcal && steps) { activeKcal = Math.round(steps * kcalPerStep(body.weightKg)); activeFromSteps = true; }
    const bakedInActive = Math.round((tdee - bmr) * BAKED_FRACTION);
    const movementBonus = Math.max(0, Math.round(activeKcal - bakedInActive));
    const budget = tdee + goal.delta + movementBonus;
    return { bmr, tdee, goal, steps, activeKcal, activeFromSteps, bakedInActive, movementBonus, budget, mult: a.mult, actLabel: a.label };
  }

  /* ── localStorage mirror (so the Dashboard card keeps working offline) ───── */
  function loadLocalBody() {
    try { const b = JSON.parse(localStorage.getItem('helm.body')); return (b && typeof b === 'object') ? b : {}; }
    catch (e) { return {}; }
  }
  function mirrorBody(body) {
    // body uses activity as an INDEX (0..4) for the Dashboard's ACT[] table.
    const out = {
      weightKg: body.weightKg, heightCm: body.heightCm, age: body.age,
      sex: body.sex, activity: body.activity, goal: body.goal
    };
    try { localStorage.setItem('helm.body', JSON.stringify(out)); } catch (e) {}
    const u = (H.session && H.session.user);
    if (u) u.body = Object.assign({}, u.body, out);
    try { document.dispatchEvent(new CustomEvent('helm:body')); } catch (e) {}
  }

  /* ── serverless wearable rails (same pattern as connect.js) ──────────────── */
  async function api(path, opts) {
    opts = opts || {};
    try {
      let token = null;
      try { const s = DB && DB.auth ? await DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch(path, Object.assign({}, opts, { headers }));
      const t = await r.text();
      try { return JSON.parse(t); } catch (e) { return { _offline: true }; }
    } catch (e) { return { _offline: true, error: e.message }; }
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */
  function render(root) {
    const localBody = loadLocalBody();
    // working copy (hub will overwrite once loaded)
    const state = {
      body: {
        weightKg: localBody.weightKg ?? null,
        heightCm: localBody.heightCm ?? null,
        age: localBody.age ?? null,
        sex: localBody.sex || 'male',
        activity: Number.isInteger(localBody.activity) ? localBody.activity : 2,
        goal: localBody.goal || 'maintain'
      },
      today: null,
      online: false   // flips true once a hub call succeeds
    };
    const who = (H.session && H.session.user) || {};

    root.innerHTML = `
      <div class="view-head">
        <div class="vh-title">
          <div class="vh-ico">❤️</div>
          <div>
            <h1>Vitals</h1>
            <p>Your private health tracker — body &amp; metabolism, a movement-aware calorie budget, workouts and live wearables.</p>
          </div>
        </div>
        <div class="vh-actions">
          <span class="vitals-who" title="This is your own data — nobody else on the team can see it.">🔒 ${esc(who.name || 'You')} · private</span>
          <button class="btn btn-sm" id="vit-sync">⟳ Sync now</button>
        </div>
      </div>

      <div class="vitals-banner" id="vit-banner" hidden></div>

      <!-- ── TODAY HUD ─────────────────────────────────────────────────── -->
      <div class="card vitals-hud" id="vit-hud">
        <div class="card-head">
          <h3><span class="hico">🛰️</span> Today</h3>
          <span class="ch-meta" id="vit-hud-meta">LOADING…</span>
        </div>
        <div id="vit-hud-body"><div class="nft-loading" style="padding:20px"><span class="nft-spin"></span> Reading today…</div></div>
      </div>

      <!-- ── BODY & METABOLISM + BMI ───────────────────────────────────── -->
      <div class="grid cols-3" style="margin:var(--gap) 0">
        <div class="card span-2 vitals-body">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Body &amp; Metabolism</h3>
            <span class="ch-meta" id="vit-body-meta">MIFFLIN-ST JEOR · LIVE</span>
          </div>
          <div class="vitals-body-grid">
            <div class="vitals-inputs">
              <label class="vitals-field">
                <span class="vitals-field-k">Weight</span>
                <span class="vitals-field-in"><input type="number" data-b="weightKg" min="35" max="300" step="0.1" placeholder="—" value="${state.body.weightKg ?? ''}"><em>kg</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Height</span>
                <span class="vitals-field-in"><input type="number" data-b="heightCm" min="120" max="230" step="1" placeholder="—" value="${state.body.heightCm ?? ''}"><em>cm</em></span>
              </label>
              <label class="vitals-field">
                <span class="vitals-field-k">Age</span>
                <span class="vitals-field-in"><input type="number" data-b="age" min="14" max="100" step="1" placeholder="—" value="${state.body.age ?? ''}"><em>yr</em></span>
              </label>
              <div class="vitals-field">
                <span class="vitals-field-k">Sex</span>
                <div class="vitals-seg" data-seg="sex">
                  <button data-sex="male" class="${state.body.sex === 'male' ? 'active' : ''}">Male</button>
                  <button data-sex="female" class="${state.body.sex === 'female' ? 'active' : ''}">Female</button>
                </div>
              </div>
              <div class="vitals-field vitals-field--full">
                <span class="vitals-field-k">Activity level <em class="vitals-actmult"></em></span>
                <div class="vitals-act" data-seg="act"></div>
              </div>
              <div class="vitals-field vitals-field--full">
                <span class="vitals-field-k">Goal</span>
                <div class="vitals-seg vitals-seg--goal" data-seg="goal"></div>
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
                  <div class="stat-row"><span class="sr-label">Cut (−500)</span><span class="sr-val" data-out="cut">—</span></div>
                  <div class="stat-row"><span class="sr-label">Gain (+350)</span><span class="sr-val" data-out="gain">—</span></div>
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

      <!-- ── LOG + WORKOUTS ────────────────────────────────────────────── -->
      <div class="grid cols-2" style="margin-bottom:var(--gap)">
        <div class="card vitals-log">
          <div class="card-head">
            <h3><span class="hico">✍️</span> Quick log</h3>
            <span class="ch-meta">→ HUB</span>
          </div>
          <div class="vitals-quick">
            <div class="vitals-quick-row">
              <span class="vitals-field-in"><input type="number" id="vit-q-steps" min="0" step="100" placeholder="Add steps"><em>steps</em></span>
              <button class="btn btn-sm btn-primary" data-q="steps">Add</button>
            </div>
            <div class="vitals-quick-row">
              <span class="vitals-field-in"><input type="number" id="vit-q-weight" min="0" step="0.1" placeholder="Log weight"><em>kg</em></span>
              <button class="btn btn-sm btn-primary" data-q="weight">Log</button>
            </div>
          </div>
          <hr class="vitals-hr">
          <div class="card-head" style="margin-bottom:10px">
            <h3 style="font-size:13px"><span class="hico">🏋️</span> Log a workout</h3>
          </div>
          <div class="vitals-wk-form">
            <select class="nft-in" id="vit-wk-type">
              <option value="run">Run</option><option value="walk">Walk</option>
              <option value="ride">Ride</option><option value="strength">Strength</option>
              <option value="swim">Swim</option><option value="hiit">HIIT</option>
              <option value="yoga">Yoga</option><option value="row">Row</option>
              <option value="other">Other</option>
            </select>
            <span class="vitals-field-in"><input type="number" id="vit-wk-dur" min="1" step="1" placeholder="Duration"><em>min</em></span>
            <span class="vitals-field-in"><input type="number" id="vit-wk-cal" min="0" step="10" placeholder="Calories"><em>kcal</em></span>
            <span class="vitals-field-in"><input type="number" id="vit-wk-dist" min="0" step="0.1" placeholder="Distance"><em>km</em></span>
            <input class="nft-in vitals-wk-note" id="vit-wk-note" placeholder="Note (optional)">
            <button class="btn btn-sm btn-primary vitals-wk-add" data-q="workout">＋ Add workout</button>
          </div>
        </div>

        <div class="card vitals-workouts">
          <div class="card-head">
            <h3><span class="hico">📋</span> Recent workouts</h3>
            <span class="ch-meta" id="vit-wk-meta">—</span>
          </div>
          <div id="vit-wk-list"><div class="nft-loading" style="padding:16px"><span class="nft-spin"></span> Loading…</div></div>
        </div>
      </div>

      <!-- ── HISTORY ───────────────────────────────────────────────────── -->
      <div class="grid cols-2" style="margin-bottom:var(--gap)">
        <div class="card vitals-hist">
          <div class="card-head">
            <h3><span class="hico">📊</span> Steps · last 14 days</h3>
            <span class="ch-meta" id="vit-steps-meta">—</span>
          </div>
          <div id="vit-steps-chart" class="vitals-chart"><div class="nft-loading" style="padding:16px"><span class="nft-spin"></span></div></div>
        </div>
        <div class="card vitals-hist">
          <div class="card-head">
            <h3><span class="hico">🌙</span> Recovery &amp; sleep trend</h3>
            <span class="ch-meta" id="vit-trend-meta">—</span>
          </div>
          <div id="vit-trend-chart" class="vitals-chart"><div class="nft-loading" style="padding:16px"><span class="nft-spin"></span></div></div>
        </div>
      </div>

      <!-- ── WEARABLES ─────────────────────────────────────────────────── -->
      <div class="card vitals-devices" id="vit-wear">
        <div class="card-head">
          <h3><span class="hico">⌚</span> Wearables</h3>
          <span class="ch-meta" id="vit-wear-meta">CHECKING…</span>
        </div>
        <div id="vit-wear-body"><div class="nft-loading" style="padding:16px"><span class="nft-spin"></span> Checking connections…</div></div>
      </div>`;

    /* ── activity + goal segmented controls ─────────────────────────────── */
    const actWrap = root.querySelector('[data-seg="act"]');
    ACT.forEach((a, i) => actWrap.appendChild(H.el(
      `<button data-act-idx="${i}" class="${i === state.body.activity ? 'active' : ''}" title="${esc(a.sub)}"><b>${a.label}</b><small>×${a.mult}</small></button>`)));
    const goalWrap = root.querySelector('[data-seg="goal"]');
    GOALS.forEach(g => goalWrap.appendChild(H.el(
      `<button data-goal="${g.key}" class="${g.key === state.body.goal ? 'active' : ''}" title="${esc(g.sub)}">${g.label}</button>`)));

    const out = k => root.querySelector(`[data-out="${k}"]`);
    const complete = () => state.body.weightKg > 0 && state.body.heightCm > 0 && state.body.age > 0;

    /* ── recompute the metabolism panel (instant, JS) ───────────────────── */
    function recompute() {
      const a = ACT[state.body.activity] || ACT[2];
      root.querySelector('.vitals-actmult').textContent = '×' + a.mult;
      if (!complete()) {
        ['bmr', 'tdee', 'cut', 'gain', 'bmi', 'lean', 'water', 'bmirange'].forEach(k => { if (out(k)) out(k).textContent = '—'; });
        out('actlabel').textContent = a.label.toLowerCase();
        out('bmicat').textContent = '—';
        out('bmicat').className = 'vitals-bmi-cat';
        out('formula').textContent = 'Enter your weight, height and age to compute BMR & TDEE.';
        renderHud();   // HUD shows the "fill in your stats" hint
        return;
      }
      const bmr = calcBMR(state.body);
      const tdee = Math.round(bmr * a.mult);
      out('bmr').textContent = num(bmr) + ' kcal';
      out('tdee').textContent = num(tdee) + ' kcal';
      out('actlabel').textContent = a.label.toLowerCase() + ' ×' + a.mult;
      out('cut').textContent = num(tdee - 500) + ' kcal';
      out('gain').textContent = num(tdee + 350) + ' kcal';

      const bmi = calcBMI(state.body);
      const cat = bmi < 18.5 ? { l: 'Underweight', s: 'warn' } : bmi < 25 ? { l: 'Normal', s: 'ok' } : bmi < 30 ? { l: 'Overweight', s: 'warn' } : { l: 'Obese', s: 'bad' };
      out('bmi').textContent = bmi;
      out('bmicat').textContent = cat.l;
      out('bmicat').className = 'vitals-bmi-cat vitals-' + cat.s;
      out('bmimark').style.left = (Math.max(0, Math.min(1, (bmi - 12) / (42 - 12))) * 100) + '%';
      const hMin = (18.5 * (state.body.heightCm / 100) ** 2).toFixed(0);
      const hMax = (24.9 * (state.body.heightCm / 100) ** 2).toFixed(0);
      out('bmirange').textContent = hMin + '–' + hMax + ' kg';
      const sexF = state.body.sex === 'female';
      const lean = sexF ? 0.252 * state.body.weightKg + 0.473 * state.body.heightCm - 48.3 : 0.407 * state.body.weightKg + 0.267 * state.body.heightCm - 19.2;
      out('lean').textContent = lean.toFixed(1) + ' kg';
      out('water').textContent = ((sexF ? 0.50 : 0.58) * state.body.weightKg).toFixed(1) + ' L';
      out('formula').textContent = `BMR = 10·${state.body.weightKg} + 6.25·${state.body.heightCm} − 5·${state.body.age} ${sexF ? '− 161' : '+ 5'} = ${bmr}   →   TDEE = ${bmr} × ${a.mult} = ${num(tdee)} kcal`;
      renderHud();
    }

    /* ── persist body to the hub (source of truth) + mirror to localStorage ─ */
    let saveT = null;
    function persistBody() {
      mirrorBody(state.body);   // instant — Dashboard + offline keep working
      clearTimeout(saveT);
      saveT = setTimeout(async () => {
        if (!DB || !DB.company) return;
        const a = ACT[state.body.activity] || ACT[2];
        const res = await DB.company('vitals/body', {
          method: 'PUT',
          body: {
            weight_kg: state.body.weightKg, height_cm: state.body.heightCm,
            age: state.body.age, sex: state.body.sex,
            activity: a.key, goal: state.body.goal
          }
        });
        if (res && res.ok) {
          state.online = true;
          // server may recompute bmr — refresh today's budget from the hub
          loadToday();
        } else if (res && (res.unauthorized || res._offline)) {
          // silent — local calculator remains the source of truth
        } else if (res && res.error) {
          H.toast('Vitals: ' + res.error, 'warn');
        }
      }, 450);
    }

    /* ── input wiring ───────────────────────────────────────────────────── */
    root.querySelectorAll('input[data-b]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.getAttribute('data-b');
      const v = parseFloat(inp.value);
      state.body[k] = isNaN(v) ? null : v;
      recompute(); persistBody();
    }));
    root.querySelectorAll('[data-sex]').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('[data-sex]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.body.sex = b.getAttribute('data-sex');
      recompute(); persistBody();
    }));
    actWrap.querySelectorAll('[data-act-idx]').forEach(b => b.addEventListener('click', () => {
      actWrap.querySelectorAll('[data-act-idx]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.body.activity = parseInt(b.getAttribute('data-act-idx'), 10);
      recompute(); persistBody();
    }));
    goalWrap.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => {
      goalWrap.querySelectorAll('[data-goal]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.body.goal = b.getAttribute('data-goal');
      recompute(); persistBody();
    }));

    /* ── TODAY HUD render ───────────────────────────────────────────────── */
    function renderHud() {
      const bodyEl = root.querySelector('#vit-hud-body');
      const metaEl = root.querySelector('#vit-hud-meta');
      if (!bodyEl) return;

      if (!complete()) {
        metaEl.textContent = 'SET UP';
        bodyEl.innerHTML = `<p class="muted" style="padding:6px 2px">Add your <b>weight, height and age</b> below to unlock your live metabolism and a movement-aware daily calorie budget.</p>`;
        return;
      }

      const b = computeBudget(state.body, state.today);
      const t = state.today || {};
      metaEl.textContent = state.online ? 'LIVE · YOUR DATA' : (t._hint || 'CALCULATED');

      const steps = b.steps || 0;
      const stepGoal = 10000;
      const stepPct = Math.min(100, Math.round(steps / stepGoal * 100));
      const burned = (t.calories_burned != null) ? Math.round(t.calories_burned) : (b.bmr + b.activeKcal);

      // recovery ring (only if a wearable reported it)
      const recovery = t.recovery != null ? Math.round(t.recovery) : null;
      const sleepScore = t.sleep_score != null ? Math.round(t.sleep_score) : null;
      const sleepHrs = t.sleep_hours != null ? (+t.sleep_hours).toFixed(1) : null;
      const hrv = t.hrv != null ? Math.round(t.hrv) : null;
      const rhr = t.resting_hr != null ? Math.round(t.resting_hr) : null;

      const stepNote = b.activeFromSteps
        ? `≈ ${num(b.activeKcal)} kcal active (est. from steps)`
        : `${num(b.activeKcal)} kcal active (measured)`;

      bodyEl.innerHTML = `
        <div class="vitals-hud-grid">
          <!-- budget hero -->
          <div class="vitals-hud-budget">
            <div class="vitals-hud-rings">
              <div class="vitals-ring vitals-ring--sm">
                ${H.charts.donut(
                  [{ label: 'Steps', value: Math.max(1, steps), color: 'var(--accent1)' }, { label: 'To 10k', value: Math.max(0, stepGoal - steps) }],
                  { size: 150, thickness: 16, center: { value: num(steps), label: 'STEPS' } }
                )}
              </div>
            </div>
            <div class="vitals-hud-budget-main">
              <div class="vitals-result-k">DYNAMIC CALORIE BUDGET</div>
              <div class="vitals-hud-budget-v">${num(b.budget)}<small>kcal eat today</small></div>
              <div class="vitals-budget-bd">
                <span class="vitals-bd-pill">TDEE ${num(b.tdee)}</span>
                <span class="vitals-bd-op">${b.goal.delta < 0 ? '−' : b.goal.delta > 0 ? '+' : '±'}</span>
                <span class="vitals-bd-pill ${b.goal.delta < 0 ? 'is-cut' : b.goal.delta > 0 ? 'is-gain' : ''}">${b.goal.label} ${b.goal.delta ? num(Math.abs(b.goal.delta)) : 0}</span>
                <span class="vitals-bd-op">+</span>
                <span class="vitals-bd-pill is-move">Move +${num(b.movementBonus)}</span>
              </div>
              <p class="vitals-hud-tip">${stepPct >= 100
                ? `🎉 You hit 10,000 steps — that added <b>+${num(b.movementBonus)} kcal</b> to today's budget.`
                : `Every step earns calories back. Reaching <b>10,000 steps</b> would raise today's budget by about <b>+${num(stepBonusTo(state.body, b, stepGoal))} kcal</b>.`}</p>
            </div>
          </div>

          <!-- today's tiles -->
          <div class="vitals-hud-tiles">
            <div class="vitals-tile"><b>${num(burned)}</b><span>kcal burned</span></div>
            <div class="vitals-tile"><b>${num(b.bmr)}</b><span>BMR rest</span></div>
            <div class="vitals-tile"><b>${stepPct}%</b><span>of 10k steps</span></div>
            ${recovery != null ? `<div class="vitals-tile vitals-tile--ok"><b>${recovery}%</b><span>recovery</span></div>` : ''}
            ${sleepScore != null ? `<div class="vitals-tile"><b>${sleepScore}</b><span>sleep score</span></div>` : ''}
            ${sleepHrs != null ? `<div class="vitals-tile"><b>${sleepHrs}h</b><span>slept</span></div>` : ''}
            ${hrv != null ? `<div class="vitals-tile"><b>${hrv}</b><span>HRV ms</span></div>` : ''}
            ${rhr != null ? `<div class="vitals-tile"><b>${rhr}</b><span>resting HR</span></div>` : ''}
          </div>
        </div>
        <div class="vitals-hud-foot muted">${stepNote}.
          ${recovery == null && sleepScore == null
            ? `No wearable connected — recovery, HRV and sleep appear here once you <a href="#" data-act="open-conn">connect Whoop or Oura</a>.`
            : ''}</div>`;
      const oc = bodyEl.querySelector('[data-act="open-conn"]');
      if (oc) oc.addEventListener('click', e => { e.preventDefault(); H.show('connect'); });
    }

    // marginal budget gain from reaching `targetSteps` (for the tip copy)
    function stepBonusTo(body, b, targetSteps) {
      const a = ACT[body.activity] || ACT[2];
      const tdee = Math.round(b.bmr * a.mult);
      const baked = Math.round((tdee - b.bmr) * BAKED_FRACTION);
      const activeAt = Math.round(targetSteps * kcalPerStep(body.weightKg));
      const futureBonus = Math.max(0, activeAt - baked);
      return Math.max(0, futureBonus - b.movementBonus);
    }

    /* ── HUB LOADERS ────────────────────────────────────────────────────── */
    async function loadBodyFromHub() {
      if (!DB || !DB.company) return;
      const res = await DB.company('vitals/body');
      if (res && res.ok && res.body) {
        state.online = true;
        const sb = res.body;
        if (sb.weight_kg != null) state.body.weightKg = +sb.weight_kg;
        if (sb.height_cm != null) state.body.heightCm = +sb.height_cm;
        if (sb.age != null) state.body.age = +sb.age;
        if (sb.sex) state.body.sex = sb.sex;
        if (sb.activity) state.body.activity = actIndex(sb.activity);
        if (sb.goal) state.body.goal = sb.goal;
        // reflect into inputs
        const set = (k, v) => { const i = root.querySelector(`input[data-b="${k}"]`); if (i && v != null) i.value = v; };
        set('weightKg', state.body.weightKg); set('heightCm', state.body.heightCm); set('age', state.body.age);
        root.querySelectorAll('[data-sex]').forEach(x => x.classList.toggle('active', x.getAttribute('data-sex') === state.body.sex));
        actWrap.querySelectorAll('[data-act-idx]').forEach(x => x.classList.toggle('active', +x.getAttribute('data-act-idx') === state.body.activity));
        goalWrap.querySelectorAll('[data-goal]').forEach(x => x.classList.toggle('active', x.getAttribute('data-goal') === state.body.goal));
        root.querySelector('#vit-body-meta').textContent = 'MIFFLIN-ST JEOR · HUB';
        mirrorBody(state.body);
        recompute();
      } else if (res && res.unauthorized) {
        root.querySelector('#vit-body-meta').textContent = 'LOCAL · SIGN IN TO SYNC';
      } else if (res && res._offline) {
        root.querySelector('#vit-body-meta').textContent = 'OFFLINE · LOCAL CALCULATOR';
      }
    }

    async function loadToday() {
      if (!DB || !DB.company) { renderHud(); return; }
      const res = await DB.company('vitals/today');
      if (res && res.ok) {
        state.online = true;
        state.today = res;
      } else if (res && (res.unauthorized || res._offline)) {
        state.today = { _hint: res.unauthorized ? 'LOCAL · SIGN IN TO SYNC' : 'OFFLINE · LOCAL' };
      } else {
        state.today = { _hint: 'CALCULATED' };
      }
      renderHud();
    }

    async function loadWorkouts() {
      const listEl = root.querySelector('#vit-wk-list');
      const metaEl = root.querySelector('#vit-wk-meta');
      if (!listEl) return;
      if (!DB || !DB.company) { listEl.innerHTML = offlineRow('Workouts sync when you are signed in on bifrostlkl.com.'); metaEl.textContent = 'LOCAL'; return; }
      const res = await DB.company('vitals/workouts');
      if (res && res.ok) {
        state.online = true;
        const wk = res.workouts || [];
        metaEl.textContent = wk.length + (wk.length === 1 ? ' LOGGED' : ' LOGGED');
        listEl.innerHTML = wk.length ? wk.map(workoutRow).join('') : `<div class="nft-locked">No workouts logged yet — add one on the left.</div>`;
        listEl.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteWorkout(btn.getAttribute('data-del'))));
      } else if (res && res.unauthorized) {
        metaEl.textContent = 'SIGN IN';
        listEl.innerHTML = offlineRow('Sign in on bifrostlkl.com to log and see your workouts.');
      } else {
        metaEl.textContent = 'OFFLINE';
        listEl.innerHTML = offlineRow('Workout logging is live on bifrostlkl.com.');
      }
    }
    const WK_ICO = { run: '🏃', walk: '🚶', ride: '🚴', strength: '🏋️', swim: '🏊', hiit: '🔥', yoga: '🧘', row: '🚣', other: '⚡' };
    function workoutRow(w) {
      const when = w.performed_at ? new Date(w.performed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
      const bits = [];
      if (w.duration_min) bits.push(w.duration_min + ' min');
      if (w.calories) bits.push(num(w.calories) + ' kcal');
      if (w.distance_m) bits.push((w.distance_m / 1000).toFixed(1) + ' km');
      return `<div class="vitals-wk-item">
        <div class="vitals-wk-ico">${WK_ICO[w.type] || '⚡'}</div>
        <div class="vitals-wk-main">
          <div class="vitals-wk-title">${esc((w.type || 'workout').replace(/^\w/, c => c.toUpperCase()))}${w.note ? ` · <span class="muted">${esc(w.note)}</span>` : ''}</div>
          <div class="vitals-wk-sub">${esc(bits.join(' · ') || '—')}${when ? ' · ' + esc(when) : ''}</div>
        </div>
        <button class="nft-adm-mini" data-nfc="deactivate" data-del="${esc(w.id)}" title="Delete">✕</button>
      </div>`;
    }
    async function deleteWorkout(id) {
      const res = await DB.company('vitals/workouts/' + encodeURIComponent(id), { method: 'DELETE' });
      if (res && res.ok) { H.toast('Workout removed', 'success'); loadWorkouts(); loadToday(); }
      else H.toast('Could not delete: ' + ((res && res.error) || 'offline'), 'warn');
    }

    async function loadHistory() {
      const stepsEl = root.querySelector('#vit-steps-chart');
      const trendEl = root.querySelector('#vit-trend-chart');
      const stepsMeta = root.querySelector('#vit-steps-meta');
      const trendMeta = root.querySelector('#vit-trend-meta');
      if (!DB || !DB.company) {
        stepsEl.innerHTML = offlineRow('Step history is live on bifrostlkl.com.'); stepsMeta.textContent = 'LOCAL';
        trendEl.innerHTML = offlineRow('Recovery & sleep history needs a wearable.'); trendMeta.textContent = 'LOCAL';
        return;
      }
      const fromISO = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
      const res = await DB.company('vitals/samples?from=' + fromISO);
      if (!res || !res.ok) {
        const msg = res && res.unauthorized ? 'Sign in on bifrostlkl.com to see your history.' : 'History is live on bifrostlkl.com.';
        stepsEl.innerHTML = offlineRow(msg); stepsMeta.textContent = res && res.unauthorized ? 'SIGN IN' : 'OFFLINE';
        trendEl.innerHTML = offlineRow(msg); trendMeta.textContent = res && res.unauthorized ? 'SIGN IN' : 'OFFLINE';
        return;
      }
      state.online = true;
      const samples = res.samples || [];
      // group by local day
      const days = lastNDays(14);
      const byKind = {};
      samples.forEach(s => {
        const day = (s.taken_at || '').slice(0, 10);
        (byKind[s.kind] = byKind[s.kind] || {});
        // sum steps/active, take latest for scores
        if (s.kind === 'steps' || s.kind === 'calories_active') byKind[s.kind][day] = (byKind[s.kind][day] || 0) + Number(s.value || 0);
        else byKind[s.kind][day] = Number(s.value || 0);
      });

      // STEPS bar chart
      const stepSeries = days.map(d => ({ label: d.lbl, value: Math.round((byKind.steps && byKind.steps[d.key]) || 0) }));
      const stepTotal = stepSeries.reduce((a, x) => a + x.value, 0);
      const stepDaysWith = stepSeries.filter(x => x.value > 0).length;
      if (stepDaysWith) {
        stepsMeta.textContent = num(Math.round(stepTotal / Math.max(1, stepDaysWith))) + ' AVG';
        stepsEl.innerHTML = H.charts.bars(stepSeries, { height: 150, warnAt: null });
      } else {
        stepsMeta.textContent = 'NO DATA';
        stepsEl.innerHTML = `<div class="nft-locked">No step history yet. Log steps on the left or sync a wearable, then this fills in over the next days.</div>`;
      }

      // RECOVERY / SLEEP trend (area)
      const recSeries = days.map(d => (byKind.recovery && byKind.recovery[d.key]) || 0);
      const sleepSeries = days.map(d => (byKind.sleep_score && byKind.sleep_score[d.key]) || 0);
      const hasRec = recSeries.some(v => v > 0);
      const hasSleep = sleepSeries.some(v => v > 0);
      if (hasRec || hasSleep) {
        trendMeta.textContent = (hasRec ? 'RECOVERY' : 'SLEEP') + (hasRec && hasSleep ? ' + SLEEP' : '');
        const primary = hasRec ? recSeries : sleepSeries;
        trendEl.innerHTML = H.charts.area(primary, { height: 150, v2: (hasRec && hasSleep) ? sleepSeries : null, labels: [days[0].lbl, days[days.length - 1].lbl] }) +
          `<div class="vitals-legend">${hasRec ? '<span class="vitals-leg hr"><i></i>Recovery</span>' : ''}${hasRec && hasSleep ? '<span class="vitals-leg hrv"><i></i>Sleep</span>' : ''}</div>`;
      } else {
        trendMeta.textContent = 'NO WEARABLE';
        trendEl.innerHTML = `<div class="nft-locked">Connect Whoop or Oura to chart recovery, HRV and sleep over time. Nothing is invented here.</div>`;
      }
    }

    /* ── wearable connections ───────────────────────────────────────────── */
    async function loadWearables() {
      const bodyEl = root.querySelector('#vit-wear-body');
      const metaEl = root.querySelector('#vit-wear-meta');
      if (!bodyEl) return;

      // prefer the per-user connection list from the hub; fall back to the
      // serverless wearables HUD (config) used by Connections.
      let connections = null;
      if (DB && DB.company) {
        const c = await DB.company('vitals/connections');
        if (c && c.ok && Array.isArray(c.connections)) { connections = c.connections; state.online = true; }
      }
      const hud = await api('/api/wearables-hud');
      const cfg = (hud && hud.configured) || {};

      const status = prov => {
        if (connections) { const f = connections.find(x => x.provider === prov); return f ? f.status : null; }
        if (hud && hud[prov]) return hud[prov].connected ? 'connected' : 'configured';
        return null;
      };
      const wStat = status('whoop'), oStat = status('oura');
      const connectedCount = [wStat, oStat].filter(s => s === 'connected').length;

      if (hud && hud._offline && !connections) {
        metaEl.textContent = 'OFFLINE';
        bodyEl.innerHTML = `<p class="muted" style="padding:4px 2px 0">Wearable OAuth is live on <b>bifrostlkl.com</b> — it isn't reachable in this local preview. The calculator, manual logging and your budget all work without a wearable.</p>`;
        return;
      }
      metaEl.textContent = connectedCount ? connectedCount + ' CONNECTED' : 'NONE CONNECTED';

      const card = (name, key, env) => {
        const st = key === 'whoop' ? wStat : oStat;
        const on = st === 'connected';
        const conf = on || st === 'configured' || cfg[key];
        let action;
        if (on) action = `<span class="vitals-dev-state">● Connected — syncing your data</span>`;
        else if (conf) action = `<a class="btn btn-sm btn-primary" href="/api/${key}-start">🔗 Connect ${name}</a>`;
        else action = `<span class="vitals-dev-state muted">needs <code>${env}</code> in Vercel</span>`;
        return `<div class="vitals-dev ${on ? 'vitals-dev--on' : ''}" style="--da:var(--accent1)">
          <div class="vitals-dev-ico">${key === 'whoop' ? '🟢' : '💍'}</div>
          <div class="vitals-dev-body">
            <div class="vitals-dev-name">${name}</div>
            <div class="vitals-dev-sub">${on ? 'Recovery · sleep · HRV · resting HR' : key === 'whoop' ? 'Recovery, strain & sleep' : 'Readiness & sleep'}</div>
            <div style="margin-top:7px">${action}</div>
          </div>
        </div>`;
      };

      bodyEl.innerHTML = `
        <div class="vitals-dev-grid">
          ${card('Whoop', 'whoop', 'WHOOP_CLIENT_ID')}
          ${card('Oura Ring', 'oura', 'OURA_CLIENT_ID')}
        </div>
        <p class="vitals-dev-note muted">Connecting is a per-user OAuth — your wearable data is private to you. After connecting, hit <b>Sync now</b> to pull today's steps, recovery and sleep. You can also link providers under <a href="#" data-act="open-conn"><b>Connections → Wearables</b></a>.</p>`;
      const oc = bodyEl.querySelector('[data-act="open-conn"]');
      if (oc) oc.addEventListener('click', e => { e.preventDefault(); H.show('connect'); });
    }

    /* ── quick-log + workout handlers ───────────────────────────────────── */
    async function postSamples(samples, label) {
      if (!DB || !DB.company) { H.toast('Live on bifrostlkl.com — sign in to log.', 'warn'); return false; }
      const res = await DB.company('vitals/samples', { method: 'POST', body: { samples } });
      if (res && res.ok) { H.toast(label + ' logged', 'success'); state.online = true; return true; }
      if (res && res.unauthorized) { H.toast('Sign in on bifrostlkl.com to log.', 'warn'); return false; }
      H.toast('Could not log: ' + ((res && res.error) || 'offline'), 'warn'); return false;
    }

    root.querySelectorAll('[data-q]').forEach(btn => btn.addEventListener('click', async () => {
      const kind = btn.getAttribute('data-q');
      if (kind === 'steps') {
        const inp = root.querySelector('#vit-q-steps'); const v = parseInt(inp.value, 10);
        if (!v || v <= 0) return H.toast('Enter a step count', 'warn');
        if (await postSamples([{ kind: 'steps', value: v, unit: 'steps', device_source: 'manual' }], num(v) + ' steps')) {
          inp.value = ''; loadToday(); loadHistory();
        }
      } else if (kind === 'weight') {
        const inp = root.querySelector('#vit-q-weight'); const v = parseFloat(inp.value);
        if (!v || v <= 0) return H.toast('Enter a weight', 'warn');
        if (await postSamples([{ kind: 'weight', value: v, unit: 'kg', device_source: 'manual' }], v + ' kg')) {
          inp.value = '';
          // a fresh weight should update the calculator too
          state.body.weightKg = v;
          const wi = root.querySelector('input[data-b="weightKg"]'); if (wi) wi.value = v;
          recompute(); persistBody();
        }
      } else if (kind === 'workout') {
        const type = root.querySelector('#vit-wk-type').value;
        const dur = parseInt(root.querySelector('#vit-wk-dur').value, 10);
        const cal = parseInt(root.querySelector('#vit-wk-cal').value, 10);
        const distKm = parseFloat(root.querySelector('#vit-wk-dist').value);
        const note = root.querySelector('#vit-wk-note').value.trim();
        if (!dur && !cal && !distKm) return H.toast('Add at least a duration, calories or distance', 'warn');
        if (!DB || !DB.company) return H.toast('Live on bifrostlkl.com — sign in to log.', 'warn');
        const payload = { type };
        if (dur) payload.duration_min = dur;
        if (cal) payload.calories = cal;
        if (!isNaN(distKm) && distKm > 0) payload.distance_m = Math.round(distKm * 1000);
        if (note) payload.note = note;
        const res = await DB.company('vitals/workouts', { method: 'POST', body: payload });
        if (res && res.ok) {
          H.toast('Workout logged', 'success'); state.online = true;
          ['vit-wk-dur', 'vit-wk-cal', 'vit-wk-dist', 'vit-wk-note'].forEach(id => { const e = root.querySelector('#' + id); if (e) e.value = ''; });
          loadWorkouts(); loadToday();
        } else if (res && res.unauthorized) H.toast('Sign in on bifrostlkl.com to log.', 'warn');
        else H.toast('Could not log: ' + ((res && res.error) || 'offline'), 'warn');
      }
    }));

    /* ── Sync now ───────────────────────────────────────────────────────── */
    root.querySelector('#vit-sync').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; const orig = btn.textContent; btn.textContent = '⟳ Syncing…';
      const res = await api('/api/vitals-sync', { method: 'POST' });
      btn.disabled = false; btn.textContent = orig;
      if (res && res._offline) { H.toast('Wearable sync is live on bifrostlkl.com.', 'info'); return; }
      if (res && (res.ok || res.synced != null)) {
        const n = res.synced != null ? res.synced : '';
        H.toast('Synced' + (n !== '' ? ' ' + n + ' samples' : '') + ' from your wearables', 'success');
      } else if (res && res.error) {
        H.toast('Sync: ' + res.error, 'warn');
      } else {
        H.toast('Nothing to sync — connect a wearable first.', 'info');
      }
      loadToday(); loadHistory(); loadWearables();
    });

    /* ── kick everything off ────────────────────────────────────────────── */
    recompute();          // instant local calculator + HUD hint
    loadBodyFromHub();    // hub becomes source of truth if signed in
    loadToday();
    loadWorkouts();
    loadHistory();
    loadWearables();
  }

  /* ── small helpers ───────────────────────────────────────────────────── */
  function lastNDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      out.push({ key: d.toISOString().slice(0, 10), lbl: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }
    return out;
  }
  function offlineRow(msg) { return `<div class="nft-locked">${esc(msg)}</div>`; }

  H.register({ id: 'vitals', label: 'Vitals', icon: '❤️', scope: 'personal', render });
})();
