/**
 * Utility to load real data from the project data files
 */

import { Event } from "@/types";
import { loadCycloneForecastTrack } from "./cycloneAnimationLoader";
import { parseCSV } from "./csvParser";
import { loadGeoJSON, loadTextData } from "./dataLoader";

/**
 * Load cyclone track data from the geojson file
 */
export async function loadCycloneTrackData() {
  const { data, error } = await loadGeoJSON('/cyclone-track.geojson');
  return data;
}

/**
 * Load regional impacts from geojson file
 */
export async function loadRegionalImpacts() {
  const { data } = await loadGeoJSON('/regional-impacts.geojson');
  return data;
}

/**
 * Load regional impacts by sector from geojson file
 */
export async function loadRegionalImpactsBySector() {
  const { data } = await loadGeoJSON('/regional-impacts-by-sector.geojson');
  return data;
}

/**
 * Load exposure by cluster data
 */
export async function loadExposureByCluster() {
  const { data } = await loadGeoJSON('/exposure-by-cluster.geojson');
  return data;
}

// CSV parsing now handled by unified csvParser utility

/**
 * Load national summary CSV data
 */
export async function loadNationalSummary() {
  const { data: csvText } = await loadTextData('/national-summary.csv');
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by asset type CSV data
 */
export async function loadImpactByAssetType() {
  const { data: csvText } = await loadTextData('/impact-by-asset-type.csv');
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by sector CSV data
 */
export async function loadImpactBySector() {
  const { data: csvText } = await loadTextData('/impact-by-sector.csv');
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load regional summary CSV data
 */
export async function loadRegionalSummary() {
  const { data: csvText } = await loadTextData('/regional-summary.csv');
  return csvText ? parseCSV(csvText) : null;
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
 * Convert regional impacts by sector GeoJSON to sector-specific event data
 * This creates separate events for each sector in each region
 */
export function convertRegionalImpactsBySectorToEvents(geojson: any): Event[] {
  if (!geojson || !geojson.features) return [];
  
  const sectors = ['Education', 'Infrastructure', 'Productive', 'Public', 'Residential', 'Other', 'Unknown'];
  const events: Event[] = [];
  
  geojson.features.forEach((feature: any, regionIndex: number) => {
    if (!feature || !feature.geometry || !feature.properties) {
      return;
    }
    
    const props = feature.properties;
    const regionName = props['Region'] || `Region ${regionIndex + 1}`;
    const regionId = props['ID'] || `region-${regionIndex}`;
    const centroid = calculateCentroid(feature.geometry);
    
    // Create an event for each sector that has data
    sectors.forEach((sector) => {
      const sectorLossKey = `Sector.${sector}.Loss`;
      const sectorExposedKey = `Sector.${sector}.Number_Exposed_Buildings`;
      const sectorDamagedKey = `Sector.${sector}.Number_Damaged_Buildings`;
      
      const loss = Number(props[sectorLossKey]) || 0;
      const exposedBuildings = Number(props[sectorExposedKey]) || 0;
      const damagedBuildings = Number(props[sectorDamagedKey]) || 0;
      
      // Only create event if there's actual damage or exposure
      if (loss > 0 || exposedBuildings > 0 || damagedBuildings > 0) {
        // Calculate severity based on loss amount
        let severity: "low" | "medium" | "high" | "critical" = "low";
        if (loss > 1000000) severity = "critical";
        else if (loss > 100000) severity = "high";
        else if (loss > 10000) severity = "medium";
        
        events.push({
          id: `${regionId}-${sector.toLowerCase()}`,
          name: `TC Lola - ${regionName} (${sector})`,
          date: "2024-01-30", // TC Lola event date
          hazardId: "tropical-cyclone",
          sectorId: sector,
          districtId: regionId,
          provinceId: getProvinceIdFromDistrictId(regionId),
          location: {
            lat: centroid.lat,
            lng: centroid.lng,
          },
          severity,
          affectedPopulation: exposedBuildings * 4, // Rough estimate: 4 people per building
          economicDamage: loss,
          countryCode: "VU",
        } as Event);
      }
    });
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
    regionalImpactsBySectorData,
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
    loadRegionalImpactsBySector(),
    loadExposureByCluster(),
    loadNationalSummary(),
    loadImpactByAssetType(),
    loadImpactBySector(),
    loadRegionalSummary(),
    loadRegionalSummaryBySector(),
    loadDamagedBuildings(),
    loadDamagedRoads()
  ]);
  
  // Convert regional impacts by sector to sector-specific events
  const events = regionalImpactsBySectorData 
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorData) 
    : [];
  
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
  const { data } = await loadGeoJSON('/damaged-buildings.geojson');
  return data;
}

/**
 * Load damaged roads from geojson file
 */
export async function loadDamagedRoads() {
  const { data } = await loadGeoJSON('/damaged-roads.geojson');
  return data;
}

/**
 * Load regional summary by sector CSV data
 */
/**
 * Load regional summary by sector CSV data
 */
export async function loadRegionalSummaryBySector() {
  const { data: csvText } = await loadTextData('/regional-summary-by-sector.csv');
  return csvText ? parseCSV(csvText) : null;
}
