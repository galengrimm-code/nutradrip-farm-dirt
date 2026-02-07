<script>
  import AnalysisFilters from '../components/analysis/AnalysisFilters.svelte';
  import FieldTrends from '../components/analysis/FieldTrends.svelte';
  import YearOverYear from '../components/analysis/YearOverYear.svelte';
  import FieldRankings from '../components/analysis/FieldRankings.svelte';
  import YieldCorrelation from '../components/analysis/YieldCorrelation.svelte';
  import YieldBuckets from '../components/analysis/YieldBuckets.svelte';
  import BreakpointAnalysis from '../components/analysis/BreakpointAnalysis.svelte';
  import MultivariateRegression from '../components/analysis/MultivariateRegression.svelte';
  import SpatialChange from '../components/analysis/SpatialChange.svelte';
  import InSeasonViewer from '../components/analysis/InSeasonViewer.svelte';
  import EmptyState from '../components/shared/EmptyState.svelte';
  import { samples } from '$lib/stores/samples.js';

  let activeTab = 'trends';
  let yieldSubTab = 'correlations';
  let selectedField = '';
  let selectedNutrient = 'pH';
  let selectedYear = '';
  let compareYear = '';

  const tabs = [
    { id: 'trends', label: 'Field Trends', icon: '\u{1F4C8}' },
    { id: 'comparison', label: 'Year-Over-Year', icon: '\u{1F4CA}' },
    { id: 'rankings', label: 'Rankings', icon: '\u{1F3C6}' },
    { id: 'yield', label: 'Yield', icon: '\u{1F33E}' },
    { id: 'spatial', label: 'Spatial', icon: '\u{1F5FA}\u{FE0F}' },
    { id: 'inseason', label: 'In-Season', icon: '\u{1F9EA}' },
  ];

  const yieldSubTabs = [
    { id: 'correlations', label: 'Correlations' },
    { id: 'buckets', label: 'Yield by Level' },
    { id: 'breakpoint', label: 'Breakpoint' },
    { id: 'mvr', label: 'MVR' },
  ];
</script>

<div class="bg-slate-50 min-h-full">
  <div class="max-w-6xl mx-auto p-4 space-y-4">
    {#if $samples.length === 0}
      <EmptyState icon="{'\u{1F4CA}'}" title="No Data" message="Import soil samples to start analyzing." />
    {:else}
      <AnalysisFilters bind:selectedField bind:selectedNutrient bind:selectedYear bind:compareYear />

      <!-- Tab bar -->
      <div class="flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {#each tabs as tab}
          <button onclick={() => activeTab = tab.id}
            class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors
              {activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">
            <span class="mr-1">{tab.icon}</span>{tab.label}
          </button>
        {/each}
      </div>

      {#if activeTab === 'trends'}
        <FieldTrends {selectedField} />
      {:else if activeTab === 'comparison'}
        <YearOverYear year1={selectedYear} year2={compareYear} />
      {:else if activeTab === 'rankings'}
        <FieldRankings {selectedNutrient} />
      {:else if activeTab === 'yield'}
        <!-- Yield sub-tabs -->
        <div class="flex gap-1 border-b border-slate-200 mb-4">
          {#each yieldSubTabs as sub}
            <button onclick={() => yieldSubTab = sub.id}
              class="px-3 py-2 text-sm font-medium cursor-pointer transition-colors border-b-2
                {yieldSubTab === sub.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'}">
              {sub.label}
            </button>
          {/each}
        </div>

        {#if yieldSubTab === 'correlations'}
          <YieldCorrelation {selectedNutrient} />
        {:else if yieldSubTab === 'buckets'}
          <YieldBuckets />
        {:else if yieldSubTab === 'breakpoint'}
          <BreakpointAnalysis {selectedNutrient} />
        {:else if yieldSubTab === 'mvr'}
          <MultivariateRegression />
        {/if}
      {:else if activeTab === 'spatial'}
        <SpatialChange {selectedField} {selectedNutrient} />
      {:else if activeTab === 'inseason'}
        <InSeasonViewer />
      {/if}
    {/if}
  </div>
</div>
