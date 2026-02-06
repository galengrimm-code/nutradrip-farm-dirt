<script>
  import Modal from '../shared/Modal.svelte';
  import { STANDARD_FIELDS } from '$lib/core/import-utils.js';

  export let matched = [];   // [{fileCol, standardCol}]
  export let unmatched = []; // [{fileCol, standardCol}]
  export let onconfirm = (mappings, saveAliases) => {};
  export let oncancel = () => {};

  let mappings = {};
  let saveAliases = true;

  // Initialize mappings from unmatched columns
  $: {
    const m = {};
    unmatched.forEach(u => { m[u.fileCol] = '(skip)'; });
    mappings = m;
  }

  $: mappedCount = Object.values(mappings).filter(v => v && v !== '(skip)').length;

  function confirm() {
    onconfirm(mappings, saveAliases);
  }
</script>

<Modal title="Column Mapping" onclose={oncancel}>
  <div class="space-y-5">
    <!-- Matched columns -->
    {#if matched.length > 0}
      <div>
        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Matched Columns ({matched.length})
        </h4>
        <div class="space-y-1">
          {#each matched as col}
            <div class="flex items-center gap-3 p-2 rounded-md bg-green-50">
              <span class="w-5 h-5 flex items-center justify-center text-green-600 shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span class="text-sm text-green-800 font-medium truncate">{col.fileCol}</span>
              <span class="text-xs text-green-500 shrink-0">&rarr;</span>
              <span class="text-sm text-green-700 truncate">{col.standardCol}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Unmatched columns -->
    {#if unmatched.length > 0}
      <div>
        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Unmatched Columns ({unmatched.length}) - Map or Skip
        </h4>
        <div class="space-y-1">
          {#each unmatched as col}
            <div class="flex items-center gap-3 p-2 rounded-md bg-amber-50">
              <span class="w-5 h-5 flex items-center justify-center text-amber-500 shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
                </svg>
              </span>
              <span class="text-sm text-amber-800 font-medium truncate min-w-0 shrink-0 max-w-[120px]" title={col.fileCol}>
                {col.fileCol}
              </span>
              <span class="text-xs text-amber-400 shrink-0">&rarr;</span>
              <select
                bind:value={mappings[col.fileCol]}
                class="flex-1 min-w-0 px-2 py-1.5 border border-amber-200 rounded-md text-sm bg-white min-h-[36px]
                       focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
              >
                <option value="(skip)">(skip)</option>
                {#each STANDARD_FIELDS as field}
                  <option value={field}>{field}</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Save aliases checkbox -->
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={saveAliases}
        class="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
      />
      <span class="text-sm text-slate-700">Save new mappings for future imports</span>
    </label>
  </div>

  <svelte:fragment slot="footer">
    <div class="flex items-center justify-between">
      <span class="text-xs text-slate-500">
        {mappedCount} of {unmatched.length} mapped
      </span>
      <div class="flex gap-3">
        <button
          onclick={oncancel}
          class="px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg min-h-[44px]
                 cursor-pointer hover:bg-slate-50 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onclick={confirm}
          class="px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg min-h-[44px]
                 cursor-pointer hover:bg-green-700 active:bg-green-800 transition-colors text-sm"
        >
          Import with Mappings
        </button>
      </div>
    </div>
  </svelte:fragment>
</Modal>
