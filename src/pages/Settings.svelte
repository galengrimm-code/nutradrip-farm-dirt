<script>
  import SheetsConnection from '../components/settings/SheetsConnection.svelte';
  import ActiveOperation from '../components/settings/ActiveOperation.svelte';
  import ClientFarmManager from '../components/settings/ClientFarmManager.svelte';
  import WhatsNew from '../components/settings/WhatsNew.svelte';
  import DataBackup from '../components/settings/DataBackup.svelte';
  import SoilThresholds from '../components/settings/SoilThresholds.svelte';
  import DisplaySettings from '../components/settings/DisplaySettings.svelte';
  import ColumnMapping from '../components/settings/ColumnMapping.svelte';
  import NutrientVisibility from '../components/settings/NutrientVisibility.svelte';
  import { soilSettings } from '$lib/stores/settings.js';
  import { SheetsAPI } from '$lib/core/data.js';
  import { getSheetId } from '$lib/core/config.js';
  import { showToast } from '$lib/stores/app.js';

  let saving = false;
  let bufferPercent = parseInt(localStorage.getItem('bufferPercent') || '10');

  function handleBufferChange(e) {
    bufferPercent = parseInt(e.target.value) || 10;
    localStorage.setItem('bufferPercent', String(bufferPercent));
  }

  async function saveSettings() {
    saving = true;
    try {
      const sheetId = getSheetId();
      if (sheetId) {
        const settings = $soilSettings;
        const rows = Object.entries(settings).map(([key, val]) => [
          key, val.min ?? '', val.target ?? '', val.max ?? ''
        ]);
        if (rows.length > 0) {
          await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: sheetId, range: 'Settings!A2:D10000'
          });
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `Settings!A2:D${rows.length + 1}`,
            valueInputOption: 'RAW',
            resource: { values: rows }
          });
        }
      }
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      saving = false;
    }
  }

  function resetSettings() {
    if (confirm('Reset all thresholds to defaults? This cannot be undone.')) {
      soilSettings.set({});
      localStorage.removeItem('bufferPercent');
      bufferPercent = 10;
      showToast('Settings reset to defaults', 'success');
    }
  }
</script>

<div class="max-w-6xl mx-auto p-4 md:p-6 pb-20 md:pb-6">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

    <!-- Google Sheets Connection -->
    <SheetsConnection />

    <!-- Active Operation -->
    <ActiveOperation />

    <!-- Manage Clients & Farms -->
    <ClientFarmManager />

    <!-- What's New -->
    <WhatsNew />

    <!-- Data Backup -->
    <DataBackup />

    <!-- pH Thresholds -->
    <SoilThresholds
      title="pH Thresholds"
      nutrients={['pH']}
    />

    <!-- Macronutrient Thresholds -->
    <SoilThresholds
      title="Macronutrient Thresholds"
      nutrients={['P', 'K', 'OM', 'S']}
    />

    <!-- Base Saturation Thresholds -->
    <SoilThresholds
      title="Base Saturation Thresholds"
      nutrients={['Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat']}
    />

    <!-- Display Settings (Buffer %) -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h3 class="text-sm font-semibold text-slate-800 mb-4">Display Settings</h3>
      <div>
        <label for="bufferPercent" class="text-xs font-medium text-slate-600 block mb-1">
          Buffer Percent (%)
        </label>
        <input
          id="bufferPercent"
          type="number"
          min="0"
          max="100"
          value={bufferPercent}
          oninput={handleBufferChange}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <p class="text-xs text-slate-500 mt-1">Extra range shown above/below thresholds on charts</p>
      </div>
    </div>

    <!-- Decimal Places -->
    <DisplaySettings />

    <!-- Column Mapping (full width) -->
    <div class="md:col-span-2">
      <ColumnMapping />
    </div>

    <!-- Nutrient Visibility (full width) -->
    <div class="md:col-span-2">
      <NutrientVisibility />
    </div>

    <!-- Save/Reset Buttons (full width) -->
    <div class="md:col-span-2">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div class="flex gap-3">
          <button
            onclick={saveSettings}
            disabled={saving}
            class="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
                   hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings to Sheet'}
          </button>
          <button
            onclick={resetSettings}
            class="px-6 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px]
                   cursor-pointer hover:bg-slate-50 transition-colors"
          >
            Reset Defaults
          </button>
        </div>
      </div>
    </div>

  </div>
</div>
