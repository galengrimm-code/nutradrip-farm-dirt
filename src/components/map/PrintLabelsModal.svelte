<script>
  import Modal from '../shared/Modal.svelte';
  import { activeSampleSites, SITE_TYPES } from '$lib/stores/sampleSites.js';
  import { showToast } from '$lib/stores/app.js';

  export let onclose = () => {};

  let filterType = 'all';
  let filterField = 'all';
  let labForm = 'labels';
  let selectedSiteIds = new Set();

  $: filteredSites = getFilteredSites($activeSampleSites, filterType, filterField);
  $: existingTypes = [...new Set($activeSampleSites.map(s => s.Type).filter(Boolean))].sort();
  $: existingFields = [...new Set($activeSampleSites.map(s => s.Field).filter(Boolean))].sort();

  function getFilteredSites(sites, typeFilter, fieldFilter) {
    let result = sites;
    if (typeFilter !== 'all') result = result.filter(s => s.Type === typeFilter);
    if (fieldFilter !== 'all') result = result.filter(s => s.Field === fieldFilter);
    return result.sort((a, b) => {
      if (a.Field !== b.Field) return (a.Field || '').localeCompare(b.Field || '');
      if (a.Type !== b.Type) return (a.Type || '').localeCompare(b.Type || '');
      return (a.SiteID || '').localeCompare(b.SiteID || '');
    });
  }

  function toggleSite(siteId, type) {
    const key = `${siteId}_${type}`;
    if (selectedSiteIds.has(key)) {
      selectedSiteIds.delete(key);
    } else {
      selectedSiteIds.add(key);
    }
    selectedSiteIds = new Set(selectedSiteIds);
  }

  function selectAll() {
    selectedSiteIds = new Set(filteredSites.map(s => `${s.SiteID}_${s.Type}`));
  }

  function deselectAll() {
    selectedSiteIds = new Set();
  }

  function getSelectedSites() {
    return filteredSites.filter(s => selectedSiteIds.has(`${s.SiteID}_${s.Type}`));
  }

  function generateLabels() {
    const selected = getSelectedSites();
    if (selected.length === 0) {
      showToast('Please select at least one site', 'error');
      return;
    }

    if (labForm === 'waypoint-tissue') {
      generateWaypointForm(selected);
      return;
    }
    if (labForm === 'sap-sample') {
      generateSapForm(selected);
      return;
    }

    const today = new Date().toLocaleDateString();
    const typeNames = { TIS: 'Tissue', WAT: 'Water', SAP: 'Sap', ISS: 'In-Season Soil' };

    let printContent;
    if (labForm === 'sheet') {
      printContent = `<!DOCTYPE html><html><head><title>Sample Collection Sheet</title>
        <style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:18px;margin-bottom:5px}.date{font-size:12px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #333;padding:8px;text-align:left;font-size:12px}th{background:#f0f0f0;font-weight:bold}.notes{width:150px}@media print{body{padding:10px}}</style></head><body>
        <h1>Sample Collection Sheet</h1>
        <div class="date">Generated: ${today} | Total Samples: ${selected.length}</div>
        <table><tr><th>Sample ID</th><th>Type</th><th>Field</th><th>Client/Farm</th><th>Collected</th><th class="notes">Notes</th></tr>
        ${selected.map(s => `<tr><td><strong>${s.SiteID}</strong></td><td>${typeNames[s.Type] || s.Type}</td><td>${s.Field || '-'}</td><td>${s.Client || ''}${s.Farm ? ' / ' + s.Farm : ''}</td><td style="width:30px">☐</td><td class="notes">${s.Notes || ''}</td></tr>`).join('')}
        </table></body></html>`;
    } else {
      printContent = `<!DOCTYPE html><html><head><title>Sample Labels</title>
        <style>body{font-family:Arial,sans-serif;padding:10px}.labels-container{display:flex;flex-wrap:wrap;gap:10px}.label{border:2px solid #333;border-radius:8px;padding:12px;width:calc(50% - 15px);box-sizing:border-box;page-break-inside:avoid}.label-id{font-size:18px;font-weight:bold;font-family:monospace;margin-bottom:5px}.label-type{font-size:14px;font-weight:bold;color:#333;margin-bottom:3px}.label-field{font-size:12px;color:#666}.label-date{font-size:10px;color:#999;margin-top:5px}@media print{.label{border-width:1px}}</style></head><body>
        <div class="labels-container">
        ${selected.map(s => `<div class="label"><div class="label-id">${s.SiteID}</div><div class="label-type">${typeNames[s.Type] || s.Type}</div><div class="label-field">${s.Field || 'No Field'}</div><div class="label-field">${s.Client || ''}${s.Farm ? ' / ' + s.Farm : ''}</div><div class="label-date">Date: ____________</div></div>`).join('')}
        </div></body></html>`;
    }

    openPrintWindow(printContent);
  }

  function generateWaypointForm(selected) {
    const today = new Date().toLocaleDateString();
    const first = selected[0];
    const printContent = `<!DOCTYPE html><html><head><title>Waypoint Tissue Sample Information Sheet</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;padding:15px;max-width:11in}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:10px}.title{font-size:16px;font-weight:bold;text-align:center;margin:10px 0}.info-section{display:flex;gap:20px;margin-bottom:15px}.info-box{flex:1}.info-box h3{font-size:10px;font-weight:bold;background:#f0f0f0;padding:3px 5px;margin:0 0 5px 0}.info-row{display:flex;border-bottom:1px solid #ccc;padding:3px 0}.info-label{font-weight:bold;width:80px}.info-value{flex:1;border-bottom:1px dotted #999;min-height:14px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #333;padding:3px 4px;text-align:center}th{background:#ffffd0;font-weight:bold;font-size:8px}.sample-id{font-weight:bold;text-align:left;font-family:monospace;font-size:10px}.checkbox{width:12px;height:12px;border:1px solid #333;display:inline-block}.small-col{width:25px}.med-col{width:45px}.test-header{background:#e0e0e0}.footer{margin-top:15px;font-size:8px}.footer p{margin:3px 0}@media print{body{padding:10px}@page{size:landscape;margin:0.5in}}</style></head><body>
      <div class="header"><div><strong style="font-size:14px">WAYPOINT</strong><br><span style="font-size:9px">ANALYTICAL</span></div><div style="text-align:right;font-size:9px">700 Park Drive<br>Atlantic IA 50022<br>712-243-6933<br>www.waypointanalytical.com</div></div>
      <div class="title">SOIL SAMPLE INFORMATION SHEET</div>
      <div class="info-section"><div class="info-box"><h3>CUSTOMER INFORMATION</h3><div class="info-row"><span class="info-label">Account #:</span><span class="info-value"></span></div><div class="info-row"><span class="info-label">Company:</span><span class="info-value">${first?.Client || ''}</span></div><div class="info-row"><span class="info-label">Email:</span><span class="info-value"></span></div></div><div class="info-box"><h3>GROWER INFORMATION</h3><div class="info-row"><span class="info-label">Grower ID:</span><span class="info-value">${first?.Client || ''}</span></div><div class="info-row"><span class="info-label">Farm ID:</span><span class="info-value">${first?.Farm || ''}</span></div><div class="info-row"><span class="info-label">Field ID:</span><span class="info-value">${first?.Field || ''}</span></div></div></div>
      <table><thead><tr class="test-header"><th rowspan="2" style="width:50px">Lab #<br>(Lab Use)</th><th rowspan="2" style="width:70px">Sample ID<br>(6 char max)</th><th rowspan="2" class="small-col">S1M</th><th colspan="7">S2M - Specify Add'l Tests</th><th rowspan="2" class="small-col">S3M</th><th rowspan="2" class="small-col">Sol.<br>Salts</th><th rowspan="2" class="small-col">Text.</th><th rowspan="2" class="small-col">NO3-N</th><th rowspan="2" class="med-col">Add'l<br>Tests</th><th rowspan="2" class="med-col">Crop<br>Code</th><th rowspan="2" class="med-col">Yield<br>Goal</th><th rowspan="2" class="med-col">Prev<br>Crop</th><th rowspan="2" style="width:100px">Notes/Field</th></tr><tr class="test-header"><th class="small-col">B</th><th class="small-col">Cu</th><th class="small-col">Fe</th><th class="small-col">Mn</th><th class="small-col">Na</th><th class="small-col">S</th><th class="small-col">Zn</th></tr></thead><tbody>
      ${selected.map((s, i) => `<tr><td>${i + 1}</td><td class="sample-id">${(s.SiteID || '').substring(0, 6)}</td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td></td><td></td><td></td><td></td><td style="text-align:left;font-size:8px">${s.Field || ''}</td></tr>`).join('')}
      ${Array(Math.max(0, 15 - selected.length)).fill().map((_, i) => `<tr><td>${selected.length + i + 1}</td><td></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td><span class="checkbox"></span></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}
      </tbody></table>
      <div class="footer"><p><strong>S1M</strong> - Organic Matter, Phosphorous, Potassium, Calcium, Magnesium, pH, Buffer pH</p><p><strong>S2M</strong> - S1M plus any two of: Sodium, Sulfate-Sulfur, Boron, Zinc, Manganese, Iron, Copper (each add'l $2.00)</p><p><strong>S3M</strong> - S1M plus all of: Sodium, Sulfate-Sulfur, Boron, Zinc, Manganese, Iron, Copper</p><p style="margin-top:10px;color:#666">Generated: ${today} | Total Samples: ${selected.length}</p></div></body></html>`;
    openPrintWindow(printContent);
  }

  function generateSapForm(selected) {
    const today = new Date().toLocaleDateString();
    const first = selected[0];
    const cbx = '<span style="font-size:10px">☐</span>';
    const printContent = `<!DOCTYPE html><html><head><title>Sap Sample Chain of Custody Form</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;padding:15px;max-width:11in}.header{display:flex;justify-content:space-between;margin-bottom:15px}.header-box{flex:1;padding:10px}.header-box.left{border-right:2px solid #e8a83c}.header-row{display:flex;margin-bottom:8px}.header-label{font-weight:bold;width:100px}.header-value{flex:1;border-bottom:1px solid #ccc;padding-left:5px;color:#e8a83c}.logo{font-size:18px;font-weight:bold;color:#e8a83c;margin-bottom:10px}table{width:100%;border-collapse:collapse;font-size:9px;margin-top:10px}th,td{border:1px solid #333;padding:4px;text-align:center;vertical-align:top}th{background:#f5f5f5;font-weight:bold;font-size:9px}.field-col{width:100px;text-align:left}.sample-id{font-weight:bold;font-family:monospace;font-size:10px;text-align:left}.sample-type{font-size:8px;text-align:left;line-height:1.4}.vigor-col{font-size:8px;line-height:1.3}.footer{margin-top:20px}.footer-section{display:flex;margin-bottom:15px}.footer-label{font-weight:bold;width:120px}.footer-box{flex:1;border:1px solid #333;padding:8px;margin-left:10px}.sig-line{border-bottom:1px solid #333;flex:1;min-height:25px}@media print{body{padding:10px}@page{size:landscape;margin:0.4in}}</style></head><body>
      <div class="header"><div class="header-box left"><div class="logo">NEWAGE<br><span style="font-size:8px;color:#666">Laboratories</span></div><div class="header-row"><span class="header-label">Consultant:</span><span class="header-value">NutraDrip</span></div><div class="header-row"><span class="header-label">Contact:</span><span class="header-value">Kurt Grimm</span></div><div class="header-row"><span class="header-label">Phone:</span><span class="header-value">785-547-5209</span></div><div class="header-row"><span class="header-label">Address:</span><span class="header-value">2991 Goldfinch RD Hiawatha, KS</span></div></div><div class="header-box"><div style="height:28px"></div><div class="header-row"><span class="header-label">Farm Name:</span><span class="header-value">${first?.Farm || first?.Client || ''}</span></div><div class="header-row"><span class="header-label">Contact:</span><span class="header-value"></span></div><div class="header-row"><span class="header-label">Phone:</span><span class="header-value"></span></div><div class="header-row"><span class="header-label">Address:</span><span class="header-value"></span></div></div></div>
      <table><thead><tr><th class="field-col">Farm/Field ID</th><th style="width:90px">Sample ID</th><th style="width:85px">Sample Type</th><th style="width:65px">Date</th><th style="width:50px">Time</th><th style="width:70px">Crop</th><th style="width:70px">Variety</th><th style="width:80px">Growth Stage</th><th style="width:55px">Vigor</th><th style="width:60px">Irrigation</th><th style="width:45px">Lab Use</th></tr></thead><tbody>
      ${selected.map(s => `<tr><td class="field-col">${s.Field || ''}</td><td class="sample-id">${s.SiteID || ''}</td><td class="sample-type">${cbx} Sap New / ${cbx} Sap Old<br>${cbx} Sap Root<br>${cbx} Fertigation<br>${cbx} Rapid Soil<br>${cbx} Other: ______</td><td></td><td></td><td></td><td></td><td></td><td class="vigor-col">${cbx} 5-Excl<br>${cbx} 4-A.Avg<br>${cbx} 3-Avg<br>${cbx} 2-B.Avg<br>${cbx} 1-Poor</td><td></td><td></td></tr>`).join('')}
      ${Array(Math.max(0, 6 - selected.length)).fill().map(() => `<tr><td class="field-col"></td><td class="sample-id"></td><td class="sample-type">${cbx} Sap New / ${cbx} Sap Old<br>${cbx} Sap Root<br>${cbx} Fertigation<br>${cbx} Rapid Soil<br>${cbx} Other: ______</td><td></td><td></td><td></td><td></td><td></td><td class="vigor-col">${cbx} 5-Excl<br>${cbx} 4-A.Avg<br>${cbx} 3-Avg<br>${cbx} 2-B.Avg<br>${cbx} 1-Poor</td><td></td><td></td></tr>`).join('')}
      </tbody></table>
      <div class="footer"><div class="footer-section"><span class="footer-label">Samples Taken By:</span><div class="footer-box"><div style="display:flex;gap:20px;margin-bottom:5px"><span style="color:#999">Print Name:</span><span class="sig-line"></span></div><div style="display:flex;gap:20px"><span style="color:#999">Signature:</span><span class="sig-line"></span></div></div></div><div class="footer-section"><span class="footer-label">Send Results To:</span><div class="footer-box"><span style="color:#999">Email:</span> data@calibrateyouragronomy.com</div></div></div>
      <div style="margin-top:10px;font-size:8px;color:#666">Generated: ${today} | Total Samples: ${selected.length}</div></body></html>`;
    openPrintWindow(printContent);
  }

  function openPrintWindow(content) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }
</script>

<Modal title="Print Sample Labels" onclose={onclose}>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="print-type" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Filter by Type</label>
        <select id="print-type" bind:value={filterType}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]">
          <option value="all">All Types</option>
          {#each existingTypes as t}
            <option value={t}>{SITE_TYPES[t]?.emoji || ''} {SITE_TYPES[t]?.name || t}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="print-field" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Filter by Field</label>
        <select id="print-field" bind:value={filterField}
          class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]">
          <option value="all">All Fields</option>
          {#each existingFields as f}
            <option value={f}>{f}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Lab form selector -->
    <div>
      <label for="print-lab" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Lab Form</label>
      <select id="print-lab" bind:value={labForm}
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]">
        <option value="labels">Generic Labels (2-column)</option>
        <option value="sheet">Collection Sheet (table)</option>
        <option value="waypoint-tissue">Waypoint Analytical - Tissue</option>
        <option value="sap-sample">NewAge Sap Sample Form</option>
      </select>
    </div>

    <!-- Select/deselect buttons -->
    <div class="flex items-center justify-between">
      <span class="text-sm text-slate-600">
        {selectedSiteIds.size} of {filteredSites.length} selected
      </span>
      <div class="flex gap-2">
        <button onclick={selectAll}
          class="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition-colors">
          Select All
        </button>
        <button onclick={deselectAll}
          class="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition-colors">
          Deselect All
        </button>
      </div>
    </div>

    <!-- Sites list -->
    <div class="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
      {#if filteredSites.length === 0}
        <div class="p-6 text-center text-slate-500 text-sm">No sample sites found. Add sites using the map.</div>
      {:else}
        <table class="w-full text-sm">
          <thead class="bg-slate-50 sticky top-0">
            <tr>
              <th class="w-8 px-2 py-2"></th>
              <th class="px-2 py-2 text-left font-semibold text-slate-600">Site ID</th>
              <th class="px-2 py-2 text-left font-semibold text-slate-600">Type</th>
              <th class="px-2 py-2 text-left font-semibold text-slate-600">Field</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredSites as site}
              {@const key = `${site.SiteID}_${site.Type}`}
              {@const meta = SITE_TYPES[site.Type]}
              <tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  style="background-color: {selectedSiteIds.has(key) ? (meta?.bgColor || '#f8fafc') : 'transparent'}"
                  onclick={() => toggleSite(site.SiteID, site.Type)}>
                <td class="px-2 py-2 text-center">
                  <input type="checkbox" checked={selectedSiteIds.has(key)} class="w-4 h-4 rounded" />
                </td>
                <td class="px-2 py-2 font-mono font-semibold">{site.SiteID}</td>
                <td class="px-2 py-2">{meta?.emoji || ''} {meta?.name || site.Type}</td>
                <td class="px-2 py-2 text-slate-600">{site.Field || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <button onclick={generateLabels}
      class="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-blue-700 active:bg-blue-800 transition-colors">
      Print ({selectedSiteIds.size} selected)
    </button>
  </svelte:fragment>
</Modal>
