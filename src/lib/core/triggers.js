/**
 * triggers.js - 5-Trigger Framework for nutrient trend analysis
 * Ported from analysis.old.html IIFE
 */

import { getNutrientName } from './config.js';

// ========== Stability Definitions ==========
export function getStabilityFromCV(cv) {
  if (cv < 20) return 'Stable';
  if (cv <= 30) return 'Moderate';
  return 'Volatile';
}

export function getStabilityFromSD(sd) {
  if (sd < 0.20) return 'Stable';
  if (sd <= 0.35) return 'Moderate';
  return 'Volatile';
}

export function getStabilityFromOMCV(cv) {
  if (cv < 10) return 'Stable';
  if (cv <= 20) return 'Moderate';
  return 'Volatile';
}

// ========== Flat Thresholds ==========
const FLAT_THRESHOLDS = {
  pH: 0.03, P: 1.0, K: 5.0, OM: 0.05, Zn: 0.1, S: 1.0,
  B: 0.05, Cu: 0.1, Fe: 2.0, Mn: 2.0, Boron: 0.05,
  Ca_sat: 1.0, Mg_sat: 0.5, K_Sat: 0.2, H_Sat: 1.0,
  CEC: 0.5, P_Zn_Ratio: 1.0
};

export function getTrendDirection(slope, nutrient) {
  const flat = FLAT_THRESHOLDS[nutrient] || 1.0;
  if (slope > flat) return 'Up';
  if (slope < -flat) return 'Down';
  return 'Flat';
}

// ========== 5-Trigger Picker ==========
function pickTrigger(level, stability, trendDir) {
  if (trendDir === 'Flat') return 'FLAT';
  const isVolatile = stability === 'Volatile';
  if (level === 'Low' && !isVolatile) return 'LOW_STABLE';
  if (level === 'Low' && isVolatile) return 'LOW_VOLATILE';
  if (level === 'High' && !isVolatile) return 'HIGH_STABLE';
  return 'HIGH_VOLATILE';
}

// ========== Thresholds ==========
export function getNutrientThresholds(nutrient) {
  const savedSettings = localStorage.getItem('nutrientSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {};
  const s = settings[nutrient] || {};
  const defaults = {
    pH: { critical: 5.5, optimalMin: 6.3, optimalMax: 7.0 },
    P: { critical: 15, optimalMin: 25, optimalMax: 50 },
    K: { critical: 120, optimalMin: 150, optimalMax: 250 },
    OM: { critical: 2.0, optimalMin: 3.0, optimalMax: 5.0 },
    Zn: { critical: 0.5, optimalMin: 1.0, optimalMax: 3.0 },
    S: { critical: 8, optimalMin: 12, optimalMax: 30 },
    Boron: { critical: 0.3, optimalMin: 0.5, optimalMax: 2.0 },
    Cu: { critical: 0.3, optimalMin: 0.5, optimalMax: 2.0 },
    Fe: { critical: 5, optimalMin: 10, optimalMax: 50 },
    Mn: { critical: 5, optimalMin: 10, optimalMax: 50 },
    Ca_sat: { critical: 55, optimalMin: 65, optimalMax: 75 },
    Mg_sat: { critical: 8, optimalMin: 10, optimalMax: 15 },
    K_Sat: { critical: 2.0, optimalMin: 3.0, optimalMax: 5.0 },
    H_Sat: { critical: 15, optimalMin: 0, optimalMax: 10 },
    CEC: { critical: 5, optimalMin: 10, optimalMax: 30 },
  };
  const def = defaults[nutrient] || { critical: 0, optimalMin: 0, optimalMax: 100 };
  return {
    critical: s.critical ?? s.min ?? def.critical,
    optimalMin: s.optimalMin ?? s.min ?? def.optimalMin,
    optimalMax: s.optimalMax ?? s.max ?? def.optimalMax,
  };
}

function getPHThresholds() {
  const base = getNutrientThresholds('pH');
  return { veryLow: base.critical, low: base.optimalMin, optimalMin: base.optimalMin, optimalMax: base.optimalMax, high: base.optimalMax, veryHigh: base.optimalMax + 0.8 };
}

function getPThresholds() {
  const base = getNutrientThresholds('P');
  return { critical: base.critical, belowOpt: base.optimalMin, optHigh: base.optimalMax };
}

function getZnThresholds() {
  const base = getNutrientThresholds('Zn');
  return { low: base.critical, marginal: base.optimalMin, adequate: base.optimalMin };
}

function getRatioThresholds() {
  return { normal: 12, highRisk: 20 };
}

function getPHFlags(pH, calcareous = false) {
  const thresh = getPHThresholds();
  const flags = {
    veryLow: pH < thresh.veryLow, low: pH < thresh.low,
    inOptimal: pH >= thresh.optimalMin && pH <= thresh.optimalMax,
    high: pH > thresh.high, veryHigh: pH >= thresh.veryHigh || calcareous,
    warnings: []
  };
  if (flags.veryLow) flags.warnings.push(`Very low pH (below ${thresh.veryLow}) can restrict roots (Al toxicity risk) and reduce P efficiency.`);
  if (flags.veryHigh) flags.warnings.push(`Very high pH (above ${thresh.veryHigh.toFixed(1)}) reduces Zn availability even when soil Zn is moderate.`);
  return flags;
}

function getConfidence(years, stability) {
  if (years >= 4 && stability === 'Stable') return 'High';
  if (years >= 4 && stability === 'Moderate') return 'Medium';
  if (years === 3) return 'Medium';
  return 'Low';
}

function getDynamicZnTarget(P_ppm) {
  const baseMin = getNutrientThresholds('Zn').optimalMin;
  const ratioTarget = P_ppm / 10;
  return Math.min(Math.max(baseMin, ratioTarget), 5.0);
}

// ========== Interaction Notes ==========
export function collectInteractionNotes(x) {
  const notes = [];
  const phThresh = getPHThresholds();
  const pH_high = x.pH > phThresh.optimalMax;
  const pH_very_high = x.pH >= (phThresh.optimalMax + 0.8) || !!x.calcareous;
  const pH_very_low = x.pH < phThresh.veryLow;
  const P_high = x.P_ppm > getNutrientThresholds('P').optimalMax;
  const znThresh = getZnThresholds();
  const Zn_low = x.Zn_ppm < znThresh.low;
  const Zn_marg = x.Zn_ppm >= znThresh.low && x.Zn_ppm <= znThresh.marginal;
  const ratioThresh = getRatioThresholds();
  const ratio_elev = x.PZn_ratio > ratioThresh.normal;
  const ratio_high = x.PZn_ratio > ratioThresh.highRisk;

  if (pH_high) notes.push({ code: 'PH_HIGH_MICRO_AVAIL', severity: pH_very_high ? 3 : 2, message: 'High pH increases risk of micronutrient limitation (Zn/Fe/Mn availability).' });
  if (pH_very_low) notes.push({ code: 'PH_VERY_LOW_ROOT_P', severity: 3, message: 'Very low pH can restrict roots (Al toxicity risk) and reduce P efficiency.' });
  if (ratio_high && (Zn_low || Zn_marg)) notes.push({ code: 'RATIO_HIGH_ZN_LOW', severity: 3, message: 'High P:Zn ratio with low/marginal Zn = high Zn limitation risk.' });
  else if (ratio_high) notes.push({ code: 'RATIO_HIGH_ZN_OK', severity: 2, message: 'High P:Zn ratio can still signal Zn uptake risk even if soil Zn is adequate.' });
  else if (ratio_elev && (Zn_low || Zn_marg)) notes.push({ code: 'RATIO_ELEV_ZN_LOW', severity: 2, message: 'Elevated P:Zn ratio plus low/marginal Zn increases early-season Zn risk.' });
  if (P_high && ratio_elev) notes.push({ code: 'P_HIGH_RATIO_GUARD', severity: ratio_high ? 2 : 1, message: 'P is above optimal and P:Zn is elevated—avoid additional P inputs.' });
  if (pH_high) notes.push({ code: 'FE_CHLOROSIS_RISK', severity: pH_very_high ? 3 : 2, message: 'High pH increases iron chlorosis risk.' });
  if (typeof x.Fe_ppm === 'number' && x.Fe_ppm < 10 && pH_high) notes.push({ code: 'FE_LOW_SUPPORT', severity: 2, message: 'Low soil Fe + high pH increases Fe limitation risk.' });
  if (pH_high) notes.push({ code: 'MN_DEF_RISK', severity: pH_very_high ? 2 : 1, message: 'High pH increases Mn deficiency risk.' });
  if (pH_very_low) notes.push({ code: 'MN_TOX_RISK', severity: 3, message: 'Very low pH increases risk of Mn toxicity.' });
  if (typeof x.Mn_ppm === 'number' && x.Mn_ppm < 10 && pH_high) notes.push({ code: 'MN_LOW_SUPPORT', severity: 2, message: 'Low soil Mn + high pH increases Mn deficiency risk.' });
  if (typeof x.B_ppm === 'number') {
    if (x.B_ppm < 0.5) notes.push({ code: 'B_LOW', severity: 2, message: 'Soil B is low. Confirm with tissue/symptoms before correcting.' });
    if (x.B_ppm > 2.0) notes.push({ code: 'B_HIGH_TOX', severity: 3, message: 'Soil B is high—boron toxicity risk.' });
    if ((Zn_low || Zn_marg) && x.B_ppm >= 1.0) notes.push({ code: 'ZN_LOW_B_GUARD', severity: 2, message: 'When Zn is low/marginal, plants can be more sensitive to B.' });
  }
  if ((ratio_elev || ratio_high) && (Zn_low || Zn_marg) && (pH_high || pH_very_high)) {
    notes.push({ code: 'STACKED_MICRO_RISK', severity: 3, message: 'Stacked interaction: High pH + elevated ratio + low Zn strongly increases micronutrient limitation risk.' });
  }
  const dynamicZnTarget = getDynamicZnTarget(x.P_ppm || 30);
  if (x.Zn_ppm < dynamicZnTarget && x.P_ppm > 25 && !Zn_low) {
    notes.push({ code: 'ZN_DYNAMIC_TARGET_OVERLAY', severity: 1, message: `Relative to P level, Zn is below balance target (${dynamicZnTarget.toFixed(1)} ppm).` });
  }
  const seen = new Set();
  return notes.filter(n => (seen.has(n.code) ? false : (seen.add(n.code), true)));
}

// Relevance map for interaction notes per card
const CARD_NOTE_RELEVANCE = {
  'pH': ['PH_HIGH_MICRO_AVAIL', 'PH_VERY_LOW_ROOT_P', 'FE_CHLOROSIS_RISK', 'MN_DEF_RISK', 'MN_TOX_RISK', 'STACKED_MICRO_RISK'],
  'P': ['PH_VERY_LOW_ROOT_P', 'RATIO_HIGH_ZN_LOW', 'RATIO_HIGH_ZN_OK', 'RATIO_ELEV_ZN_LOW', 'P_HIGH_RATIO_GUARD'],
  'Zn': ['PH_HIGH_MICRO_AVAIL', 'RATIO_HIGH_ZN_LOW', 'RATIO_HIGH_ZN_OK', 'RATIO_ELEV_ZN_LOW', 'P_HIGH_RATIO_GUARD', 'ZN_DYNAMIC_TARGET_OVERLAY', 'ZN_LOW_B_GUARD', 'STACKED_MICRO_RISK'],
  'P_Zn_Ratio': ['RATIO_HIGH_ZN_LOW', 'RATIO_HIGH_ZN_OK', 'RATIO_ELEV_ZN_LOW', 'P_HIGH_RATIO_GUARD', 'STACKED_MICRO_RISK'],
  'Fe': ['PH_HIGH_MICRO_AVAIL', 'FE_CHLOROSIS_RISK', 'FE_LOW_SUPPORT', 'STACKED_MICRO_RISK'],
  'Mn': ['PH_HIGH_MICRO_AVAIL', 'MN_DEF_RISK', 'MN_TOX_RISK', 'MN_LOW_SUPPORT', 'STACKED_MICRO_RISK'],
  'Boron': ['B_LOW', 'B_HIGH_TOX', 'ZN_LOW_B_GUARD'],
};

export function getRelevantNotes(cardKey, notes) {
  const codes = CARD_NOTE_RELEVANCE[cardKey] || [];
  return notes.filter(n => codes.includes(n.code));
}

// ========== Card Builders ==========

export function buildPHCard(inputs) {
  const { pH, pH_sd, pH_slope, calcareous, years } = inputs;
  const thresh = getPHThresholds();
  const stab = getStabilityFromSD(pH_sd || 0.25);
  const tdir = getTrendDirection(pH_slope || 0, 'pH');
  const flags = getPHFlags(pH, calcareous);
  const conf = getConfidence(years || 1, stab);
  let level = pH < thresh.optimalMin ? 'Low' : (pH > thresh.optimalMax ? 'High' : 'Optimal');
  const trig = level === 'Optimal' ? 'OPTIMAL' : pickTrigger(level, stab, tdir);
  let badge = 'On Track', background = 'green', insight = 'pH is in the target range. Maintain current management.', tips = [], warnings = [...flags.warnings];

  if (level === 'Optimal') {
    if (stab === 'Volatile') { badge = 'Watch'; background = 'yellow'; insight = 'pH is in range but variable across the field. Consider zone management.'; tips = ['Zone-sample and consider variable-rate lime.', 'Confirm consistent sampling depth and timing.']; }
    else if (tdir === 'Down' && pH < thresh.optimalMin + 0.3) { badge = 'Watch'; background = 'yellow'; insight = 'pH is in range but trending down toward the lower limit.'; tips = ['Plan lime application before pH drops below optimal.']; }
  } else if (level === 'Low') {
    if (trig === 'LOW_STABLE') { badge = 'Action Needed'; background = 'red'; insight = 'Soil pH is consistently low. Nutrient efficiency and root performance are limited.'; tips = ['Apply lime to move pH toward target range.', 'If P is low, band P and correct acidity.', 'Prioritize lowest pH zones first.']; }
    else if (trig === 'LOW_VOLATILE') { badge = 'Watch'; background = 'yellow'; insight = 'pH is low but highly variable. Uniform correction may be inefficient.'; tips = ['Zone/grid sample before liming.', 'Consider variable-rate lime.']; }
    else if (trig === 'FLAT') { badge = 'Watch'; background = 'orange'; insight = 'pH is low and holding steady. Plan gradual correction.'; tips = ['Plan lime application.', 'Recheck pH after correction window.']; }
  } else if (level === 'High') {
    if (trig === 'HIGH_STABLE') { badge = 'Watch'; background = 'orange'; insight = 'Soil pH is consistently high. Micronutrient availability (Zn, Fe, Mn) can be limited.'; tips = ['Use starter/banded micronutrients when risk is confirmed.', 'Use tissue tests to confirm availability issues.', 'Maintain/build organic matter.']; }
    else if (trig === 'HIGH_VOLATILE') { badge = 'Watch'; background = 'yellow'; insight = 'pH is high and variable. Manage risk by zones.'; tips = ['Zone manage micronutrient risk.', 'Target highest pH areas first.']; }
    else if (trig === 'FLAT') { badge = 'Watch'; background = 'neutral'; insight = 'pH is high and holding steady. Focus on micronutrient management.'; tips = ['Monitor Zn/Fe/Mn with tissue tests.', 'Use placement strategies for Zn.']; }
  }
  if (tdir === 'Up' && level !== 'Low') warnings.push('pH is trending upward.');
  if (tdir === 'Down' && level !== 'High') warnings.push('pH is trending downward.');
  return { key: 'pH', badge, background, insight, tips, warnings, show: { value: pH, stability: stab, trend: tdir, confidence: conf, optimalRange: `${thresh.optimalMin} - ${thresh.optimalMax}` } };
}

export function buildPCard(inputs) {
  const { P_ppm, P_cv, P_slope, pH, Zn_ppm, PZn_ratio, years } = inputs;
  const thresh = getPThresholds();
  const stab = getStabilityFromCV(P_cv || 20);
  const tdir = getTrendDirection(P_slope || 0, 'P');
  const flags = getPHFlags(pH || 6.5);
  const conf = getConfidence(years || 1, stab);
  const P_critical = P_ppm < thresh.critical;
  const P_below = P_ppm >= thresh.critical && P_ppm < thresh.belowOpt;
  const P_opt = P_ppm >= thresh.belowOpt && P_ppm <= thresh.optHigh;
  const P_above = P_ppm > thresh.optHigh;
  const level = (P_critical || P_below) ? 'Low' : (P_above ? 'High' : 'Optimal');
  const trig = level === 'Optimal' ? 'OPTIMAL' : pickTrigger(level, stab, tdir);
  let badge = 'On Track', background = 'green', insight = 'Phosphorus is in the optimal range.', tips = [], warnings = [];

  if (P_critical) {
    badge = 'Action Needed'; background = 'red'; insight = 'Phosphorus is critically low. Yield potential is likely limited.';
    tips = ['Apply P (banding is most efficient).', 'If pH is low, correct acidity to improve P efficiency.', 'If Zn is low/marginal or P:Zn ratio is elevated, include Zn in starter/band.'];
    warnings.push(...flags.warnings);
  } else if (P_below) {
    if (trig === 'LOW_STABLE' || (tdir === 'Down' && stab !== 'Volatile')) {
      badge = 'Action Needed'; background = 'pink'; insight = 'P is below optimal and declining reliably.';
      tips = ['Apply P at build rates until target range is reached.', 'Band P for efficiency.', 'If Zn is low/marginal or P:Zn > 12, include Zn.'];
      if (tdir === 'Down' && P_slope) { const ytc = Math.abs((P_ppm - thresh.critical) / P_slope); if (ytc <= 15) warnings.push(`At current rate, will reach critical in ~${Math.round(ytc)} years.`); }
    } else if (trig === 'LOW_VOLATILE') { badge = 'Watch'; background = 'yellow'; insight = 'P is below optimal, but variability is high.'; tips = ['Zone/grid sample to confirm.', 'Consider VR P.']; }
    else if (tdir === 'Up') { badge = 'On Track'; background = 'green'; insight = 'P is below optimal but improving.'; }
    else if (trig === 'FLAT') { badge = 'Watch'; background = 'neutral'; insight = 'P is below optimal and holding steady.'; tips = ['Consider modest build rates.', 'Recheck next sampling cycle.']; }
    warnings.push(...flags.warnings);
  } else if (P_opt) {
    if (tdir === 'Down' && P_ppm < thresh.belowOpt + 3) warnings.push('P is trending down toward the bottom of optimal.');
  } else if (P_above) {
    insight = 'Phosphorus is above optimal. Additional P is not needed.';
    if (tdir === 'Up') warnings.push('P is increasing further above optimal.');
  }
  const ratioThresh = getRatioThresholds();
  const znThresh = getZnThresholds();
  if (PZn_ratio && PZn_ratio > ratioThresh.normal && (Zn_ppm <= znThresh.marginal || flags.high || flags.veryHigh)) {
    warnings.push('P:Zn balance suggests increased Zn limitation risk.');
  }
  return { key: 'P', badge, background, insight, tips, warnings, show: { value: P_ppm, stability: stab, trend: tdir, confidence: conf } };
}

export function buildZnCard(inputs) {
  const { Zn_ppm, Zn_cv, Zn_slope, P_ppm, PZn_ratio, pH, years } = inputs;
  const thresh = getZnThresholds();
  const stab = getStabilityFromCV(Zn_cv || 25);
  const tdir = getTrendDirection(Zn_slope || 0, 'Zn');
  const flags = getPHFlags(pH || 6.5);
  const conf = getConfidence(years || 1, stab);
  const dynamicTarget = getDynamicZnTarget(P_ppm || 30);
  const Zn_low = Zn_ppm < thresh.low;
  const Zn_marginal = Zn_ppm >= thresh.low && Zn_ppm < dynamicTarget;
  const Zn_adequate = Zn_ppm >= dynamicTarget;
  const level = Zn_adequate ? 'High' : 'Low';
  const trig = pickTrigger(level, stab, tdir);
  const ratioThresh = getRatioThresholds();
  const ratioElev = PZn_ratio && PZn_ratio > ratioThresh.normal;
  const ratioHigh = PZn_ratio && PZn_ratio > ratioThresh.highRisk;
  let badge = 'On Track', background = 'green', insight = 'Zinc is sufficient.', tips = [], warnings = [];

  if (Zn_low) {
    badge = 'Action Needed'; background = 'red'; insight = 'Zinc is deficient. Yield risk is likely, especially in corn.';
    tips = ['Apply Zn with placement (starter/band).', 'Use foliar Zn for in-season rescue if confirmed.', 'Build long-term with small annual additions.'];
  } else if (Zn_marginal) {
    badge = 'Watch'; background = 'yellow'; insight = `Zinc is marginal (target: ${dynamicTarget.toFixed(1)} ppm based on P level).`;
    tips = ['Consider starter/banded Zn in corn.', 'Use tissue tests to confirm.'];
  }
  if (trig === 'LOW_VOLATILE') { badge = Zn_low ? 'Action Needed' : 'Watch'; background = Zn_low ? 'pink' : 'yellow'; warnings.push('Zn is spatially variable—consider zone/VR application.'); }
  if (trig === 'HIGH_VOLATILE') { badge = 'Watch'; background = 'neutral'; warnings.push('Zn is adequate but variable—target low zones.'); }
  if (trig === 'FLAT' && (Zn_low || Zn_marginal)) warnings.push('Zn is holding steady at a low level.');
  if (tdir === 'Down') warnings.push('Zn is declining.');
  if (tdir === 'Up' && !Zn_adequate) warnings.push('Zn is improving toward sufficiency.');
  if (flags.high || flags.veryHigh) warnings.push('High pH can limit Zn availability.');
  if (ratioElev) warnings.push(`P:Zn ratio is elevated (${PZn_ratio.toFixed(0)}:1).`);
  if (ratioHigh && (Zn_low || Zn_marginal || flags.high)) {
    tips = ['Prioritize starter/banded Zn.', 'Use tissue tests; foliar only when confirmed.', 'Avoid additional P if above optimal.'];
  }
  return { key: 'Zn', badge, background, insight, tips, warnings, show: { value: Zn_ppm, stability: stab, trend: tdir, confidence: conf } };
}

export function buildRatioCard(inputs) {
  const { P_ppm, Zn_ppm, PZn_ratio, ratio_cv, ratio_slope, pH, years } = inputs;
  const thresh = getRatioThresholds();
  const stab = getStabilityFromCV(ratio_cv || 25);
  const tdir = getTrendDirection(ratio_slope || 0, 'P_Zn_Ratio');
  const flags = getPHFlags(pH || 6.5);
  const conf = getConfidence(years || 1, stab);
  const normal = PZn_ratio <= thresh.normal;
  const elevated = PZn_ratio > thresh.normal && PZn_ratio <= thresh.highRisk;
  const high = PZn_ratio > thresh.highRisk;
  const level = normal ? 'Low' : 'High';
  const trig = pickTrigger(level, stab, tdir);
  let badge = 'On Track', background = 'green', insight = 'P:Zn ratio is balanced.', tips = [], warnings = [];

  if (elevated) { badge = 'Watch'; background = 'yellow'; insight = 'P:Zn ratio is elevated. Zn limitation risk increases.'; tips = ['If Zn is marginal/low, prioritize starter/banded Zn.', 'Monitor with tissue tests.']; }
  else if (high) { badge = 'Action Needed'; background = 'red'; insight = 'High P:Zn ratio indicates high risk of Zn limitation.'; tips = ['If Zn is low/marginal, treat with starter/banded Zn.', 'If P is above optimal, avoid additional P inputs.', 'If pH is high, expect stronger micronutrient limits.']; }
  if (trig === 'HIGH_VOLATILE') { badge = 'Watch'; background = 'orange'; warnings.push('Ratio is spatially variable—confirm zones.'); }
  if (trig === 'FLAT' && !normal) warnings.push('Ratio has remained consistently elevated.');
  if (tdir === 'Up' && !normal) warnings.push('Ratio is increasing.');
  if (tdir === 'Down' && !normal) warnings.push('Ratio is improving but remains above balanced range.');
  if (flags.veryHigh) warnings.push('Very high pH amplifies Zn/Fe/Mn limitations.');
  return { key: 'P_Zn_Ratio', badge, background, insight, tips, warnings, show: { value: PZn_ratio, stability: stab, trend: tdir, confidence: conf } };
}

export function buildOMCard(inputs) {
  const { value, cv, slope, years } = inputs;
  const thresh = getNutrientThresholds('OM');
  const stab = getStabilityFromOMCV(cv || 10);
  const tdir = getTrendDirection(slope || 0, 'OM');
  const conf = getConfidence(years || 1, stab);
  const OM_critical = value < thresh.critical;
  const OM_low = value >= thresh.critical && value < thresh.optimalMin;
  const level = (OM_critical || OM_low) ? 'Low' : 'Optimal';
  const trig = level === 'Optimal' ? 'OPTIMAL' : pickTrigger(level, stab, tdir);
  let badge = 'On Track', background = 'green', insight = 'Organic matter is in a healthy range.', tips = ['Continue cover crop and residue management.'], warnings = [];
  const omNote = 'OM changes slowly. Treat trends as multi-year signals.';

  if (OM_critical) {
    badge = 'Action Needed'; background = 'red'; insight = 'Organic matter is critically low.';
    tips = ['Add high-biomass cover crops.', 'Reduce tillage intensity.', 'Apply manure or compost to lowest OM zones.'];
    warnings.push(omNote);
  } else if (OM_low) {
    if (trig === 'LOW_STABLE' || (tdir === 'Down' && stab !== 'Volatile')) {
      badge = 'Action Needed'; background = 'pink'; insight = 'OM is consistently below optimal.';
      tips = ['Add high-biomass cover crops.', 'Reduce tillage intensity.', 'Apply manure/compost.', 'Extend living roots.'];
      if (tdir === 'Down' && slope) warnings.push(`OM is declining at ${Math.abs(slope).toFixed(2)}%/yr.`);
    } else if (trig === 'LOW_VOLATILE') { badge = 'Watch'; background = 'yellow'; insight = 'OM is below optimal but variable.'; tips = ['Zone-sample to identify low-OM areas.', 'Ensure consistent sampling depth.']; }
    else if (tdir === 'Up') { badge = 'On Track'; background = 'green'; insight = 'OM is below optimal but improving.'; tips = ['Continue cover crop practices.', 'Monitor trend over multiple years.']; }
    else if (trig === 'FLAT') { badge = 'Watch'; background = 'neutral'; insight = 'OM is below optimal and holding steady.'; tips = ['Increase carbon inputs: diversify cover crops.', 'Reduce tillage if feasible.', 'Consider manure/compost.']; }
    warnings.push(omNote);
  } else {
    if (tdir === 'Down' && value < thresh.optimalMin + 0.3) warnings.push('OM is trending down toward the bottom of optimal.');
    warnings.push(omNote);
  }
  return { key: 'OM', badge, background, insight, tips, warnings, show: { value, stability: stab, trend: tdir, confidence: conf } };
}

export function buildGenericNutrientCard(nutrient, inputs) {
  const { value, cv, slope, years } = inputs;
  const thresh = getNutrientThresholds(nutrient);
  const stab = nutrient === 'OM' ? getStabilityFromOMCV(cv || 10) : getStabilityFromCV(cv || 20);
  const tdir = getTrendDirection(slope || 0, nutrient);
  const conf = getConfidence(years || 1, stab);
  const lowerIsBetter = ['H_Sat'].includes(nutrient);
  const name = getNutrientName(nutrient);
  let level;
  if (lowerIsBetter) { level = value > thresh.critical ? 'High' : (value > thresh.optimalMax ? 'Elevated' : 'Optimal'); }
  else { level = value < thresh.critical ? 'Critical' : (value < thresh.optimalMin ? 'Low' : (value > thresh.optimalMax ? 'High' : 'Optimal')); }
  const trig = (level === 'Optimal' || level === 'Elevated') ? 'OPTIMAL' : pickTrigger(level === 'Critical' ? 'Low' : level, stab, tdir);
  let badge = 'On Track', background = 'green', insight = `${name} is in a good range.`, tips = [], warnings = [];

  if (level === 'Critical') { badge = 'Action Needed'; background = 'red'; insight = `${name} is critically low.`; tips = [`Apply ${nutrient} to build levels.`]; }
  else if (level === 'Low') {
    if (trig === 'LOW_STABLE') { badge = 'Action Needed'; background = 'pink'; insight = `${name} is below optimal and declining.`; tips = [`Consider building ${nutrient} levels.`]; }
    else if (trig === 'LOW_VOLATILE') { badge = 'Watch'; background = 'yellow'; insight = `${name} is below optimal but variable.`; tips = ['Zone-sample to confirm.']; }
    else if (tdir === 'Up') { badge = 'On Track'; background = 'green'; insight = `${name} is below optimal but improving.`; }
    else { badge = 'Watch'; background = 'neutral'; insight = `${name} is below optimal and holding steady.`; }
  } else if (level === 'High' && lowerIsBetter) { badge = 'Watch'; background = 'orange'; insight = `${name} is elevated.`; if (nutrient === 'H_Sat') tips = ['High H saturation indicates acidity—consider lime.']; }
  else if (level === 'High') { badge = 'Watch'; background = 'neutral'; insight = `${name} is above optimal.`; if (tdir === 'Up') warnings.push(`${nutrient} is increasing further above optimal.`); }
  return { key: nutrient, badge, background, insight, tips, warnings, show: { value, stability: stab, trend: tdir, confidence: conf } };
}

// ========== Build card for any nutrient ==========
export function buildTriggerCard(attr, { lastAvg, stabilityValue, slope, years, currentPH, currentP, currentZn, currentPZnRatio }) {
  const skipTrend = attr === 'BpH' || attr === 'CEC';
  if (skipTrend || years < 2) return null;

  if (attr === 'pH') return buildPHCard({ pH: lastAvg, pH_sd: stabilityValue, pH_slope: slope, calcareous: false, years });
  if (attr === 'P') return buildPCard({ P_ppm: lastAvg, P_cv: stabilityValue, P_slope: slope, pH: currentPH, Zn_ppm: currentZn, PZn_ratio: currentPZnRatio, years });
  if (attr === 'Zn') return buildZnCard({ Zn_ppm: lastAvg, Zn_cv: stabilityValue, Zn_slope: slope, P_ppm: currentP, PZn_ratio: currentPZnRatio, pH: currentPH, years });
  if (attr === 'P_Zn_Ratio') return buildRatioCard({ P_ppm: currentP, Zn_ppm: currentZn, PZn_ratio: lastAvg, ratio_cv: stabilityValue, ratio_slope: slope, pH: currentPH, years });
  if (attr === 'OM') return buildOMCard({ value: lastAvg, cv: stabilityValue, slope, years });
  return buildGenericNutrientCard(attr, { value: lastAvg, cv: stabilityValue, slope, years });
}

// ========== CV Explanations ==========
export function getNutrientCVExplanation(nutrient, cvValue) {
  const cv = cvValue ? cvValue.toFixed(0) : '?';

  const micronutrients = ['Zn', 'B', 'Cu', 'Fe', 'Mn', 'Boron'];
  if (micronutrients.includes(nutrient)) {
    const isFeMn = ['Fe', 'Mn'].includes(nutrient);
    return {
      title: `High variability detected (CV = ${cv}%)`,
      explanation: isFeMn
        ? `${nutrient} tests are sensitive to soil moisture and redox conditions at sampling. Wet vs dry sampling can cause large swings.`
        : 'This micronutrient commonly shows high variability due to low concentrations, strong pH effects, and localized soil chemistry. Small absolute differences can produce large CV values.',
      drivers: isFeMn
        ? ['Soil moisture at sampling', 'Redox conditions', 'pH zone differences', 'Organic matter distribution']
        : ['pH changes between zones', 'Organic matter differences', 'Manure or banded fertilizer history', 'Lab extraction sensitivity'],
      suggestion: isFeMn
        ? `Use ${nutrient} trends as contextual indicators, not standalone decision drivers.`
        : 'High CV is common for this nutrient. Interpret trends cautiously and confirm with consistent sampling or tissue tests.'
    };
  }

  if (nutrient === 'P') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'High variability in P is often linked to placement history (banded fertilizer or manure) and sampling path differences.',
    drivers: ['Banded P vs broadcast', 'Manure application patterns', 'Sampling depth inconsistency', 'Soil pH effects on availability'],
    suggestion: 'If P has been banded or manure-applied, consider zone or grid sampling to better capture true distribution.'
  };

  if (nutrient === 'K') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'Potassium variability often reflects soil texture differences and moisture conditions at sampling.',
    drivers: ['Clay vs sand zones', 'Soil moisture at sampling', 'Cation exchange differences', 'Crop removal patterns'],
    suggestion: 'Resample at similar moisture conditions and consider texture-based zones.'
  };

  if (nutrient === 'pH') return {
    title: `High variability detected (SD = ${cvValue ? cvValue.toFixed(2) : '?'})`,
    explanation: 'pH is typically stable across a field. High variability often indicates real spatial differences rather than noise.',
    drivers: ['Past lime application patterns', 'Soil type boundaries', 'Topography and erosion', 'Variable rate lime history'],
    suggestion: 'High pH variability is a strong signal for zone-based management.'
  };

  if (nutrient === 'OM') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'Organic matter normally changes slowly. High variability usually reflects soil type, erosion, or sampling depth differences.',
    drivers: ['Topsoil depth differences', 'Erosion and deposition zones', 'Sampling depth inconsistency', 'Different lab methods between years'],
    suggestion: 'Manage OM by landscape position rather than uniform field averages. Keep sampling depth and lab consistent.'
  };

  if (nutrient === 'CEC') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'CEC reflects soil texture and organic matter. High variability often indicates real soil type differences across the field.',
    drivers: ['Soil texture changes', 'Organic matter differences', 'Erosion patterns', 'Sampling depth variation'],
    suggestion: 'CEC variability often mirrors soil type boundaries. Consider texture-based management zones.'
  };

  if (['Ca_sat', 'Mg_sat', 'K_sat', 'H_sat'].includes(nutrient)) return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'Base saturation variability usually reflects CEC differences and liming history across the field.',
    drivers: ['Soil texture zones', 'Variable lime applications', 'CEC differences', 'pH management history'],
    suggestion: 'Consider whether CEC varies similarly. Zone-based management may be warranted.'
  };

  if (nutrient === 'S') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'Sulfur is mobile in soil and can vary significantly with drainage, organic matter, and recent rainfall.',
    drivers: ['Drainage patterns', 'Organic matter distribution', 'Recent rainfall/leaching', 'Atmospheric deposition patterns'],
    suggestion: 'Sulfur tests are best interpreted alongside organic matter and drainage conditions.'
  };

  if (nutrient === 'P_Zn_Ratio') return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'P:Zn ratio variability often amplifies the variability of both P and Zn measurements.',
    drivers: ['P placement history', 'Zn micronutrient variability', 'pH zone differences', 'Combined measurement noise'],
    suggestion: 'Review P and Zn trends individually. If both are stable, ratio variability may be less concerning.'
  };

  return {
    title: `High variability detected (CV = ${cv}%)`,
    explanation: 'Field averages are inconsistent across samples. When variability is high, trends may reflect sampling or spatial effects rather than true nutrient change.',
    drivers: ['Sampling path changed between years', 'Inconsistent sampling depth', 'Different soil moisture at sampling', 'Lab or test method changes'],
    suggestion: 'When variability is high, confirm trends with consistent sampling methodology before making major adjustments.'
  };
}

// ========== Badge colors ==========
export const BADGE_COLORS = {
  green: { color: '#16a34a', bg: '#dcfce7', border: '#22c55e' },
  red: { color: '#dc2626', bg: '#fee2e2', border: '#ef4444' },
  pink: { color: '#db2777', bg: '#fce7f3', border: '#ec4899' },
  yellow: { color: '#ca8a04', bg: '#fef9c3', border: '#f59e0b' },
  orange: { color: '#ea580c', bg: '#ffedd5', border: '#f97316' },
  neutral: { color: '#64748b', bg: '#f1f5f9', border: '#94a3b8' },
};

export const CARD_GRADIENTS = {
  green: 'from-green-50 to-emerald-50 border-green-400',
  red: 'from-red-50 to-rose-50 border-red-400',
  pink: 'from-pink-50 to-rose-50 border-pink-400',
  yellow: 'from-yellow-50 to-amber-50 border-amber-400',
  orange: 'from-orange-50 to-amber-50 border-orange-400',
  neutral: 'from-slate-50 to-gray-50 border-slate-300',
};
