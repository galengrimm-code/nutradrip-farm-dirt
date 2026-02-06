<script>
  import { showToast } from '$lib/stores/app.js';
  import { loadFromIndexedDB, loadYieldFromIndexedDB, loadInSeasonFromIndexedDB } from '$lib/core/data.js';

  let frequency = localStorage.getItem('autoBackupFrequency') || 'weekly';
  let lastBackup = localStorage.getItem('lastBackupDownload') || null;
  let downloading = false;

  $: formattedLastBackup = lastBackup
    ? new Date(lastBackup).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never';

  function saveFrequency() {
    localStorage.setItem('autoBackupFrequency', frequency);
  }

  async function downloadBackup() {
    downloading = true;
    try {
      const data = {
        exportDate: new Date().toISOString(),
        version: '2.0',
        clients: JSON.parse(localStorage.getItem('clientsData') || '[]'),
        farms: JSON.parse(localStorage.getItem('farmsData') || '[]'),
        boundaries: JSON.parse(localStorage.getItem('fieldBoundaries') || '{}'),
        settings: JSON.parse(localStorage.getItem('soilSettings') || '{}'),
        nutrientVisibility: JSON.parse(localStorage.getItem('nutrientVisibility') || '{}'),
        decimalPlaces: JSON.parse(localStorage.getItem('decimalPlaces') || '{}'),
        columnAliases: JSON.parse(localStorage.getItem('columnAliases') || '{}'),
      };

      // Try to get samples from IndexedDB
      const idbData = await loadFromIndexedDB();
      if (idbData) {
        data.samples = idbData.samples;
        data.idbBoundaries = idbData.boundaries;
      }
      const yieldData = await loadYieldFromIndexedDB();
      if (yieldData?.length) data.yield = yieldData;
      const inSeason = await loadInSeasonFromIndexedDB();
      if (inSeason?.length) data.inSeason = inSeason;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `farm-dirt-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      localStorage.setItem('lastBackupDownload', new Date().toISOString());
      lastBackup = localStorage.getItem('lastBackupDownload');
      showToast('Backup downloaded', 'success');
    } catch (err) {
      showToast('Backup failed: ' + err.message, 'error');
    } finally {
      downloading = false;
    }
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <h3 class="text-sm font-semibold text-slate-800">Data Backup</h3>

  <div class="flex flex-col sm:flex-row sm:items-center gap-3">
    <div class="flex items-center gap-2">
      <span class="text-sm text-slate-700">Auto-backup reminder:</span>
      <select bind:value={frequency} onchange={saveFrequency}
        class="px-2 py-2 border border-slate-300 rounded-md text-sm bg-white min-h-[44px]">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="never">Never</option>
      </select>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center gap-3">
    <button onclick={downloadBackup} disabled={downloading}
      class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg
             hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]">
      {#if downloading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Downloading...
      {:else}
        Download Backup
      {/if}
    </button>
    <span class="text-xs text-slate-500">Last backup: {formattedLastBackup}</span>
  </div>

  <p class="text-xs text-slate-400">
    Exports all data (samples, boundaries, settings, yield, in-season) as a single JSON file.
  </p>
</div>
