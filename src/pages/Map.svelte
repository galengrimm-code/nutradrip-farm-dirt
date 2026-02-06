<script>
  import MapView from '../components/map/MapView.svelte';
  import MapControls from '../components/map/MapControls.svelte';
</script>

<div class="flex flex-col h-full">
  <!-- Desktop controls bar -->
  <MapControls />

  <!-- Map fills remaining space -->
  <div class="flex-1 relative">
    <MapView />
  </div>
</div>
