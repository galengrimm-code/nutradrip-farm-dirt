/**
 * Sap Analysis Viewer Module
 * UI rendering and interaction logic for sap analysis viewer
 *
 * Dependencies:
 * - DataCore (for loading in-season data)
 * - SapLogic (for computations)
 * - SapRulesets.v1 (for thresholds)
 */

window.SapViewer = (function() {
  'use strict';

  // State
  let inSeasonData = [];
  let sapSites = [];
  let selectedSiteId = null;
  let selectedDate = null;
  let viewMode = 'both'; // 'both', 'new', 'old'
  let displayMode = 'raw'; // 'raw', 'ratios', 'status'
  let sortMode = 'group'; // 'group', 'severity'
  let trendViewMode = 'graph'; // 'table', 'graph'
  let searchFilter = '';
  let notes = {}; // { siteId-date: 'note text' }
  let collapsedGroups = new Set(); // Track collapsed groups
  let currentEvaluation = null; // Current evaluation result for click handlers
  let currentSampleDate = null; // Current sample date data for click handlers

  /**
   * Initialize the sap viewer
   */
  async function init() {
    // Load data
    await loadData();

    // Load saved notes
    loadNotes();

    // Setup UI
    renderSiteSelector();
    setupEventListeners();
    setupGlobalClickHandler();

    // Show aggregate view by default (no site selected)
    if (sapSites.length > 0) {
      renderAggregateView();
    } else {
      renderEmptyState();
    }
  }

  /**
   * Load in-season data and build site list
   */
  async function loadData() {
    try {
      // Try IndexedDB first
      inSeasonData = await DataCore.loadInSeasonFromIndexedDB() || [];
      console.log('SapViewer: IndexedDB returned', inSeasonData.length, 'records');
      console.log('SapViewer: SheetsAPI.isSignedIn =', window.SheetsAPI?.isSignedIn);

      // If empty and signed in, try loading from Google Sheets
      if (inSeasonData.length === 0 && window.SheetsAPI?.isSignedIn) {
        console.log('SapViewer: IndexedDB empty, trying Google Sheets...');
        try {
          inSeasonData = await window.SheetsAPI.getInSeasonAnalysis() || [];
          // Cache to IndexedDB for future use
          if (inSeasonData.length > 0) {
            await DataCore.saveInSeasonToIndexedDB(inSeasonData);
            console.log('SapViewer: Cached', inSeasonData.length, 'records to IndexedDB');
          }
        } catch (sheetsErr) {
          console.error('SapViewer: Sheets load failed:', sheetsErr);
        }
      } else if (inSeasonData.length === 0) {
        console.log('SapViewer: IndexedDB empty but not signed in - cannot load from Sheets');
      }

      // Filter to SAP type only
      const sapData = inSeasonData.filter(r => r.Type === 'Sap' || r.Type === 'SAP');

      // Group by SiteId
      const siteMap = new Map();
      sapData.forEach(record => {
        const siteId = record.SiteId;
        if (!siteId) return;

        if (!siteMap.has(siteId)) {
          siteMap.set(siteId, {
            SiteId: siteId,
            Field: record.Field || '',
            Client: record.Client || '',
            Farm: record.Farm || '',
            Lat: record.Lat,
            Lng: record.Lng,
            PlantType: record.PlantType || 'Corn',
            samples: []
          });
        }

        siteMap.get(siteId).samples.push(record);
      });

      // Sort samples by date within each site
      siteMap.forEach(site => {
        site.samples.sort((a, b) => {
          const dateA = new Date(a.LabDate || a.Year);
          const dateB = new Date(b.LabDate || b.Year);
          return dateA - dateB; // Earliest first
        });
      });

      sapSites = Array.from(siteMap.values());
      sapSites.sort((a, b) => a.SiteId.localeCompare(b.SiteId));

      console.log(`SapViewer: Loaded ${sapSites.length} sites with ${sapData.length} total sap samples`);
    } catch (e) {
      console.error('Error loading sap data:', e);
      sapSites = [];
    }
  }

  /**
   * Build sample date object from records (pairing new/old leaf)
   */
  function buildSampleDates(samples) {
    // Group by date
    const dateMap = new Map();

    samples.forEach(record => {
      const date = record.LabDate || '';
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          sample_date: date,
          growth_stage: record.GrowthStage || '',
          plant_type: record.PlantType || 'Corn',
          variety: record.Variety || '',
          new_leaf: null,
          old_leaf: null
        });
      }

      const sampleDate = dateMap.get(date);
      const leafAge = (record.LeafAge || '').toLowerCase();

      // Build nutrient object from record
      const nutrients = extractNutrients(record);

      if (leafAge === 'new' || leafAge === 'new leaf') {
        sampleDate.new_leaf = nutrients;
      } else if (leafAge === 'old' || leafAge === 'old leaf') {
        sampleDate.old_leaf = nutrients;
      } else {
        // If no leaf age specified, assume it's a single sample
        if (!sampleDate.new_leaf) {
          sampleDate.new_leaf = nutrients;
        } else if (!sampleDate.old_leaf) {
          sampleDate.old_leaf = nutrients;
        }
      }
    });

    // Convert to array and sort by date ascending (earliest first)
    const result = Array.from(dateMap.values());
    result.sort((a, b) => new Date(a.sample_date) - new Date(b.sample_date));
    return result;
  }

  /**
   * Extract nutrient values from a record
   */
  function extractNutrients(record) {
    const nutrients = {};
    const nutrientKeys = [
      'Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4', 'Phosphorus', 'Potassium',
      'Calcium', 'Magnesium', 'Sulfur', 'Boron', 'Iron', 'Manganese',
      'Copper', 'Zinc', 'Molybdenum', 'Chloride', 'Sodium', 'Silica',
      'Aluminum', 'Cobalt', 'Nickel', 'Selenium', 'Brix', 'Sugars',
      'EC', 'pH', 'KCa_Ratio', 'N_Conversion_Efficiency'
    ];

    nutrientKeys.forEach(key => {
      if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
        const val = parseFloat(record[key]);
        if (!isNaN(val)) {
          nutrients[key] = val;
        }
      }
    });

    return nutrients;
  }

  /**
   * Build aggregate data by growth stage across all sites
   * Returns array of sample date objects with averaged nutrient values
   */
  function buildAggregateByGrowthStage() {
    // Get all SAP records
    const sapData = inSeasonData.filter(r => r.Type === 'Sap' || r.Type === 'SAP');
    console.log('Aggregate: inSeasonData count:', inSeasonData.length);
    console.log('Aggregate: sapData count:', sapData.length);
    if (sapData.length > 0) {
      console.log('Aggregate: Sample record:', sapData[0]);
      console.log('Aggregate: Growth stages found:', [...new Set(sapData.map(r => r.GrowthStage))]);
    }

    // Group by growth stage and leaf age
    const stageMap = new Map();

    sapData.forEach(record => {
      const stage = record.GrowthStage || 'Unknown';
      const leafAge = (record.LeafAge || '').toLowerCase();
      const leafKey = (leafAge === 'old' || leafAge === 'old leaf') ? 'old_leaf' : 'new_leaf';

      if (!stageMap.has(stage)) {
        stageMap.set(stage, {
          growth_stage: stage,
          plant_type: record.PlantType || 'Corn',
          new_leaf_values: [],
          old_leaf_values: [],
          sites: new Set()
        });
      }

      const stageData = stageMap.get(stage);
      const nutrients = extractNutrients(record);

      if (leafKey === 'new_leaf') {
        stageData.new_leaf_values.push(nutrients);
      } else {
        stageData.old_leaf_values.push(nutrients);
      }

      if (record.SiteId) {
        stageData.sites.add(record.SiteId);
      }
    });

    // Average the values for each growth stage
    const result = [];

    // Sort stages in typical growth order
    const stageOrder = ['V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'VT', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'Unknown'];
    const sortedStages = Array.from(stageMap.keys()).sort((a, b) => {
      const aIdx = stageOrder.indexOf(a);
      const bIdx = stageOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    sortedStages.forEach(stage => {
      const data = stageMap.get(stage);

      // Average nutrients for new leaf
      const newLeafAvg = averageNutrients(data.new_leaf_values);
      const oldLeafAvg = averageNutrients(data.old_leaf_values);

      result.push({
        sample_date: `Stage: ${stage}`,
        growth_stage: stage,
        plant_type: data.plant_type,
        variety: '',
        new_leaf: Object.keys(newLeafAvg).length > 0 ? newLeafAvg : null,
        old_leaf: Object.keys(oldLeafAvg).length > 0 ? oldLeafAvg : null,
        site_count: data.sites.size,
        new_sample_count: data.new_leaf_values.length,
        old_sample_count: data.old_leaf_values.length
      });
    });

    return result;
  }

  /**
   * Average an array of nutrient objects
   */
  function averageNutrients(nutrientArrays) {
    if (!nutrientArrays || nutrientArrays.length === 0) return {};

    const sums = {};
    const counts = {};

    nutrientArrays.forEach(nutrients => {
      Object.entries(nutrients).forEach(([key, val]) => {
        if (typeof val === 'number' && !isNaN(val)) {
          sums[key] = (sums[key] || 0) + val;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });

    const result = {};
    Object.keys(sums).forEach(key => {
      result[key] = sums[key] / counts[key];
    });

    return result;
  }

  /**
   * Render the aggregate view (all sites averaged by growth stage)
   */
  function renderAggregateView() {
    selectedSiteId = null;
    selectedDate = null;

    const container = document.getElementById('sapViewerContent');
    if (!container) return;

    const aggregateData = buildAggregateByGrowthStage();
    console.log('Aggregate view: aggregateData:', aggregateData);

    if (aggregateData.length === 0) {
      console.log('Aggregate view: No data, showing empty state');
      renderEmptyState();
      return;
    }

    // Update date selector to show growth stages
    const dateContainer = document.getElementById('sapDateSelect');
    if (dateContainer) {
      let html = '';
      aggregateData.forEach((sd, idx) => {
        const selected = idx === 0 ? 'selected' : '';
        const sampleInfo = `(${sd.site_count} sites, ${sd.new_sample_count + sd.old_sample_count} samples)`;
        html += `<option value="${sd.growth_stage}" ${selected}>${sd.growth_stage} ${sampleInfo}</option>`;
      });
      dateContainer.innerHTML = html || '<option value="">No data</option>';
    }

    // Select first stage by default
    const selectedStage = aggregateData[0];

    // Render content for aggregate view
    renderAggregateContent(aggregateData, selectedStage);
  }

  /**
   * Render content for aggregate view
   */
  function renderAggregateContent(aggregateData, selectedStage) {
    const container = document.getElementById('sapViewerContent');
    if (!container) return;

    // Evaluate status for selected stage
    const evaluation = SapLogic.evaluateStatus(selectedStage, {
      crop: selectedStage.plant_type || 'corn',
      growth_stage: selectedStage.growth_stage
    });

    // Store for click handlers
    currentEvaluation = evaluation;
    currentSampleDate = selectedStage;

    let html = '';

    // Aggregate header
    html += `
      <div class="sap-site-header">
        <div class="sap-site-info">
          <h3>All Sites Average</h3>
          <div class="sap-site-meta">
            <span>Growth Stage: ${selectedStage.growth_stage}</span>
            <span>${selectedStage.site_count} site(s)</span>
            <span>New: ${selectedStage.new_sample_count} samples</span>
            <span>Old: ${selectedStage.old_sample_count} samples</span>
          </div>
        </div>
        <div class="sap-ruleset-badge">Ruleset v1</div>
      </div>
    `;

    // Summary cards
    html += renderSummaryCards(evaluation.system_status);

    // Comparison table (use same function as single site)
    html += renderComparisonTable(selectedStage, evaluation);

    // Aggregate trend table (showing all stages)
    html += renderAggregateTrendTable(aggregateData);

    container.innerHTML = html;
  }

  /**
   * Render trend table for aggregate view (all growth stages)
   */
  function renderAggregateTrendTable(aggregateData) {
    const ruleset = window.SapRulesets?.v1 || {};

    // Use same nutrients as regular trend
    const trendNutrients = ['Nitrogen', 'Potassium', 'Calcium', 'Phosphorus', 'Brix'];

    let html = `
      <div class="sap-trend-section">
        <div class="sap-trend-header">
          <h4>Growth Stage Averages</h4>
          <span class="sap-trend-note">New leaf (top) / Old leaf (bottom)</span>
        </div>
        <div class="sap-trend-table-wrapper">
          <table class="sap-trend-table">
            <thead>
              <tr>
                <th>Nutrient</th>
                ${aggregateData.map(sd => `<th>${sd.growth_stage}<br><span style="font-size: 0.7rem; color: #6b7280;">(n=${sd.site_count})</span></th>`).join('')}
              </tr>
            </thead>
            <tbody>
    `;

    trendNutrients.forEach(nutrient => {
      // New leaf row
      html += `<tr class="sap-trend-row-new">`;
      html += `<td class="sap-trend-nutrient">${nutrient}</td>`;

      aggregateData.forEach(sd => {
        const val = sd.new_leaf?.[nutrient];
        const thresh = ruleset.getThreshold?.('corn', 'new_leaf', nutrient);
        const status = val !== undefined ? SapLogic.getStatus(val, thresh) : null;
        const colors = status ? SapLogic.getStatusColors(status) : { bg: 'transparent', text: '#94a3b8' };
        const display = val !== undefined ? formatValue(val, nutrient) : '-';
        html += `<td style="background: ${colors.bg}; color: ${colors.text}; font-weight: 500;">${display}</td>`;
      });
      html += '</tr>';

      // Old leaf row
      html += `<tr class="sap-trend-row-old">`;
      html += `<td class="sap-trend-nutrient" style="color: #6b7280; font-style: italic;"></td>`;

      aggregateData.forEach(sd => {
        const val = sd.old_leaf?.[nutrient];
        const thresh = ruleset.getThreshold?.('corn', 'old_leaf', nutrient);
        const status = val !== undefined ? SapLogic.getStatus(val, thresh) : null;
        const colors = status ? SapLogic.getStatusColors(status) : { bg: 'transparent', text: '#94a3b8' };
        const display = val !== undefined ? formatValue(val, nutrient) : '-';
        html += `<td style="background: ${colors.bg}; color: ${colors.text}; opacity: 0.8;">${display}</td>`;
      });
      html += '</tr>';
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Select a site and render its data
   */
  function selectSite(siteId) {
    // If no siteId, show aggregate view
    if (!siteId) {
      renderAggregateView();
      return;
    }

    selectedSiteId = siteId;
    const site = sapSites.find(s => s.SiteId === siteId);

    if (!site) {
      renderEmptyState();
      return;
    }

    // Build sample dates
    const sampleDates = buildSampleDates(site.samples);

    // Select most recent date (last in ascending-sorted array)
    if (sampleDates.length > 0) {
      selectedDate = sampleDates[sampleDates.length - 1].sample_date;
    } else {
      selectedDate = null;
    }

    // Update date selector
    renderDateSelector(sampleDates);

    // Render content
    renderContent(site, sampleDates);
  }

  /**
   * Select a date and re-render
   */
  function selectDate(date) {
    selectedDate = date;

    // If no site selected, we're in aggregate mode - date is actually growth stage
    if (!selectedSiteId) {
      const aggregateData = buildAggregateByGrowthStage();
      const selectedStage = aggregateData.find(sd => sd.growth_stage === date) || aggregateData[0];
      if (selectedStage) {
        renderAggregateContent(aggregateData, selectedStage);
      }
      return;
    }

    const site = sapSites.find(s => s.SiteId === selectedSiteId);
    if (site) {
      const sampleDates = buildSampleDates(site.samples);
      renderContent(site, sampleDates);
    }
  }

  // ========== RENDERING FUNCTIONS ==========

  function renderSiteSelector() {
    const container = document.getElementById('sapSiteSelect');
    if (!container) return;

    let html = '<option value="">All Sites (Avg by Stage)</option>';
    sapSites.forEach(site => {
      const label = site.Field ? `${site.SiteId} (${site.Field})` : site.SiteId;
      html += `<option value="${site.SiteId}">${label}</option>`;
    });
    container.innerHTML = html;
  }

  function renderDateSelector(sampleDates) {
    const container = document.getElementById('sapDateSelect');
    if (!container) return;

    let html = '';
    sampleDates.forEach(sd => {
      const dateStr = formatDate(sd.sample_date);
      const stage = sd.growth_stage ? ` (${sd.growth_stage})` : '';
      const selected = sd.sample_date === selectedDate ? 'selected' : '';
      html += `<option value="${sd.sample_date}" ${selected}>${dateStr}${stage}</option>`;
    });
    container.innerHTML = html || '<option value="">No samples</option>';
  }

  function renderEmptyState() {
    const container = document.getElementById('sapViewerContent');
    if (!container) return;

    container.innerHTML = `
      <div class="sap-empty-state">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🧪</div>
        <h3>No Sap Analysis Data</h3>
        <p>Import sap analysis data on the <a href="import.html">Import page</a> to get started.</p>
      </div>
    `;
  }

  function renderContent(site, sampleDates) {
    const container = document.getElementById('sapViewerContent');
    if (!container) return;

    // Find selected sample date (fallback to most recent if not found)
    const sampleDate = sampleDates.find(sd => sd.sample_date === selectedDate) || sampleDates[sampleDates.length - 1];
    if (!sampleDate) {
      renderEmptyState();
      return;
    }

    // Evaluate status
    const evaluation = SapLogic.evaluateStatus(sampleDate, {
      crop: site.PlantType || 'corn',
      growth_stage: sampleDate.growth_stage
    });

    // Store for click handlers
    currentEvaluation = evaluation;
    currentSampleDate = sampleDate;

    // Build HTML
    let html = '';

    // Site info header
    html += renderSiteHeader(site, sampleDate);

    // Summary cards
    html += renderSummaryCards(evaluation.system_status);

    // Dual leaf comparison table
    html += renderComparisonTable(sampleDate, evaluation);

    // Trend view (season)
    if (sampleDates.length > 1) {
      html += renderTrendTable(sampleDates, site.PlantType || 'corn');
    }

    // Status timeline
    if (sampleDates.length > 1) {
      html += renderTimeline(sampleDates, site.PlantType || 'corn');
    }

    // Notes section
    html += renderNotesSection(site.SiteId, selectedDate);

    container.innerHTML = html;

    // Setup note save handler
    setupNotesHandler();
  }

  function renderSiteHeader(site, sampleDate) {
    return `
      <div class="sap-site-header">
        <div class="sap-site-info">
          <h3>${site.SiteId}</h3>
          <div class="sap-site-meta">
            ${site.Field ? `<span>Field: ${site.Field}</span>` : ''}
            ${site.PlantType ? `<span>Crop: ${site.PlantType}</span>` : ''}
            ${sampleDate.variety ? `<span>Variety: ${sampleDate.variety}</span>` : ''}
            ${sampleDate.growth_stage ? `<span>Stage: ${sampleDate.growth_stage}</span>` : ''}
          </div>
        </div>
        <div class="sap-ruleset-badge">Ruleset v1</div>
      </div>
    `;
  }

  function renderSummaryCards(systemStatus) {
    const systems = [
      { key: 'N', label: 'Nitrogen System', icon: '🌿' },
      { key: 'CATIONS', label: 'Cation Balance', icon: '⚖️' },
      { key: 'MICROS', label: 'Micronutrients', icon: '🔬' },
      { key: 'SUGARS', label: 'Sugars/Energy', icon: '⚡' }
    ];

    let html = '<div class="sap-summary-cards">';

    systems.forEach(sys => {
      const status = systemStatus[sys.key] || { status: 'OK', reason: '', confidence: 'Low', issues: [] };
      const colors = SapLogic.getStatusColors(status.status);
      const issueCount = status.issues?.length || 0;
      const hasIssues = issueCount > 0;
      const clickStyle = hasIssues ? 'cursor: pointer;' : '';

      html += `
        <div class="sap-summary-card ${hasIssues ? 'clickable' : ''}"
             data-system="${sys.key}"
             style="border-color: ${colors.border}; background: ${colors.bg}; ${clickStyle}">
          <div class="sap-card-header">
            <span class="sap-card-icon">${sys.icon}</span>
            <span class="sap-card-title">${sys.label}</span>
          </div>
          <div class="sap-card-status">
            <span class="sap-status-dot" style="background: ${colors.dot};"></span>
            <span class="sap-status-text" style="color: ${colors.text};">${status.status}</span>
          </div>
          <div class="sap-card-reason">${status.reason || 'All values in range'}</div>
          <div class="sap-card-confidence">
            Confidence: ${status.confidence}
            ${hasIssues ? `<span class="sap-card-more">(click for details)</span>` : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  function renderComparisonTable(sampleDate, evaluation) {
    // Build rows using unified row model
    const groups = SapLogic.buildTableRows(displayMode, sampleDate, evaluation);

    // Apply search filter
    const filterLower = searchFilter.toLowerCase();

    // Determine column count
    const colCount = viewMode === 'both' ? 6 : 4;

    let html = `
      <div class="sap-comparison-section">
        <div class="sap-comparison-header">
          <h4>Leaf Comparison</h4>
          <div class="sap-comparison-controls">
            <input type="text" id="sapNutrientSearch" placeholder="Search nutrients..."
                   value="${searchFilter}" class="sap-search-input">
            <div class="sap-view-toggle">
              <button class="sap-toggle-btn ${viewMode === 'both' ? 'active' : ''}" onclick="SapViewer.setViewMode('both')">Both</button>
              <button class="sap-toggle-btn ${viewMode === 'new' ? 'active' : ''}" onclick="SapViewer.setViewMode('new')">New</button>
              <button class="sap-toggle-btn ${viewMode === 'old' ? 'active' : ''}" onclick="SapViewer.setViewMode('old')">Old</button>
            </div>
            <div class="sap-display-toggle">
              <button class="sap-toggle-btn ${displayMode === 'raw' ? 'active' : ''}" onclick="SapViewer.setDisplayMode('raw')">Raw</button>
              <button class="sap-toggle-btn ${displayMode === 'ratios' ? 'active' : ''}" onclick="SapViewer.setDisplayMode('ratios')">Ratios</button>
              <button class="sap-toggle-btn ${displayMode === 'status' ? 'active' : ''}" onclick="SapViewer.setDisplayMode('status')">Status</button>
            </div>
            <select id="sapSortSelect" class="sap-sort-select" onchange="SapViewer.setSortMode(this.value)">
              <option value="group" ${sortMode === 'group' ? 'selected' : ''}>Sort: By Group</option>
              <option value="severity" ${sortMode === 'severity' ? 'selected' : ''}>Sort: Worst First</option>
            </select>
          </div>
        </div>
        <div class="sap-comparison-table-wrapper">
          <table class="sap-comparison-table">
            <thead>
              <tr>
                <th>Nutrient</th>
                ${viewMode !== 'old' ? '<th class="sap-col-new">New Leaf</th>' : ''}
                ${viewMode !== 'old' ? '<th class="sap-col-status">Status</th>' : ''}
                ${viewMode === 'both' ? '<th class="sap-col-delta">Delta / Signal</th>' : ''}
                ${viewMode !== 'new' ? '<th class="sap-col-old">Old Leaf</th>' : ''}
                ${viewMode !== 'new' ? '<th class="sap-col-status">Status</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;

    // If sorting by severity, flatten all rows and sort
    if (sortMode === 'severity') {
      let allRows = [];
      groups.forEach(g => {
        g.rows.forEach(r => {
          if (!filterLower || r.label.toLowerCase().includes(filterLower) || r.key.toLowerCase().includes(filterLower)) {
            allRows.push(r);
          }
        });
      });
      allRows = SapLogic.sortRowsBySeverity(allRows);

      allRows.forEach(row => {
        html += `<tr data-metric-row="${row.key}">`;
        html += renderTableRow(row, colCount);
        html += `</tr>`;
      });
    } else {
      // Render by group with collapsible headers
      groups.forEach(group => {
        // Filter rows in this group
        const filteredRows = group.rows.filter(r =>
          !filterLower || r.label.toLowerCase().includes(filterLower) || r.key.toLowerCase().includes(filterLower)
        );

        if (filteredRows.length === 0) return;

        // Group header row (collapsible)
        html += `
          <tr class="sap-group-row" onclick="SapViewer.toggleGroup('${group.group}')" style="cursor: pointer;">
            <td colspan="${colCount}">
              <span class="sap-group-toggle" id="toggle-${group.group}">▼</span>
              ${group.name}
              <span style="font-weight: normal; color: #94a3b8; margin-left: 0.5rem;">(${filteredRows.length})</span>
            </td>
          </tr>
        `;

        // Data rows
        filteredRows.forEach(row => {
          html += `<tr class="sap-group-${group.group}-row" data-metric-row="${row.key}">`;
          html += renderTableRow(row, colCount);
          html += `</tr>`;
        });
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  // Render a single table row
  function renderTableRow(row, colCount) {
    const newColors = SapLogic.getStatusColors(row.newStatus?.status);
    const oldColors = SapLogic.getStatusColors(row.oldStatus?.status);
    const deltaColor = SapLogic.getDeltaColor(row.delta?.deltaPct);
    const signal = row.leafSignal || { signal: '', color: '#94a3b8' };

    let html = '';
    html += `<td class="sap-nutrient-name" data-metric="${row.key}">${row.label}</td>`;

    if (viewMode !== 'old') {
      html += `<td class="sap-value">${SapLogic.formatValue(row.newVal, row.key)}</td>`;
      html += `<td class="sap-status">
        <span class="sap-status-chip clickable"
              data-metric="${row.key}"
              data-leaf="new"
              data-status="${row.newStatus?.status || 'Unknown'}"
              style="background: ${newColors.bg}; color: ${newColors.text}; border-color: ${newColors.border}; cursor: pointer;">
          ${row.newStatus?.status || '—'}
        </span>
      </td>`;
    }

    if (viewMode === 'both') {
      const arrow = row.delta?.direction === 'up' ? '↑' : (row.delta?.direction === 'down' ? '↓' : '–');
      const deltaPctStr = row.delta?.deltaPct !== null && row.delta?.deltaPct !== undefined
        ? `${row.delta.deltaPct >= 0 ? '+' : ''}${row.delta.deltaPct.toFixed(0)}%`
        : '—';

      // Show leaf signal chip if there's a pattern
      const signalHtml = signal.signal
        ? `<div class="sap-signal-chip clickable"
               data-metric="${row.key}"
               data-signal="${signal.signal}"
               style="background: ${signal.color}; color: white; cursor: pointer;"
               title="${signal.description}">${signal.signal}</div>`
        : '';

      html += `<td class="sap-delta">
        <div style="color: ${deltaColor};">${arrow} ${deltaPctStr}</div>
        ${signalHtml}
      </td>`;
    }

    if (viewMode !== 'new') {
      html += `<td class="sap-value">${SapLogic.formatValue(row.oldVal, row.key)}</td>`;
      html += `<td class="sap-status">
        <span class="sap-status-chip clickable"
              data-metric="${row.key}"
              data-leaf="old"
              data-status="${row.oldStatus?.status || 'Unknown'}"
              style="background: ${oldColors.bg}; color: ${oldColors.text}; border-color: ${oldColors.border}; cursor: pointer;">
          ${row.oldStatus?.status || '—'}
        </span>
      </td>`;
    }

    return html;
  }

  function renderTrendTable(sampleDates, crop) {
    // Chart groupings by system
    const chartGroups = [
      { key: 'cations', label: 'Cations', metrics: ['Potassium', 'Calcium', 'Magnesium'], colors: ['#3b82f6', '#22c55e', '#f59e0b'] },
      { key: 'nitrogen', label: 'Nitrogen', metrics: ['Nitrogen_NO3', 'Nitrogen_NH4'], colors: ['#8b5cf6', '#ec4899'] },
      { key: 'micros', label: 'Micronutrients', metrics: ['Boron', 'Zinc'], colors: ['#06b6d4', '#f97316'] },
      { key: 'energy', label: 'Energy', metrics: ['Brix', 'Sugars'], colors: ['#10b981', '#84cc16'] }
    ];

    const displayDates = sampleDates.slice(0, 12);

    let html = `
      <div class="sap-trend-section">
        <div class="sap-trend-header">
          <h4>Season Trends</h4>
          <div class="sap-trend-controls">
            <div class="sap-view-toggle">
              <button class="sap-toggle-btn ${trendViewMode === 'graph' ? 'active' : ''}" onclick="SapViewer.setTrendViewMode('graph')">Graph</button>
              <button class="sap-toggle-btn ${trendViewMode === 'table' ? 'active' : ''}" onclick="SapViewer.setTrendViewMode('table')">Table</button>
            </div>
          </div>
        </div>
    `;

    if (trendViewMode === 'graph') {
      html += renderTrendGraphs(displayDates, chartGroups, crop);
    } else {
      html += renderTrendTableView(displayDates, chartGroups, crop);
    }

    html += `</div>`;
    return html;
  }

  /**
   * Render the table view of trends
   */
  function renderTrendTableView(displayDates, chartGroups, crop) {
    const allMetrics = chartGroups.flatMap(g => g.metrics);

    let html = `
      <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">New leaf (top) / Old leaf (bottom)</div>
      <div class="sap-trend-table-wrapper">
        <table class="sap-trend-table">
          <thead>
            <tr>
              <th>Metric</th>
              ${displayDates.map(sd => `<th class="sap-trend-date">${formatDateShort(sd.sample_date)}<br><span class="sap-stage">${sd.growth_stage || ''}</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    allMetrics.forEach(metric => {
      html += `<tr>`;
      html += `<td class="sap-trend-metric">${SapLogic.formatNutrientName(metric)}</td>`;

      displayDates.forEach(sd => {
        const newVal = sd.new_leaf?.[metric];
        const oldVal = sd.old_leaf?.[metric];
        const evaluation = SapLogic.evaluateStatus(sd, { crop });
        const newStatus = evaluation.per_nutrient_status.new_leaf?.[metric] || {};
        const oldStatus = evaluation.per_nutrient_status.old_leaf?.[metric] || {};
        const newColors = SapLogic.getStatusColors(newStatus.status);
        const oldColors = SapLogic.getStatusColors(oldStatus.status);

        html += `<td class="sap-trend-cell">`;
        if (newVal !== undefined || oldVal !== undefined) {
          html += `<div class="sap-trend-values">`;
          if (newVal !== undefined) {
            html += `<span class="sap-trend-new" style="background: ${newColors.bg}; border-color: ${newColors.border};" title="New leaf">${SapLogic.formatValue(newVal, metric)}</span>`;
          }
          if (oldVal !== undefined) {
            html += `<span class="sap-trend-old" style="background: ${oldColors.bg}; border-color: ${oldColors.border};" title="Old leaf">${SapLogic.formatValue(oldVal, metric)}</span>`;
          }
          html += `</div>`;
        } else {
          html += `<span class="sap-no-data">—</span>`;
        }
        html += `</td>`;
      });

      html += `</tr>`;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
    return html;
  }

  /**
   * Render graph view of trends using SVG
   */
  function renderTrendGraphs(displayDates, chartGroups, crop) {
    const chartWidth = 280;
    const chartHeight = 140;
    const padding = { top: 20, right: 20, bottom: 30, left: 45 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    let html = `
      <div class="sap-trend-legend">
        <span class="sap-legend-item"><span class="sap-legend-line solid"></span> New Leaf</span>
        <span class="sap-legend-item"><span class="sap-legend-line dashed"></span> Old Leaf</span>
      </div>
      <div class="sap-chart-grid">
    `;

    chartGroups.forEach(group => {
      html += `
        <div class="sap-chart-panel">
          <div class="sap-chart-title">${group.label}</div>
          <div class="sap-chart-container">
            ${renderSingleChart(displayDates, group.metrics, group.colors, crop, chartWidth, chartHeight, padding, plotWidth, plotHeight)}
          </div>
          <div class="sap-chart-legend">
            ${group.metrics.map((m, i) => `
              <span class="sap-metric-legend" style="color: ${group.colors[i]};">
                <span class="sap-legend-dot" style="background: ${group.colors[i]};"></span>
                ${SapLogic.formatNutrientName(m)}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  /**
   * Render a single SVG chart for a group of metrics
   */
  function renderSingleChart(displayDates, metrics, colors, crop, width, height, padding, plotWidth, plotHeight) {
    if (displayDates.length < 2) {
      return `<div class="sap-chart-empty">Need at least 2 dates for trend</div>`;
    }

    // Collect all values to determine scale
    let allValues = [];
    metrics.forEach(metric => {
      displayDates.forEach(sd => {
        const newVal = parseFloat(sd.new_leaf?.[metric]);
        const oldVal = parseFloat(sd.old_leaf?.[metric]);
        if (!isNaN(newVal)) allValues.push(newVal);
        if (!isNaN(oldVal)) allValues.push(oldVal);
      });
    });

    if (allValues.length === 0) {
      return `<div class="sap-chart-empty">No data</div>`;
    }

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const yMin = Math.max(0, minVal - range * 0.1);
    const yMax = maxVal + range * 0.1;
    const yRange = yMax - yMin || 1;

    // Helper to convert value to Y coordinate
    const toY = (val) => padding.top + plotHeight - ((val - yMin) / yRange * plotHeight);
    const toX = (i) => padding.left + (i / (displayDates.length - 1)) * plotWidth;

    // Build SVG
    let svg = `<svg width="${width}" height="${height}" class="sap-trend-svg">`;

    // Grid lines
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * plotHeight;
      const val = yMax - (i / gridLines) * yRange;
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
      svg += `<text x="${padding.left - 5}" y="${y + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${formatChartValue(val)}</text>`;
    }

    // X-axis labels (dates)
    displayDates.forEach((sd, i) => {
      const x = toX(i);
      const label = sd.growth_stage || formatDateShort(sd.sample_date);
      svg += `<text x="${x}" y="${height - 5}" text-anchor="middle" font-size="8" fill="#64748b">${label}</text>`;
    });

    // Draw lines for each metric
    metrics.forEach((metric, mi) => {
      const color = colors[mi];

      // New leaf line (solid)
      let newPoints = [];
      displayDates.forEach((sd, i) => {
        const val = parseFloat(sd.new_leaf?.[metric]);
        if (!isNaN(val)) {
          newPoints.push({ x: toX(i), y: toY(val), val, date: sd.sample_date, stage: sd.growth_stage });
        }
      });
      if (newPoints.length > 1) {
        const pathD = newPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" class="sap-chart-line"/>`;
        // Data points
        newPoints.forEach(p => {
          svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" class="sap-chart-point"
                   data-metric="${metric}" data-leaf="new" data-val="${p.val}" data-date="${p.date}" data-stage="${p.stage || ''}"/>`;
        });
      }

      // Old leaf line (dashed)
      let oldPoints = [];
      displayDates.forEach((sd, i) => {
        const val = parseFloat(sd.old_leaf?.[metric]);
        if (!isNaN(val)) {
          oldPoints.push({ x: toX(i), y: toY(val), val, date: sd.sample_date, stage: sd.growth_stage });
        }
      });
      if (oldPoints.length > 1) {
        const pathD = oldPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4,3" class="sap-chart-line" opacity="0.7"/>`;
        // Data points
        oldPoints.forEach(p => {
          svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" stroke="${color}" stroke-width="1.5" class="sap-chart-point"
                   data-metric="${metric}" data-leaf="old" data-val="${p.val}" data-date="${p.date}" data-stage="${p.stage || ''}"/>`;
        });
      }
    });

    svg += `</svg>`;
    return svg;
  }

  /**
   * Format chart axis value
   */
  function formatChartValue(val) {
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    if (val >= 100) return Math.round(val).toString();
    if (val >= 10) return val.toFixed(1);
    if (val >= 1) return val.toFixed(1);
    return val.toFixed(2);
  }

  /**
   * Set trend view mode (table or graph)
   */
  function setTrendViewMode(mode) {
    trendViewMode = mode;
    reRender();
  }

  function renderTimeline(sampleDates, crop) {
    const systems = [
      { key: 'N', label: 'N' },
      { key: 'CATIONS', label: 'Cations' },
      { key: 'MICROS', label: 'Micros' },
      { key: 'SUGARS', label: 'Sugars' }
    ];

    let html = `
      <div class="sap-timeline-section">
        <h4>Status Timeline</h4>
        <div class="sap-timeline-grid">
          <div class="sap-timeline-header">
            <div class="sap-timeline-label">Date</div>
            ${systems.map(s => `<div class="sap-timeline-sys">${s.label}</div>`).join('')}
          </div>
    `;

    sampleDates.forEach(sd => {
      const evaluation = SapLogic.evaluateStatus(sd, { crop });
      const isSelected = sd.sample_date === selectedDate;

      html += `
        <div class="sap-timeline-row ${isSelected ? 'selected' : ''}" onclick="SapViewer.selectDate('${sd.sample_date}')">
          <div class="sap-timeline-date">
            ${formatDateShort(sd.sample_date)}
            ${sd.growth_stage ? `<span class="sap-stage">${sd.growth_stage}</span>` : ''}
          </div>
      `;

      systems.forEach(sys => {
        const status = evaluation.system_status[sys.key] || { status: 'OK' };
        const colors = SapLogic.getStatusColors(status.status);

        html += `
          <div class="sap-timeline-cell" title="${status.reason || 'OK'}">
            <span class="sap-timeline-dot" style="background: ${colors.dot};"></span>
          </div>
        `;
      });

      html += `</div>`;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  function renderNotesSection(siteId, date) {
    const noteKey = `${siteId}-${date}`;
    const existingNote = notes[noteKey] || '';

    return `
      <div class="sap-notes-section">
        <h4>Notes</h4>
        <textarea id="sapNoteInput" class="sap-note-input" placeholder="Add notes for this sample date...">${existingNote}</textarea>
        <button class="sap-note-save" onclick="SapViewer.saveNote()">Save Note</button>
      </div>
    `;
  }

  // ========== EVENT HANDLERS ==========

  function setupEventListeners() {
    // Site selector
    const siteSelect = document.getElementById('sapSiteSelect');
    if (siteSelect) {
      siteSelect.addEventListener('change', (e) => {
        selectSite(e.target.value);
      });
    }

    // Date selector
    const dateSelect = document.getElementById('sapDateSelect');
    if (dateSelect) {
      dateSelect.addEventListener('change', (e) => {
        selectDate(e.target.value);
      });
    }
  }

  function setupNotesHandler() {
    const searchInput = document.getElementById('sapNutrientSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value;
        reRender();
      });
    }
  }

  // ========== HELPER FUNCTIONS ==========

  function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ========== NOTES PERSISTENCE ==========

  function loadNotes() {
    try {
      const saved = localStorage.getItem('sapViewerNotes');
      if (saved) {
        notes = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading notes:', e);
      notes = {};
    }
  }

  function saveNote() {
    const input = document.getElementById('sapNoteInput');
    if (!input || !selectedSiteId || !selectedDate) return;

    const noteKey = `${selectedSiteId}-${selectedDate}`;
    notes[noteKey] = input.value;

    try {
      localStorage.setItem('sapViewerNotes', JSON.stringify(notes));
      showStatus('Note saved', true);
    } catch (e) {
      console.error('Error saving note:', e);
      showStatus('Error saving note', false);
    }
  }

  function showStatus(message, isSuccess) {
    if (window.Utils && window.Utils.showStatus) {
      window.Utils.showStatus(message, isSuccess);
    } else {
      console.log(message);
    }
  }

  // ========== DRAWER & MODAL FUNCTIONS ==========

  /**
   * Open system issues drawer
   */
  function openSystemDrawer(systemKey) {
    if (!currentEvaluation) return;

    const systemStatus = currentEvaluation.system_status[systemKey];
    if (!systemStatus || !systemStatus.issues || systemStatus.issues.length === 0) return;

    const systemNames = {
      N: 'Nitrogen System',
      CATIONS: 'Cation Balance',
      MICROS: 'Micronutrients',
      SUGARS: 'Sugars/Energy'
    };

    // Remove existing drawer if any
    closeDrawer();

    const drawer = document.createElement('div');
    drawer.id = 'sapSystemDrawer';
    drawer.className = 'sap-drawer';
    drawer.innerHTML = `
      <div class="sap-drawer-content">
        <div class="sap-drawer-header">
          <h3>${systemNames[systemKey] || systemKey} Issues</h3>
          <button class="sap-drawer-close" onclick="SapViewer.closeDrawer()">&times;</button>
        </div>
        <div class="sap-drawer-body">
          ${systemStatus.issues.map(issue => `
            <div class="sap-issue-item" data-metric="${issue.metricId}" onclick="SapViewer.scrollToMetric('${issue.metricId}')">
              <div class="sap-issue-header">
                <span class="sap-issue-label">${issue.label}</span>
                <span class="sap-status-chip" style="background: ${SapLogic.getStatusColors(issue.status).bg}; color: ${SapLogic.getStatusColors(issue.status).text}; border-color: ${SapLogic.getStatusColors(issue.status).border};">
                  ${issue.status}
                </span>
              </div>
              <div class="sap-issue-details">
                <div class="sap-issue-values">
                  <span>New: ${issue.values?.new !== null ? SapLogic.formatValue(issue.values.new, issue.metricId) : '—'}</span>
                  <span>Old: ${issue.values?.old !== null ? SapLogic.formatValue(issue.values.old, issue.metricId) : '—'}</span>
                </div>
                <div class="sap-issue-reason">${issue.reason}</div>
                ${issue.threshold ? `
                  <div class="sap-issue-threshold">
                    Threshold: ${issue.direction === 'low' ? 'min ' + issue.threshold.low : 'max ' + issue.threshold.high}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="sap-drawer-overlay" onclick="SapViewer.closeDrawer()"></div>
    `;

    document.body.appendChild(drawer);
    setTimeout(() => drawer.classList.add('open'), 10);
  }

  /**
   * Close the drawer
   */
  function closeDrawer() {
    const drawer = document.getElementById('sapSystemDrawer');
    if (drawer) {
      drawer.classList.remove('open');
      setTimeout(() => drawer.remove(), 300);
    }
  }

  /**
   * Open explanation modal for a metric/leaf
   */
  function openExplainModal(metricId, leaf) {
    if (!currentEvaluation || !currentSampleDate) return;

    const explanation = SapLogic.getExplanation(currentEvaluation, metricId, leaf, currentSampleDate);

    // Remove existing modal if any
    closeModal();

    const modal = document.createElement('div');
    modal.id = 'sapExplainModal';
    modal.className = 'sap-modal';
    modal.innerHTML = `
      <div class="sap-modal-content">
        <div class="sap-modal-header">
          <h3>${explanation.metricLabel} (${leaf} leaf)</h3>
          <button class="sap-modal-close" onclick="SapViewer.closeModal()">&times;</button>
        </div>
        <div class="sap-modal-body">
          <div class="sap-explain-row">
            <span class="sap-explain-label">Value:</span>
            <span class="sap-explain-value">${explanation.value !== null ? SapLogic.formatValue(explanation.value, metricId) : '—'}</span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Status:</span>
            <span class="sap-status-chip" style="background: ${SapLogic.getStatusColors(explanation.status.status).bg}; color: ${SapLogic.getStatusColors(explanation.status.status).text};">
              ${explanation.status.status}
            </span>
            <span class="sap-explain-severity">(Severity: ${explanation.status.severity})</span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Reason:</span>
            <span class="sap-explain-value">${explanation.status.reason}</span>
          </div>
          ${explanation.threshold ? `
            <div class="sap-explain-row">
              <span class="sap-explain-label">Thresholds:</span>
              <span class="sap-explain-value">
                Action &lt; ${explanation.threshold.low} |
                Watch &lt; ${explanation.threshold.optimal_low} |
                Optimal: ${explanation.threshold.optimal_low} - ${explanation.threshold.optimal_high} |
                Watch &gt; ${explanation.threshold.optimal_high} |
                Action &gt; ${explanation.threshold.high}
              </span>
            </div>
          ` : ''}
          <div class="sap-explain-row">
            <span class="sap-explain-label">Both Leaves:</span>
            <span class="sap-explain-value">
              New: ${explanation.values?.new !== null ? SapLogic.formatValue(explanation.values.new, metricId) : '—'} |
              Old: ${explanation.values?.old !== null ? SapLogic.formatValue(explanation.values.old, metricId) : '—'}
            </span>
          </div>
          ${explanation.signal?.signal ? `
            <div class="sap-explain-row">
              <span class="sap-explain-label">Pattern:</span>
              <span class="sap-signal-chip" style="background: ${explanation.signal.color}; color: white;">${explanation.signal.signal}</span>
              <span class="sap-explain-value">${explanation.signal.description}</span>
            </div>
          ` : ''}
          <div class="sap-explain-footer">
            <span class="sap-explain-ruleset">Ruleset: ${explanation.rulesetVersion}</span>
            ${explanation.isRatio ? '<span class="sap-explain-ratio">Calculated Ratio</span>' : ''}
          </div>
        </div>
      </div>
      <div class="sap-modal-overlay" onclick="SapViewer.closeModal()"></div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
  }

  /**
   * Open signal explanation modal
   */
  function openSignalModal(metricId) {
    if (!currentEvaluation || !currentSampleDate) return;

    const signalExplanation = SapLogic.getSignalExplanation(currentEvaluation, metricId, currentSampleDate);

    // Remove existing modal if any
    closeModal();

    const delta = signalExplanation.delta;
    const deltaPctStr = delta?.deltaPct !== null && delta?.deltaPct !== undefined
      ? `${delta.deltaPct >= 0 ? '+' : ''}${delta.deltaPct.toFixed(1)}%`
      : '—';

    const modal = document.createElement('div');
    modal.id = 'sapExplainModal';
    modal.className = 'sap-modal';
    modal.innerHTML = `
      <div class="sap-modal-content">
        <div class="sap-modal-header">
          <h3>${signalExplanation.metricLabel} - Leaf Pattern</h3>
          <button class="sap-modal-close" onclick="SapViewer.closeModal()">&times;</button>
        </div>
        <div class="sap-modal-body">
          <div class="sap-explain-row">
            <span class="sap-explain-label">Signal:</span>
            ${signalExplanation.signal?.signal ? `
              <span class="sap-signal-chip" style="background: ${signalExplanation.signal.color}; color: white;">${signalExplanation.signal.signal}</span>
            ` : '<span class="sap-explain-value">No pattern</span>'}
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Interpretation:</span>
            <span class="sap-explain-value">${signalExplanation.interpretation}</span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Delta (New - Old):</span>
            <span class="sap-explain-value" style="color: ${SapLogic.getDeltaColor(delta?.deltaPct)};">${deltaPctStr}</span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Values:</span>
            <span class="sap-explain-value">
              New: ${signalExplanation.values?.new !== null ? SapLogic.formatValue(signalExplanation.values.new, metricId) : '—'} |
              Old: ${signalExplanation.values?.old !== null ? SapLogic.formatValue(signalExplanation.values.old, metricId) : '—'}
            </span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">New Leaf Status:</span>
            <span class="sap-status-chip" style="background: ${SapLogic.getStatusColors(signalExplanation.newStatus?.status).bg}; color: ${SapLogic.getStatusColors(signalExplanation.newStatus?.status).text};">
              ${signalExplanation.newStatus?.status || '—'}
            </span>
            <span class="sap-explain-value">${signalExplanation.newStatus?.reason || ''}</span>
          </div>
          <div class="sap-explain-row">
            <span class="sap-explain-label">Old Leaf Status:</span>
            <span class="sap-status-chip" style="background: ${SapLogic.getStatusColors(signalExplanation.oldStatus?.status).bg}; color: ${SapLogic.getStatusColors(signalExplanation.oldStatus?.status).text};">
              ${signalExplanation.oldStatus?.status || '—'}
            </span>
            <span class="sap-explain-value">${signalExplanation.oldStatus?.reason || ''}</span>
          </div>
        </div>
      </div>
      <div class="sap-modal-overlay" onclick="SapViewer.closeModal()"></div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
  }

  /**
   * Close any open modal
   */
  function closeModal() {
    const modal = document.getElementById('sapExplainModal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
    }
  }

  /**
   * Scroll to and highlight a metric row in the comparison table
   */
  function scrollToMetric(metricId) {
    closeDrawer();

    // Find the row with this metric
    const row = document.querySelector(`tr[data-metric-row="${metricId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('sap-row-highlight');
      setTimeout(() => row.classList.remove('sap-row-highlight'), 2000);
    }
  }

  /**
   * Setup global click handler using event delegation
   */
  function setupGlobalClickHandler() {
    document.addEventListener('click', (e) => {
      // System card click
      const card = e.target.closest('.sap-summary-card[data-system]');
      if (card && card.classList.contains('clickable')) {
        openSystemDrawer(card.dataset.system);
        return;
      }

      // Status chip click
      const statusChip = e.target.closest('.sap-status-chip.clickable[data-metric]');
      if (statusChip) {
        openExplainModal(statusChip.dataset.metric, statusChip.dataset.leaf);
        return;
      }

      // Signal chip click
      const signalChip = e.target.closest('.sap-signal-chip.clickable[data-metric]');
      if (signalChip) {
        openSignalModal(signalChip.dataset.metric);
        return;
      }
    });

    // Chart point hover for tooltips
    document.addEventListener('mouseover', (e) => {
      const point = e.target.closest('.sap-chart-point');
      if (point) {
        showChartTooltip(point, e);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const point = e.target.closest('.sap-chart-point');
      if (point) {
        hideChartTooltip();
      }
    });
  }

  /**
   * Show tooltip for chart data point
   */
  function showChartTooltip(point, event) {
    hideChartTooltip(); // Remove any existing tooltip

    const metric = point.dataset.metric;
    const leaf = point.dataset.leaf;
    const val = parseFloat(point.dataset.val);
    const date = point.dataset.date;
    const stage = point.dataset.stage;

    const tooltip = document.createElement('div');
    tooltip.id = 'sapChartTooltip';
    tooltip.className = 'sap-chart-tooltip';
    tooltip.innerHTML = `
      <div class="sap-tooltip-metric">${SapLogic.formatNutrientName(metric)}</div>
      <div class="sap-tooltip-values">
        <span class="sap-tooltip-leaf">${leaf === 'new' ? 'New' : 'Old'} Leaf:</span>
        <span>${SapLogic.formatValue(val, metric)}</span>
      </div>
      <div style="margin-top: 0.25rem; color: #94a3b8;">
        ${stage ? stage + ' - ' : ''}${formatDateShort(date)}
      </div>
    `;

    document.body.appendChild(tooltip);

    // Position tooltip near the point
    const rect = point.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top}px`;
  }

  /**
   * Hide chart tooltip
   */
  function hideChartTooltip() {
    const tooltip = document.getElementById('sapChartTooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  // ========== PUBLIC API ==========

  function setViewMode(mode) {
    viewMode = mode;
    reRender();
  }

  function setDisplayMode(mode) {
    displayMode = mode;
    reRender();
  }

  function reRender() {
    // Aggregate mode
    if (!selectedSiteId) {
      const aggregateData = buildAggregateByGrowthStage();
      const stage = selectedDate || aggregateData[0]?.growth_stage;
      const selectedStage = aggregateData.find(sd => sd.growth_stage === stage) || aggregateData[0];
      if (selectedStage) {
        renderAggregateContent(aggregateData, selectedStage);
      }
      return;
    }

    // Single site mode
    const site = sapSites.find(s => s.SiteId === selectedSiteId);
    if (site) {
      const sampleDates = buildSampleDates(site.samples);
      renderContent(site, sampleDates);
    }
  }

  function toggleAllTrends() {
    // TODO: Implement full nutrient trend expansion
    alert('Full trend view coming soon');
  }

  function setSortMode(mode) {
    sortMode = mode;
    reRender();
  }

  function toggleGroup(groupKey) {
    const rows = document.querySelectorAll(`.sap-group-${groupKey}-row`);
    const toggle = document.getElementById(`toggle-${groupKey}`);

    if (collapsedGroups.has(groupKey)) {
      collapsedGroups.delete(groupKey);
      rows.forEach(r => r.style.display = '');
      if (toggle) toggle.textContent = '▼';
    } else {
      collapsedGroups.add(groupKey);
      rows.forEach(r => r.style.display = 'none');
      if (toggle) toggle.textContent = '▶';
    }
  }

  return {
    init,
    selectSite,
    selectDate,
    setViewMode,
    setDisplayMode,
    setSortMode,
    setTrendViewMode,
    toggleGroup,
    toggleAllTrends,
    saveNote,
    // Drawer/Modal functions
    openSystemDrawer,
    closeDrawer,
    openExplainModal,
    openSignalModal,
    closeModal,
    scrollToMetric
  };
})();
