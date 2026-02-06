<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, LOWER_IS_BETTER } from '$lib/core/config.js';
  import { onMount } from 'svelte';

  export let selectedNutrient = 'pH';

  let sortColumn = 'r';
  let sortDirection = 'desc';
  let showScatter = false;
  let canvasEl;

  // Nutrient keys for correlation (skip sampleId)
  const nutrientKeys = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId').map(n => n.key);

  // Get samples that have yield correlation data
  $: yieldSamples = $samples.filter(s =>
    s.yieldCorrelations && Object.keys(s.yieldCorrelations).length > 0
  );

  $: hasYieldData = yieldSamples.length > 0;

  // Compute correlations between each nutrient and yield
  $: correlations = computeCorrelations(yieldSamples);

  $: sortedCorrelations = [...correlations].sort((a, b) => {
    if (sortColumn === 'label') {
      const dir = sortDirection === 'asc' ? 1 : -1;
      return a.label.localeCompare(b.label) * dir;
    }
    const aVal = sortColumn === 'r' ? Math.abs(a[sortColumn]) : (a[sortColumn] || 0);
    const bVal = sortColumn === 'r' ? Math.abs(b[sortColumn]) : (b[sortColumn] || 0);
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Data points for the scatter plot
  $: scatterData = getScatterData(yieldSamples, selectedNutrient);
  $: selectedLabel = getNutrientName(selectedNutrient);

  function computeCorrelations(sampleList) {
    return nutrientKeys.map(nutrient => {
      const pairs = [];
      sampleList.forEach(s => {
        const nutrientVal = parseFloat(s[nutrient]);
        if (isNaN(nutrientVal)) return;
        const yields = Object.values(s.yieldCorrelations)
          .map(y => y.yield || y.avgYield)
          .filter(v => v > 0);
        if (yields.length === 0) return;
        const avgYield = yields.reduce((a, b) => a + b, 0) / yields.length;
        pairs.push({ x: nutrientVal, y: avgYield });
      });

      if (pairs.length < 3) {
        return { nutrient, label: getNutrientName(nutrient), r: 0, r2: 0, n: pairs.length, sig: '' };
      }

      const n = pairs.length;
      const sumX = pairs.reduce((a, p) => a + p.x, 0);
      const sumY = pairs.reduce((a, p) => a + p.y, 0);
      const sumXY = pairs.reduce((a, p) => a + p.x * p.y, 0);
      const sumX2 = pairs.reduce((a, p) => a + p.x * p.x, 0);
      const sumY2 = pairs.reduce((a, p) => a + p.y * p.y, 0);

      const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      const r = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
      const r2 = r * r;
      const absR = Math.abs(r);
      const sig = absR > 0.7 ? '***' : absR > 0.4 ? '**' : absR > 0.2 ? '*' : '';

      return { nutrient, label: getNutrientName(nutrient), r, r2, n, sig };
    }).filter(c => c.n >= 3);
  }

  function getScatterData(sampleList, nutrient) {
    const points = [];
    sampleList.forEach(s => {
      const x = parseFloat(s[nutrient]);
      if (isNaN(x)) return;
      Object.entries(s.yieldCorrelations).forEach(([yr, yc]) => {
        const y = yc.yield || yc.avgYield;
        if (y > 0) points.push({ x, y, field: s.field, year: yr });
      });
    });
    return points;
  }

  function sort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'desc';
    }
  }

  function getSortIcon(column) {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? '\u25B2' : '\u25BC';
  }

  function getCorrelationColor(r) {
    const absR = Math.abs(r);
    if (absR > 0.7) return 'text-green-600 font-bold';
    if (absR > 0.4) return 'text-amber-600 font-semibold';
    if (absR > 0.2) return 'text-slate-600';
    return 'text-slate-400';
  }

  function getCorrelationBg(r) {
    const absR = Math.abs(r);
    if (absR > 0.7) return 'bg-green-50';
    if (absR > 0.4) return 'bg-amber-50';
    return '';
  }

  function selectNutrientForScatter(nutrient) {
    selectedNutrient = nutrient;
    showScatter = true;
    // Need tick for canvas to render before drawing
    requestAnimationFrame(() => {
      if (canvasEl && scatterData.length > 0) drawScatter();
    });
  }

  // Redraw scatter plot when dependencies change
  $: if (showScatter && canvasEl && scatterData.length > 0) {
    // Use requestAnimationFrame to ensure canvas is in the DOM
    requestAnimationFrame(() => drawScatter());
  }

  function drawScatter() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width = canvasEl.offsetWidth * 2;
    const h = canvasEl.height = 400 * 2;
    ctx.scale(2, 2);
    const cw = w / 2, ch = h / 2;
    const pad = { top: 20, right: 20, bottom: 40, left: 50 };
    const pw = cw - pad.left - pad.right;
    const ph = ch - pad.top - pad.bottom;

    const xValues = scatterData.map(p => p.x);
    const yValues = scatterData.map(p => p.y);
    const xMin = Math.min(...xValues) * 0.95;
    const xMax = Math.max(...xValues) * 1.05;
    const yMin = Math.min(...yValues) * 0.9;
    const yMax = Math.max(...yValues) * 1.1;

    const sx = v => pad.left + ((v - xMin) / (xMax - xMin || 1)) * pw;
    const sy = v => pad.top + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

    // Clear
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);

    // Grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const yv = yMin + (yMax - yMin) * i / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, sy(yv));
      ctx.lineTo(cw - pad.right, sy(yv));
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(yv.toFixed(0), pad.left - 5, sy(yv) + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const xv = xMin + (xMax - xMin) * i / 4;
      ctx.beginPath();
      ctx.moveTo(sx(xv), pad.top);
      ctx.lineTo(sx(xv), ch - pad.bottom);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(xv.toFixed(1), sx(xv), ch - pad.bottom + 14);
    }

    // Data points
    scatterData.forEach(p => {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f680';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Regression line
    const n = scatterData.length;
    const sumX = scatterData.reduce((a, p) => a + p.x, 0);
    const sumY = scatterData.reduce((a, p) => a + p.y, 0);
    const sumXY = scatterData.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = scatterData.reduce((a, p) => a + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / n;

    ctx.beginPath();
    ctx.moveTo(sx(xMin), sy(slope * xMin + intercept));
    ctx.lineTo(sx(xMax), sy(slope * xMax + intercept));
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(selectedLabel, cw / 2, ch - 5);
    ctx.save();
    ctx.translate(12, ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Yield (bu/ac)', 0, 0);
    ctx.restore();
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h3 class="text-base font-bold text-slate-800">Yield Correlation</h3>
      <p class="text-xs text-slate-400 mt-0.5">
        Nutrient-yield relationships across soil samples
      </p>
    </div>
  </div>

  {#if !hasYieldData}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <span class="text-4xl mb-3">{'\uD83C\uDF3E'}</span>
      <p class="text-lg font-medium text-slate-600">No yield data available</p>
      <p class="text-sm text-slate-400 mt-1 max-w-sm">
        Import yield data from the Import page to see how soil nutrients correlate with crop yield.
      </p>
    </div>
  {:else}
    <!-- Summary stats -->
    <div class="flex gap-4 text-xs text-slate-500 flex-wrap">
      <span>{yieldSamples.length} sample{yieldSamples.length !== 1 ? 's' : ''} with yield data</span>
      <span>{correlations.length} nutrient{correlations.length !== 1 ? 's' : ''} analyzed</span>
      {#if correlations.filter(c => Math.abs(c.r) > 0.4).length > 0}
        <span class="text-amber-600 font-medium">
          {correlations.filter(c => Math.abs(c.r) > 0.4).length} significant correlation{correlations.filter(c => Math.abs(c.r) > 0.4).length !== 1 ? 's' : ''}
        </span>
      {/if}
    </div>

    <!-- Correlation Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="bg-slate-50">
            <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('label')}>
              Nutrient {getSortIcon('label')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('r')}>
              r {getSortIcon('r')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('r2')}>
              R{'\u00B2'} {getSortIcon('r2')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('n')}>
              n {getSortIcon('n')}
            </th>
            <th class="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">
              Sig
            </th>
            <th class="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">
              Plot
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedCorrelations as row}
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors {getCorrelationBg(row.r)}">
              <td class="py-2 px-3 font-medium text-slate-800">
                {row.label}
              </td>
              <td class="text-right py-2 px-3 font-mono {getCorrelationColor(row.r)}">
                {row.r >= 0 ? '+' : ''}{row.r.toFixed(3)}
              </td>
              <td class="text-right py-2 px-3 font-mono text-slate-600">
                {row.r2.toFixed(3)}
              </td>
              <td class="text-right py-2 px-3 text-slate-400">
                {row.n}
              </td>
              <td class="text-center py-2 px-3">
                {#if row.sig}
                  <span class="text-amber-500 font-bold">{row.sig}</span>
                {:else}
                  <span class="text-slate-300">&mdash;</span>
                {/if}
              </td>
              <td class="text-center py-2 px-3">
                <button onclick={() => selectNutrientForScatter(row.nutrient)}
                  class="px-2 py-1 text-xs rounded-md cursor-pointer
                    {selectedNutrient === row.nutrient && showScatter
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}">
                  {'\uD83D\uDCC8'}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Significance legend -->
    <div class="flex gap-4 text-xs text-slate-400 pt-1">
      <span><strong class="text-amber-500">***</strong> |r| &gt; 0.7 (strong)</span>
      <span><strong class="text-amber-500">**</strong> |r| &gt; 0.4 (moderate)</span>
      <span><strong class="text-amber-500">*</strong> |r| &gt; 0.2 (weak)</span>
    </div>

    <!-- Scatter plot toggle -->
    <div class="flex items-center gap-3 pt-2">
      <button onclick={() => { showScatter = !showScatter; }}
        class="px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors
          {showScatter ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        {showScatter ? 'Hide' : 'Show'} Scatter Plot
      </button>
      {#if showScatter}
        <span class="text-xs text-slate-400">
          {selectedLabel} vs Yield &mdash; {scatterData.length} point{scatterData.length !== 1 ? 's' : ''}
        </span>
      {/if}
    </div>

    <!-- Scatter plot canvas -->
    {#if showScatter}
      <div class="border border-slate-200 rounded-lg overflow-hidden">
        {#if scatterData.length === 0}
          <div class="flex items-center justify-center py-12 text-sm text-slate-400">
            No data points for {selectedLabel}
          </div>
        {:else}
          <canvas bind:this={canvasEl} class="w-full" style="height: 400px;"></canvas>
        {/if}
      </div>
    {/if}
  {/if}
</div>
