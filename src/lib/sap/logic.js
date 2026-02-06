/**
 * Sap Analysis Logic Module
 * Pure functions for computing derived metrics and status evaluation
 *
 * All functions are stateless and depend only on their inputs.
 * Thresholds come from ruleset config, not hardcoded here.
 *
 * Converted from IIFE (js/sap/logic.js) to ES module
 */

import defaultRuleset from './rulesets-v1.js';

// Default ruleset reference
const getRuleset = () => defaultRuleset;

// ========== CONFIG-DRIVEN RATIO DEFINITIONS ==========
const RATIO_DEFS = [
  { id: 'K_Ca', label: 'K:Ca', fn: (leaf) => leaf.Potassium && leaf.Calcium ? leaf.Potassium / leaf.Calcium : null },
  { id: 'K_Mg', label: 'K:Mg', fn: (leaf) => leaf.Potassium && leaf.Magnesium ? leaf.Potassium / leaf.Magnesium : null },
  { id: 'K_over_CaMg', label: 'K/(Ca+Mg)', fn: (leaf) => leaf.Potassium && leaf.Calcium && leaf.Magnesium && (leaf.Calcium + leaf.Magnesium) > 0 ? leaf.Potassium / (leaf.Calcium + leaf.Magnesium) : null },
  { id: 'NO3_NH4', label: 'NO\u2083:NH\u2084', fn: (leaf) => leaf.Nitrogen_NO3 && leaf.Nitrogen_NH4 && leaf.Nitrogen_NH4 > 0 ? leaf.Nitrogen_NO3 / leaf.Nitrogen_NH4 : null },
  { id: 'Ca_Mg', label: 'Ca:Mg', fn: (leaf) => leaf.Calcium && leaf.Magnesium && leaf.Magnesium > 0 ? leaf.Calcium / leaf.Magnesium : null },
  { id: 'Sugar_K', label: 'Sugar:K', fn: (leaf) => leaf.Sugars && leaf.Potassium && leaf.Potassium > 0 ? (leaf.Sugars * 1000) / leaf.Potassium : null },
];

// Importance weights for system ranking
export const SYSTEM_IMPORTANCE = {
  N: 1.0,
  CATIONS: 1.0,
  SUGARS: 0.9,
  MICROS: 0.7
};

/**
 * Compute derived metrics (ratios) for BOTH leaves separately
 */
export function computeDerivedMetrics(sampleDate) {
  const result = { new_leaf: {}, old_leaf: {} };

  ['new_leaf', 'old_leaf'].forEach(tissue => {
    const leaf = sampleDate[tissue] || {};
    const parsed = {};
    Object.keys(leaf).forEach(k => {
      const v = parseFloat(leaf[k]);
      if (!isNaN(v)) parsed[k] = v;
    });

    RATIO_DEFS.forEach(def => {
      const val = def.fn(parsed);
      if (val !== null) {
        result[tissue][def.id] = val;
      }
    });
  });

  return result;
}

/**
 * Get ratio definitions for UI
 */
export function getRatioDefs() {
  return RATIO_DEFS;
}

/**
 * Evaluate status for a single nutrient value
 */
export function evaluateNutrientStatus(value, threshold) {
  if (value === null || value === undefined || isNaN(value)) {
    return { status: 'Unknown', severity: 0, reason: 'No data', direction: null };
  }

  if (!threshold) {
    return { status: 'OK', severity: 0, reason: 'No threshold defined', direction: null };
  }

  const { low, optimal_low, optimal_high, high } = threshold;

  if (value < low) {
    const severity = Math.min(100, Math.round(((low - value) / low) * 100));
    return { status: 'Action', severity, reason: 'Very low', direction: 'low' };
  }

  if (value < optimal_low) {
    const range = optimal_low - low;
    const distance = optimal_low - value;
    const severity = Math.round((distance / range) * 50);
    return { status: 'Watch', severity, reason: 'Below optimal', direction: 'low' };
  }

  if (value > high) {
    const severity = Math.min(100, Math.round(((value - high) / high) * 100));
    return { status: 'Action', severity, reason: 'Very high', direction: 'high' };
  }

  if (value > optimal_high) {
    const range = high - optimal_high;
    const distance = value - optimal_high;
    const severity = Math.round((distance / range) * 50);
    return { status: 'Watch', severity, reason: 'Above optimal', direction: 'high' };
  }

  return { status: 'OK', severity: 0, reason: 'Optimal', direction: null };
}

/**
 * Compute delta between new and old leaf values
 */
export function computeDelta(newVal, oldVal) {
  if (newVal === null || oldVal === null || isNaN(newVal) || isNaN(oldVal)) {
    return { delta: null, deltaPct: null, direction: null };
  }

  const delta = newVal - oldVal;
  const deltaPct = oldVal !== 0 ? (delta / oldVal) * 100 : (delta > 0 ? 100 : (delta < 0 ? -100 : 0));
  const direction = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'none');

  return { delta, deltaPct, direction };
}

/**
 * Determine leaf signal (pattern interpretation)
 */
export function getLeafSignal(newStatus, oldStatus) {
  const newLow = newStatus?.direction === 'low';
  const newHigh = newStatus?.direction === 'high';
  const newOK = newStatus?.status === 'OK' || newStatus?.status === 'Unknown';
  const oldLow = oldStatus?.direction === 'low';
  const oldHigh = oldStatus?.direction === 'high';
  const oldOK = oldStatus?.status === 'OK' || oldStatus?.status === 'Unknown';

  if (newLow && oldLow) {
    return { signal: 'SUPPLY LOW', color: '#dc2626', description: 'Whole-plant deficiency - check root uptake' };
  }
  if (newHigh && oldHigh) {
    return { signal: 'EXCESS', color: '#7c3aed', description: 'Accumulation in both - reduce inputs or dilution issue' };
  }
  if (newLow && (oldOK || oldHigh)) {
    return { signal: 'NEW LIMIT', color: '#f59e0b', description: 'Transport to new growth limited - check mobility' };
  }
  if ((newOK || newHigh) && oldLow) {
    return { signal: 'REMOB', color: '#0891b2', description: 'Remobilizing from old leaves - normal or stress response' };
  }
  if (newHigh && oldOK) {
    return { signal: 'NEW BUILD', color: '#8b5cf6', description: 'Accumulating in new growth' };
  }
  if (newOK && oldHigh) {
    return { signal: 'OLD BUILD', color: '#6366f1', description: 'Stored in old tissue' };
  }

  return { signal: '', color: '#94a3b8', description: '' };
}

/**
 * Evaluate status for a full sample date (both leaves)
 */
export function evaluateStatus(sampleDate, context = {}, ruleset = null) {
  const rules = ruleset || getRuleset();
  const crop = context.crop || 'corn';

  const result = {
    per_nutrient_status: { new_leaf: {}, old_leaf: {} },
    deltas: {},
    leafSignals: {},
    system_status: {
      N: { status: 'OK', reason: '', confidence: 'Low', issues: [], score: 0 },
      CATIONS: { status: 'OK', reason: '', confidence: 'Low', issues: [], score: 0 },
      MICROS: { status: 'OK', reason: '', confidence: 'Low', issues: [], score: 0 },
      SUGARS: { status: 'OK', reason: '', confidence: 'Low', issues: [], score: 0 }
    },
    derived: computeDerivedMetrics(sampleDate)
  };

  ['new_leaf', 'old_leaf'].forEach(tissue => {
    const values = sampleDate[tissue] || {};

    Object.keys(values).forEach(nutrient => {
      const value = parseFloat(values[nutrient]);
      if (isNaN(value)) return;
      const threshold = rules.getThreshold ? rules.getThreshold(crop, tissue, nutrient) : null;
      result.per_nutrient_status[tissue][nutrient] = evaluateNutrientStatus(value, threshold);
    });

    Object.keys(result.derived[tissue]).forEach(ratioName => {
      const value = result.derived[tissue][ratioName];
      const threshold = rules.getRatioThreshold ? rules.getRatioThreshold(ratioName) : null;
      if (threshold) {
        result.per_nutrient_status[tissue][ratioName] = evaluateNutrientStatus(value, threshold);
      }
    });
  });

  const newVals = sampleDate.new_leaf || {};
  const oldVals = sampleDate.old_leaf || {};
  const allNutrients = new Set([...Object.keys(newVals), ...Object.keys(oldVals)]);

  allNutrients.forEach(nutrient => {
    const newVal = parseFloat(newVals[nutrient]);
    const oldVal = parseFloat(oldVals[nutrient]);
    result.deltas[nutrient] = computeDelta(
      isNaN(newVal) ? null : newVal,
      isNaN(oldVal) ? null : oldVal
    );

    const newSt = result.per_nutrient_status.new_leaf[nutrient];
    const oldSt = result.per_nutrient_status.old_leaf[nutrient];
    result.leafSignals[nutrient] = getLeafSignal(newSt, oldSt);
  });

  RATIO_DEFS.forEach(def => {
    const newSt = result.per_nutrient_status.new_leaf[def.id];
    const oldSt = result.per_nutrient_status.old_leaf[def.id];
    if (newSt || oldSt) {
      result.leafSignals[def.id] = getLeafSignal(newSt, oldSt);
    }
  });

  result.system_status = buildSystemStatus(result, rules, crop, sampleDate);

  return result;
}

/**
 * Get explanation for a metric/leaf combination
 */
export function getExplanation(evaluation, metricId, leaf, sampleDate) {
  const rules = getRuleset();
  const tissue = leaf === 'new' ? 'new_leaf' : 'old_leaf';
  const status = evaluation.per_nutrient_status[tissue]?.[metricId];
  const signal = evaluation.leafSignals?.[metricId];
  const delta = evaluation.deltas?.[metricId];

  const isRatio = RATIO_DEFS.some(r => r.id === metricId);
  const value = isRatio
    ? evaluation.derived?.[tissue]?.[metricId]
    : parseFloat(sampleDate?.[tissue]?.[metricId]);
  const threshold = isRatio
    ? (rules.getRatioThreshold ? rules.getRatioThreshold(metricId) : null)
    : (rules.getThreshold ? rules.getThreshold('corn', tissue, metricId) : null);

  const newVal = isRatio
    ? evaluation.derived?.new_leaf?.[metricId]
    : parseFloat(sampleDate?.new_leaf?.[metricId]);
  const oldVal = isRatio
    ? evaluation.derived?.old_leaf?.[metricId]
    : parseFloat(sampleDate?.old_leaf?.[metricId]);

  return {
    metricId,
    metricLabel: formatNutrientName(metricId),
    leaf,
    value: isNaN(value) ? null : value,
    values: { new: isNaN(newVal) ? null : newVal, old: isNaN(oldVal) ? null : oldVal },
    status: status || { status: 'Unknown', severity: 0, reason: 'No data' },
    threshold, delta, signal, isRatio,
    rulesetVersion: rules.version || 'v1'
  };
}

/**
 * Get signal explanation for delta/signal display
 */
export function getSignalExplanation(evaluation, metricId, sampleDate) {
  const signal = evaluation.leafSignals?.[metricId];
  const delta = evaluation.deltas?.[metricId];
  const newStatus = evaluation.per_nutrient_status.new_leaf?.[metricId];
  const oldStatus = evaluation.per_nutrient_status.old_leaf?.[metricId];

  const isRatio = RATIO_DEFS.some(r => r.id === metricId);
  const newVal = isRatio
    ? evaluation.derived?.new_leaf?.[metricId]
    : parseFloat(sampleDate?.new_leaf?.[metricId]);
  const oldVal = isRatio
    ? evaluation.derived?.old_leaf?.[metricId]
    : parseFloat(sampleDate?.old_leaf?.[metricId]);

  return {
    metricId,
    metricLabel: formatNutrientName(metricId),
    signal: signal || { signal: '', description: '' },
    delta,
    values: { new: isNaN(newVal) ? null : newVal, old: isNaN(oldVal) ? null : oldVal },
    newStatus, oldStatus,
    interpretation: signal?.description || 'No pattern detected'
  };
}

/**
 * Build system-level status summaries with weighted scoring
 */
function buildSystemStatus(evaluationResult, rules, crop, sampleDate) {
  const sysGroups = rules.systemGroups || {
    N: ['Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4', 'NO3_NH4'],
    CATIONS: ['Potassium', 'Calcium', 'Magnesium', 'K_over_CaMg', 'K_Ca', 'K_Mg', 'Ca_Mg'],
    MICROS: ['Boron', 'Zinc', 'Manganese', 'Copper', 'Iron', 'Molybdenum'],
    SUGARS: ['Brix', 'Sugars', 'EC']
  };

  const systemStatus = {};

  Object.keys(sysGroups).forEach(system => {
    const nutrients = sysGroups[system];
    const issues = [];
    let maxSeverity = 0;
    let agreementCount = 0;

    nutrients.forEach(nutrient => {
      const newSt = evaluationResult.per_nutrient_status.new_leaf?.[nutrient];
      const oldSt = evaluationResult.per_nutrient_status.old_leaf?.[nutrient];

      const isRatio = RATIO_DEFS.some(r => r.id === nutrient);
      const newVal = isRatio
        ? evaluationResult.derived?.new_leaf?.[nutrient]
        : parseFloat(sampleDate?.new_leaf?.[nutrient]);
      const oldVal = isRatio
        ? evaluationResult.derived?.old_leaf?.[nutrient]
        : parseFloat(sampleDate?.old_leaf?.[nutrient]);

      const threshold = isRatio
        ? (rules.getRatioThreshold ? rules.getRatioThreshold(nutrient) : null)
        : (rules.getThreshold ? rules.getThreshold(crop, 'new_leaf', nutrient) : null);

      ['new_leaf', 'old_leaf'].forEach(tissue => {
        const status = evaluationResult.per_nutrient_status[tissue]?.[nutrient];
        if (status && status.status !== 'OK' && status.status !== 'Unknown') {
          const leafLabel = tissue === 'new_leaf' ? 'new' : 'old';
          issues.push({
            id: `${nutrient}_${leafLabel}_${status.direction || 'issue'}`,
            metricId: nutrient, system, leaf: leafLabel,
            status: status.status, severity: status.severity,
            label: `${formatNutrientName(nutrient)} ${status.reason.toLowerCase()} (${leafLabel} leaf)`,
            values: { new: isNaN(newVal) ? null : newVal, old: isNaN(oldVal) ? null : oldVal },
            reason: `${leafLabel === 'new' ? 'New' : 'Old'} leaf ${formatNutrientName(nutrient)} is ${status.reason.toLowerCase()}`,
            direction: status.direction, threshold, isRatio
          });
          maxSeverity = Math.max(maxSeverity, status.severity);
        }
      });

      if (newSt && oldSt && newSt.status !== 'OK' && newSt.status === oldSt.status) {
        agreementCount++;
      }
    });

    let overallStatus = 'OK';
    if (issues.some(i => i.status === 'Action')) overallStatus = 'Action';
    else if (issues.length > 0) overallStatus = 'Watch';

    let confidence = 'Low';
    if (issues.length === 0) confidence = 'High';
    else if (agreementCount > 0 || issues.length >= 2) confidence = 'Med';

    const confidenceMultiplier = confidence === 'High' ? 0 : (confidence === 'Med' ? 1.2 : 1.0);
    const importanceWeight = SYSTEM_IMPORTANCE[system] || 0.5;
    const score = maxSeverity * confidenceMultiplier * importanceWeight;

    let reason = '';
    if (issues.length === 0) {
      reason = 'All values in range';
    } else {
      issues.sort((a, b) => b.severity - a.severity);
      const top = issues[0];
      reason = `${formatNutrientName(top.metricId)} ${top.direction === 'low' ? 'low' : 'high'}`;
      if (issues.length > 1) reason += ` (+${issues.length - 1} more)`;
    }

    systemStatus[system] = { status: overallStatus, reason, confidence, issues, maxSeverity, score };
  });

  return systemStatus;
}

/**
 * Build rows for the comparison table
 */
export function buildTableRows(viewMode, sampleDate, evaluation) {
  const rules = getRuleset();
  const groups = [];

  if (viewMode === 'ratios') {
    const ratioRows = RATIO_DEFS.map(def => ({
      key: def.id,
      label: def.label,
      newVal: evaluation.derived.new_leaf[def.id],
      oldVal: evaluation.derived.old_leaf[def.id],
      newStatus: evaluation.per_nutrient_status.new_leaf[def.id] || { status: 'Unknown' },
      oldStatus: evaluation.per_nutrient_status.old_leaf[def.id] || { status: 'Unknown' },
      delta: computeDelta(evaluation.derived.new_leaf[def.id], evaluation.derived.old_leaf[def.id]),
      leafSignal: evaluation.leafSignals[def.id] || { signal: '' },
      isRatio: true
    })).filter(r => r.newVal !== undefined || r.oldVal !== undefined);

    groups.push({ group: 'ratios', name: 'Calculated Ratios', rows: ratioRows });
  } else {
    const allNuts = new Set([
      ...Object.keys(sampleDate.new_leaf || {}),
      ...Object.keys(sampleDate.old_leaf || {})
    ]);

    const groupDefs = rules.nutrientGroups || {};
    const gNames = rules.groupNames || {};

    Object.keys(groupDefs).forEach(groupKey => {
      const nutrientList = groupDefs[groupKey].filter(n => allNuts.has(n));
      if (nutrientList.length === 0) return;

      const rows = nutrientList.map(nutrient => {
        const newVal = parseFloat(sampleDate.new_leaf?.[nutrient]);
        const oldVal = parseFloat(sampleDate.old_leaf?.[nutrient]);
        return {
          key: nutrient,
          label: formatNutrientName(nutrient),
          newVal: isNaN(newVal) ? null : newVal,
          oldVal: isNaN(oldVal) ? null : oldVal,
          newStatus: evaluation.per_nutrient_status.new_leaf[nutrient] || { status: 'Unknown' },
          oldStatus: evaluation.per_nutrient_status.old_leaf[nutrient] || { status: 'Unknown' },
          delta: evaluation.deltas[nutrient] || { delta: null, deltaPct: null },
          leafSignal: evaluation.leafSignals[nutrient] || { signal: '' },
          isRatio: false
        };
      });

      groups.push({ group: groupKey, name: gNames[groupKey] || groupKey, rows });
    });
  }

  return groups;
}

/**
 * Sort rows by severity (worst first)
 */
export function sortRowsBySeverity(rows) {
  return [...rows].sort((a, b) => {
    const aMax = Math.max(a.newStatus?.severity || 0, a.oldStatus?.severity || 0);
    const bMax = Math.max(b.newStatus?.severity || 0, b.oldStatus?.severity || 0);
    return bMax - aMax;
  });
}

/**
 * Evaluate trend across multiple sample dates
 */
export function evaluateTrend(sampleDates, nutrient, tissue = 'new_leaf') {
  if (!sampleDates || sampleDates.length < 2) {
    return { trend: 'insufficient', change: 0, values: [] };
  }

  const sorted = [...sampleDates].sort((a, b) =>
    new Date(a.sample_date || a.date) - new Date(b.sample_date || b.date)
  );

  const values = sorted.map(s => ({
    date: s.sample_date || s.date,
    value: parseFloat(s[tissue]?.[nutrient])
  })).filter(v => !isNaN(v.value));

  if (values.length < 2) {
    return { trend: 'insufficient', change: 0, values };
  }

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v.value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  values.forEach((v, i) => {
    numerator += (i - xMean) * (v.value - yMean);
    denominator += (i - xMean) ** 2;
  });

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const first = values[0].value;
  const last = values[values.length - 1].value;
  const changePercent = first !== 0 ? ((last - first) / first) * 100 : 0;

  let trend = 'stable';
  if (Math.abs(changePercent) > 10) {
    trend = changePercent > 0 ? 'up' : 'down';
  }

  return { trend, change: changePercent, slope, values };
}

/**
 * Get status color based on status string
 */
export function getStatusColors(status) {
  switch (status) {
    case 'Action':
      return { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5', dot: '#ef4444' };
    case 'Watch':
      return { bg: '#fffbeb', text: '#d97706', border: '#fcd34d', dot: '#f59e0b' };
    case 'OK':
      return { bg: '#f0fdf4', text: '#16a34a', border: '#86efac', dot: '#22c55e' };
    default:
      return { bg: '#f8fafc', text: '#64748b', border: '#cbd5e1', dot: '#94a3b8' };
  }
}

/**
 * Get delta color based on percent change
 */
export function getDeltaColor(deltaPct) {
  if (deltaPct === null || isNaN(deltaPct)) return '#94a3b8';
  if (Math.abs(deltaPct) < 10) return '#64748b';
  if (deltaPct > 50) return '#dc2626';
  if (deltaPct > 20) return '#f59e0b';
  if (deltaPct < -50) return '#3b82f6';
  if (deltaPct < -20) return '#0891b2';
  return deltaPct > 0 ? '#22c55e' : '#06b6d4';
}

/**
 * Format nutrient value for display
 */
export function formatValue(value, nutrient) {
  if (value === null || value === undefined || isNaN(value)) return '\u2014';

  let decimals = 1;
  if (Math.abs(value) < 0.1) decimals = 3;
  else if (Math.abs(value) < 1) decimals = 2;
  else if (Math.abs(value) < 10) decimals = 2;
  else if (Math.abs(value) >= 1000) decimals = 0;

  if (nutrient === 'pH') decimals = 2;
  if (nutrient === 'Brix') decimals = 1;
  if (nutrient === 'EC') decimals = 2;

  return value.toFixed(decimals);
}

/**
 * Format nutrient name for display
 */
export function formatNutrientName(key) {
  const names = {
    'Nitrogen': 'Total N',
    'Nitrogen_NO3': 'NO\u2083-N',
    'Nitrogen_NH4': 'NH\u2084-N',
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
    'N_Conversion_Efficiency': 'N Conv. Eff.',
    'K_Ca': 'K:Ca',
    'K_Mg': 'K:Mg',
    'K_over_CaMg': 'K/(Ca+Mg)',
    'NO3_NH4': 'NO\u2083:NH\u2084',
    'Ca_Mg': 'Ca:Mg',
    'Sugar_K': 'Sugar:K'
  };
  return names[key] || key;
}

/**
 * Group nutrients by category for display
 */
export function groupNutrients(nutrients, ruleset = null) {
  const rules = ruleset || getRuleset();
  const groups = rules.nutrientGroups || {};
  const gNames = rules.groupNames || {};

  const result = [];
  const included = new Set();

  Object.keys(groups).forEach(groupKey => {
    const nutrientList = groups[groupKey];
    const filtered = nutrientList.filter(n => nutrients.hasOwnProperty(n));

    if (filtered.length > 0) {
      result.push({ group: groupKey, name: gNames[groupKey] || groupKey, nutrients: filtered });
      filtered.forEach(n => included.add(n));
    }
  });

  const ungrouped = Object.keys(nutrients).filter(n => !included.has(n));
  if (ungrouped.length > 0) {
    result.push({ group: 'ungrouped', name: 'Other', nutrients: ungrouped });
  }

  return result;
}
