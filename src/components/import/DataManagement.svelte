<script>
  import { showToast, isSignedIn } from '$lib/stores/app.js';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { yieldData } from '$lib/stores/yield.js';
  import { inSeasonData } from '$lib/stores/inSeason.js';
  import { assignSamplesToFields, isPointInOrNearPolygon } from '$lib/core/import-utils.js';
  import { saveToIndexedDB, saveYieldToIndexedDB, SheetsAPI, loadFromIndexedDB, loadYieldFromIndexedDB, loadInSeasonFromIndexedDB } from '$lib/core/data.js';
  import { soilSettings } from '$lib/stores/settings.js';
  import { get } from 'svelte/store';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';

  let syncing = false;
  let confirmAction = null;

  // ========== OUTLIER DETECTION ==========
  let showThresholds = false;
  let detectedOutliers = [];
  let selectAll = true;
  let scanning = false;
  let confirmDeleteOutliers = false;

  function getOutlierThresholds() {
    const saved = localStorage.getItem('outlierThresholds');
    if (saved) return JSON.parse(saved);
    return { cornMin: 50, cornMax: 350, soyMin: 20, soyMax: 100, pHMin: 4.5, pHMax: 8.5, pMax: 300, kMax: 800, cecMax: 50, omMax: 15 };
  }

  let thresholds = getOutlierThresholds();

  function saveThresholds() {
    localStorage.setItem('outlierThresholds', JSON.stringify(thresholds));
    showToast('Outlier thresholds saved', 'success');
  }

  function getYieldThresholdsForCrop(crop) {
    const c = (crop || '').toLowerCase();
    if (c.includes('soy') || c.includes('bean')) return { min: thresholds.soyMin || 20, max: thresholds.soyMax || 100 };
    return { min: thresholds.cornMin || 50, max: thresholds.cornMax || 350 };
  }

  function scanForOutliers() {
    scanning = true;
    detectedOutliers = [];
    const currentSamples = get(samples);

    currentSamples.forEach((sample, index) => {
      const field = sample.field || 'Unknown';
      const year = sample.year || 'N/A';
      const sampleId = sample.sampleId || `#${index + 1}`;

      const pH = parseFloat(sample.pH);
      if (!isNaN(pH) && pH > 0) {
        if (pH < thresholds.pHMin) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'pH too low', value: pH.toFixed(2), selected: true });
        else if (pH > thresholds.pHMax) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'pH too high', value: pH.toFixed(2), selected: true });
      }

      const P = parseFloat(sample.P);
      if (!isNaN(P) && P > thresholds.pMax) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'P too high', value: P.toFixed(0) + ' ppm', selected: true });

      const K = parseFloat(sample.K);
      if (!isNaN(K) && K > thresholds.kMax) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'K too high', value: K.toFixed(0) + ' ppm', selected: true });

      const CEC = parseFloat(sample.CEC);
      if (!isNaN(CEC) && CEC > thresholds.cecMax) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'CEC too high', value: CEC.toFixed(1), selected: true });

      const OM = parseFloat(sample.OM);
      if (!isNaN(OM) && OM > thresholds.omMax) detectedOutliers.push({ type: 'sample', index, field, year, sampleId, dataType: 'Nutrient', issue: 'OM too high', value: OM.toFixed(2) + '%', selected: true });

      // Yield outliers
      if (sample.yieldInfo && Array.isArray(sample.yieldInfo)) {
        sample.yieldInfo.forEach((yi, yiIndex) => {
          const avgYield = yi.avgYield;
          if (!avgYield || avgYield <= 0) return;
          const ct = getYieldThresholdsForCrop(yi.crop);
          if (avgYield < ct.min) detectedOutliers.push({ type: 'yield', sampleIndex: index, yieldIndex: yiIndex, field, year: yi.year || 'N/A', sampleId, dataType: `Yield (${yi.crop || 'unknown'})`, issue: `Yield too low (<${ct.min})`, value: avgYield.toFixed(1) + ' bu/ac', selected: true });
          else if (avgYield > ct.max) detectedOutliers.push({ type: 'yield', sampleIndex: index, yieldIndex: yiIndex, field, year: yi.year || 'N/A', sampleId, dataType: `Yield (${yi.crop || 'unknown'})`, issue: `Yield too high (>${ct.max})`, value: avgYield.toFixed(1) + ' bu/ac', selected: true });
        });
      }
    });

    detectedOutliers = detectedOutliers;
    selectAll = true;
    scanning = false;
    if (detectedOutliers.length === 0) showToast('No outliers detected! Data looks clean.', 'success');
  }

  function scanOrphanedSamples() {
    const currentBoundaries = get(boundaries);
    if (Object.keys(currentBoundaries).length === 0) { showToast('No field boundaries loaded. Import boundaries first.', 'error'); return; }

    scanning = true;
    detectedOutliers = [];
    const currentSamples = get(samples);

    currentSamples.forEach((sample, index) => {
      if (!sample.lat || !sample.lon) return;
      let isInside = false;

      for (const [fieldName, fieldData] of Object.entries(currentBoundaries)) {
        const polys = fieldData.boundary || fieldData;
        const polyArray = Array.isArray(polys[0]?.[0]) ? polys : [polys];
        for (const poly of polyArray) {
          if (isPointInOrNearPolygon([sample.lat, sample.lon], poly)) {
            isInside = true;
            break;
          }
        }
        if (isInside) break;
      }

      if (!isInside) {
        detectedOutliers.push({
          type: 'sample', index,
          field: sample.field || 'Unassigned',
          year: sample.year || 'N/A',
          sampleId: sample.sampleId || `#${index + 1}`,
          dataType: 'Outside Boundary',
          issue: 'Not inside any field',
          value: `${parseFloat(sample.lat).toFixed(5)}, ${parseFloat(sample.lon).toFixed(5)}`,
          selected: true
        });
      }
    });

    detectedOutliers = detectedOutliers;
    selectAll = true;
    scanning = false;
    if (detectedOutliers.length === 0) showToast('All samples are inside field boundaries!', 'success');
  }

  function toggleSelectAll(checked) {
    selectAll = checked;
    detectedOutliers = detectedOutliers.map(o => ({ ...o, selected: checked }));
  }

  $: selectedCount = detectedOutliers.filter(o => o.selected).length;

  async function deleteSelectedOutliers() {
    confirmDeleteOutliers = false;
    const toDelete = detectedOutliers.filter(o => o.selected);
    if (toDelete.length === 0) return;

    const currentSamples = get(samples);
    const currentBoundaries = get(boundaries);

    // Handle yield deletes first
    const yieldDeletes = toDelete.filter(o => o.type === 'yield');
    yieldDeletes.forEach(o => {
      const sample = currentSamples[o.sampleIndex];
      if (sample?.yieldInfo) sample.yieldInfo.splice(o.yieldIndex, 1);
    });

    // Delete full samples (sorted reverse to maintain indices)
    const sampleIndices = [...new Set(toDelete.filter(o => o.type === 'sample').map(o => o.index))].sort((a, b) => b - a);
    sampleIndices.forEach(idx => currentSamples.splice(idx, 1));

    samples.set([...currentSamples]);
    await saveToIndexedDB(currentSamples, currentBoundaries);

    // Audit log
    const log = JSON.parse(localStorage.getItem('outlierAuditLog') || '[]');
    log.unshift({
      date: new Date().toISOString(),
      total: toDelete.length,
      nutrients: toDelete.filter(o => o.dataType === 'Nutrient').length,
      yields: toDelete.filter(o => o.dataType.startsWith('Yield')).length,
      outside: toDelete.filter(o => o.dataType === 'Outside Boundary').length
    });
    if (log.length > 50) log.length = 50;
    localStorage.setItem('outlierAuditLog', JSON.stringify(log));

    showToast(`Deleted ${toDelete.length} outlier(s)`, 'success');
    detectedOutliers = [];
  }

  $: auditLog = JSON.parse(localStorage.getItem('outlierAuditLog') || '[]');

  $: confirmMessages = {
    samples: 'This will permanently delete all soil samples. This cannot be undone.',
    boundaries: 'This will permanently delete all field boundaries. This cannot be undone.',
    yield: 'This will delete all yield data and remove yield correlations from samples.',
    all: 'This will permanently delete ALL data including samples, boundaries, yield, and in-season data. This cannot be undone.'
  };

  async function handleLoadFromSheets() {
    syncing = true;
    try {
      // Load fresh data from Sheets
      const [fields, sheetSamples, settings] = await Promise.all([
        SheetsAPI.getFields(),
        SheetsAPI.getSamples(),
        SheetsAPI.getSettings()
      ]);

      // Update boundaries from fields
      if (fields && fields.length > 0) {
        const boundariesObj = {};
        fields.forEach(f => {
          if (f.boundary) {
            boundariesObj[f.name] = {
              boundary: f.boundary,
              farmId: f.farmId || '',
              acres: f.acres || 0
            };
          }
        });
        if (Object.keys(boundariesObj).length > 0) {
          boundaries.set(boundariesObj);
        }
      }

      // Update samples
      if (sheetSamples && sheetSamples.length > 0) {
        samples.set(sheetSamples);
      }

      // Update settings
      if (settings && Object.keys(settings).length > 0) {
        soilSettings.set(settings);
      }

      // Persist to IndexedDB
      const currentSamples = get(samples);
      const currentBoundaries = get(boundaries);
      await saveToIndexedDB(currentSamples, currentBoundaries);

      // Try loading in-season data
      try {
        const inSeason = await SheetsAPI.getInSeasonAnalysis();
        if (inSeason?.length) {
          inSeasonData.set(inSeason);
        }
      } catch (e) { /* in-season sheet may not exist */ }

      showToast('Data loaded from Google Sheets', 'success');
    } catch (err) {
      showToast('Load failed: ' + err.message, 'error');
    } finally {
      syncing = false;
    }
  }

  async function handleSyncToSheets() {
    syncing = true;
    try {
      // For now we notify that full sync is not yet implemented
      // The existing architecture loads from sheets but doesn't have a full write-back
      showToast('Sync to Sheets is not yet implemented', 'warning');
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      syncing = false;
    }
  }

  async function handleReassign() {
    const currentSamples = get(samples);
    const currentBoundaries = get(boundaries);
    if (currentSamples.length === 0) { showToast('No samples to reassign', 'error'); return; }
    if (Object.keys(currentBoundaries).length === 0) { showToast('No boundaries loaded', 'error'); return; }

    const count = assignSamplesToFields(currentSamples, currentBoundaries);
    samples.set([...currentSamples]);
    await saveToIndexedDB(currentSamples, currentBoundaries);
    showToast(`Reassigned ${count} samples to fields`, 'success');
  }

  // Export functions
  function exportCSV() {
    const currentSamples = get(samples);
    if (currentSamples.length === 0) { showToast('No data to export', 'error'); return; }

    const headers = ['sampleId', 'field', 'lat', 'lon', 'year', 'depth', 'pH', 'P', 'K', 'OM', 'CEC', 'Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat', 'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S', 'Buffer_pH'];
    const rows = currentSamples.map(s => headers.map(h => s[h] ?? '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    downloadFile(csv, `soil-samples-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showToast('CSV exported', 'success');
  }

  function exportJSON() {
    const data = {
      exportDate: new Date().toISOString(),
      version: '2.0',
      samples: get(samples),
      boundaries: get(boundaries),
      yield: get(yieldData),
      inSeason: get(inSeasonData),
      settings: JSON.parse(localStorage.getItem('soilSettings') || '{}'),
    };
    downloadFile(JSON.stringify(data, null, 2), `farm-dirt-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    localStorage.setItem('lastBackupDownload', new Date().toISOString());
    showToast('Backup downloaded', 'success');
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clear functions
  function requestClear(type) {
    confirmAction = type;
  }

  async function executeClear() {
    const type = confirmAction;
    confirmAction = null;

    const currentSamples = get(samples);
    const currentBoundaries = get(boundaries);

    if (type === 'samples') {
      samples.set([]);
      await saveToIndexedDB([], currentBoundaries);
      showToast('Samples cleared', 'success');
    } else if (type === 'boundaries') {
      boundaries.set({});
      await saveToIndexedDB(currentSamples, {});
      showToast('Boundaries cleared', 'success');
    } else if (type === 'yield') {
      yieldData.set([]);
      // Clear yield correlations from samples
      const updated = currentSamples.map(s => {
        const { yieldCorrelations, ...rest } = s;
        return rest;
      });
      samples.set(updated);
      await saveYieldToIndexedDB([]);
      await saveToIndexedDB(updated, currentBoundaries);
      showToast('Yield data cleared', 'success');
    } else if (type === 'all') {
      samples.set([]);
      boundaries.set({});
      yieldData.set([]);
      inSeasonData.set([]);
      await saveToIndexedDB([], {});
      await saveYieldToIndexedDB([]);
      showToast('All data cleared', 'success');
    }
  }
</script>

<div class="space-y-4">
  <!-- Export Data Section -->
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="border-t-4 border-purple-500 px-5 pt-4 pb-2">
      <h3 class="text-base font-semibold text-slate-800">Export Data</h3>
      <p class="text-xs text-slate-500 mt-0.5">Download your data in various formats</p>
    </div>

    <div class="px-5 pb-5 pt-2">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <!-- CSV Export -->
        <button
          onclick={exportCSV}
          class="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-purple-700 active:bg-purple-800 transition-colors"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>

        <!-- PDF Report (disabled) -->
        <button
          disabled
          class="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 text-slate-400 font-medium rounded-lg min-h-[44px]
                 cursor-not-allowed"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF Report
        </button>

        <!-- JSON Backup -->
        <button
          onclick={exportJSON}
          class="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-purple-700 active:bg-purple-800 transition-colors"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          JSON Backup
        </button>
      </div>
    </div>
  </div>

  <!-- Data Management Section -->
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="border-t-4 border-slate-400 px-5 pt-4 pb-2">
      <h3 class="text-base font-semibold text-slate-800">Data Management</h3>
      <p class="text-xs text-slate-500 mt-0.5">Sync, reassign, and manage your data</p>
    </div>

    <div class="px-5 pb-5 pt-2 space-y-4">
      <!-- Sync & Reassign buttons -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <!-- Load from Sheets -->
        <button
          onclick={handleLoadFromSheets}
          disabled={syncing || !$isSignedIn}
          class="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-green-700 active:bg-green-800 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if syncing}
            <svg class="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {:else}
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          {/if}
          Load from Sheets
        </button>

        <!-- Sync to Sheets -->
        <button
          onclick={handleSyncToSheets}
          disabled={syncing || !$isSignedIn}
          class="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-purple-700 active:bg-purple-800 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Sync to Sheets
        </button>

        <!-- Reassign Samples -->
        <button
          onclick={handleReassign}
          class="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reassign Samples
        </button>
      </div>

      {#if !$isSignedIn}
        <p class="text-xs text-slate-400">Sign in with Google on the Settings page to enable Sheets sync.</p>
      {/if}

      <!-- Divider -->
      <div class="border-t border-slate-200"></div>

      <!-- Clear data buttons -->
      <div>
        <p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Clear Data</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onclick={() => requestClear('samples')}
            class="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg min-h-[44px] cursor-pointer
                   hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Samples
          </button>
          <button
            onclick={() => requestClear('boundaries')}
            class="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg min-h-[44px] cursor-pointer
                   hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Boundaries
          </button>
          <button
            onclick={() => requestClear('yield')}
            class="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg min-h-[44px] cursor-pointer
                   hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Yield
          </button>
          <button
            onclick={() => requestClear('all')}
            class="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-800 text-white text-sm font-bold rounded-lg min-h-[44px] cursor-pointer
                   hover:bg-red-900 active:bg-red-950 transition-colors"
          >
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Clear All
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Outlier Cleaner Section -->
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="border-t-4 border-red-500 px-5 pt-4 pb-2">
      <h3 class="text-base font-semibold text-slate-800">Outlier Cleaner</h3>
      <p class="text-xs text-slate-500 mt-0.5">Detect and remove nutrient outliers or samples outside field boundaries</p>
    </div>

    <div class="px-5 pb-5 pt-2 space-y-4">
      <!-- Threshold config toggle -->
      <button
        type="button"
        onclick={() => showThresholds = !showThresholds}
        class="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-700 cursor-pointer hover:bg-red-50 transition-colors"
      >
        <span>{showThresholds ? '\u25BC' : '\u25B6'}</span> Configure Outlier Thresholds
      </button>

      {#if showThresholds}
        <div class="border border-red-200 rounded-lg p-4 bg-red-50/30 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">Corn Yield Min (bu/ac)</span>
              <input type="number" bind:value={thresholds.cornMin} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">Corn Yield Max (bu/ac)</span>
              <input type="number" bind:value={thresholds.cornMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">Soybean Min (bu/ac)</span>
              <input type="number" bind:value={thresholds.soyMin} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">Soybean Max (bu/ac)</span>
              <input type="number" bind:value={thresholds.soyMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">pH Min</span>
              <input type="number" step="0.1" bind:value={thresholds.pHMin} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">pH Max</span>
              <input type="number" step="0.1" bind:value={thresholds.pHMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">P Max (ppm)</span>
              <input type="number" bind:value={thresholds.pMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">K Max (ppm)</span>
              <input type="number" bind:value={thresholds.kMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">CEC Max</span>
              <input type="number" bind:value={thresholds.cecMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-600 block mb-1">OM Max (%)</span>
              <input type="number" step="0.1" bind:value={thresholds.omMax} class="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" />
            </div>
          </div>
          <button
            onclick={saveThresholds}
            class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg min-h-[44px] cursor-pointer hover:bg-red-700 transition-colors"
          >Save Thresholds</button>
        </div>
      {/if}

      <!-- Scan buttons -->
      <div class="flex gap-3 flex-wrap">
        <button
          onclick={scanForOutliers}
          disabled={scanning}
          class="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer hover:bg-red-700 transition-colors disabled:opacity-50"
        >Scan for Outliers</button>
        <button
          onclick={scanOrphanedSamples}
          disabled={scanning}
          class="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white font-medium rounded-lg min-h-[44px] cursor-pointer hover:bg-purple-700 transition-colors disabled:opacity-50"
        >Find Samples Outside Boundaries</button>
      </div>

      <!-- Results -->
      {#if detectedOutliers.length > 0}
        <div class="border border-red-200 rounded-lg overflow-hidden">
          <!-- Summary -->
          <div class="px-4 py-3 bg-red-50 border-b border-red-200">
            <span class="font-bold text-red-700">Found {detectedOutliers.length} potential issue{detectedOutliers.length !== 1 ? 's' : ''}</span>
            <span class="text-sm text-slate-500 ml-2">({selectedCount} selected)</span>
          </div>

          <!-- Table -->
          <div class="max-h-[400px] overflow-y-auto">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-red-50">
                <tr>
                  <th class="py-2 px-3 text-left w-10">
                    <input type="checkbox" checked={selectAll} onchange={(e) => toggleSelectAll(e.target.checked)} />
                  </th>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase">Field</th>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase">Year</th>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase">Type</th>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase">Issue</th>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase">Value</th>
                </tr>
              </thead>
              <tbody>
                {#each detectedOutliers as outlier, i}
                  <tr class="border-t border-red-100 hover:bg-red-50/50 transition-colors">
                    <td class="py-2 px-3">
                      <input type="checkbox" bind:checked={outlier.selected} />
                    </td>
                    <td class="py-2 px-3 text-slate-700">{outlier.field}</td>
                    <td class="py-2 px-3 text-slate-500">{outlier.year}</td>
                    <td class="py-2 px-3">
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium
                        {outlier.dataType === 'Nutrient' ? 'bg-blue-100 text-blue-700' :
                         outlier.dataType === 'Outside Boundary' ? 'bg-purple-100 text-purple-700' :
                         'bg-amber-100 text-amber-700'}">
                        {outlier.dataType}
                      </span>
                    </td>
                    <td class="py-2 px-3 text-red-600 font-medium">{outlier.issue}</td>
                    <td class="py-2 px-3 font-mono text-xs text-slate-600">{outlier.value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Actions -->
          <div class="px-4 py-3 bg-slate-50 border-t border-red-200 flex gap-3 flex-wrap">
            <button
              onclick={() => toggleSelectAll(true)}
              class="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-50 min-h-[44px]"
            >Select All</button>
            <button
              onclick={() => toggleSelectAll(false)}
              class="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-50 min-h-[44px]"
            >Select None</button>
            <button
              onclick={() => { if (selectedCount > 0) confirmDeleteOutliers = true; }}
              disabled={selectedCount === 0}
              class="px-4 py-2 bg-red-600 text-white font-medium rounded-lg text-sm cursor-pointer hover:bg-red-700 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            >Delete Selected ({selectedCount})</button>
          </div>
        </div>
      {/if}

      <!-- Audit log -->
      {#if auditLog.length > 0}
        <div class="border border-amber-200 rounded-lg bg-amber-50 p-3">
          <h4 class="text-sm font-semibold text-amber-800 mb-2">Deletion History</h4>
          <div class="max-h-[150px] overflow-y-auto text-xs text-amber-700 space-y-1">
            {#each auditLog as entry}
              {@const d = new Date(entry.date)}
              <div class="py-1 border-b border-amber-200/50 last:border-0">
                <strong>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}:</strong>
                Removed {entry.total} outlier{entry.total !== 1 ? 's' : ''}
                ({entry.nutrients || 0} nutrient, {entry.yields || 0} yield{entry.outside ? `, ${entry.outside} outside boundaries` : ''})
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Confirm Dialog -->
{#if confirmAction}
  <ConfirmDialog
    title="Clear {confirmAction === 'all' ? 'All Data' : confirmAction.charAt(0).toUpperCase() + confirmAction.slice(1)}"
    message={confirmMessages[confirmAction]}
    confirmText="Yes, Clear"
    cancelText="Cancel"
    destructive={true}
    onconfirm={executeClear}
    oncancel={() => confirmAction = null}
  />
{/if}

{#if confirmDeleteOutliers}
  <ConfirmDialog
    title="Delete {selectedCount} Outlier{selectedCount !== 1 ? 's' : ''}"
    message="Permanently delete {selectedCount} selected data point{selectedCount !== 1 ? 's' : ''}? This cannot be undone."
    confirmText="Yes, Delete"
    cancelText="Cancel"
    destructive={true}
    onconfirm={deleteSelectedOutliers}
    oncancel={() => confirmDeleteOutliers = false}
  />
{/if}
