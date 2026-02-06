<script>
  import { decimalPlaces } from '$lib/stores/settings.js';
  import { ALL_NUTRIENTS } from '$lib/core/config.js';

  const DEFAULT_DECIMAL_PLACES = {
    pH: 2, Buffer_pH: 2, OM: 2, P: 0, P2: 0, K: 0, CEC: 1,
    Ca_sat: 1, Mg_sat: 1, K_Sat: 1, H_Sat: 1, Na_Sat: 1,
    Zn: 2, Cu: 2, Mn: 1, Fe: 1, Boron: 2, S: 1,
    Ca: 0, Mg: 0, Na: 0, NO3: 1, NH4: 1, Soluble_Salts: 2, EC: 2, P_Zn_Ratio: 1
  };

  const nutrients = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId');

  let decimals = { ...DEFAULT_DECIMAL_PLACES };
  const saved = JSON.parse(localStorage.getItem('decimalPlaces') || '{}');
  for (const key of Object.keys(saved)) {
    decimals[key] = saved[key];
  }

  function save() {
    localStorage.setItem('decimalPlaces', JSON.stringify(decimals));
    decimalPlaces.set(decimals);
  }

  export function resetToDefaults() {
    decimals = { ...DEFAULT_DECIMAL_PLACES };
    save();
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4">
  <h3 class="text-sm font-semibold text-slate-800 mb-3">Decimal Places per Nutrient</h3>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
    {#each nutrients as n}
      <div class="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 rounded-lg">
        <span class="text-sm font-medium text-slate-700 truncate">{n.name}</span>
        <select bind:value={decimals[n.key]} onchange={save}
          class="w-14 px-1 py-2 border border-slate-300 rounded-md text-sm text-center bg-white min-h-[44px]">
          <option value={0}>0</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>
    {/each}
  </div>
</div>
