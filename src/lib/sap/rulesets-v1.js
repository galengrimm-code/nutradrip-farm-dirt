/**
 * Sap Analysis Ruleset v1
 * Threshold configuration for sap analysis status evaluation
 *
 * Structure: thresholds[crop][tissue][metric] = { low, optimal_low, optimal_high, high }
 * Status logic:
 *   - value < low -> Action (too low)
 *   - value < optimal_low -> Watch (low side)
 *   - value > optimal_high -> Watch (high side)
 *   - value > high -> Action (too high)
 *   - else -> OK
 *
 * Converted from IIFE (js/sap/rulesets/v1.js) to ES module
 */

export const version = 'v1';
export const name = 'Default Ruleset';
export const description = 'Initial threshold values for sap analysis - tune based on field observations';

// Nutrient groupings for display
export const nutrientGroups = {
  nitrogen: ['Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4'],
  cations: ['Potassium', 'Calcium', 'Magnesium'],
  phosphorus_sulfur: ['Phosphorus', 'Sulfur'],
  micros: ['Boron', 'Zinc', 'Manganese', 'Copper', 'Iron', 'Molybdenum'],
  other: ['Chloride', 'Sodium', 'Silica', 'Aluminum', 'Cobalt', 'Nickel', 'Selenium'],
  sugars: ['Brix', 'Sugars', 'EC', 'pH']
};

// Display names for nutrient groups
export const groupNames = {
  nitrogen: 'Nitrogen System',
  cations: 'Cations (K, Ca, Mg)',
  phosphorus_sulfur: 'P & S',
  micros: 'Micronutrients',
  other: 'Other Elements',
  sugars: 'Sugars & Energy'
};

// System status groupings (for summary cards)
export const systemGroups = {
  N: ['Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4', 'N_Conversion_Efficiency'],
  CATIONS: ['Potassium', 'Calcium', 'Magnesium', 'KCa_Ratio', 'K_over_CaMg'],
  MICROS: ['Boron', 'Zinc', 'Manganese', 'Copper', 'Iron', 'Molybdenum'],
  SUGARS: ['Brix', 'Sugars', 'EC']
};

// Ratio thresholds
export const ratios = {
  K_Ca: { low: 0.5, optimal_low: 1.0, optimal_high: 2.0, high: 3.0 },
  K_Mg: { low: 2.0, optimal_low: 4.0, optimal_high: 8.0, high: 12.0 },
  K_over_CaMg: { low: 0.3, optimal_low: 0.5, optimal_high: 1.0, high: 1.5 },
  NO3_NH4: { low: 0.5, optimal_low: 1.0, optimal_high: 5.0, high: 10.0 },
  Sugar_over_K: { low: 0.001, optimal_low: 0.005, optimal_high: 0.02, high: 0.05 }
};

// Thresholds by crop and tissue type
export const thresholds = {
  corn: {
    new_leaf: {
      Nitrogen: { low: 800, optimal_low: 1200, optimal_high: 2200, high: 3000 },
      Nitrogen_NO3: { low: 200, optimal_low: 400, optimal_high: 1000, high: 1500 },
      Nitrogen_NH4: { low: 40, optimal_low: 80, optimal_high: 200, high: 350 },
      Potassium: { low: 2000, optimal_low: 3000, optimal_high: 5000, high: 6500 },
      Calcium: { low: 150, optimal_low: 300, optimal_high: 800, high: 1200 },
      Magnesium: { low: 80, optimal_low: 150, optimal_high: 400, high: 600 },
      Phosphorus: { low: 100, optimal_low: 200, optimal_high: 500, high: 800 },
      Sulfur: { low: 50, optimal_low: 100, optimal_high: 300, high: 500 },
      Boron: { low: 0.3, optimal_low: 0.6, optimal_high: 2.0, high: 4.0 },
      Zinc: { low: 0.5, optimal_low: 1.0, optimal_high: 3.0, high: 6.0 },
      Manganese: { low: 1.0, optimal_low: 3.0, optimal_high: 15.0, high: 25.0 },
      Copper: { low: 0.2, optimal_low: 0.5, optimal_high: 2.0, high: 4.0 },
      Iron: { low: 0.5, optimal_low: 1.0, optimal_high: 4.0, high: 8.0 },
      Molybdenum: { low: 0.01, optimal_low: 0.03, optimal_high: 0.15, high: 0.30 },
      Chloride: { low: 200, optimal_low: 400, optimal_high: 1500, high: 2500 },
      Sodium: { low: 1, optimal_low: 5, optimal_high: 50, high: 100 },
      Silica: { low: 30, optimal_low: 60, optimal_high: 200, high: 400 },
      Brix: { low: 2.0, optimal_low: 4.0, optimal_high: 8.0, high: 12.0 },
      Sugars: { low: 0.2, optimal_low: 0.5, optimal_high: 1.5, high: 3.0 },
      EC: { low: 5.0, optimal_low: 7.0, optimal_high: 12.0, high: 16.0 },
      pH: { low: 5.5, optimal_low: 6.0, optimal_high: 6.8, high: 7.2 }
    },
    old_leaf: {
      Nitrogen: { low: 600, optimal_low: 1000, optimal_high: 2000, high: 2800 },
      Nitrogen_NO3: { low: 100, optimal_low: 250, optimal_high: 800, high: 1200 },
      Nitrogen_NH4: { low: 30, optimal_low: 60, optimal_high: 180, high: 300 },
      Potassium: { low: 1500, optimal_low: 2500, optimal_high: 4500, high: 6000 },
      Calcium: { low: 200, optimal_low: 400, optimal_high: 1000, high: 1500 },
      Magnesium: { low: 100, optimal_low: 200, optimal_high: 500, high: 800 },
      Phosphorus: { low: 80, optimal_low: 150, optimal_high: 450, high: 700 },
      Sulfur: { low: 40, optimal_low: 80, optimal_high: 280, high: 450 },
      Boron: { low: 0.2, optimal_low: 0.4, optimal_high: 1.8, high: 3.5 },
      Zinc: { low: 0.4, optimal_low: 0.8, optimal_high: 2.5, high: 5.0 },
      Manganese: { low: 1.0, optimal_low: 2.5, optimal_high: 12.0, high: 20.0 },
      Copper: { low: 0.15, optimal_low: 0.4, optimal_high: 1.8, high: 3.5 },
      Iron: { low: 0.4, optimal_low: 0.8, optimal_high: 3.5, high: 7.0 },
      Molybdenum: { low: 0.01, optimal_low: 0.02, optimal_high: 0.12, high: 0.25 },
      Chloride: { low: 150, optimal_low: 350, optimal_high: 1400, high: 2300 },
      Sodium: { low: 1, optimal_low: 4, optimal_high: 45, high: 90 },
      Silica: { low: 25, optimal_low: 50, optimal_high: 180, high: 350 },
      Brix: { low: 1.5, optimal_low: 3.0, optimal_high: 7.0, high: 10.0 },
      Sugars: { low: 0.15, optimal_low: 0.4, optimal_high: 1.3, high: 2.5 },
      EC: { low: 4.5, optimal_low: 6.5, optimal_high: 11.0, high: 15.0 },
      pH: { low: 5.5, optimal_low: 6.0, optimal_high: 6.8, high: 7.2 }
    }
  },

  soybeans: {
    new_leaf: {
      Nitrogen: { low: 1000, optimal_low: 1500, optimal_high: 2500, high: 3500 },
      Nitrogen_NO3: { low: 50, optimal_low: 150, optimal_high: 500, high: 800 },
      Nitrogen_NH4: { low: 50, optimal_low: 100, optimal_high: 250, high: 400 },
      Potassium: { low: 2500, optimal_low: 3500, optimal_high: 5500, high: 7000 },
      Calcium: { low: 500, optimal_low: 1000, optimal_high: 2500, high: 4000 },
      Magnesium: { low: 200, optimal_low: 400, optimal_high: 900, high: 1400 },
      Phosphorus: { low: 100, optimal_low: 200, optimal_high: 450, high: 700 },
      Sulfur: { low: 80, optimal_low: 150, optimal_high: 350, high: 550 },
      Boron: { low: 0.5, optimal_low: 1.0, optimal_high: 3.0, high: 5.0 },
      Zinc: { low: 1.0, optimal_low: 2.0, optimal_high: 6.0, high: 10.0 },
      Manganese: { low: 1.0, optimal_low: 3.0, optimal_high: 12.0, high: 20.0 },
      Copper: { low: 0.3, optimal_low: 0.6, optimal_high: 2.0, high: 4.0 },
      Iron: { low: 0.3, optimal_low: 0.6, optimal_high: 2.5, high: 5.0 },
      Molybdenum: { low: 0.01, optimal_low: 0.03, optimal_high: 0.15, high: 0.30 },
      Chloride: { low: 200, optimal_low: 400, optimal_high: 1200, high: 2000 },
      Sodium: { low: 1, optimal_low: 3, optimal_high: 30, high: 60 },
      Silica: { low: 30, optimal_low: 60, optimal_high: 150, high: 300 },
      Brix: { low: 3.0, optimal_low: 5.0, optimal_high: 10.0, high: 14.0 },
      Sugars: { low: 0.3, optimal_low: 0.6, optimal_high: 1.8, high: 3.5 },
      EC: { low: 6.0, optimal_low: 8.0, optimal_high: 14.0, high: 18.0 },
      pH: { low: 5.8, optimal_low: 6.2, optimal_high: 7.0, high: 7.4 }
    },
    old_leaf: {
      Nitrogen: { low: 800, optimal_low: 1200, optimal_high: 2200, high: 3000 },
      Nitrogen_NO3: { low: 30, optimal_low: 100, optimal_high: 400, high: 650 },
      Nitrogen_NH4: { low: 40, optimal_low: 80, optimal_high: 220, high: 350 },
      Potassium: { low: 2000, optimal_low: 3000, optimal_high: 5000, high: 6500 },
      Calcium: { low: 600, optimal_low: 1200, optimal_high: 3000, high: 4500 },
      Magnesium: { low: 250, optimal_low: 500, optimal_high: 1100, high: 1600 },
      Phosphorus: { low: 80, optimal_low: 160, optimal_high: 400, high: 600 },
      Sulfur: { low: 60, optimal_low: 120, optimal_high: 320, high: 500 },
      Boron: { low: 0.4, optimal_low: 0.8, optimal_high: 2.5, high: 4.5 },
      Zinc: { low: 0.8, optimal_low: 1.5, optimal_high: 5.0, high: 8.0 },
      Manganese: { low: 0.8, optimal_low: 2.5, optimal_high: 10.0, high: 18.0 },
      Copper: { low: 0.25, optimal_low: 0.5, optimal_high: 1.8, high: 3.5 },
      Iron: { low: 0.25, optimal_low: 0.5, optimal_high: 2.2, high: 4.5 },
      Molybdenum: { low: 0.01, optimal_low: 0.02, optimal_high: 0.12, high: 0.25 },
      Chloride: { low: 150, optimal_low: 350, optimal_high: 1100, high: 1800 },
      Sodium: { low: 1, optimal_low: 2, optimal_high: 25, high: 50 },
      Silica: { low: 25, optimal_low: 50, optimal_high: 130, high: 260 },
      Brix: { low: 2.5, optimal_low: 4.0, optimal_high: 9.0, high: 12.0 },
      Sugars: { low: 0.25, optimal_low: 0.5, optimal_high: 1.5, high: 3.0 },
      EC: { low: 5.5, optimal_low: 7.5, optimal_high: 13.0, high: 17.0 },
      pH: { low: 5.8, optimal_low: 6.2, optimal_high: 7.0, high: 7.4 }
    }
  }
};

// Delta thresholds (new - old differences as %)
export const deltaThresholds = {
  mobile: {
    Nitrogen_NO3: { concern_low: -50, concern_high: 100 },
    Nitrogen_NH4: { concern_low: -30, concern_high: 80 },
    Potassium: { concern_low: -40, concern_high: 60 },
    Phosphorus: { concern_low: -40, concern_high: 60 },
    Magnesium: { concern_low: -30, concern_high: 50 }
  },
  immobile: {
    Calcium: { concern_low: -50, concern_high: 30 },
    Boron: { concern_low: -40, concern_high: 40 },
    Iron: { concern_low: -50, concern_high: 50 },
    Manganese: { concern_low: -40, concern_high: 60 }
  }
};

// Get threshold for a specific nutrient
export function getThreshold(crop, tissue, nutrient) {
  const cropData = thresholds[crop?.toLowerCase()] || thresholds.corn;
  const tissueData = cropData[tissue] || cropData.new_leaf;
  return tissueData[nutrient] || null;
}

// Get ratio threshold
export function getRatioThreshold(ratioName) {
  return ratios[ratioName] || null;
}

// Default export as a ruleset object (for passing to logic functions)
const ruleset = {
  version, name, description,
  nutrientGroups, groupNames, systemGroups,
  ratios, thresholds, deltaThresholds,
  getThreshold, getRatioThreshold
};

export default ruleset;
