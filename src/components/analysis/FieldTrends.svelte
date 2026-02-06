<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit, LOWER_IS_BETTER } from '$lib/core/config.js';

  export let selectedField = '';
  export let selectedNutrient = 'pH';

  // Get filtered samples
  $: filteredSamples = selectedField
    ? $samples.filter(s => s.field === selectedField)
    : $samples;

  // Group by year and compute stats
  $: yearStats = computeYearStats(filteredSamples, selectedNutrient);

  // Compute trend
  $: trend = computeTrend(yearStats);

  function computeYearStats(samps, nutrient) {
    const byYear = {};
    samps.forEach(s => {
      if (!s.year || s[nutrient] === undefined || s[nutrient] === null || s[nutrient] === '') return;
      const val = parseFloat(s[nutrient]);
      if (isNaN(val)) return;
      if (!byYear[s.year]) byYear[s.year] = [];
      byYear[s.year].push(val);
    });

    return Object.entries(byYear)
      .map(([year, vals]) => {
        vals.sort((a, b) => a - b);
        const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
        const median = vals.length % 2 === 0
          ? (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2
          : vals[Math.floor(vals.length / 2)];
        const min = vals[0];
        const max = vals[vals.length - 1];
        const sd = Math.sqrt(vals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / vals.length);
        return { year: parseInt(year), avg, median, min, max, sd, count: vals.length };
      })
      .sort((a, b) => a.year - b.year);
  }

  function computeTrend(stats) {
    if (stats.length < 2) return null;
    const n = stats.length;
    const xs = stats.map((_, i) => i);
    const ys = stats.map(s => s.avg);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, xv, i) => a + xv * ys[i], 0);
    const sumX2 = xs.reduce((a, xv) => a + xv * xv, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const totalChange = slope * (n - 1);
    const pctChange = ys[0] !== 0 ? (totalChange / ys[0]) * 100 : 0;
    const direction = LOWER_IS_BETTER.includes(selectedNutrient)
      ? (slope < -0.001 ? 'improving' : slope > 0.001 ? 'declining' : 'stable')
      : (slope > 0.001 ? 'improving' : slope < -0.001 ? 'declining' : 'stable');
    return { slope, totalChange, pctChange, direction };
  }

  // SVG chart dimensions
  const chartWidth = 600;
  const chartHeight = 220;
  const padding = { top: 20, right: 30, bottom: 35, left: 50 };

  $: plotWidth = chartWidth - padding.left - padding.right;
  $: plotHeight = chartHeight - padding.top - padding.bottom;

  $: yMin = yearStats.length ? Math.min(...yearStats.map(s => s.min)) * 0.9 : 0;
  $: yMax = yearStats.length ? Math.max(...yearStats.map(s => s.max)) * 1.1 : 100;
  $: yRange = yMax - yMin || 1;

  function xPos(i) {
    return padding.left + (yearStats.length > 1 ? (i / (yearStats.length - 1)) * plotWidth : plotWidth / 2);
  }
  function yPos(val) {
    return padding.top + plotHeight - ((val - yMin) / yRange) * plotHeight;
  }

  // Build SVG paths
  $: avgPath = yearStats.map((s, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s.avg).toFixed(1)}`).join(' ');
  $: medianPath = yearStats.map((s, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s.median).toFixed(1)}`).join(' ');

  // Range band (min to max)
  $: rangePath = yearStats.length > 1
    ? 'M' + yearStats.map((s, i) => `${xPos(i).toFixed(1)},${yPos(s.max).toFixed(1)}`).join(' L') +
      ' L' + yearStats.slice().reverse().map((s, i) => `${xPos(yearStats.length - 1 - i).toFixed(1)},${yPos(s.min).toFixed(1)}`).join(' L') + ' Z'
    : '';

  // Y-axis ticks
  $: yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i / 4));

  $: trendColor = trend?.direction === 'improving' ? '#22c55e' : trend?.direction === 'declining' ? '#ef4444' : '#64748b';

  $: nutrientLabel = getNutrientName(selectedNutrient);
  $: nutrientUnit = getNutrientUnit(selectedNutrient);
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div>
      <h3 class="text-lg font-bold text-slate-800">
        {nutrientLabel} Trends
        {#if nutrientUnit}
          <span class="text-sm font-normal text-slate-400">({nutrientUnit})</span>
        {/if}
      </h3>
      <p class="text-xs text-slate-500">
        {selectedField || 'All Fields'} &bull; {yearStats.length} year{yearStats.length !== 1 ? 's' : ''}
      </p>
    </div>
    {#if trend}
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold"
           style="color: {trendColor}; background: {trendColor}11;">
        {trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→'}
        {Math.abs(trend.pctChange).toFixed(1)}%
      </div>
    {/if}
  </div>

  {#if yearStats.length === 0}
    <p class="text-sm text-slate-400 text-center py-8">No data for this nutrient/field combination.</p>
  {:else}
    <svg viewBox="0 0 {chartWidth} {chartHeight}" class="w-full" preserveAspectRatio="xMidYMid meet">
      <!-- Range band -->
      {#if rangePath}
        <path d={rangePath} fill="#3b82f6" opacity="0.1" />
      {/if}

      <!-- Grid lines and Y-axis labels -->
      {#each yTicks as tick}
        <line x1={padding.left} y1={yPos(tick)} x2={chartWidth - padding.right} y2={yPos(tick)}
              stroke="#e2e8f0" stroke-width="1" />
        <text x={padding.left - 8} y={yPos(tick) + 4} text-anchor="end" fill="#94a3b8" font-size="11">
          {tick.toFixed(tick < 10 ? 1 : 0)}
        </text>
      {/each}

      <!-- Average line -->
      <path d={avgPath} fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Median line (dashed) -->
      <path d={medianPath} fill="none" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="6,4" stroke-linecap="round" />

      <!-- Data points and labels -->
      {#each yearStats as stat, i}
        <circle cx={xPos(i)} cy={yPos(stat.avg)} r="5" fill="#3b82f6" stroke="white" stroke-width="2" />
        <!-- Year label on x-axis -->
        <text x={xPos(i)} y={chartHeight - 5} text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">
          {stat.year}
        </text>
        <!-- Value label above point -->
        {#if yearStats.length <= 10}
          <text x={xPos(i)} y={yPos(stat.avg) - 10} text-anchor="middle" fill="#1e293b" font-size="10" font-weight="600">
            {stat.avg.toFixed(1)}
          </text>
        {/if}
      {/each}
    </svg>

    <!-- Legend -->
    <div class="flex gap-4 text-xs text-slate-500 justify-center">
      <div class="flex items-center gap-1">
        <div class="w-4 h-0.5 bg-blue-500 rounded"></div>
        <span>Average</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-4 h-0.5 rounded" style="border-top: 2px dashed #8b5cf6;"></div>
        <span>Median</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-4 h-2 bg-blue-500/10 rounded"></div>
        <span>Range</span>
      </div>
    </div>

    <!-- Stats table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs text-slate-500 uppercase">
            <th class="text-left py-2 px-2">Year</th>
            <th class="text-right py-2 px-2">Avg</th>
            <th class="text-right py-2 px-2">Median</th>
            <th class="text-right py-2 px-2">Min</th>
            <th class="text-right py-2 px-2">Max</th>
            <th class="text-right py-2 px-2">Samples</th>
          </tr>
        </thead>
        <tbody>
          {#each yearStats as stat}
            <tr class="border-t border-slate-100">
              <td class="py-2 px-2 font-semibold">{stat.year}</td>
              <td class="text-right py-2 px-2 font-mono">{stat.avg.toFixed(1)}</td>
              <td class="text-right py-2 px-2 font-mono text-purple-600">{stat.median.toFixed(1)}</td>
              <td class="text-right py-2 px-2 font-mono text-slate-400">{stat.min.toFixed(1)}</td>
              <td class="text-right py-2 px-2 font-mono text-slate-400">{stat.max.toFixed(1)}</td>
              <td class="text-right py-2 px-2 text-slate-400">{stat.count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
