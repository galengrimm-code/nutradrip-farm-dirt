<script>
  import { selectedAttribute, compareMode } from '$lib/stores/filters.js';
  import { getNutrientName, getNutrientUnit } from '$lib/core/config.js';

  export let minVal = null;
  export let maxVal = null;

  $: gradient = $compareMode
    ? 'linear-gradient(to right, #b91c1c, #f87171, #d1d5db, #86efac, #15803d)'
    : 'linear-gradient(to right, #dc2626, #f97316, #eab308, #84cc16, #16a34a)';

  $: label = $compareMode ? 'Decrease ← → Increase' : 'Low → High';

  $: rangeText = (minVal !== null && maxVal !== null)
    ? `(${formatRange(minVal)} – ${formatRange(maxVal)}${getNutrientUnit($selectedAttribute) ? ' ' + getNutrientUnit($selectedAttribute) : ''})`
    : '';

  function formatRange(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
</script>

<div class="hidden md:flex items-center gap-2 absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]
            bg-white/95 backdrop-blur-sm rounded-lg shadow px-3 py-1.5 text-[11px]">
  <span class="text-slate-500 font-medium">Legend:</span>
  <div class="w-24 h-2.5 rounded-full" style="background: {gradient};"></div>
  <span class="text-slate-600 font-medium">{label}</span>
  {#if rangeText}
    <span class="text-slate-500 font-medium ml-0.5">{rangeText}</span>
  {/if}
</div>
