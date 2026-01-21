/**
 * utils.js - Shared utility functions
 * Common utilities used across multiple pages (formatNumber, generateId, debounce, color functions, etc.)
 */
(function() {
'use strict';

// ========== STATUS/UI ==========
function showStatus(message, isSuccess = true) {
  const el = document.getElementById('statusMessage');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
  el.style.color = isSuccess ? '#166534' : '#991b1b';
  setTimeout(() => el.style.display = 'none', 4000);
}

// ========== FORMATTING ==========
function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return Number(value).toFixed(decimals);
}

// Get decimal places for an attribute (checks user settings, then defaults)
function getDecimals(attr, defaultDecimals = {}) {
  // Check for user-customized settings first
  const customDecimals = JSON.parse(localStorage.getItem('decimalPlaces') || '{}');
  if (customDecimals[attr] !== undefined) {
    return customDecimals[attr];
  }
  // Fall back to provided defaults
  if (defaultDecimals[attr] !== undefined) {
    return defaultDecimals[attr];
  }
  // Default to 1 decimal for unknown attributes
  return 1;
}

// Format a value using the configured decimal places for an attribute
function formatValue(value, attr, defaultDecimals = {}) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const decimals = getDecimals(attr, defaultDecimals);
  return Number(value).toFixed(decimals);
}

// ========== COLOR UTILITIES ==========

// Interpolate between two hex colors
function interpolateColor(color1, color2, factor) {
  const hex = c => parseInt(c, 16);
  const r1 = hex(color1.slice(1,3)), g1 = hex(color1.slice(3,5)), b1 = hex(color1.slice(5,7));
  const r2 = hex(color2.slice(1,3)), g2 = hex(color2.slice(3,5)), b2 = hex(color2.slice(5,7));
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// Get gradient color from red->yellow->green based on position (0-1)
function getGradientColor(position, isLowerBetter = false) {
  // Clamp position to 0-1
  const p = Math.max(0, Math.min(1, isLowerBetter ? 1 - position : position));
  // Color stops: red (#dc2626) -> orange (#f97316) -> yellow (#eab308) -> lime (#84cc16) -> green (#16a34a)
  const stops = [
    { pos: 0.0, color: '#dc2626' },  // red
    { pos: 0.25, color: '#f97316' }, // orange
    { pos: 0.5, color: '#eab308' },  // yellow
    { pos: 0.75, color: '#84cc16' }, // lime
    { pos: 1.0, color: '#16a34a' }   // green
  ];
  // Find the two stops to interpolate between
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].pos && p <= stops[i+1].pos) {
      const range = stops[i+1].pos - stops[i].pos;
      const factor = (p - stops[i].pos) / range;
      return interpolateColor(stops[i].color, stops[i+1].color, factor);
    }
  }
  return stops[stops.length - 1].color;
}

// Get gradient color for change values (negative->neutral->positive)
function getChangeGradientColor(percentChange) {
  // Clamp to -30% to +30% range for color scaling
  const clampedPct = Math.max(-30, Math.min(30, percentChange));
  // Map to 0-1 where 0 = -30%, 0.5 = 0%, 1 = +30%
  const position = (clampedPct + 30) / 60;
  // Color stops: dark red -> light red -> gray -> light green -> dark green
  const stops = [
    { pos: 0.0, color: '#b91c1c' },  // dark red (-30%+)
    { pos: 0.25, color: '#f87171' }, // light red
    { pos: 0.45, color: '#d1d5db' }, // light gray
    { pos: 0.55, color: '#d1d5db' }, // light gray (neutral zone)
    { pos: 0.75, color: '#86efac' }, // light green
    { pos: 1.0, color: '#15803d' }   // dark green (+30%+)
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

// Get median-based color using IQR to handle outliers
// isLowerBetter: if true, lower values get green, higher get red (for Mg_sat, H_Sat, etc.)
function getMedianBasedColor(value, values, isLowerBetter = false) {
  if (!values || values.length === 0) return '#94a3b8';
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  // Calculate quartiles
  const q1 = sorted[Math.floor(len * 0.25)];
  const q3 = sorted[Math.floor(len * 0.75)];
  const iqr = q3 - q1;

  // Use IQR-based bounds (ignore outliers beyond 1.5*IQR)
  const lowerBound = Math.max(sorted[0], q1 - 1.5 * iqr);
  const upperBound = Math.min(sorted[len - 1], q3 + 1.5 * iqr);
  const range = upperBound - lowerBound;

  if (range === 0) return '#eab308'; // All same value = yellow

  // Clamp value to bounds for color calculation
  const clampedValue = Math.max(lowerBound, Math.min(upperBound, value));
  const position = (clampedValue - lowerBound) / range; // 0 to 1

  // Use smooth gradient
  return getGradientColor(position, isLowerBetter);
}

// Get color for year-over-year change
function getChangeColor(change, percentChange) {
  return getChangeGradientColor(percentChange);
}

// Get color for a value based on thresholds
// config: { LOWER_IS_BETTER: [...] }
function getColor(value, attribute, settings = {}, bufferPercent = 25, allValues = null, lowerIsBetterAttrs = []) {
  // Sample ID gets neutral blue color
  if (attribute === 'sampleId') return '#3b82f6';

  // CEC and micronutrients use median-based coloring if allValues provided
  const medianBasedAttrs = ['CEC', 'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S'];
  if (medianBasedAttrs.includes(attribute) && allValues && allValues.length > 0) {
    return getMedianBasedColor(value, allValues);
  }

  // Default thresholds if none provided
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

  if (!threshold) {
    return '#94a3b8';
  }

  // Calculate position for smooth gradient (0 = worst, 1 = best)
  if (threshold.min !== null && threshold.max !== null) {
    // Range threshold (pH, Ca_sat) - optimal is in the middle
    const buffer = (threshold.max - threshold.min) * (bufferPercent / 100);
    const lowerBound = threshold.min - buffer;
    const upperBound = threshold.max + buffer;

    if (value >= threshold.min && value <= threshold.max) {
      return '#16a34a'; // In optimal range = green
    } else if (value < threshold.min) {
      // Below optimal - calculate position from lowerBound to min
      const pos = Math.max(0, (value - lowerBound) / (threshold.min - lowerBound));
      return getGradientColor(pos * 0.5, false); // 0-0.5 range (red to yellow)
    } else {
      // Above optimal - calculate position from max to upperBound
      const pos = Math.max(0, 1 - (value - threshold.max) / (upperBound - threshold.max));
      return getGradientColor(pos * 0.5, false); // 0-0.5 range (red to yellow)
    }
  } else if (threshold.min !== null) {
    // Minimum threshold (P, K, OM, K_Sat) - higher is better
    const buffer = threshold.min * (bufferPercent / 100);
    const lowerBound = threshold.min - buffer;
    // Calculate position: 0 at lowerBound, 1 at min (optimal)
    if (value >= threshold.min) {
      // Above optimal - calculate gradient up to 2x min
      const pos = Math.min(1, 0.5 + (value - threshold.min) / (threshold.min * 2) * 0.5);
      return getGradientColor(pos, false);
    } else {
      // Below optimal
      const pos = Math.max(0, (value - lowerBound) / (threshold.min - lowerBound)) * 0.5;
      return getGradientColor(pos, false);
    }
  } else if (threshold.max !== null) {
    // Maximum threshold (Mg_sat, H_Sat) - lower is better
    const buffer = threshold.max * (bufferPercent / 100);
    const upperBound = threshold.max + buffer;
    if (value <= threshold.max) {
      // Below max (good) - calculate gradient
      const pos = 0.5 + (1 - value / threshold.max) * 0.5;
      return getGradientColor(Math.min(1, pos), false);
    } else {
      // Above max (bad)
      const pos = Math.max(0, 1 - (value - threshold.max) / (upperBound - threshold.max)) * 0.5;
      return getGradientColor(pos, false);
    }
  }
  return '#94a3b8';
}

// ========== DATA HELPERS ==========

function getUniqueYears(samples) {
  return [...new Set(samples.map(s => s.year).filter(y => y))].sort();
}

function getUniqueFields(samples) {
  return [...new Set(samples.map(s => s.field).filter(f => f))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function groupByField(samples) {
  const groups = {};
  samples.forEach(s => {
    const f = s.field || 'Unknown';
    if (!groups[f]) groups[f] = [];
    groups[f].push(s);
  });
  return groups;
}

function calculateFieldAverage(samples, nutrient, zeroMeansNoData = []) {
  const values = samples.map(s => s[nutrient]).filter(v => isValidValue(v, nutrient, zeroMeansNoData));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Check if a value represents actual data (not missing/placeholder)
// For certain attributes, 0 typically means "not tested" rather than actual zero
function isValidValue(value, attribute, zeroMeansNoData = []) {
  if (value === undefined || value === null || value === '') return false;
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return false;
  // For attributes where 0 means "no data", filter out zeros
  if (num === 0 && zeroMeansNoData.includes(attribute)) {
    return false;
  }
  return true;
}

// Get numeric value or null if invalid
function getNumericValue(value, attribute, zeroMeansNoData = []) {
  if (!isValidValue(value, attribute, zeroMeansNoData)) return null;
  return parseFloat(value);
}

// ========== GENERAL UTILITIES ==========

function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ========== EXPORT AS GLOBAL ==========
window.Utils = {
  // Status/UI
  showStatus,

  // Formatting
  formatNumber,
  getDecimals,
  formatValue,

  // Colors
  interpolateColor,
  getGradientColor,
  getChangeGradientColor,
  getMedianBasedColor,
  getChangeColor,
  getColor,

  // Data helpers
  getUniqueYears,
  getUniqueFields,
  groupByField,
  calculateFieldAverage,
  isValidValue,
  getNumericValue,

  // General utilities
  debounce,
  throttle
};

})();
