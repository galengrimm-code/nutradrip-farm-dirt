<script>
  import Modal from '../shared/Modal.svelte';

  export let zone = null; // { type, center, radius, bounds } — editing existing zone if zone.id exists
  export let onclose = () => {};
  export let onsave = () => {};
  export let ondelete = () => {};

  let name = zone?.name || '';
  let isEditing = !!zone?.id;

  $: typeLabel = zone?.type === 'circle' ? 'Circle' : 'Rectangle';
  $: dimensions = getDimensions();

  function getDimensions() {
    if (!zone) return '';
    if (zone.type === 'circle' && zone.radius) {
      const acres = (Math.PI * zone.radius * zone.radius) / 4046.86;
      if (zone.radius >= 1000) {
        return `Radius: ${(zone.radius / 1000).toFixed(2)} km (~${acres.toFixed(1)} acres)`;
      }
      return `Radius: ${zone.radius.toFixed(0)} m (~${acres.toFixed(1)} acres)`;
    }
    if (zone.type === 'rectangle' && zone.bounds) {
      const [[swLat, swLng], [neLat, neLng]] = zone.bounds;
      const widthM = haversineMeters(swLat, swLng, swLat, neLng);
      const heightM = haversineMeters(swLat, swLng, neLat, swLng);
      const acres = (widthM * heightM) / 4046.86;
      return `${widthM.toFixed(0)}m x ${heightM.toFixed(0)}m (~${acres.toFixed(1)} acres)`;
    }
    return '';
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function handleSave() {
    if (!name.trim()) return;
    onsave({ ...zone, name: name.trim() });
  }

  function handleDelete() {
    if (confirm('Delete this irrigation zone?')) {
      ondelete(zone);
    }
  }
</script>

<Modal title="{isEditing ? 'Edit' : 'Name'} Irrigation Zone" {onclose}>
  <div class="space-y-4">
    <div>
      <span class="text-xs font-semibold text-slate-500 uppercase block mb-1">Zone Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        bind:value={name}
        placeholder="e.g., Center Pivot 1"
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]"
        autofocus
      />
    </div>

    <div class="flex gap-4 text-sm text-slate-500">
      <span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">{typeLabel}</span>
      {#if dimensions}
        <span class="text-xs text-slate-400 self-center">{dimensions}</span>
      {/if}
    </div>

    <div class="flex gap-3 pt-2">
      <button
        onclick={handleSave}
        disabled={!name.trim()}
        class="flex-1 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
          bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
        {isEditing ? 'Update' : 'Save'} Zone
      </button>
      {#if isEditing}
        <button
          onclick={handleDelete}
          class="px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
            bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">
          Delete
        </button>
      {/if}
      <button
        onclick={onclose}
        class="px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-lg cursor-pointer transition-colors
          bg-slate-100 text-slate-600 hover:bg-slate-200">
        Cancel
      </button>
    </div>
  </div>
</Modal>
