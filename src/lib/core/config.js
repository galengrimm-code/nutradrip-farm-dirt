/**
 * config.js - Shared application configuration
 * Nutrients, map defaults, API keys, thresholds
 */

// ========== API CONFIG ==========
export const CLIENT_ID = '714780458094-9rde31taeottmavhl5t0uo8b9kfpergc.apps.googleusercontent.com';
export const API_KEY = 'AIzaSyCOSDbrAlc3ct2-lRvJv1y7V0nV7haWc9E';
export const SHEET_NAMES = { FIELDS: 'Fields', SAMPLES: 'Samples', SETTINGS: 'Settings' };

export function getSheetId() {
  const stored = localStorage.getItem('googleSheetId');
  if (!stored) return null;
  if (stored.includes('docs.google.com') || stored.includes('/d/')) {
    const match = stored.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
  }
  return stored;
}

// ========== MAP DEFAULTS ==========
export const MAP_DEFAULTS = {
  lat: 39.8528,
  lng: -95.5347,
  zoom: 13,
  zoomThreshold: 15
};

// ========== NUTRIENT DEFINITIONS ==========
export const ALL_NUTRIENTS = [
  { key: 'sampleId', name: 'Sample ID', unit: '', decimals: 0 },
  { key: 'pH', name: 'pH', unit: '', decimals: 1 },
  { key: 'BpH', name: 'Buffer pH', unit: '', decimals: 1 },
  { key: 'P', name: 'P (Bray)', unit: 'ppm', decimals: 0 },
  { key: 'P2', name: 'P (Olsen)', unit: 'ppm', decimals: 0 },
  { key: 'K', name: 'Potassium', unit: 'ppm', decimals: 0 },
  { key: 'OM', name: 'Organic Matter', unit: '%', decimals: 1 },
  { key: 'CEC', name: 'CEC', unit: 'meq/100g', decimals: 1 },
  { key: 'Ca_sat', name: 'Ca Saturation', unit: '%', decimals: 1 },
  { key: 'Mg_sat', name: 'Mg Saturation', unit: '%', decimals: 1 },
  { key: 'K_Sat', name: 'K Saturation', unit: '%', decimals: 1 },
  { key: 'H_Sat', name: 'H Saturation', unit: '%', decimals: 1 },
  { key: 'Na_Sat', name: 'Na Saturation', unit: '%', decimals: 1 },
  { key: 'Ca', name: 'Calcium', unit: 'ppm', decimals: 0 },
  { key: 'Mg', name: 'Magnesium', unit: 'ppm', decimals: 0 },
  { key: 'Na', name: 'Sodium', unit: 'ppm', decimals: 0 },
  { key: 'Zn', name: 'Zinc', unit: 'ppm', decimals: 1 },
  { key: 'Cu', name: 'Copper', unit: 'ppm', decimals: 1 },
  { key: 'Mn', name: 'Manganese', unit: 'ppm', decimals: 1 },
  { key: 'Fe', name: 'Iron', unit: 'ppm', decimals: 1 },
  { key: 'Boron', name: 'Boron', unit: 'ppm', decimals: 1 },
  { key: 'S', name: 'Sulfur', unit: 'ppm', decimals: 1 },
  { key: 'NO3', name: 'Nitrate', unit: 'ppm', decimals: 1 },
  { key: 'NH4', name: 'Ammonium', unit: 'ppm', decimals: 1 },
  { key: 'Soluble_Salts', name: 'Soluble Salts', unit: 'mmhos/cm', decimals: 2 },
  { key: 'EC', name: 'EC', unit: 'dS/m', decimals: 2 },
  { key: 'P_Zn_Ratio', name: 'P:Zn Ratio', unit: '', decimals: 1 }
];

// Attributes where lower values are better
export const LOWER_IS_BETTER = ['Mg_sat', 'H_Sat', 'Na_Sat', 'Soluble_Salts'];

// Attributes where zero means "not tested" rather than actual zero
export const ZERO_MEANS_NO_DATA = ['P', 'K', 'OM', 'CEC', 'Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat', 'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S', 'Ca', 'Mg', 'Na', 'NO3', 'NH4'];

// Default visibility (which nutrients show in dropdowns by default)
export const DEFAULT_VISIBLE = [
  'sampleId', 'pH', 'BpH', 'P', 'K', 'OM', 'CEC',
  'Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat',
  'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S'
];

// ========== FIELD SHADING THRESHOLDS ==========
export const FIELD_SHADING_THRESHOLDS = {
  pH: { zones: [{ max: 5.8, color: 'red' }, { max: 6.3, color: 'yellow' }, { max: 7.0, color: 'green' }, { max: 7.5, color: 'yellow' }, { color: 'red' }] },
  P: { zones: [{ max: 15, color: 'red' }, { max: 25, color: 'yellow' }, { color: 'green' }] },
  K: { zones: [{ max: 120, color: 'red' }, { max: 150, color: 'yellow' }, { color: 'green' }] },
  OM: { zones: [{ max: 2.0, color: 'red' }, { max: 3.0, color: 'yellow' }, { color: 'green' }] }
};

// Nutrient lookup helpers
export function getNutrientDef(key) {
  return ALL_NUTRIENTS.find(n => n.key === key);
}

export function getNutrientName(key) {
  const def = getNutrientDef(key);
  return def ? def.name : key;
}

export function getNutrientUnit(key) {
  const def = getNutrientDef(key);
  return def ? def.unit : '';
}

export function getNutrientDecimals(key) {
  const def = getNutrientDef(key);
  return def ? def.decimals : 1;
}
