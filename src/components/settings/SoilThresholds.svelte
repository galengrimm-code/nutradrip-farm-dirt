<script>
  import { soilSettings } from '$lib/stores/settings.js';

  const defaults = {
    pH_critical: 5.5, pH_min: 6.3, pH_max: 7.0,
    P_critical: 15, P_min: 25, P_max: 50,
    K_critical: 120, K_min: 150, K_max: 250,
    OM_critical: 2.0, OM_min: 3.0, OM_max: 5.0,
    S_critical: 8, S_min: 12, S_max: 30,
    Ca_sat_critical: 55, Ca_sat_min: 65, Ca_sat_max: 75,
    Mg_sat_critical: 8, Mg_sat_min: 10, Mg_sat_max: 15,
    K_sat_critical: 2.0, K_sat_min: 3.0, K_sat_max: 5.0,
    H_sat_max: 5.0,
    bufferPercent: 25
  };

  let settings = { ...defaults, ...JSON.parse(localStorage.getItem('soilSettings') || '{}') };

  $: soilSettings.set(settings);

  function onInput() {
    localStorage.setItem('soilSettings', JSON.stringify(settings));
    soilSettings.set(settings);
  }

  export function saveSettings() {
    localStorage.setItem('soilSettings', JSON.stringify(settings));
    soilSettings.set(settings);
  }

  export function resetToDefaults() {
    settings = { ...defaults };
    localStorage.setItem('soilSettings', JSON.stringify(settings));
    soilSettings.set(settings);
  }
</script>

<!-- pH -->
<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
  <h3 class="text-sm font-semibold text-slate-800">pH</h3>
  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">pH</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.pH_critical} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.pH_min} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.pH_max} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
    </div>
  </div>
</div>

<!-- Macronutrients -->
<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
  <h3 class="text-sm font-semibold text-slate-800">Macronutrients</h3>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Phosphorus (P)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.P_critical} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.P_min} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.P_max} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">ppm</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Potassium (K)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.K_critical} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.K_min} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.K_max} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">ppm</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Organic Matter</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.OM_critical} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.OM_min} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.OM_max} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">%</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Sulfur (S)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.S_critical} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.S_min} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.S_max} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">ppm</span>
    </div>
  </div>
</div>

<!-- Base Saturation -->
<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
  <h3 class="text-sm font-semibold text-slate-800">Base Saturation</h3>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Calcium (Ca)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.Ca_sat_critical} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.Ca_sat_min} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.Ca_sat_max} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">%</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Magnesium (Mg)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.Mg_sat_critical} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.Mg_sat_min} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.Mg_sat_max} oninput={onInput} step="1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">%</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Potassium (K)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-red-600 font-medium">Crit:</span>
      <input type="number" bind:value={settings.K_sat_critical} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-green-600 font-medium">Opt:</span>
      <input type="number" bind:value={settings.K_sat_min} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">to</span>
      <input type="number" bind:value={settings.K_sat_max} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">%</span>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Hydrogen (H)</span>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-amber-600 font-medium">Max:</span>
      <input type="number" bind:value={settings.H_sat_max} oninput={onInput} step="0.1"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">%</span>
      <span class="text-xs text-slate-400 italic ml-1">(lower is better)</span>
    </div>
  </div>
</div>

<!-- Display -->
<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
  <h3 class="text-sm font-semibold text-slate-800">Display</h3>
  <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded-lg">
    <span class="font-semibold text-slate-700 sm:min-w-[140px]">Buffer Zone Width</span>
    <div class="flex items-center gap-2 flex-wrap">
      <input type="number" bind:value={settings.bufferPercent} oninput={onInput} step="1" min="0" max="100"
        class="w-[65px] px-2 py-2.5 border border-slate-300 rounded-md text-center text-base min-h-[44px]" />
      <span class="text-xs text-slate-500">% (yellow warning zone width)</span>
    </div>
  </div>
</div>
