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
  let searchFilter = '';
  let notes = {}; // { siteId-date: 'note text' }

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

    // Auto-select first site if available
    if (sapSites.length > 0) {
      selectSite(sapSites[0].SiteId);
    } else {
      renderEmptyState();
    }
  }

  /**
   * Load in-season data and build site list
   */
  async function loadData() {
    try {
      inSeasonData = await DataCore.loadInSeasonFromIndexedDB() || [];

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
   * Select a site and render its data
   */
  function selectSite(siteId) {
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

    let html = '<option value="">Select a site...</option>';
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
      const status = systemStatus[sys.key] || { status: 'OK', reason: '', confidence: 'Low' };
      const colors = SapLogic.getStatusColors(status.status);

      html += `
        <div class="sap-summary-card" style="border-color: ${colors.border}; background: ${colors.bg};">
          <div class="sap-card-header">
            <span class="sap-card-icon">${sys.icon}</span>
            <span class="sap-card-title">${sys.label}</span>
          </div>
          <div class="sap-card-status">
            <span class="sap-status-dot" style="background: ${colors.dot};"></span>
            <span class="sap-status-text" style="color: ${colors.text};">${status.status}</span>
          </div>
          <div class="sap-card-reason">${status.reason || 'All values in range'}</div>
          <div class="sap-card-confidence">Confidence: ${status.confidence}</div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  function renderComparisonTable(sampleDate, evaluation) {
    // Get all nutrients present in either leaf
    const allNutrients = new Set([
      ...Object.keys(sampleDate.new_leaf || {}),
      ...Object.keys(sampleDate.old_leaf || {})
    ]);

    // Group nutrients
    const groups = SapLogic.groupNutrients(
      Object.fromEntries([...allNutrients].map(n => [n, true]))
    );

    // Apply search filter
    const filterLower = searchFilter.toLowerCase();

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
          </div>
        </div>
        <div class="sap-comparison-table-wrapper">
          <table class="sap-comparison-table">
            <thead>
              <tr>
                <th>Nutrient</th>
                ${viewMode !== 'old' ? '<th class="sap-col-new">New Leaf</th>' : ''}
                ${viewMode !== 'old' ? '<th class="sap-col-status">Status</th>' : ''}
                ${viewMode === 'both' ? '<th class="sap-col-delta">Delta</th>' : ''}
                ${viewMode !== 'new' ? '<th class="sap-col-old">Old Leaf</th>' : ''}
                ${viewMode !== 'new' ? '<th class="sap-col-status">Status</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;

    groups.forEach(group => {
      // Filter nutrients in this group
      const filtered = group.nutrients.filter(n =>
        !filterLower || n.toLowerCase().includes(filterLower)
      );

      if (filtered.length === 0) return;

      // Group header row
      html += `
        <tr class="sap-group-row">
          <td colspan="${viewMode === 'both' ? 6 : 4}">${group.name}</td>
        </tr>
      `;

      filtered.forEach(nutrient => {
        const newVal = sampleDate.new_leaf?.[nutrient];
        const oldVal = sampleDate.old_leaf?.[nutrient];
        const newStatus = evaluation.per_nutrient_status.new_leaf?.[nutrient] || {};
        const oldStatus = evaluation.per_nutrient_status.old_leaf?.[nutrient] || {};
        const delta = evaluation.deltas?.[nutrient] || {};

        const newColors = SapLogic.getStatusColors(newStatus.status);
        const oldColors = SapLogic.getStatusColors(oldStatus.status);
        const deltaColor = SapLogic.getDeltaColor(delta.deltaPct);

        html += `<tr>`;
        html += `<td class="sap-nutrient-name">${formatNutrientName(nutrient)}</td>`;

        if (viewMode !== 'old') {
          html += `<td class="sap-value">${SapLogic.formatValue(newVal, nutrient)}</td>`;
          html += `<td class="sap-status"><span class="sap-status-chip" style="background: ${newColors.bg}; color: ${newColors.text}; border-color: ${newColors.border};">${newStatus.status || '—'}</span></td>`;
        }

        if (viewMode === 'both') {
          const arrow = delta.direction === 'up' ? '↑' : (delta.direction === 'down' ? '↓' : '–');
          const deltaPctStr = delta.deltaPct !== null ? `${delta.deltaPct >= 0 ? '+' : ''}${delta.deltaPct.toFixed(0)}%` : '—';
          html += `<td class="sap-delta" style="color: ${deltaColor};">${arrow} ${deltaPctStr}</td>`;
        }

        if (viewMode !== 'new') {
          html += `<td class="sap-value">${SapLogic.formatValue(oldVal, nutrient)}</td>`;
          html += `<td class="sap-status"><span class="sap-status-chip" style="background: ${oldColors.bg}; color: ${oldColors.text}; border-color: ${oldColors.border};">${oldStatus.status || '—'}</span></td>`;
        }

        html += `</tr>`;
      });
    });

    // Add derived ratios if displayMode is 'ratios'
    if (displayMode === 'ratios') {
      html += `<tr class="sap-group-row"><td colspan="${viewMode === 'both' ? 6 : 4}">Calculated Ratios</td></tr>`;

      const ratioKeys = ['K_Ca', 'K_Mg', 'K_over_CaMg', 'NO3_NH4', 'Sugar_over_K'];
      ratioKeys.forEach(key => {
        const newVal = evaluation.derived.new_leaf?.[key];
        const oldVal = evaluation.derived.old_leaf?.[key];
        const newStatus = evaluation.per_nutrient_status.new_leaf?.[key] || {};
        const oldStatus = evaluation.per_nutrient_status.old_leaf?.[key] || {};

        if (newVal === undefined && oldVal === undefined) return;

        const newColors = SapLogic.getStatusColors(newStatus.status);
        const oldColors = SapLogic.getStatusColors(oldStatus.status);

        html += `<tr>`;
        html += `<td class="sap-nutrient-name">${formatRatioName(key)}</td>`;

        if (viewMode !== 'old') {
          html += `<td class="sap-value">${newVal !== undefined ? newVal.toFixed(2) : '—'}</td>`;
          html += `<td class="sap-status"><span class="sap-status-chip" style="background: ${newColors.bg}; color: ${newColors.text}; border-color: ${newColors.border};">${newStatus.status || '—'}</span></td>`;
        }

        if (viewMode === 'both') {
          html += `<td class="sap-delta">—</td>`;
        }

        if (viewMode !== 'new') {
          html += `<td class="sap-value">${oldVal !== undefined ? oldVal.toFixed(2) : '—'}</td>`;
          html += `<td class="sap-status"><span class="sap-status-chip" style="background: ${oldColors.bg}; color: ${oldColors.text}; border-color: ${oldColors.border};">${oldStatus.status || '—'}</span></td>`;
        }

        html += `</tr>`;
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

  function renderTrendTable(sampleDates, crop) {
    const keyMetrics = ['Potassium', 'Calcium', 'Magnesium', 'Boron', 'Zinc', 'Brix', 'Nitrogen_NO3', 'Nitrogen_NH4'];
    const displayDates = sampleDates.slice(0, 8); // Limit to 8 dates for table width

    let html = `
      <div class="sap-trend-section">
        <div class="sap-trend-header">
          <h4>Season Trends</h4>
          <button class="sap-expand-btn" onclick="SapViewer.toggleAllTrends()">Show all nutrients</button>
        </div>
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

    keyMetrics.forEach(metric => {
      const trendNew = SapLogic.evaluateTrend(sampleDates, metric, 'new_leaf');
      const trendOld = SapLogic.evaluateTrend(sampleDates, metric, 'old_leaf');

      html += `<tr>`;
      html += `<td class="sap-trend-metric">${formatNutrientName(metric)}</td>`;

      displayDates.forEach(sd => {
        const newVal = sd.new_leaf?.[metric];
        const oldVal = sd.old_leaf?.[metric];

        // Evaluate status for coloring
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
      </div>
    `;

    return html;
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
        // Re-render comparison table only
        const site = sapSites.find(s => s.SiteId === selectedSiteId);
        if (site) {
          const sampleDates = buildSampleDates(site.samples);
          renderContent(site, sampleDates);
        }
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

  function formatNutrientName(key) {
    const names = {
      'Nitrogen': 'Total N',
      'Nitrogen_NO3': 'NO₃-N',
      'Nitrogen_NH4': 'NH₄-N',
      'Phosphorus': 'P',
      'Potassium': 'K',
      'Calcium': 'Ca',
      'Magnesium': 'Mg',
      'Sulfur': 'S',
      'Boron': 'B',
      'Iron': 'Fe',
      'Manganese': 'Mn',
      'Copper': 'Cu',
      'Zinc': 'Zn',
      'Molybdenum': 'Mo',
      'Chloride': 'Cl',
      'Sodium': 'Na',
      'Silica': 'Si',
      'Aluminum': 'Al',
      'Cobalt': 'Co',
      'Nickel': 'Ni',
      'Selenium': 'Se',
      'Brix': 'Brix',
      'Sugars': 'Sugars',
      'EC': 'EC',
      'pH': 'pH',
      'N_Conversion_Efficiency': 'N Conv. Eff.'
    };
    return names[key] || key;
  }

  function formatRatioName(key) {
    const names = {
      'K_Ca': 'K:Ca',
      'K_Mg': 'K:Mg',
      'K_over_CaMg': 'K/(Ca+Mg)',
      'NO3_NH4': 'NO₃:NH₄',
      'Sugar_over_K': 'Sugar:K'
    };
    return names[key] || key;
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

  // ========== PUBLIC API ==========

  function setViewMode(mode) {
    viewMode = mode;
    const site = sapSites.find(s => s.SiteId === selectedSiteId);
    if (site) {
      const sampleDates = buildSampleDates(site.samples);
      renderContent(site, sampleDates);
    }
  }

  function setDisplayMode(mode) {
    displayMode = mode;
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

  return {
    init,
    selectSite,
    selectDate,
    setViewMode,
    setDisplayMode,
    toggleAllTrends,
    saveNote
  };
})();
