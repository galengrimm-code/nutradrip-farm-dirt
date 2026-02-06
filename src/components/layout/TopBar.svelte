<script>
  import { location } from 'svelte-spa-router';
  import { isSignedIn } from '$lib/stores/app.js';
  import { SheetsAPI } from '$lib/core/data.js';

  const navItems = [
    { path: '/', label: 'Map', icon: '\u{1F4CD}' },
    { path: '/analysis', label: 'Analysis', icon: '\u{1F4CA}' },
    { path: '/import', label: 'Import', icon: '\u{1F4C1}' },
    { path: '/settings', label: 'Settings', icon: '\u{2699}\u{FE0F}' }
  ];

  function handleAuth() {
    if ($isSignedIn) {
      SheetsAPI.signOut();
    } else {
      SheetsAPI.signIn();
    }
  }
</script>

<header class="hidden md:flex items-center justify-between bg-slate-900 text-white px-6 py-3">
  <div class="flex items-center gap-6">
    <div>
      <h1 class="text-lg font-bold tracking-tight">Farm Dirt</h1>
      <p class="text-xs text-slate-400">Soil Sample Analysis</p>
    </div>

    <nav class="flex gap-1">
      {#each navItems as item}
        <a
          href="#/{item.path === '/' ? '' : item.path.slice(1)}"
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
            {$location === item.path
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
        >
          {item.label}
        </a>
      {/each}
    </nav>
  </div>

  <div class="flex items-center gap-3">
    {#if $isSignedIn}
      <span class="w-2 h-2 bg-green-400 rounded-full"></span>
      <button
        onclick={handleAuth}
        class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-md transition-colors cursor-pointer"
      >
        Sign Out
      </button>
    {:else}
      <button
        onclick={handleAuth}
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
      >
        Sign In
      </button>
    {/if}
  </div>
</header>
