/**
 * Utility to load real data from the project data files
 */

import { Event } from "@/types";
import { loadCycloneForecastTrack } from "./cycloneAnimationLoader";

/**
 * Load cyclone track data from the geojson file
 */
export async function loadCycloneTrackData() {
  try {
    const response = await fetch('/cyclone-track.geojson');
    if (!response.ok) {
      console.error('Failed to load cyclone track data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading cyclone track data:', error);
    return null;
  }
}

/**
 * Load regional impacts from geojson file
 */
export async function loadRegionalImpacts() {
  try {
    const response = await fetch('/regional-impacts.geojson');
    if (!response.ok) {
      console.error('Failed to load regional impacts data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading regional impacts data:', error);
    return null;
  }
}

/**
 * Load regional impacts by sector from geojson file
 */
export async function loadRegionalImpactsBySector() {
  try {
    const response = await fetch('/regional-impacts-by-sector.geojson');
    if (!response.ok) {
      console.error('Failed to load regional impacts by sector data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading regional impacts by sector data:', error);
    return null;
  }
}

/**
 * Load exposure by cluster data
 */
export async function loadExposureByCluster() {
  try {
    const response = await fetch('/exposure-by-cluster.geojson');
    if (!response.ok) {
      console.error('Failed to load exposure by cluster data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading exposure by cluster data:', error);
    return null;
  }
}

/**
 * Parse CSV data into array of objects
 */
function parseCSV(csvText: string): Array<Record<string, string | number>> {
  // Handle both Windows (\r\n) and Unix (\n) line endings
  const lines = csvText.trim().replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const values = line.split(',');
    const obj: Record<string, string | number> = {};
    
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      // Try to parse as number if it looks like one
      obj[header] = !isNaN(Number(value)) && value !== '' ? Number(value) : value;
    });
    
    data.push(obj);
  }
  
  return data;
}

/**
 * Load national summary CSV data
 */
export async function loadNationalSummary() {
  try {
    const response = await fetch('/national-summary.csv');
    if (!response.ok) {
      console.error('Failed to load national summary data');
      return null;
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading national summary data:', error);
    return null;
  }
}

/**
 * Load impact by asset type CSV data
 */
export async function loadImpactByAssetType() {
  try {
    const response = await fetch('/impact-by-asset-type.csv');
    if (!response.ok) {
      console.error('Failed to load impact by asset type data');
      return null;
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading impact by asset type data:', error);
    return null;
  }
}

/**
 * Load impact by sector CSV data
 */
export async function loadImpactBySector() {
  try {
    const response = await fetch('/impact-by-sector.csv');
    if (!response.ok) {
      console.error('Failed to load impact by sector data');
      return null;
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading impact by sector data:', error);
    return null;
  }
}

/**
 * Load regional summary CSV data
 */
export async function loadRegionalSummary() {
  try {
    const response = await fetch('/regional-summary.csv');
    if (!response.ok) {
      console.error('Failed to load regional summary data');
      return null;
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading regional summary data:', error);
    return null;
  }
}

/**
 * Calculate centroid of a polygon for display purposes
 */
function calculateCentroid(geometry: any): { lat: number; lng: number } {
  // Return default if geometry is undefined or null
  if (!geometry || !geometry.type) {
    console.warn('Invalid geometry provided to calculateCentroid');
    return { lat: -17.7333, lng: 168.3167 }; // Default to Vanuatu's center
  }
  
  try {
    // Handle MultiPolygon geometry
    if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
      // Get first polygon's first ring's first coordinate as representative point
      const firstPolygon = geometry.coordinates[0];
      if (firstPolygon && firstPolygon[0] && firstPolygon[0][0]) {
        const [lng, lat] = firstPolygon[0][0];
        return { lat, lng };
      }
    }
    
    // Handle Polygon geometry
    if (geometry.type === 'Polygon' && geometry.coordinates) {
      const [lng, lat] = geometry.coordinates[0][0];
      return { lat, lng };
    }
    
    // Handle Point geometry
    if (geometry.type === 'Point' && geometry.coordinates) {
      const [lng, lat] = geometry.coordinates;
      return { lat, lng };
    }
  } catch (error) {
    console.warn('Error calculating centroid:', error);
  }
  
  // Default to Vanuatu's center
  return { lat: -17.7333, lng: 168.3167 };
}

/**
 * Convert regional impacts GeoJSON to event data for the dashboard
 */
/**
 * Map district ID to province ID based on Vanuatu Admin structure
 */
function getProvinceIdFromDistrictId(districtId: string): string {
  // District IDs follow pattern VU[01-06]xxx -> Province IDs VUT.[1-6]_1
  if (districtId.startsWith('VU01')) return 'VUT.6_1'; // Torba
  if (districtId.startsWith('VU02')) return 'VUT.3_1'; // Sanma
  if (districtId.startsWith('VU03')) return 'VUT.2_1'; // Penama
  if (districtId.startsWith('VU04')) return 'VUT.1_1'; // Malampa
  if (districtId.startsWith('VU05')) return 'VUT.4_1'; // Shefa
  if (districtId.startsWith('VU06')) return 'VUT.5_1'; // Tafea
  return 'unknown';
}

export function convertRegionalImpactsToEvents(geojson: any): Event[] {
  if (!geojson || !geojson.features) return [];
  
  const events: Event[] = geojson.features
    .filter((feature: any) => {
      // Filter out features with invalid or missing geometry
      if (!feature || !feature.geometry || !feature.properties) {
        console.warn('Skipping feature with missing geometry or properties');
        return false;
      }
      return true;
    })
    .map((feature: any, index: number) => {
      const props = feature.properties;
      const regionName = props['Region.Region'] || `Region ${index + 1}`;
      const centroid = calculateCentroid(feature.geometry);
      const regionId = props['Region.ID'] || `region-${index}`;
      
      return {
        id: regionId,
        name: `TC Lola Impact - ${regionName}`,
        date: "2024-01-30", // TC Lola event date
        lat: centroid.lat,
        lng: centroid.lng,
        hazardId: "tropical-cyclone",
        sectorId: "Infrastructure", // Primary sector for regional aggregation
        districtId: regionId,
        provinceId: getProvinceIdFromDistrictId(regionId),
        location: {
          lat: centroid.lat,
          lng: centroid.lng,
        },
        severity: props.Max_Wind_Gusts > 200 ? "critical" : props.Max_Wind_Gusts > 150 ? "high" : props.Max_Wind_Gusts > 100 ? "medium" : "low",
        affectedPopulation: Number(props.Population_Exposed_To_Any_Hazard) || 0,
        economicDamage: Number(props.Total_Loss) || 0,
        countryCode: "VU", // All current data is for Vanuatu
      } as Event;
    });
  
  return events;
}

/**
 * Process exposure-by-cluster GeoJSON to extract asset statistics
 */
function processAssetExposureData(exposureByCluster: any) {
  if (!exposureByCluster || !exposureByCluster.features) return null;
  
  const assets = exposureByCluster.features.map((feature: any) => ({
    type: feature.properties.Asset || 'Unknown',
    useType: feature.properties.UseType || 'Unknown',
    details: feature.properties.Details || '',
    windGust: feature.properties.WindGust_kmph || 0,
    fluvialInundation: feature.properties.Fluvial_Inundation_m || 0,
    coastalInundation: feature.properties.Coastal_Inundation_m || 0,
    region: feature.properties.Admin1_Region || 'Unknown',
    district: feature.properties.Admin2_Region || 'Unknown',
    coordinates: feature.geometry.coordinates,
  }));
  
  // Calculate statistics by asset type
  const assetStats = {
    total: assets.length,
    byType: {} as Record<string, number>,
    criticalInfrastructure: {
      healthFacilities: 0,
      schools: 0,
      evacuationCenters: 0,
    },
    windExposure: {
      extreme: 0, // > 200 km/h
      high: 0,    // 150-200 km/h
      moderate: 0, // 100-150 km/h
      low: 0,      // < 100 km/h
    },
  };
  
  assets.forEach((asset: any) => {
    // Count by type
    assetStats.byType[asset.type] = (assetStats.byType[asset.type] || 0) + 1;
    
    // Count critical infrastructure
    if (asset.type === 'Health Facility') {
      assetStats.criticalInfrastructure.healthFacilities++;
    } else if (asset.type === 'School') {
      assetStats.criticalInfrastructure.schools++;
    } else if (asset.type === 'Evacuation Centre') {
      assetStats.criticalInfrastructure.evacuationCenters++;
    }
    
    // Count by wind exposure
    if (asset.windGust > 200) {
      assetStats.windExposure.extreme++;
    } else if (asset.windGust > 150) {
      assetStats.windExposure.high++;
    } else if (asset.windGust > 100) {
      assetStats.windExposure.moderate++;
    } else {
      assetStats.windExposure.low++;
    }
  });
  
  return { assets, stats: assetStats };
}

/**
 * Load all real data for the dashboard
 */
export async function loadAllRealData() {
  console.log('📊 Loading real data from files...');
  
  const [
    cycloneTrack,
    cycloneForecast,
    regionalImpacts,
    exposureByCluster,
    nationalSummary,
    impactByAsset,
    impactBySector,
    regionalSummaryData,
    regionalSummaryBySector,
    damagedBuildings,
    damagedRoads
  ] = await Promise.all([
    loadCycloneTrackData(),
    loadCycloneForecastTrack(),
    loadRegionalImpacts(),
    loadExposureByCluster(),
    loadNationalSummary(),
    loadImpactByAssetType(),
    loadImpactBySector(),
    loadRegionalSummary(),
    loadRegionalSummaryBySector(),
    loadDamagedBuildings(),
    loadDamagedRoads()
  ]);
  
  // Convert regional impacts to events
  const events = regionalImpacts ? convertRegionalImpactsToEvents(regionalImpacts) : [];
  
  // Convert CSV data to dashboard format
  const exposureData = convertToExposureData(regionalSummaryData);
  const economicDamageData = convertToEconomicDamageData(impactBySector, impactByAsset);
  
  // Process asset-level exposure data
  const assetExposureData = processAssetExposureData(exposureByCluster);
  
  console.log(`✅ Loaded ${events.length} events from real data`);
  console.log(`✅ Loaded ${exposureData.length} exposure records`);
  console.log(`✅ Loaded ${economicDamageData.length} economic damage records`);
  if (assetExposureData) {
    console.log(`✅ Processed ${assetExposureData.assets.length} individual assets`);
    console.log(`   - Health Facilities: ${assetExposureData.stats.criticalInfrastructure.healthFacilities}`);
    console.log(`   - Schools: ${assetExposureData.stats.criticalInfrastructure.schools}`);
    console.log(`   - Evacuation Centers: ${assetExposureData.stats.criticalInfrastructure.evacuationCenters}`);
  }
  
  return {
    cycloneTrack,
    cycloneForecast,
    regionalImpacts,
    exposureByCluster,
    nationalSummary,
    impactByAsset,
    impactBySector,
    regionalSummary: regionalSummaryData,
    regionalSummaryBySector,
    damagedBuildings,
    damagedRoads,
    events,
    exposureData,
    economicDamageData,
    assetExposureData,
  };
}

/**
 * Convert regional summary CSV to ExposureData format
 */
function convertToExposureData(regionalSummary: any): any[] {
  if (!regionalSummary || !Array.isArray(regionalSummary)) return [];
  
  return regionalSummary.map((row, index) => ({
    id: `exposure-${index}`,
    hazardId: 'tropical-cyclone',
    sectorId: 'all', // We can parse this from region data if needed
    population: Number(row.Population_Exposed_To_Any_Hazard) || 0,
    assets: Number(row.Total_Exposed_Value_To_Any_Hazard) || 0,
    infrastructure: Number(row.Exposed_Infrastructure) || 0,
    region: row.Region || 'Unknown',
  }));
}

/**
 * Convert impact by sector/asset CSV to EconomicDamageData format
 */
function convertToEconomicDamageData(impactBySector: any, impactByAsset: any): any[] {
  const damageData: any[] = [];
  
  // Process sector data
  if (impactBySector && Array.isArray(impactBySector)) {
    impactBySector.forEach((row, index) => {
      damageData.push({
        id: `damage-sector-${index}`,
        hazardId: 'tropical-cyclone',
        sectorId: row.Sector || 'Unknown', // Use actual sector name from data
        directLoss: Number(row.Total_Wind_Loss) || 0,
        indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
        totalLoss: Number(row.Total_Loss) || 0,
        year: 2024, // TC Lola event
        sector: row.Sector || 'Unknown',
        buildingCount: Number(row.Number_Exposed_Buildings) || 0,
      });
    });
  }
  
  // Process asset type data
  if (impactByAsset && Array.isArray(impactByAsset)) {
    impactByAsset.forEach((row, index) => {
      damageData.push({
        id: `damage-asset-${index}`,
        hazardId: 'tropical-cyclone',
        sectorId: 'Infrastructure',
        directLoss: Number(row.Total_Wind_Loss) || 0,
        indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
        totalLoss: Number(row.Total_Loss) || 0,
        year: 2024, // TC Lola event
        assetType: row.Asset || 'Unknown',
        assetCount: Number(row.Number_Exposed) || 0,
      });
    });
  }
  
  return damageData;
}

/**
 * Process wind intensity distribution from national summary data
 */
export function processWindIntensityData(nationalSummary: any): any {
  if (!nationalSummary || !Array.isArray(nationalSummary) || nationalSummary.length === 0) {
    return null;
  }

  const data = nationalSummary[0]; // National summary has single row
  
  return {
    ranges: [
      {
        label: '<83 km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_<_83.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_<_83.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_<_83.Total_Loss']) || 0,
      },
      {
        label: '83-125 km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_83_125.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_83_125.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_83_125.Total_Loss']) || 0,
      },
      {
        label: '125-164 km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_125_164.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_125_164.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_125_164.Total_Loss']) || 0,
      },
      {
        label: '164-224 km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_164_224.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_164_224.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_164_224.Total_Loss']) || 0,
      },
      {
        label: '224-280 km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_224_280.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_224_280.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_224_280.Total_Loss']) || 0,
      },
      {
        label: '280+ km/h',
        buildings: Number(data['Wind_Gusts_kmph.range_280_+.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_280_+.Population']) || 0,
        totalLoss: Number(data['Wind_Gusts_kmph.range_280_+.Total_Loss']) || 0,
      },
    ],
  };
}

/**
 * Load damaged buildings from geojson file
 */
export async function loadDamagedBuildings() {
  try {
    const response = await fetch('/damaged-buildings.geojson');
    if (!response.ok) {
      console.error('Failed to load damaged buildings data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading damaged buildings data:', error);
    return null;
  }
}

/**
 * Load damaged roads from geojson file
 */
export async function loadDamagedRoads() {
  try {
    const response = await fetch('/damaged-roads.geojson');
    if (!response.ok) {
      console.error('Failed to load damaged roads data');
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading damaged roads data:', error);
    return null;
  }
}

/**
 * Load regional summary by sector CSV data
 */
export async function loadRegionalSummaryBySector() {
  try {
    const response = await fetch('/regional-summary-by-sector.csv');
    if (!response.ok) {
      console.error('Failed to load regional summary by sector data');
      return null;
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading regional summary by sector data:', error);
    return null;
  }
}
