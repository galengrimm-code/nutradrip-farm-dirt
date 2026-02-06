<script>
  import { samples } from '$lib/stores/samples.js';
  import { nutrientVisibility } from '$lib/stores/settings.js';
  import { ALL_NUTRIENTS, DEFAULT_VISIBLE, LOWER_IS_BETTER, getNutrientName, getNutrientUnit } from '$lib/core/config.js';
  import { calculateLinearRegression, getTrendInsight, getUrgencyBadge, getCriticalLevels } from '$lib/core/utils.js';
  import { buildTriggerCard, collectInteractionNotes, getRelevantNotes, getNutrientCVExplanation, BADGE_COLORS, CARD_GRADIENTS } from '$lib/core/triggers.js';

  export let selectedField = '';

  // Get visible nutrients
  function getVisibleNutrients() {
    const vis = $nutrientVisibility;
    return ALL_NUTRIENTS.filter(n => {
      if (n.key === 'sampleId') return false;
      if (Object.keys(vis).length === 0) return DEFAULT_VISIBLE.includes(n.key);
      return vis[n.key] !== false;
    }).map(n => n.key);
  }

  $: visibleNutrients = getVisibleNutrients();

  // Filter samples by field
  $: fieldSamples = selectedField
    ? $samples.filter(s => s.field === selectedField)
    : $samples;

  $: years = [...new Set(fieldSamples.map(s => s.year).filter(Boolean))].sort();

  // Compute stats for each nutrient
  function getStats(samps, attr) {
    const values = samps.map(s => s[attr]).filter(v => v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(v))).map(v => parseFloat(v));
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { avg: values.reduce((a, b) => a + b, 0) / values.length, median, high: Math.max(...values), low: Math.min(...values), count: values.length };
  }

  function getAvgValue(samps, nutrient) {
    const vals = samps.map(s => s[nutrient]).filter(v => v !== null && v !== undefined && !isNaN(v));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function getDecimals(attr) {
    const def = ALL_NUTRIENTS.find(n => n.key === attr);
    return def ? def.decimals : 1;
  }

  // Build all nutrient cards
  $: nutrientCards = buildNutrientCards(fieldSamples, years, visibleNutrients);

  function buildNutrientCards(samps, yrs, nutrients) {
    if (yrs.length < 1 || samps.length === 0) return [];

    const mostRecentYear = yrs[yrs.length - 1];
    const recentSamples = samps.filter(s => String(s.year) === String(mostRecentYear));
    const currentPH = getAvgValue(recentSamples, 'pH');
    const currentP = getAvgValue(recentSamples, 'P');
    const currentZn = getAvgValue(recentSamples, 'Zn');
    const currentFe = getAvgValue(recentSamples, 'Fe');
    const currentMn = getAvgValue(recentSamples, 'Mn');
    const currentB = getAvgValue(recentSamples, 'Boron') || getAvgValue(recentSamples, 'B');
    const currentPZnRatio = (currentP !== null && currentZn !== null && currentZn > 0) ? currentP / currentZn : null;

    const interactionNotes = collectInteractionNotes({
      pH: currentPH || 6.5, calcareous: false, P_ppm: currentP || 0,
      Zn_ppm: currentZn || 0, PZn_ratio: currentPZnRatio || 0,
      Fe_ppm: currentFe, Mn_ppm: currentMn, B_ppm: currentB
    });

    const criticalLevels = getCriticalLevels();
    const cards = [];

    nutrients.forEach(attr => {
      const yearData = [];
      let hasData = false;
      yrs.forEach(year => {
        const ys = samps.filter(s => String(s.year) === String(year));
        const stats = getStats(ys, attr);
        if (stats) { yearData.push({ year: parseInt(year), avg: stats.avg, median: stats.median, count: stats.count, min: stats.low, max: stats.high }); hasData = true; }
      });
      if (!hasData || yearData.length < 1) return;

      const first = yearData[0], last = yearData[yearData.length - 1];
      const avgChange = last.avg - first.avg;
      const medianChange = last.median - first.median;
      const pctChange = first.avg !== 0 ? (avgChange / first.avg) * 100 : 0;
      const isLowerBetter = LOWER_IS_BETTER.includes(attr);
      const isPositive = isLowerBetter ? avgChange < 0 : avgChange > 0;
      const decimals = getDecimals(attr);
      const unit = getNutrientUnit(attr);
      const name = getNutrientName(attr);

      // Linear regression
      const regressionData = yearData.map(d => ({ x: d.year, y: d.avg }));
      const skipTrendAnalysis = attr === 'BpH' || attr === 'CEC';
      const regression = !skipTrendAnalysis ? calculateLinearRegression(regressionData) : null;
      const slope = regression ? regression.slope : null;

      // Trend insight (urgency, stability, etc.)
      let trendInsight = null;
      if (!skipTrendAnalysis && yearData.length > 1) {
        trendInsight = getTrendInsight(yearData, attr, slope, criticalLevels);
      }

      const stabilityValue = trendInsight ? trendInsight.stability.value : null;

      // Build 5-trigger card
      const triggerCard = buildTriggerCard(attr, {
        lastAvg: last.avg, stabilityValue, slope, years: yearData.length,
        currentPH, currentP, currentZn, currentPZnRatio
      });

      const relevantNotes = triggerCard ? getRelevantNotes(attr, interactionNotes) : [];

      // Badge from trigger card
      let badge = null;
      if (triggerCard) {
        const bc = BADGE_COLORS[triggerCard.background] || BADGE_COLORS.neutral;
        badge = { label: triggerCard.badge, color: bc.color, bg: bc.bg };
      }

      // Card color class
      let cardStyle = 'neutral';
      if (triggerCard) cardStyle = triggerCard.background;
      else if (yearData.length > 1) cardStyle = isPositive ? 'green' : 'red';

      // Moisture warning for P and K
      let moistureWarning = null;
      if ((attr === 'P' || attr === 'K') && samps.length > 0) {
        const moistureConditions = samps
          .filter(s => s.soilMoistureCondition)
          .map(s => ({ year: s.year, moisture: s.soilMoistureCondition }));
        const hasDry = moistureConditions.some(m => m.moisture === 'dry');
        const moistureByYear = {};
        moistureConditions.forEach(m => {
          if (!moistureByYear[m.year]) moistureByYear[m.year] = new Set();
          moistureByYear[m.year].add(m.moisture);
        });
        const yearsWithMoisture = Object.keys(moistureByYear);
        const hasMixedMoisture = yearsWithMoisture.length > 1 &&
          new Set(yearsWithMoisture.flatMap(y => [...moistureByYear[y]])).size > 1;
        if (hasDry) {
          moistureWarning = { type: 'dry', pctHigher: attr === 'P' ? '15-25%' : '20-40%' };
        }
        if (hasMixedMoisture && trendInsight && trendInsight.stability.label === 'Volatile') {
          moistureWarning = moistureWarning || {};
          moistureWarning.mixed = true;
        }
      }

      // CV explanation for volatile nutrients
      let cvExplanation = null;
      if (trendInsight && trendInsight.stability.label === 'Volatile') {
        cvExplanation = getNutrientCVExplanation(attr, trendInsight.stability.value);
      }

      cards.push({
        attr, name, unit, decimals, yearData, first, last,
        avgChange, medianChange, pctChange, isPositive,
        slope, trendInsight, triggerCard, relevantNotes, badge,
        moistureWarning, cvExplanation,
        cardStyle, cardGradient: CARD_GRADIENTS[cardStyle] || CARD_GRADIENTS.neutral,
        badgeColors: BADGE_COLORS[cardStyle] || BADGE_COLORS.neutral
      });
    });

    return cards;
  }

  // SVG chart builder for a single card
  function buildChartPaths(yearData, color) {
    if (yearData.length < 2) return null;
    const w = 280, h = 120, pad = { t: 10, r: 10, b: 24, l: 35 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const allVals = yearData.flatMap(d => [d.avg, d.median]);
    const yMin = Math.min(...allVals) * 0.95;
    const yMax = Math.max(...allVals) * 1.05;
    const yRange = yMax - yMin || 1;
    const x = (i) => pad.l + (i / (yearData.length - 1)) * pw;
    const y = (v) => pad.t + ph - ((v - yMin) / yRange) * ph;
    const avgPath = yearData.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.avg).toFixed(1)}`).join(' ');
    const medPath = yearData.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.median).toFixed(1)}`).join(' ');
    const ticks = [yMin, yMin + yRange * 0.5, yMax];
    return { w, h, pad, avgPath, medPath, yearData, x, y, ticks, color };
  }
</script>

<div class="space-y-3">
  {#if fieldSamples.length === 0}
    <p class="text-sm text-slate-400 text-center py-8">Select a field to view nutrient trends.</p>
  {:else if nutrientCards.length === 0}
    <p class="text-sm text-slate-400 text-center py-8">No nutrient data available for this field.</p>
  {:else}
    <!-- Field header -->
    <div class="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <h3 class="text-base font-bold text-slate-800">{selectedField || 'All Fields'}</h3>
      <p class="text-xs text-slate-500">Years: {years.join(', ')} ({fieldSamples.length} samples)</p>
    </div>

    <!-- Nutrient Cards -->
    {#each nutrientCards as card}
      {@const chart = buildChartPaths(card.yearData, card.isPositive ? '#22c55e' : '#ef4444')}
      <div class="rounded-xl border-2 bg-gradient-to-br {card.cardGradient} p-4 space-y-3">
        <!-- Header -->
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h4 class="text-sm font-bold text-slate-800">
            {card.name}
            {#if card.unit}<span class="text-xs font-normal text-slate-400">({card.unit})</span>{/if}
            {#if card.attr === 'P_Zn_Ratio'}
              <span class="text-slate-400 cursor-help ml-1" title="High P relative to Zn can reduce Zn uptake even when soil Zn is moderate.">i</span>
            {/if}
          </h4>
          <div class="flex items-center gap-2">
            {#if card.badge}
              <span class="px-2 py-0.5 text-[10px] font-semibold rounded"
                    style="background:{card.badge.bg}; color:{card.badge.color};">
                {card.badge.label}
              </span>
            {/if}
            {#if card.yearData.length > 1}
              <span class="text-xs font-bold" style="color:{card.isPositive ? '#22c55e' : '#ef4444'}">
                {card.pctChange >= 0 ? '+' : ''}{card.pctChange.toFixed(1)}%
                <span class="text-[9px] font-normal text-slate-400 block text-right">{card.first.year} - {card.last.year}</span>
              </span>
            {/if}
          </div>
        </div>

        <!-- Content: table + chart side by side -->
        <div class="flex flex-col md:flex-row gap-3">
          <!-- Year data table -->
          <div class="shrink-0 text-xs">
            <div class="flex justify-between px-1 text-[10px] text-slate-400 font-semibold mb-0.5">
              <span></span><span class="w-14 text-center">Avg</span><span class="w-14 text-center">Median</span>
            </div>
            {#each card.yearData as d, i}
              <div class="flex justify-between px-1 py-0.5 rounded {i % 2 === 0 ? 'bg-white/50' : ''}">
                <span class="font-semibold text-slate-600 w-10">{d.year}:</span>
                <span class="w-14 text-center font-mono">{d.avg.toFixed(card.decimals)}</span>
                <span class="w-14 text-center font-mono text-purple-600">{d.median.toFixed(card.decimals)}</span>
              </div>
            {/each}
            {#if card.yearData.length > 1}
              <div class="flex justify-between px-1 py-1 mt-1 border-t-2" style="border-color:{card.isPositive ? '#22c55e' : '#ef4444'}">
                <span class="text-slate-500">Change:</span>
                <span class="w-14 text-center font-mono font-bold" style="color:{card.isPositive ? '#22c55e' : '#ef4444'}">{card.avgChange >= 0 ? '+' : ''}{card.avgChange.toFixed(card.decimals)}</span>
                <span class="w-14 text-center font-mono font-bold text-purple-600">{card.medianChange >= 0 ? '+' : ''}{card.medianChange.toFixed(card.decimals)}</span>
              </div>
            {/if}
          </div>

          <!-- Mini chart -->
          {#if chart}
            <div class="flex-1 min-w-0">
              <div class="flex gap-3 text-[10px] text-slate-400 mb-1 justify-center">
                <span><span style="color:{chart.color}">●</span> Average</span>
                <span><span class="text-purple-500">●</span> Median</span>
              </div>
              <svg viewBox="0 0 {chart.w} {chart.h}" class="w-full" preserveAspectRatio="xMidYMid meet">
                {#each chart.ticks as tick}
                  <line x1={chart.pad.l} y1={chart.y(tick)} x2={chart.w - chart.pad.r} y2={chart.y(tick)} stroke="#e2e8f0" stroke-width="1" />
                  <text x={chart.pad.l - 4} y={chart.y(tick) + 3} text-anchor="end" fill="#94a3b8" font-size="9">{tick.toFixed(tick < 10 ? 1 : 0)}</text>
                {/each}
                <path d={chart.avgPath} fill="none" stroke={chart.color} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d={chart.medPath} fill="none" stroke="#8b5cf6" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" />
                {#each chart.yearData as d, i}
                  <circle cx={chart.x(i)} cy={chart.y(d.avg)} r="3.5" fill={chart.color} stroke="white" stroke-width="1.5" />
                  <text x={chart.x(i)} y={chart.h - 4} text-anchor="middle" fill="#64748b" font-size="9" font-weight="600">{d.year}</text>
                {/each}
              </svg>
            </div>
          {/if}
        </div>

        <!-- Trend metadata -->
        {#if card.trendInsight && card.yearData.length > 1}
          <div class="bg-white/60 rounded-md px-3 py-2 text-[11px] text-slate-600 flex flex-wrap gap-3">
            <span><strong>Trend:</strong> {card.slope !== null ? `${card.slope >= 0 ? '+' : ''}${card.slope.toFixed(2)} ${card.attr === 'pH' ? '' : card.unit || 'ppm'}/yr` : 'N/A'}</span>
            <span><strong>Stability:</strong> {card.trendInsight.stability.metric} {card.trendInsight.stability.value.toFixed(card.attr === 'pH' ? 2 : 1)}{card.attr === 'pH' ? '' : '%'} ({card.trendInsight.stability.label})</span>
            <span><strong>Confidence:</strong> {card.trendInsight.confidence} ({card.yearData.length} yrs)</span>
          </div>
        {/if}

        <!-- 5-Trigger insight card -->
        {#if card.triggerCard}
          {@const tc = card.triggerCard}
          {@const bc = BADGE_COLORS[tc.background] || BADGE_COLORS.neutral}
          <div class="rounded-md px-3 py-2.5 text-xs" style="background:{bc.bg}; border-left:4px solid {bc.border};">
            <div class="font-semibold mb-1.5 text-slate-800">{tc.insight}</div>
            {#if tc.tips.length > 0}
              <ul class="list-disc pl-4 space-y-0.5 text-slate-600">
                {#each tc.tips as tip}<li>{tip}</li>{/each}
              </ul>
            {/if}
            {#if tc.warnings.length > 0}
              <div class="mt-2 pt-2 border-t border-black/10 text-[10px] text-slate-500 space-y-0.5">
                {#each tc.warnings as w}<div>Warning: {w}</div>{/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Interaction notes -->
        {#if card.relevantNotes.length > 0}
          <div class="rounded-md px-3 py-2 text-[10px] border border-dashed border-purple-300 bg-purple-50/50">
            <div class="font-semibold text-purple-700 mb-1">Potential Interactions:</div>
            {#each card.relevantNotes as note}
              <div class="text-slate-600 mb-0.5">
                {note.severity === 3 ? '!!!' : note.severity === 2 ? '!!' : '!'} {note.message}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Moisture warning (P and K only) -->
        {#if card.moistureWarning}
          {#if card.moistureWarning.type === 'dry'}
            <div class="text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2 border border-amber-200">
              Dry sampling: {card.attr} may test {card.moistureWarning.pctHigher} higher than actual plant-available levels.
            </div>
          {/if}
          {#if card.moistureWarning.mixed}
            <div class="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2">
              Some variability may be due to different moisture conditions at sampling.
            </div>
          {/if}
        {/if}

        <!-- CV explanation (volatile nutrients) -->
        {#if card.cvExplanation}
          <details class="text-xs text-slate-500" open>
            <summary class="cursor-pointer text-red-600 font-medium">{card.cvExplanation.title}</summary>
            <div class="mt-2 p-3 bg-red-50 rounded-md border border-red-200">
              <p class="text-red-900 mb-2">{card.cvExplanation.explanation}</p>
              <p class="font-semibold text-slate-600 text-[10px] mb-1">Common drivers:</p>
              <ul class="list-disc pl-5 text-slate-500 text-[10px] space-y-0.5">
                {#each card.cvExplanation.drivers as driver}
                  <li>{driver}</li>
                {/each}
              </ul>
              <p class="mt-3 p-2 bg-green-50 rounded text-green-800 font-medium text-[10px]">{card.cvExplanation.suggestion}</p>
            </div>
          </details>
        {/if}
      </div>
    {/each}
  {/if}
</div>
