<script>
  import { samples, uniqueYears, uniqueFields } from '$lib/stores/samples.js';
  import { boundaryFieldNames } from '$lib/stores/boundaries.js';
  import { selectedField, selectedAttribute, selectedYear, compareMode, compareYear } from '$lib/stores/filters.js';
  import { nutrientVisibility } from '$lib/stores/settings.js';
  import { isSignedIn } from '$lib/stores/app.js';
  import { ALL_NUTRIENTS, DEFAULT_VISIBLE, getNutrientName } from '$lib/core/config.js';

  export let onaddsite = () => {};
  export let onprintlabels = () => {};

  const STABILITY_NUTRIENTS = ['pH', 'P', 'K', 'OM', 'CEC', 'Ca_sat', 'Mg_sat', 'Zn', 'S'];

  let showPanel = false;

  function getVisibleNutrients() {
    const vis = $nutrientVisibility;
    return ALL_NUTRIENTS.filter(n => {
      if (Object.keys(vis).length === 0) return DEFAULT_VISIBLE.includes(n.key);
      return vis[n.key] !== false;
    });
  }

  function getAvailableYears() {
    let filtered = $samples;
    if ($selectedField !== 'all') {
      filtered = filtered.filter(s => s.field === $selectedField);
    }
    return [...new Set(filtered.map(s => s.year).filter(Boolean))].sort();
  }

  function getFieldOptions() {
    const fieldSet = new Set([...$boundaryFieldNames, ...$uniqueFields]);
    return [...fieldSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function toggleCompare() {
    compareMode.update(v => !v);
    if (!$compareMode) {
      compareYear.set(null);
    }
  }

  $: visibleNutrients = getVisibleNutrients();
  $: availableYears = getAvailableYears();
  $: fieldOptions = getFieldOptions();

  // Compare year options: all years except the currently selected year
  $: compareYearOptions = availableYears.filter(y => String(y) !== String($selectedYear));

  // Auto-select compare year when enabling compare mode
  $: if ($compareMode && !$compareYear && compareYearOptions.length > 0) {
    // Pick the year before the selected year
    const idx = availableYears.indexOf($selectedYear);
    if (idx > 0) {
      compareYear.set(availableYears[idx - 1]);
    } else if (compareYearOptions.length > 0) {
      compareYear.set(compareYearOptions[0]);
    }
  }

  // Disable compare mode if year is "most_recent" or "all"
  $: if ($selectedYear === 'most_recent' || $selectedYear === 'all') {
    if ($compareMode) {
      compareMode.set(false);
      compareYear.set(null);
    }
  }

  $: canCompare = $selectedYear !== 'most_recent' && $selectedYear !== 'all' && availableYears.length >= 2;
</script>

<!-- Desktop controls bar -->
<div class="hidden md:flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-200 flex-wrap">
  <!-- Field selector -->
  <div class="flex flex-col gap-0.5">
    <label for="desktop-field" class="text-[10px] font-semibold text-slate-500 uppercase">Field</label>
    <select
      id="desktop-field"
      bind:value={$selectedField}
      class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[140px]"
    >
      <option value="all">All Fields</option>
      {#each fieldOptions as field}
        <option value={field}>{field}</option>
      {/each}
    </select>
  </div>

  <!-- Attribute selector -->
  <div class="flex flex-col gap-0.5">
    <label for="desktop-attr" class="text-[10px] font-semibold text-slate-500 uppercase">Attribute</label>
    <select
      id="desktop-attr"
      bind:value={$selectedAttribute}
      class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[140px]"
    >
      {#each visibleNutrients as nutrient}
        <option value={nutrient.key}>{nutrient.name}</option>
      {/each}
      <option disabled>───── Stability (CV%) ─────</option>
      {#each STABILITY_NUTRIENTS as key}
        <option value="{key}_stability">{getNutrientName(key)} Stability</option>
      {/each}
    </select>
  </div>

  <!-- Year selector -->
  <div class="flex flex-col gap-0.5">
    <label for="desktop-year" class="text-[10px] font-semibold text-slate-500 uppercase">Year</label>
    <select
      id="desktop-year"
      bind:value={$selectedYear}
      class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[100px]"
    >
      {#if $selectedField === 'all'}
        <option value="most_recent">Most Recent</option>
      {:else}
        <option value="all">All Years</option>
      {/if}
      {#each availableYears as year}
        <option value={year}>{year}</option>
      {/each}
    </select>
  </div>

  <!-- Compare toggle (desktop only) -->
  {#if canCompare}
    <div class="flex flex-col gap-0.5">
      <span class="text-[10px] font-semibold text-slate-500 uppercase">&nbsp;</span>
      <button
        onclick={toggleCompare}
        class="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors
               {$compareMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'}"
      >
        {$compareMode ? '✕ Compare' : '⇄ Compare'}
      </button>
    </div>
  {/if}

  <!-- Compare year selector -->
  {#if $compareMode}
    <div class="flex flex-col gap-0.5">
      <label for="desktop-compare-year" class="text-[10px] font-semibold text-slate-500 uppercase">Compare To</label>
      <select
        id="desktop-compare-year"
        bind:value={$compareYear}
        class="px-2 py-1.5 border border-blue-300 rounded-md text-sm bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[100px]"
      >
        {#each compareYearOptions as year}
          <option value={year}>{year}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Spacer to push action buttons to the right -->
  <div class="flex-1"></div>

  <!-- Add Site + Print Labels (desktop only, when signed in) -->
  {#if $isSignedIn}
    <div class="flex items-end gap-2">
      <button
        onclick={onaddsite}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 cursor-pointer transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        Add Site
      </button>
      <button
        onclick={onprintlabels}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 cursor-pointer transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034l-.006.001"/></svg>
        Print Labels
      </button>
    </div>
  {/if}
</div>

<!-- Mobile floating filter button -->
<button
  class="md:hidden fixed bottom-20 right-4 z-[1001] w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg
         flex items-center justify-center text-lg active:bg-blue-700 transition-colors cursor-pointer"
  style="padding-bottom: env(safe-area-inset-bottom, 0px);"
  onclick={() => showPanel = !showPanel}
  aria-label="Toggle filters"
>
  🔍
</button>

<!-- Mobile slide-up panel -->
{#if showPanel}
  <!-- Backdrop -->
  <button
    class="md:hidden fixed inset-0 bg-black/40 z-[1002] cursor-default"
    onclick={() => showPanel = false}
    aria-label="Close filters"
  ></button>

  <!-- Panel -->
  <div class="md:hidden fixed bottom-0 inset-x-0 z-[1003] bg-white rounded-t-2xl shadow-2xl"
       style="padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));">
    <!-- Drag handle -->
    <div class="flex justify-center pt-3 pb-2">
      <div class="w-10 h-1 bg-slate-300 rounded-full"></div>
    </div>

    <div class="px-5 pb-4 space-y-4">
      <h3 class="text-sm font-semibold text-slate-700">Map Filters</h3>

      <div class="space-y-3">
        <div>
          <label for="mobile-field" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Field</label>
          <select
            id="mobile-field"
            bind:value={$selectedField}
            class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]"
          >
            <option value="all">All Fields</option>
            {#each fieldOptions as field}
              <option value={field}>{field}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="mobile-attr" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Attribute</label>
          <select
            id="mobile-attr"
            bind:value={$selectedAttribute}
            class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]"
          >
            {#each visibleNutrients as nutrient}
              <option value={nutrient.key}>{nutrient.name}</option>
            {/each}
            <option disabled>───── Stability (CV%) ─────</option>
            {#each STABILITY_NUTRIENTS as key}
              <option value="{key}_stability">{getNutrientName(key)} Stability</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="mobile-year" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Year</label>
          <select
            id="mobile-year"
            bind:value={$selectedYear}
            class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]"
          >
            {#if $selectedField === 'all'}
              <option value="most_recent">Most Recent</option>
            {:else}
              <option value="all">All Years</option>
            {/if}
            {#each availableYears as year}
              <option value={year}>{year}</option>
            {/each}
          </select>
        </div>

        <!-- Compare on mobile -->
        {#if canCompare}
          <div class="flex items-center gap-3 pt-1">
            <button
              onclick={toggleCompare}
              class="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors min-h-[44px]
                     {$compareMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'}"
            >
              {$compareMode ? '✕ Compare Off' : '⇄ Compare'}
            </button>
            {#if $compareMode}
              <select
                bind:value={$compareYear}
                class="flex-1 px-3 py-2.5 border border-blue-300 rounded-lg text-base bg-blue-50 min-h-[44px]"
              >
                {#each compareYearOptions as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
            {/if}
          </div>
        {/if}
      </div>

      <button
        class="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer active:bg-blue-700"
        onclick={() => showPanel = false}
      >
        Apply
      </button>
    </div>
  </div>
{/if}
