<script>
  import { clients, farms } from '$lib/stores/clients.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { generateId } from '$lib/core/data.js';
  import { getSheetId } from '$lib/core/config.js';
  import { showToast } from '$lib/stores/app.js';
  import ClientModal from './ClientModal.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';

  let showModal = false;
  let editClient = null;
  let showConfirm = false;
  let deleteTarget = null;
  let syncing = false;

  function getFarmCount(clientId) {
    return $farms.filter(f => f.clientId === clientId).length;
  }

  function getFieldCount(clientId) {
    const clientFarmIds = $farms.filter(f => f.clientId === clientId).map(f => f.id);
    return Object.values($boundaries).filter(b => clientFarmIds.includes(b.farmId)).length;
  }

  function handleAdd() {
    editClient = null;
    showModal = true;
  }

  function handleEdit(client) {
    editClient = client;
    showModal = true;
  }

  function handleDeleteRequest(client) {
    deleteTarget = client;
    showConfirm = true;
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const clientId = deleteTarget.id;
    // Remove farms belonging to this client
    farms.update(f => f.filter(farm => farm.clientId !== clientId));
    // Remove client
    clients.update(c => c.filter(client => client.id !== clientId));
    showToast('Client deleted', 'success');
    deleteTarget = null;
    showConfirm = false;
  }

  function handleDeleteCancel() {
    deleteTarget = null;
    showConfirm = false;
  }

  function handleModalClose() {
    showModal = false;
    editClient = null;
  }

  function handleModalSave() {
    showModal = false;
    editClient = null;
  }

  async function syncClientsAndFarmsToSheets() {
    const sheetId = getSheetId();
    if (!sheetId) {
      showToast('No sheet connected', 'error');
      return;
    }
    syncing = true;
    try {
      // Clear and write Clients tab
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'Clients!A2:D10000'
      });
      if ($clients.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Clients!A2:D${$clients.length + 1}`,
          valueInputOption: 'RAW',
          resource: {
            values: $clients.map(c => [c.id, c.name, c.createdAt || '', c.updatedAt || ''])
          }
        });
      }
      // Clear and write Farms tab
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'Farms!A2:E10000'
      });
      if ($farms.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Farms!A2:E${$farms.length + 1}`,
          valueInputOption: 'RAW',
          resource: {
            values: $farms.map(f => [f.id, f.clientId, f.name, f.createdAt || '', f.updatedAt || ''])
          }
        });
      }
      showToast('Synced clients & farms to sheet', 'success');
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      syncing = false;
    }
  }
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-semibold text-slate-800">Manage Clients & Farms</h3>
    <button
      onclick={syncClientsAndFarmsToSheets}
      disabled={syncing}
      class="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {syncing ? 'Syncing...' : 'Sync to Sheets'}
    </button>
  </div>

  {#if $clients.length === 0}
    <p class="text-sm text-slate-500 text-center py-4">No clients yet. Add your first client below.</p>
  {:else}
    <div class="space-y-2 mb-4">
      {#each $clients as client (client.id)}
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-slate-800 truncate">{client.name}</p>
            <p class="text-xs text-slate-500">
              {getFarmCount(client.id)} {getFarmCount(client.id) === 1 ? 'farm' : 'farms'}
              &middot;
              {getFieldCount(client.id)} {getFieldCount(client.id) === 1 ? 'field' : 'fields'}
            </p>
          </div>
          <div class="flex gap-1 shrink-0 ml-2">
            <button
              onclick={() => handleEdit(client)}
              class="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
              aria-label="Edit {client.name}"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onclick={() => handleDeleteRequest(client)}
              class="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
              aria-label="Delete {client.name}"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button
    onclick={handleAdd}
    class="w-full py-2.5 border-2 border-dashed border-slate-300 text-slate-600 font-medium rounded-lg min-h-[44px]
           cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
  >
    + Add New Client
  </button>
</div>

{#if showModal}
  <ClientModal
    editClient={editClient}
    onclose={handleModalClose}
    onsave={handleModalSave}
  />
{/if}

{#if showConfirm}
  <ConfirmDialog
    title="Delete Client"
    message="Delete {deleteTarget?.name}? This will also remove all their farms. Fields and samples will not be deleted."
    confirmText="Delete"
    destructive={true}
    onconfirm={handleDeleteConfirm}
    oncancel={handleDeleteCancel}
  />
{/if}
