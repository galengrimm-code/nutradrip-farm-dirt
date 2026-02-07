/**
 * utils.js - Shared utility functions (ES module)
 * Converted from IIFE — all logic preserved identically
 */

import { showToast } from '$lib/stores/app.js';

// ========== STATUS/UI ==========
export function showStatus(message, isSuccess = true) {
  showToast(message, isSuccess ? 'success' : 'error');
}

// ========== FORMATTING ==========
export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return Number(value).toFixed(decimals);
}

export function getDecimals(attr, defaultDecimals = {}) {
  const customDecimals = JSON.parse(localStorage.getItem('decimalPlaces') || '{}');
  if (customDecimals[attr] !== undefined) return customDecimals[attr];
  if (defaultDecimals[attr] !== undefined) return defaultDecimals[attr];
  return 1;
}

export function formatValue(value, attr, defaultDecimals = {}) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const decimals = getDecimals(attr, defaultDecimals);
  return Number(value).toFixed(decimals);
}

// ========== COLOR UTILITIES ==========

export function interpolateColor(color1, color2, factor) {
  const hex = c => parseInt(c, 16);
  const r1 = hex(color1.slice(1,3)), g1 = hex(color1.slice(3,5)), b1 = hex(color1.slice(5,7));
  const r2 = hex(color2.slice(1,3)), g2 = hex(color2.slice(3,5)), b2 = hex(color2.slice(5,7));
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

export function getGradientColor(position, isLowerBetter = false) {
  const p = Math.max(0, Math.min(1, isLowerBetter ? 1 - position : position));
  const stops = [
    { pos: 0.0, color: '#dc2626' },
    { pos: 0.25, color: '#f97316' },
    { pos: 0.5, color: '#eab308' },
    { pos: 0.75, color: '#84cc16' },
    { pos: 1.0, color: '#16a34a' }
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].pos && p <= stops[i+1].pos) {
      const range = stops[i+1].pos - stops[i].pos;
      const factor = (p - stops[i].pos) / range;
      return interpolateColor(stops[i].color, stops[i+1].color, factor);
    }
  }
  return stops[stops.length - 1].color;
}

export function getChangeGradientColor(percentChange) {
  const clampedPct = Math.max(-30, Math.min(30, percentChange));
  const position = (clampedPct + 30) / 60;
  const stops = [
    { pos: 0.0, color: '#b91c1c' },
    { pos: 0.25, color: '#f87171' },
    { pos: 0.45, color: '#d1d5db' },
    { pos: 0.55, color: '#d1d5db' },
    { pos: 0.75, color: '#86efac' },
    { pos: 1.0, color: '#15803d' }
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (position >= stops[i].pos && position <= stops[i+1].pos) {
      const range = stops[i+1].pos - stops[i].pos;
      const factor = (position - stops[i].pos) / range;
      return interpolateColor(stops[i].color, stops[i+1].color, factor);
    }
  }
  return stops[stops.length - 1].color;
}

export function getMedianBasedColor(value, values, isLowerBetter = false) {
  if (!values || values.length === 0) return '#94a3b8';
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;
  const q1 = sorted[Math.floor(len * 0.25)];
  const q3 = sorted[Math.floor(len * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = Math.max(sorted[0], q1 - 1.5 * iqr);
  const upperBound = Math.min(sorted[len - 1], q3 + 1.5 * iqr);
  const range = upperBound - lowerBound;
  if (range === 0) return '#eab308';
  const clampedValue = Math.max(lowerBound, Math.min(upperBound, value));
  const position = (clampedValue - lowerBound) / range;
  return getGradientColor(position, isLowerBetter);
}

export function getChangeColor(change, percentChange) {
  return getChangeGradientColor(percentChange);
}

export function getColor(value, attribute, settings = {}, bufferPercent = 25, allValues = null, lowerIsBetterAttrs = []) {
  if (attribute === 'sampleId') return '#3b82f6';
  const medianBasedAttrs = ['CEC', 'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S'];
  if (medianBasedAttrs.includes(attribute) && allValues && allValues.length > 0) {
    return getMedianBasedColor(value, allValues);
  }
  const defaultThresholds = {
    pH: { min: 6.3, max: 6.9 },
    P: { min: 20, max: null },
    K: { min: 150, max: null },
    OM: { min: 3.0, max: null },
    Ca_sat: { min: 65, max: 75 },
    Mg_sat: { min: null, max: 15 },
    K_Sat: { min: 3.0, max: null },
    H_Sat: { min: null, max: 5.0 }
  };
  const threshold = settings[attribute] || defaultThresholds[attribute];
  const isLowerBetter = lowerIsBetterAttrs.includes(attribute);
  if (!threshold) return '#94a3b8';
  if (threshold.min !== null && threshold.max !== null) {
    const buffer = (threshold.max - threshold.min) * (bufferPercent / 100);
    const lowerBound = threshold.min - buffer;
    const upperBound = threshold.max + buffer;
    if (value >= threshold.min && value <= threshold.max) return '#16a34a';
    if (value < threshold.min) {
      const pos = Math.max(0, (value - lowerBound) / (threshold.min - lowerBound));
      return getGradientColor(pos * 0.5, false);
    }
    const pos = Math.max(0, 1 - (value - threshold.max) / (upperBound - threshold.max));
    return getGradientColor(pos * 0.5, false);
  } else if (threshold.min !== null) {
    const buffer = threshold.min * (bufferPercent / 100);
    const lowerBound = threshold.min - buffer;
    if (value >= threshold.min) {
      const pos = Math.min(1, 0.5 + (value - threshold.min) / (threshold.min * 2) * 0.5);
      return getGradientColor(pos, false);
    }
    const pos = Math.max(0, (value - lowerBound) / (threshold.min - lowerBound)) * 0.5;
    return getGradientColor(pos, false);
  } else if (threshold.max !== null) {
    const buffer = threshold.max * (bufferPercent / 100);
    const upperBound = threshold.max + buffer;
    if (value <= threshold.max) {
      const pos = 0.5 + (1 - value / threshold.max) * 0.5;
      return getGradientColor(Math.min(1, pos), false);
    }
    const pos = Math.max(0, 1 - (value - threshold.max) / (upperBound - threshold.max)) * 0.5;
    return getGradientColor(pos, false);
  }
  return '#94a3b8';
}

export function getPZnRatioColor(value) {
  if (value === null || value === undefined || isNaN(value)) return '#94a3b8';
  if (value >= 8 && value <= 12) return '#16a34a';
  if ((value >= 5 && value < 8) || (value > 12 && value <= 15)) return '#eab308';
  return '#ef4444';
}

// ========== DATA HELPERS ==========

export function getUniqueYears(samples) {
  return [...new Set(samples.map(s => s.year).filter(y => y))].sort();
}

export function getUniqueFields(samples) {
  return [...new Set(samples.map(s => s.field).filter(f => f))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function groupByField(samples) {
  const groups = {};
  samples.forEach(s => {
    const f = s.field || 'Unknown';
    if (!groups[f]) groups[f] = [];
    groups[f].push(s);
  });
  return groups;
}

export function calculateFieldAverage(samples, nutrient, zeroMeansNoData = []) {
  const values = samples.map(s => s[nutrient]).filter(v => isValidValue(v, nutrient, zeroMeansNoData));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function isValidValue(value, attribute, zeroMeansNoData = []) {
  if (value === undefined || value === null || value === '') return false;
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return false;
  if (num === 0 && zeroMeansNoData.includes(attribute)) return false;
  return true;
}

export function getNumericValue(value, attribute, zeroMeansNoData = []) {
  if (!isValidValue(value, attribute, zeroMeansNoData)) return null;
  return parseFloat(value);
}

// ========== GENERAL UTILITIES ==========

export function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ========== STABILITY ANALYSIS ==========

export function getLocationHash(lat, lon, precision = 4) {
  return `${Number(lat).toFixed(precision)}_${Number(lon).toFixed(precision)}`;
}

export function getDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function calculateCV(values) {
  if (!values || values.length < 2) return null;
  const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validValues.length < 2) return null;
  const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  if (mean === 0) return null;
  const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
  const stdDev = Math.sqrt(variance);
  return (stdDev / Math.abs(mean)) * 100;
}

export function calculateSD(values) {
  if (!values || values.length < 2) return null;
  const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validValues.length < 2) return null;
  const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
  return Math.sqrt(variance);
}

export function calculateStabilityData(samples, proximityFeet = 50) {
  if (!samples || samples.length === 0) return {};
  const locationGroups = {};
  const nutrients = ['pH', 'P', 'K', 'OM', 'CEC', 'Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat', 'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S'];
  const CELL_SIZE = 0.0003;
  const spatialIndex = new Map();

  function getGridKey(lat, lon) {
    return `${Math.floor(lat / CELL_SIZE)}_${Math.floor(lon / CELL_SIZE)}`;
  }

  function getNearbyCells(lat, lon) {
    const gridLat = Math.floor(lat / CELL_SIZE);
    const gridLon = Math.floor(lon / CELL_SIZE);
    const cells = [];
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        cells.push(`${gridLat + dLat}_${gridLon + dLon}`);
      }
    }
    return cells;
  }

  samples.forEach(sample => {
    if (!sample.lat || !sample.lon) return;
    let foundGroup = null;
    const nearbyCells = getNearbyCells(sample.lat, sample.lon);
    for (const cellKey of nearbyCells) {
      const cellGroups = spatialIndex.get(cellKey);
      if (!cellGroups) continue;
      for (const hash of cellGroups) {
        const group = locationGroups[hash];
        const dist = getDistanceFeet(sample.lat, sample.lon, group.lat, group.lon);
        if (dist < proximityFeet) { foundGroup = hash; break; }
      }
      if (foundGroup) break;
    }
    const hash = foundGroup || getLocationHash(sample.lat, sample.lon);
    if (!locationGroups[hash]) {
      locationGroups[hash] = { lat: sample.lat, lon: sample.lon, field: sample.field, samples: [] };
      const gridKey = getGridKey(sample.lat, sample.lon);
      if (!spatialIndex.has(gridKey)) spatialIndex.set(gridKey, new Set());
      spatialIndex.get(gridKey).add(hash);
    }
    locationGroups[hash].samples.push(sample);
  });

  const stabilityData = {};
  for (const [hash, group] of Object.entries(locationGroups)) {
    if (group.samples.length < 2) continue;
    stabilityData[hash] = {
      lat: group.lat, lon: group.lon, field: group.field,
      yearCount: group.samples.length,
      years: [...new Set(group.samples.map(s => s.year))].sort(),
      cvByNutrient: {}, highVariabilityNutrients: []
    };
    nutrients.forEach(attr => {
      const values = group.samples.map(s => s[attr]).filter(v => v !== undefined && v !== null && !isNaN(v));
      if (values.length >= 2) {
        const cv = calculateCV(values);
        if (cv !== null) {
          stabilityData[hash].cvByNutrient[attr] = cv;
          if (cv > 30) stabilityData[hash].highVariabilityNutrients.push({ attr, cv });
        }
      }
    });
    stabilityData[hash].hasHighVariability = stabilityData[hash].highVariabilityNutrients.length > 0;
  }
  return stabilityData;
}

export function getStabilityColor(value, attr = null) {
  if (value === null || value === undefined) return '#94a3b8';
  if (attr === 'pH') {
    if (value < 0.20) return '#16a34a';
    if (value < 0.35) return '#eab308';
    return '#ef4444';
  }
  if (value < 20) return '#16a34a';
  if (value < 30) return '#eab308';
  return '#ef4444';
}

export function getStabilityLabel(value, attr = null) {
  if (value === null || value === undefined) return 'Unknown';
  if (attr === 'pH') {
    if (value < 0.20) return 'Stable';
    if (value < 0.35) return 'Moderate';
    return 'Volatile';
  }
  if (value < 20) return 'Stable';
  if (value < 30) return 'Moderate';
  return 'Volatile';
}

export function getStabilityEmoji(value, attr = null) {
  if (value === null || value === undefined) return '';
  if (attr === 'pH') {
    if (value < 0.20) return '🟢';
    if (value < 0.35) return '🟡';
    return '🔴';
  }
  if (value < 20) return '🟢';
  if (value < 30) return '🟡';
  return '🔴';
}

export function calculateFieldStability(samples, attr) {
  const stabilityData = calculateStabilityData(samples);
  const cvValues = Object.values(stabilityData).map(d => d.cvByNutrient[attr]).filter(cv => cv !== null && cv !== undefined);
  if (cvValues.length === 0) return null;
  const avgCV = cvValues.reduce((a, b) => a + b, 0) / cvValues.length;
  const label = getStabilityLabel(avgCV, attr);
  const color = getStabilityColor(avgCV, attr);
  const emoji = getStabilityEmoji(avgCV, attr);
  const stabilityScore = Math.max(0, Math.min(100, 100 - avgCV));
  return { avgCV, stabilityScore, locationCount: cvValues.length, label, color, emoji };
}

// ========== TREND ANALYSIS ==========

export function calculateLinearRegression(data) {
  if (!data || data.length < 2) return null;
  const n = data.length;
  const sumX = data.reduce((sum, d) => sum + d.x, 0);
  const sumY = data.reduce((sum, d) => sum + d.y, 0);
  const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0);
  const sumX2 = data.reduce((sum, d) => sum + d.x * d.x, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTotal = data.reduce((sum, d) => sum + Math.pow(d.y - meanY, 2), 0);
  const ssResidual = data.reduce((sum, d) => {
    const predicted = slope * d.x + intercept;
    return sum + Math.pow(d.y - predicted, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
  return { slope, intercept, r2 };
}

export function getTrendDirection(slope, currentValue, attr = null) {
  if (slope === null || slope === undefined) return 'flat';
  const minMagnitude = attr === 'pH' ? 0.02 : Math.abs(currentValue) * 0.02;
  if (Math.abs(slope) < minMagnitude) return 'flat';
  return slope > 0 ? 'up' : 'down';
}

export function calculateTrendStability(yearData, attr) {
  if (!yearData || yearData.length < 2) return null;
  const values = yearData.map(d => d.avg).filter(v => v !== null && v !== undefined && !isNaN(v));
  if (values.length < 2) return null;
  let stabilityValue, stabilityMetric;
  if (attr === 'pH') { stabilityValue = calculateSD(values); stabilityMetric = 'SD'; }
  else { stabilityValue = calculateCV(values); stabilityMetric = 'CV'; }
  if (stabilityValue === null) return null;
  const label = getStabilityLabel(stabilityValue, attr);
  const color = getStabilityColor(stabilityValue, attr);
  const emoji = getStabilityEmoji(stabilityValue, attr);
  return { value: stabilityValue, metric: stabilityMetric, label, color, emoji, yearCount: yearData.length };
}

// ========== CONSTANTS ==========

export const DEFAULT_CRITICAL_LEVELS = {
  P: 15, K: 120, pH: 5.5, OM: 2.0, S: 8,
  Ca_sat: 55, Mg_sat: 8, K_Sat: 2.0, Zn: 0.5, Ca: 500, Mg: 50
};

export const DEFAULT_OPTIMAL_LEVELS = {
  P: { min: 25, max: 50 }, K: { min: 150, max: 250 }, pH: { min: 6.0, max: 7.0 },
  OM: { min: 3.0, max: 5.0 }, S: { min: 12, max: 30 }, Ca_sat: { min: 65, max: 75 },
  Mg_sat: { min: 10, max: 15 }, K_Sat: { min: 3.0, max: 5.0 }, H_Sat: { max: 5.0 }
};

export const NUTRIENT_BEHAVIOR = {
  P: 'more_is_ok', K: 'more_is_ok', OM: 'more_is_ok', S: 'more_is_ok',
  K_Sat: 'more_is_ok', Zn: 'more_is_ok', Boron: 'more_is_ok',
  Fe: 'more_is_ok', Mn: 'more_is_ok', Cu: 'more_is_ok',
  Ca_sat: 'target_specific', Mg_sat: 'target_specific', pH: 'target_specific',
  H_Sat: 'lower_is_better'
};

export function getCriticalLevels() {
  const settings = JSON.parse(localStorage.getItem('soilSettings') || '{}');
  return {
    P: settings.P_critical ?? DEFAULT_CRITICAL_LEVELS.P,
    K: settings.K_critical ?? DEFAULT_CRITICAL_LEVELS.K,
    pH: settings.pH_critical ?? DEFAULT_CRITICAL_LEVELS.pH,
    OM: settings.OM_critical ?? DEFAULT_CRITICAL_LEVELS.OM,
    S: settings.S_critical ?? DEFAULT_CRITICAL_LEVELS.S,
    Ca_sat: settings.Ca_sat_critical ?? DEFAULT_CRITICAL_LEVELS.Ca_sat,
    Mg_sat: settings.Mg_sat_critical ?? DEFAULT_CRITICAL_LEVELS.Mg_sat,
    K_Sat: settings.K_sat_critical ?? DEFAULT_CRITICAL_LEVELS.K_Sat,
    Zn: DEFAULT_CRITICAL_LEVELS.Zn, Ca: DEFAULT_CRITICAL_LEVELS.Ca, Mg: DEFAULT_CRITICAL_LEVELS.Mg
  };
}

export function getOptimalLevels() {
  const settings = JSON.parse(localStorage.getItem('soilSettings') || '{}');
  return {
    P: { min: settings.P_min ?? DEFAULT_OPTIMAL_LEVELS.P.min, max: settings.P_max ?? DEFAULT_OPTIMAL_LEVELS.P.max },
    K: { min: settings.K_min ?? DEFAULT_OPTIMAL_LEVELS.K.min, max: settings.K_max ?? DEFAULT_OPTIMAL_LEVELS.K.max },
    pH: { min: settings.pH_min ?? DEFAULT_OPTIMAL_LEVELS.pH.min, max: settings.pH_max ?? DEFAULT_OPTIMAL_LEVELS.pH.max },
    OM: { min: settings.OM_min ?? DEFAULT_OPTIMAL_LEVELS.OM.min, max: settings.OM_max ?? DEFAULT_OPTIMAL_LEVELS.OM.max },
    S: { min: settings.S_min ?? DEFAULT_OPTIMAL_LEVELS.S.min, max: settings.S_max ?? DEFAULT_OPTIMAL_LEVELS.S.max },
    Ca_sat: { min: settings.Ca_sat_min ?? DEFAULT_OPTIMAL_LEVELS.Ca_sat.min, max: settings.Ca_sat_max ?? DEFAULT_OPTIMAL_LEVELS.Ca_sat.max },
    Mg_sat: { min: settings.Mg_sat_min ?? DEFAULT_OPTIMAL_LEVELS.Mg_sat.min, max: settings.Mg_sat_max ?? DEFAULT_OPTIMAL_LEVELS.Mg_sat.max },
    K_Sat: { min: settings.K_sat_min ?? DEFAULT_OPTIMAL_LEVELS.K_Sat.min, max: settings.K_sat_max ?? DEFAULT_OPTIMAL_LEVELS.K_Sat.max },
    H_Sat: { max: settings.H_sat_max ?? DEFAULT_OPTIMAL_LEVELS.H_Sat.max }
  };
}

export function getIdealLevels() {
  const optimal = getOptimalLevels();
  const ideals = {};
  for (const [attr, range] of Object.entries(optimal)) {
    if (typeof range === 'object' && range.min !== undefined && range.max !== undefined) ideals[attr] = (range.min + range.max) / 2;
    else if (typeof range === 'object' && range.min !== undefined) ideals[attr] = range.min;
    else if (typeof range === 'object' && range.max !== undefined) ideals[attr] = range.max;
    else ideals[attr] = range;
  }
  return ideals;
}

export function getNutrientBehavior(attr) {
  return NUTRIENT_BEHAVIOR[attr] || 'more_is_ok';
}

export function getTrendInsight(yearData, attr, slope, criticalLevels = {}) {
  if (!yearData || yearData.length < 2) return null;
  const stability = calculateTrendStability(yearData, attr);
  if (!stability) return null;
  const lastYear = yearData[yearData.length - 1];
  const currentValue = lastYear.avg;
  const trendDirection = getTrendDirection(slope, currentValue, attr);
  const behavior = getNutrientBehavior(attr);
  const idealLevels = getIdealLevels();
  const optimalLevels = getOptimalLevels();
  const ideal = idealLevels[attr];
  const optimal = optimalLevels[attr];
  const optimalMin = optimal ? (typeof optimal === 'object' ? optimal.min : optimal) : null;
  const optimalMax = optimal ? (typeof optimal === 'object' ? optimal.max : null) : null;
  const criticalLevel = criticalLevels[attr];
  const idealDisplay = ideal !== undefined ? (Number.isInteger(ideal) ? ideal : ideal.toFixed(1)) : '?';
  let confidence;
  if (stability.label === 'Stable' && yearData.length >= 4 && trendDirection !== 'flat') confidence = 'High';
  else if (stability.label === 'Moderate' || yearData.length === 3) confidence = 'Medium';
  else confidence = 'Low';
  let trendIsGood = false;
  let message, background;
  const nearIdeal = ideal !== undefined && Math.abs(currentValue - ideal) / ideal < 0.05;
  const atOrAboveIdeal = ideal !== undefined && currentValue >= ideal;
  const belowIdeal = ideal !== undefined && currentValue < ideal;
  const inOptimalRange = optimalMin !== null && optimalMax !== null && currentValue >= optimalMin && currentValue <= optimalMax;

  if (behavior === 'more_is_ok') {
    if (atOrAboveIdeal) {
      trendIsGood = true;
      if (trendDirection === 'down') { message = `✓ Declining but still above target (${idealDisplay})`; background = '#dcfce7'; }
      else if (trendDirection === 'up') { message = `✓ Above target (${idealDisplay}) and building`; background = '#dcfce7'; }
      else { message = `✓ Stable above target (${idealDisplay})`; background = '#dcfce7'; }
    } else {
      if (trendDirection === 'up') { trendIsGood = true; message = `✓ Improving toward target (${idealDisplay})`; background = '#dcfce7'; }
      else if (trendDirection === 'down') { trendIsGood = false; message = `🔴 Declining away from target (${idealDisplay}) - action recommended`; background = '#fee2e2'; }
      else { trendIsGood = inOptimalRange; message = inOptimalRange ? `→ Stable in optimal range - target is ${idealDisplay}` : `→ Stable but below target (${idealDisplay}) - consider building`; background = '#f1f5f9'; }
    }
  } else if (behavior === 'target_specific') {
    const movingTowardIdeal = ideal !== undefined && ((trendDirection === 'up' && currentValue < ideal) || (trendDirection === 'down' && currentValue > ideal));
    const movingAwayFromIdeal = ideal !== undefined && ((trendDirection === 'up' && currentValue > ideal) || (trendDirection === 'down' && currentValue < ideal));
    if (nearIdeal || inOptimalRange) {
      trendIsGood = !movingAwayFromIdeal;
      if (trendDirection === 'flat') { message = `✓ Stable at target (${idealDisplay})`; background = '#dcfce7'; }
      else if (movingAwayFromIdeal) { const dirText = currentValue > ideal ? 'Rising above' : 'Dropping below'; message = `⚠️ ${dirText} target (${idealDisplay})`; background = '#fed7aa'; }
      else { message = `✓ Near target (${idealDisplay})`; background = '#dcfce7'; }
    } else if (movingTowardIdeal) { trendIsGood = true; message = `✓ Moving toward target (${idealDisplay})`; background = '#dcfce7'; }
    else if (movingAwayFromIdeal) { trendIsGood = false; const dirText = currentValue > ideal ? 'High' : 'Low'; message = `⚠️ ${dirText} and moving away from target (${idealDisplay})`; background = '#fed7aa'; }
    else { trendIsGood = false; message = currentValue > ideal ? `→ Stable but above target (${idealDisplay})` : `→ Stable but below target (${idealDisplay})`; background = '#f1f5f9'; }
  } else if (behavior === 'lower_is_better') {
    if (trendDirection === 'down') { trendIsGood = true; message = `✓ Declining (lower is better)`; background = '#dcfce7'; }
    else if (trendDirection === 'up') { trendIsGood = false; message = `⚠️ Rising (lower is better)`; background = '#fed7aa'; }
    else { trendIsGood = optimalMax ? currentValue <= optimalMax : true; message = optimalMax && currentValue > optimalMax ? `→ Stable but above max (${optimalMax})` : `✓ Stable`; background = trendIsGood ? '#dcfce7' : '#f1f5f9'; }
  }

  let hasVariabilityWarning = false;
  if (stability.label === 'Volatile') {
    hasVariabilityWarning = true;
    const metricNote = attr === 'pH' ? `SD ${stability.value.toFixed(2)} > 0.35` : `CV ${stability.value.toFixed(0)}% > 30%`;
    message += `. Field samples vary widely year-to-year (${metricNote}) - trend may not be reliable`;
    if (background === '#dcfce7') background = '#fef9c3';
  } else if (stability.label === 'Moderate' && trendDirection !== 'flat') {
    message += '. Moderate sample variability';
  }
  if (yearData.length < 3) message += '. Trend is preliminary - more data needed';

  let yearsToCritical = null;
  if (criticalLevel !== undefined && trendDirection === 'down' && behavior === 'more_is_ok' && stability.label !== 'Volatile' && yearData.length >= 4 && Math.abs(slope) > 0.001) {
    if (currentValue <= criticalLevel) yearsToCritical = { status: 'below', message: '⚠️ Currently below critical level' };
    else {
      const years = (currentValue - criticalLevel) / Math.abs(slope);
      if (years > 15) yearsToCritical = { status: 'long', message: 'Long-term decline - monitor' };
      else if (years > 0) {
        const unit = attr === 'pH' ? '' : (attr.includes('sat') || attr.includes('Sat') ? '%' : ' ppm');
        yearsToCritical = { status: 'projected', years: Math.round(years * 10) / 10, message: `At current rate (${slope > 0 ? '+' : ''}${slope.toFixed(1)}${unit}/yr), will reach critical (${criticalLevel}${unit}) in ~${Math.round(years)} years` };
      }
    }
  }

  let urgency = 'low';
  if (behavior === 'more_is_ok') {
    if (criticalLevel !== undefined && currentValue < criticalLevel) urgency = trendIsGood ? 'high-medium' : 'high';
    else if (optimalMin && currentValue < optimalMin) { if (!trendIsGood && stability.label === 'Stable') urgency = 'high-medium'; else if (!trendIsGood) urgency = 'medium'; }
  } else if (behavior === 'target_specific') {
    if (ideal) { const pctFromIdeal = Math.abs(currentValue - ideal) / ideal; if (pctFromIdeal > 0.15 && !trendIsGood) urgency = 'medium'; if (criticalLevel !== undefined && currentValue < criticalLevel) urgency = 'high-medium'; }
  } else if (behavior === 'lower_is_better') {
    if (optimalMax && currentValue > optimalMax && !trendIsGood) urgency = 'medium';
  }
  if (hasVariabilityWarning && urgency === 'low') urgency = 'medium';
  if (urgency === 'low') { const warningPhrases = ['Dropping', 'Declining away', 'action recommended', 'Rising away', 'moving away']; if (warningPhrases.some(phrase => message.includes(phrase))) urgency = 'medium'; }

  return { trendDirection, stability, confidence, message, background, yearsToCritical, urgency, slope, behavior, ideal, trendIsGood };
}

export function getUrgencyBadge(urgency) {
  const badges = {
    'high': { emoji: '🔴', label: 'Action Required', color: '#dc2626', bg: '#fee2e2' },
    'high-medium': { emoji: '⚠️', label: 'Needs Attention', color: '#ea580c', bg: '#fed7aa' },
    'medium': { emoji: '⚠️', label: 'Review', color: '#ca8a04', bg: '#fef9c3' },
    'low': { emoji: '✓', label: 'Good', color: '#16a34a', bg: '#dcfce7' }
  };
  return badges[urgency] || badges['low'];
}

// ========== BREAKPOINT ANALYSIS ==========

export function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function sampleWithoutReplacement(arr, frac) {
  if (!arr || arr.length === 0) return [];
  const n = Math.max(1, Math.round(arr.length * frac));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export const BREAKPOINT_STABILITY_TOL = {
  Zn: 0.1, Zn_ppm: 0.1, P: 2, P_ppm: 2, K: 10, K_ppm: 10, pH: 0.1, OM: 0.2, OM_pct: 0.2
};

export const BREAKPOINT_NEAR_BAND = {
  Zn: 0.1, Zn_ppm: 0.1, P: 2, P_ppm: 2, K: 10, K_ppm: 10, pH: 0.1, OM: 0.2, OM_pct: 0.2
};

export function findBreakpointBinning(points, nutrientKey, options = {}) {
  const { MIN_POINTS_PER_SIDE = null, MIN_PENALTY = 5, STABILITY_TOL = BREAKPOINT_STABILITY_TOL[nutrientKey] || 0.5, BOOT_ITER = 50, BOOT_FRAC = 0.8, skipBootstrap = false } = options;
  const getNutrientValue = (p) => {
    if (p[nutrientKey] !== undefined && p[nutrientKey] !== null && !isNaN(p[nutrientKey])) return parseFloat(p[nutrientKey]);
    if (p.soil && p.soil[nutrientKey] !== undefined && p.soil[nutrientKey] !== null && !isNaN(p.soil[nutrientKey])) return parseFloat(p.soil[nutrientKey]);
    const keyMap = { 'Zn_ppm': 'Zn', 'P_ppm': 'P', 'K_ppm': 'K', 'OM_pct': 'OM' };
    const altKey = keyMap[nutrientKey];
    if (altKey && p[altKey] !== undefined && p[altKey] !== null && !isNaN(p[altKey])) return parseFloat(p[altKey]);
    return null;
  };
  const getYieldValue = (p) => {
    if (p.avgYield !== undefined && p.avgYield !== null && !isNaN(p.avgYield)) return parseFloat(p.avgYield);
    if (p.yield && p.yield.value !== undefined && p.yield.value !== null && !isNaN(p.yield.value)) return parseFloat(p.yield.value);
    if (p.yieldValue !== undefined && p.yieldValue !== null && !isNaN(p.yieldValue)) return parseFloat(p.yieldValue);
    return null;
  };
  const validPoints = points.filter(p => { const x = getNutrientValue(p); const y = getYieldValue(p); return x !== null && y !== null; }).map(p => ({ x: getNutrientValue(p), y: getYieldValue(p), point: p }));
  if (validPoints.length < 10) return { nutrientKey, breakpoint: null, penalty: 0, meanBelow: null, meanAbove: null, nBelow: 0, nAbove: 0, confidence: 'Low', stabilityPct: 0, candidatesTested: 0, error: 'Insufficient data points' };
  validPoints.sort((a, b) => a.x - b.x);
  const minPerSide = MIN_POINTS_PER_SIDE || Math.max(5, Math.round(0.15 * validPoints.length));
  const uniqueX = [...new Set(validPoints.map(p => p.x))].sort((a, b) => a - b);
  let bestT = null, bestPenalty = -Infinity, bestStats = null, candidatesTested = 0;
  for (let i = 1; i < uniqueX.length; i++) {
    const t = uniqueX[i];
    const below = validPoints.filter(p => p.x < t);
    const above = validPoints.filter(p => p.x >= t);
    if (below.length < minPerSide || above.length < minPerSide) continue;
    candidatesTested++;
    const meanBelow = mean(below.map(p => p.y));
    const meanAbove = mean(above.map(p => p.y));
    const penalty = meanAbove - meanBelow;
    if (penalty > bestPenalty && penalty >= MIN_PENALTY) { bestT = t; bestPenalty = penalty; bestStats = { meanBelow, meanAbove, nBelow: below.length, nAbove: above.length }; }
  }
  if (bestT === null) return { nutrientKey, breakpoint: null, penalty: 0, meanBelow: null, meanAbove: null, nBelow: 0, nAbove: 0, confidence: 'Low', stabilityPct: 0, candidatesTested, error: `No threshold meets minimum penalty of ${MIN_PENALTY} bu/ac` };
  let stabilityPct = 0;
  if (!skipBootstrap && bestT !== null) {
    let nearCount = 0;
    for (let i = 0; i < BOOT_ITER; i++) {
      const subset = sampleWithoutReplacement(points, BOOT_FRAC);
      const bootResult = findBreakpointBinning(subset, nutrientKey, { MIN_POINTS_PER_SIDE: Math.max(3, Math.round(minPerSide * BOOT_FRAC)), MIN_PENALTY, skipBootstrap: true });
      if (bootResult.breakpoint !== null && Math.abs(bootResult.breakpoint - bestT) <= STABILITY_TOL) nearCount++;
    }
    stabilityPct = (nearCount / BOOT_ITER) * 100;
  }
  let confidence = 'Medium';
  const yearsUsed = validPoints.map(p => p.point.yearsAveraged || p.point.yearsUsed || 1);
  const avgYears = mean(yearsUsed) || 1;
  if (avgYears <= 2) confidence = 'Medium-Low';
  if (bestPenalty >= 2 * MIN_PENALTY && stabilityPct >= 60) confidence = avgYears <= 2 ? 'Medium' : 'High';
  if (bestStats.nBelow < 7 || stabilityPct < 40) confidence = 'Low';
  return { nutrientKey, breakpoint: bestT, penalty: bestPenalty, meanBelow: bestStats.meanBelow, meanAbove: bestStats.meanAbove, nBelow: bestStats.nBelow, nAbove: bestStats.nAbove, confidence, stabilityPct, candidatesTested };
}

export function classifyByBreakpoint(points, nutrientKey, breakpoint, nearBand = null) {
  if (breakpoint === null || breakpoint === undefined) return [];
  const band = nearBand || BREAKPOINT_NEAR_BAND[nutrientKey] || Math.abs(breakpoint * 0.1);
  const getNutrientValue = (p) => {
    if (p[nutrientKey] !== undefined && !isNaN(p[nutrientKey])) return parseFloat(p[nutrientKey]);
    if (p.soil && p.soil[nutrientKey] !== undefined) return parseFloat(p.soil[nutrientKey]);
    const keyMap = { 'Zn_ppm': 'Zn', 'P_ppm': 'P', 'K_ppm': 'K', 'OM_pct': 'OM' };
    const altKey = keyMap[nutrientKey];
    if (altKey && p[altKey] !== undefined) return parseFloat(p[altKey]);
    return null;
  };
  const getYieldValue = (p) => {
    if (p.avgYield !== undefined) return parseFloat(p.avgYield);
    if (p.yield && p.yield.value !== undefined) return parseFloat(p.yield.value);
    if (p.yieldValue !== undefined) return parseFloat(p.yieldValue);
    return null;
  };
  return points.map(p => {
    const value = getNutrientValue(p);
    const yieldVal = getYieldValue(p);
    if (value === null) return { ...p, classification: 'UNKNOWN', nutrientValue: null, yieldValue: yieldVal };
    let classification;
    if (value < breakpoint - band) classification = 'BELOW_BREAKPOINT';
    else if (value > breakpoint + band) classification = 'ABOVE_BREAKPOINT';
    else classification = 'NEAR_BREAKPOINT';
    return { ...p, classification, nutrientValue: value, yieldValue: yieldVal, distanceFromBreakpoint: value - breakpoint };
  }).filter(p => p.classification !== 'UNKNOWN');
}

export function buildHingeFeature(x, t) {
  return { lowPart: Math.max(0, t - x), highPart: Math.max(0, x - t) };
}

export function invertMatrix(matrix) {
  const n = matrix.length;
  const aug = matrix.map((row, i) => { const r = [...row]; for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0); return r; });
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) { if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k; }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    if (Math.abs(aug[i][i]) < 1e-10) return null;
    const scale = aug[i][i];
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= scale;
    for (let k = 0; k < n; k++) { if (k !== i) { const factor = aug[k][i]; for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j]; } }
  }
  return aug.map(row => row.slice(n));
}

// ========== MATRIX OPERATIONS & STATISTICS ==========

export function matrixMultiply(A, B) {
  const rowsA = A.length, colsA = A[0].length, colsB = B[0].length;
  const result = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

export function matrixTranspose(A) {
  const rows = A.length, cols = A[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j];
    }
  }
  return result;
}

export function matrixInverseGauss(A) {
  const n = A.length;
  // Build augmented matrix [A | I]
  const aug = A.map((row, i) => {
    const r = [...row];
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    if (Math.abs(aug[i][i]) < 1e-12) return null; // singular
    const scale = aug[i][i];
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= scale;
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
      }
    }
  }
  return aug.map(row => row.slice(n));
}

/**
 * Approximate two-tailed p-value from t-statistic and degrees of freedom.
 * Uses the regularized incomplete beta function approximation.
 */
export function calculatePValue(tStat, df) {
  if (df <= 0 || !isFinite(tStat)) return 1;
  const t2 = tStat * tStat;
  const x = df / (df + t2);

  // Regularized incomplete beta function via continued fraction (Lentz's method)
  function betaIncomplete(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
    // Lentz's continued fraction
    let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    f = d;
    for (let i = 1; i <= 200; i++) {
      const m = i;
      // Even step
      let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
      d = 1 + numerator * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + numerator / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      f *= c * d;
      // Odd step
      numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
      d = 1 + numerator * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + numerator / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-10) break;
    }
    return front * f;
  }

  function lnGamma(z) {
    // Lanczos approximation
    const g = 7;
    const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }
    z -= 1;
    let x = coef[0];
    for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  // I_x(a, b) where a = df/2, b = 0.5
  const p = betaIncomplete(df / 2, 0.5, x);
  return Math.max(0, Math.min(1, p)); // two-tailed
}

/**
 * Calculate Variance Inflation Factor for each predictor variable.
 * X is the design matrix (n x k, WITHOUT intercept column).
 * Returns array of VIF values, one per column of X.
 */
export function calculateVIF(X, nVars) {
  const n = X.length;
  const k = nVars || X[0].length;
  const vifs = [];

  for (let j = 0; j < k; j++) {
    // Regress X_j on all other X columns
    const y = X.map(row => row[j]);
    const otherCols = [];
    for (let i = 0; i < n; i++) {
      const row = [1]; // intercept
      for (let c = 0; c < k; c++) {
        if (c !== j) row.push(X[i][c]);
      }
      otherCols.push(row);
    }
    // OLS: compute R² of this regression
    const Xt = matrixTranspose(otherCols);
    const XtX = matrixMultiply(Xt, otherCols.map(r => r.map(v => [v]).flat().map((v, i) => [v])[0] ? [r] : [r]).flat().length ? matrixMultiply(Xt, otherCols) : null);
    // Simpler approach: compute R² directly
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const ssTotal = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
    if (ssTotal === 0) { vifs.push(1); continue; }

    // Build X'X and X'y for the auxiliary regression
    const m = otherCols[0].length;
    const xtx = Array.from({ length: m }, () => new Array(m).fill(0));
    const xty = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < m; a++) {
        xty[a] += otherCols[i][a] * y[i];
        for (let b = 0; b < m; b++) {
          xtx[a][b] += otherCols[i][a] * otherCols[i][b];
        }
      }
    }
    const inv = matrixInverseGauss(xtx);
    if (!inv) { vifs.push(Infinity); continue; }
    const beta = new Array(m).fill(0);
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        beta[a] += inv[a][b] * xty[b];
      }
    }
    let ssResid = 0;
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let a = 0; a < m; a++) predicted += otherCols[i][a] * beta[a];
      ssResid += (y[i] - predicted) ** 2;
    }
    const r2 = 1 - ssResid / ssTotal;
    vifs.push(r2 >= 1 ? Infinity : 1 / (1 - r2));
  }
  return vifs;
}

export function runHingeMVR(points, config) {
  const { primaryNutrientKey, breakpoint, covariates = [] } = config;
  if (breakpoint === null || breakpoint === undefined) return { error: 'No breakpoint provided', r2: null };
  const getNutrientValue = (p, key) => {
    if (p[key] !== undefined && !isNaN(p[key])) return parseFloat(p[key]);
    if (p.soil && p.soil[key] !== undefined) return parseFloat(p.soil[key]);
    const keyMap = { 'Zn_ppm': 'Zn', 'P_ppm': 'P', 'K_ppm': 'K', 'OM_pct': 'OM' };
    const altKey = keyMap[key];
    if (altKey && p[altKey] !== undefined) return parseFloat(p[altKey]);
    return null;
  };
  const getYieldValue = (p) => {
    if (p.avgYield !== undefined) return parseFloat(p.avgYield);
    if (p.yield && p.yield.value !== undefined) return parseFloat(p.yield.value);
    return null;
  };
  const validPoints = points.filter(p => {
    const y = getYieldValue(p); const primary = getNutrientValue(p, primaryNutrientKey);
    if (y === null || primary === null) return false;
    for (const cov of covariates) { if (getNutrientValue(p, cov) === null) return false; }
    return true;
  });
  if (validPoints.length < 15) return { error: 'Insufficient data for hinge-MVR', r2: null };
  const n = validPoints.length; const k = 3 + covariates.length; const X = [], y = [];
  for (const p of validPoints) {
    const primary = getNutrientValue(p, primaryNutrientKey);
    const hinge = buildHingeFeature(primary, breakpoint);
    const row = [1, hinge.lowPart, hinge.highPart];
    for (const cov of covariates) row.push(getNutrientValue(p, cov));
    X.push(row); y.push(getYieldValue(p));
  }
  try {
    const XtX = [];
    for (let i = 0; i < k; i++) { XtX[i] = []; for (let j = 0; j < k; j++) { let sum = 0; for (let r = 0; r < n; r++) sum += X[r][i] * X[r][j]; XtX[i][j] = sum; } }
    const Xty = [];
    for (let i = 0; i < k; i++) { let sum = 0; for (let r = 0; r < n; r++) sum += X[r][i] * y[r]; Xty[i] = sum; }
    const inv = invertMatrix(XtX);
    if (!inv) return { error: 'Matrix inversion failed (singular matrix)', r2: null };
    const coeffs = [];
    for (let i = 0; i < k; i++) { let sum = 0; for (let j = 0; j < k; j++) sum += inv[i][j] * Xty[j]; coeffs[i] = sum; }
    const yMean = mean(y);
    let ssTotal = 0, ssResid = 0;
    for (let r = 0; r < n; r++) { let predicted = 0; for (let i = 0; i < k; i++) predicted += X[r][i] * coeffs[i]; ssTotal += Math.pow(y[r] - yMean, 2); ssResid += Math.pow(y[r] - predicted, 2); }
    const r2 = ssTotal > 0 ? 1 - ssResid / ssTotal : 0;
    return { r2, intercept: coeffs[0], belowCoef: coeffs[1], aboveCoef: coeffs[2], covariateCoefs: coeffs.slice(3).map((c, i) => ({ name: covariates[i], coef: c })), n: validPoints.length, breakpoint };
  } catch (e) { return { error: 'Regression calculation failed: ' + e.message, r2: null }; }
}
