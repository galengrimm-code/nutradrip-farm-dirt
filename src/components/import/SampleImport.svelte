<script>
  import { showToast } from '$lib/stores/app.js';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { parseCSV, geojsonToSamples, analyzeColumns, normalizeNutrientData, assignSamplesToFields, deduplicateSamples, STANDARD_FIELDS, saveAlias } from '$lib/core/import-utils.js';
  import { saveToIndexedDB } from '$lib/core/data.js';
  import { get } from 'svelte/store';
  import FileDropZone from './FileDropZone.svelte';
  import ColumnMappingModal from './ColumnMappingModal.svelte';
  import shp from 'shpjs';

  let year = '';
  let depth = '6';
  let moisture = '';
  let importType = 'shapefile'; // 'shapefile' or 'csv'
  let files = [];
  let uploading = false;

  // Column mapping modal state
  let showMapping = false;
  let pendingSamples = [];
  let matchedCols = [];
  let unmatchedCols = [];

  function handleFiles(fileList) {
    files = Array.from(fileList);
  }

  async function uploadSamples() {
    if (importType === 'shapefile' && !year) { showToast('Sample Year is required for shapefiles', 'error'); return; }
    if (year) {
      const yearNum = parseInt(year);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) { showToast('Enter a valid year', 'error'); return; }
    }
    if (files.length === 0) { showToast('Please select file(s)', 'error'); return; }

    uploading = true;
    try {
      let newSamples = [];

      if (importType === 'shapefile') {
        const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
        const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
        const isZip = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');
        const jsonFile = files.find(f => f.name.toLowerCase().match(/\.(geo)?json$/));

        if (isZip) {
          const buf = await files[0].arrayBuffer();
          let geojson = await shp(buf);
          if (Array.isArray(geojson)) {
            geojson = { type: 'FeatureCollection', features: geojson.flatMap(g => g.features || []) };
          }
          newSamples = geojsonToSamples(geojson, year, depth, moisture || null);
        } else if (shpFile && dbfFile) {
          const geojson = await shp({ shp: await shpFile.arrayBuffer(), dbf: await dbfFile.arrayBuffer() });
          newSamples = geojsonToSamples(geojson, year, depth, moisture || null);
        } else if (jsonFile) {
          const geojson = JSON.parse(await jsonFile.text());
          newSamples = geojsonToSamples(geojson, year, depth, moisture || null);
        } else {
          throw new Error('Select a ZIP, Shapefile (.shp + .dbf), or GeoJSON');
        }
      } else {
        // CSV import
        const csvFile = files.find(f => f.name.toLowerCase().endsWith('.csv'));
        if (!csvFile) throw new Error('Select a CSV file');
        const text = await csvFile.text();
        newSamples = parseCSV(text, year, depth, moisture || null);
      }

      if (newSamples.length === 0) throw new Error('No samples found in file');

      // Check for unmatched columns
      const analysis = analyzeColumns(newSamples[0]);
      if (analysis.unmatched.length > 0) {
        pendingSamples = newSamples;
        matchedCols = analysis.matched;
        unmatchedCols = analysis.unmatched;
        showMapping = true;
        uploading = false;
        return;
      }

      await finishImport(newSamples);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      uploading = false;
    }
  }

  async function handleMappingConfirm(mappings, saveMappings) {
    showMapping = false;

    // Apply user mappings to samples
    for (const s of pendingSamples) {
      for (const [fileCol, stdCol] of Object.entries(mappings)) {
        if (stdCol && stdCol !== '(skip)' && s[fileCol] !== undefined) {
          s[stdCol] = parseFloat(s[fileCol]) || s[fileCol];
          if (saveMappings) saveAlias(stdCol, fileCol);
        }
      }
      normalizeNutrientData(s);
    }

    await finishImport(pendingSamples);
    pendingSamples = [];
  }

  async function finishImport(newSamples) {
    uploading = true;
    try {
      const currentSamples = get(samples);
      const { unique, duplicateCount } = deduplicateSamples(newSamples, currentSamples);

      if (unique.length === 0) {
        showToast('All samples already exist (duplicates skipped)', 'warning');
        return;
      }

      // Assign to fields
      const currentBoundaries = get(boundaries);
      if (Object.keys(currentBoundaries).length > 0) {
        assignSamplesToFields(unique, currentBoundaries);
      }

      // Merge and save
      const merged = [...currentSamples, ...unique];
      samples.set(merged);
      await saveToIndexedDB(merged, currentBoundaries);

      const assigned = unique.filter(s => s.field && s.field !== 'Unassigned').length;
      let msg = `Imported ${unique.length} samples`;
      if (assigned > 0) msg += `, ${assigned} assigned to fields`;
      if (duplicateCount > 0) msg += ` (${duplicateCount} duplicates skipped)`;
      showToast(msg, 'success');

      files = [];
      year = '';
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      uploading = false;
    }
  }
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
  <!-- Green accent header -->
  <div class="border-t-4 border-green-500 px-5 pt-4 pb-2">
    <h3 class="text-base font-semibold text-slate-800">Import Soil Samples</h3>
    <p class="text-xs text-slate-500 mt-0.5">Upload shapefiles, GeoJSON, or CSV with GPS coordinates</p>
  </div>

  <div class="px-5 pb-5 space-y-4">
    <!-- Row: Year, Depth, Moisture -->
    <div class="grid grid-cols-3 gap-3">
      <div>
        <label for="sample-year" class="text-xs font-medium text-slate-600 block mb-1">
          Year {#if importType === 'shapefile'}<span class="text-red-500">*</span>{:else}<span class="text-slate-400">(auto)</span>{/if}
        </label>
        <input
          id="sample-year"
          type="number"
          bind:value={year}
          placeholder={importType === 'csv' ? 'Auto-detect' : '2025'}
          min="1900"
          max="2100"
          class="w-full px-3 py-2.5 border rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none
                 {importType === 'shapefile' && !year ? 'border-red-300' : 'border-slate-300'}"
        />
      </div>
      <div>
        <label for="sample-depth" class="text-xs font-medium text-slate-600 block mb-1">Depth (in)</label>
        <input
          id="sample-depth"
          type="number"
          bind:value={depth}
          placeholder="6"
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
        />
      </div>
      <div>
        <label for="sample-moisture" class="text-xs font-medium text-slate-600 block mb-1">Moisture</label>
        <select
          id="sample-moisture"
          bind:value={moisture}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
        >
          <option value="">Not specified</option>
          <option value="Dry">Dry</option>
          <option value="Normal">Normal</option>
          <option value="Wet">Wet</option>
        </select>
      </div>
    </div>

    <!-- Import type selection -->
    <div>
      <span class="text-xs font-medium text-slate-600 block mb-2">Import Type</span>
      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          onclick={() => { importType = 'shapefile'; files = []; }}
          class="flex items-center gap-2 p-3 border-2 rounded-lg text-left transition-colors cursor-pointer min-h-[44px]
                 {importType === 'shapefile'
                   ? 'border-green-500 bg-green-50 text-green-800'
                   : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
        >
          <span class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                       {importType === 'shapefile' ? 'border-green-500' : 'border-slate-300'}">
            {#if importType === 'shapefile'}
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
            {/if}
          </span>
          <span class="text-sm font-medium">Shapefile / ZIP / GeoJSON</span>
        </button>

        <button
          type="button"
          onclick={() => { importType = 'csv'; files = []; year = ''; }}
          class="flex items-center gap-2 p-3 border-2 rounded-lg text-left transition-colors cursor-pointer min-h-[44px]
                 {importType === 'csv'
                   ? 'border-green-500 bg-green-50 text-green-800'
                   : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
        >
          <span class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                       {importType === 'csv' ? 'border-green-500' : 'border-slate-300'}">
            {#if importType === 'csv'}
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
            {/if}
          </span>
          <span class="text-sm font-medium">CSV with Column Mapping</span>
        </button>
      </div>
    </div>

    <!-- File drop zone -->
    {#if importType === 'shapefile'}
      <FileDropZone
        accept=".shp,.dbf,.shx,.prj,.zip,.json,.geojson"
        multiple={true}
        label="Drop shapefile, ZIP, or GeoJSON here"
        hint=".shp + .dbf, .zip, or .geojson"
        onfiles={handleFiles}
      />
    {:else}
      <FileDropZone
        accept=".csv"
        multiple={false}
        label="Drop CSV file here"
        hint=".csv with lat/lon columns"
        onfiles={handleFiles}
      />
    {/if}

    <!-- Upload button -->
    <button
      onclick={uploadSamples}
      disabled={uploading || files.length === 0}
      class="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
             hover:bg-green-700 active:bg-green-800 transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if uploading}
        <span class="inline-flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Importing...
        </span>
      {:else}
        Upload Samples
      {/if}
    </button>
  </div>
</div>

<!-- Column mapping modal -->
{#if showMapping}
  <ColumnMappingModal
    matched={matchedCols}
    unmatched={unmatchedCols}
    onconfirm={handleMappingConfirm}
    oncancel={() => { showMapping = false; pendingSamples = []; }}
  />
{/if}
