<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit } from '$lib/core/config.js';
  import {
    matrixMultiply, matrixTranspose, matrixInverseGauss,
    calculatePValue, calculateVIF, mean
  } from '$lib/core/utils.js';
  import { irrigationZones } from '$lib/stores/irrigationZones.js';

  // Variable selection
  const coreVars = ['P', 'K', 'pH', 'OM'];
  let selectedVars = [...coreVars];
  let includeIrrigation = false;
  let allAvailableVars = [];

  // Results
  let regressionResult = null;
  let running = false;
  let hasRun = false;

  // Predictor
  let showPredictor = false;
  let predictorInputs = {};
  let predictedYield = null;
  let predictionCI = null;

  // Get samples with yield data
  $: yieldSamples = $samples.filter(s =>
    s.yieldCorrelations && Object.keys(s.yieldCorrelations).length > 0
  );

  // Build data points
  $: dataPoints = buildDataPoints(yieldSamples);

  // Available variables (nutrients with enough data)
  $: allAvailableVars = getAvailableVars(dataPoints);

  // Check if irrigation zones exist and samples are tagged
  $: hasIrrigationData = $irrigationZones.length > 0 && dataPoints.some(p => p.irrigated === true);

  // Auto-disable irrigation toggle if no data
  $: if (!hasIrrigationData) includeIrrigation = false;

  // Data guidance
  $: nVars = selectedVars.length + (includeIrrigation ? 1 : 0);
  $: minObsNeeded = nVars * 10;
  $: usablePoints = countUsablePoints(dataPoints, selectedVars);
  $: dataGuidance = getDataGuidance(usablePoints, minObsNeeded);

  function buildDataPoints(sampleList) {
    const points = [];
    sampleList.forEach(s => {
      Object.entries(s.yieldCorrelations).forEach(([yr, yc]) => {
        const yieldValue = yc.yield || yc.avgYield;
        if (!yieldValue || yieldValue <= 0) return;
        const crop = (yc.crop || '').toLowerCase();
        let minY = 10, maxY = 500;
        if (crop.includes('corn')) { minY = 50; maxY = 350; }
        else if (crop.includes('soy')) { minY = 20; maxY = 100; }
        if (yieldValue < minY || yieldValue > maxY) return;
        points.push({ ...s, yieldValue, yieldYear: yr, crop: yc.crop || '' });
      });
    });
    return points;
  }

  function getAvailableVars(points) {
    if (points.length === 0) return [];
    const nutrientKeys = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId').map(n => n.key);
    return nutrientKeys.filter(key => {
      const validCount = points.filter(p => {
        const v = parseFloat(p[key]);
        return !isNaN(v) && v !== null;
      }).length;
      return validCount >= 10;
    });
  }

  function countUsablePoints(points, vars) {
    const allVars = includeIrrigation ? [...vars, '__irrigated'] : vars;
    return points.filter(p => {
      for (const v of allVars) {
        if (v === '__irrigated') continue; // Binary: always available
        const val = parseFloat(p[v]);
        if (isNaN(val) || val === null || val === undefined) return false;
      }
      return true;
    }).length;
  }

  function getDataGuidance(n, minNeeded) {
    if (n < minNeeded) return { level: 'insufficient', color: 'bg-red-50 border-red-200 text-red-800', icon: '\u26D4' };
    if (n < minNeeded * 1.5) return { level: 'marginal', color: 'bg-amber-50 border-amber-200 text-amber-800', icon: '\u26A0\uFE0F' };
    return { level: 'good', color: 'bg-green-50 border-green-200 text-green-800', icon: '\u2705' };
  }

  function selectAll() {
    selectedVars = [...allAvailableVars];
  }

  function selectCore() {
    selectedVars = coreVars.filter(v => allAvailableVars.includes(v));
  }

  function toggleVar(varKey) {
    if (selectedVars.includes(varKey)) {
      selectedVars = selectedVars.filter(v => v !== varKey);
    } else {
      selectedVars = [...selectedVars, varKey];
    }
  }

  function runRegression() {
    running = true;
    hasRun = true;
    regressionResult = null;

    setTimeout(() => {
      try {
        const varsToUse = includeIrrigation ? [...selectedVars, '__irrigated'] : [...selectedVars];
        const result = performOLS(dataPoints, varsToUse);
        regressionResult = result;
      } catch (e) {
        regressionResult = { error: e.message };
      }
      running = false;
    }, 50);
  }

  function performOLS(points, vars) {
    // Filter to rows with all variables present
    const validPoints = points.filter(p => {
      for (const v of vars) {
        if (v === '__irrigated') continue; // Binary: always available (true/false)
        const val = parseFloat(p[v]);
        if (isNaN(val) || val === null || val === undefined) return false;
      }
      return true;
    });

    const n = validPoints.length;
    const k = vars.length + 1; // +1 for intercept

    if (n < k + 2) return { error: `Not enough data points (${n}) for ${vars.length} variables. Need at least ${k + 2}.` };

    // Build X matrix (with intercept) and y vector
    const X = [];
    const y = [];
    for (const p of validPoints) {
      const row = [1]; // intercept
      for (const v of vars) {
        if (v === '__irrigated') {
          row.push(p.irrigated ? 1 : 0);
        } else {
          row.push(parseFloat(p[v]));
        }
      }
      X.push(row);
      y.push(p.yieldValue);
    }

    // X'X
    const Xt = matrixTranspose(X);
    const XtX = matrixMultiply(Xt, X);

    // (X'X)^-1
    const XtXinv = matrixInverseGauss(XtX);
    if (!XtXinv) return { error: 'Matrix inversion failed. Variables may be perfectly collinear.' };

    // X'y
    const Xty = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < k; j++) {
        Xty[j] += X[i][j] * y[i];
      }
    }

    // beta = (X'X)^-1 X'y
    const beta = new Array(k).fill(0);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        beta[i] += XtXinv[i][j] * Xty[j];
      }
    }

    // Residuals and R²
    const yMean = mean(y);
    let ssTotal = 0, ssResid = 0;
    const residuals = [];
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let j = 0; j < k; j++) predicted += X[i][j] * beta[j];
      const residual = y[i] - predicted;
      residuals.push(residual);
      ssTotal += (y[i] - yMean) ** 2;
      ssResid += residual ** 2;
    }

    const r2 = ssTotal > 0 ? 1 - ssResid / ssTotal : 0;
    const adjR2 = 1 - ((1 - r2) * (n - 1)) / (n - k);
    const mse = ssResid / (n - k);
    const rmse = Math.sqrt(mse);

    // F-statistic
    const ssReg = ssTotal - ssResid;
    const dfReg = k - 1;
    const dfResid = n - k;
    const fStat = dfReg > 0 && dfResid > 0 ? (ssReg / dfReg) / (ssResid / dfResid) : 0;

    // Standard errors, t-values, p-values per coefficient
    const coefficients = [];
    for (let j = 0; j < k; j++) {
      const se = Math.sqrt(Math.max(0, mse * XtXinv[j][j]));
      const tVal = se > 0 ? beta[j] / se : 0;
      const pVal = calculatePValue(tVal, dfResid);
      const sig = pVal < 0.001 ? '***' : pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : pVal < 0.1 ? '.' : '';
      const varName = j === 0 ? '(Intercept)' : vars[j - 1];
      const varLabel = j === 0 ? '(Intercept)' : (varName === '__irrigated' ? 'Irrigated' : getNutrientName(varName));
      coefficients.push({
        name: varName,
        label: varLabel,
        coefficient: beta[j],
        stdError: se,
        tValue: tVal,
        pValue: pVal,
        sig,
        isIntercept: j === 0
      });
    }

    // VIF calculation (exclude intercept column)
    const XnoIntercept = validPoints.map(p => vars.map(v =>
      v === '__irrigated' ? (p.irrigated ? 1 : 0) : parseFloat(p[v])
    ));
    const vifs = calculateVIF(XnoIntercept, vars.length);
    const vifWarnings = [];
    for (let i = 0; i < vars.length; i++) {
      coefficients[i + 1].vif = vifs[i];
      if (vifs[i] > 5) {
        vifWarnings.push({ variable: vars[i] === '__irrigated' ? 'Irrigated' : getNutrientName(vars[i]), vif: vifs[i] });
      }
    }

    // Key findings
    const significantVars = coefficients
      .filter(c => !c.isIntercept && c.pValue < 0.05)
      .sort((a, b) => a.pValue - b.pValue);

    return {
      coefficients,
      r2,
      adjR2,
      fStat,
      rmse,
      n,
      k,
      dfResid,
      significantVars,
      vifWarnings,
      vars,
      beta,
      mse,
      XtXinv
    };
  }

  function predict() {
    if (!regressionResult || regressionResult.error) return;
    const { beta, vars, mse, XtXinv, n } = regressionResult;

    const xNew = [1];
    for (const v of vars) {
      const val = parseFloat(predictorInputs[v]);
      if (isNaN(val)) { predictedYield = null; return; }
      xNew.push(val);
    }

    let yHat = 0;
    for (let i = 0; i < xNew.length; i++) yHat += xNew[i] * beta[i];
    predictedYield = yHat;

    // 95% CI: yHat +/- t * se_pred
    // se_pred = sqrt(MSE * (1 + x'(X'X)^-1 x))
    let xCx = 0;
    for (let i = 0; i < xNew.length; i++) {
      for (let j = 0; j < xNew.length; j++) {
        xCx += xNew[i] * XtXinv[i][j] * xNew[j];
      }
    }
    const sePred = Math.sqrt(mse * (1 + xCx));
    // Approximate t critical value for 95% CI (df > 30 ≈ 1.96)
    const tCrit = regressionResult.dfResid > 30 ? 1.96 : 2.0;
    predictionCI = { low: yHat - tCrit * sePred, high: yHat + tCrit * sePred };
  }

  function getSignificanceColor(pValue) {
    if (pValue < 0.001) return 'bg-green-50';
    if (pValue < 0.01) return 'bg-green-50/50';
    if (pValue < 0.05) return 'bg-amber-50/50';
    return '';
  }

  function formatCoef(value) {
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 1) return value.toFixed(3);
    return value.toFixed(4);
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <!-- Header -->
  <div class="bg-purple-600 px-4 py-3">
    <h3 class="text-base font-bold text-white">Multivariate Regression</h3>
    <p class="text-xs text-purple-100 mt-0.5">
      Which nutrients explain yield variation together?
    </p>
  </div>

  <div class="p-4 space-y-4">
    {#if dataPoints.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <span class="text-4xl mb-3">{'\uD83C\uDF3E'}</span>
        <p class="text-lg font-medium text-slate-600">No yield data available</p>
        <p class="text-sm text-slate-400 mt-1 max-w-sm">
          Import yield data from the Import page to run multivariate regression.
        </p>
      </div>
    {:else}
      <!-- Data Point Guidance Banner -->
      <div class="flex items-center gap-3 px-3 py-2 rounded-lg border {dataGuidance.color}">
        <span class="text-base flex-shrink-0">{dataGuidance.icon}</span>
        <div class="flex-1 text-sm">
          <strong>{usablePoints}</strong> yield-linked data points available
          <span class="text-xs opacity-75 ml-1">
            | {nVars} variable{nVars !== 1 ? 's' : ''} selected
            {'\u2192'} need ~{minObsNeeded} minimum
          </span>
          {#if dataGuidance.level === 'good'}
            <span class="text-xs ml-1 font-medium">Good: {usablePoints} > {minObsNeeded}</span>
          {:else if dataGuidance.level === 'marginal'}
            <span class="text-xs ml-1 font-medium">Marginal &mdash; consider fewer variables</span>
          {:else}
            <span class="text-xs ml-1 font-medium">Insufficient &mdash; reduce variables or add data</span>
          {/if}
        </div>
      </div>

      <!-- Variable Selection -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase">Select Variables</span>
          <div class="flex gap-2">
            <button onclick={selectCore}
              class="px-2 py-1 text-xs rounded-md cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
              Core Only (P, K, pH, OM)
            </button>
            <button onclick={selectAll}
              class="px-2 py-1 text-xs rounded-md cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
              All
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          {#each allAvailableVars as varKey}
            <button
              onclick={() => toggleVar(varKey)}
              class="px-2.5 py-1.5 text-xs rounded-lg cursor-pointer transition-colors border
                {selectedVars.includes(varKey)
                  ? 'bg-purple-100 text-purple-800 border-purple-300 font-medium'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}">
              {getNutrientName(varKey)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Irrigation toggle -->
      {#if hasIrrigationData}
        <div class="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg">
          <input
            type="checkbox"
            id="mvr-irrigation"
            bind:checked={includeIrrigation}
            class="w-4 h-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
          />
          <label for="mvr-irrigation" class="text-sm text-cyan-800 font-medium cursor-pointer">
            Include Irrigation Zone as variable
          </label>
          <span class="text-xs text-cyan-600 ml-auto">
            {dataPoints.filter(p => p.irrigated).length} irrigated / {dataPoints.length} total points
          </span>
        </div>
      {/if}

      <!-- Run button -->
      <button
        onclick={runRegression}
        disabled={running || selectedVars.length < 1 || usablePoints < selectedVars.length + 3}
        class="px-4 py-2 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
          {running ? 'bg-purple-300 text-white cursor-wait' : 'bg-purple-600 text-white hover:bg-purple-700'}
          disabled:opacity-50 disabled:cursor-not-allowed">
        {#if running}
          Running Regression...
        {:else}
          Run Regression
        {/if}
      </button>

      <!-- Results -->
      {#if hasRun && !running && regressionResult}
        {#if regressionResult.error}
          <div class="bg-red-50 border border-red-200 rounded-xl p-4">
            <p class="text-sm text-red-800"><strong>Error:</strong> {regressionResult.error}</p>
          </div>
        {:else}
          <!-- Model Summary -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h4 class="text-sm font-bold text-slate-800">Model Summary</h4>
            </div>
            <div class="p-4">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-purple-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-purple-600 font-semibold uppercase block">R{'\u00B2'}</span>
                  <span class="text-xl font-bold font-mono text-purple-800 block mt-1">
                    {(regressionResult.r2 * 100).toFixed(1)}%
                  </span>
                </div>
                <div class="bg-purple-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-purple-600 font-semibold uppercase block">Adj R{'\u00B2'}</span>
                  <span class="text-xl font-bold font-mono text-purple-800 block mt-1">
                    {(regressionResult.adjR2 * 100).toFixed(1)}%
                  </span>
                </div>
                <div class="bg-slate-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-slate-600 font-semibold uppercase block">RMSE</span>
                  <span class="text-xl font-bold font-mono text-slate-800 block mt-1">
                    {regressionResult.rmse.toFixed(1)}
                  </span>
                  <span class="text-xs text-slate-500">bu/ac</span>
                </div>
                <div class="bg-slate-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-slate-600 font-semibold uppercase block">n</span>
                  <span class="text-xl font-bold font-mono text-slate-800 block mt-1">
                    {regressionResult.n}
                  </span>
                  <span class="text-xs text-slate-500">points</span>
                </div>
              </div>

              <!-- Interpretation -->
              <div class="mt-3 bg-slate-50 rounded-lg p-3">
                <p class="text-sm text-slate-700 leading-relaxed">
                  This model explains <strong>{(regressionResult.r2 * 100).toFixed(1)}%</strong> of yield variation
                  using {regressionResult.vars.length} soil nutrient{regressionResult.vars.length !== 1 ? 's' : ''}.
                  {#if regressionResult.significantVars.length > 0}
                    Key significant factors:
                    {regressionResult.significantVars.map(v =>
                      `${v.label} (${v.coefficient > 0 ? '+' : ''}${formatCoef(v.coefficient)}, p=${v.pValue < 0.001 ? '<0.001' : v.pValue.toFixed(3)})`
                    ).join(', ')}.
                  {:else}
                    No individual variables reached statistical significance (p &lt; 0.05).
                  {/if}
                </p>
              </div>
            </div>
          </div>

          <!-- VIF Warnings -->
          {#if regressionResult.vifWarnings.length > 0}
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div class="flex gap-3">
                <span class="text-amber-500 text-lg flex-shrink-0">{'\u26A0\uFE0F'}</span>
                <div>
                  <p class="text-sm font-medium text-amber-800">Collinearity Warning (VIF > 5)</p>
                  <ul class="text-xs text-amber-700 mt-1 space-y-0.5">
                    {#each regressionResult.vifWarnings as w}
                      <li><strong>{w.variable}</strong>: VIF = {w.vif.toFixed(1)} &mdash; consider removing</li>
                    {/each}
                  </ul>
                  <p class="text-xs text-amber-600 mt-1.5">
                    High VIF means these variables are correlated with each other, making individual coefficients unreliable.
                  </p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Coefficients Table -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h4 class="text-sm font-bold text-slate-800">Coefficients</h4>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="bg-slate-50">
                    <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Variable</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Coeff</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Std Err</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">t-value</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">p-value</th>
                    <th class="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Sig</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">VIF</th>
                  </tr>
                </thead>
                <tbody>
                  {#each regressionResult.coefficients as coef}
                    <tr class="border-t border-slate-100 {getSignificanceColor(coef.pValue)}">
                      <td class="py-2 px-3 font-medium text-slate-800">{coef.label}</td>
                      <td class="text-right py-2 px-3 font-mono text-slate-700">
                        {coef.coefficient >= 0 ? '+' : ''}{formatCoef(coef.coefficient)}
                      </td>
                      <td class="text-right py-2 px-3 font-mono text-slate-500 text-xs">
                        {coef.stdError.toFixed(4)}
                      </td>
                      <td class="text-right py-2 px-3 font-mono text-slate-600 text-xs">
                        {coef.tValue.toFixed(2)}
                      </td>
                      <td class="text-right py-2 px-3 font-mono text-xs text-slate-500">
                        {coef.pValue < 0.001 ? '<0.001' : coef.pValue.toFixed(3)}
                      </td>
                      <td class="text-center py-2 px-3">
                        {#if coef.sig}
                          <span class="text-amber-500 font-bold">{coef.sig}</span>
                        {:else}
                          <span class="text-slate-300">&mdash;</span>
                        {/if}
                      </td>
                      <td class="text-right py-2 px-3 font-mono text-xs">
                        {#if coef.isIntercept}
                          <span class="text-slate-300">&mdash;</span>
                        {:else if coef.vif > 5}
                          <span class="text-red-600 font-bold">{coef.vif.toFixed(1)}</span>
                        {:else if coef.vif !== undefined}
                          <span class="text-slate-500">{coef.vif.toFixed(1)}</span>
                        {:else}
                          <span class="text-slate-300">&mdash;</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <div class="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
              <strong class="text-amber-500">***</strong> p&lt;0.001 &nbsp;
              <strong class="text-amber-500">**</strong> p&lt;0.01 &nbsp;
              <strong class="text-amber-500">*</strong> p&lt;0.05 &nbsp;
              <strong class="text-amber-500">.</strong> p&lt;0.1
            </div>
          </div>

          <!-- Yield Predictor -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onclick={() => { showPredictor = !showPredictor; predictedYield = null; predictionCI = null; }}
              class="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
              <h4 class="text-sm font-bold text-slate-800">Yield Predictor</h4>
              <span class="text-slate-400 text-xs">{showPredictor ? '\u25B2' : '\u25BC'}</span>
            </button>

            {#if showPredictor}
              <div class="p-4 space-y-3">
                <p class="text-xs text-slate-500">Enter nutrient values to predict yield based on this model.</p>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {#each regressionResult.vars as varKey}
                    <div class="flex flex-col gap-1">
                      {#if varKey === '__irrigated'}
                        <span class="text-xs font-semibold text-slate-500">Irrigated?</span>
                        <select
                          bind:value={predictorInputs[varKey]}
                          onchange={predict}
                          class="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]"
                        >
                          <option value="0">No</option>
                          <option value="1">Yes</option>
                        </select>
                      {:else}
                        <span class="text-xs font-semibold text-slate-500">
                          {getNutrientName(varKey)}{getNutrientUnit(varKey) ? ` (${getNutrientUnit(varKey)})` : ''}
                        </span>
                        <input
                          type="number"
                          step="any"
                          bind:value={predictorInputs[varKey]}
                          oninput={predict}
                          class="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px] font-mono"
                          placeholder="..."
                        />
                      {/if}
                    </div>
                  {/each}
                </div>

                {#if predictedYield !== null}
                  <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                    <span class="text-xs text-purple-600 font-semibold uppercase block">Predicted Yield</span>
                    <span class="text-2xl font-bold font-mono text-purple-800 block mt-1">
                      {predictedYield.toFixed(1)}
                    </span>
                    <span class="text-sm text-purple-600">bu/ac</span>
                    {#if predictionCI}
                      <span class="block text-xs text-purple-500 mt-1">
                        95% CI: {predictionCI.low.toFixed(1)} &ndash; {predictionCI.high.toFixed(1)} bu/ac
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
