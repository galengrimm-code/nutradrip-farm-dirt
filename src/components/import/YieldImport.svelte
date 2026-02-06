<script>
  import { showToast } from '$lib/stores/app.js';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { yieldData, appendYieldData } from '$lib/stores/yield.js';
  import { assignSamplesToFields, parseYear } from '$lib/core/import-utils.js';
  import { saveToIndexedDB, saveYieldToIndexedDB } from '$lib/core/data.js';
  import FileDropZone from './FileDropZone.svelte';
  import { get } from 'svelte/store';
  import shp from 'shpjs';

  let cropYear = '';
  let cropType = '';
  let sampleRadius = '100';
  let files = [];
  let uploading = false;
  let progress = { current: 0, total: 0, matched: 0 };
  let showProgress = false;

  // Known yield column names
  const YIELD_COLUMNS = ['VRYIELDVO', 'Yld_Vol_Dr', 'Dry_Yield', 'Yld_Mass_D', 'YldMassDry', 'Yield', 'DryYield', 'YIELD', 'yld_vol_dr', 'Yld Vol(Dr'];
  const MOISTURE_COLUMNS = ['VRMOISTURE', 'Moisture', 'Moist', 'MOISTURE'];

  function handleFiles(fileList) {
    files = Array.from(fileList);
  }

  async function uploadYield() {
    if (!cropType) { showToast('Select a crop type', 'error'); return; }
    if (files.length === 0) { showToast('Select yield file(s)', 'error'); return; }

    uploading = true;
    showProgress = true;
    progress = { current: 0, total: 0, matched: 0 };

    try {
      // Collect all yield points from files
      const allPoints = [];
      const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
      const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
      const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));

      if (zipFiles.length > 0) {
        for (let i = 0; i < zipFiles.length; i++) {
          progress.current = i + 1;
          progress.total = zipFiles.length;
          progress = progress; // trigger reactivity
          const buf = await zipFiles[i].arrayBuffer();
          let geojson = await shp(buf);
          if (Array.isArray(geojson)) {
            geojson = { type: 'FeatureCollection', features: geojson.flatMap(g => g.features || []) };
          }
          const points = extractYieldPoints(geojson, zipFiles[i].name);
          allPoints.push(...points);
        }
      } else if (shpFile && dbfFile) {
        progress.current = 1;
        progress.total = 1;
        progress = progress;
        const geojson = await shp({ shp: await shpFile.arrayBuffer(), dbf: await dbfFile.arrayBuffer() });
        const points = extractYieldPoints(geojson, shpFile.name);
        allPoints.push(...points);
      } else {
        throw new Error('Select ZIP files or .shp + .dbf pairs');
      }

      if (allPoints.length === 0) throw new Error('No yield points found');

      // Match yield to soil samples within radius
      const currentSamples = get(samples);
      const currentBoundaries = get(boundaries);
      const radiusFt = parseFloat(sampleRadius);
      const radiusDeg = radiusFt * 0.3048 / 111320; // approximate degree conversion
      let matchedCount = 0;

      // Build updated samples
      const updated = [...currentSamples];
      for (const point of allPoints) {
        // Find closest soil sample within radius
        let closest = null;
        let closestDist = Infinity;

        for (let i = 0; i < updated.length; i++) {
          const s = updated[i];
          if (!s.lat || !s.lon) continue;
          const dLat = s.lat - point.lat;
          const dLon = s.lon - point.lon;
          const dist = Math.sqrt(dLat * dLat + dLon * dLon);
          if (dist < radiusDeg && dist < closestDist) {
            closest = i;
            closestDist = dist;
          }
        }

        if (closest !== null) {
          const s = updated[closest];
          if (!s.yieldCorrelations) s.yieldCorrelations = {};
          const yr = point.year || cropYear || new Date().getFullYear().toString();
          if (!s.yieldCorrelations[yr]) {
            s.yieldCorrelations[yr] = {
              yield: point.yield,
              crop: cropType,
              year: yr,
              moisture: point.moisture
            };
          } else {
            // Average with existing
            const existing = s.yieldCorrelations[yr];
            existing.yield = (existing.yield + point.yield) / 2;
          }
          matchedCount++;
        }
      }

      progress.matched = matchedCount;
      progress = progress;

      // Save updated samples
      samples.set(updated);
      await saveToIndexedDB(updated, currentBoundaries);

      // Also save raw yield points
      await appendYieldData(allPoints);

      showToast(`Processed ${allPoints.length} yield points, matched ${matchedCount} to soil samples`, 'success');
      files = [];
      cropYear = '';
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      uploading = false;
      showProgress = false;
    }
  }

  function extractYieldPoints(geojson, filename) {
    const features = geojson.features || [];
    const points = [];

    for (const f of features) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties || {};

      // Find yield column
      let yieldVal = null;
      for (const col of YIELD_COLUMNS) {
        if (props[col] !== undefined && props[col] !== null) {
          yieldVal = parseFloat(props[col]);
          break;
        }
      }
      if (yieldVal === null || isNaN(yieldVal) || yieldVal <= 0) continue;

      // Find moisture
      let moistureVal = null;
      for (const col of MOISTURE_COLUMNS) {
        if (props[col] !== undefined) {
          moistureVal = parseFloat(props[col]);
          break;
        }
      }

      // Detect year from timestamp or filename
      let year = cropYear;
      if (!year) {
        const timestamp = props.Time || props.Timestamp || props.IsoTime || props.DATE;
        if (timestamp) year = parseYear(String(timestamp));
        if (!year) {
          const yearMatch = filename.match(/(20\d{2})/);
          if (yearMatch) year = yearMatch[1];
        }
      }

      // Basic outlier filter
      if (yieldVal < 10 || yieldVal > 500) continue;

      points.push({ lat, lon, yield: yieldVal, moisture: moistureVal, year, crop: cropType, field: props.FIELD_NAME || props.Field || '' });
    }

    return points;
  }
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
  <!-- Amber accent header -->
  <div class="border-t-4 border-amber-500 px-5 pt-4 pb-2">
    <h3 class="text-base font-semibold text-slate-800">Import Yield Data</h3>
    <p class="text-xs text-slate-500 mt-0.5">Upload yield shapefiles (ZIP or .shp/.dbf) to correlate with soil nutrients</p>
  </div>

  <div class="px-5 pb-5 space-y-4">
    <!-- Row: Crop Year, Crop Type, Sample Radius -->
    <div class="grid grid-cols-3 gap-3">
      <div>
        <label for="yield-crop-year" class="text-xs font-medium text-slate-600 block mb-1">
          Crop Year
        </label>
        <input
          id="yield-crop-year"
          type="number"
          bind:value={cropYear}
          placeholder="Auto-detect"
          min="1900"
          max="2100"
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        />
      </div>
      <div>
        <label for="yield-crop-type" class="text-xs font-medium text-slate-600 block mb-1">
          Crop Type <span class="text-red-500">*</span>
        </label>
        <select
          id="yield-crop-type"
          bind:value={cropType}
          class="w-full px-3 py-2.5 border rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none
                 {cropType ? 'border-slate-300' : 'border-red-300'}"
        >
          <option value="">Select crop...</option>
          <option value="corn">Corn</option>
          <option value="soybeans">Soybeans</option>
          <option value="wheat">Wheat</option>
          <option value="amylose">Amylose</option>
        </select>
      </div>
      <div>
        <label for="yield-radius" class="text-xs font-medium text-slate-600 block mb-1">
          Sample Radius
        </label>
        <select
          id="yield-radius"
          bind:value={sampleRadius}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        >
          <option value="50">50 ft</option>
          <option value="100">100 ft</option>
          <option value="150">150 ft</option>
        </select>
      </div>
    </div>

    <!-- File drop zone -->
    <FileDropZone
      accept=".shp,.dbf,.prj,.shx,.zip"
      multiple={true}
      label="Drop yield shapefiles here or click to browse"
      hint="Accepts: .zip, .shp + .dbf pairs"
      onfiles={handleFiles}
    />

    <!-- Upload button -->
    <button
      onclick={uploadYield}
      disabled={uploading || files.length === 0}
      class="w-full py-2.5 bg-amber-500 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
             hover:bg-amber-600 active:bg-amber-700 transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if uploading}
        <span class="inline-flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Processing...
        </span>
      {:else}
        Upload Yield Data
      {/if}
    </button>
  </div>

  <!-- Progress overlay -->
  {#if showProgress}
    <div class="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-10 rounded-xl">
      <div class="w-4/5 max-w-xs space-y-3">
        <!-- Progress text -->
        <div class="text-center">
          <p class="text-sm font-semibold text-slate-800">
            Processing yield data...
          </p>
          {#if progress.total > 0}
            <p class="text-xs text-slate-500 mt-1">
              File {progress.current} of {progress.total}
            </p>
          {/if}
        </div>

        <!-- Progress bar -->
        <div class="w-full bg-slate-200 rounded-full h-2.5">
          <div
            class="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
            style="width: {progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%"
          ></div>
        </div>

        <!-- Match count -->
        {#if progress.matched > 0}
          <p class="text-xs text-center text-amber-700 font-medium">
            {progress.matched} points matched to samples
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>
