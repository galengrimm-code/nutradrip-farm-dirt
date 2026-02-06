<script>
  import { location } from 'svelte-spa-router';

  const tabs = [
    { path: '/', label: 'Map', icon: '📍' },
    { path: '/analysis', label: 'Analysis', icon: '📊' },
    { path: '/import', label: 'Import', icon: '📁' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];
</script>

<nav class="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex md:hidden z-50"
     style="padding-bottom: env(safe-area-inset-bottom, 0px);">
  {#each tabs as tab}
    <a
      href="#/{tab.path === '/' ? '' : tab.path.slice(1)}"
      class="flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors
        {$location === tab.path
          ? 'text-blue-600'
          : 'text-slate-400 active:text-slate-600'}"
    >
      <span class="text-xl leading-none">{tab.icon}</span>
      <span class="text-[10px] font-medium mt-0.5">{tab.label}</span>
    </a>
  {/each}
</nav>
