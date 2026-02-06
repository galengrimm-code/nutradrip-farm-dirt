<script>
  import { showToast } from '$lib/stores/app.js';
  import { inSeasonData, appendInSeasonData } from '$lib/stores/inSeason.js';
  import { parseCSVRaw, IN_SEASON_FIELDS, getInSeasonDuplicateKey } from '$lib/core/import-utils.js';
  import FileDropZone from './FileDropZone.svelte';
  import Modal from '../shared/Modal.svelte';

  const TYPES = [
    { id: 'TIS', label: 'Tissue', icon: '\u{1F33F}', color: 'green' },
    { id: 'SAP', label: 'Sap', icon: '\u{1F9EA}', color: 'amber' },
    { id: 'ISS', label: 'In-Season Soil', icon: '\u{1F331}', color: 'purple' },
    { id: 'WAT', label: 'Water', icon: '\u{1F4A7}', color: 'blue' },
  ];

  let selectedType = '';
  let files = [];
  let uploading = false;
  let csvData = null; // parsed raw CSV

  // Mapping state
  let showMapping = false;
  let columnMappings = {}; // maps standard field -> csv column
  let requiredMappings = {}; // SiteId, Field, Client, Farm, DateSampled -> csv column

  // Preview state
  let step = 1; // 1 = mapping, 2 = preview
  let labDateOverride = '';
  let previewRows = [];

  $: typeFields = selectedType ? (IN_SEASON_FIELDS[selectedType] || []) : [];
  $: selectedTypeInfo = TYPES.find(t => t.id === selectedType);

  // Color helper - returns border, bg, and text classes for a given type color
  function typeClasses(color, isActive) {
    const colorMap = {
      green:  { active: 'border-green-500 bg-green-50 text-green-800', inactive: 'border-slate-200 text-slate-600 hover:border-green-300' },
      amber:  { active: 'border-amber-500 bg-amber-50 text-amber-800', inactive: 'border-slate-200 text-slate-600 hover:border-amber-300' },
      purple: { active: 'border-purple-500 bg-purple-50 text-purple-800', inactive: 'border-slate-200 text-slate-600 hover:border-purple-300' },
      blue:   { active: 'border-blue-500 bg-blue-50 text-blue-800', inactive: 'border-slate-200 text-slate-600 hover:border-blue-300' },
    };
    return isActive ? colorMap[color].active : colorMap[color].inactive;
  }

  function handleFiles(fileList) {
    files = Array.from(fileList);
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.csv')) {
      parseFile();
    }
  }

  async function parseFile() {
    const text = await files[0].text();
    csvData = parseCSVRaw(text);
    if (csvData.rows.length === 0) {
      showToast('No data found in CSV', 'error');
      csvData = null;
      return;
    }
  }

  function openMappingModal() {
    if (!selectedType) { showToast('Select a sample type first', 'error'); return; }
    if (!csvData) { showToast('Upload a CSV file first', 'error'); return; }

    // Auto-detect column mappings
    const headers = csvData.headers;
    requiredMappings = { SiteId: '', Field: '', Client: '', Farm: '', DateSampled: '' };
    columnMappings = {};

    // Try to auto-match required fields
    const siteIdMatch = headers.find(h => /site.?id|siteid/i.test(h));
    if (siteIdMatch) requiredMappings.SiteId = siteIdMatch;
    const fieldMatch = headers.find(h => /^field$/i.test(h));
    if (fieldMatch) requiredMappings.Field = fieldMatch;
    const clientMatch = headers.find(h => /^client$/i.test(h));
    if (clientMatch) requiredMappings.Client = clientMatch;
    const farmMatch = headers.find(h => /^farm$/i.test(h));
    if (farmMatch) requiredMappings.Farm = farmMatch;
    const dateMatch = headers.find(h => /date|sampled|lab.?date/i.test(h));
    if (dateMatch) requiredMappings.DateSampled = dateMatch;

    // Auto-match nutrient fields
    typeFields.forEach(field => {
      const match = headers.find(h =>
        h.toLowerCase() === field.toLowerCase() ||
        h.toLowerCase().replace(/[^a-z0-9]/g, '') === field.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (match) columnMappings[field] = match;
      else columnMappings[field] = '';
    });

    step = 1;
    labDateOverride = '';
    showMapping = true;
  }

  function generatePreview() {
    // Build preview from first 5 rows
    previewRows = csvData.rows.slice(0, 5).map(row => {
      const record = { Type: selectedType };
      if (requiredMappings.SiteId && row[requiredMappings.SiteId]) record.SiteId = row[requiredMappings.SiteId];
      if (requiredMappings.Field && row[requiredMappings.Field]) record.Field = row[requiredMappings.Field];
      if (requiredMappings.DateSampled && row[requiredMappings.DateSampled]) record.LabDate = row[requiredMappings.DateSampled];
      typeFields.forEach(field => {
        const col = columnMappings[field];
        if (col && row[col] !== undefined) {
          const num = parseFloat(row[col]);
          record[field] = isNaN(num) ? row[col] : num;
        }
      });
      return record;
    });
    step = 2;
  }

  $: previewColumns = previewRows.length > 0
    ? Object.keys(previewRows[0]).filter(k => k !== 'Type')
    : [];

  async function importRecords() {
    uploading = true;
    try {
      const records = csvData.rows.map(row => {
        const record = { Type: selectedType };
        record.SiteId = requiredMappings.SiteId ? row[requiredMappings.SiteId] : '';
        record.Field = requiredMappings.Field ? row[requiredMappings.Field] : '';
        record.Client = requiredMappings.Client ? row[requiredMappings.Client] : '';
        record.Farm = requiredMappings.Farm ? row[requiredMappings.Farm] : '';

        // Date handling
        const dateCol = requiredMappings.DateSampled ? row[requiredMappings.DateSampled] : '';
        record.LabDate = labDateOverride || dateCol || '';
        record.Year = record.LabDate ? new Date(record.LabDate).getFullYear().toString() : new Date().getFullYear().toString();

        // Nutrient fields
        typeFields.forEach(field => {
          const col = columnMappings[field];
          if (col && row[col] !== undefined && row[col] !== '') {
            const num = parseFloat(row[col]);
            record[field] = isNaN(num) ? row[col] : num;
          }
        });

        return record;
      }).filter(r => r.SiteId); // must have SiteId

      if (records.length === 0) throw new Error('No valid records (Site ID required)');

      const result = await appendInSeasonData(records, getInSeasonDuplicateKey);
      showToast(`Imported ${result.added} ${selectedTypeInfo?.label || ''} records${result.duplicates > 0 ? ` (${result.duplicates} duplicates skipped)` : ''}`, 'success');

      showMapping = false;
      files = [];
      csvData = null;
      selectedType = '';
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      uploading = false;
    }
  }

  // Required fields config for mapping step
  const REQUIRED_FIELDS = [
    { key: 'SiteId', label: 'Site ID', required: true },
    { key: 'Field', label: 'Field', required: false },
    { key: 'Client', label: 'Client', required: false },
    { key: 'Farm', label: 'Farm', required: false },
    { key: 'DateSampled', label: 'Date Sampled', required: false },
  ];
</script>

<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
  <!-- Purple accent header -->
  <div class="border-t-4 border-purple-500 px-5 pt-4 pb-2">
    <h3 class="text-base font-semibold text-slate-800">Import In-Season Analysis</h3>
    <p class="text-xs text-slate-500 mt-0.5">Upload CSV data for tissue, sap, soil, or water analysis</p>
  </div>

  <div class="px-5 pb-5 space-y-4">
    <!-- Type selection: 2x2 grid on small screens, 4 columns on larger -->
    <div>
      <span class="text-xs font-medium text-slate-600 block mb-2">Sample Type</span>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        {#each TYPES as type}
          <button
            type="button"
            onclick={() => { selectedType = type.id; }}
            class="flex flex-col items-center gap-1.5 p-3 border-2 rounded-lg transition-colors cursor-pointer min-h-[44px]
                   {typeClasses(type.color, selectedType === type.id)}"
          >
            <span class="text-xl leading-none">{type.icon}</span>
            <span class="text-sm font-medium">{type.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Show file upload only after type selection -->
    {#if !selectedType}
      <div class="text-center py-6 text-sm text-slate-400">
        Select a sample type above to continue
      </div>
    {:else}
      <!-- File drop zone -->
      <FileDropZone
        accept=".csv"
        multiple={false}
        label="Drop CSV file here"
        hint=".csv file with sample data"
        onfiles={handleFiles}
      />

      <!-- Map & Preview button -->
      <button
        onclick={openMappingModal}
        disabled={!csvData}
        class="w-full py-2.5 bg-purple-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer
               hover:bg-purple-700 active:bg-purple-800 transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Map Columns & Preview
      </button>
    {/if}
  </div>
</div>

<!-- Mapping / Preview Modal -->
{#if showMapping}
  <Modal
    title="{selectedTypeInfo?.icon || ''} {selectedTypeInfo?.label || ''} Import"
    onclose={() => { showMapping = false; }}
  >
    <!-- Step indicator -->
    <div class="flex items-center gap-2 mb-5">
      <button
        onclick={() => { step = 1; }}
        class="flex items-center gap-1.5 text-sm font-medium cursor-pointer
               {step === 1 ? 'text-purple-700' : 'text-slate-400 hover:text-slate-600'}"
      >
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                     {step === 1 ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500'}">1</span>
        Map Columns
      </button>
      <div class="flex-1 h-px bg-slate-200"></div>
      <span class="flex items-center gap-1.5 text-sm font-medium
                   {step === 2 ? 'text-purple-700' : 'text-slate-400'}">
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                     {step === 2 ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500'}">2</span>
        Preview & Import
      </span>
    </div>

    {#if step === 1}
      <!-- Step 1: Column Mapping -->
      <div class="space-y-5">
        <!-- Required fields -->
        <div>
          <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Required & Metadata Fields</h4>
          <div class="space-y-2">
            {#each REQUIRED_FIELDS as rf}
              <div class="flex items-center gap-3">
                <span class="text-sm text-slate-700 w-28 shrink-0">
                  {rf.label}{#if rf.required}<span class="text-red-500 ml-0.5">*</span>{/if}
                </span>
                <select
                  bind:value={requiredMappings[rf.key]}
                  class="flex-1 px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]
                         focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value="">-- Not mapped --</option>
                  {#each csvData?.headers || [] as header}
                    <option value={header}>{header}</option>
                  {/each}
                </select>
              </div>
            {/each}
          </div>
        </div>

        <!-- Nutrient fields grid -->
        <div>
          <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {selectedTypeInfo?.label || ''} Fields ({typeFields.length})
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {#each typeFields as field}
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-600 w-24 shrink-0 truncate" title={field}>{field}</span>
                <select
                  bind:value={columnMappings[field]}
                  class="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white min-h-[36px]
                         focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none
                         {columnMappings[field] ? 'text-slate-800' : 'text-slate-400'}"
                >
                  <option value="">-- skip --</option>
                  {#each csvData?.headers || [] as header}
                    <option value={header}>{header}</option>
                  {/each}
                </select>
              </div>
            {/each}
          </div>
        </div>
      </div>

    {:else}
      <!-- Step 2: Preview -->
      <div class="space-y-4">
        <!-- Lab date override -->
        <div>
          <label for="lab-date-override" class="text-xs font-medium text-slate-600 block mb-1">
            Override Lab Date (optional - applies to all rows)
          </label>
          <input
            id="lab-date-override"
            type="date"
            bind:value={labDateOverride}
            class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]
                   focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>

        <!-- Preview table -->
        <div>
          <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Preview (first 5 rows of {csvData?.rows.length || 0} total)
          </h4>
          <div class="overflow-x-auto border border-slate-200 rounded-lg">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50">
                  {#each previewColumns as col}
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each previewRows as row, i}
                  <tr class="{i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
                    {#each previewColumns as col}
                      <td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                        {row[col] !== undefined ? row[col] : ''}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}

    <svelte:fragment slot="footer">
      <div class="flex items-center justify-between">
        <button
          onclick={() => { showMapping = false; }}
          class="px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg min-h-[44px]
                 cursor-pointer hover:bg-slate-50 transition-colors text-sm"
        >
          Cancel
        </button>

        <div class="flex gap-3">
          {#if step === 2}
            <button
              onclick={() => { step = 1; }}
              class="px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg min-h-[44px]
                     cursor-pointer hover:bg-slate-50 transition-colors text-sm"
            >
              Back
            </button>
          {/if}

          {#if step === 1}
            <button
              onclick={generatePreview}
              disabled={!requiredMappings.SiteId}
              class="px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg min-h-[44px]
                     cursor-pointer hover:bg-purple-700 active:bg-purple-800 transition-colors text-sm
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Preview
            </button>
          {:else}
            <button
              onclick={importRecords}
              disabled={uploading}
              class="px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg min-h-[44px]
                     cursor-pointer hover:bg-purple-700 active:bg-purple-800 transition-colors text-sm
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if uploading}
                <span class="inline-flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Importing...
                </span>
              {:else}
                Import {csvData?.rows.length || 0} Records
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </svelte:fragment>
  </Modal>
{/if}
