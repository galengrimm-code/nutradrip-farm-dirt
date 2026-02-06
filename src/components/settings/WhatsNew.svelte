<script>
  const version = 'v2.0.0';
  const changes = [
    'Rebuilt with Svelte + Vite for faster performance',
    'Mobile-first design with bottom tab navigation',
    'Compare mode for year-over-year analysis',
    'Field mode with GPS tracking',
    'Sample site management with print labels'
  ];
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-slate-800">What's New</h3>
    <span class="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">{version}</span>
  </div>
  <ul class="space-y-2">
    {#each changes as change}
      <li class="flex items-start gap-2 text-sm text-slate-600">
        <span class="text-green-500 mt-0.5 shrink-0">&#10003;</span>
        <span>{change}</span>
      </li>
    {/each}
  </ul>
</div>
