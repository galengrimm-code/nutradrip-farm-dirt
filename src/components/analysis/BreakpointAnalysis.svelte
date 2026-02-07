<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit, getNutrientDecimals } from '$lib/core/config.js';
  import { findBreakpointBinning, classifyByBreakpoint, mean } from '$lib/core/utils.js';

  export let selectedNutrient = 'Zn';

  let result = null;
  let classified = [];
  let running = false;
  let hasRun = false;
  let showImpact = false;
  let showFieldBreakdown = false;

  // Run All state
  let runAllResults = [];
  let runAllRunning = false;
  let hasRunAll = false;
  let viewMode = 'single'; // 'single' | 'summary'

  // Get samples that have yield correlation data
  $: yieldSamples = $samples.filter(s =>
    s.yieldCorrelations && Object.keys(s.yieldCorrelations).length > 0
  );

  // Build data points array from yield correlations
  $: dataPoints = buildDataPoints(yieldSamples);

  // Determine majority crop
  $: majorityCrop = getMajorityCrop(dataPoints);

  // Filter nutrients that have at least 10 valid data points
  $: availableNutrients = getAvailableNutrients(dataPoints);

  // Auto-select first available nutrient if current selection is not valid
  $: if (availableNutrients.length > 0 && !availableNutrients.find(n => n.key === selectedNutrient)) {
    selectedNutrient = availableNutrients[0].key;
  }

  // Points for the currently selected nutrient
  $: nutrientDataPoints = dataPoints.filter(p => {
    const val = parseFloat(p[selectedNutrient]);
    return !isNaN(val) && val !== null && val !== undefined;
  });

  // Data quality assessment
  $: dataQuality = getDataQuality(dataPoints.length);

  function getDataQuality(n) {
    if (n < 20) return { level: 'insufficient', color: 'bg-red-50 border-red-200 text-red-800', label: 'Not enough data', icon: '\u26D4' };
    if (n < 50) return { level: 'limited', color: 'bg-amber-50 border-amber-200 text-amber-800', label: 'Limited confidence', icon: '\u26A0\uFE0F' };
    return { level: 'good', color: 'bg-green-50 border-green-200 text-green-800', label: 'Good', icon: '\u2705' };
  }

  function buildDataPoints(sampleList) {
    const points = [];
    sampleList.forEach(s => {
      Object.entries(s.yieldCorrelations).forEach(([yr, yc]) => {
        const yieldValue = yc.yield || yc.avgYield;
        if (!yieldValue || yieldValue <= 0) return;

        const crop = (yc.crop || '').toLowerCase();
        let minYield = 10, maxYield = 500;
        if (crop.includes('corn')) { minYield = 50; maxYield = 350; }
        else if (crop.includes('soy')) { minYield = 20; maxYield = 100; }

        if (yieldValue < minYield || yieldValue > maxYield) return;

        points.push({
          ...s,
          yieldValue,
          yieldYear: yr,
          crop: yc.crop || ''
        });
      });
    });
    return points;
  }

  function getMajorityCrop(points) {
    const counts = {};
    points.forEach(p => {
      const crop = (p.crop || 'unknown').toLowerCase();
      counts[crop] = (counts[crop] || 0) + 1;
    });
    let maxCrop = 'unknown', maxCount = 0;
    for (const [crop, count] of Object.entries(counts)) {
      if (count > maxCount) { maxCrop = crop; maxCount = count; }
    }
    return maxCrop;
  }

  function getAvailableNutrients(points) {
    const nutrientKeys = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId').map(n => n.key);
    return nutrientKeys
      .filter(key => {
        const validCount = points.filter(p => {
          const nutrientVal = parseFloat(p[key]);
          const yieldVal = p.yieldValue;
          return !isNaN(nutrientVal) && nutrientVal !== null && yieldVal > 0;
        }).length;
        return validCount >= 10;
      })
      .map(key => {
        const def = ALL_NUTRIENTS.find(n => n.key === key);
        return { key, name: def ? def.name : key, unit: def ? def.unit : '' };
      });
  }

  function getMinPenalty(crop) {
    if (crop.includes('corn')) return 5;
    if (crop.includes('soy')) return 2;
    return 3;
  }

  function runBreakpointAnalysis() {
    running = true;
    hasRun = true;
    result = null;
    classified = [];
    viewMode = 'single';

    setTimeout(() => {
      const minPenalty = getMinPenalty(majorityCrop);
      const bpResult = findBreakpointBinning(nutrientDataPoints, selectedNutrient, {
        MIN_PENALTY: minPenalty
      });

      result = bpResult;

      if (bpResult.breakpoint !== null) {
        classified = classifyByBreakpoint(nutrientDataPoints, selectedNutrient, bpResult.breakpoint);
      }

      running = false;
    }, 50);
  }

  function runAllNutrients() {
    runAllRunning = true;
    hasRunAll = true;
    runAllResults = [];
    viewMode = 'summary';

    setTimeout(() => {
      const minPenalty = getMinPenalty(majorityCrop);
      const results = [];

      for (const nutrient of availableNutrients) {
        const points = dataPoints.filter(p => {
          const val = parseFloat(p[nutrient.key]);
          return !isNaN(val) && val !== null && val !== undefined;
        });

        if (points.length < 10) continue;

        const bpResult = findBreakpointBinning(points, nutrient.key, {
          MIN_PENALTY: minPenalty
        });

        if (bpResult.breakpoint !== null) {
          results.push({
            nutrientKey: nutrient.key,
            name: nutrient.name,
            unit: nutrient.unit,
            breakpoint: bpResult.breakpoint,
            meanBelow: bpResult.meanBelow,
            meanAbove: bpResult.meanAbove,
            penalty: bpResult.penalty,
            stabilityPct: bpResult.stabilityPct,
            confidence: bpResult.confidence,
            nBelow: bpResult.nBelow,
            nAbove: bpResult.nAbove,
            n: bpResult.nBelow + bpResult.nAbove
          });
        }
      }

      runAllResults = results.sort((a, b) => b.penalty - a.penalty);
      runAllRunning = false;
    }, 50);
  }

  function drillIntoNutrient(nutrientKey) {
    selectedNutrient = nutrientKey;
    viewMode = 'single';
    runBreakpointAnalysis();
  }

  // Classification helpers
  $: belowPoints = classified.filter(p => p.classification === 'BELOW_BREAKPOINT');
  $: nearPoints = classified.filter(p => p.classification === 'NEAR_BREAKPOINT');
  $: abovePoints = classified.filter(p => p.classification === 'ABOVE_BREAKPOINT');

  $: belowAvgNutrient = mean(belowPoints.map(p => p.nutrientValue));
  $: nearAvgNutrient = mean(nearPoints.map(p => p.nutrientValue));
  $: aboveAvgNutrient = mean(abovePoints.map(p => p.nutrientValue));

  $: belowAvgYield = mean(belowPoints.map(p => p.yieldValue));
  $: nearAvgYield = mean(nearPoints.map(p => p.yieldValue));
  $: aboveAvgYield = mean(abovePoints.map(p => p.yieldValue));

  $: yieldOpportunity = belowPoints.length > 0 && result && result.penalty
    ? (belowPoints.length * 2.5 * result.penalty).toFixed(0)
    : 0;

  // Field breakdown: group below-breakpoint points by field
  $: fieldBreakdown = getFieldBreakdown(belowPoints, nutrientDataPoints);

  function getFieldBreakdown(below, allPoints) {
    if (below.length === 0) return [];

    const byField = {};
    below.forEach(p => {
      const field = p.field || 'Unknown';
      if (!byField[field]) byField[field] = [];
      byField[field].push(p);
    });

    const fieldTotals = {};
    allPoints.forEach(p => {
      const field = p.field || 'Unknown';
      fieldTotals[field] = (fieldTotals[field] || 0) + 1;
    });

    return Object.entries(byField)
      .map(([field, points]) => ({
        field,
        count: points.length,
        total: fieldTotals[field] || points.length,
        pct: fieldTotals[field] ? ((points.length / fieldTotals[field]) * 100).toFixed(0) : '?',
        estAcres: (points.length * 2.5).toFixed(1),
        avgNutrient: mean(points.map(p => p.nutrientValue)),
        avgYield: mean(points.map(p => p.yieldValue))
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  function getConfidenceColor(confidence) {
    switch (confidence) {
      case 'High': return 'bg-green-100 text-green-800';
      case 'Medium': return 'bg-blue-100 text-blue-800';
      case 'Medium-Low': return 'bg-amber-100 text-amber-800';
      case 'Low': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  }

  function getInterpretation(res) {
    if (!res || res.breakpoint === null) return '';
    const name = getNutrientName(selectedNutrient);
    const unit = getNutrientUnit(selectedNutrient);
    const unitStr = unit ? ` ${unit}` : '';
    const bp = formatBreakpoint(res.breakpoint);

    if (res.confidence === 'High') {
      return `Strong evidence that ${name} levels below ${bp}${unitStr} are associated with a yield penalty of approximately ${res.penalty.toFixed(1)} bu/ac. Fields with deficient ${name} should be prioritized for amendment. The breakpoint was stable across ${res.stabilityPct.toFixed(0)}% of bootstrap resamples, indicating a reliable threshold.`;
    } else if (res.confidence === 'Medium') {
      return `Moderate evidence for a ${name} breakpoint at ${bp}${unitStr} with an estimated ${res.penalty.toFixed(1)} bu/ac yield penalty below this threshold. Consider targeted soil amendments for fields below this level, but additional years of data would strengthen this finding.`;
    } else if (res.confidence === 'Medium-Low') {
      return `Preliminary evidence suggests a ${name} threshold near ${bp}${unitStr}. The estimated yield penalty of ${res.penalty.toFixed(1)} bu/ac is based on limited multi-year data. Continue collecting yield data to confirm this breakpoint before making major management changes.`;
    } else {
      return `A potential ${name} breakpoint was detected at ${bp}${unitStr}, but confidence is low. The ${res.penalty.toFixed(1)} bu/ac penalty estimate may not be reliable due to limited data or high variability. More data is needed before drawing conclusions.`;
    }
  }

  function formatBreakpoint(value) {
    if (value === null || value === undefined) return '-';
    const def = ALL_NUTRIENTS.find(n => n.key === selectedNutrient);
    const decimals = def ? def.decimals : 1;
    return Number(value).toFixed(decimals);
  }

  function formatBpValue(value, nutrientKey) {
    if (value === null || value === undefined) return '-';
    const decimals = getNutrientDecimals(nutrientKey);
    return Number(value).toFixed(decimals);
  }

  function formatNutrient(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    const def = ALL_NUTRIENTS.find(n => n.key === selectedNutrient);
    const decimals = def ? def.decimals : 1;
    return Number(value).toFixed(decimals);
  }

  function formatYield(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return Number(value).toFixed(1);
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <!-- Header with blue accent -->
  <div class="bg-blue-600 px-4 py-3">
    <h3 class="text-base font-bold text-white">Breakpoint Analysis</h3>
    <p class="text-xs text-blue-100 mt-0.5">
      Find the critical nutrient threshold where yield response changes
    </p>
  </div>

  <div class="p-4 space-y-4">
    <!-- Data Quality Banner -->
    {#if dataPoints.length > 0}
      <div class="flex items-center gap-3 px-3 py-2 rounded-lg border {dataQuality.color}">
        <span class="text-base flex-shrink-0">{dataQuality.icon}</span>
        <div class="flex-1">
          <span class="text-sm font-medium">{dataPoints.length} yield-linked data points</span>
          <span class="text-xs opacity-75 ml-2">
            {#if dataQuality.level === 'insufficient'}
              &mdash; Need 20+ for reliable breakpoints
            {:else if dataQuality.level === 'limited'}
              &mdash; 50+ recommended for high confidence
            {:else}
              &mdash; Sufficient for analysis
            {/if}
          </span>
        </div>
      </div>
    {/if}

    <!-- Description -->
    <p class="text-sm text-slate-500 leading-relaxed">
      Breakpoint analysis identifies the soil nutrient level below which crop yield drops significantly.
      This helps pinpoint which fields need targeted amendments to eliminate yield-limiting deficiencies.
    </p>

    {#if availableNutrients.length === 0}
      <!-- No data state -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <span class="text-4xl mb-3">{'\uD83C\uDF3E'}</span>
        <p class="text-lg font-medium text-slate-600">Insufficient yield data</p>
        <p class="text-sm text-slate-400 mt-1 max-w-sm">
          Import yield data with at least 10 matched soil sample points to run breakpoint analysis.
        </p>
      </div>
    {:else}
      <!-- Nutrient selector + Run buttons -->
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-500 uppercase">Nutrient</span>
          <select bind:value={selectedNutrient}
            class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
            {#each availableNutrients as n}
              <option value={n.key}>{n.name}{n.unit ? ` (${n.unit})` : ''}</option>
            {/each}
          </select>
        </div>

        <span class="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 self-end mb-2">
          {nutrientDataPoints.length} points
        </span>

        <button
          onclick={runBreakpointAnalysis}
          disabled={running || runAllRunning || nutrientDataPoints.length < 10}
          class="px-4 py-2 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
            {running ? 'bg-blue-300 text-white cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700'}
            disabled:opacity-50 disabled:cursor-not-allowed">
          {#if running}
            Analyzing...
          {:else}
            Find Breakpoint
          {/if}
        </button>

        <button
          onclick={runAllNutrients}
          disabled={running || runAllRunning || availableNutrients.length < 2}
          class="px-4 py-2 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
            {runAllRunning ? 'bg-emerald-300 text-white cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-700'}
            disabled:opacity-50 disabled:cursor-not-allowed">
          {#if runAllRunning}
            Scanning...
          {:else}
            Run All Nutrients
          {/if}
        </button>
      </div>

      <!-- Run All Summary Table -->
      {#if viewMode === 'summary' && hasRunAll && !runAllRunning}
        {#if runAllResults.length > 0}
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-emerald-50 px-4 py-3 border-b border-slate-200">
              <h4 class="text-sm font-bold text-slate-800">
                All Nutrient Breakpoints
                <span class="text-xs font-normal text-slate-500 ml-1">{runAllResults.length} found, sorted by yield penalty</span>
              </h4>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="bg-slate-50">
                    <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Nutrient</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Breakpoint</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Yield Below</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Yield Above</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Penalty</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Stability</th>
                    <th class="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Confidence</th>
                    <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">n</th>
                    <th class="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each runAllResults as row}
                    <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                      onclick={() => drillIntoNutrient(row.nutrientKey)}>
                      <td class="py-2 px-3 font-medium text-slate-800">{row.name}</td>
                      <td class="text-right py-2 px-3 font-mono text-slate-700">
                        {formatBpValue(row.breakpoint, row.nutrientKey)}{row.unit ? ` ${row.unit}` : ''}
                      </td>
                      <td class="text-right py-2 px-3 font-mono text-red-600">{formatYield(row.meanBelow)}</td>
                      <td class="text-right py-2 px-3 font-mono text-green-600">{formatYield(row.meanAbove)}</td>
                      <td class="text-right py-2 px-3 font-mono font-bold text-red-700">+{row.penalty.toFixed(1)}</td>
                      <td class="text-right py-2 px-3 font-mono text-slate-600">{row.stabilityPct.toFixed(0)}%</td>
                      <td class="text-center py-2 px-3">
                        <span class="px-2 py-0.5 text-xs font-bold rounded-full {getConfidenceColor(row.confidence)}">
                          {row.confidence}
                        </span>
                      </td>
                      <td class="text-right py-2 px-3 text-slate-400">{row.n}</td>
                      <td class="text-center py-2 px-3">
                        <span class="text-blue-500 text-xs">{'\u25B6'}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
              Click any row to see full breakpoint details for that nutrient
            </div>
          </div>
        {:else}
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="flex gap-3">
              <span class="text-amber-500 text-lg flex-shrink-0">{'\u26A0\uFE0F'}</span>
              <div>
                <p class="text-sm font-medium text-amber-800">No breakpoints detected for any nutrient.</p>
                <p class="text-xs text-amber-600 mt-1">
                  This may indicate insufficient data or no clear yield-limiting thresholds in your dataset.
                </p>
              </div>
            </div>
          </div>
        {/if}
      {/if}

      <!-- Single Nutrient Results section -->
      {#if viewMode === 'single' && hasRun && !running}
        {#if result && result.breakpoint !== null}
          <!-- Breakpoint found -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <!-- Result header -->
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 class="text-sm font-bold text-slate-800">
                {getNutrientName(selectedNutrient)} Breakpoint Result
              </h4>
              {#if hasRunAll}
                <button onclick={() => viewMode = 'summary'}
                  class="text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                  {'\u2190'} Back to Summary
                </button>
              {/if}
            </div>

            <div class="p-4 space-y-4">
              <!-- Stat boxes -->
              <div class="grid grid-cols-3 gap-3">
                <!-- Breakpoint value -->
                <div class="bg-blue-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-blue-600 font-semibold uppercase block">Breakpoint</span>
                  <span class="text-xl font-bold font-mono text-blue-800 block mt-1">
                    {formatBreakpoint(result.breakpoint)}
                  </span>
                  {#if getNutrientUnit(selectedNutrient)}
                    <span class="text-xs text-blue-500">{getNutrientUnit(selectedNutrient)}</span>
                  {/if}
                </div>

                <!-- Penalty -->
                <div class="bg-red-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-red-600 font-semibold uppercase block">Penalty</span>
                  <span class="text-xl font-bold font-mono text-red-800 block mt-1">
                    {result.penalty.toFixed(1)}
                  </span>
                  <span class="text-xs text-red-500">bu/ac</span>
                </div>

                <!-- Confidence -->
                <div class="bg-slate-50 rounded-lg p-3 text-center">
                  <span class="text-xs text-slate-600 font-semibold uppercase block">Confidence</span>
                  <span class="inline-block mt-2 px-2 py-0.5 text-xs font-bold rounded-full {getConfidenceColor(result.confidence)}">
                    {result.confidence}
                  </span>
                </div>
              </div>

              <!-- Stability -->
              <div class="flex items-center gap-2 text-sm text-slate-600">
                <span class="font-medium">Stability:</span>
                <div class="flex-1 bg-slate-100 rounded-full h-2 max-w-[200px]">
                  <div class="bg-blue-500 h-2 rounded-full transition-all"
                    style="width: {Math.min(100, result.stabilityPct)}%"></div>
                </div>
                <span class="font-mono text-xs">{result.stabilityPct.toFixed(0)}%</span>
              </div>

              <!-- Below/Above counts -->
              <div class="grid grid-cols-2 gap-3">
                <div class="border border-red-200 rounded-lg p-3">
                  <span class="text-xs text-red-600 font-semibold block">Below Breakpoint</span>
                  <span class="text-lg font-bold font-mono text-red-800">{result.nBelow}</span>
                  <span class="text-xs text-slate-500 ml-1">points</span>
                  <span class="text-xs text-slate-400 block mt-0.5">
                    Avg yield: <strong class="font-mono">{formatYield(result.meanBelow)}</strong> bu/ac
                  </span>
                </div>
                <div class="border border-green-200 rounded-lg p-3">
                  <span class="text-xs text-green-600 font-semibold block">Above Breakpoint</span>
                  <span class="text-lg font-bold font-mono text-green-800">{result.nAbove}</span>
                  <span class="text-xs text-slate-500 ml-1">points</span>
                  <span class="text-xs text-slate-400 block mt-0.5">
                    Avg yield: <strong class="font-mono">{formatYield(result.meanAbove)}</strong> bu/ac
                  </span>
                </div>
              </div>

              <!-- Interpretation -->
              <div class="bg-slate-50 rounded-lg p-3">
                <p class="text-sm text-slate-700 leading-relaxed">
                  {getInterpretation(result)}
                </p>
              </div>
            </div>
          </div>

          <!-- Impact Summary (collapsible) -->
          {#if classified.length > 0}
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onclick={() => showImpact = !showImpact}
                class="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <h4 class="text-sm font-bold text-slate-800">Impact Summary</h4>
                <span class="text-slate-400 text-xs">{showImpact ? '\u25B2' : '\u25BC'}</span>
              </button>

              {#if showImpact}
                <div class="p-4">
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                      <thead>
                        <tr class="bg-slate-50">
                          <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Classification</th>
                          <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Points</th>
                          <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Est. Acres</th>
                          <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Avg {getNutrientName(selectedNutrient)}</th>
                          <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Avg Yield</th>
                          <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Yield Penalty</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr class="border-t border-slate-100 bg-red-50">
                          <td class="py-2 px-3 font-medium text-red-800">Below Breakpoint</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{belowPoints.length}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">~{(belowPoints.length * 2.5).toFixed(0)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatNutrient(belowAvgNutrient)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatYield(belowAvgYield)}</td>
                          <td class="text-right py-2 px-3 font-mono text-red-700 font-semibold">
                            -{result.penalty.toFixed(1)} bu/ac
                          </td>
                        </tr>
                        <tr class="border-t border-slate-100 bg-amber-50">
                          <td class="py-2 px-3 font-medium text-amber-800">Near Breakpoint</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{nearPoints.length}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">~{(nearPoints.length * 2.5).toFixed(0)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatNutrient(nearAvgNutrient)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatYield(nearAvgYield)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-500">&mdash;</td>
                        </tr>
                        <tr class="border-t border-slate-100 bg-green-50">
                          <td class="py-2 px-3 font-medium text-green-800">Above Breakpoint</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{abovePoints.length}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">~{(abovePoints.length * 2.5).toFixed(0)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatNutrient(aboveAvgNutrient)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-700">{formatYield(aboveAvgYield)}</td>
                          <td class="text-right py-2 px-3 font-mono text-slate-500">&mdash;</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {#if belowPoints.length > 0 && Number(yieldOpportunity) > 0}
                    <div class="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p class="text-sm text-blue-800">
                        <strong>Yield Opportunity:</strong> Addressing {getNutrientName(selectedNutrient)} deficiency across
                        ~{(belowPoints.length * 2.5).toFixed(0)} estimated acres could recover up to
                        <strong class="font-mono">{yieldOpportunity}</strong> bushels of yield.
                      </p>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Field Breakdown (collapsible) -->
          {#if fieldBreakdown.length > 0}
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onclick={() => showFieldBreakdown = !showFieldBreakdown}
                class="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <h4 class="text-sm font-bold text-slate-800">
                  Field Breakdown
                  <span class="text-xs font-normal text-slate-400 ml-1">Top fields below breakpoint</span>
                </h4>
                <span class="text-slate-400 text-xs">{showFieldBreakdown ? '\u25B2' : '\u25BC'}</span>
              </button>

              {#if showFieldBreakdown}
                <div class="p-4 space-y-3">
                  {#each fieldBreakdown as fb, i}
                    <div class="border border-slate-200 rounded-lg p-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-bold text-slate-400">#{i + 1}</span>
                          <span class="text-sm font-bold text-slate-800">{fb.field}</span>
                        </div>
                        <span class="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          {fb.count} deficient point{fb.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          <strong class="text-slate-700">{fb.pct}%</strong> of field
                        </span>
                        <span>
                          ~<strong class="text-slate-700 font-mono">{fb.estAcres}</strong> est. acres
                        </span>
                        <span>
                          Avg {getNutrientName(selectedNutrient)}: <strong class="text-slate-700 font-mono">{formatNutrient(fb.avgNutrient)}</strong>
                        </span>
                        <span>
                          Avg yield: <strong class="text-slate-700 font-mono">{formatYield(fb.avgYield)}</strong> bu/ac
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

        {:else}
          <!-- No breakpoint found -->
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="flex gap-3">
              <span class="text-amber-500 text-lg flex-shrink-0">{'\u26A0\uFE0F'}</span>
              <div>
                <p class="text-sm font-medium text-amber-800">
                  No clear breakpoint detected for {getNutrientName(selectedNutrient)}.
                </p>
                <p class="text-xs text-amber-600 mt-1">
                  Try a different nutrient or check that you have sufficient data.
                  {#if result && result.error}
                    {result.error}
                  {/if}
                </p>
                {#if hasRunAll}
                  <button onclick={() => viewMode = 'summary'}
                    class="mt-2 text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                    {'\u2190'} Back to Summary
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
