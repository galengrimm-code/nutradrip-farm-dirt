<script>
  import { samples, uniqueYears, uniqueFields } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName } from '$lib/core/config.js';

  export let selectedField = '';
  export let selectedNutrient = 'pH';
  export let selectedYear = '';
  export let compareYear = '';

  // Filter out sampleId from nutrient options
  const nutrients = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId');

  $: years = $uniqueYears.slice().sort((a, b) => b - a);
  $: fields = $uniqueFields.slice().sort();

  // Auto-set years when data loads
  $: if (years.length > 0 && !selectedYear) {
    selectedYear = String(years[0]);
    compareYear = years.length > 1 ? String(years[1]) : '';
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 px-4 py-3">
  <div class="flex flex-wrap gap-3 items-end">
    <!-- Field selector -->
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-500 uppercase">Field</span>
      <select bind:value={selectedField}
        class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
        <option value="">All Fields</option>
        {#each fields as field}
          <option value={field}>{field}</option>
        {/each}
      </select>
    </div>

    <!-- Nutrient selector -->
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-500 uppercase">Nutrient</span>
      <select bind:value={selectedNutrient}
        class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
        {#each nutrients as n}
          <option value={n.key}>{n.name}{n.unit ? ` (${n.unit})` : ''}</option>
        {/each}
      </select>
    </div>

    <!-- Year 1 selector -->
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-500 uppercase">Year 1</span>
      <select bind:value={selectedYear}
        class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
        <option value="">Select Year</option>
        {#each years as year}
          <option value={String(year)}>{year}</option>
        {/each}
      </select>
    </div>

    <!-- Year 2 selector (comparison) -->
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-500 uppercase">Year 2</span>
      <select bind:value={compareYear}
        class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
        <option value="">Select Year</option>
        {#each years as year}
          <option value={String(year)}>{year}</option>
        {/each}
      </select>
    </div>
  </div>
</div>
