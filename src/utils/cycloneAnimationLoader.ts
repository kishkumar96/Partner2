/**
 * Load and parse Cyclone Lola forecast track data for time-series animation
 */

import { parseCSV } from './csvParser';
import { loadTextData } from './dataLoader';

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
 * Load cyclone forecast track data
 */
export async function loadCycloneForecastTrack(): Promise<CycloneForecastPoint[] | null> {
  try {
    const { data: csvText } = await loadTextData('/cyclone-lola-forecast.csv');
    if (!csvText) return null;

    const rows = parseCSV(csvText, { convertNaN: true });
    
    const points: CycloneForecastPoint[] = rows.map((row: any) => ({
      time: new Date(row['Time[fmt=yyyy-MM-dd\'T\'HH:mm:ss\'Z\']']),
      timeString: row['Time[fmt=yyyy-MM-dd\'T\'HH:mm:ss\'Z\']'],
      latitude: parseFloat(row.Latitude),
      longitude: parseFloat(row.Longitude),
      category: parseFloat(row.Category),
      pressure: parseFloat(row.Pressure),
      meanWind: parseFloat(row.MeanWind),
      windGust: parseFloat(row.WindGust),
      uncertainty: parseFloat(row.Uncertainty) || 0,
      galeRadiusNE: parseFloat(row.NEGaleRadius) || 0,
      galeRadiusSE: parseFloat(row.SEGaleRadius) || 0,
      galeRadiusSW: parseFloat(row.SWGaleRadius) || 0,
      galeRadiusNW: parseFloat(row.NWGaleRadius) || 0,
      stormRadiusNE: parseFloat(row.NEStormRadius) || 0,
      stormRadiusSE: parseFloat(row.SEStormRadius) || 0,
      stormRadiusSW: parseFloat(row.SWStormRadius) || 0,
      stormRadiusNW: parseFloat(row.NWStormRadius) || 0,
      hurricaneRadiusNE: parseFloat(row.NEHurricaneRadius) || 0,
      hurricaneRadiusSE: parseFloat(row.SEHurricaneRadius) || 0,
      hurricaneRadiusSW: parseFloat(row.SWHurricaneRadius) || 0,
      hurricaneRadiusNW: parseFloat(row.NWHurricaneRadius) || 0,
      // Enhanced fields
      eyeRadius: parseFloat(row.EyeRadius) || 0,
      eyeRadiusUncertainty: parseFloat(row.UncEyeRadius) || 0,
      verticalExtent: parseFloat(row.VerticalExtent) || 0,
      pressureOCI: parseFloat(row.PressureOCI) || 0,
      radiusOCI: parseFloat(row.RadiusOCI) || 0,
      dvorakTNumber: parseFloat(row.FinalT) || 0,
      currentIntensity: parseFloat(row.CurrentIntensity) || 0,
      p5Wind: parseFloat(row.P5Wind) || 0,
    })).filter(p => !isNaN(p.latitude) && !isNaN(p.longitude));
    
    console.log(`✅ Loaded ${points.length} cyclone forecast points`);
    return points;
  } catch (error) {
    console.error('Error loading cyclone forecast track:', error);
    return null;
  }
}

/**
 * Get category color based on cyclone intensity
 */
export function getCategoryColor(category: number): string {
  // Align with unified wind color scale
  if (category >= 5) return '#7C3AED'; // Cat 5: Violet
  if (category >= 4) return '#DC2626'; // Cat 4: Red
  if (category >= 3) return '#FB923C'; // Cat 3: Orange
  if (category >= 2) return '#FACC15'; // Cat 2: Yellow
  if (category >= 1) return '#FDE047'; // Cat 1: Light yellow
  return '#7DD3FC'; // Tropical Storm: Sky blue
}

/**
 * Get category label
 */
export function getCategoryLabel(category: number): string {
  if (category >= 5) return 'Category 5';
  if (category >= 4) return 'Category 4';
  if (category >= 3) return 'Category 3';
  if (category >= 2) return 'Category 2';
  if (category >= 1) return 'Category 1';
  return 'Tropical Storm';
}
