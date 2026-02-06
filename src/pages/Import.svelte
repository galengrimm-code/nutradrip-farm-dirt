<script>
  import ImportSummary from '../components/import/ImportSummary.svelte';
  import BoundaryImport from '../components/import/BoundaryImport.svelte';
  import SampleImport from '../components/import/SampleImport.svelte';
  import InSeasonImport from '../components/import/InSeasonImport.svelte';
  import YieldImport from '../components/import/YieldImport.svelte';
  import DataManagement from '../components/import/DataManagement.svelte';
  import FieldManagement from '../components/import/FieldManagement.svelte';

  let activeTab = 'boundaries';
  const tabs = [
    { id: 'boundaries', label: 'Boundaries', icon: '\u{1F4E6}' },
    { id: 'samples', label: 'Samples', icon: '\u{1F52C}' },
    { id: 'inseason', label: 'In-Season', icon: '\u{1F9EA}' },
    { id: 'yield', label: 'Yield', icon: '\u{1F33E}' },
    { id: 'management', label: 'Data Mgmt', icon: '\u{1F504}' },
    { id: 'fields', label: 'Fields', icon: '\u{1F5FA}\u{FE0F}' },
  ];
</script>

<div class="bg-slate-50 min-h-full">
  <div class="max-w-5xl mx-auto p-4 space-y-4">
    <!-- Data summary -->
    <ImportSummary />

    <!-- Tab bar -->
    <div class="flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
      {#each tabs as tab (tab.id)}
        <button
          onclick={() => activeTab = tab.id}
          class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors
            {activeTab === tab.id
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}"
        >
          <span class="mr-1">{tab.icon}</span>
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Tab content -->
    <div>
      {#if activeTab === 'boundaries'}
        <BoundaryImport />
      {:else if activeTab === 'samples'}
        <SampleImport />
      {:else if activeTab === 'inseason'}
        <InSeasonImport />
      {:else if activeTab === 'yield'}
        <YieldImport />
      {:else if activeTab === 'management'}
        <DataManagement />
      {:else if activeTab === 'fields'}
        <FieldManagement />
      {/if}
    </div>
  </div>
</div>
