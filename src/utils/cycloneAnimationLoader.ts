/**
 * Load and parse Cyclone Lola forecast track data for time-series animation
 */

import { parseCSV } from './csvParser';
import { loadTextData, type DataLoaderOptions } from './dataLoader';
import {
  getCategoryColor as getThemeCategoryColor,
  getCategoryLabel as getThemeCategoryLabel,
} from '@/theme/cycloneScale';
import { validateForecastTrack, type CycloneForecastRow } from '@/schemas/cycloneForecastSchema';

type RawForecastRow = Record<string, string | number | null>;

function appendDataVersion(path: string): string {
  const version = process.env.NEXT_PUBLIC_DATA_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(version)}`;
}

export interface CycloneForecastPoint {
  time: Date;
  timeString: string;
  latitude: number;
  longitude: number;
  category: number;
  pressure: number;
  meanWind: number;
  windGust: number;
  uncertainty: number;
  galeRadiusNE: number;
  galeRadiusSE: number;
  galeRadiusSW: number;
  galeRadiusNW: number;
  stormRadiusNE: number;
  stormRadiusSE: number;
  stormRadiusSW: number;
  stormRadiusNW: number;
  hurricaneRadiusNE: number;
  hurricaneRadiusSE: number;
  hurricaneRadiusSW: number;
  hurricaneRadiusNW: number;
  // Enhanced fields
  eyeRadius: number; // Storm eye diameter (km)
  eyeRadiusUncertainty: number; // Eye measurement uncertainty (km)
  verticalExtent: number; // Atmospheric depth (scale 1-5)
  pressureOCI: number; // Outermost closed isobar pressure (hPa)
  radiusOCI: number; // Extent of cyclone circulation (km)
  dvorakTNumber: number; // Professional intensity metric (Dvorak T-number)
  currentIntensity: number; // Current intensity measure
  p5Wind: number; // Alternative wind speed metric (kt)
}

// CSV parsing now handled by unified parser utility

function normalizeLongitude(rawLongitude: number): number {
  // Normalize any longitude convention (e.g. 0..360 or -540..540) into [-180, 180)
  return ((((rawLongitude + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateFallbackRadii(
  meanWind: number,
  category: number
): {
  gale: number;
  storm: number;
  hurricane: number;
} {
  // Conservative fallback profile (nautical miles) for feeds that omit radii columns.
  // Tuned to preserve animation readability without overstating hazard extents.
  let gale = meanWind >= 34 ? Math.round(55 + (meanWind - 34) * 1.9) : 0;
  let storm = meanWind >= 48 ? Math.round(25 + (meanWind - 48) * 1.2) : 0;
  let hurricane = meanWind >= 64 ? Math.round(12 + (meanWind - 64) * 0.9) : 0;

  if (category >= 1 && gale === 0) gale = 50;
  if (category >= 3 && storm === 0) storm = 30;
  if (category >= 4 && hurricane === 0) hurricane = 15;

  return {
    gale: clamp(gale, 0, 220),
    storm: clamp(storm, 0, 140),
    hurricane: clamp(hurricane, 0, 100),
  };
}

function resolveQuadrantRadii(
  ne: number | null | undefined,
  se: number | null | undefined,
  sw: number | null | undefined,
  nw: number | null | undefined,
  fallback: number | null | undefined
): { ne: number; se: number; sw: number; nw: number } {
  const hasAnyProvided = ne != null || se != null || sw != null || nw != null;
  const resolvedFallback = hasAnyProvided ? 0 : (fallback ?? 0);
  return {
    ne: ne ?? resolvedFallback,
    se: se ?? resolvedFallback,
    sw: sw ?? resolvedFallback,
    nw: nw ?? resolvedFallback,
  };
}

function firstDefined(row: RawForecastRow, keys: string[]): string | number | null | undefined {
  for (const key of keys) {
    if (key in row) {
      const value = row[key];
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCategory(meanWind: number | null): number {
  if (meanWind === null || meanWind < 0) return 0;
  if (meanWind >= 137) return 5;
  if (meanWind >= 113) return 4;
  if (meanWind >= 96) return 3;
  if (meanWind >= 83) return 2;
  if (meanWind >= 64) return 1;
  if (meanWind >= 34) return 0;
  return -1;
}

function inferWindGust(meanWind: number | null, windGust: number | null): number {
  if (windGust !== null) return windGust;
  if (meanWind === null) return 0;
  return Math.round(meanWind * 1.2);
}

function normalizeForecastRow(row: RawForecastRow): CycloneForecastRow | null {
  const timeValue = firstDefined(row, ["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']", 'Time', 'TIME']);
  const latitudeValue = asNumber(firstDefined(row, ['Latitude', 'LATITUDE', 'lat', 'LAT']));
  const longitudeValue = asNumber(firstDefined(row, ['Longitude', 'LONGITUDE', 'lon', 'LON']));

  if (typeof timeValue !== 'string' || latitudeValue === null || longitudeValue === null) {
    return null;
  }

  const meanWind = asNumber(firstDefined(row, ['MeanWind', 'WIND_SPD', 'mean_wind']));
  const windGust = asNumber(firstDefined(row, ['WindGust', 'WIND_GUST', 'wind_gust']));
  const pressure = asNumber(
    firstDefined(row, ['Pressure', 'PRESSURE_CENTRAL', 'central_pressure', 'pressure'])
  );
  const category = asNumber(firstDefined(row, ['Category', 'CATEGORY', 'category']));
  const uncertainty = asNumber(firstDefined(row, ['Uncertainty', 'UNCERTAINTY', 'uncertainty']));

  return {
    "Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']": timeValue,
    Latitude: latitudeValue,
    Longitude: longitudeValue,
    Symbol: asNumber(firstDefined(row, ['Symbol', 'SYMBOL', 'symbol'])),
    Category: category ?? inferCategory(meanWind),
    Pressure: pressure ?? 1007,
    PressureOCI: asNumber(firstDefined(row, ['PressureOCI', 'PRESSURE_OCI'])),
    MeanWind: meanWind ?? 0,
    WindGust: inferWindGust(meanWind, windGust),
    P5Wind: asNumber(firstDefined(row, ['P5Wind', 'P5_WIND'])),
    RadiusOCI: asNumber(firstDefined(row, ['RadiusOCI', 'RADIUS_OCI'])),
    Radius1000hPa: asNumber(firstDefined(row, ['Radius1000hPa', 'RADIUS_1000HPA'])),
    RadiusMaxWinds: asNumber(firstDefined(row, ['RadiusMaxWinds', 'RADIUS_MAX_WINDS'])),
    EyeRadius: asNumber(firstDefined(row, ['EyeRadius', 'MIN_EYE_RAD'])),
    UncEyeRadius: asNumber(firstDefined(row, ['UncEyeRadius', 'MIN_EYE_RAD_UNCERTAINTY'])),
    VerticalExtent: asNumber(firstDefined(row, ['VerticalExtent', 'VERTICAL_EXTENT'])),
    Uncertainty: uncertainty ?? 0,
    FinalT: asNumber(firstDefined(row, ['FinalT', 'FINAL_T'])),
    CurrentIntensity: asNumber(firstDefined(row, ['CurrentIntensity', 'CURRENT_INTENSITY'])),
    DataTNoDvorak: asNumber(firstDefined(row, ['DataTNoDvorak', 'DVORAK_DATA_T_NO'])),
    ModelTNoDvorak: asNumber(firstDefined(row, ['ModelTNoDvorak', 'DVORAK_MODEL_T_NO'])),
    PatternTNoDvorak: asNumber(firstDefined(row, ['PatternTNoDvorak', 'DVORAK_PATTERN_T_NO'])),
    GaleRadius: asNumber(firstDefined(row, ['GaleRadius', 'GALE_RADIUS'])),
    NEGaleRadius: asNumber(firstDefined(row, ['NEGaleRadius', 'NE_GALE_RADIUS'])),
    SEGaleRadius: asNumber(firstDefined(row, ['SEGaleRadius', 'SE_GALE_RADIUS'])),
    SWGaleRadius: asNumber(firstDefined(row, ['SWGaleRadius', 'SW_GALE_RADIUS'])),
    NWGaleRadius: asNumber(firstDefined(row, ['NWGaleRadius', 'NW_GALE_RADIUS'])),
    StrongGaleRadius: asNumber(firstDefined(row, ['StrongGaleRadius', 'STRONG_GALE_RADIUS'])),
    NEStrongGaleRadius: asNumber(
      firstDefined(row, ['NEStrongGaleRadius', 'NE_STRONG_GALE_RADIUS'])
    ),
    SEStrongGaleRadius: asNumber(
      firstDefined(row, ['SEStrongGaleRadius', 'SE_STRONG_GALE_RADIUS'])
    ),
    SWStrongGaleRadius: asNumber(
      firstDefined(row, ['SWStrongGaleRadius', 'SW_STRONG_GALE_RADIUS'])
    ),
    NWStrongGaleRadius: asNumber(
      firstDefined(row, ['NWStrongGaleRadius', 'NW_STRONG_GALE_RADIUS'])
    ),
    StormRadius: asNumber(firstDefined(row, ['StormRadius', 'STORM_RADIUS'])),
    NEStormRadius: asNumber(firstDefined(row, ['NEStormRadius', 'NE_STORM_RADIUS'])),
    SEStormRadius: asNumber(firstDefined(row, ['SEStormRadius', 'SE_STORM_RADIUS'])),
    SWStormRadius: asNumber(firstDefined(row, ['SWStormRadius', 'SW_STORM_RADIUS'])),
    NWStormRadius: asNumber(firstDefined(row, ['NWStormRadius', 'NW_STORM_RADIUS'])),
    HurricaneRadius: asNumber(firstDefined(row, ['HurricaneRadius', 'HURRICANE_RADIUS'])),
    NEHurricaneRadius: asNumber(firstDefined(row, ['NEHurricaneRadius', 'NE_HURRICANE_RADIUS'])),
    SEHurricaneRadius: asNumber(firstDefined(row, ['SEHurricaneRadius', 'SE_HURRICANE_RADIUS'])),
    SWHurricaneRadius: asNumber(firstDefined(row, ['SWHurricaneRadius', 'SW_HURRICANE_RADIUS'])),
    NWHurricaneRadius: asNumber(firstDefined(row, ['NWHurricaneRadius', 'NW_HURRICANE_RADIUS'])),
    DataSource:
      typeof firstDefined(row, ['DataSource', 'DATA_SRC']) === 'string'
        ? (firstDefined(row, ['DataSource', 'DATA_SRC']) as string)
        : null,
    'Land/Water':
      typeof firstDefined(row, ['Land/Water', 'SURFACE_CODE']) === 'string'
        ? (firstDefined(row, ['Land/Water', 'SURFACE_CODE']) as string)
        : null,
    CycloneStatus:
      typeof firstDefined(row, ['CycloneStatus', 'CYC_TYPE']) === 'string'
        ? (firstDefined(row, ['CycloneStatus', 'CYC_TYPE']) as string)
        : null,
    HowLocation:
      typeof firstDefined(row, ['HowLocation', 'POSITION_METHOD']) === 'string'
        ? (firstDefined(row, ['HowLocation', 'POSITION_METHOD']) as string)
        : null,
    UncPressure: asNumber(firstDefined(row, ['UncPressure', 'CENTRAL_PRES_UNCERTAINTY'])),
    HowPressure:
      typeof firstDefined(row, ['HowPressure', 'CENTRAL_PRES_METHOD']) === 'string'
        ? (firstDefined(row, ['HowPressure', 'CENTRAL_PRES_METHOD']) as string)
        : null,
    'P/W_Method':
      typeof firstDefined(row, ['P/W_Method', 'PRES_WIND_RELATION_USED']) === 'string'
        ? (firstDefined(row, ['P/W_Method', 'PRES_WIND_RELATION_USED']) as string)
        : null,
    HowMaxWindRadius:
      typeof firstDefined(row, ['HowMaxWindRadius', 'MN_RADIUS_MAX_WIND_METHOD']) === 'string'
        ? (firstDefined(row, ['HowMaxWindRadius', 'MN_RADIUS_MAX_WIND_METHOD']) as string)
        : null,
    HowGaleRadius:
      typeof firstDefined(row, ['HowGaleRadius', 'MN_RADIUS_GF_WIND_METHOD']) === 'string'
        ? (firstDefined(row, ['HowGaleRadius', 'MN_RADIUS_GF_WIND_METHOD']) as string)
        : null,
    HowStormRadius:
      typeof firstDefined(row, ['HowStormRadius', 'MN_RADIUS_SF_WIND_METHOD']) === 'string'
        ? (firstDefined(row, ['HowStormRadius', 'MN_RADIUS_SF_WIND_METHOD']) as string)
        : null,
    HowHurricaneRadius:
      typeof firstDefined(row, ['HowHurricaneRadius', 'MN_RADIUS_HF_WIND_METHOD']) === 'string'
        ? (firstDefined(row, ['HowHurricaneRadius', 'MN_RADIUS_HF_WIND_METHOD']) as string)
        : null,
    UncMaxWindSpeed: asNumber(firstDefined(row, ['UncMaxWindSpeed', 'MAX_WIND_SPD_UNCERTAINTY'])),
    HowMaxWindSpeed:
      typeof firstDefined(row, ['HowMaxWindSpeed', 'MAX_WIND_SPD_METHOD']) === 'string'
        ? (firstDefined(row, ['HowMaxWindSpeed', 'MAX_WIND_SPD_METHOD']) as string)
        : null,
    HowGust:
      typeof firstDefined(row, ['HowGust', 'MAX_WIND_GUST_METHOD']) === 'string'
        ? (firstDefined(row, ['HowGust', 'MAX_WIND_GUST_METHOD']) as string)
        : null,
    HowEyeRadius:
      typeof firstDefined(row, ['HowEyeRadius', 'MIN_EYE_RAD_METHOD']) === 'string'
        ? (firstDefined(row, ['HowEyeRadius', 'MIN_EYE_RAD_METHOD']) as string)
        : null,
  };
}

/**
 * Strip RSMC-format comment/metadata lines from a cyclone forecast CSV so that
 * parseCSV receives a clean header + data block.
 *
 * RSMC Nadi CSVs look like:
 *   # trackType=Official Forecast Track,...
 *   # CycloneName=Lola,...
 *   (Time->(Latitude,...)),   ← schema declaration line, ignored
 *   # Column Headings,...
 *   Time[fmt=...],Latitude,Longitude,...   ← real header (after the marker)
 *   # Start of data,...
 *   2023-10-23T00:00:00Z,...              ← data rows
 *
 * Rules:
 *   - Lines beginning with `#` are dropped.
 *   - Lines beginning with `(` (schema declaration) are dropped.
 *   - The first surviving non-empty line is treated as the CSV header.
 *   - Subsequent non-empty lines are data rows.
 */
function stripRsmcComments(csvText: string): string {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('(')) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

function buildForecastPointFromRow(row: CycloneForecastRow): CycloneForecastPoint {
  const longitude = normalizeLongitude(row.Longitude);
  const category = row.Category ?? inferCategory(row.MeanWind ?? null);
  const pressure = row.Pressure ?? 1007;
  const meanWind = row.MeanWind ?? 0;
  const windGust = row.WindGust ?? inferWindGust(meanWind, null);
  const uncertainty = row.Uncertainty ?? 0;
  const fallbackRadii = estimateFallbackRadii(meanWind, category);

  const galeRadii = resolveQuadrantRadii(
    row.NEGaleRadius,
    row.SEGaleRadius,
    row.SWGaleRadius,
    row.NWGaleRadius,
    row.GaleRadius ?? fallbackRadii.gale
  );
  const stormRadii = resolveQuadrantRadii(
    row.NEStormRadius,
    row.SEStormRadius,
    row.SWStormRadius,
    row.NWStormRadius,
    row.StormRadius ?? fallbackRadii.storm
  );
  const hurricaneRadii = resolveQuadrantRadii(
    row.NEHurricaneRadius,
    row.SEHurricaneRadius,
    row.SWHurricaneRadius,
    row.NWHurricaneRadius,
    row.HurricaneRadius ?? fallbackRadii.hurricane
  );

  return {
    time: new Date(row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"].replace(' ', 'T').replace(/Z?$/, 'Z')),
    timeString: row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"],
    latitude: row.Latitude,
    longitude,
    category,
    pressure,
    meanWind,
    windGust,
    uncertainty,
    galeRadiusNE: galeRadii.ne,
    galeRadiusSE: galeRadii.se,
    galeRadiusSW: galeRadii.sw,
    galeRadiusNW: galeRadii.nw,
    stormRadiusNE: stormRadii.ne,
    stormRadiusSE: stormRadii.se,
    stormRadiusSW: stormRadii.sw,
    stormRadiusNW: stormRadii.nw,
    hurricaneRadiusNE: hurricaneRadii.ne,
    hurricaneRadiusSE: hurricaneRadii.se,
    hurricaneRadiusSW: hurricaneRadii.sw,
    hurricaneRadiusNW: hurricaneRadii.nw,
    eyeRadius: row.EyeRadius ?? 0,
    eyeRadiusUncertainty: row.UncEyeRadius ?? 0,
    verticalExtent: row.VerticalExtent ?? 0,
    pressureOCI: row.PressureOCI ?? 0,
    radiusOCI: row.RadiusOCI ?? 0,
    dvorakTNumber: row.FinalT ?? 0,
    currentIntensity: row.CurrentIntensity ?? 0,
    p5Wind: row.P5Wind ?? 0,
  };
}

/**
 * Load cyclone forecast track data with schema validation
 * Returns validated data with detailed error reporting
 * @param options.forecastFile - Full relative path to the forecast CSV
 *   (e.g. '/vanuatu/cyclone-lola-forecast.csv'). Defaults to Vanuatu.
 */
export async function loadCycloneForecastTrack(
  options: DataLoaderOptions & { forecastFile?: string } = {}
): Promise<CycloneForecastPoint[] | null> {
  const { forecastFile = '/vanuatu/cyclone-lola-forecast.csv', ...loaderOptions } = options;
  try {
    const { data: csvText, error } = await loadTextData(appendDataVersion(forecastFile), {
      cache: true,
      signal: loaderOptions.signal,
    });
    if (!csvText) {
      // Don't log error if request was aborted (expected behavior during cleanup)
      if (error && error.name !== 'AbortError') {
        console.error('Failed to load cyclone forecast CSV file:', error.message);
      }
      return null;
    }

    const rows = parseCSV(stripRsmcComments(csvText), { convertNaN: true });
    const normalizedRows = rows
      .map(row => normalizeForecastRow(row as RawForecastRow))
      .filter((row): row is CycloneForecastRow => row !== null);

    // Validate all rows with Zod schema
    const validationResult = validateForecastTrack(normalizedRows);

    // Warnings are logged silently - only show in console if there are critical issues
    // Non-critical warnings are expected for forecast data and don't affect functionality

    // Log errors (parsing failures)
    if (validationResult.errors && validationResult.errors.length > 0) {
      console.error(
        `Cyclone data validation errors (${validationResult.errors.length}):`,
        validationResult.errors.slice(0, 5)
      ); // Show first 5
    }

    // Transform validated rows to CycloneForecastPoint format
    if (!validationResult.data || validationResult.data.length === 0) {
      // Expected for stub/empty CSVs (e.g. countries with no cyclone data yet)
      console.warn('No cyclone forecast data available (empty or header-only CSV)');
      return null;
    }

    const points: CycloneForecastPoint[] = validationResult.data.map(buildForecastPointFromRow);

    console.log(`Loaded ${points.length} cyclone forecast points`);
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      console.log(`  ⚠️  ${validationResult.warnings.length} warnings (check console for details)`);
    }

    return points;
  } catch (error) {
    console.error('Error loading cyclone forecast track:', error);
    return null;
  }
}

/**
 * Parse CycloneForecastPoint[] directly from a CycloneTrack's pre-computed
 * geometry field (a FeatureCollection of Point features, one per CSV row, with
 * every column preserved as a property). This avoids a second HTTP round-trip
 * to the raw track_file CSV and works for every new event automatically.
 *
 * Falls back gracefully to null so callers can chain to the CSV path.
 */
export function parseForecastPointsFromGeometry(geometry: unknown): CycloneForecastPoint[] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const fc = geometry as { type?: unknown; features?: unknown[] };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) || fc.features.length === 0) {
    return null;
  }

  const rawRows: RawForecastRow[] = fc.features
    .filter((f): f is { geometry: { type: string }; properties: Record<string, unknown> } => {
      if (!f || typeof f !== 'object') return false;
      const feat = f as { geometry?: { type?: unknown }; properties?: unknown };
      return (
        feat.geometry?.type === 'Point' && !!feat.properties && typeof feat.properties === 'object'
      );
    })
    .map(f => f.properties as RawForecastRow);

  if (rawRows.length === 0) return null;

  const normalizedRows = rawRows
    .map(row => normalizeForecastRow(row))
    .filter((row): row is CycloneForecastRow => row !== null);

  if (normalizedRows.length === 0) return null;

  const validationResult = validateForecastTrack(normalizedRows);
  if (!validationResult.data || validationResult.data.length === 0) return null;

  return validationResult.data.map(buildForecastPointFromRow);
}

/**
 * Get category color based on cyclone intensity
 * Re-exported from centralized theme for backwards compatibility
 */
export function getCategoryColor(category: number): string {
  return getThemeCategoryColor(category);
}

/**
 * Get category label
 * Re-exported from centralized theme for backwards compatibility
 */
export function getCategoryLabel(category: number): string {
  return getThemeCategoryLabel(category);
}
