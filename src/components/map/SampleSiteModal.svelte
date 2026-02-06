<script>
  import Modal from '../shared/Modal.svelte';
  import { sampleSites, SITE_TYPES } from '$lib/stores/sampleSites.js';
  import { loadClientsData, loadFarmsData, SheetsAPI } from '$lib/core/data.js';
  import { getSheetId } from '$lib/core/config.js';
  import { showToast } from '$lib/stores/app.js';

  export let lat = 0;
  export let lng = 0;
  export let fieldInfo = null; // { fieldName, farmId }
  export let editSites = null; // array of existing sites at this location (for edit mode)
  export let onclose = () => {};
  export let onsave = () => {};

  let clientId = '';
  let farmId = '';
  let siteId = '';
  let notes = '';
  let selectedTypes = {};
  let saving = false;

  // Track which types existed before edit
  let existingTypes = [];

  const clientsData = loadClientsData();
  const farmsData = loadFarmsData();

  // Initialize state
  $: {
    if (editSites && editSites.length > 0) {
      // Edit mode
      const base = editSites[0];
      existingTypes = editSites.map(s => s.Type);
      siteId = base.SiteID || '';
      notes = base.Notes || '';

      // Set checkboxes
      selectedTypes = {};
      existingTypes.forEach(t => selectedTypes[t] = true);

      // Auto-select client/farm
      const matchClient = clientsData.find(c => c.name === base.Client);
      if (matchClient) clientId = matchClient.id;
      const matchFarm = farmsData.find(f => f.name === base.Farm);
      if (matchFarm) farmId = matchFarm.id;
    } else {
      // New mode
      existingTypes = [];
      selectedTypes = {};
      siteId = '';
      notes = '';

      // Auto-detect client/farm from field boundary
      if (fieldInfo?.farmId) {
        const farm = farmsData.find(f => f.id === fieldInfo.farmId);
        if (farm) {
          clientId = farm.clientId || '';
          farmId = fieldInfo.farmId;
        }
      }
    }
  }

  $: clientFarms = clientId
    ? farmsData.filter(f => f.clientId === clientId)
    : [];

  $: detectedField = fieldInfo?.fieldName || null;

  function autoGenerateId() {
    const firstType = Object.keys(selectedTypes).find(t => selectedTypes[t]) || 'TIS';
    const fieldName = detectedField || '';

    let fieldInitials = 'XX';
    if (fieldName) {
      const words = fieldName.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w);
      if (words.length >= 2) {
        fieldInitials = (words[0][0] + words[1][0]).toUpperCase();
      } else if (words[0]) {
        fieldInitials = words[0].substring(0, 2).toUpperCase();
      }
    }

    const prefix = `${firstType}-${fieldInitials}`;
    const sites = $sampleSites;
    const existingCount = sites.filter(s => s.SiteID && s.SiteID.startsWith(prefix)).length;
    const seqNum = String(existingCount + 1).padStart(3, '0');
    siteId = `${prefix}-${seqNum}`;
  }

  async function ensureSampleSitesTab() {
    const sheetId = getSheetId();
    try {
      await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId, range: 'SampleSites!A1:A1'
      });
    } catch {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        resource: { requests: [{ addSheet: { properties: { title: 'SampleSites' } } }] }
      });
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: 'SampleSites!A1:J1', valueInputOption: 'RAW',
        resource: { values: [['SiteID', 'Type', 'Client', 'Farm', 'Field', 'Lat', 'Lng', 'Notes', 'Active', 'CreatedDate']] }
      });
    }
  }

  async function appendSiteToSheet(siteData) {
    const sheetId = getSheetId();
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: 'SampleSites!A2:J2', valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[
        siteData.SiteID, siteData.Type, siteData.Client, siteData.Farm,
        siteData.Field, siteData.Lat, siteData.Lng, siteData.Notes,
        siteData.Active, siteData.CreatedDate
      ]] }
    });
  }

  async function softDeleteSiteInSheet(siteID, type) {
    const sheetId = getSheetId();
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: sheetId, range: 'SampleSites!A2:J1000'
    });
    const rows = response.result.values || [];
    const tolerance = 0.0001;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === siteID && row[1] === type &&
          Math.abs(parseFloat(row[5]) - lat) < tolerance &&
          Math.abs(parseFloat(row[6]) - lng) < tolerance) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId, range: `SampleSites!I${i + 2}`, valueInputOption: 'RAW',
          resource: { values: [['FALSE']] }
        });
        break;
      }
    }
  }

  async function updateSiteInSheet(oldSiteId, newSiteId, newNotes) {
    const sheetId = getSheetId();
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: sheetId, range: 'SampleSites!A2:J1000'
    });
    const rows = response.result.values || [];
    const tolerance = 0.0001;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === oldSiteId &&
          Math.abs(parseFloat(row[5]) - lat) < tolerance &&
          Math.abs(parseFloat(row[6]) - lng) < tolerance) {
        const updates = [];
        if (newSiteId !== oldSiteId) {
          updates.push(gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId, range: `SampleSites!A${i + 2}`, valueInputOption: 'RAW',
            resource: { values: [[newSiteId]] }
          }));
        }
        updates.push(gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId, range: `SampleSites!H${i + 2}`, valueInputOption: 'RAW',
          resource: { values: [[newNotes]] }
        }));
        await Promise.all(updates);
      }
    }
  }

  async function handleSave() {
    if (!SheetsAPI.isSignedIn) {
      showToast('Please sign in to save sample sites', 'error');
      return;
    }

    const typesToAdd = Object.keys(selectedTypes).filter(t => selectedTypes[t] && !existingTypes.includes(t));
    const typesToRemove = existingTypes.filter(t => !selectedTypes[t]);

    let hasRename = false;
    let hasNotesChange = false;
    if (editSites && editSites.length > 0) {
      hasRename = siteId && siteId !== editSites[0].SiteID;
      hasNotesChange = notes !== (editSites[0].Notes || '');
    }

    const totalSelected = Object.keys(selectedTypes).filter(t => selectedTypes[t]).length;
    if (totalSelected === 0 && typesToRemove.length === 0) {
      showToast('Please select at least one sample type', 'error');
      return;
    }

    if (existingTypes.length > 0 && typesToAdd.length === 0 && typesToRemove.length === 0 && !hasRename && !hasNotesChange) {
      showToast('No changes made', 'error');
      return;
    }

    if (typesToAdd.length > 0 && !clientId) {
      showToast('Please select a Client', 'error');
      return;
    }
    if (typesToAdd.length > 0 && !farmId) {
      showToast('Please select a Farm', 'error');
      return;
    }

    const client = clientsData.find(c => c.id === clientId);
    const farm = farmsData.find(f => f.id === farmId);
    const fieldName = detectedField || '';
    const messages = [];

    saving = true;
    try {
      // Handle rename/notes update
      if ((hasRename || hasNotesChange) && editSites?.length > 0) {
        const oldId = editSites[0].SiteID;
        await updateSiteInSheet(oldId, hasRename ? siteId : oldId, notes);

        sampleSites.update(sites => {
          const tolerance = 0.0001;
          return sites.map(s => {
            if (s.SiteID === oldId && Math.abs(s.Lat - lat) < tolerance && Math.abs(s.Lng - lng) < tolerance) {
              return { ...s, SiteID: hasRename ? siteId : s.SiteID, Notes: notes };
            }
            return s;
          });
        });

        if (hasRename) messages.push(`Renamed to: ${siteId}`);
        if (hasNotesChange && !hasRename) messages.push('Notes updated');
      }

      // Remove unchecked types
      if (typesToRemove.length > 0) {
        for (const type of typesToRemove) {
          await softDeleteSiteInSheet(editSites[0].SiteID, type);
        }
        sampleSites.update(sites => {
          const tolerance = 0.0001;
          return sites.map(s => {
            if (Math.abs(s.Lat - lat) < tolerance && Math.abs(s.Lng - lng) < tolerance && typesToRemove.includes(s.Type)) {
              return { ...s, Active: 'FALSE' };
            }
            return s;
          });
        });
        const removedNames = typesToRemove.map(t => SITE_TYPES[t]?.name || t).join(', ');
        messages.push(`Removed: ${removedNames}`);
      }

      // Add new types
      if (typesToAdd.length > 0) {
        await ensureSampleSitesTab();
        for (const typeCode of typesToAdd) {
          const baseSiteId = siteId || (() => { autoGenerateId(); return siteId; })();
          const siteData = {
            SiteID: baseSiteId,
            Type: typeCode,
            Client: client?.name || '',
            Farm: farm?.name || '',
            Field: fieldName,
            Lat: lat,
            Lng: lng,
            Notes: notes,
            Active: 'TRUE',
            CreatedDate: new Date().toISOString()
          };
          await appendSiteToSheet(siteData);
          sampleSites.update(sites => [...sites, siteData]);
        }
        const addedNames = typesToAdd.map(t => SITE_TYPES[t]?.name || t).join(', ');
        messages.push(`Added: ${addedNames}`);
      }

      showToast(messages.join(' | '), 'success');
      onsave();
      onclose();
    } catch (error) {
      console.error('Error saving sample site:', error);
      showToast('Error saving: ' + error.message, 'error');
    } finally {
      saving = false;
    }
  }
</script>

<Modal title={editSites ? 'Edit Sample Site' : 'Add Sample Site'} onclose={onclose}>
  <div class="space-y-4">
    <!-- Location -->
    <div class="flex gap-4 text-sm">
      <div><span class="text-slate-500">Lat:</span> <span class="font-mono font-medium">{lat.toFixed(6)}</span></div>
      <div><span class="text-slate-500">Lng:</span> <span class="font-mono font-medium">{lng.toFixed(6)}</span></div>
    </div>

    <!-- Detected field -->
    <div>
      <span class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Detected Field</span>
      {#if detectedField}
        <div class="px-3 py-2 rounded-lg bg-green-50 text-green-700 font-medium text-sm">{detectedField}</div>
      {:else}
        <div class="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm">No field detected at this location</div>
      {/if}
    </div>

    <!-- Client -->
    <div>
      <label for="site-client" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Client</label>
      <select id="site-client" bind:value={clientId}
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]">
        <option value="">-- Select Client --</option>
        {#each clientsData as client}
          <option value={client.id}>{client.name}</option>
        {/each}
      </select>
    </div>

    <!-- Farm -->
    <div>
      <label for="site-farm" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Farm</label>
      <select id="site-farm" bind:value={farmId}
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base bg-white min-h-[44px]">
        <option value="">-- Select Farm --</option>
        {#each clientFarms as farm}
          <option value={farm.id}>{farm.name}</option>
        {/each}
      </select>
    </div>

    <!-- Sample Types -->
    <div>
      <span class="text-[10px] font-semibold text-slate-500 uppercase block mb-2">Sample Types</span>
      <div class="grid grid-cols-2 gap-2">
        {#each Object.entries(SITE_TYPES) as [code, meta]}
          <label
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-[44px]"
            class:border-slate-200={!selectedTypes[code]}
            class:bg-slate-50={!selectedTypes[code]}
            class:border-green-300={selectedTypes[code] && existingTypes.includes(code)}
            class:bg-green-50={selectedTypes[code] && existingTypes.includes(code)}
            class:border-blue-300={selectedTypes[code] && !existingTypes.includes(code)}
            class:bg-blue-50={selectedTypes[code] && !existingTypes.includes(code)}
          >
            <input type="checkbox" bind:checked={selectedTypes[code]}
              class="w-4 h-4 rounded border-slate-300" />
            <span class="text-base">{meta.emoji}</span>
            <span class="text-sm font-medium">{meta.name}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Site ID -->
    <div>
      <label for="site-id" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Site ID</label>
      <div class="flex gap-2">
        <input id="site-id" type="text" bind:value={siteId} placeholder="e.g. TIS-WF-001"
          class="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-base min-h-[44px]" />
        <button onclick={autoGenerateId}
          class="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium min-h-[44px] cursor-pointer transition-colors whitespace-nowrap">
          Auto ID
        </button>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <label for="site-notes" class="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Notes</label>
      <textarea id="site-notes" bind:value={notes} rows="2" placeholder="Optional notes..."
        class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base resize-none"></textarea>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <div class="flex gap-3">
      <button onclick={onclose}
        class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-slate-50 transition-colors">
        Cancel
      </button>
      <button onclick={handleSave} disabled={saving}
        class="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? 'Saving...' : 'Save Site'}
      </button>
    </div>
  </svelte:fragment>
</Modal>
