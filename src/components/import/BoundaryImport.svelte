<script>
  import { get } from 'svelte/store';
  import { showToast } from '$lib/stores/app.js';
  import { clients, farms } from '$lib/stores/clients.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { samples } from '$lib/stores/samples.js';
  import { activeClientId, activeFarmId } from '$lib/stores/filters.js';
  import { geojsonToBoundaries } from '$lib/core/import-utils.js';
  import { saveToIndexedDB, generateId } from '$lib/core/data.js';
  import FileDropZone from './FileDropZone.svelte';
  import shp from 'shpjs';

  let selectedClientId = get(activeClientId) !== 'all' ? get(activeClientId) : ($clients[0]?.id || '');
  let selectedFarmId = get(activeFarmId) !== 'all' ? get(activeFarmId) : '';
  let fieldName = '';
  let files = [];
  let uploading = false;
  let dropZone;

  $: clientFarms = $farms.filter(f => f.clientId === selectedClientId);
  $: if (clientFarms.length && !clientFarms.find(f => f.id === selectedFarmId)) {
    selectedFarmId = clientFarms[0]?.id || '';
  }

  function handleFiles(fileList) {
    files = fileList;
  }

  function quickAddClient() {
    const name = prompt('Enter new client name:');
    if (!name?.trim()) return;
    const id = generateId('cli');
    const farmId = generateId('frm');
    clients.update(c => [...c, { id, name: name.trim(), createdAt: new Date().toISOString() }]);
    farms.update(f => [...f, { id: farmId, clientId: id, name: name.trim() + ' Farm', isDefault: true, createdAt: new Date().toISOString() }]);
    selectedClientId = id;
    selectedFarmId = farmId;
    showToast(`Client "${name.trim()}" created`, 'success');
  }

  function quickAddFarm() {
    if (!selectedClientId) {
      showToast('Select a client first', 'error');
      return;
    }
    const name = prompt('Enter new farm name:');
    if (!name?.trim()) return;
    const id = generateId('frm');
    farms.update(f => [...f, { id, clientId: selectedClientId, name: name.trim(), createdAt: new Date().toISOString() }]);
    selectedFarmId = id;
    showToast(`Farm "${name.trim()}" added`, 'success');
  }

  async function uploadBoundaries() {
    if (files.length === 0) {
      showToast('Please select file(s)', 'error');
      return;
    }
    if (!selectedFarmId) {
      showToast('Please select a farm', 'error');
      return;
    }

    uploading = true;
    try {
      let total = 0;
      const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
      const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
      const isZip = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');
      const jsonFiles = files.filter(f => f.name.toLowerCase().match(/\.(geo)?json$/));

      function wrapWithFarmId(parsed) {
        const wrapped = {};
        Object.entries(parsed).forEach(([name, coords]) => {
          wrapped[name] = { boundary: coords, farmId: selectedFarmId, createdAt: new Date().toISOString() };
        });
        return wrapped;
      }

      let newBoundaries = {};
      if (isZip) {
        const arrayBuffer = await files[0].arrayBuffer();
        const geojson = await shp(arrayBuffer);
        const parsed = geojsonToBoundaries(geojson, fieldName || undefined);
        newBoundaries = wrapWithFarmId(parsed);
        total = Object.keys(parsed).length;
      } else if (shpFile && dbfFile) {
        const shpBuffer = await shpFile.arrayBuffer();
        const dbfBuffer = await dbfFile.arrayBuffer();
        const geojson = await shp({ shp: shpBuffer, dbf: dbfBuffer });
        const parsed = geojsonToBoundaries(geojson, fieldName || undefined);
        newBoundaries = wrapWithFarmId(parsed);
        total = Object.keys(parsed).length;
      } else if (jsonFiles.length > 0) {
        for (const file of jsonFiles) {
          const text = await file.text();
          const geojson = JSON.parse(text);
          const parsed = geojsonToBoundaries(geojson, fieldName || file.name.replace(/\.(geo)?json$/i, ''));
          Object.assign(newBoundaries, wrapWithFarmId(parsed));
          total += Object.keys(parsed).length;
        }
      } else {
        throw new Error('Select a ZIP, Shapefile (.shp + .dbf), or GeoJSON');
      }

      // Merge with existing boundaries
      boundaries.update(b => ({ ...b, ...newBoundaries }));

      // Save to IndexedDB
      const currentSamples = get(samples);
      const currentBoundaries = get(boundaries);
      await saveToIndexedDB(currentSamples, currentBoundaries);

      // Get farm name for display
      const farm = $farms.find(f => f.id === selectedFarmId);
      const client = $clients.find(c => c.id === farm?.clientId);
      const label = client && farm ? `${client.name} > ${farm.name}` : 'selected farm';

      showToast(`Imported ${total} field(s) to ${label}`, 'success');
      files = [];
      fieldName = '';
      if (dropZone) dropZone.clear();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      uploading = false;
    }
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <!-- Colored top accent -->
  <div class="h-1 bg-blue-500"></div>

  <div class="p-4 space-y-4">
    <h3 class="text-sm font-semibold text-slate-800">Import Field Boundaries</h3>

    <!-- Client dropdown -->
    <div>
      <label for="boundary-client" class="block text-xs font-medium text-slate-600 mb-1">Client</label>
      <div class="flex gap-2">
        <select
          id="boundary-client"
          bind:value={selectedClientId}
          class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        >
          <option value="">Select client...</option>
          {#each $clients as client (client.id)}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
        <button
          onclick={quickAddClient}
          class="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer min-h-[44px] shrink-0"
          title="Add new client"
        >+</button>
      </div>
    </div>

    <!-- Farm dropdown -->
    <div>
      <label for="boundary-farm" class="block text-xs font-medium text-slate-600 mb-1">Farm</label>
      <div class="flex gap-2">
        <select
          id="boundary-farm"
          bind:value={selectedFarmId}
          class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        >
          <option value="">Select farm...</option>
          {#each clientFarms as farm (farm.id)}
            <option value={farm.id}>{farm.name}</option>
          {/each}
        </select>
        <button
          onclick={quickAddFarm}
          class="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer min-h-[44px] shrink-0"
          title="Add new farm"
        >+</button>
      </div>
    </div>

    <!-- Field name override -->
    <div>
      <label for="boundary-field-name" class="block text-xs font-medium text-slate-600 mb-1">Field Name Override <span class="text-slate-400">(optional)</span></label>
      <input
        id="boundary-field-name"
        type="text"
        bind:value={fieldName}
        placeholder="Leave empty to use names from file"
        class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
      >
    </div>

    <!-- File drop zone -->
    <FileDropZone
      bind:this={dropZone}
      accept=".shp,.dbf,.prj,.shx,.zip,.geojson,.json"
      multiple={true}
      label="Drop boundary files here or click to browse"
      hint="Accepts: .zip, .shp+.dbf, .geojson, .json"
      onfiles={handleFiles}
    />

    <!-- Upload button -->
    <button
      onclick={uploadBoundaries}
      disabled={uploading || files.length === 0}
      class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium min-h-[44px] cursor-pointer
             hover:bg-blue-700 transition-colors
             disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-500"
    >
      {#if uploading}
        Importing...
      {:else}
        Upload Boundaries
      {/if}
    </button>
  </div>
</div>
