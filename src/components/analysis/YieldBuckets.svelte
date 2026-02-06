<script>
  import { samples } from '$lib/stores/samples.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit, LOWER_IS_BETTER } from '$lib/core/config.js';

  let selectedField = '';
  let selectedCropYear = '';
  let selectedCropType = '';

  // Nutrient keys for bucketing (skip sampleId and ratios)
  const nutrientKeys = ALL_NUTRIENTS.filter(n =>
    n.key !== 'sampleId' && n.key !== 'P_Zn_Ratio'
  ).map(n => n.key);

  // Hardcoded threshold defaults for bucketing
  const THRESHOLDS = {
    pH: { low: 6.0, high: 7.0 },
    P: { low: 15, high: 30 },
    K: { low: 120, high: 180 },
    OM: { low: 2.5, high: 4.0 },
    Ca_sat: { low: 60, high: 70 },
    Mg_sat: { low: 10, high: 15 },
    K_Sat: { low: 2.5, high: 4.0 },
    CEC: { low: 10, high: 20 },
    Zn: { low: 1.0, high: 3.0 },
    S: { low: 8, high: 15 }
  };

  // Crop-specific outlier thresholds
  const CROP_OUTLIER_LIMITS = {
    corn: { min: 50, max: 350 },
    soybeans: { min: 20, max: 100 },
    wheat: { min: 10, max: 500 },
    amylose: { min: 10, max: 500 }
  };
  const DEFAULT_OUTLIER = { min: 10, max: 500 };

  // Get samples that have yield correlation data
  $: yieldSamples = $samples.filter(s =>
    s.yieldCorrelations && Object.keys(s.yieldCorrelations).length > 0
  );

  $: hasYieldData = yieldSamples.length > 0;

  // Extract unique fields from yield samples
  $: availableFields = [...new Set(
    yieldSamples.map(s => s.field).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Extract unique crop years from yield correlations
  $: availableCropYears = [...new Set(
    yieldSamples.flatMap(s => Object.keys(s.yieldCorrelations))
  )].sort((a, b) => b.localeCompare(a));

  // Extract unique crop types from yield correlations
  $: availableCropTypes = [...new Set(
    yieldSamples.flatMap(s =>
      Object.values(s.yieldCorrelations)
        .map(yc => yc.crop)
        .filter(Boolean)
    )
  )].sort();

  // Build flattened sample-yield pairs with filters applied
  $: filteredPairs = buildFilteredPairs(yieldSamples, selectedField, selectedCropYear, selectedCropType);

  function buildFilteredPairs(sampleList, field, cropYear, cropType) {
    const pairs = [];
    const limits = cropType ? (CROP_OUTLIER_LIMITS[cropType] || DEFAULT_OUTLIER) : DEFAULT_OUTLIER;

    sampleList.forEach(s => {
      // Field filter
      if (field && s.field !== field) return;

      Object.entries(s.yieldCorrelations).forEach(([yr, yc]) => {
        // Crop year filter
        if (cropYear && yr !== cropYear) return;
        // Crop type filter
        if (cropType && yc.crop !== cropType) return;

        const yieldVal = yc.yield || yc.avgYield;
        if (!yieldVal || yieldVal <= 0) return;

        // Outlier filtering
        if (yieldVal < limits.min || yieldVal > limits.max) return;

        pairs.push({ sample: s, yield: yieldVal, year: yr, crop: yc.crop });
      });
    });

    return pairs;
  }

  // Bucket a value into low/medium/high for a given nutrient
  function getBucket(nutrient, value) {
    const thresh = THRESHOLDS[nutrient];
    if (!thresh) return null; // No thresholds defined for this nutrient

    if (LOWER_IS_BETTER.includes(nutrient)) {
      // Inverted: low value = "high" quality, high value = "low" quality
      if (value <= thresh.low) return 'high';
      if (value >= thresh.high) return 'low';
      return 'medium';
    } else {
      if (value < thresh.low) return 'low';
      if (value > thresh.high) return 'high';
      return 'medium';
    }
  }

  // Compute bucket analysis for all nutrients with thresholds
  $: bucketResults = computeBucketResults(filteredPairs);

  function computeBucketResults(pairs) {
    const results = [];

    for (const nutrient of nutrientKeys) {
      if (!THRESHOLDS[nutrient]) continue;

      const buckets = { low: [], medium: [], high: [] };

      pairs.forEach(({ sample, yield: yieldVal }) => {
        const val = parseFloat(sample[nutrient]);
        if (isNaN(val)) return;

        const bucket = getBucket(nutrient, val);
        if (bucket) {
          buckets[bucket].push(yieldVal);
        }
      });

      const totalPoints = buckets.low.length + buckets.medium.length + buckets.high.length;
      if (totalPoints < 10) continue;

      const avg = arr => arr.length > 0
        ? arr.reduce((a, b) => a + b, 0) / arr.length
        : null;

      const lowAvg = avg(buckets.low);
      const medAvg = avg(buckets.medium);
      const highAvg = avg(buckets.high);

      const impact = (highAvg !== null && lowAvg !== null) ? highAvg - lowAvg : null;

      results.push({
        nutrient,
        label: getNutrientName(nutrient),
        unit: getNutrientUnit(nutrient),
        low: { avg: lowAvg, count: buckets.low.length },
        medium: { avg: medAvg, count: buckets.medium.length },
        high: { avg: highAvg, count: buckets.high.length },
        impact,
        totalPoints,
        threshold: THRESHOLDS[nutrient]
      });
    }

    // Sort by absolute yield impact, biggest first
    results.sort((a, b) => {
      const aImpact = a.impact !== null ? Math.abs(a.impact) : 0;
      const bImpact = b.impact !== null ? Math.abs(b.impact) : 0;
      return bImpact - aImpact;
    });

    return results;
  }

  $: nutrientsAnalyzed = bucketResults.length;

  function formatYield(val) {
    if (val === null || val === undefined) return '\u2014';
    return val.toFixed(1);
  }

  function formatImpact(val) {
    if (val === null || val === undefined) return '\u2014';
    return (val >= 0 ? '+' : '') + val.toFixed(1);
  }

  function getImpactColor(val) {
    if (val === null || val === undefined) return 'text-slate-400';
    if (val > 0) return 'text-green-600 font-semibold';
    if (val < 0) return 'text-red-600 font-semibold';
    return 'text-slate-500';
  }

  function getThresholdLabel(nutrient) {
    const thresh = THRESHOLDS[nutrient];
    if (!thresh) return '';
    const unit = getNutrientUnit(nutrient);
    const unitStr = unit ? unit : '';

    if (LOWER_IS_BETTER.includes(nutrient)) {
      return `Low: >${thresh.high}${unitStr}, Med: ${thresh.low}-${thresh.high}${unitStr}, High: <${thresh.low}${unitStr}`;
    }
    return `Low: <${thresh.low}${unitStr}, Med: ${thresh.low}-${thresh.high}${unitStr}, High: >${thresh.high}${unitStr}`;
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
  <!-- Header with amber accent -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div class="border-l-4 border-amber-400 pl-3">
      <h3 class="text-base font-bold text-slate-800">Yield by Nutrient Level</h3>
      <p class="text-xs text-slate-400 mt-0.5">
        Average yield for Low / Medium / High nutrient buckets
      </p>
    </div>
  </div>

  {#if !hasYieldData}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <span class="text-4xl mb-3">{'\uD83C\uDF3E'}</span>
      <p class="text-lg font-medium text-slate-600">No yield data available</p>
      <p class="text-sm text-slate-400 mt-1 max-w-sm">
        Import yield data from the Import page to see how nutrient levels relate to crop yield.
      </p>
    </div>
  {:else}
    <!-- Filter bar -->
    <div class="flex flex-wrap gap-3 items-end">
      <!-- Field dropdown -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Field</span>
        <select bind:value={selectedField}
          class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
          <option value="">All Fields</option>
          {#each availableFields as field}
            <option value={field}>{field}</option>
          {/each}
        </select>
      </div>

      <!-- Crop Year dropdown -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Crop Year</span>
        <select bind:value={selectedCropYear}
          class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
          <option value="">All Years</option>
          {#each availableCropYears as yr}
            <option value={yr}>{yr}</option>
          {/each}
        </select>
      </div>

      <!-- Crop Type dropdown -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Crop Type</span>
        <select bind:value={selectedCropType}
          class="px-2 py-2 border border-slate-300 rounded-lg min-h-[44px] text-sm bg-white">
          <option value="">All Crops</option>
          {#each availableCropTypes as crop}
            <option value={crop}>{crop}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Summary line -->
    <div class="flex gap-4 text-xs text-slate-500 flex-wrap">
      <span>Analyzing {filteredPairs.length} sample-yield pair{filteredPairs.length !== 1 ? 's' : ''} across {nutrientsAnalyzed} nutrient{nutrientsAnalyzed !== 1 ? 's' : ''}</span>
    </div>

    {#if bucketResults.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <p class="text-sm text-slate-500">Not enough data points to analyze (need at least 10 per nutrient).</p>
      </div>
    {:else}
      <!-- Results table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-slate-50">
              <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">
                Nutrient
              </th>
              <th class="text-right py-2 px-3 text-xs font-semibold uppercase bg-red-50 text-red-700">
                Low
              </th>
              <th class="text-right py-2 px-3 text-xs font-semibold uppercase bg-amber-50 text-amber-700">
                Medium
              </th>
              <th class="text-right py-2 px-3 text-xs font-semibold uppercase bg-green-50 text-green-700">
                High
              </th>
              <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">
                Yield Impact
              </th>
            </tr>
          </thead>
          <tbody>
            {#each bucketResults as row}
              <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <!-- Nutrient name + threshold ranges -->
                <td class="py-2 px-3">
                  <div class="font-medium text-slate-800">{row.label}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">{getThresholdLabel(row.nutrient)}</div>
                </td>
                <!-- Low bucket -->
                <td class="text-right py-2 px-3 bg-red-50">
                  <div class="font-mono text-slate-800">{formatYield(row.low.avg)}</div>
                  <div class="text-[10px] text-slate-400">n={row.low.count}</div>
                </td>
                <!-- Medium bucket -->
                <td class="text-right py-2 px-3 bg-amber-50">
                  <div class="font-mono text-slate-800">{formatYield(row.medium.avg)}</div>
                  <div class="text-[10px] text-slate-400">n={row.medium.count}</div>
                </td>
                <!-- High bucket -->
                <td class="text-right py-2 px-3 bg-green-50">
                  <div class="font-mono text-slate-800">{formatYield(row.high.avg)}</div>
                  <div class="text-[10px] text-slate-400">n={row.high.count}</div>
                </td>
                <!-- Yield Impact -->
                <td class="text-right py-2 px-3 font-mono {getImpactColor(row.impact)}">
                  {formatImpact(row.impact)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <!-- Interpretation guide -->
    <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1">
      <h4 class="text-xs font-bold text-slate-600 uppercase mb-2">Interpretation Guide</h4>
      <p class="text-xs text-slate-500">
        <strong class="text-slate-600">Low / Medium / High</strong> &mdash; Samples grouped by nutrient level using threshold settings
      </p>
      <p class="text-xs text-slate-500">
        <strong class="text-slate-600">Avg Yield</strong> &mdash; Average yield (bu/ac) for samples in each group
      </p>
      <p class="text-xs text-slate-500">
        <strong class="text-slate-600">Yield Impact</strong> &mdash; Difference between High and Low groups (positive = higher nutrient = higher yield)
      </p>
      <p class="text-xs text-slate-500">
        <strong class="text-green-600">Large positive impact</strong> &mdash; Consider increasing fertilizer applications
      </p>
      <p class="text-xs text-slate-500">
        <strong class="text-red-600">Negative impact</strong> &mdash; May indicate over-application or toxicity at high levels
      </p>
    </div>
  {/if}
</div>
