<script>
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { inSeasonData } from '$lib/stores/inSeason.js';

  $: fieldCount = Object.keys($boundaries).length;
  $: sampleCount = $samples.length;
  $: uniqueYears = [...new Set($samples.map(s => s.year).filter(Boolean))].sort();
  $: yieldCount = $samples.filter(s => s.yieldCorrelations && Object.keys(s.yieldCorrelations).length > 0).length;
  $: sapCount = $inSeasonData.filter(r => r.Type === 'SAP').length;
  $: tissueCount = $inSeasonData.filter(r => r.Type === 'TIS').length;
  $: soilCount = $inSeasonData.filter(r => r.Type === 'ISS').length;
  $: waterCount = $inSeasonData.filter(r => r.Type === 'WAT').length;
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4">
  <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Data Summary</h3>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
    <!-- Core data -->
    <div class="text-center p-3 bg-slate-50 rounded-lg">
      <div class="text-2xl font-bold text-slate-800">{fieldCount}</div>
      <div class="text-xs uppercase text-slate-500 mt-0.5">Fields</div>
    </div>
    <div class="text-center p-3 bg-slate-50 rounded-lg">
      <div class="text-2xl font-bold text-slate-800">{sampleCount}</div>
      <div class="text-xs uppercase text-slate-500 mt-0.5">Soil Samples</div>
    </div>
    <div class="text-center p-3 bg-slate-50 rounded-lg">
      <div class="text-2xl font-bold text-slate-800">{uniqueYears.length}</div>
      <div class="text-xs uppercase text-slate-500 mt-0.5">Years</div>
    </div>
    <div class="text-center p-3 bg-slate-50 rounded-lg">
      <div class="text-2xl font-bold text-slate-800">{yieldCount}</div>
      <div class="text-xs uppercase text-slate-500 mt-0.5">w/ Yield</div>
    </div>

    <!-- In-season data -->
    <div class="text-center p-3 bg-amber-50 rounded-lg">
      <div class="text-2xl font-bold text-amber-700">{sapCount}</div>
      <div class="text-xs uppercase text-amber-600 mt-0.5">Sap</div>
    </div>
    <div class="text-center p-3 bg-green-50 rounded-lg">
      <div class="text-2xl font-bold text-green-700">{tissueCount}</div>
      <div class="text-xs uppercase text-green-600 mt-0.5">Tissue</div>
    </div>
    <div class="text-center p-3 bg-purple-50 rounded-lg">
      <div class="text-2xl font-bold text-purple-700">{soilCount}</div>
      <div class="text-xs uppercase text-purple-600 mt-0.5">In-Season Soil</div>
    </div>
    <div class="text-center p-3 bg-blue-50 rounded-lg">
      <div class="text-2xl font-bold text-blue-700">{waterCount}</div>
      <div class="text-xs uppercase text-blue-600 mt-0.5">Water</div>
    </div>
  </div>
</div>
