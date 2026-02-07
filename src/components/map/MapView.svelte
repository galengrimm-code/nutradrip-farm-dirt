<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { soilSettings } from '$lib/stores/settings.js';
  import { selectedField, selectedAttribute, selectedYear, activeClientId, activeFarmId, compareMode, compareYear } from '$lib/stores/filters.js';
  import { isSignedIn } from '$lib/stores/app.js';
  import { showToast } from '$lib/stores/app.js';
  import { sampleSites, activeSampleSites, SITE_TYPES } from '$lib/stores/sampleSites.js';
  import { irrigationZones } from '$lib/stores/irrigationZones.js';
  import { ALL_NUTRIENTS, LOWER_IS_BETTER, ZERO_MEANS_NO_DATA, MAP_DEFAULTS, getNutrientName, getNutrientUnit } from '$lib/core/config.js';
  import {
    getColor, getGradientColor, getChangeColor, getPZnRatioColor,
    formatValue, formatNumber, getDecimals, isValidValue, getNumericValue,
    calculateFieldAverage, groupByField, debounce, calculateStabilityData, getDistanceFeet
  } from '$lib/core/utils.js';
  import { getActiveFields, getFieldBoundaryCoords, loadFarmsData, SheetsAPI, loadClientsData, saveIrrigationZonesToIndexedDB } from '$lib/core/data.js';
  import { getSheetId } from '$lib/core/config.js';
  import { tagSamplesWithIrrigation } from '$lib/core/import-utils.js';
  import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
  import { intersect as turfIntersect } from '@turf/intersect';
  import MapLegend from './MapLegend.svelte';
  import SampleSiteModal from './SampleSiteModal.svelte';
  import PrintLabelsModal from './PrintLabelsModal.svelte';
  import IrrigationZoneModal from './IrrigationZoneModal.svelte';

  let mapContainer;
  let map;
  let currentLayers = [];
  let sampleSiteMarkers = [];
  let zoomLevel = MAP_DEFAULTS.zoom;
  let viewModeText = 'Sample View';
  let statsData = { avg: '-', high: '-', low: '-', note: '' };
  let statsCollapsed = false;
  let legendMin = null;
  let legendMax = null;

  // Field mode state
  let fieldModeActive = false;
  let gpsWatchId = null;
  let gpsMarker = null;
  let gpsCircle = null;

  // Sample site modal state
  let showSiteModal = false;
  let siteModalLat = 0;
  let siteModalLng = 0;
  let siteModalFieldInfo = null;
  let siteModalEditSites = null;
  let tempPinMarker = null;

  // Print modal state
  let showPrintModal = false;

  // Irrigation zone drawing state
  let drawingMode = null; // null | 'circle' | 'rectangle'
  let drawStartLatLng = null;
  let drawPreviewLayer = null;
  let zoneLayers = [];
  let showZoneModal = false;
  let pendingZone = null;
  let editingZone = null;

  // Compare info bar
  let compareInfo = { from: '', to: '', summary: '' };

  // Expose actions for parent (desktop controls bar)
  export function triggerAddSite() {
    showToast('Right-click on the map to add a sample site', 'success', 5000);
  }
  export function triggerPrintLabels() {
    showPrintModal = true;
  }

  export function startDrawZone(type) {
    drawingMode = type;
    drawStartLatLng = null;
    if (drawPreviewLayer) { map.removeLayer(drawPreviewLayer); drawPreviewLayer = null; }
    if (map) {
      map.getContainer().style.cursor = 'crosshair';
      showToast(`Click on the map to start drawing a ${type}`, 'success', 3000);
    }
  }

  export function cancelDrawZone() {
    drawingMode = null;
    drawStartLatLng = null;
    if (drawPreviewLayer) { map.removeLayer(drawPreviewLayer); drawPreviewLayer = null; }
    if (map) map.getContainer().style.cursor = '';
  }

  const ZOOM_THRESHOLD = MAP_DEFAULTS.zoomThreshold;
  const MAX_MATCH_DISTANCE = 200; // feet

  // Cached stability data
  let cachedStabilityData = {};

  onMount(() => {
    initMap();
    loadSampleSites();
  });

  onDestroy(() => {
    stopGPS();
    map?.remove();
  });

  // Track previous zoom level to detect zoom threshold crossings
  let prevZoomLevel = MAP_DEFAULTS.zoom;

  function initMap() {
    map = L.map(mapContainer, {
      center: [MAP_DEFAULTS.lat, MAP_DEFAULTS.lng],
      zoom: MAP_DEFAULTS.zoom,
      zoomControl: false,
      preferCanvas: true // Render vector layers on canvas for performance
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    );
    const streets = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
    );
    satellite.addTo(map);

    L.control.layers({ 'Satellite': satellite, 'Street': streets }, null, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Only redraw on zoom if crossing the field/sample threshold, or in field-shading mode
    map.on('zoomend', () => {
      const newZoom = map.getZoom();
      const crossedThreshold = (prevZoomLevel < ZOOM_THRESHOLD) !== (newZoom < ZOOM_THRESHOLD);
      prevZoomLevel = newZoom;
      zoomLevel = newZoom;
      viewModeText = newZoom >= ZOOM_THRESHOLD ? 'Sample View' : 'Field View';

      if (crossedThreshold) {
        updateMap();
      } else if (newZoom < ZOOM_THRESHOLD && $selectedField === 'all') {
        // Field shading: colors depend on visible fields, debounce redraw
        debouncedFieldShadingUpdate();
      }
    });

    // Only redraw on pan in field-shading mode (colors change based on visible fields)
    map.on('moveend', () => {
      if (zoomLevel < ZOOM_THRESHOLD && $selectedField === 'all' && !$selectedAttribute.endsWith('_stability') && !$compareMode) {
        debouncedFieldShadingUpdate();
      }
    });

    // Right-click (or long-press) to add sample site
    map.on('contextmenu', handleMapRightClick);

    // Drawing mode click handlers
    map.on('click', handleDrawClick);
    map.on('mousemove', handleDrawMouseMove);

    updateMap();
    zoomToData();
  }

  const debouncedFieldShadingUpdate = debounce(() => updateMap(), 300);

  // Reactivity: re-render when stores change
  $: if (map) {
    void $samples;
    void $boundaries;
    void $selectedField;
    void $selectedAttribute;
    void $selectedYear;
    void $activeClientId;
    void $activeFarmId;
    void $soilSettings;
    void $compareMode;
    void $compareYear;
    updateMap();
  }

  $: if ($samples.length > 0) {
    cachedStabilityData = calculateStabilityData($samples);
  }

  // Redraw site markers when sample sites change
  $: if (map) {
    void $activeSampleSites;
    displaySampleSiteMarkers();
  }

  function clearLayers() {
    currentLayers.forEach(layer => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    currentLayers = [];
  }

  function updateMap() {
    if (!map) return;
    clearLayers();

    const farmsData = loadFarmsData();
    const activeFields = getActiveFields($boundaries, farmsData, $activeClientId, $activeFarmId);
    const isStabilityAttr = $selectedAttribute.endsWith('_stability');
    const baseAttr = isStabilityAttr ? $selectedAttribute.replace('_stability', '') : $selectedAttribute;

    if (isStabilityAttr) {
      drawStabilityView(activeFields, baseAttr);
      return;
    }

    // Compare mode
    if ($compareMode && $compareYear && $selectedYear !== 'most_recent' && $selectedYear !== 'all') {
      drawCompareMode(activeFields, baseAttr);
      return;
    }

    if ($selectedField === 'all' && zoomLevel < ZOOM_THRESHOLD) {
      drawFieldShading(activeFields, baseAttr);
    } else {
      drawSampleMarkers(activeFields, baseAttr);
    }
  }

  // ========== COMPARE MODE ==========
  function drawCompareMode(activeFields, attr) {
    const laterYear = $selectedYear;
    const earlierYear = $compareYear;
    compareInfo = { from: String(earlierYear), to: String(laterYear), summary: '' };

    const laterSamples = $samples.filter(s => {
      if ($selectedField !== 'all' && s.field !== $selectedField) return false;
      if (!activeFields.includes(s.field)) return false;
      return String(s.year) === String(laterYear);
    });

    const earlierSamples = $samples.filter(s => {
      if ($selectedField !== 'all' && s.field !== $selectedField) return false;
      if (!activeFields.includes(s.field)) return false;
      return String(s.year) === String(earlierYear);
    });

    const changes = [];
    let noMatchCount = 0;
    const markerSize = fieldModeActive ? 44 : 32;
    const fontSize = fieldModeActive ? 12 : 10;
    const attrDecimals = getDecimals(attr);

    laterSamples.forEach(laterSample => {
      const value = laterSample[attr];
      if (value === undefined || value === null) return;
      if (!laterSample.lat || !laterSample.lon) return;

      let earlierSample = null;
      let minDistFeet = Infinity;

      // Try exact sampleId match first
      const idMatch = earlierSamples.find(s => s.field === laterSample.field && s.sampleId === laterSample.sampleId);
      if (idMatch) {
        earlierSample = idMatch;
        minDistFeet = getDistanceFeet(laterSample.lat, laterSample.lon, idMatch.lat, idMatch.lon);
      } else {
        const fieldEarlier = earlierSamples.filter(s => s.field === laterSample.field);
        fieldEarlier.forEach(s => {
          const dist = getDistanceFeet(laterSample.lat, laterSample.lon, s.lat, s.lon);
          if (dist < minDistFeet) { minDistFeet = dist; earlierSample = s; }
        });
      }

      const hasNearbyBaseline = earlierSample && minDistFeet <= MAX_MATCH_DISTANCE;
      const earlierValue = hasNearbyBaseline ? earlierSample[attr] : null;
      const change = (earlierValue !== null && earlierValue !== undefined) ? value - earlierValue : null;
      const percentChange = (earlierValue && earlierValue !== 0) ? ((value - earlierValue) / earlierValue) * 100 : 0;

      const color = (hasNearbyBaseline && change !== null) ? getChangeColor(change, percentChange) : '#94a3b8';

      let displayVal;
      if (hasNearbyBaseline && change !== null) {
        const sign = change >= 0 ? '+' : '';
        displayVal = sign + formatNumber(change, attrDecimals);
        changes.push(change);
      } else {
        displayVal = formatNumber(value, attrDecimals);
        noMatchCount++;
      }

      const html = `<div class="sm" style="width:${markerSize}px;height:${markerSize}px;background:${color};font-size:${fontSize}px;">${displayVal}</div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [markerSize, markerSize], iconAnchor: [markerSize / 2, markerSize / 2] });
      const marker = L.marker([laterSample.lat, laterSample.lon], { icon });

      let popupText = `<strong>Sample ${laterSample.sampleId || ''}</strong><br>Field: ${laterSample.field || 'Unknown'}`;
      if (hasNearbyBaseline) {
        popupText += `<br>${earlierYear}: ${formatNumber(earlierValue, attrDecimals)}`;
        popupText += `<br>${laterYear}: ${formatNumber(value, attrDecimals)}`;
        if (change !== null) {
          popupText += `<br><strong>Change: ${change >= 0 ? '+' : ''}${formatNumber(change, attrDecimals)} (${percentChange >= 0 ? '+' : ''}${formatNumber(percentChange, 0)}%)</strong>`;
          popupText += `<br><span style="color:#64748b;font-size:0.8em;">Baseline ${Math.round(minDistFeet)} ft away</span>`;
        }
      } else {
        popupText += `<br>${laterYear}: ${formatNumber(value, attrDecimals)}`;
        popupText += `<br><em style="color:#94a3b8;">No baseline within ${MAX_MATCH_DISTANCE} ft</em>`;
        if (earlierSample) popupText += `<br><span style="color:#94a3b8;font-size:0.8em;">Nearest: ${Math.round(minDistFeet)} ft</span>`;
      }
      marker.bindPopup(popupText);
      marker.addTo(map);
      currentLayers.push(marker);
    });

    drawBoundariesOnly(activeFields);

    // Update stats and compare info
    const attrName = getNutrientName(attr);
    const unit = getNutrientUnit(attr);
    if (changes.length > 0) {
      const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
      const high = Math.max(...changes);
      const low = Math.min(...changes);
      statsData = {
        avg: (avg >= 0 ? '+' : '') + formatNumber(avg, attrDecimals),
        high: (high >= 0 ? '+' : '') + formatNumber(high, attrDecimals),
        low: (low >= 0 ? '+' : '') + formatNumber(low, attrDecimals),
        note: noMatchCount > 0 ? `${changes.length} matched, ${noMatchCount} unmatched` : 'Year-over-year change'
      };
      const direction = avg > 0.5 ? 'increase' : (avg < -0.5 ? 'decrease' : 'no change');
      compareInfo.summary = `${attrName}: ${avg >= 0 ? '+' : ''}${formatNumber(avg, attrDecimals)}${unit ? ' ' + unit : ''} avg ${direction}`;
      if (noMatchCount > 0) compareInfo.summary += ` (${noMatchCount} gray = no baseline)`;
    } else {
      statsData = { avg: '-', high: '-', low: '-', note: 'No matching samples' };
      compareInfo.summary = `No matching samples between ${earlierYear} and ${laterYear}`;
    }
  }

  // ========== FIELD SHADING ==========
  function drawFieldShading(activeFields, attr) {
    const fieldGroups = groupByField($samples);
    const fieldValues = {};
    activeFields.forEach(fieldName => {
      const fieldSamples = fieldGroups[fieldName] || [];
      if (fieldSamples.length === 0) return;
      let filtered = fieldSamples;
      if ($selectedYear !== 'all' && $selectedYear !== 'most_recent') {
        filtered = fieldSamples.filter(s => String(s.year) === String($selectedYear));
      } else if ($selectedYear === 'most_recent') {
        const maxYear = Math.max(...fieldSamples.map(s => s.year).filter(Boolean));
        filtered = fieldSamples.filter(s => s.year === maxYear);
      }
      const avg = calculateFieldAverage(filtered, attr, ZERO_MEANS_NO_DATA);
      if (avg !== null) fieldValues[fieldName] = avg;
    });

    if (Object.keys(fieldValues).length === 0) {
      statsData = { avg: '-', high: '-', low: '-', note: 'No data for this attribute' };
      drawBoundariesOnly(activeFields);
      return;
    }

    const mapBounds = map.getBounds();
    const visibleValues = [];
    const allValues = Object.values(fieldValues);
    activeFields.forEach(fieldName => {
      const coords = getFieldBoundaryCoords($boundaries, fieldName);
      if (!coords || fieldValues[fieldName] === undefined) return;
      const flatCoords = Array.isArray(coords[0]?.[0]) ? coords[0] : coords;
      const inBounds = flatCoords.some(c => mapBounds.contains(L.latLng(c[0], c[1])));
      if (inBounds) visibleValues.push(fieldValues[fieldName]);
    });

    const valuesToUse = visibleValues.length >= 2 ? visibleValues : allValues;
    const sorted = [...valuesToUse].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const minVal = Math.max(sorted[0], q1 - 1.5 * iqr);
    const maxVal = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);
    const range = maxVal - minVal;
    const isLowerBetter = LOWER_IS_BETTER.includes(attr);

    legendMin = minVal;
    legendMax = maxVal;

    activeFields.forEach(fieldName => {
      const coords = getFieldBoundaryCoords($boundaries, fieldName);
      if (!coords) return;
      const value = fieldValues[fieldName];
      let color = '#94a3b8';
      if (value !== undefined && range > 0) {
        if (attr === 'P_Zn_Ratio') { color = getPZnRatioColor(value); }
        else { const position = Math.max(0, Math.min(1, (value - minVal) / range)); color = getGradientColor(position, isLowerBetter); }
      } else if (value !== undefined) { color = '#eab308'; }

      const isMultiPoly = Array.isArray(coords[0]?.[0]);
      const polyCoords = isMultiPoly ? coords : [coords];
      polyCoords.forEach(ring => {
        const polygon = L.polygon(ring, { color, fillColor: color, fillOpacity: 0.35, weight: 2 });
        const formattedVal = value !== undefined ? formatValue(value, attr) : 'No data';
        const unit = getNutrientUnit(attr);
        polygon.bindTooltip(`<strong>${fieldName}</strong><br>${getNutrientName(attr)}: ${formattedVal}${unit ? ' ' + unit : ''}`, { sticky: true, className: 'field-tooltip' });
        polygon.addTo(map);
        currentLayers.push(polygon);

        if (zoomLevel >= 14 && value !== undefined) {
          const center = polygon.getBounds().getCenter();
          const label = L.divIcon({
            html: `<div style="background:white;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;border:2px solid ${color};white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${fieldName}: ${formattedVal}</div>`,
            className: '', iconAnchor: [0, 0]
          });
          const marker = L.marker(center, { icon: label, interactive: false });
          marker.addTo(map);
          currentLayers.push(marker);
        }
      });
    });

    const vals = Object.values(fieldValues);
    statsData = {
      avg: formatValue(vals.reduce((a, b) => a + b, 0) / vals.length, attr),
      high: formatValue(Math.max(...vals), attr),
      low: formatValue(Math.min(...vals), attr),
      note: `${vals.length} fields`
    };
  }

  // ========== SAMPLE MARKERS ==========
  function drawSampleMarkers(activeFields, attr) {
    let filtered = $samples.filter(s => activeFields.includes(s.field));
    if ($selectedField !== 'all') filtered = filtered.filter(s => s.field === $selectedField);
    if ($selectedYear !== 'all' && $selectedYear !== 'most_recent') {
      filtered = filtered.filter(s => String(s.year) === String($selectedYear));
    } else if ($selectedYear === 'most_recent' && $selectedField === 'all') {
      const byField = groupByField(filtered);
      filtered = [];
      Object.entries(byField).forEach(([, fieldSamples]) => {
        const maxYear = Math.max(...fieldSamples.map(s => s.year).filter(Boolean));
        filtered.push(...fieldSamples.filter(s => s.year === maxYear));
      });
    }

    if (filtered.length === 0) {
      statsData = { avg: '-', high: '-', low: '-', note: 'No samples' };
      drawBoundariesOnly(activeFields);
      return;
    }

    const allAttrValues = filtered.map(s => getNumericValue(s[attr], attr, ZERO_MEANS_NO_DATA)).filter(v => v !== null);
    const markerSize = fieldModeActive ? 44 : 32;

    filtered.forEach(sample => {
      if (!sample.lat || !sample.lon) return;
      const value = getNumericValue(sample[attr], attr, ZERO_MEANS_NO_DATA);
      let color = '#94a3b8';
      let displayText = '-';

      if (attr === 'sampleId') { color = '#3b82f6'; displayText = sample.sampleId || '?'; }
      else if (value !== null) {
        color = attr === 'P_Zn_Ratio' ? getPZnRatioColor(value) : getColor(value, attr, $soilSettings, 25, allAttrValues, LOWER_IS_BETTER);
        displayText = formatValue(value, attr);
      }

      const locHash = `${Number(sample.lat).toFixed(4)}_${Number(sample.lon).toFixed(4)}`;
      const stability = cachedStabilityData[locHash];
      const hasWarning = stability?.hasHighVariability;
      const fs = fieldModeActive ? 12 : 9;

      const html = `<div class="sm" style="width:${markerSize}px;height:${markerSize}px;background:${color};font-size:${fs}px;">${attr === 'sampleId' ? '' : displayText}${hasWarning ? '<span class="sw">⚠️</span>' : ''}</div>`;

      const icon = L.divIcon({ html, className: '', iconSize: [markerSize, markerSize], iconAnchor: [markerSize / 2, markerSize / 2] });
      const marker = L.marker([sample.lat, sample.lon], { icon });

      const popupLines = [`<strong>${sample.sampleId || 'Sample'}</strong> — ${sample.field || 'Unknown'}`];
      if (sample.year) popupLines.push(`Year: ${sample.year}`);
      if (sample.depth) popupLines.push(`Depth: ${sample.depth}"`);
      popupLines.push('<hr style="margin:4px 0;border:0;border-top:1px solid #e5e7eb;">');
      ALL_NUTRIENTS.forEach(n => {
        if (n.key === 'sampleId') return;
        const v = sample[n.key];
        if (v !== undefined && v !== null && v !== '') {
          const highlight = n.key === attr ? 'font-weight:700;background:#f0f9ff;' : '';
          popupLines.push(`<div style="display:flex;justify-content:space-between;font-size:11px;padding:1px 4px;${highlight}"><span>${n.name}</span><span>${formatValue(v, n.key)}${n.unit ? ' ' + n.unit : ''}</span></div>`);
        }
      });
      marker.bindPopup(popupLines.join(''), { maxWidth: 250, maxHeight: 300 });
      marker.addTo(map);
      currentLayers.push(marker);
    });

    drawBoundariesOnly(activeFields);

    const vals = allAttrValues;
    if (vals.length > 0) {
      statsData = {
        avg: formatValue(vals.reduce((a, b) => a + b, 0) / vals.length, attr),
        high: formatValue(Math.max(...vals), attr),
        low: formatValue(Math.min(...vals), attr),
        note: `${filtered.length} samples`
      };
    } else {
      statsData = { avg: '-', high: '-', low: '-', note: `${filtered.length} samples` };
    }
  }

  // ========== BOUNDARIES ==========
  function drawBoundariesOnly(activeFields) {
    activeFields.forEach(fieldName => {
      const coords = getFieldBoundaryCoords($boundaries, fieldName);
      if (!coords) return;
      const isMultiPoly = Array.isArray(coords[0]?.[0]);
      const polyCoords = isMultiPoly ? coords : [coords];
      polyCoords.forEach(ring => {
        const polygon = L.polygon(ring, { color: '#3b82f6', fillColor: 'transparent', fillOpacity: 0, weight: 2, dashArray: '5, 5' });
        polygon.bindTooltip(fieldName, { sticky: true });
        polygon.addTo(map);
        currentLayers.push(polygon);
      });
    });
  }

  // ========== STABILITY VIEW ==========
  function drawStabilityView(activeFields, baseAttr) {
    const stabilityEntries = Object.entries(cachedStabilityData);
    if (stabilityEntries.length === 0) {
      statsData = { avg: '-', high: '-', low: '-', note: 'Need 2+ years of data for stability' };
      drawBoundariesOnly(activeFields);
      return;
    }

    const cvValues = [];
    stabilityEntries.forEach(([, data]) => {
      if (!activeFields.includes(data.field)) return;
      const cv = data.cvByNutrient[baseAttr];
      if (cv === undefined || cv === null) return;
      cvValues.push(cv);

      let color = '#16a34a';
      if (cv >= 30) color = '#ef4444';
      else if (cv >= 20) color = '#eab308';

      const html = `<div style="width:32px;height:32px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.8);">${cv.toFixed(0)}%</div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
      const marker = L.marker([data.lat, data.lon], { icon });
      marker.bindTooltip(`CV: ${cv.toFixed(1)}%<br>${data.yearCount} years<br>${data.field}`, { sticky: true });
      marker.addTo(map);
      currentLayers.push(marker);
    });

    drawBoundariesOnly(activeFields);

    if (cvValues.length > 0) {
      const avg = cvValues.reduce((a, b) => a + b, 0) / cvValues.length;
      statsData = {
        avg: avg.toFixed(1) + '%', high: Math.max(...cvValues).toFixed(1) + '%',
        low: Math.min(...cvValues).toFixed(1) + '%',
        note: `${cvValues.length} locations, ${getNutrientName(baseAttr)} CV%`
      };
    }
  }

  // ========== FIELD MODE (GPS) ==========
  function toggleFieldMode() {
    fieldModeActive = !fieldModeActive;
    if (fieldModeActive) {
      startGPS();
    } else {
      stopGPS();
    }
    updateMap();
  }

  function startGPS() {
    if (!navigator.geolocation) { showToast('GPS not supported', 'error'); return; }
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (gpsMarker) {
          gpsMarker.setLatLng([latitude, longitude]);
          gpsCircle.setLatLng([latitude, longitude]);
          gpsCircle.setRadius(accuracy);
        } else {
          const gpsIcon = L.divIcon({
            html: '<div style="position:relative;width:22px;height:22px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:gpsPulse 2s ease-out infinite;"></div><div style="position:absolute;inset:5px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div></div>',
            className: '', iconSize: [22, 22], iconAnchor: [11, 11]
          });
          gpsMarker = L.marker([latitude, longitude], { icon: gpsIcon, zIndexOffset: 10000 }).addTo(map);
          gpsCircle = L.circle([latitude, longitude], {
            radius: accuracy, color: '#3b82f6', fillColor: '#3b82f6',
            fillOpacity: 0.1, weight: 2, dashArray: '4'
          }).addTo(map);
        }
        map.setView([latitude, longitude], map.getZoom());
      },
      (e) => showToast('GPS error: ' + e.message, 'error'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  function stopGPS() {
    if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    if (gpsMarker) { map.removeLayer(gpsMarker); map.removeLayer(gpsCircle); gpsMarker = null; gpsCircle = null; }
  }

  // ========== SAMPLE SITES ==========
  async function loadSampleSites() {
    try {
      const sheetId = getSheetId();
      if (!sheetId || !SheetsAPI.isSignedIn) return;
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId, range: 'SampleSites!A2:J1000'
      });
      const rows = response.result.values || [];
      const sites = rows.map(row => ({
        SiteID: row[0] || '', Type: row[1] || '', Client: row[2] || '', Farm: row[3] || '',
        Field: row[4] || '', Lat: parseFloat(row[5]) || 0, Lng: parseFloat(row[6]) || 0,
        Notes: row[7] || '', Active: row[8] || 'TRUE', CreatedDate: row[9] || ''
      })).filter(s => s.Lat && s.Lng);
      sampleSites.set(sites);
    } catch {
      // SampleSites tab might not exist yet
    }
  }

  function displaySampleSiteMarkers() {
    if (!map) return;
    sampleSiteMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
    sampleSiteMarkers = [];

    $activeSampleSites.forEach(site => {
      if (!site.Lat || !site.Lng) return;
      const meta = SITE_TYPES[site.Type] || { color: '#6b7280', emoji: '📍', name: site.Type };
      const icon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:${meta.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.8);">${meta.emoji}</div>`,
        className: '', iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const marker = L.marker([site.Lat, site.Lng], { icon });

      const popupContent = `<div style="min-width:160px;">
        <div style="font-weight:700;font-size:1rem;color:#1e293b;margin-bottom:0.5rem;">${meta.emoji} ${site.SiteID}</div>
        <div style="font-size:0.8125rem;color:#475569;">
          <div><strong>Type:</strong> ${meta.name}</div>
          ${site.Client ? `<div><strong>Client:</strong> ${site.Client}</div>` : ''}
          ${site.Farm ? `<div><strong>Farm:</strong> ${site.Farm}</div>` : ''}
          ${site.Field ? `<div><strong>Field:</strong> ${site.Field}</div>` : ''}
          ${site.Notes ? `<div style="margin-top:0.375rem;font-style:italic;color:#64748b;">${site.Notes}</div>` : ''}
        </div>
        <div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid #e2e8f0;display:flex;gap:0.5rem;justify-content:center;">
          <button onclick="window.__editSampleSite(${site.Lat},${site.Lng})" style="padding:4px 12px;font-size:11px;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;border-radius:4px;cursor:pointer;">Edit</button>
          <button onclick="window.__deleteSampleSite('${site.SiteID}','${site.Type}',${site.Lat},${site.Lng})" style="padding:4px 12px;font-size:11px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:4px;cursor:pointer;">Delete</button>
        </div>
      </div>`;
      marker.bindPopup(popupContent);
      marker.addTo(map);
      sampleSiteMarkers.push(marker);
    });
  }

  // Global handlers for popup buttons
  if (typeof window !== 'undefined') {
    window.__editSampleSite = (lat, lng) => {
      map?.closePopup();
      const tolerance = 0.0001;
      const existing = $activeSampleSites.filter(s =>
        Math.abs(s.Lat - lat) < tolerance && Math.abs(s.Lng - lng) < tolerance
      );
      if (existing.length === 0) return;

      // Detect field from boundaries
      const fieldInfo = detectFieldAtLocation(lat, lng);

      siteModalLat = lat;
      siteModalLng = lng;
      siteModalFieldInfo = fieldInfo;
      siteModalEditSites = existing;
      showSiteModal = true;
    };

    window.__deleteSampleSite = async (siteId, type, lat, lng) => {
      if (!confirm(`Delete ${siteId} (${type})?`)) return;
      map?.closePopup();
      try {
        const sheetId = getSheetId();
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: sheetId, range: 'SampleSites!A2:J1000'
        });
        const rows = response.result.values || [];
        const tolerance = 0.0001;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row[0] === siteId && row[1] === type &&
              Math.abs(parseFloat(row[5]) - lat) < tolerance &&
              Math.abs(parseFloat(row[6]) - lng) < tolerance) {
            await gapi.client.sheets.spreadsheets.values.update({
              spreadsheetId: sheetId, range: `SampleSites!I${i + 2}`, valueInputOption: 'RAW',
              resource: { values: [['FALSE']] }
            });
            break;
          }
        }
        sampleSites.update(sites => sites.map(s => {
          if (s.SiteID === siteId && s.Type === type && Math.abs(s.Lat - lat) < tolerance && Math.abs(s.Lng - lng) < tolerance) {
            return { ...s, Active: 'FALSE' };
          }
          return s;
        }));
        showToast('Site deleted', 'success');
      } catch (e) {
        showToast('Error deleting site: ' + e.message, 'error');
      }
    };
  }

  // ========== IRRIGATION ZONE DRAWING ==========
  function handleDrawClick(e) {
    if (!drawingMode) return;
    // Don't handle if a zone layer was clicked (its handler will fire separately)
    if (e.originalEvent?._zoneHandled) return;

    if (!drawStartLatLng) {
      // First click — set start point
      drawStartLatLng = e.latlng;
      showToast('Now click again to set the size', 'success', 2000);
    } else {
      // Second click — finalize shape
      const endLatLng = e.latlng;

      if (drawingMode === 'circle') {
        const radius = drawStartLatLng.distanceTo(endLatLng);
        pendingZone = {
          type: 'circle',
          center: [drawStartLatLng.lat, drawStartLatLng.lng],
          radius
        };
      } else if (drawingMode === 'rectangle') {
        const swLat = Math.min(drawStartLatLng.lat, endLatLng.lat);
        const swLng = Math.min(drawStartLatLng.lng, endLatLng.lng);
        const neLat = Math.max(drawStartLatLng.lat, endLatLng.lat);
        const neLng = Math.max(drawStartLatLng.lng, endLatLng.lng);
        pendingZone = {
          type: 'rectangle',
          bounds: [[swLat, swLng], [neLat, neLng]]
        };
      }

      // Clean up drawing state
      if (drawPreviewLayer) { map.removeLayer(drawPreviewLayer); drawPreviewLayer = null; }
      drawingMode = null;
      drawStartLatLng = null;
      map.getContainer().style.cursor = '';
      showZoneModal = true;
    }
  }

  function handleDrawMouseMove(e) {
    if (!drawingMode || !drawStartLatLng) return;

    if (drawPreviewLayer) map.removeLayer(drawPreviewLayer);

    if (drawingMode === 'circle') {
      const radius = drawStartLatLng.distanceTo(e.latlng);
      drawPreviewLayer = L.circle(drawStartLatLng, {
        radius, color: '#3b82f6', fillColor: '#3b82f6',
        fillOpacity: 0.15, weight: 2, dashArray: '6, 3'
      }).addTo(map);
    } else if (drawingMode === 'rectangle') {
      const bounds = L.latLngBounds(drawStartLatLng, e.latlng);
      drawPreviewLayer = L.rectangle(bounds, {
        color: '#3b82f6', fillColor: '#3b82f6',
        fillOpacity: 0.15, weight: 2, dashArray: '6, 3'
      }).addTo(map);
    }
  }

  function handleZoneModalSave(zone) {
    const newZone = {
      ...zone,
      id: zone.id || `zone_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: zone.createdAt || new Date().toISOString()
    };

    irrigationZones.update(zones => {
      const existing = zones.findIndex(z => z.id === newZone.id);
      if (existing >= 0) {
        zones[existing] = newZone;
        return [...zones];
      }
      return [...zones, newZone];
    });

    // Persist and retag samples
    let currentZones;
    irrigationZones.subscribe(z => currentZones = z)();
    saveIrrigationZonesToIndexedDB(currentZones);
    retagSamples(currentZones);

    showZoneModal = false;
    pendingZone = null;
    editingZone = null;
    displayIrrigationZones();
  }

  function handleZoneModalDelete(zone) {
    irrigationZones.update(zones => zones.filter(z => z.id !== zone.id));

    let currentZones;
    irrigationZones.subscribe(z => currentZones = z)();
    saveIrrigationZonesToIndexedDB(currentZones);
    retagSamples(currentZones);

    showZoneModal = false;
    pendingZone = null;
    editingZone = null;
    displayIrrigationZones();
  }

  function handleZoneModalClose() {
    showZoneModal = false;
    pendingZone = null;
    editingZone = null;
  }

  function retagSamples(zones) {
    let currentSamples;
    samples.subscribe(s => currentSamples = s)();
    tagSamplesWithIrrigation(currentSamples, zones);
    samples.set([...currentSamples]); // trigger reactivity
  }

  // Convert circle center + radius to a GeoJSON polygon (64-point approximation)
  function circleToGeoJSONCoords(center, radiusMeters, numPoints = 64) {
    const [lat, lng] = center;
    const coords = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const dLat = (radiusMeters / 6371000) * (180 / Math.PI) * Math.cos(angle);
      const dLng = (radiusMeters / 6371000) * (180 / Math.PI) * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
      coords.push([lng + dLng, lat + dLat]); // GeoJSON is [lng, lat]
    }
    return [coords];
  }

  // Convert rectangle bounds to GeoJSON polygon coords
  function rectToGeoJSONCoords(bounds) {
    const [[swLat, swLng], [neLat, neLng]] = bounds;
    return [[
      [swLng, swLat], [neLng, swLat], [neLng, neLat], [swLng, neLat], [swLng, swLat]
    ]];
  }

  // Get all field boundaries as a single Turf MultiPolygon for clipping
  function getBoundariesAsGeoJSON() {
    const allPolygons = [];
    for (const [, fieldData] of Object.entries($boundaries)) {
      const coords = fieldData?.boundary || fieldData;
      if (!coords || coords.length === 0) continue;
      try {
        const isMultiPoly = Array.isArray(coords[0]?.[0]);
        const polyCoords = isMultiPoly ? coords : [coords];
        polyCoords.forEach(ring => {
          if (ring.length < 3) return;
          // Convert [lat, lng] to GeoJSON [lng, lat] and close the ring
          const geoRing = ring.map(c => [c[1], c[0]]);
          if (geoRing[0][0] !== geoRing[geoRing.length - 1][0] || geoRing[0][1] !== geoRing[geoRing.length - 1][1]) {
            geoRing.push([...geoRing[0]]);
          }
          allPolygons.push([geoRing]);
        });
      } catch { /* skip invalid */ }
    }
    return allPolygons;
  }

  // Clip a zone GeoJSON to field boundaries, returns array of Leaflet [lat, lng] coordinate arrays
  function clipZoneToBoundaries(zoneCoords) {
    const zonePoly = turfPolygon(zoneCoords);
    const boundaryPolygons = getBoundariesAsGeoJSON();
    const clippedParts = [];

    for (const bCoords of boundaryPolygons) {
      try {
        const bPoly = turfPolygon(bCoords);
        // Turf v7: intersect takes a FeatureCollection
        const fc = featureCollection([zonePoly, bPoly]);
        const intersection = turfIntersect(fc);
        if (intersection) {
          const geom = intersection.geometry;
          if (geom.type === 'Polygon') {
            // Convert [lng, lat] back to [lat, lng] for Leaflet
            clippedParts.push(geom.coordinates[0].map(c => [c[1], c[0]]));
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(poly => {
              clippedParts.push(poly[0].map(c => [c[1], c[0]]));
            });
          }
        }
      } catch { /* skip failed intersections */ }
    }
    return clippedParts;
  }

  function displayIrrigationZones() {
    if (!map) return;
    // Clear existing zone layers
    zoneLayers.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    zoneLayers = [];

    const hasBoundaries = Object.keys($boundaries).length > 0;

    $irrigationZones.forEach(zone => {
      const layers = [];
      const zoneStyle = {
        color: '#2563eb', fillColor: '#3b82f6',
        fillOpacity: 0.18, weight: 2.5, dashArray: '8, 4'
      };

      if (hasBoundaries) {
        // Try to clip zone to field boundaries
        let zoneGeoCoords;
        if (zone.type === 'circle' && zone.center && zone.radius) {
          zoneGeoCoords = circleToGeoJSONCoords(zone.center, zone.radius);
        } else if (zone.type === 'rectangle' && zone.bounds) {
          zoneGeoCoords = rectToGeoJSONCoords(zone.bounds);
        }

        if (zoneGeoCoords) {
          const clipped = clipZoneToBoundaries(zoneGeoCoords);
          if (clipped.length > 0) {
            clipped.forEach(coords => {
              layers.push(L.polygon(coords, zoneStyle));
            });
          } else {
            // No intersection — render unclipped as fallback
            if (zone.type === 'circle') {
              layers.push(L.circle(zone.center, { ...zoneStyle, radius: zone.radius }));
            } else {
              layers.push(L.rectangle(zone.bounds, zoneStyle));
            }
          }
        }
      } else {
        // No boundaries — render unclipped
        if (zone.type === 'circle' && zone.center && zone.radius) {
          layers.push(L.circle(zone.center, { ...zoneStyle, radius: zone.radius }));
        } else if (zone.type === 'rectangle' && zone.bounds) {
          layers.push(L.rectangle(zone.bounds, zoneStyle));
        }
      }

      layers.forEach(layer => {
        layer.bindTooltip(`<strong>${zone.name}</strong><br><span style="font-size:10px;color:#64748b;">Irrigation Zone</span>`, { sticky: true });

        // Click to edit
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          editingZone = zone;
          pendingZone = null;
          showZoneModal = true;
        });

        // Right-click to edit too
        layer.on('contextmenu', (e) => {
          L.DomEvent.stopPropagation(e);
          editingZone = zone;
          pendingZone = null;
          showZoneModal = true;
        });

        layer.addTo(map);
        zoneLayers.push(layer);
      });
    });
  }

  // Reactivity: redraw zones when store changes
  $: if (map) {
    void $irrigationZones;
    displayIrrigationZones();
  }

  function handleMapRightClick(e) {
    if (drawingMode) return; // Don't handle right-click during drawing
    if (!$isSignedIn) {
      showToast('Sign in to add sample sites', 'error');
      return;
    }
    const { lat, lng } = e.latlng;

    // Remove previous temp marker
    if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }

    // Add pin at location
    const pinIcon = L.divIcon({
      html: '<div style="width:32px;height:32px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:white;font-size:14px;">+</span></div>',
      className: '', iconSize: [32, 32], iconAnchor: [16, 32]
    });
    tempPinMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);

    const fieldInfo = detectFieldAtLocation(lat, lng);
    siteModalLat = lat;
    siteModalLng = lng;
    siteModalFieldInfo = fieldInfo;
    siteModalEditSites = null;
    showSiteModal = true;
  }

  function detectFieldAtLocation(lat, lng) {
    const point = L.latLng(lat, lng);
    for (const [fieldName, fieldData] of Object.entries($boundaries)) {
      const coords = fieldData?.boundary || fieldData;
      if (!coords) continue;
      try {
        const isMultiPoly = Array.isArray(coords[0]?.[0]);
        const polyCoords = isMultiPoly ? coords : [coords];
        for (const ring of polyCoords) {
          const polygon = L.polygon(ring);
          if (polygon.getBounds().contains(point)) {
            return { fieldName, farmId: fieldData?.farmId || '' };
          }
        }
      } catch { /* skip invalid boundaries */ }
    }
    return null;
  }

  function handleSiteModalClose() {
    showSiteModal = false;
    if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  }

  function handleSiteSaved() {
    displaySampleSiteMarkers();
  }

  function zoomToData() {
    if (!map || $samples.length === 0) return;
    const farmsData = loadFarmsData();
    const activeFields = getActiveFields($boundaries, farmsData, $activeClientId, $activeFarmId);
    const filtered = $samples.filter(s => activeFields.includes(s.field));
    if (filtered.length === 0) return;
    const lats = filtered.map(s => s.lat).filter(Boolean);
    const lons = filtered.map(s => s.lon).filter(Boolean);
    if (lats.length === 0) return;
    map.fitBounds(L.latLngBounds([Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]), { padding: [50, 50] });
  }

  function zoomToField(fieldName) {
    if (!map || fieldName === 'all') return;

    // Try boundary first
    const coords = getFieldBoundaryCoords($boundaries, fieldName);
    if (coords) {
      const isMultiPoly = Array.isArray(coords[0]?.[0]);
      const polyCoords = isMultiPoly ? coords : [coords];
      const allLatLngs = polyCoords.flat().map(c => L.latLng(c[0], c[1]));
      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 17 });
        return;
      }
    }

    // Fall back to sample locations
    const fieldSamples = $samples.filter(s => s.field === fieldName && s.lat && s.lon);
    if (fieldSamples.length > 0) {
      const lats = fieldSamples.map(s => s.lat);
      const lons = fieldSamples.map(s => s.lon);
      map.fitBounds(L.latLngBounds([Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]), { padding: [50, 50], maxZoom: 17 });
    }
  }

  $: if (map && $samples.length > 0) { zoomToData(); }
  $: if (map) { zoomToField($selectedField); }
  // Reload sample sites when sign-in status changes
  $: if ($isSignedIn && map) { loadSampleSites(); }
</script>

<style>
  @keyframes gpsPulse {
    0% { transform: scale(1); opacity: 0.7; }
    100% { transform: scale(3); opacity: 0; }
  }
  /* Sample marker: moved from inline styles to class for performance */
  :global(.sm) {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
    border: 2px solid rgba(255,255,255,0.8);
    position: relative;
    will-change: transform;
  }
  :global(.sw) {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 10px;
  }
</style>

<div class="relative h-full w-full">
  <div bind:this={mapContainer} class="h-full w-full"></div>

  <!-- Stats box -->
  <div class="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 min-w-[120px] md:min-w-[140px]">
    <button class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
      onclick={() => statsCollapsed = !statsCollapsed}>
      <span>{$compareMode ? 'Change Stats' : getNutrientName($selectedAttribute)}</span>
      <span class="text-slate-400 ml-2">{statsCollapsed ? '▶' : '▼'}</span>
    </button>
    {#if !statsCollapsed}
      <div class="px-3 pb-2 space-y-0.5 text-xs border-t border-slate-100 pt-1.5">
        <div class="flex justify-between"><span class="text-slate-500">Avg:</span> <span class="font-semibold">{statsData.avg}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">High:</span> <span class="font-semibold text-green-600">{statsData.high}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Low:</span> <span class="font-semibold text-red-500">{statsData.low}</span></div>
        {#if statsData.note}
          <div class="text-[9px] text-slate-400 italic border-t border-slate-100 pt-1 mt-1">{statsData.note}</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Compare mode info bar -->
  {#if $compareMode && compareInfo.from}
    <div class="absolute top-3 left-3 right-40 z-[1000] hidden md:flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-blue-200 px-3 py-2 text-xs">
      <span class="font-semibold text-blue-700">Compare:</span>
      <span class="text-slate-600">{compareInfo.from} → {compareInfo.to}</span>
      {#if compareInfo.summary}
        <span class="text-slate-300">|</span>
        <span class="text-slate-700 font-medium">{compareInfo.summary}</span>
      {/if}
    </div>
  {/if}

  <!-- Field mode button -->
  <button
    class="absolute top-3 left-3 z-[1000] px-3 py-2 rounded-lg shadow-lg text-xs font-semibold cursor-pointer transition-colors
           {fieldModeActive ? 'bg-blue-600 text-white' : 'bg-white/95 backdrop-blur-sm text-slate-700 border border-slate-200 hover:bg-slate-50'}"
    onclick={toggleFieldMode}
  >
    {fieldModeActive ? '📱 Field Mode ON' : '📱 Field Mode'}
  </button>

  <!-- Drawing mode indicator -->
  {#if drawingMode}
    <div class="absolute top-14 left-3 z-[1000] bg-blue-600 text-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
      <span class="text-xs font-semibold">Drawing {drawingMode}</span>
      <span class="text-xs opacity-75">
        {drawStartLatLng ? 'Click to set size' : 'Click to set center'}
      </span>
      <button onclick={cancelDrawZone}
        class="ml-2 px-2 py-0.5 text-xs bg-white/20 rounded cursor-pointer hover:bg-white/30">
        Cancel
      </button>
    </div>
  {/if}

  <!-- Mobile-only: Add site + Print labels (hidden on desktop since they're in the controls bar) -->
  {#if $isSignedIn}
    <div class="absolute top-28 right-3 z-[1000] flex flex-col gap-1.5 md:hidden">
      <button
        class="px-3 py-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
        onclick={() => {
          showToast('Long-press on the map to add a sample site', 'success', 5000);
        }}
      >
        + Add Site
      </button>
      <button
        class="px-3 py-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
        onclick={() => showPrintModal = true}
      >
        Print Labels
      </button>
    </div>
  {/if}

  <!-- Zoom indicator -->
  <div class="absolute bottom-20 md:bottom-6 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-md shadow px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-2">
    <span class="text-slate-500">Zoom: {zoomLevel}</span>
    <span class="text-slate-300">|</span>
    <span class="{zoomLevel >= ZOOM_THRESHOLD ? 'text-blue-600' : 'text-green-600'}">{viewModeText}</span>
  </div>

  <!-- Legend -->
  <MapLegend minVal={legendMin} maxVal={legendMax} />
</div>

<!-- Modals -->
{#if showSiteModal}
  <SampleSiteModal
    lat={siteModalLat}
    lng={siteModalLng}
    fieldInfo={siteModalFieldInfo}
    editSites={siteModalEditSites}
    onclose={handleSiteModalClose}
    onsave={handleSiteSaved}
  />
{/if}

{#if showPrintModal}
  <PrintLabelsModal onclose={() => showPrintModal = false} />
{/if}

{#if showZoneModal}
  <IrrigationZoneModal
    zone={editingZone || pendingZone}
    onclose={handleZoneModalClose}
    onsave={handleZoneModalSave}
    ondelete={handleZoneModalDelete}
  />
{/if}
