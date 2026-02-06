<script>
  import { clients, farms } from '$lib/stores/clients.js';
  import { activeClientId, activeFarmId } from '$lib/stores/filters.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { samples } from '$lib/stores/samples.js';

  // Filtered farms based on selected client
  $: filteredFarms = $activeClientId === 'all'
    ? $farms
    : $farms.filter(f => f.clientId === $activeClientId);

  // When client changes, reset farm to 'all'
  function handleClientChange(e) {
    activeClientId.set(e.target.value);
    activeFarmId.set('all');
  }

  function handleFarmChange(e) {
    activeFarmId.set(e.target.value);
  }

  // Stats for current selection
  $: fieldCount = (() => {
    const allFields = Object.keys($boundaries);
    if ($activeClientId === 'all' && $activeFarmId === 'all') return allFields.length;
    if ($activeFarmId !== 'all') {
      return allFields.filter(fn => {
        const f = $boundaries[fn];
        return f && f.farmId === $activeFarmId;
      }).length;
    }
    // Client selected, all farms
    const clientFarmIds = $farms.filter(f => f.clientId === $activeClientId).map(f => f.id);
    return allFields.filter(fn => {
      const f = $boundaries[fn];
      return f && clientFarmIds.includes(f.farmId);
    }).length;
  })();

  $: sampleCount = (() => {
    if ($activeClientId === 'all' && $activeFarmId === 'all') return $samples.length;
    // Filter samples by active fields
    const allFields = Object.keys($boundaries);
    let activeFields;
    if ($activeFarmId !== 'all') {
      activeFields = new Set(allFields.filter(fn => {
        const f = $boundaries[fn];
        return f && f.farmId === $activeFarmId;
      }));
    } else {
      const clientFarmIds = $farms.filter(f => f.clientId === $activeClientId).map(f => f.id);
      activeFields = new Set(allFields.filter(fn => {
        const f = $boundaries[fn];
        return f && clientFarmIds.includes(f.farmId);
      }));
    }
    return $samples.filter(s => activeFields.has(s.field)).length;
  })();
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
  <h3 class="text-sm font-semibold text-slate-800 mb-4">Active Operation</h3>

  <div class="space-y-3">
    <!-- Client Dropdown -->
    <div>
      <label for="activeClient" class="text-xs font-medium text-slate-600 block mb-1">Client</label>
      <select
        id="activeClient"
        value={$activeClientId}
        onchange={handleClientChange}
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      >
        <option value="all">All Clients</option>
        {#each $clients as client}
          <option value={client.id}>{client.name}</option>
        {/each}
      </select>
    </div>

    <!-- Farm Dropdown -->
    <div>
      <label for="activeFarm" class="text-xs font-medium text-slate-600 block mb-1">Farm</label>
      <select
        id="activeFarm"
        value={$activeFarmId}
        onchange={handleFarmChange}
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      >
        <option value="all">All Farms</option>
        {#each filteredFarms as farm}
          <option value={farm.id}>{farm.name}</option>
        {/each}
      </select>
    </div>

    <!-- Stats -->
    <div class="flex gap-4 pt-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-slate-500">Fields</span>
        <span class="text-sm font-semibold text-slate-800">{fieldCount}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-slate-500">Samples</span>
        <span class="text-sm font-semibold text-slate-800">{sampleCount}</span>
      </div>
    </div>
  </div>
</div>
