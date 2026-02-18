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

/**
 * Load cyclone forecast track data with schema validation
 * Returns validated data with detailed error reporting
 */
export async function loadCycloneForecastTrack(
  options: DataLoaderOptions = {}
): Promise<CycloneForecastPoint[] | null> {
  try {
    const { data: csvText, error } = await loadTextData('/cyclone-lola-forecast.csv', {
      cache: true,
      signal: options.signal,
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
      console.error('No valid cyclone forecast points after validation');
      return null;
    }

    const points: CycloneForecastPoint[] = validationResult.data.map((row: CycloneForecastRow) => ({
      time: new Date(row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"]),
      timeString: row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"],
      latitude: row.Latitude,
      longitude: row.Longitude,
      category: row.Category,
      pressure: row.Pressure,
      meanWind: row.MeanWind,
      windGust: row.WindGust,
      uncertainty: row.Uncertainty,
      galeRadiusNE: row.NEGaleRadius ?? 0,
      galeRadiusSE: row.SEGaleRadius ?? 0,
      galeRadiusSW: row.SWGaleRadius ?? 0,
      galeRadiusNW: row.NWGaleRadius ?? 0,
      stormRadiusNE: row.NEStormRadius ?? 0,
      stormRadiusSE: row.SEStormRadius ?? 0,
      stormRadiusSW: row.SWStormRadius ?? 0,
      stormRadiusNW: row.NWStormRadius ?? 0,
      hurricaneRadiusNE: row.NEHurricaneRadius ?? 0,
      hurricaneRadiusSE: row.SEHurricaneRadius ?? 0,
      hurricaneRadiusSW: row.SWHurricaneRadius ?? 0,
      hurricaneRadiusNW: row.NWHurricaneRadius ?? 0,
      eyeRadius: row.EyeRadius ?? 0,
      eyeRadiusUncertainty: row.UncEyeRadius ?? 0,
      verticalExtent: row.VerticalExtent ?? 0,
      pressureOCI: row.PressureOCI ?? 0,
      radiusOCI: row.RadiusOCI ?? 0,
      dvorakTNumber: row.FinalT ?? 0,
      currentIntensity: row.CurrentIntensity ?? 0,
      p5Wind: row.P5Wind ?? 0,
    }));

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
