<script>
  import { SheetsAPI, openSheetPicker, createNewSheet, needsMigration } from '$lib/core/data.js';
  import { getSheetId } from '$lib/core/config.js';
  import { isSignedIn, showToast } from '$lib/stores/app.js';

  let sheetName = localStorage.getItem('googleSheetName') || '';
  let sheetId = getSheetId();
  let needsMig = needsMigration();
  let operationName = localStorage.getItem('operationName') || '';
  let testing = false;
  let creating = false;

  $: connectionState = needsMig ? 'migration' : (sheetId ? 'connected' : 'setup');

  function handlePickSheet() {
    openSheetPicker((result) => {
      if (result.success) {
        sheetId = result.sheetId;
        sheetName = result.sheetName;
        needsMig = false;
        showToast('Sheet connected: ' + result.sheetName, 'success');
      } else if (result.error) {
        showToast(result.error, 'error');
      }
    });
  }

  async function handleCreateSheet() {
    creating = true;
    try {
      const result = await createNewSheet(operationName);
      sheetId = result.sheetId;
      sheetName = result.sheetName;
      needsMig = false;
      if (operationName) {
        localStorage.setItem('operationName', operationName);
      }
      showToast('New sheet created: ' + result.sheetName, 'success');
    } catch (err) {
      showToast('Failed to create sheet: ' + err.message, 'error');
    } finally {
      creating = false;
    }
  }

  async function testConnection() {
    testing = true;
    try {
      const settings = await SheetsAPI.getSettings();
      showToast('Connection successful! Found ' + Object.keys(settings).length + ' settings.', 'success');
    } catch (err) {
      showToast('Connection failed: ' + err.message, 'error');
    } finally {
      testing = false;
    }
  }

  function disconnect() {
    if (confirm('Disconnect from this sheet? Your data will remain in the sheet.')) {
      localStorage.removeItem('googleSheetId');
      localStorage.removeItem('googleSheetName');
      localStorage.removeItem('pickerAuthorized');
      sheetId = null;
      sheetName = '';
      needsMig = false;
      showToast('Disconnected from sheet', 'success');
    }
  }

  function handleMigrationPick() {
    openSheetPicker((result) => {
      if (result.success) {
        sheetId = result.sheetId;
        sheetName = result.sheetName;
        needsMig = false;
        showToast('Sheet re-authorized: ' + result.sheetName, 'success');
      } else if (result.error) {
        showToast(result.error, 'error');
      }
    });
  }
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
  <h3 class="text-sm font-semibold text-slate-800 mb-4">Google Sheets Connection</h3>

  {#if connectionState === 'migration'}
    <!-- Migration Warning -->
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div class="flex items-start gap-3">
        <span class="text-amber-500 text-lg shrink-0">!</span>
        <div>
          <p class="text-sm font-medium text-amber-800">Re-authorization Required</p>
          <p class="text-xs text-amber-700 mt-1">
            Google now requires you to select your sheet via the Drive picker for continued access.
            Your data is safe -- just select the same sheet you were using before.
          </p>
        </div>
      </div>
    </div>
    <button
      onclick={handleMigrationPick}
      class="w-full py-2.5 bg-amber-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
             hover:bg-amber-700 active:bg-amber-800 transition-colors"
    >
      Select My Sheet
    </button>

  {:else if connectionState === 'connected'}
    <!-- Connected State -->
    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 bg-green-500 rounded-full shrink-0"></span>
        <span class="text-sm font-medium text-green-800">Connected</span>
      </div>
      {#if sheetName}
        <p class="text-xs text-green-700 mt-1 truncate">{sheetName}</p>
      {/if}
    </div>
    <div class="flex gap-3">
      <button
        onclick={testConnection}
        disabled={testing}
        class="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
               hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>
      <button
        onclick={disconnect}
        class="px-4 py-2.5 border border-red-300 text-red-600 font-semibold rounded-lg min-h-[44px]
               cursor-pointer hover:bg-red-50 transition-colors"
      >
        Disconnect
      </button>
    </div>

  {:else}
    <!-- Setup State -->
    <p class="text-sm text-slate-600 mb-4">
      Connect a Google Sheet to sync your soil data across devices.
    </p>

    <!-- Option 1: Select from Drive -->
    <button
      onclick={handlePickSheet}
      class="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
             hover:bg-blue-700 active:bg-blue-800 transition-colors mb-3"
    >
      Select from Drive
    </button>

    <!-- Divider -->
    <div class="flex items-center gap-3 my-3">
      <div class="flex-1 border-t border-slate-200"></div>
      <span class="text-xs text-slate-400 uppercase">or</span>
      <div class="flex-1 border-t border-slate-200"></div>
    </div>

    <!-- Option 2: Create New -->
    <div class="space-y-3">
      <div>
        <label for="operationName" class="text-xs font-medium text-slate-600 block mb-1">
          Operation Name (optional)
        </label>
        <input
          id="operationName"
          type="text"
          bind:value={operationName}
          placeholder="e.g. Smith Farm"
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <button
        onclick={handleCreateSheet}
        disabled={creating}
        class="w-full py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px]
               cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? 'Creating...' : 'Create New Sheet'}
      </button>
    </div>
  {/if}
</div>
