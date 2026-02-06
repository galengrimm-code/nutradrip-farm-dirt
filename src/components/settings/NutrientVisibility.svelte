<script>
  import { nutrientVisibility } from '$lib/stores/settings.js';
  import { ALL_NUTRIENTS, DEFAULT_VISIBLE } from '$lib/core/config.js';

  let visibility = {};

  // Initialize from store, defaulting to DEFAULT_VISIBLE for unconfigured nutrients
  const saved = JSON.parse(localStorage.getItem('nutrientVisibility') || '{}');
  for (const n of ALL_NUTRIENTS) {
    if (n.key === 'sampleId') continue;
    if (saved[n.key] !== undefined) {
      visibility[n.key] = saved[n.key];
    } else {
      visibility[n.key] = DEFAULT_VISIBLE.includes(n.key);
    }
  }

  function save() {
    localStorage.setItem('nutrientVisibility', JSON.stringify(visibility));
    nutrientVisibility.set(visibility);
  }

  export function showAll() {
    for (const n of ALL_NUTRIENTS) {
      if (n.key !== 'sampleId') visibility[n.key] = true;
    }
    save();
  }

  export function resetToDefaults() {
    for (const n of ALL_NUTRIENTS) {
      if (n.key !== 'sampleId') {
        visibility[n.key] = DEFAULT_VISIBLE.includes(n.key);
      }
    }
    save();
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4">
  <h3 class="text-sm font-semibold text-slate-800 mb-3">Nutrient Visibility</h3>
  <p class="text-xs text-slate-500 mb-3">Choose which nutrients appear in dropdowns and tables.</p>

  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {#each ALL_NUTRIENTS as n}
      {#if n.key !== 'sampleId'}
        <label class="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 min-h-[44px]">
          <input type="checkbox" bind:checked={visibility[n.key]} onchange={save}
            class="w-5 h-5 rounded border-slate-300" />
          <span class="text-sm font-medium">{n.name}</span>
        </label>
      {/if}
    {/each}
  </div>
</div>
