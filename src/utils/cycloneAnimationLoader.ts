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

    const rows = parseCSV(csvText, { convertNaN: true });

    // Validate all rows with Zod schema
    const validationResult = validateForecastTrack(rows);

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

    const points: CycloneForecastPoint[] = validationResult.data.map((row: CycloneForecastRow) => {
      // RSMC feeds may mix 0-360 and signed longitudes. Normalize first so
      // downstream antimeridian unwrapping works deterministically.
      const longitude = normalizeLongitude(row.Longitude);
      const fallbackRadii = estimateFallbackRadii(row.MeanWind, row.Category);

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
        time: new Date(
          row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"].replace(' ', 'T').replace(/Z?$/, 'Z')
        ),
        timeString: row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"],
        latitude: row.Latitude,
        longitude,
        category: row.Category,
        pressure: row.Pressure,
        meanWind: row.MeanWind,
        windGust: row.WindGust,
        uncertainty: row.Uncertainty,
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
    });

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
