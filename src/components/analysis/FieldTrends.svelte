<script>
  import { samples } from '$lib/stores/samples.js';
  import { nutrientVisibility } from '$lib/stores/settings.js';
  import { ALL_NUTRIENTS, DEFAULT_VISIBLE, LOWER_IS_BETTER, getNutrientName, getNutrientUnit } from '$lib/core/config.js';
  import { calculateLinearRegression, getTrendInsight, getUrgencyBadge, getCriticalLevels } from '$lib/core/utils.js';
  import { buildTriggerCard, collectInteractionNotes, getRelevantNotes, getNutrientCVExplanation, BADGE_COLORS, CARD_GRADIENTS } from '$lib/core/triggers.js';

  export let selectedField = '';

  function getVisibleNutrients() {
    const vis = $nutrientVisibility;
    return ALL_NUTRIENTS.filter(n => {
      if (n.key === 'sampleId') return false;
      if (Object.keys(vis).length === 0) return DEFAULT_VISIBLE.includes(n.key);
      return vis[n.key] !== false;
    }).map(n => n.key);
  }

  $: visibleNutrients = getVisibleNutrients();

  $: fieldSamples = selectedField
    ? $samples.filter(s => s.field === selectedField)
    : $samples;

  $: years = [...new Set(fieldSamples.map(s => s.year).filter(Boolean))].sort();

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
      const color = yearData.length > 1 ? (isPositive ? '#22c55e' : '#ef4444') : '#64748b';

      // Linear regression
      const regressionData = yearData.map(d => ({ x: d.year, y: d.avg }));
      const skipTrendAnalysis = attr === 'BpH' || attr === 'CEC';
      const regression = !skipTrendAnalysis ? calculateLinearRegression(regressionData) : null;
      const slope = regression ? regression.slope : null;

      // Trend insight
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

      // Card color
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
        attr, name, unit, decimals, yearData, first, last, color,
        avgChange, medianChange, pctChange, isPositive,
        slope, trendInsight, triggerCard, relevantNotes, badge,
        moistureWarning, cvExplanation,
        cardStyle, cardGradient: CARD_GRADIENTS[cardStyle] || CARD_GRADIENTS.neutral,
        badgeColors: BADGE_COLORS[cardStyle] || BADGE_COLORS.neutral
      });
    });

    return cards;
  }

  // Dual-line graph builder — matches old createDualLineGraph() exactly
  function buildChart(yearData, avgColor, attr, decimals) {
    if (yearData.length < 1) return null;
    const medianColor = '#8b5cf6';
    const numYears = yearData.length;

    const allValues = [...yearData.map(d => d.avg), ...yearData.map(d => d.median)];
    const minVal = Math.min(...allValues) * 0.85;
    const maxVal = Math.max(...allValues) * 1.15;
    const range = maxVal - minVal || 1;

    // Dynamic dimensions based on year count
    const baseWidth = 450;
    const width = numYears <= 5 ? baseWidth : Math.max(baseWidth, numYears * 60);
    const height = numYears <= 5 ? 180 : (numYears <= 10 ? 220 : 280);
    const padLeft = 35, padRight = 35, padTop = 30, padBottom = 40;
    const gw = width - padLeft - padRight;
    const gh = height - padTop - padBottom;

    // Label skip for many years
    const labelSkip = numYears > 15 ? 2 : (numYears > 10 ? 1 : 0);

    // Calculate points
    const avgPts = yearData.map((d, i) => {
      const x = padLeft + (numYears > 1 ? (i / (numYears - 1)) * gw : gw / 2);
      const y = padTop + gh - ((d.avg - minVal) / range) * gh;
      return { x, y, year: d.year, val: d.avg, idx: i };
    });

    const medianPts = yearData.map((d, i) => {
      const x = padLeft + (numYears > 1 ? (i / (numYears - 1)) * gw : gw / 2);
      const y = padTop + gh - ((d.median - minVal) / range) * gh;
      return { x, y, year: d.year, val: d.median, idx: i };
    });

    const avgLine = avgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const medianLine = medianPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const dotRadius = numYears > 10 ? 4 : 5;
    const showValueLabels = numYears <= 10;
    const fontSize = numYears > 6 ? 9 : 10;
    const yearFontSize = numYears > 12 ? 10 : 11;

    // Build value label positions (avoid overlap between avg and median)
    let avgLabels = [];
    let medianLabels = [];
    if (showValueLabels) {
      avgLabels = avgPts.map((p, i) => {
        const gap = Math.abs(p.y - medianPts[i].y);
        const offset = gap < 20 ? (p.y < medianPts[i].y ? -12 : 16) : -12;
        return { x: p.x, y: p.y + offset, text: p.val.toFixed(decimals) };
      });
      medianLabels = medianPts.map((p, i) => {
        const gap = Math.abs(p.y - avgPts[i].y);
        const offset = gap < 20 ? (p.y <= avgPts[i].y ? -12 : 16) : 16;
        return { x: p.x, y: p.y + offset, text: p.val.toFixed(decimals) };
      });
    }

    // Year label visibility
    const yearLabels = avgPts.map((p, i) => {
      const show = i === 0 || i === avgPts.length - 1 || (labelSkip === 0) || (labelSkip === 1 && i % 2 === 0) || (labelSkip === 2 && i % 3 === 0);
      return { x: p.x, year: p.year, show };
    });

    const sizeClass = numYears > 10 ? 'xlarge' : (numYears > 5 ? 'large' : '');

    return {
      width, height, avgLine, medianLine, avgPts, medianPts, avgLabels, medianLabels,
      yearLabels, dotRadius, fontSize, yearFontSize, avgColor, medianColor,
      sizeClass, showValueLabels, numYears
    };
  }
</script>

<div class="space-y-5">
  {#if fieldSamples.length === 0}
    <p class="text-sm text-slate-400 text-center py-8">Select a field to view nutrient trends.</p>
  {:else if nutrientCards.length === 0}
    <p class="text-sm text-slate-400 text-center py-8">No nutrient data available for this field.</p>
  {:else}
    <!-- Field header -->
    <div class="bg-white rounded-lg border border-slate-200 px-5 py-3">
      <h3 class="text-lg font-bold text-slate-800">{selectedField || 'All Fields'}</h3>
      <p class="text-xs text-slate-500">Years: {years.join(', ')} &middot; {fieldSamples.length} samples</p>
    </div>

    <!-- Nutrient Cards -->
    {#each nutrientCards as card}
      {@const chart = buildChart(card.yearData, card.color, card.attr, card.decimals)}
      <div class="rounded-xl border-2 bg-gradient-to-br {card.cardGradient} p-5 shadow-sm"
           style="box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <div class="flex items-start justify-between pb-3 mb-4 border-b border-black/8">
          <h4 class="text-xl font-bold text-slate-800">
            {card.name}
            {#if card.attr === 'P_Zn_Ratio'}
              <span class="text-slate-400 cursor-help ml-1 text-sm" title="High P relative to Zn can reduce Zn uptake even when soil Zn is moderate.">&#9432;</span>
            {/if}
          </h4>
          <div class="flex items-center gap-3">
            {#if card.badge}
              <span class="px-2 py-0.5 text-[10px] font-semibold rounded whitespace-nowrap"
                    style="background:{card.badge.bg}; color:{card.badge.color};">
                {card.badge.label}
              </span>
            {/if}
            {#if card.yearData.length > 1}
              <div class="text-right">
                <div class="text-2xl font-bold" style="color:{card.color}">
                  {card.pctChange >= 0 ? '+' : ''}{card.pctChange.toFixed(1)}%
                </div>
                <div class="text-xs text-slate-500 font-medium">{card.first.year} &rarr; {card.last.year}</div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Content: data table + graph side by side -->
        <div class="trend-content">
          <!-- Year data table -->
          <div class="trend-values">
            <div class="flex justify-between px-3 mb-1" style="font-size:0.7rem; color:#64748b;">
              <span></span>
              <span style="width:70px; text-align:center;">Avg</span>
              <span style="width:70px; text-align:center;">Median</span>
            </div>
            {#each card.yearData as d, i}
              <div class="flex justify-between items-center px-3 py-2 rounded text-sm {i % 2 === 0 ? 'bg-black/[0.03]' : ''}">
                <span class="font-semibold text-slate-600" style="min-width:50px;">{d.year}:</span>
                <span class="font-bold text-slate-800" style="width:70px; text-align:center;">{d.avg.toFixed(card.decimals)}</span>
                <span class="font-bold text-purple-600" style="width:70px; text-align:center;">{d.median.toFixed(card.decimals)}</span>
              </div>
            {/each}
            {#if card.yearData.length > 1}
              <div class="flex justify-between items-center px-3 pt-2 mt-2" style="border-top: 2px solid {card.color};">
                <span class="text-sm text-slate-500">Change:</span>
                <span class="font-bold text-sm" style="width:70px; text-align:center; color:{card.color};">{card.avgChange >= 0 ? '+' : ''}{card.avgChange.toFixed(card.decimals)}</span>
                <span class="font-bold text-sm text-purple-600" style="width:70px; text-align:center;">{card.medianChange >= 0 ? '+' : ''}{card.medianChange.toFixed(card.decimals)}</span>
              </div>
            {/if}
          </div>

          <!-- Graph -->
          {#if chart}
            <div class="trend-graph {chart.sizeClass}">
              <div class="flex gap-4 justify-center mb-1" style="font-size:0.7rem;">
                <span><span style="color:{chart.avgColor};">&#9679;</span> Average</span>
                <span><span style="color:{chart.medianColor};">&#9679;</span> Median</span>
              </div>
              <svg viewBox="0 0 {chart.width} {chart.height}" preserveAspectRatio="xMidYMid meet" class="w-full" style="min-height:{chart.height}px;">
                <!-- Average line -->
                <path d={chart.avgLine} fill="none" stroke={chart.avgColor} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <!-- Median line (dashed) -->
                <path d={chart.medianLine} fill="none" stroke={chart.medianColor} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6,3" />
                <!-- Average dots -->
                {#each chart.avgPts as p}
                  <circle cx={p.x} cy={p.y} r={chart.dotRadius} fill={chart.avgColor} stroke="white" stroke-width="2" />
                {/each}
                <!-- Median dots -->
                {#each chart.medianPts as p}
                  <circle cx={p.x} cy={p.y} r={chart.dotRadius} fill={chart.medianColor} stroke="white" stroke-width="2" />
                {/each}
                <!-- Value labels (up to 10 years) -->
                {#if chart.showValueLabels}
                  {#each chart.avgLabels as lbl}
                    <text x={lbl.x} y={lbl.y} text-anchor="middle" font-size={chart.fontSize} font-weight="700" fill={chart.avgColor}>{lbl.text}</text>
                  {/each}
                  {#each chart.medianLabels as lbl}
                    <text x={lbl.x} y={lbl.y} text-anchor="middle" font-size={chart.fontSize} font-weight="700" fill={chart.medianColor}>{lbl.text}</text>
                  {/each}
                {/if}
                <!-- Year labels -->
                {#each chart.yearLabels as lbl}
                  {#if lbl.show}
                    <text x={lbl.x} y={chart.height - 12} text-anchor="middle" font-size={chart.yearFontSize} font-weight="600" fill="#475569">{lbl.year}</text>
                  {/if}
                {/each}
              </svg>
            </div>
          {/if}
        </div>

        <!-- Trend statistics bar -->
        {#if card.trendInsight && card.yearData.length > 1}
          <div style="margin: 0.5rem 0; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 0.375rem; font-size: 0.75rem;">
            <div class="flex flex-wrap gap-3 items-center">
              <span><strong>Trend:</strong> {card.slope !== null ? `${card.slope >= 0 ? '+' : ''}${card.slope.toFixed(2)} ${card.attr === 'pH' ? '' : card.unit || 'ppm'}/yr` : 'N/A'}</span>
              <span><strong>Stability:</strong> {card.trendInsight.stability.metric} {card.trendInsight.stability.value.toFixed(card.attr === 'pH' ? 2 : 1)}{card.attr === 'pH' ? '' : '%'} ({card.trendInsight.stability.label})</span>
              <span><strong>Confidence:</strong> {card.trendInsight.confidence} ({card.yearData.length} yrs)</span>
            </div>
          </div>
        {/if}

        <!-- 5-Trigger insight card -->
        {#if card.triggerCard}
          {@const tc = card.triggerCard}
          {@const bc = BADGE_COLORS[tc.background] || BADGE_COLORS.neutral}
          <div class="rounded-md" style="margin-top: 0.75rem; padding: 0.75rem; background: {bc.bg}; border-left: 4px solid {bc.border}; font-size: 0.8rem;">
            <div class="font-semibold mb-2 text-slate-800">{tc.insight}</div>
            {#if tc.tips.length > 0}
              <ul style="margin: 0.5rem 0; padding-left: 1.25rem; color: #374151;">
                {#each tc.tips as tip}<li style="margin-bottom: 0.25rem;">{tip}</li>{/each}
              </ul>
            {/if}
            {#if tc.warnings.length > 0}
              <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.75rem; color: #6b7280;">
                {#each tc.warnings as w}<div style="margin-bottom: 0.25rem;">&#9888;&#65039; {w}</div>{/each}
              </div>
            {/if}
            <!-- Interaction notes inside the insight card -->
            {#if card.relevantNotes.length > 0}
              <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #94a3b8; font-size: 0.75rem;">
                <div class="font-semibold text-purple-700 mb-1">&#128279; Potential Interactions:</div>
                {#each card.relevantNotes as note}
                  <div style="margin-bottom: 0.25rem; color: #475569;">
                    {#if note.severity === 3}&#128308;{:else if note.severity === 2}&#128993;{:else}&#128161;{/if} {note.message}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Moisture warning (P and K only) -->
        {#if card.moistureWarning}
          {#if card.moistureWarning.type === 'dry'}
            <div style="margin-top: 0.5rem; font-size: 0.75rem; color: #92400e;">
              &#127797; Dry sampling: {card.attr} may test {card.moistureWarning.pctHigher} higher than actual plant-available levels.
            </div>
          {/if}
          {#if card.moistureWarning.mixed}
            <div style="margin-top: 0.25rem; font-size: 0.75rem; color: #64748b;">
              &#8505;&#65039; Some variability may be due to different moisture conditions at sampling.
            </div>
          {/if}
        {/if}

        <!-- CV explanation (volatile nutrients) -->
        {#if card.cvExplanation}
          <details style="margin-top: 0.5rem; font-size: 0.75rem; color: #64748b;" open>
            <summary style="cursor: pointer; color: #dc2626; font-weight: 500;">&#9888;&#65039; {card.cvExplanation.title}</summary>
            <div style="margin-top: 0.5rem; padding: 0.75rem; background: #fef2f2; border-radius: 0.375rem; border: 1px solid #fecaca;">
              <p style="margin-bottom: 0.5rem; color: #991b1b;">{card.cvExplanation.explanation}</p>
              <p style="margin: 0.5rem 0 0.25rem 0; font-weight: 600; color: #475569; font-size: 0.7rem;">Common drivers:</p>
              <ul style="margin: 0; padding-left: 1.25rem; color: #64748b; font-size: 0.7rem;">
                {#each card.cvExplanation.drivers as driver}
                  <li>{driver}</li>
                {/each}
              </ul>
              <p style="margin-top: 0.75rem; padding: 0.5rem; background: #f0fdf4; border-radius: 0.25rem; color: #166534; font-weight: 500;">&#128161; {card.cvExplanation.suggestion}</p>
            </div>
          </details>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .trend-content {
    display: flex;
    flex-wrap: nowrap;
    gap: 1rem;
    align-items: stretch;
  }

  .trend-values {
    background: rgba(255,255,255,0.7);
    border-radius: 0.5rem;
    padding: 0.5rem;
    min-width: 200px;
    flex: 0 0 auto;
    max-height: 400px;
    overflow-y: auto;
  }

  .trend-graph {
    flex: 1 1 auto;
    background: rgba(255,255,255,0.5);
    border-radius: 0.5rem;
    padding: 0.75rem;
    min-width: 300px;
  }

  .trend-graph :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    min-height: 180px;
  }

  .trend-graph.large :global(svg) {
    min-height: 220px;
  }

  .trend-graph.xlarge :global(svg) {
    min-height: 280px;
  }

  @media (max-width: 900px) {
    .trend-content {
      flex-direction: column;
    }
    .trend-graph {
      min-width: 100%;
      width: 100%;
    }
    .trend-graph :global(svg) {
      min-height: 200px;
    }
  }
</style>
