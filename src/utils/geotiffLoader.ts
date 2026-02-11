/**
 * Utilities for loading and processing GeoTIFF hazard layers from THREDDS server
 */

import { CountryCode, THREDDS_CONFIG, GeoTIFFLayer } from "@/types/thredds";

/**
 * Load GeoTIFF data from THREDDS server
 */
export async function loadGeoTIFF(url: string) {
  try {
    console.log(`🔄 Loading GeoTIFF from:`, url);
    
    // @ts-ignore - this package has no shipped type declarations in this project
    const imported = await import("georaster");
    const parseGeoraster = (imported && (imported as any).default) || (imported as any);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`⚠️ GeoTIFF not available (${response.status} ${response.statusText})`);
      console.info(`URL: ${url}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);
    
    console.log(`✅ Successfully loaded GeoTIFF`);
    return georaster;
  } catch (error) {
    console.warn(`⚠️ Could not load GeoTIFF:`, error instanceof Error ? error.message : error);
    console.info(`URL: ${url}`);
    return null;
  }
}

/**
 * Get hazard layer URL from THREDDS server
 * Hazard data is in lowercase directories with _hazard suffix
 */
export function getHazardLayerUrl(
  countryCode: CountryCode,
  hazardType: string
): string {
  const { baseUrl, hazardPath } = THREDDS_CONFIG;
  const countryLower = countryCode.toLowerCase();
  // Example: https://gemthreddshpc.spc.int/thredds/fileServer/POP/Partner2/partner2_outputs/hazard/vu_hazard/wind.tif
  return `${baseUrl}/fileServer${hazardPath}/${countryLower}_hazard/${hazardType}.tif`;
}

/**
 * Get risk layer URL from THREDDS server
 * Risk outputs are in uppercase country directories under pdie_ini
 */
export function getRiskLayerUrl(
  countryCode: CountryCode,
  hazardType: string,
  timestamp: string = "latest"
): string {
  const { baseUrl, riskPath } = THREDDS_CONFIG;
  // Example: https://gemthreddshpc.spc.int/thredds/fileServer/POP/Partner2/partner2_outputs/pdie_ini/VU/output/Cyclone-PDIE/{timestamp}/risk.tif
  return `${baseUrl}/fileServer${riskPath}/${countryCode}/output/Cyclone-PDIE/${timestamp}/${hazardType}_risk.tif`;
}

/**
 * Query THREDDS catalog to get available timestamps for a country
 */
async function queryAvailableTimestamps(countryCode: CountryCode): Promise<string[]> {
  const { baseUrl, riskPath } = THREDDS_CONFIG;
  const catalogUrl = `${baseUrl}/catalog${riskPath}/${countryCode}/output/Cyclone-PDIE/catalog.xml`;
  
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) return [];
    
    const xml = await response.text();
    // Extract dataset names which are timestamps
    const datasetMatches = xml.matchAll(/dataset\s+name="([^"]+)"/g);
    const timestamps: string[] = [];
    
    for (const match of datasetMatches) {
      const name = match[1];
      // Check if it looks like a timestamp (YYYY-MM-DDTHH_MM_SS)
      if (/^\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}$/.test(name)) {
        timestamps.push(name);
      }
    }
    
    // Sort by date descending (newest first)
    return timestamps.sort().reverse();
  } catch (error) {
    return [];
  }
}

/**
 * Generate potential timestamps to try (going back up to 1 year)
 * This is a fallback if catalog query fails
 */
function generateTimestampCandidates(): string[] {
  const timestamps: string[] = [];
  const now = new Date();
  
  // Try the last 365 days
  for (let daysAgo = 0; daysAgo < 365; daysAgo++) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    // Generate timestamps for common run times
    const hours = ['00', '06', '09', '12', '18', '21'];
    for (const hour of hours) {
      const timestamp = date.toISOString()
        .split('T')[0] + `T${hour}_00_00`;
      timestamps.push(timestamp);
    }
  }
  
  return timestamps;
}

/**
 * Get cyclone track GeoJSON URL
 * Located in: pdie_ini/{COUNTRY}/output/Cyclone-PDIE/{timestamp}/cyclone-track.geojson
 */
export function getCycloneTrackUrl(countryCode: CountryCode, timestamp?: string): string {
  const { baseUrl, riskPath } = THREDDS_CONFIG;
  const ts = timestamp || generateTimestampCandidates()[0];
  return `${baseUrl}/fileServer${riskPath}/${countryCode}/output/Cyclone-PDIE/${ts}/cyclone-track.geojson`;
}

/**
 * Get regional impacts GeoJSON URL
 */
export function getRegionalImpactsUrl(countryCode: CountryCode, timestamp?: string): string {
  const { baseUrl, riskPath } = THREDDS_CONFIG;
  const ts = timestamp || generateTimestampCandidates()[0];
  return `${baseUrl}/fileServer${riskPath}/${countryCode}/output/Cyclone-PDIE/${ts}/regional-impacts.geojson`;
}

/**
 * Get exposure by cluster GeoJSON URL
 */
export function getExposureByClusterUrl(countryCode: CountryCode, timestamp?: string): string {
  const { baseUrl, riskPath } = THREDDS_CONFIG;
  const ts = timestamp || generateTimestampCandidates()[0];
  return `${baseUrl}/fileServer${riskPath}/${countryCode}/output/Cyclone-PDIE/${ts}/exposure-by-cluster.geojson`;
}

/**
 * Load cyclone track GeoJSON
 * First tries to query catalog for available data, then falls back to date search
 * Aborts early if too many consecutive failures
 */
export async function loadCycloneTrack(countryCode: CountryCode) {
  // First, try to query the THREDDS catalog for available timestamps
  const catalogTimestamps = await queryAvailableTimestamps(countryCode);
  
  // Use catalog timestamps if available, otherwise fall back to date guessing
  const timestamps = catalogTimestamps.length > 0 
    ? catalogTimestamps 
    : generateTimestampCandidates();
  
  if (catalogTimestamps.length > 0) {
    console.log(`📋 Found ${catalogTimestamps.length} timestamps in catalog for ${countryCode}`);
  }
  
  // Limit search to prevent excessive requests
  // Only try 2 timestamps if no catalog, since we're likely in a different time period than the data
  const maxAttempts = catalogTimestamps.length > 0 ? timestamps.length : 2;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 2;
  
  // Try each timestamp until we find data or hit limits
  for (let i = 0; i < Math.min(timestamps.length, maxAttempts); i++) {
    const timestamp = timestamps[i];
    const url = getCycloneTrackUrl(countryCode, timestamp);
    
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const geojson = await response.json();
        console.log(`✅ Successfully loaded cyclone track for ${countryCode} (${timestamp})`);
        return geojson;
      } else {
        consecutiveFailures++;
        
        // If we've had too many consecutive 404s, likely no data exists - abort early
        if (consecutiveFailures >= maxConsecutiveFailures) {
          break;
        }
      }
    } catch (error) {
      consecutiveFailures++;
      
      // Abort if too many failures
      if (consecutiveFailures >= maxConsecutiveFailures) {
        break;
      }
      continue;
    }
  }
  
  // No real-time data found - try real output data from PDIE runs
  if (countryCode === 'VU') {
    const realOutputTrack = await loadRealOutputTrack(countryCode);
    if (realOutputTrack) {
      return realOutputTrack;
    }
    
    // If no output data, try historical TC Lola data
    return loadHistoricalTCLolaTrack();
  }
  
  // For other countries, no real data available - return empty
  console.log(`ℹ️ No cyclone track data available for ${countryCode}`);
  return [];
}

/**
 * Load real output cyclone track data from PDIE model runs
 * This uses the actual output data from the model runs stored in THREDDS
 */
async function loadRealOutputTrack(countryCode: CountryCode) {
  const { baseUrl } = THREDDS_CONFIG;
  
  // Known output timestamps for each country (these are actual model run outputs)
  const outputTimestamps: Record<CountryCode, string[]> = {
    VU: ['2025-01-31T09_41_32'], // Real output from PDIE run
    WS: [],
    TO: [],
    CK: [],
  };
  
  const timestamps = outputTimestamps[countryCode];
  
  for (const timestamp of timestamps) {
    const url = `${baseUrl}/fileServer/POP/Partner2/case_study2/pdie_ini/${countryCode}/output/Cyclone-PDIE/${timestamp}/cyclone-track.geojson`;
    
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const geojson = await response.json();
        console.log(`✅ Loaded real output track for ${countryCode}: ${timestamp}`);
        return geojson;
      }
    } catch (error) {
      console.warn(`Failed to load real output track for ${countryCode} at ${timestamp}:`, error);
    }
  }
  
  return null;
}

/**
 * Load real PDIE model output data (exposure, impacts, summaries)
 */
export async function loadPDIEOutputData(countryCode: CountryCode, dataType: 'exposure' | 'impacts' | 'impacts-by-sector' | 'national-summary' | 'regional-summary' | 'asset-impact' | 'sector-impact') {
  const { baseUrl } = THREDDS_CONFIG;
  
  const outputTimestamps: Record<CountryCode, string[]> = {
    VU: ['2025-01-31T09_41_32'],
    WS: ['2026-02-05T12_00_00'], // Mock timestamp for Western Samoa - awaiting actual PDIE output
    TO: [],
    CK: [],
  };
  
  const timestamps = outputTimestamps[countryCode];
  if (timestamps.length === 0) return null;
  
  const timestamp = timestamps[0]; // Use most recent
  
  const fileMap = {
    'exposure': 'exposure-by-cluster.geojson',
    'impacts': 'regional-impacts.geojson',
    'impacts-by-sector': 'regional-impacts-by-sector.geojson',
    'national-summary': 'national-summary.csv',
    'regional-summary': 'regional-summary.csv',
    'asset-impact': 'impact-by-asset-type.csv',
    'sector-impact': 'impact-by-sector.csv',
  };
  
  const filename = fileMap[dataType];
  const url = `${baseUrl}/fileServer/POP/Partner2/case_study2/pdie_ini/${countryCode}/output/Cyclone-PDIE/${timestamp}/${filename}`;
  
  try {
    const response = await fetch(url);
    
    if (response.ok) {
      if (filename.endsWith('.csv')) {
        const text = await response.text();
        console.log(`✅ Loaded PDIE ${dataType} data for ${countryCode}`);
        return parseCSV(text);
      } else {
        const geojson = await response.json();
        console.log(`✅ Loaded PDIE ${dataType} data for ${countryCode}`);
        return geojson;
      }
    }
  } catch (error) {
    console.warn(`Failed to load PDIE ${dataType} data for ${countryCode}:`, error);
  }
  
  return null;
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const data: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: Record<string, string> = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    
    data.push(row);
  }
  
  return data;
}

/**
 * Load historical TC Lola track data from the known THREDDS catalog
 * This uses the actual historical data from October 2023
 */
async function loadHistoricalTCLolaTrack() {
  // Primary track file - the ideal/official forecast track
  const primaryTrackFile = "20231023T030000Z_Official_Forecast_Track_2324_01F_Lola.csv";
  
  // Fallback files if primary is not available
  const historicalCsvFiles = [
    primaryTrackFile,
    "20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv",
    "20231021T180000Z_Official_Forecast_Track_2324_01F_Lola.csv",
    "20231022T060000Z_Official_Forecast_Track_2324_01F_Lola.csv",
  ];
  
  // Try to fetch one of the historical CSV files
  for (const filename of historicalCsvFiles) {
    try {
      const url = `${THREDDS_CONFIG.baseUrl}/fileServer${THREDDS_CONFIG.hazardPath}/vu_hazard/TC/Lola/${filename}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const csvText = await response.text();
        const geojson = parseCSVToGeoJSON(csvText, "TC Lola (Official Forecast Track)");
        if (geojson) {
          console.log(`✅ Loaded TC Lola track: ${filename}`);
          return geojson;
        }
      }
    } catch (error) {
      // Try next file
      continue;
    }
  }
  
  // If historical data not available, return empty array
  console.log(`ℹ️ No cyclone track data available for Vanuatu`);
  return [];
}

/**
 * Parse CSV cyclone track data to GeoJSON
 */
function parseCSVToGeoJSON(csvText: string, name: string) {
  try {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const latIndex = headers.findIndex(h => h.includes('lat'));
    const lonIndex = headers.findIndex(h => h.includes('lon') || h.includes('lng'));
    
    if (latIndex === -1 || lonIndex === -1) {
      // Try standard column positions
      const coordinates: [number, number][] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length >= 2) {
          const lon = parseFloat(values[1]);
          const lat = parseFloat(values[0]);
          if (!isNaN(lon) && !isNaN(lat)) {
            coordinates.push([lon, lat]);
          }
        }
      }
      
      if (coordinates.length > 0) {
        return {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates
            },
            properties: { name }
          }]
        };
      }
      return null;
    }
    
    const coordinates: [number, number][] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const lat = parseFloat(values[latIndex]);
      const lon = parseFloat(values[lonIndex]);
      
      if (!isNaN(lon) && !isNaN(lat)) {
        coordinates.push([lon, lat]);
      }
    }
    
    if (coordinates.length === 0) return null;
    
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: { name }
      }]
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get available hazard types for a country
 * In production, this would query the THREDDS catalog
 */
export function getAvailableHazards(countryCode: CountryCode): GeoTIFFLayer[] {
  const hazardTypes = ["wind", "inundation", "cyclone_track"];
  
  return hazardTypes.map((hazardType) => ({
    id: `${countryCode}-${hazardType}`,
    name: `${hazardType.replace("_", " ").toUpperCase()}`,
    url: getHazardLayerUrl(countryCode, hazardType),
    type: "hazard",
    hazardType,
    countryCode,
  }));
}

/**
 * Create color scale for hazard intensity visualization
 */
export function getHazardColorScale(hazardType: string): string[] {
  const scales: Record<string, string[]> = {
    wind: ["#FEF0D9", "#FDCC8A", "#FC8D59", "#E34A33", "#B30000"],
    inundation: ["#EFF3FF", "#BDD7E7", "#6BAED6", "#3182BD", "#08519C"],
    cyclone_track: ["#F0F0FF", "#C6DBEF", "#9ECAE1", "#6BAED6", "#3182BD"],
    default: ["#FFFFCC", "#C7E9B4", "#7FCDBB", "#41B6C4", "#225EA8"],
  };

  return scales[hazardType] || scales.default;
}

/**
 * Parse GeoTIFF pixel values and convert to features
 * This is a simplified version - in production you'd want more sophisticated processing
 */
export function processGeoTIFFData(georaster: any) {
  const { mins, maxs, width, height } = georaster;
  
  return {
    min: mins[0],
    max: maxs[0],
    width,
    height,
    bounds: georaster.bbox || null,
  };
}
