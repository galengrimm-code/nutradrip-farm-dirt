<script>
  import { inSeasonData, sapData, tissueData, waterData, soilData, inSeasonSiteIds } from '$lib/stores/inSeason.js';
  import { evaluateStatus, buildTableRows, getStatusColors, formatValue, formatNutrientName, groupNutrients } from '$lib/sap/logic.js';
  import defaultRuleset from '$lib/sap/rulesets-v1.js';
  import EmptyState from '../shared/EmptyState.svelte';

  let subTab = 'sap';
  let selectedSiteId = '';
  let selectedDate = '';
  let displayMode = 'raw';

  const subTabs = [
    { id: 'sap', label: 'SAP Analysis', icon: '\uD83E\uDDEA' },
    { id: 'tissue', label: 'Tissue', icon: '\uD83C\uDF3F' },
    { id: 'water', label: 'Water', icon: '\uD83D\uDCA7' },
    { id: 'soil', label: 'In-Season Soil', icon: '\uD83C\uDF31' },
  ];

  // Meta keys to exclude from nutrient display
  const META_KEYS = ['Type', 'SiteId', 'Field', 'Client', 'Farm', 'LabDate', 'Year', 'LeafAge', 'Crop', 'GrowthStage', 'id', 'key', 'field', 'Date', '_importDate'];

  $: currentData = subTab === 'sap' ? $sapData :
                    subTab === 'tissue' ? $tissueData :
                    subTab === 'water' ? $waterData : $soilData;

  $: siteIds = [...new Set(currentData.map(r => r.SiteId).filter(Boolean))].sort();

  $: dates = selectedSiteId
    ? [...new Set(currentData.filter(r => r.SiteId === selectedSiteId).map(r => r.LabDate).filter(Boolean))].sort()
    : [...new Set(currentData.map(r => r.LabDate).filter(Boolean))].sort();

  // Reset selections when site list changes
  $: if (siteIds.length && !siteIds.includes(selectedSiteId)) selectedSiteId = siteIds[0] || '';
  $: if (dates.length && !dates.includes(selectedDate)) selectedDate = '';

  // Filtered records
  $: displayRecords = currentData.filter(r => {
    if (selectedSiteId && r.SiteId !== selectedSiteId) return false;
    if (selectedDate && r.LabDate !== selectedDate) return false;
    return true;
  });

  // For SAP tab: pair new/old leaf records and evaluate status
  $: sapPairs = subTab === 'sap' ? buildSapPairs(displayRecords) : [];

  // For non-SAP tabs: get nutrient keys from records
  $: nutrientKeys = displayRecords.length > 0
    ? Object.keys(displayRecords[0]).filter(k =>
        !META_KEYS.includes(k)
        && displayRecords[0][k] !== undefined
        && displayRecords[0][k] !== ''
      )
    : [];

  function buildSapPairs(records) {
    // Group by SiteId + LabDate
    const grouped = {};
    records.forEach(r => {
      const key = `${r.SiteId}__${r.LabDate}`;
      if (!grouped[key]) grouped[key] = { siteId: r.SiteId, labDate: r.LabDate, new_leaf: null, old_leaf: null, crop: r.Crop || 'corn' };
      const leafAge = (r.LeafAge || '').toLowerCase();
      if (leafAge === 'new' || leafAge === 'new_leaf') {
        grouped[key].new_leaf = r;
      } else if (leafAge === 'old' || leafAge === 'old_leaf') {
        grouped[key].old_leaf = r;
      } else {
        // If no LeafAge specified, assign to first available slot
        if (!grouped[key].new_leaf) grouped[key].new_leaf = r;
        else if (!grouped[key].old_leaf) grouped[key].old_leaf = r;
      }
    });

    return Object.values(grouped).map(pair => {
      // Build sampleDate structure for evaluateStatus
      const sampleDate = {
        new_leaf: extractNutrients(pair.new_leaf),
        old_leaf: extractNutrients(pair.old_leaf),
      };

      let evaluation = null;
      try {
        evaluation = evaluateStatus(sampleDate, { crop: pair.crop }, defaultRuleset);
      } catch (e) {
        // evaluation stays null
      }

      // Build table rows if evaluation succeeded
      let tableGroups = [];
      if (evaluation) {
        try {
          tableGroups = buildTableRows(displayMode === 'ratios' ? 'ratios' : 'raw', sampleDate, evaluation);
        } catch (e) {
          // empty groups
        }
      }

      return { ...pair, sampleDate, evaluation, tableGroups };
    });
  }

  function extractNutrients(record) {
    if (!record) return {};
    const nutrients = {};
    Object.keys(record).forEach(k => {
      if (META_KEYS.includes(k)) return;
      const val = parseFloat(record[k]);
      if (!isNaN(val)) nutrients[k] = val;
    });
    return nutrients;
  }

  function getStatusBadge(status) {
    if (!status) return { label: '\u2014', colorClasses: 'bg-slate-100 text-slate-500' };
    const s = status.status || 'Unknown';
    switch (s) {
      case 'Action':
        return { label: 'Action', colorClasses: 'bg-red-100 text-red-700' };
      case 'Watch':
        return { label: 'Watch', colorClasses: 'bg-amber-100 text-amber-700' };
      case 'OK':
        return { label: 'OK', colorClasses: 'bg-green-100 text-green-700' };
      default:
        return { label: s, colorClasses: 'bg-slate-100 text-slate-500' };
    }
  }

  function getStatusDot(status) {
    if (!status) return '#94a3b8';
    switch (status.status) {
      case 'Action': return '#dc2626';
      case 'Watch': return '#f59e0b';
      case 'OK': return '#22c55e';
      default: return '#94a3b8';
    }
  }

  function formatDelta(delta) {
    if (!delta || delta.deltaPct === null || delta.deltaPct === undefined || isNaN(delta.deltaPct)) return '\u2014';
    const sign = delta.deltaPct > 0 ? '+' : '';
    return `${sign}${delta.deltaPct.toFixed(1)}%`;
  }

  function getDeltaColor(delta) {
    if (!delta || delta.deltaPct === null || isNaN(delta.deltaPct)) return 'text-slate-400';
    const pct = Math.abs(delta.deltaPct);
    if (pct < 10) return 'text-slate-500';
    if (delta.deltaPct > 50) return 'text-red-600';
    if (delta.deltaPct > 20) return 'text-amber-600';
    if (delta.deltaPct < -50) return 'text-blue-600';
    if (delta.deltaPct < -20) return 'text-cyan-600';
    return delta.deltaPct > 0 ? 'text-green-600' : 'text-cyan-600';
  }

  function switchSubTab(tabId) {
    subTab = tabId;
    selectedSiteId = '';
    selectedDate = '';
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <!-- Sub-tab bar -->
  <div class="flex gap-1 overflow-x-auto">
    {#each subTabs as tab}
      <button onclick={() => switchSubTab(tab.id)}
        class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors
          {subTab === tab.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        <span class="mr-1">{tab.icon}</span>{tab.label}
      </button>
    {/each}
  </div>

  {#if currentData.length === 0}
    <EmptyState icon={subTabs.find(t => t.id === subTab)?.icon || '\uD83D\uDCCA'}
                title="No {subTabs.find(t => t.id === subTab)?.label || ''} Data"
                message="Import in-season data from the Import page." />
  {:else}
    <!-- Filters -->
    <div class="flex gap-3 flex-wrap">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Site</span>
        <select bind:value={selectedSiteId} class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          {#each siteIds as id}
            <option value={id}>{id}</option>
          {/each}
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Date</span>
        <select bind:value={selectedDate} class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          <option value="">All Dates</option>
          {#each dates as d}
            <option value={d}>{d}</option>
          {/each}
        </select>
      </div>
      {#if subTab === 'sap'}
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-500 uppercase">View</span>
          <select bind:value={displayMode} class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
            <option value="raw">Values</option>
            <option value="ratios">Ratios</option>
          </select>
        </div>
      {/if}
    </div>

    <!-- Results count -->
    <p class="text-xs text-slate-400">{displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}</p>

    {#if subTab === 'sap'}
      <!-- SAP Analysis: status-colored comparison table -->
      {#if sapPairs.length === 0}
        <div class="py-8 text-center text-sm text-slate-400">No SAP records match the current filters.</div>
      {:else}
        {#each sapPairs as pair}
          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <!-- Pair header -->
            <div class="bg-slate-50 px-3 py-2 flex items-center justify-between text-xs text-slate-500 border-b border-slate-200">
              <span class="font-medium text-slate-700">{pair.siteId}</span>
              <span>{pair.labDate || 'No date'}</span>
            </div>

            {#if pair.evaluation && pair.tableGroups.length > 0}
              {#each pair.tableGroups as group}
                <!-- Group header -->
                <div class="bg-slate-50/50 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  {group.name}
                </div>
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="bg-slate-50">
                      <th class="text-left py-1.5 px-3 text-xs font-semibold text-slate-500 w-[140px]">Nutrient</th>
                      <th class="text-right py-1.5 px-3 text-xs font-semibold text-slate-500">New Leaf</th>
                      <th class="text-center py-1.5 px-3 text-xs font-semibold text-slate-500 w-[70px]">Status</th>
                      <th class="text-right py-1.5 px-3 text-xs font-semibold text-slate-500">Old Leaf</th>
                      <th class="text-center py-1.5 px-3 text-xs font-semibold text-slate-500 w-[70px]">Status</th>
                      <th class="text-right py-1.5 px-3 text-xs font-semibold text-slate-500 w-[70px]">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each group.rows as row}
                      {@const newBadge = getStatusBadge(row.newStatus)}
                      {@const oldBadge = getStatusBadge(row.oldStatus)}
                      <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td class="py-1.5 px-3 font-medium text-slate-700 text-xs">
                          {row.label}
                        </td>
                        <td class="text-right py-1.5 px-3 font-mono text-xs text-slate-700">
                          {formatValue(row.newVal, row.key)}
                        </td>
                        <td class="text-center py-1.5 px-3">
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold {newBadge.colorClasses}">
                            <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: {getStatusDot(row.newStatus)};"></span>
                            {newBadge.label}
                          </span>
                        </td>
                        <td class="text-right py-1.5 px-3 font-mono text-xs text-slate-700">
                          {formatValue(row.oldVal, row.key)}
                        </td>
                        <td class="text-center py-1.5 px-3">
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold {oldBadge.colorClasses}">
                            <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: {getStatusDot(row.oldStatus)};"></span>
                            {oldBadge.label}
                          </span>
                        </td>
                        <td class="text-right py-1.5 px-3 font-mono text-xs {getDeltaColor(row.delta)}">
                          {formatDelta(row.delta)}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/each}
            {:else}
              <!-- Fallback: raw data display if evaluation fails -->
              <div class="p-3 text-xs text-slate-400">
                Could not evaluate SAP status. Showing raw data.
              </div>
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="bg-slate-50">
                    <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Nutrient</th>
                    {#if pair.new_leaf}
                      <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">New Leaf</th>
                    {/if}
                    {#if pair.old_leaf}
                      <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Old Leaf</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each Object.keys(pair.sampleDate.new_leaf || pair.sampleDate.old_leaf || {}) as key}
                    <tr class="border-t border-slate-100 hover:bg-slate-50">
                      <td class="py-1.5 px-3 font-medium text-slate-700 text-xs">{formatNutrientName(key)}</td>
                      {#if pair.new_leaf}
                        <td class="text-right py-1.5 px-3 font-mono text-xs text-slate-700">
                          {formatValue(pair.sampleDate.new_leaf[key], key)}
                        </td>
                      {/if}
                      {#if pair.old_leaf}
                        <td class="text-right py-1.5 px-3 font-mono text-xs text-slate-700">
                          {formatValue(pair.sampleDate.old_leaf[key], key)}
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        {/each}
      {/if}
    {:else}
      <!-- Non-SAP tabs: simple data table -->
      {#if displayRecords.length === 0}
        <div class="py-8 text-center text-sm text-slate-400">No records match the current filters.</div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-slate-50">
                <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase sticky left-0 bg-slate-50 z-10">Site</th>
                <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                {#each nutrientKeys as key}
                  <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{key}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each displayRecords as record}
                <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td class="py-2 px-3 font-medium sticky left-0 bg-white z-10">{record.SiteId || '-'}</td>
                  <td class="py-2 px-3 text-slate-500">{record.LabDate || '-'}</td>
                  {#each nutrientKeys as key}
                    <td class="text-right py-2 px-3 font-mono text-slate-700">
                      {#if record[key] !== undefined && record[key] !== ''}
                        {typeof record[key] === 'number' ? record[key].toFixed(2) : record[key]}
                      {:else}
                        -
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</div>
