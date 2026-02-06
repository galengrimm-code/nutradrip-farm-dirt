<script>
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { activeClientId, activeFarmId } from '$lib/stores/filters.js';
  import { getActiveFields, loadFarmsData } from '$lib/core/data.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit, LOWER_IS_BETTER } from '$lib/core/config.js';

  export let selectedNutrient = 'pH';
  let selectedYear = 'most_recent';

  let sortColumn = 'avg';
  let sortDirection = 'desc';

  // Nutrient keys suitable for ranking (skip sampleId, ratios)
  const rankableNutrients = ALL_NUTRIENTS.filter(n =>
    n.key !== 'sampleId' && n.key !== 'P_Zn_Ratio'
  );

  $: availableYears = [...new Set(operationSamples.map(s => s.year).filter(Boolean))].sort((a, b) => b - a);

  $: nutrientLabel = getNutrientName(selectedNutrient);
  $: nutrientUnit = getNutrientUnit(selectedNutrient);
  $: lowerIsBetter = LOWER_IS_BETTER.includes(selectedNutrient);

  $: mostRecentYear = availableYears.length > 0 ? availableYears[0] : null;

  $: effectiveYear = selectedYear === 'most_recent' ? mostRecentYear : selectedYear;

  // Filter by active client/farm operation
  $: activeFields = getActiveFields($boundaries, loadFarmsData(), $activeClientId, $activeFarmId);
  $: operationSamples = $samples.filter(s => activeFields.includes(s.field));

  $: filteredSamples = effectiveYear
    ? operationSamples.filter(s => String(s.year) === String(effectiveYear))
    : operationSamples;

  $: fieldData = computeFieldData(filteredSamples, selectedNutrient);

  $: sortedFields = [...fieldData].sort((a, b) => {
    const aVal = a[sortColumn] ?? 0;
    const bVal = b[sortColumn] ?? 0;
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  $: overallAvg = fieldData.length > 0
    ? fieldData.reduce((sum, f) => sum + f.avg, 0) / fieldData.length
    : 0;

  function computeFieldData(sampleList, nutrient) {
    const byField = {};
    sampleList.forEach(s => {
      if (!s.field || s.field === 'Unassigned') return;
      const val = parseFloat(s[nutrient]);
      if (isNaN(val)) return;
      if (!byField[s.field]) byField[s.field] = [];
      byField[s.field].push(val);
    });

    return Object.entries(byField).map(([field, vals]) => {
      vals.sort((a, b) => a - b);
      return {
        field,
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        min: vals[0],
        max: vals[vals.length - 1],
        count: vals.length
      };
    });
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

  function getMedal(rank) {
    if (rank === 1) return '\uD83E\uDD47';
    if (rank === 2) return '\uD83E\uDD48';
    if (rank === 3) return '\uD83E\uDD49';
    return String(rank);
  }

  function getValueColor(value) {
    if (overallAvg === 0) return '';
    const ratio = value / overallAvg;
    if (lowerIsBetter) {
      if (ratio <= 0.85) return 'text-green-600 font-semibold';
      if (ratio >= 1.15) return 'text-red-600 font-semibold';
    } else {
      if (ratio >= 1.15) return 'text-green-600 font-semibold';
      if (ratio <= 0.85) return 'text-red-600 font-semibold';
    }
    return 'text-slate-700';
  }

  function formatVal(value) {
    if (value === null || value === undefined || isNaN(value)) return '\u2014';
    const def = ALL_NUTRIENTS.find(n => n.key === selectedNutrient);
    const decimals = def ? def.decimals : 1;
    return value.toFixed(decimals);
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h3 class="text-base font-bold text-slate-800">Field Rankings</h3>
      <p class="text-xs text-slate-400 mt-0.5">
        Rank fields by average {nutrientLabel}{nutrientUnit ? ` (${nutrientUnit})` : ''}
        {#if lowerIsBetter}
          <span class="ml-1 text-amber-500">&mdash; lower is better</span>
        {/if}
      </p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Nutrient</span>
        <select bind:value={selectedNutrient}
          class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          {#each rankableNutrients as n}
            <option value={n.key}>{n.name}{n.unit ? ` (${n.unit})` : ''}</option>
          {/each}
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Year</span>
        <select bind:value={selectedYear}
          class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          <option value="most_recent">Most Recent</option>
          {#each availableYears as yr}
            <option value={yr}>{yr}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if sortedFields.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <span class="text-4xl mb-3">{'\uD83C\uDF3E'}</span>
      <p class="text-lg font-medium text-slate-600">No field data</p>
      <p class="text-sm text-slate-400 mt-1">Import soil samples with field assignments to see rankings.</p>
    </div>
  {:else}
    <!-- Summary -->
    <div class="flex gap-4 text-xs text-slate-500">
      <span>{sortedFields.length} field{sortedFields.length !== 1 ? 's' : ''}</span>
      <span>Overall avg: <strong class="text-slate-700">{formatVal(overallAvg)}</strong></span>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="bg-slate-50">
            <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-14">
              Rank
            </th>
            <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('field')}>
              Field {getSortIcon('field')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('avg')}>
              Average {getSortIcon('avg')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('max')}>
              High {getSortIcon('max')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('min')}>
              Low {getSortIcon('min')}
            </th>
            <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none"
              onclick={() => sort('count')}>
              Samples {getSortIcon('count')}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedFields as row, i}
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="py-2 px-3 text-center font-medium">
                {getMedal(i + 1)}
              </td>
              <td class="py-2 px-3 font-medium text-slate-800">
                {row.field}
              </td>
              <td class="text-right py-2 px-3 font-mono {getValueColor(row.avg)}">
                {formatVal(row.avg)}
              </td>
              <td class="text-right py-2 px-3 font-mono text-slate-500">
                {formatVal(row.max)}
              </td>
              <td class="text-right py-2 px-3 font-mono text-slate-500">
                {formatVal(row.min)}
              </td>
              <td class="text-right py-2 px-3 text-slate-400">
                {row.count}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
