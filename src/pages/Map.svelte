<script>
  import MapView from '../components/map/MapView.svelte';
  import MapControls from '../components/map/MapControls.svelte';

  let mapView;
</script>

<div class="flex flex-col h-full">
  <!-- Desktop controls bar -->
  <MapControls
    onaddsite={() => mapView?.triggerAddSite()}
    onprintlabels={() => mapView?.triggerPrintLabels()}
    ondrawzone={(type) => mapView?.startDrawZone(type)}
  />

  <!-- Map fills remaining space -->
  <div class="flex-1 relative">
    <MapView bind:this={mapView} />
  </div>
</div>
