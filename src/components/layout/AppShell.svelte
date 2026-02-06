<script>
  import TopBar from './TopBar.svelte';
  import BottomTabBar from './BottomTabBar.svelte';
  import StatusToast from './StatusToast.svelte';
</script>

<div class="flex flex-col h-dvh overflow-hidden bg-slate-50">
  <!-- Desktop top navigation -->
  <TopBar />

  <!-- Main content area -->
  <main class="flex-1 overflow-hidden pb-16 md:pb-0">
    <slot />
  </main>

  <!-- Mobile bottom tab bar -->
  <BottomTabBar />

  <!-- Toast notifications -->
  <StatusToast />
</div>
