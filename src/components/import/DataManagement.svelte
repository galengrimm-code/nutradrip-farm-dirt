<script>
  import { showToast, isSignedIn } from '$lib/stores/app.js';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { yieldData } from '$lib/stores/yield.js';
  import { inSeasonData } from '$lib/stores/inSeason.js';
  import { assignSamplesToFields } from '$lib/core/import-utils.js';
  import { saveToIndexedDB, saveYieldToIndexedDB, SheetsAPI, loadFromIndexedDB, loadYieldFromIndexedDB, loadInSeasonFromIndexedDB } from '$lib/core/data.js';
  import { soilSettings } from '$lib/stores/settings.js';
  import { get } from 'svelte/store';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';

  let syncing = false;
  let confirmAction = null;

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
