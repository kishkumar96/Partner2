/**
 * Load and parse Cyclone Lola forecast track data for time-series animation
 */

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
}

/**
 * Parse CSV text into cyclone forecast points
 */
function parseCSV(csvText: string): any[] {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;
    
    const row: any = {};
    headers.forEach((header, index) => {
      const value = values[index].trim();
      row[header] = value === 'NaN' || value === '' ? null : value;
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Load cyclone forecast track data
 */
export async function loadCycloneForecastTrack(): Promise<CycloneForecastPoint[] | null> {
  try {
    const response = await fetch('/cyclone-lola-forecast.csv');
    if (!response.ok) {
      console.error('Failed to load cyclone forecast track');
      return null;
    }
    
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    
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
  if (category >= 5) return '#8B0000'; // Cat 5: Dark red
  if (category >= 4) return '#FF0000'; // Cat 4: Red
  if (category >= 3) return '#FF6600'; // Cat 3: Orange-red
  if (category >= 2) return '#FFA500'; // Cat 2: Orange
  if (category >= 1) return '#FFD700'; // Cat 1: Gold
  return '#4169E1'; // Tropical Storm: Royal blue
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
