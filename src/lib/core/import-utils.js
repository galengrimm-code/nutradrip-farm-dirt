/**
 * import-utils.js - Column alias system, CSV parsing, duplicate detection, field assignment
 * Ported from import.old.html to ES module
 */

// ========== STANDARD FIELDS & ALIASES ==========

export const STANDARD_FIELDS = [
  'pH', 'P', 'P2', 'K', 'OM', 'CEC', 'Ca_sat', 'Mg_sat', 'K_Sat', 'H_Sat', 'Na_Sat',
  'Zn', 'Cu', 'Mn', 'Fe', 'Boron', 'S', 'Buffer_pH', 'Na', 'Ca', 'Mg',
  'NO3', 'NH4', 'Soluble_Salts', 'EC'
];

export const DEFAULT_ALIASES = {
  'P': ['P', 'P (M3)', 'P_M3', 'Phosphorus', 'Bray_P1', 'Bray P1', 'Mehlich2_P', 'Mehlich P', 'M3P', 'Olsen P', 'P1', 'P ppm'],
  'P2': ['P2', 'Bray_P2', 'Bray P2', 'P2 ppm'],
  'pH': ['pH', 'pH (1_1)', 'pH_1_1', 'ph', 'Soil_pH', 'pH 1:1', 'pH_s', 'soil pH'],
  'K': ['K', 'K (M3)', 'K_M3', 'Potassium', 'ExchK', 'Exch K', 'Mehlich K', 'M3K', 'K ppm'],
  'OM': ['OM', 'OM (LOI)', 'OM_LOI', 'Organic_Matter', 'Organic Matter', 'O.M.', 'OM %', 'SOM'],
  'CEC': ['CEC', 'CEC (Calc)', 'CEC_Calc', 'CEC (Cal_1', 'CEC meq'],
  'Ca_sat': ['Ca_sat', 'BS-Ca', 'BS_Ca', 'Ca_Base_Sat', 'Ca_Sat', 'Ca %', 'Ca Sat', '% Ca'],
  'Mg_sat': ['Mg_sat', 'BS-Mg', 'BS_Mg', 'Mg_Base_Sat', 'Mg_Sat', 'Mg %', 'Mg Sat', '% Mg'],
  'K_Sat': ['K_Sat', 'BS-K', 'BS_K', 'K_Base_Sat', 'K %', 'K Sat', '% K'],
  'H_Sat': ['H_Sat', 'BS-H', 'BS_H', 'H_Base_Sat', 'H %', 'H Sat', '% H'],
  'Na_Sat': ['Na_Sat', 'BS-Na', 'BS_Na', 'Na_Base_Sat', 'Na %', 'Na Sat', '% Na'],
  'Zn': ['Zn', 'Zn (M3)', 'Zn_M3', 'Zinc', 'Mehlich Zn'],
  'Cu': ['Cu', 'Cu (M3)', 'Cu_M3', 'Copper', 'Mehlich Cu'],
  'Mn': ['Mn', 'Mn (M3)', 'Mn_M3', 'Manganese', 'Mehlich Mn'],
  'Fe': ['Fe', 'Fe (M3)', 'Fe_M3', 'Iron', 'Mehlich Fe'],
  'Boron': ['Boron', 'B (M3)', 'B_M3', 'B'],
  'S': ['S', 'S (M3)', 'S_M3', 'Sulfur', 'SO4', 'SO4-S'],
  'Buffer_pH': ['Buffer_pH', 'BpH', 'Buffer pH', 'SMP', 'SMP pH', 'Buffer'],
  'Na': ['Na', 'Sodium', 'Na (M3)', 'ExchNa', 'Exch Na'],
  'Ca': ['Ca', 'Calcium', 'Ca (M3)', 'ExchCa', 'Exch Ca'],
  'Mg': ['Mg', 'Magnesium', 'Mg (M3)', 'ExchMg', 'Exch Mg'],
  'NO3': ['NO3', 'NO3-N', 'Nitrate', 'Nitrate-N', 'N03'],
  'NH4': ['NH4', 'NH4-N', 'Ammonium', 'Ammonium-N'],
  'Soluble_Salts': ['Soluble_Salts', 'Soluble_Sal', 'Sol_Salts', 'Salts', 'SS'],
  'EC': ['EC', 'EC (1:1)', 'Electrical Conductivity']
};

// In-season type field definitions for column mapping
export const IN_SEASON_FIELDS = {
  TIS: ['N_pct', 'P_pct', 'K_pct', 'Ca_pct', 'Mg_pct', 'S_pct', 'Zn_ppm', 'Mn_ppm', 'Fe_ppm', 'Cu_ppm', 'B_ppm'],
  SAP: ['pH', 'EC', 'Brix', 'Sugars', 'Nitrogen', 'Nitrogen_NH4', 'Nitrogen_NO3', 'Phosphorus', 'Potassium', 'Calcium', 'Magnesium', 'Sulfur', 'Boron', 'Iron', 'Manganese', 'Copper', 'Zinc', 'Molybdenum', 'Chloride', 'Sodium', 'Silica', 'Aluminum', 'Cobalt', 'Nickel', 'Selenium', 'KCa_Ratio', 'N_Conversion_Efficiency'],
  ISS: ['pH', 'Nitrate_N', 'P', 'K', 'OM', 'CEC', 'Zn', 'Mn', 'Fe', 'Cu', 'B'],
  WAT: ['TDS', 'Na', 'Cl', 'NO3', 'Hardness', 'Alkalinity', 'SAR', 'Ca', 'Mg', 'Zn', 'Mn', 'Fe', 'Cu', 'B', 'S']
};

// System fields to skip during column analysis
const SYSTEM_FIELDS = [
  'lat', 'lon', 'Lat', 'Lon', 'LAT', 'LON', 'latitude', 'longitude',
  'sampleId', 'SampleID', 'ID', 'ORG_ID', 'field', 'Field', 'FIELD_NAME',
  'year', 'Year', 'CropYear', 'date', 'depth', 'Depth', 'DEPTH',
  'name', 'Name', 'CLIENT_NAM', 'FARM_NAME', 'Field_Name', 'field_name',
  'POLYGONTYP', 'CLIENT_ID', 'FARM_ID', 'FIELD_ID', 'geometry', 'type',
  'soilMoistureCondition', 'P_Zn_Ratio'
];

// ========== ALIAS FUNCTIONS ==========

/** Merge default aliases with user-saved aliases from localStorage */
export function getAliases() {
  const saved = JSON.parse(localStorage.getItem('columnAliases') || '{}');
  const combined = JSON.parse(JSON.stringify(DEFAULT_ALIASES));

  for (const [standard, aliases] of Object.entries(saved)) {
    if (combined[standard]) {
      combined[standard] = [...new Set([...aliases, ...combined[standard]])];
    } else {
      combined[standard] = aliases;
    }
  }
  return combined;
}

/** Save a new alias for a standard field */
export function saveAlias(standardField, alias) {
  const saved = JSON.parse(localStorage.getItem('columnAliases') || '{}');
  if (!saved[standardField]) saved[standardField] = [];
  if (!saved[standardField].includes(alias)) {
    saved[standardField].push(alias);
  }
  localStorage.setItem('columnAliases', JSON.stringify(saved));
}

/** Match a column name to a standard field using aliases */
export function matchColumn(colName) {
  const aliases = getAliases();
  const colLower = colName.toLowerCase().trim();

  for (const [standard, alts] of Object.entries(aliases)) {
    for (const alt of alts) {
      if (alt.toLowerCase() === colLower || colName === alt) {
        return standard;
      }
    }
  }
  return null;
}

/** Categorize imported columns as matched or unmatched */
export function analyzeColumns(sampleProps) {
  const columns = Object.keys(sampleProps);
  const matched = [];
  const unmatched = [];

  for (const col of columns) {
    if (SYSTEM_FIELDS.some(sf => sf.toLowerCase() === col.toLowerCase())) continue;

    const match = matchColumn(col);
    if (match) {
      matched.push({ fileCol: col, standardCol: match });
    } else {
      unmatched.push({ fileCol: col, standardCol: null });
    }
  }

  return { matched, unmatched };
}

/** Apply column aliases to normalize nutrient data + compute P:Zn Ratio */
export function normalizeNutrientData(sample) {
  const aliases = getAliases();

  for (const [standard, alternatives] of Object.entries(aliases)) {
    if (sample[standard] === undefined) {
      for (const alt of alternatives) {
        if (sample[alt] !== undefined && sample[alt] !== null && sample[alt] !== '') {
          const num = parseFloat(sample[alt]);
          sample[standard] = isNaN(num) ? sample[alt] : num;
          break;
        }
      }
    }
  }

  if (sample.P !== undefined && sample.P !== '') sample.P = parseFloat(sample.P);
  if (sample.Zn !== undefined && sample.Zn !== '') sample.Zn = parseFloat(sample.Zn);

  if (!isNaN(sample.P) && !isNaN(sample.Zn) && sample.Zn > 0) {
    sample.P_Zn_Ratio = sample.P / sample.Zn;
  }

  return sample;
}

// ========== CSV PARSING ==========

/** Low-level CSV parser with BOM removal and delimiter auto-detection */
export function parseCSVRaw(text) {
  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Normalize line endings and split
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect delimiter
  const commaCount = (lines[0].match(/,/g) || []).length;
  const semicolonCount = (lines[0].match(/;/g) || []).length;
  const tabCount = (lines[0].match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
  if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders
    .map(h => h.trim().replace(/^"|"$/g, '').trim())
    .filter(h => h.length > 0);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length > 0 && values.some(v => v && v.trim())) {
      const row = {};
      headers.forEach((h, idx) => {
        const val = values[idx] || '';
        row[h] = val.trim().replace(/^"|"$/g, '');
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

/** Parse CSV text into sample objects */
export function parseCSV(text, assignedYear, assignedDepth, assignedMoisture) {
  const { headers, rows } = parseCSVRaw(text);
  if (rows.length === 0) return [];

  const samples = [];
  rows.forEach((row, idx) => {
    const sample = {};
    headers.forEach(h => {
      const v = row[h];
      if (v !== undefined && v !== '') {
        const n = parseFloat(v);
        sample[h] = isNaN(n) ? v : n;
      }
    });

    sample.lat = sample.lat || sample.Lat || sample.LAT;
    sample.lon = sample.lon || sample.Lon || sample.LON || sample.lng;
    sample.field = sample.field || sample.Field || null;
    sample.year = assignedYear || parseYear(sample.year || sample.Year);
    sample.depth = assignedDepth || sample.depth || sample.Depth || '6';
    sample.soilMoistureCondition = assignedMoisture || null;
    sample.sampleId = sample.sampleId || sample.SampleID || sample.ID || (idx + 1);

    if (sample.lat && sample.lon) {
      normalizeNutrientData(sample);
      samples.push(sample);
    }
  });

  return samples;
}

// ========== GEOJSON CONVERSION ==========

/** Convert GeoJSON to boundary objects */
export function geojsonToBoundaries(geojson, defaultName) {
  const boundaries = {};
  const features = geojson.features || [geojson];

  features.forEach(f => {
    if (!f.geometry) return;
    const type = f.geometry.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') return;
    const props = f.properties || {};

    // Get field name - prioritize FIELD_NAME from properties
    let fieldName = null;
    if (props.FIELD_NAME) fieldName = props.FIELD_NAME;
    else if (props.Field_Name) fieldName = props.Field_Name;
    else if (props.field_name) fieldName = props.field_name;
    else if (defaultName) fieldName = defaultName;
    else {
      const rawName = props.name || props.Name || props.Field || props.field || geojson.name || 'Unknown';
      if (rawName.includes('_')) {
        fieldName = rawName.split('_').pop();
      } else {
        fieldName = rawName;
      }
    }

    if (!boundaries[fieldName]) boundaries[fieldName] = [];
    if (type === 'Polygon') {
      boundaries[fieldName].push(f.geometry.coordinates[0].map(c => [c[1], c[0]]));
    } else {
      f.geometry.coordinates.forEach(poly => {
        boundaries[fieldName].push(poly[0].map(c => [c[1], c[0]]));
      });
    }
  });
  return boundaries;
}

/** Convert GeoJSON points to sample objects */
export function geojsonToSamples(geojson, assignedYear, assignedDepth, assignedMoisture) {
  const samples = [];
  const features = geojson.features || [geojson];

  features.forEach((f, idx) => {
    if (!f.geometry || f.geometry.type !== 'Point') return;
    const [lon, lat] = f.geometry.coordinates;
    const props = f.properties || {};

    const fileDepth = props.Depth || props.depth || props.DEPTH || props.DepthUnits;

    const sample = {
      sampleId: props.ORG_ID || props.SampleID || props.sampleId || props.Sample_ID || props.SAMPLE_ID || props.ID || (idx + 1),
      field: null,
      lat, lon,
      year: assignedYear || parseYear(props.CropYear || props.Year || props.year || props.date),
      depth: assignedDepth || fileDepth || '6',
      soilMoistureCondition: assignedMoisture || null
    };

    Object.entries(props).forEach(([k, v]) => {
      if (sample[k] === undefined && v !== null) {
        const n = parseFloat(v);
        sample[k] = isNaN(n) ? v : n;
      }
    });

    normalizeNutrientData(sample);
    samples.push(sample);
  });
  return samples;
}

// ========== FIELD ASSIGNMENT ==========

/** Check if a GPS point is inside or near a polygon boundary */
export function isPointInOrNearPolygon(point, polygon) {
  const [lat, lon] = point;
  let inside = false;
  const epsilon = 0.0001; // ~10 meters buffer

  // Check proximity to vertices
  for (let i = 0; i < polygon.length; i++) {
    const [plat, plon] = polygon[i];
    if (Math.abs(lat - plat) < epsilon && Math.abs(lon - plon) < epsilon) {
      return true;
    }
  }

  // Check proximity to edges
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat1, lon1] = polygon[i];
    const [lat2, lon2] = polygon[j];

    const dx = lat2 - lat1;
    const dy = lon2 - lon1;
    const len2 = dx * dx + dy * dy;

    if (len2 > 0) {
      const t = Math.max(0, Math.min(1, ((lat - lat1) * dx + (lon - lon1) * dy) / len2));
      const nearestLat = lat1 + t * dx;
      const nearestLon = lon1 + t * dy;
      const dist = Math.sqrt((lat - nearestLat) ** 2 + (lon - nearestLon) ** 2);
      if (dist < epsilon) return true;
    }
  }

  // Standard ray casting
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat1, lon1] = polygon[i];
    const [lat2, lon2] = polygon[j];
    if (((lon1 > lon) !== (lon2 > lon)) && (lat < (lat2 - lat1) * (lon - lon1) / (lon2 - lon1) + lat1)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Assign samples to fields based on GPS point-in-polygon matching */
export function assignSamplesToFields(samples, fieldBoundaries) {
  let assignedCount = 0;

  samples.forEach(sample => {
    let assigned = false;

    for (const [name, fieldData] of Object.entries(fieldBoundaries)) {
      if (assigned) break;
      const polys = fieldData.boundary || fieldData;
      const arr = Array.isArray(polys[0]?.[0]) ? polys : [polys];
      for (const poly of arr) {
        if (isPointInOrNearPolygon([sample.lat, sample.lon], poly)) {
          sample.field = name;
          assigned = true;
          assignedCount++;
          break;
        }
      }
    }

    if (!assigned && !sample.field) {
      sample.field = 'Unassigned';
    }
  });

  return assignedCount;
}

// ========== DUPLICATE DETECTION ==========

/** Generate a composite key for duplicate detection */
export function getSampleDuplicateKey(sample) {
  return `${sample.sampleId}-${sample.year}-${sample.lat?.toFixed(5)}-${sample.lon?.toFixed(5)}`;
}

/** Generate a composite key for in-season duplicate detection */
export function getInSeasonDuplicateKey(record) {
  return `${record.SiteId}-${record.Type}-${record.Year}-${record.LabDate}-${record.LeafAge || ''}`;
}

/** Filter out duplicate samples */
export function deduplicateSamples(newSamples, existingSamples) {
  const existingKeys = new Set(existingSamples.map(s => getSampleDuplicateKey(s)));
  const unique = newSamples.filter(s => !existingKeys.has(getSampleDuplicateKey(s)));
  return { unique, duplicateCount: newSamples.length - unique.length };
}

// ========== YEAR PARSING ==========

/** Extract a 4-digit year from various date formats */
export function parseYear(value) {
  if (!value) return null;
  const str = String(value).trim();

  // Already a 4-digit year
  if (/^\d{4}$/.test(str)) return str;

  // ISO format (2024-09-15)
  const isoMatch = str.match(/^(\d{4})-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[1];

  // US date format (09/15/2024 or 09-15-2024)
  const usMatch = str.match(/\d{1,2}[\/-]\d{1,2}[\/-](\d{4})/);
  if (usMatch) return usMatch[1];

  // Extract any 4-digit year
  const yearMatch = str.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return yearMatch[0];

  return null;
}
