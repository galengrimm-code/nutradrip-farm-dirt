<script>
  import Modal from '../shared/Modal.svelte';
  import { clients, farms } from '$lib/stores/clients.js';
  import { generateId } from '$lib/core/data.js';
  import { showToast } from '$lib/stores/app.js';

  export let editClient = null;
  export let onclose = () => {};
  export let onsave = () => {};

  let clientName = editClient?.name || '';
  let modalFarms = [];
  let newFarmName = '';
  let initialized = false;

  // Initialize farms for edit mode
  $: if (editClient && !initialized) {
    modalFarms = $farms.filter(f => f.clientId === editClient.id).map(f => ({ ...f }));
    initialized = true;
  }

  function addFarm() {
    const name = newFarmName.trim();
    if (!name) return;
    // Check for duplicate name in modal farms
    if (modalFarms.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      showToast('Farm name already exists', 'error');
      return;
    }
    modalFarms = [...modalFarms, { id: null, name, clientId: editClient?.id || null }];
    newFarmName = '';
  }

  function removeFarm(index) {
    modalFarms = modalFarms.filter((_, i) => i !== index);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFarm();
    }
  }

  function save() {
    const name = clientName.trim();
    if (!name) {
      showToast('Client name is required', 'error');
      return;
    }

    const now = new Date().toISOString();

    if (editClient) {
      // Update existing client name
      clients.update(c => c.map(client =>
        client.id === editClient.id
          ? { ...client, name, updatedAt: now }
          : client
      ));

      // Determine which farms to add/remove
      const existingFarms = $farms.filter(f => f.clientId === editClient.id);
      const existingIds = new Set(existingFarms.map(f => f.id));
      const modalIds = new Set(modalFarms.filter(f => f.id).map(f => f.id));

      // Remove farms that were deleted in modal
      const toRemove = existingFarms.filter(f => !modalIds.has(f.id));

      // Add new farms (no id yet)
      const toAdd = modalFarms.filter(f => !f.id).map(f => ({
        id: generateId('farm'),
        clientId: editClient.id,
        name: f.name,
        createdAt: now,
        updatedAt: now
      }));

      farms.update(f => {
        let updated = f.filter(farm => !toRemove.some(r => r.id === farm.id));
        return [...updated, ...toAdd];
      });

      showToast('Client updated', 'success');
    } else {
      // Create new client
      const clientId = generateId('client');
      const newClient = {
        id: clientId,
        name,
        createdAt: now,
        updatedAt: now
      };
      clients.update(c => [...c, newClient]);

      // Create farms
      const newFarms = modalFarms.map(f => ({
        id: generateId('farm'),
        clientId,
        name: f.name,
        createdAt: now,
        updatedAt: now
      }));
      if (newFarms.length > 0) {
        farms.update(f => [...f, ...newFarms]);
      }

      showToast('Client created', 'success');
    }

    onsave();
    onclose();
  }
</script>

<Modal title={editClient ? 'Edit Client' : 'New Client'} onclose={onclose}>
  <div class="space-y-4">
    <!-- Client Name -->
    <div>
      <label for="clientName" class="text-xs font-medium text-slate-600 block mb-1">Client Name</label>
      <input
        id="clientName"
        type="text"
        bind:value={clientName}
        placeholder="e.g. Johnson Farms"
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      />
    </div>

    <!-- Farms List -->
    <div>
      <span class="text-xs font-medium text-slate-600 block mb-2">Farms</span>
      {#if modalFarms.length === 0}
        <p class="text-xs text-slate-400 text-center py-3">No farms added yet</p>
      {:else}
        <div class="space-y-1.5 mb-3">
          {#each modalFarms as farm, i}
            <div class="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
              <span class="text-sm text-slate-700 truncate">{farm.name}</span>
              <button
                onclick={() => removeFarm(i)}
                class="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500
                       hover:bg-red-50 cursor-pointer transition-colors shrink-0"
                aria-label="Remove {farm.name}"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Add Farm Input -->
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={newFarmName}
          onkeydown={handleKeydown}
          placeholder="Farm name"
          class="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          onclick={addFarm}
          disabled={!newFarmName.trim()}
          class="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg min-h-[44px] cursor-pointer
                 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <div class="flex gap-3">
      <button
        onclick={onclose}
        class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px]
               cursor-pointer hover:bg-slate-50 transition-colors"
      >
        Cancel
      </button>
      <button
        onclick={save}
        disabled={!clientName.trim()}
        class="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
               hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {editClient ? 'Save Changes' : 'Create Client'}
      </button>
    </div>
  </svelte:fragment>
</Modal>
