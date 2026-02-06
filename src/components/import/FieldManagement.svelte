<script>
  import { showToast } from '$lib/stores/app.js';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { clients, farms } from '$lib/stores/clients.js';
  import { saveToIndexedDB, generateId } from '$lib/core/data.js';
  import { assignSamplesToFields } from '$lib/core/import-utils.js';
  import { get } from 'svelte/store';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import Modal from '../shared/Modal.svelte';

  let selectedFields = new Set();
  let editingField = null;
  let newFieldName = '';
  let deletingField = null;
  let deleteOption = 'boundary_only';
  let showBulkAssign = false;
  let bulkClientId = '';
  let bulkFarmId = '';

  $: fieldNames = Object.keys($boundaries).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $: fieldStats = fieldNames.map(name => {
    const field = $boundaries[name];
    const fieldSamples = $samples.filter(s => s.field === name);
    const years = [...new Set(fieldSamples.map(s => s.year).filter(Boolean))];
    const farm = $farms.find(f => f.id === field?.farmId);
    const client = farm ? $clients.find(c => c.id === farm.clientId) : null;

    // Calculate acres from boundary coordinates
    let acres = 0;
    const coords = field?.boundary || field;
    if (Array.isArray(coords)) {
      const polys = Array.isArray(coords[0]?.[0]) ? coords : [coords];
      polys.forEach(poly => {
        if (!Array.isArray(poly) || poly.length < 3) return;
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length;
          if (!Array.isArray(poly[i]) || !Array.isArray(poly[j])) continue;
          area += poly[i][1] * poly[j][0];
          area -= poly[j][1] * poly[i][0];
        }
        area = Math.abs(area) / 2;
        // Convert from degree^2 to acres (approximate)
        const avgLat = poly.reduce((sum, p) => sum + (Array.isArray(p) ? p[0] : 0), 0) / poly.length;
        const latDeg = 69.172; // miles per degree latitude
        const lonDeg = 69.172 * Math.cos(avgLat * Math.PI / 180);
        acres += area * latDeg * lonDeg * 640; // square miles to acres
      });
    }

    return {
      name,
      acres: acres.toFixed(1),
      sampleCount: fieldSamples.length,
      years: years.sort().join(', '),
      farmName: farm ? `${client?.name || ''} > ${farm.name}` : 'Unassigned',
      farmId: field?.farmId || ''
    };
  });

  $: selectedCount = selectedFields.size;
  $: bulkFarmsFiltered = $farms.filter(f => f.clientId === bulkClientId);

  function toggleField(name) {
    if (selectedFields.has(name)) selectedFields.delete(name);
    else selectedFields.add(name);
    selectedFields = new Set(selectedFields);
  }

  function toggleAll() {
    if (selectedFields.size === fieldNames.length) selectedFields = new Set();
    else selectedFields = new Set(fieldNames);
  }

  function selectWithoutFarm() {
    selectedFields = new Set(fieldNames.filter(n => !$boundaries[n]?.farmId));
  }

  function clearSelection() {
    selectedFields = new Set();
  }

  // Rename
  function startRename(name) {
    editingField = name;
    newFieldName = name;
  }

  async function confirmRename() {
    if (!newFieldName.trim() || newFieldName === editingField) {
      editingField = null;
      return;
    }

    const b = get(boundaries);
    const s = get(samples);

    // Check for name collision
    if (b[newFieldName]) {
      showToast(`Field "${newFieldName}" already exists`, 'error');
      return;
    }

    // Move boundary
    b[newFieldName] = b[editingField];
    delete b[editingField];

    // Update samples
    s.forEach(sample => { if (sample.field === editingField) sample.field = newFieldName; });

    boundaries.set({ ...b });
    samples.set([...s]);
    await saveToIndexedDB(s, b);

    showToast(`Renamed "${editingField}" to "${newFieldName}"`, 'success');
    editingField = null;
  }

  // Delete
  function startDelete(name) {
    deletingField = name;
    deleteOption = 'boundary_only';
  }

  async function confirmDelete() {
    const name = deletingField;
    deletingField = null;

    const b = get(boundaries);
    const s = get(samples);

    delete b[name];

    if (deleteOption === 'boundary_and_samples') {
      const filtered = s.filter(sample => sample.field !== name);
      samples.set(filtered);
      boundaries.set({ ...b });
      await saveToIndexedDB(filtered, b);
      showToast(`Deleted "${name}" and its samples`, 'success');
    } else if (deleteOption === 'reassign_samples') {
      s.forEach(sample => { if (sample.field === name) sample.field = 'Unassigned'; });
      if (Object.keys(b).length > 0) assignSamplesToFields(s.filter(sample => sample.field === 'Unassigned'), b);
      samples.set([...s]);
      boundaries.set({ ...b });
      await saveToIndexedDB(s, b);
      showToast(`Deleted "${name}" and reassigned samples`, 'success');
    } else {
      s.forEach(sample => { if (sample.field === name) sample.field = 'Unassigned'; });
      samples.set([...s]);
      boundaries.set({ ...b });
      await saveToIndexedDB(s, b);
      showToast(`Deleted "${name}" boundary`, 'success');
    }

    // Remove from selection
    selectedFields.delete(name);
    selectedFields = new Set(selectedFields);
  }

  // Bulk assign
  function openBulkAssign() {
    bulkClientId = '';
    bulkFarmId = '';
    showBulkAssign = true;
  }

  async function confirmBulkAssign() {
    if (!bulkFarmId) { showToast('Select a farm', 'error'); return; }

    const b = get(boundaries);
    selectedFields.forEach(name => {
      if (b[name]) {
        if (typeof b[name] === 'object' && !Array.isArray(b[name])) {
          b[name].farmId = bulkFarmId;
        } else {
          b[name] = { boundary: b[name], farmId: bulkFarmId, createdAt: new Date().toISOString() };
        }
      }
    });

    boundaries.set({ ...b });
    const s = get(samples);
    await saveToIndexedDB(s, b);

    const farm = $farms.find(f => f.id === bulkFarmId);
    showToast(`Assigned ${selectedFields.size} fields to ${farm?.name || 'farm'}`, 'success');
    showBulkAssign = false;
    selectedFields = new Set();
  }
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
  <div class="border-t-4 border-slate-500 px-5 pt-4 pb-2">
    <h3 class="text-base font-semibold text-slate-800">Field Management</h3>
    <p class="text-xs text-slate-500 mt-0.5">View, rename, delete, and assign fields to farms</p>
  </div>

  <div class="px-5 pb-5 pt-2 space-y-4">
    <!-- Quick action buttons -->
    <div class="flex flex-wrap gap-2">
      <button
        onclick={selectWithoutFarm}
        class="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg cursor-pointer
               hover:bg-amber-100 transition-colors"
      >
        Fields without farm
      </button>
      <button
        onclick={toggleAll}
        class="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg cursor-pointer
               hover:bg-slate-100 transition-colors"
      >
        {selectedFields.size === fieldNames.length ? 'Deselect all' : 'All fields'}
      </button>
      {#if selectedCount > 0}
        <button
          onclick={clearSelection}
          class="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200 rounded-lg cursor-pointer
                 hover:bg-slate-100 transition-colors"
        >
          Clear selection
        </button>
      {/if}
    </div>

    <!-- Bulk action bar -->
    {#if selectedCount > 0}
      <div class="flex items-center justify-between gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg">
        <span class="text-sm font-medium text-purple-800">
          {selectedCount} field{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <button
          onclick={openBulkAssign}
          class="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg cursor-pointer
                 hover:bg-purple-700 active:bg-purple-800 transition-colors min-h-[36px]"
        >
          Assign to Farm
        </button>
      </div>
    {/if}

    <!-- Field table -->
    {#if fieldNames.length === 0}
      <div class="text-center py-8">
        <p class="text-sm text-slate-500">No field boundaries loaded</p>
        <p class="text-xs text-slate-400 mt-1">Import boundaries from the Boundaries tab</p>
      </div>
    {:else}
      <div class="overflow-x-auto -mx-5 px-5">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50">
              <th class="py-2 px-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={selectedFields.size === fieldNames.length && fieldNames.length > 0}
                  onchange={toggleAll}
                  class="rounded border-slate-300 text-purple-600 cursor-pointer"
                />
              </th>
              <th class="py-2 px-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Field</th>
              <th class="py-2 px-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Acres</th>
              <th class="py-2 px-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide hidden sm:table-cell">Samples</th>
              <th class="py-2 px-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">Years</th>
              <th class="py-2 px-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Farm</th>
              <th class="py-2 px-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each fieldStats as field, i (field.name)}
              <tr class="{i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 transition-colors">
                <td class="py-2 px-2">
                  <input
                    type="checkbox"
                    checked={selectedFields.has(field.name)}
                    onchange={() => toggleField(field.name)}
                    class="rounded border-slate-300 text-purple-600 cursor-pointer"
                  />
                </td>
                <td class="py-2 px-2">
                  <span class="font-medium text-slate-800">{field.name}</span>
                  <!-- Mobile-only subtext -->
                  <span class="sm:hidden text-xs text-slate-400 block">
                    {field.sampleCount} samples{field.farmId ? '' : ' - Unassigned'}
                  </span>
                </td>
                <td class="py-2 px-2 text-right text-slate-600 tabular-nums">{field.acres}</td>
                <td class="py-2 px-2 text-right text-slate-600 tabular-nums hidden sm:table-cell">{field.sampleCount}</td>
                <td class="py-2 px-2 text-slate-500 hidden md:table-cell">
                  <span class="text-xs">{field.years || '-'}</span>
                </td>
                <td class="py-2 px-2 hidden lg:table-cell">
                  <span class="text-xs {field.farmId ? 'text-slate-600' : 'text-amber-600 font-medium'}">
                    {field.farmName}
                  </span>
                </td>
                <td class="py-2 px-2 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <!-- Rename button -->
                    <button
                      onclick={() => startRename(field.name)}
                      class="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                      title="Rename field"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <!-- Delete button -->
                    <button
                      onclick={() => startDelete(field.name)}
                      class="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                      title="Delete field"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="text-xs text-slate-400 text-right">
        {fieldNames.length} field{fieldNames.length !== 1 ? 's' : ''} total
      </p>
    {/if}
  </div>
</div>

<!-- Rename Modal -->
{#if editingField}
  <Modal title="Rename Field" onclose={() => editingField = null}>
    <div class="space-y-4">
      <div>
        <label for="rename-field" class="block text-xs font-medium text-slate-600 mb-1">
          New name for "{editingField}"
        </label>
        <input
          id="rename-field"
          type="text"
          bind:value={newFieldName}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]
                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); }}
        />
      </div>
    </div>

    <svelte:fragment slot="footer">
      <div class="flex gap-3">
        <button
          onclick={() => editingField = null}
          class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmRename}
          disabled={!newFieldName.trim() || newFieldName === editingField}
          class="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-blue-700 active:bg-blue-800 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Rename
        </button>
      </div>
    </svelte:fragment>
  </Modal>
{/if}

<!-- Delete Modal -->
{#if deletingField}
  <Modal title="Delete Field" onclose={() => deletingField = null}>
    <div class="space-y-4">
      <p class="text-sm text-slate-600">
        Delete field <strong class="text-slate-800">"{deletingField}"</strong>?
      </p>

      <div class="space-y-2">
        <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                       {deleteOption === 'boundary_only' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}">
          <input
            type="radio"
            name="delete-option"
            value="boundary_only"
            bind:group={deleteOption}
            class="mt-0.5 text-blue-600"
          />
          <div>
            <span class="text-sm font-medium text-slate-800">Delete boundary only</span>
            <p class="text-xs text-slate-500 mt-0.5">Samples will be marked as "Unassigned"</p>
          </div>
        </label>

        <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                       {deleteOption === 'boundary_and_samples' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300'}">
          <input
            type="radio"
            name="delete-option"
            value="boundary_and_samples"
            bind:group={deleteOption}
            class="mt-0.5 text-red-600"
          />
          <div>
            <span class="text-sm font-medium text-slate-800">Delete boundary + samples</span>
            <p class="text-xs text-slate-500 mt-0.5">Permanently removes the boundary and all associated samples</p>
          </div>
        </label>

        <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                       {deleteOption === 'reassign_samples' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}">
          <input
            type="radio"
            name="delete-option"
            value="reassign_samples"
            bind:group={deleteOption}
            class="mt-0.5 text-amber-600"
          />
          <div>
            <span class="text-sm font-medium text-slate-800">Delete boundary + reassign samples</span>
            <p class="text-xs text-slate-500 mt-0.5">Reassigns orphaned samples to other fields by GPS location</p>
          </div>
        </label>
      </div>
    </div>

    <svelte:fragment slot="footer">
      <div class="flex gap-3">
        <button
          onclick={() => deletingField = null}
          class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmDelete}
          class="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-red-700 active:bg-red-800 transition-colors"
        >
          Delete
        </button>
      </div>
    </svelte:fragment>
  </Modal>
{/if}

<!-- Bulk Assign Modal -->
{#if showBulkAssign}
  <Modal title="Assign Fields to Farm" onclose={() => showBulkAssign = false}>
    <div class="space-y-4">
      <p class="text-sm text-slate-600">
        Assign <strong class="text-purple-700">{selectedCount}</strong> selected field{selectedCount !== 1 ? 's' : ''} to a farm.
      </p>

      <!-- Client dropdown -->
      <div>
        <label for="bulk-client" class="block text-xs font-medium text-slate-600 mb-1">Client</label>
        <select
          id="bulk-client"
          bind:value={bulkClientId}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]
                 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
        >
          <option value="">Select client...</option>
          {#each $clients as client (client.id)}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </div>

      <!-- Farm dropdown -->
      <div>
        <label for="bulk-farm" class="block text-xs font-medium text-slate-600 mb-1">Farm</label>
        <select
          id="bulk-farm"
          bind:value={bulkFarmId}
          disabled={!bulkClientId}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]
                 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none
                 disabled:bg-slate-100 disabled:cursor-not-allowed"
        >
          <option value="">Select farm...</option>
          {#each bulkFarmsFiltered as farm (farm.id)}
            <option value={farm.id}>{farm.name}</option>
          {/each}
        </select>
      </div>

      <!-- Selected fields list -->
      <div>
        <p class="text-xs font-medium text-slate-500 mb-1">Selected fields:</p>
        <div class="max-h-32 overflow-y-auto bg-slate-50 rounded-lg p-2 space-y-0.5">
          {#each [...selectedFields].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) as name}
            <div class="text-xs text-slate-600 py-0.5 px-1">{name}</div>
          {/each}
        </div>
      </div>
    </div>

    <svelte:fragment slot="footer">
      <div class="flex gap-3">
        <button
          onclick={() => showBulkAssign = false}
          class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmBulkAssign}
          disabled={!bulkFarmId}
          class="flex-1 py-2.5 bg-purple-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-purple-700 active:bg-purple-800 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Assign to Farm
        </button>
      </div>
    </svelte:fragment>
  </Modal>
{/if}
