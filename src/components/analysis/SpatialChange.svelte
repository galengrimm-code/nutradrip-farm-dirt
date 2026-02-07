<script>
  import { samples } from '$lib/stores/samples.js';
  import { boundaries } from '$lib/stores/boundaries.js';
  import { activeClientId, activeFarmId } from '$lib/stores/filters.js';
  import { getActiveFields, loadFarmsData } from '$lib/core/data.js';
  import { ALL_NUTRIENTS, getNutrientName, getNutrientUnit } from '$lib/core/config.js';

  export let selectedField = '';
  export let selectedNutrient = 'pH';

  // Filter by active client/farm operation
  $: activeFields = getActiveFields($boundaries, loadFarmsData(), $activeClientId, $activeFarmId);
  $: operationFields = activeFields.filter(f => f).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let baseYear = '';
  let compareYear = 'all';
  let matchRadius = 100;

  const FEET_TO_METERS = 0.3048;
  const radiusOptions = [50, 100, 150, 200];

  // Nutrient keys (excluding sampleId)
  const nutrientKeys = ALL_NUTRIENTS.filter(n => n.key !== 'sampleId');

  // Haversine distance in meters
  function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Percentile helper (linear interpolation)
  function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0];
    const idx = (p / 100) * (sortedArr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
  }

  function formatVal(value) {
    if (value === null || value === undefined || isNaN(value)) return '\u2014';
    const def = ALL_NUTRIENTS.find(n => n.key === selectedNutrient);
    const decimals = def ? def.decimals : 1;
    return value.toFixed(decimals);
  }

  // Filter samples by operation, then by field if selected
  $: operationSamples = $samples.filter(s => activeFields.includes(s.field));
  $: filteredSamples = selectedField
    ? operationSamples.filter(s => s.field === selectedField)
    : operationSamples;

  // Available years from filtered samples
  $: availableYears = [...new Set(filteredSamples.map(s => s.year).filter(Boolean))].sort();

  // Auto-select base year when available
  $: if (availableYears.length >= 2 && !availableYears.includes(baseYear)) {
    baseYear = availableYears[0];
  }

  // Compare year options (years after base year)
  $: compareYearOptions = availableYears.filter(y => String(y) > String(baseYear));

  // Auto-fix compare year if invalid
  $: if (compareYear !== 'all' && !compareYearOptions.includes(compareYear) && compareYearOptions.length > 0) {
    compareYear = 'all';
  }

  // Has enough years?
  $: hasEnoughYears = availableYears.length >= 2;

  // Selected compare years array
  $: selectedCompareYears = compareYear === 'all'
    ? compareYearOptions
    : [compareYear];

  // Base year samples with valid GPS and nutrient data
  $: baseSamples = filteredSamples.filter(s =>
    String(s.year) === String(baseYear) &&
    s.lat && s.lon &&
    s[selectedNutrient] !== undefined &&
    s[selectedNutrient] !== null &&
    s[selectedNutrient] !== '' &&
    !isNaN(parseFloat(s[selectedNutrient]))
  );

  $: hasEnoughSamples = baseSamples.length >= 4;

  // Quartile thresholds
  $: thresholds = computeThresholds(baseSamples, selectedNutrient);

  function computeThresholds(samps, nutrient) {
    const vals = samps.map(s => parseFloat(s[nutrient])).sort((a, b) => a - b);
    if (vals.length < 4) return null;
    return {
      lowThreshold: percentile(vals, 25),
      highThreshold: percentile(vals, 75),
      min: vals[0],
      max: vals[vals.length - 1]
    };
  }

  // Classify base year samples into zones
  $: zonedSamples = classifySamples(baseSamples, thresholds, selectedNutrient);

  function classifySamples(samps, thresh, nutrient) {
    if (!thresh) return [];
    return samps.map(s => {
      const val = parseFloat(s[nutrient]);
      let zone;
      if (val <= thresh.lowThreshold) zone = 'low';
      else if (val >= thresh.highThreshold) zone = 'high';
      else zone = 'medium';
      return { ...s, _value: val, _zone: zone };
    });
  }

  // Zone counts
  $: zoneCounts = {
    low: zonedSamples.filter(s => s._zone === 'low').length,
    medium: zonedSamples.filter(s => s._zone === 'medium').length,
    high: zonedSamples.filter(s => s._zone === 'high').length
  };

  // Match compare year samples to base zones within radius
  $: trackingData = computeTracking(zonedSamples, filteredSamples, selectedCompareYears, selectedNutrient, matchRadius);

  function computeTracking(zoned, allSamples, compareYrs, nutrient, radius) {
    if (!zoned.length || !compareYrs.length) return null;

    const radiusMeters = radius * FEET_TO_METERS;
    const allYears = [baseYear, ...compareYrs].sort();

    // For each year, compute zone averages
    const yearData = {};

    // Base year zone averages
    const baseZones = { low: [], medium: [], high: [], all: [] };
    zoned.forEach(s => {
      baseZones[s._zone].push(s._value);
      baseZones.all.push(s._value);
    });
    yearData[baseYear] = {
      low: { avg: average(baseZones.low), count: baseZones.low.length },
      medium: { avg: average(baseZones.medium), count: baseZones.medium.length },
      high: { avg: average(baseZones.high), count: baseZones.high.length },
      all: { avg: average(baseZones.all), count: baseZones.all.length }
    };

    // Compare years
    compareYrs.forEach(yr => {
      const yrSamples = allSamples.filter(s =>
        String(s.year) === String(yr) &&
        s.lat && s.lon &&
        s[nutrient] !== undefined &&
        s[nutrient] !== null &&
        s[nutrient] !== '' &&
        !isNaN(parseFloat(s[nutrient]))
      );

      const zones = { low: [], medium: [], high: [], all: [] };

      zoned.forEach(baseSample => {
        // Find closest match in this year's samples within radius
        let closest = null;
        let closestDist = Infinity;

        yrSamples.forEach(cs => {
          const dist = getDistanceMeters(
            parseFloat(baseSample.lat), parseFloat(baseSample.lon),
            parseFloat(cs.lat), parseFloat(cs.lon)
          );
          if (dist <= radiusMeters && dist < closestDist) {
            closestDist = dist;
            closest = cs;
          }
        });

        if (closest) {
          const val = parseFloat(closest[nutrient]);
          zones[baseSample._zone].push(val);
          zones.all.push(val);
        }
      });

      yearData[yr] = {
        low: { avg: average(zones.low), count: zones.low.length },
        medium: { avg: average(zones.medium), count: zones.medium.length },
        high: { avg: average(zones.high), count: zones.high.length },
        all: { avg: average(zones.all), count: zones.all.length }
      };
    });

    return { allYears, yearData };
  }

  function average(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Compute change for a zone
  function getZoneChange(zone) {
    if (!trackingData) return null;
    const years = trackingData.allYears;
    const first = trackingData.yearData[years[0]]?.[zone]?.avg;
    const last = trackingData.yearData[years[years.length - 1]]?.[zone]?.avg;
    if (first == null || last == null) return null;
    const change = last - first;
    const pctChange = first !== 0 ? (change / first) * 100 : 0;
    return { change, pctChange };
  }

  // Generate insights
  $: insights = generateInsights();

  function generateInsights() {
    if (!trackingData) return [];
    const lowChange = getZoneChange('low');
    const highChange = getZoneChange('high');
    const allChange = getZoneChange('all');
    const result = [];
    const name = nutrientLabel;
    const unit = nutrientUnit ? ` ${nutrientUnit}` : '';
    const def = ALL_NUTRIENTS.find(n => n.key === selectedNutrient);
    const dec = def ? def.decimals : 1;

    // Low zone insight
    if (lowChange) {
      const pct = Math.abs(lowChange.pctChange).toFixed(0);
      const abs = Math.abs(lowChange.change).toFixed(dec);
      if (lowChange.change > 0) {
        result.push({
          type: 'positive',
          icon: '\uD83D\uDCC8',
          text: `Low ${name} areas improved ${pct}% (+${lowChange.change.toFixed(dec)}${unit} avg)`
        });
      } else if (lowChange.change < 0) {
        result.push({
          type: 'negative',
          icon: '\uD83D\uDCC9',
          text: `Low ${name} areas declined ${pct}% (${lowChange.change.toFixed(dec)}${unit} avg)`
        });
      }
    }

    // High zone insight
    if (highChange) {
      const pct = Math.abs(highChange.pctChange).toFixed(0);
      if (highChange.change < 0) {
        result.push({
          type: 'neutral',
          icon: '\u2696\uFE0F',
          text: `High ${name} areas decreased ${pct}% (${highChange.change.toFixed(dec)}${unit} avg)`
        });
      } else if (highChange.change > 0) {
        result.push({
          type: 'warning',
          icon: '\u2B06\uFE0F',
          text: `High ${name} areas increased ${pct}% (+${highChange.change.toFixed(dec)}${unit} avg)`
        });
      }
    }

    // Strategy insight
    if (lowChange && highChange) {
      const lc = lowChange.change;
      const hc = highChange.change;

      if (lc > 0 && hc <= 0) {
        result.push({
          type: 'positive',
          icon: '\uD83C\uDFAF',
          text: `Your fertility strategy is successfully bringing up the low spots while maintaining high areas!`
        });
      } else if (lc > 0 && hc > 0) {
        result.push({
          type: 'neutral',
          icon: '\uD83D\uDCCA',
          text: `All areas are increasing \u2014 consider variable rate application to target low spots more`
        });
      } else if (lc <= 0 && hc > 0) {
        result.push({
          type: 'warning',
          icon: '\u26A0\uFE0F',
          text: `High areas getting higher while low areas stagnate \u2014 review application targeting`
        });
      }
    }

    return result;
  }

  $: nutrientLabel = getNutrientName(selectedNutrient);
  $: nutrientUnit = getNutrientUnit(selectedNutrient);
</script>

<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <!-- Header with teal accent -->
  <div class="border-l-4 border-teal-500 bg-teal-50 px-4 py-3">
    <h3 class="text-base font-bold text-slate-800">Spatial Change Analysis</h3>
    <p class="text-xs text-slate-500 mt-0.5">
      Track how nutrient levels at specific GPS locations change over time. Identifies whether historically low-testing areas are improving or staying low.
    </p>
  </div>

  <div class="p-4 space-y-4">
    <!-- Filters row -->
    <div class="flex flex-wrap gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Field</span>
        <select bind:value={selectedField}
          class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          <option value="">All Fields</option>
          {#each operationFields as field}
            <option value={field}>{field}</option>
          {/each}
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-500 uppercase">Nutrient</span>
        <select bind:value={selectedNutrient}
          class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
          {#each nutrientKeys as n}
            <option value={n.key}>{n.name}{n.unit ? ` (${n.unit})` : ''}</option>
          {/each}
        </select>
      </div>

      {#if hasEnoughYears}
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-500 uppercase">Base Year</span>
          <select bind:value={baseYear}
            class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
            {#each availableYears as yr}
              <option value={yr}>{yr}</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-500 uppercase">Compare Year</span>
          <select bind:value={compareYear}
            class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
            <option value="all">All subsequent</option>
            {#each compareYearOptions as yr}
              <option value={yr}>{yr}</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-500 uppercase">Match Radius</span>
          <select bind:value={matchRadius}
            class="px-2 py-2 border rounded-lg min-h-[44px] text-sm bg-white">
            {#each radiusOptions as r}
              <option value={r}>{r} ft</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Empty states -->
    {#if !hasEnoughYears}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-lg font-medium text-slate-600">
          {availableYears.length === 0 ? 'Select a field to analyze spatial changes' : 'Need at least 2 years of data'}
        </p>
        <p class="text-sm text-slate-400 mt-1">
          {availableYears.length === 0
            ? 'Choose a field or ensure samples are loaded to get started.'
            : `Only ${availableYears.length} year of data available for this selection.`}
        </p>
      </div>
    {:else if !hasEnoughSamples}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-lg font-medium text-slate-600">Need at least 4 samples with nutrient data</p>
        <p class="text-sm text-slate-400 mt-1">
          Found {baseSamples.length} sample{baseSamples.length !== 1 ? 's' : ''} with valid {nutrientLabel} values and GPS coordinates in {baseYear}.
        </p>
      </div>
    {:else}
      <!-- Zone Summary Cards -->
      {#if thresholds}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <!-- Low Zone -->
          <div class="rounded-lg border-2 border-red-200 bg-red-50 p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-bold text-red-700">Low Zone</span>
              <span class="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                {zoneCounts.low} sample{zoneCounts.low !== 1 ? 's' : ''}
              </span>
            </div>
            <p class="text-xs text-red-600">
              {nutrientLabel} {'\u2264'} {formatVal(thresholds.lowThreshold)}
              {nutrientUnit ? ` ${nutrientUnit}` : ''}
            </p>
            <p class="text-xs text-red-400 mt-0.5">
              Range: {formatVal(thresholds.min)} &ndash; {formatVal(thresholds.lowThreshold)}
            </p>
          </div>

          <!-- Medium Zone -->
          <div class="rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-bold text-amber-700">Medium Zone</span>
              <span class="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                {zoneCounts.medium} sample{zoneCounts.medium !== 1 ? 's' : ''}
              </span>
            </div>
            <p class="text-xs text-amber-600">
              {formatVal(thresholds.lowThreshold)} &lt; {nutrientLabel} &lt; {formatVal(thresholds.highThreshold)}
              {nutrientUnit ? ` ${nutrientUnit}` : ''}
            </p>
            <p class="text-xs text-amber-400 mt-0.5">
              Between Q1 and Q3
            </p>
          </div>

          <!-- High Zone -->
          <div class="rounded-lg border-2 border-green-200 bg-green-50 p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-bold text-green-700">High Zone</span>
              <span class="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                {zoneCounts.high} sample{zoneCounts.high !== 1 ? 's' : ''}
              </span>
            </div>
            <p class="text-xs text-green-600">
              {nutrientLabel} {'\u2265'} {formatVal(thresholds.highThreshold)}
              {nutrientUnit ? ` ${nutrientUnit}` : ''}
            </p>
            <p class="text-xs text-green-400 mt-0.5">
              Range: {formatVal(thresholds.highThreshold)} &ndash; {formatVal(thresholds.max)}
            </p>
          </div>
        </div>
      {/if}

      <!-- Zone Tracking Table -->
      {#if trackingData}
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-slate-50">
                <th class="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Zone</th>
                {#each trackingData.allYears as yr}
                  <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">
                    {yr}
                  </th>
                {/each}
                <th class="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Change</th>
              </tr>
            </thead>
            <tbody>
              {#each ['low', 'medium', 'high', 'all'] as zone}
                {@const change = getZoneChange(zone)}
                <tr class="border-t border-slate-100 {zone === 'all' ? 'bg-teal-50 font-semibold' : 'hover:bg-slate-50'} transition-colors">
                  <td class="py-2 px-3 font-medium {zone === 'low' ? 'text-red-700' : zone === 'medium' ? 'text-amber-700' : zone === 'high' ? 'text-green-700' : 'text-teal-700'}">
                    {zone === 'all' ? 'Field Average' : zone === 'low' ? 'Low Zone' : zone === 'medium' ? 'Medium Zone' : 'High Zone'}
                  </td>
                  {#each trackingData.allYears as yr}
                    {@const data = trackingData.yearData[yr]?.[zone]}
                    <td class="text-right py-2 px-3 font-mono text-slate-700">
                      {#if data && data.avg != null}
                        {formatVal(data.avg)}
                        <span class="text-xs text-slate-400 font-normal">(n={data.count})</span>
                      {:else}
                        <span class="text-slate-300">&mdash;</span>
                      {/if}
                    </td>
                  {/each}
                  <td class="text-right py-2 px-3 font-mono">
                    {#if change}
                      <span class="{change.change > 0 ? 'text-green-600' : change.change < 0 ? 'text-red-600' : 'text-slate-500'}">
                        {change.change > 0 ? '\u2191' : change.change < 0 ? '\u2193' : '\u2192'}
                        {change.change > 0 ? '+' : ''}{formatVal(change.change)}
                        <span class="text-xs">({change.pctChange > 0 ? '+' : ''}{change.pctChange.toFixed(1)}%)</span>
                      </span>
                    {:else}
                      <span class="text-slate-300">&mdash;</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Insights -->
      {#if insights.length > 0}
        <div class="space-y-2">
          <h4 class="text-sm font-bold text-slate-700">Insights</h4>
          {#each insights as insight}
            <div class="rounded-lg p-3 border-l-4 text-sm
              {insight.type === 'positive' ? 'border-green-500 bg-green-50 text-green-800' :
               insight.type === 'negative' ? 'border-red-500 bg-red-50 text-red-800' :
               insight.type === 'warning' ? 'border-amber-500 bg-amber-50 text-amber-800' :
               'border-slate-400 bg-slate-50 text-slate-700'}">
              {#if insight.icon}<span class="mr-1.5">{insight.icon}</span>{/if}{insight.text}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Info box -->
      <div class="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 space-y-1.5">
        <p class="font-semibold">How Spatial Zone Analysis Works</p>
        <p>
          Samples from the base year are divided into <strong>Low</strong> (bottom 25%), <strong>Medium</strong> (middle 50%), and <strong>High</strong> (top 25%) zones using quartile thresholds based on {nutrientLabel} values.
        </p>
        <p>
          Each base-year sample location is then matched to the nearest sample within {matchRadius} ft in subsequent years using GPS coordinates. This tracks whether specific areas of the field are improving, staying the same, or declining over time.
        </p>
        <p>
          The goal is to identify if historically low-testing areas are responding to management inputs, or if high-testing areas are being over-applied.
        </p>
      </div>
    {/if}
  </div>
</div>
