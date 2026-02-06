<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit, LOWER_IS_BETTER } from '$lib/core/config.js';

  export let year1 = '';
  export let year2 = '';

  // Nutrient keys (excluding sampleId)
  const nutrientKeys = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId').map(n => n.key);

  // Compute stats for a given year
  function getYearStats(samplesArr, year) {
    const yearSamples = samplesArr.filter(s => String(s.year) === String(year));
    const stats = {};
    nutrientKeys.forEach(n => {
      const vals = yearSamples.map(s => parseFloat(s[n])).filter(v => !isNaN(v));
      if (vals.length === 0) return;
      vals.sort((a, b) => a - b);
      stats[n] = {
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        min: vals[0],
        max: vals[vals.length - 1],
        count: vals.length
      };
    });
    return stats;
  }

  $: stats1 = getYearStats($samples, year1);
  $: stats2 = getYearStats($samples, year2);

  // Build comparison cards for all nutrients that have data in both years
  $: cards = nutrientKeys.filter(n => stats1[n] && stats2[n]).map(n => {
    const s1 = stats1[n];
    const s2 = stats2[n];
    const change = s2.avg - s1.avg;
    const pctChange = s1.avg !== 0 ? (change / s1.avg) * 100 : 0;
    const lowerBetter = LOWER_IS_BETTER.includes(n);
    const isImproving = lowerBetter ? change < 0 : change > 0;
    return {
      nutrient: n,
      label: getNutrientName(n),
      unit: getNutrientUnit(n),
      year1Stats: s1,
      year2Stats: s2,
      change,
      pctChange,
      direction: Math.abs(change) < 0.01 ? 'neutral' : isImproving ? 'positive' : 'negative'
    };
  });
</script>

{#if !year1 || !year2}
  <div class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
    Select two years to compare
  </div>
{:else if cards.length === 0}
  <div class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
    No matching data for these years
  </div>
{:else}
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each cards as card}
      <div class="bg-white rounded-xl border p-4
        {card.direction === 'positive' ? 'border-l-4 border-l-green-500' :
         card.direction === 'negative' ? 'border-l-4 border-l-red-500' :
         'border-l-4 border-l-slate-300'}">

        <div class="flex justify-between items-center mb-3">
          <span class="font-bold text-slate-800">{card.label}</span>
          <span class="text-sm font-bold px-2 py-0.5 rounded-full
            {card.direction === 'positive' ? 'text-green-600 bg-green-50' :
             card.direction === 'negative' ? 'text-red-600 bg-red-50' :
             'text-slate-500 bg-slate-100'}">
            {card.pctChange > 0 ? '+' : ''}{card.pctChange.toFixed(1)}%
          </span>
        </div>

        <!-- Year comparison -->
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3 mb-2">
          <div class="text-center">
            <div class="text-xs text-slate-400 font-semibold">{year1}</div>
            <div class="text-lg font-bold text-slate-800">{card.year1Stats.avg.toFixed(1)}</div>
          </div>
          <span class="text-slate-300 text-xl">&rarr;</span>
          <div class="text-center">
            <div class="text-xs text-slate-400 font-semibold">{year2}</div>
            <div class="text-lg font-bold text-slate-800">{card.year2Stats.avg.toFixed(1)}</div>
          </div>
        </div>

        <div class="flex justify-center gap-4 text-xs text-slate-500">
          <span>Change: <span class="font-semibold {card.direction === 'positive' ? 'text-green-600' : card.direction === 'negative' ? 'text-red-600' : ''}">{card.change > 0 ? '+' : ''}{card.change.toFixed(2)}</span></span>
          <span>Samples: {card.year2Stats.count}</span>
        </div>
      </div>
    {/each}
  </div>
{/if}
