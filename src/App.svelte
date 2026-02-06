<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import AppShell from './components/layout/AppShell.svelte';
  import Map from './pages/Map.svelte';
  import Analysis from './pages/Analysis.svelte';
  import Import from './pages/Import.svelte';
  import Settings from './pages/Settings.svelte';
  import { initializeApp } from '$lib/core/init.js';

  const routes = {
    '/': Map,
    '/analysis': Analysis,
    '/import': Import,
    '/settings': Settings
  };

  onMount(() => {
    initializeApp();
  });
</script>

<AppShell>
  <Router {routes} />
</AppShell>
