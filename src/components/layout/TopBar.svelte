<script>
  import { location } from 'svelte-spa-router';

  const navItems = [
    { path: '/', label: 'Map', icon: '📍' },
    { path: '/analysis', label: 'Analysis', icon: '📊' },
    { path: '/import', label: 'Import', icon: '📁' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];
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
    <!-- Auth button will go here -->
    <button class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors cursor-pointer">
      Sign In
    </button>
  </div>
</header>
