/**
 * Sap Analysis Logic Module
 * Pure functions for computing derived metrics and status evaluation
 *
 * All functions are stateless and depend only on their inputs.
 * Thresholds come from ruleset config, not hardcoded here.
 */

window.SapLogic = (function() {
  'use strict';

  // Default ruleset reference
  const getRuleset = () => window.SapRulesets?.v1 || {};

  /**
   * Compute derived metrics (ratios) from raw sap values
   * @param {Object} values - Object with nutrient keys and values
   * @returns {Object} - Computed ratios
   */
  function computeDerivedMetrics(values) {
    if (!values) return {};

    const metrics = {};
    const get = (key) => {
      const v = values[key];
      return (v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
    };

    // K:Ca ratio
    const K = get('Potassium');
    const Ca = get('Calcium');
    const Mg = get('Magnesium');

    if (K !== null && Ca !== null && Ca > 0) {
      metrics.K_Ca = K / Ca;
    }

    // K:Mg ratio
    if (K !== null && Mg !== null && Mg > 0) {
      metrics.K_Mg = K / Mg;
    }

    // K/(Ca+Mg) ratio - critical cation balance
    if (K !== null && Ca !== null && Mg !== null && (Ca + Mg) > 0) {
      metrics.K_over_CaMg = K / (Ca + Mg);
    }

    // NO3:NH4 ratio
    const NO3 = get('Nitrogen_NO3');
    const NH4 = get('Nitrogen_NH4');
    if (NO3 !== null && NH4 !== null && NH4 > 0) {
      metrics.NO3_NH4 = NO3 / NH4;
    }

    // Sugar:K ratio (indicator of energy vs K uptake)
    const Sugars = get('Sugars');
    if (Sugars !== null && K !== null && K > 0) {
      metrics.Sugar_over_K = Sugars / K;
    }

    // N conversion efficiency (if present in raw data)
    const NCE = get('N_Conversion_Efficiency');
    if (NCE !== null) {
      metrics.N_Conversion_Efficiency = NCE;
    }

    return metrics;
  }

  /**
   * Evaluate status for a single nutrient value
   * @param {number} value - The nutrient value
   * @param {Object} threshold - { low, optimal_low, optimal_high, high }
   * @returns {Object} - { status: 'OK'|'Watch'|'Action', severity: 0-100, reason: string, direction: 'low'|'high'|null }
   */
  function evaluateNutrientStatus(value, threshold) {
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
   * @param {number} newVal - New leaf value
   * @param {number} oldVal - Old leaf value
   * @returns {Object} - { delta, deltaPct, direction }
   */
  function computeDelta(newVal, oldVal) {
    if (newVal === null || oldVal === null || isNaN(newVal) || isNaN(oldVal)) {
      return { delta: null, deltaPct: null, direction: null };
    }

    const delta = newVal - oldVal;
    const deltaPct = oldVal !== 0 ? (delta / oldVal) * 100 : (delta > 0 ? 100 : (delta < 0 ? -100 : 0));
    const direction = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'none');

    return { delta, deltaPct, direction };
  }

  /**
   * Evaluate status for a full sample date (both leaves)
   * @param {Object} sampleDate - { new_leaf: {...}, old_leaf: {...} }
   * @param {Object} context - { crop, growth_stage }
   * @param {Object} ruleset - Optional ruleset override
   * @returns {Object} - { per_nutrient_status, system_status, derived }
   */
  function evaluateStatus(sampleDate, context = {}, ruleset = null) {
    const rules = ruleset || getRuleset();
    const crop = context.crop || 'corn';

    const result = {
      per_nutrient_status: {
        new_leaf: {},
        old_leaf: {}
      },
      deltas: {},
      system_status: {
        N: { status: 'OK', reason: '', confidence: 'Low', issues: [] },
        CATIONS: { status: 'OK', reason: '', confidence: 'Low', issues: [] },
        MICROS: { status: 'OK', reason: '', confidence: 'Low', issues: [] },
        SUGARS: { status: 'OK', reason: '', confidence: 'Low', issues: [] }
      },
      derived: {
        new_leaf: {},
        old_leaf: {}
      }
    };

    // Process each tissue type
    ['new_leaf', 'old_leaf'].forEach(tissue => {
      const values = sampleDate[tissue] || {};
      const tissueKey = tissue === 'new_leaf' ? 'new_leaf' : 'old_leaf';

      // Compute derived metrics
      result.derived[tissue] = computeDerivedMetrics(values);

      // Evaluate each nutrient
      Object.keys(values).forEach(nutrient => {
        const value = parseFloat(values[nutrient]);
        if (isNaN(value)) return;

        const threshold = rules.getThreshold ? rules.getThreshold(crop, tissueKey, nutrient) : null;
        result.per_nutrient_status[tissue][nutrient] = evaluateNutrientStatus(value, threshold);
      });

      // Evaluate derived ratios
      Object.keys(result.derived[tissue]).forEach(ratioName => {
        const value = result.derived[tissue][ratioName];
        const threshold = rules.getRatioThreshold ? rules.getRatioThreshold(ratioName) : null;
        if (threshold) {
          result.per_nutrient_status[tissue][ratioName] = evaluateNutrientStatus(value, threshold);
        }
      });
    });

    // Compute deltas between new and old
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
    });

    // Build system status summaries
    result.system_status = buildSystemStatus(result, rules, crop);

    return result;
  }

  /**
   * Build system-level status summaries
   */
  function buildSystemStatus(evaluationResult, rules, crop) {
    const systemGroups = rules.systemGroups || {
      N: ['Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4'],
      CATIONS: ['Potassium', 'Calcium', 'Magnesium', 'K_over_CaMg'],
      MICROS: ['Boron', 'Zinc', 'Manganese', 'Copper', 'Iron', 'Molybdenum'],
      SUGARS: ['Brix', 'Sugars', 'EC']
    };

    const systemStatus = {};

    Object.keys(systemGroups).forEach(system => {
      const nutrients = systemGroups[system];
      const issues = [];
      let maxSeverity = 0;
      let agreementCount = 0;

      nutrients.forEach(nutrient => {
        // Check both tissues
        ['new_leaf', 'old_leaf'].forEach(tissue => {
          const status = evaluationResult.per_nutrient_status[tissue]?.[nutrient];
          if (status && status.status !== 'OK' && status.status !== 'Unknown') {
            issues.push({
              nutrient,
              tissue,
              status: status.status,
              severity: status.severity,
              reason: status.reason,
              direction: status.direction
            });
            maxSeverity = Math.max(maxSeverity, status.severity);
          }
        });

        // Check if both tissues agree on an issue
        const newStatus = evaluationResult.per_nutrient_status.new_leaf?.[nutrient];
        const oldStatus = evaluationResult.per_nutrient_status.old_leaf?.[nutrient];
        if (newStatus && oldStatus && newStatus.status !== 'OK' && newStatus.status === oldStatus.status) {
          agreementCount++;
        }
      });

      // Determine overall status
      let overallStatus = 'OK';
      if (issues.some(i => i.status === 'Action')) {
        overallStatus = 'Action';
      } else if (issues.length > 0) {
        overallStatus = 'Watch';
      }

      // Determine confidence
      let confidence = 'Low';
      if (issues.length === 0) {
        confidence = 'High';
      } else if (agreementCount > 0 || issues.length >= 2) {
        confidence = 'Med';
      }

      // Build reason text
      let reason = '';
      if (issues.length === 0) {
        reason = 'All values in range';
      } else {
        // Pick top issue by severity
        issues.sort((a, b) => b.severity - a.severity);
        const top = issues[0];
        reason = `${top.nutrient} ${top.reason.toLowerCase()}`;
        if (issues.length > 1) {
          reason += ` (+${issues.length - 1} more)`;
        }
      }

      systemStatus[system] = {
        status: overallStatus,
        reason,
        confidence,
        issues,
        maxSeverity
      };
    });

    return systemStatus;
  }

  /**
   * Evaluate trend across multiple sample dates
   * @param {Array} sampleDates - Array of { date, new_leaf, old_leaf }
   * @param {string} nutrient - Nutrient key to analyze
   * @param {string} tissue - 'new_leaf' or 'old_leaf'
   * @returns {Object} - { trend: 'up'|'down'|'stable', change: number, values: Array }
   */
  function evaluateTrend(sampleDates, nutrient, tissue = 'new_leaf') {
    if (!sampleDates || sampleDates.length < 2) {
      return { trend: 'insufficient', change: 0, values: [] };
    }

    // Sort by date and extract values
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

    // Simple linear regression
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

    // Determine trend direction
    let trend = 'stable';
    if (Math.abs(changePercent) > 10) {
      trend = changePercent > 0 ? 'up' : 'down';
    }

    return { trend, change: changePercent, slope, values };
  }

  /**
   * Get status color based on status string
   * @param {string} status - 'OK', 'Watch', or 'Action'
   * @returns {Object} - { bg, text, border }
   */
  function getStatusColors(status) {
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
   * @param {number} deltaPct - Percent change
   * @returns {string} - CSS color
   */
  function getDeltaColor(deltaPct) {
    if (deltaPct === null || isNaN(deltaPct)) return '#94a3b8';
    if (Math.abs(deltaPct) < 10) return '#64748b';
    if (deltaPct > 50) return '#dc2626'; // Large increase
    if (deltaPct > 20) return '#f59e0b'; // Moderate increase
    if (deltaPct < -50) return '#3b82f6'; // Large decrease
    if (deltaPct < -20) return '#0891b2'; // Moderate decrease
    return deltaPct > 0 ? '#22c55e' : '#06b6d4';
  }

  /**
   * Format nutrient value for display
   * @param {number} value - The value
   * @param {string} nutrient - Nutrient key (for determining decimals)
   * @returns {string} - Formatted string
   */
  function formatValue(value, nutrient) {
    if (value === null || value === undefined || isNaN(value)) return '—';

    // Determine decimal places based on magnitude
    let decimals = 1;
    if (Math.abs(value) < 0.1) decimals = 3;
    else if (Math.abs(value) < 1) decimals = 2;
    else if (Math.abs(value) < 10) decimals = 2;
    else if (Math.abs(value) >= 1000) decimals = 0;

    // Special cases
    if (nutrient === 'pH') decimals = 2;
    if (nutrient === 'Brix') decimals = 1;
    if (nutrient === 'EC') decimals = 2;

    return value.toFixed(decimals);
  }

  /**
   * Group nutrients by category for display
   * @param {Object} nutrients - Object of nutrient values
   * @param {Object} ruleset - Ruleset with groupings
   * @returns {Array} - Array of { group, name, nutrients }
   */
  function groupNutrients(nutrients, ruleset = null) {
    const rules = ruleset || getRuleset();
    const groups = rules.nutrientGroups || {
      nitrogen: ['Nitrogen', 'Nitrogen_NO3', 'Nitrogen_NH4'],
      cations: ['Potassium', 'Calcium', 'Magnesium'],
      phosphorus_sulfur: ['Phosphorus', 'Sulfur'],
      micros: ['Boron', 'Zinc', 'Manganese', 'Copper', 'Iron', 'Molybdenum'],
      other: ['Chloride', 'Sodium', 'Silica', 'Aluminum', 'Cobalt', 'Nickel', 'Selenium'],
      sugars: ['Brix', 'Sugars', 'EC', 'pH']
    };

    const groupNames = rules.groupNames || {
      nitrogen: 'Nitrogen',
      cations: 'Cations',
      phosphorus_sulfur: 'P & S',
      micros: 'Micronutrients',
      other: 'Other',
      sugars: 'Sugars & Energy'
    };

    const result = [];
    const included = new Set();

    Object.keys(groups).forEach(groupKey => {
      const nutrientList = groups[groupKey];
      const filtered = nutrientList.filter(n => nutrients.hasOwnProperty(n));

      if (filtered.length > 0) {
        result.push({
          group: groupKey,
          name: groupNames[groupKey] || groupKey,
          nutrients: filtered
        });
        filtered.forEach(n => included.add(n));
      }
    });

    // Add any ungrouped nutrients
    const ungrouped = Object.keys(nutrients).filter(n => !included.has(n));
    if (ungrouped.length > 0) {
      result.push({
        group: 'ungrouped',
        name: 'Other',
        nutrients: ungrouped
      });
    }

    return result;
  }

  // Public API
  return {
    computeDerivedMetrics,
    evaluateNutrientStatus,
    computeDelta,
    evaluateStatus,
    evaluateTrend,
    getStatusColors,
    getDeltaColor,
    formatValue,
    groupNutrients
  };
})();
