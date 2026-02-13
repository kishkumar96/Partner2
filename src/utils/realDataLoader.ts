/**
 * Utility to load real data from the project data files
 */

import { Event, RegionalImpact } from "@/types";
import type { RealDataLoadResult } from "@/types/realData";
import { loadCycloneForecastTrack } from "./cycloneAnimationLoader";
import { parseCSV } from "./csvParser";
import { loadGeoJSON, loadTextData } from "./dataLoader";

/**
 * Load cyclone track data from the geojson file
 */
export async function loadCycloneTrackData() {
  const { data } = await loadGeoJSON('/cyclone-track.geojson', { cache: true });
  return data;
}

/**
 * Load regional impacts from geojson file (9.2MB - cached)
 */
export async function loadRegionalImpacts() {
  const { data } = await loadGeoJSON('/regional-impacts.geojson', { cache: true });
  return data;
}

/**
 * Load regional impacts by sector from geojson file (2.6MB - cached)
 */
export async function loadRegionalImpactsBySector() {
  const { data } = await loadGeoJSON('/regional-impacts-by-sector.geojson', { cache: true });
  return data;
}

/**
 * Load exposure by cluster data
 */
export async function loadExposureByCluster() {
  const { data } = await loadGeoJSON('/exposure-by-cluster.geojson', { cache: true });
  return data;
}

// CSV parsing now handled by unified csvParser utility

/**
 * Load national summary CSV data
 */
export async function loadNationalSummary() {
  const { data: csvText } = await loadTextData('/national-summary.csv', { cache: true });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by asset type CSV data
 */
export async function loadImpactByAssetType() {
  const { data: csvText } = await loadTextData('/impact-by-asset-type.csv', { cache: true });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by sector CSV data
 */
export async function loadImpactBySector() {
  const { data: csvText } = await loadTextData('/impact-by-sector.csv', { cache: true });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load regional summary CSV data
 */
export async function loadRegionalSummary() {
  const { data: csvText } = await loadTextData('/regional-summary.csv', { cache: true });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load regional summary by sector CSV data
 */
export async function loadRegionalSummaryBySector() {
  const { data: csvText } = await loadTextData('/regional-summary-by-sector.csv', { cache: true });
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

/**
 * Convert regional impacts GeoJSON to regional impact data
 * This creates RegionalImpact objects, NOT individual events
 */
export function convertRegionalImpactsToRegionalImpacts(geojson: any, eventId: string): RegionalImpact[] {
  if (!geojson || !geojson.features) return [];
  
  const regionalImpacts: RegionalImpact[] = geojson.features
    .filter((feature: any) => {
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
      
      const maxWindGusts = Number(props.Max_Wind_Gusts) || 0;
      const severity: "low" | "medium" | "high" | "critical" = 
        maxWindGusts > 200 ? "critical" : 
        maxWindGusts > 150 ? "high" : 
        maxWindGusts > 100 ? "medium" : "low";
      
      return {
        id: `${eventId}-${regionId}`,
        eventId,
        regionId,
        regionName,
        regionType: 'district' as const,
        location: {
          lat: centroid.lat,
          lng: centroid.lng,
        },
        severity,
        affectedPopulation: Number(props.Population_Exposed_To_Any_Hazard) || 0,
        economicDamage: Number(props.Total_Loss) || 0,
      } as RegionalImpact;
    });
  
  return regionalImpacts;
}

/**
 * Expand events to regional-level entries for backward compatibility
 * with existing filter/visualization code that expects one entry per region
 * 
 * @param events - Array of events (may have nested regionalImpacts)
 * @returns Expanded array with one entry per regional impact
 */
export function expandEventsToRegionalEntries(events: Event[]): Event[] {
  const expandedEvents: Event[] = [];
  
  events.forEach(event => {
    if (event.regionalImpacts && event.regionalImpacts.length > 0) {
      // Create event-like entry for each regional impact
      event.regionalImpacts.forEach(ri => {
        expandedEvents.push({
          ...event,
          id: ri.id,
          name: `${event.name} - ${ri.regionName}`,
          districtId: ri.regionId,
          provinceId: getProvinceIdFromDistrictId(ri.regionId),
          sectorId: 'Infrastructure', // Default sector
          affectedPopulation: ri.affectedPopulation,
          economicDamage: ri.economicDamage,
          location: ri.location,
          severity: ri.severity,
          // Keep the aggregated totals for reference
          totalAffectedPopulation: ri.affectedPopulation,
          totalEconomicDamage: ri.economicDamage,
          affectedRegions: 1,
        } as Event);
      });
    } else {
      // No regional data, use event as-is
      expandedEvents.push(event);
    }
  });
  
  return expandedEvents;
}

/**
 * DEPRECATED: Old function for backward compatibility
 * Convert regional impacts GeoJSON to event data for the dashboard
 * @deprecated Use convertRegionalImpactsToRegionalImpacts and create single event instead
 */
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
        totalAffectedPopulation: Number(props.Population_Exposed_To_Any_Hazard) || 0,
        totalEconomicDamage: Number(props.Total_Loss) || 0,
        affectedRegions: 1,
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
          totalAffectedPopulation: exposedBuildings * 4,
          totalEconomicDamage: loss,
          affectedRegions: 1,
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
export async function loadAllRealData(): Promise<RealDataLoadResult> {
  if (process.env.NODE_ENV !== "production") {
    console.log('Loading real data from files...');
  }
  
  const [
    cycloneTrack,
    cycloneForecast,
    regionalImpacts,
    regionalImpactsBySectorGeoJSON,
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
    loadRegionalImpactsBySector(), // Load sector-specific regional data
    loadExposureByCluster(),
    loadNationalSummary(),
    loadImpactByAssetType(),
    loadImpactBySector(),
    loadRegionalSummary(),
    loadRegionalSummaryBySector(),
    loadDamagedBuildings(),
    loadDamagedRoads()
  ]);
  
  // Create a SINGLE event for TC Lola (the actual cyclone event)
  const tcLolaEventId = 'tc-lola-2024';
  
  // Convert regional impacts to RegionalImpact objects
  const regionalImpactsData = regionalImpacts
    ? convertRegionalImpactsToRegionalImpacts(regionalImpacts, tcLolaEventId)
    : [];
  
  // Calculate national aggregated statistics from regional impacts
  const totalAffectedPopulation = regionalImpactsData.reduce((sum, ri) => sum + ri.affectedPopulation, 0);
  const totalEconomicDamage = regionalImpactsData.reduce((sum, ri) => sum + ri.economicDamage, 0);
  const affectedRegions = regionalImpactsData.length;
  
  // Determine overall severity from regional impacts
  const criticalCount = regionalImpactsData.filter(ri => ri.severity === 'critical').length;
  const highCount = regionalImpactsData.filter(ri => ri.severity === 'high').length;
  const overallSeverity: "low" | "medium" | "high" | "critical" = 
    criticalCount > 0 ? 'critical' :
    highCount > affectedRegions / 2 ? 'high' :
    highCount > 0 ? 'medium' : 'low';
  
  // Create the single TC Lola event
  const tcLolaEvent: Event = {
    id: tcLolaEventId,
    name: 'Tropical Cyclone Lola',
    date: '2024-01-30',
    hazardId: 'tropical-cyclone',
    countryCode: 'VU',
    totalAffectedPopulation,
    totalEconomicDamage,
    affectedRegions,
    severity: overallSeverity,
    location: {
      lat: -17.7333, // Vanuatu center (or could use landfall point)
      lng: 168.3167,
    },
    regionalImpacts: regionalImpactsData,
  };
  
  // Events array now contains only ONE event
  const events = [tcLolaEvent];
  
  // Also create sector-specific events for filtering (backward compatibility)
  // This allows sector filtering to work correctly
  const sectorSpecificEvents = regionalImpactsBySectorGeoJSON
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorGeoJSON)
    : [];
  
  // Convert CSV data to dashboard format
  // Use regional-summary-by-sector for sector-specific exposure data
  const exposureData = convertToExposureData(regionalSummaryBySector);
  
  // Separate economic data into sector-level and asset-level
  const sectorEconomicData = convertSectorEconomicData(impactBySector);
  const assetEconomicData = convertAssetEconomicData(impactByAsset);
  
  // Process asset-level exposure data
  const assetExposureData = processAssetExposureData(exposureByCluster);
  
  if (process.env.NODE_ENV !== "production") {
    console.log(`Loaded ${events.length} event(s) from real data`);
    console.log(`   - TC Lola: ${affectedRegions} regions, ${totalAffectedPopulation.toLocaleString()} people affected`);
    console.log(`Loaded ${regionalImpactsData.length} regional impacts for TC Lola`);
    console.log(`Loaded ${exposureData.length} exposure records (sector-specific)`);
    console.log(`Loaded ${sectorEconomicData.length} sector economic damage records`);
    console.log(`Loaded ${assetEconomicData.length} asset economic damage records`);
    if (assetExposureData) {
      console.log(`Processed ${assetExposureData.assets.length} individual assets`);
      console.log(`   - Health Facilities: ${assetExposureData.stats.criticalInfrastructure.healthFacilities}`);
      console.log(`   - Schools: ${assetExposureData.stats.criticalInfrastructure.schools}`);
      console.log(`   - Evacuation Centers: ${assetExposureData.stats.criticalInfrastructure.evacuationCenters}`);
    }
  }
  
  return {
    cycloneTrack,
    cycloneForecast: (cycloneForecast as any) || null,
    regionalImpacts,
    exposureByCluster,
    nationalSummary: (nationalSummary || []) as any,
    impactByAsset: (impactByAsset || []) as any,
    impactBySector: (impactBySector || []) as any,
    regionalSummary: (regionalSummaryData || []) as any,
    regionalSummaryBySector: (regionalSummaryBySector || []) as any,
    damagedBuildings: (damagedBuildings as any) || null,
    damagedRoads: (damagedRoads as any) || null,
    events,
    exposureData,
    economicDamageData: [...sectorEconomicData, ...assetEconomicData], // Combined for backward compatibility
    sectorEconomicData,
    assetEconomicData,
    assetExposureData,
    regionalImpactsData, // Add regional impacts to the result
    sectorSpecificEvents, // Sector-specific events for filtering
  };
}

/**
 * Map asset types to their appropriate sectors
 */
function mapAssetToSector(assetType: string): string {
  const assetSectorMap: Record<string, string> = {
    'School': 'Education',
    'Hospital': 'Public',
    'Health Facility': 'Public',
    'Health_Facility': 'Public',
    'Residential Building': 'Residential',
    'Residential_Building': 'Residential',
    'House': 'Residential',
    'Road': 'Infrastructure',
    'Bridge': 'Infrastructure',
    'Port': 'Infrastructure',
    'Airport': 'Infrastructure',
    'Power_Station': 'Infrastructure',
    'Water_Treatment': 'Infrastructure',
    'Commercial': 'Productive',
    'Office': 'Productive',
    'Factory': 'Productive',
    'Farm': 'Productive',
  };
  return assetSectorMap[assetType] || 'Other';
}

/**
 * Convert regional summary by sector CSV to ExposureData format
 * Uses sector-specific data for proper filtering
 */
function convertToExposureData(regionalSummaryBySector: any): any[] {
  if (!regionalSummaryBySector || !Array.isArray(regionalSummaryBySector)) return [];
  
  return regionalSummaryBySector.map((row, index) => ({
    id: `exposure-${index}`,
    hazardId: 'tropical-cyclone',
    sectorId: row.Sector || 'Unknown',
    region: row.Region || 'Unknown',
    population: Number(row.Population_Exposed_To_Any_Hazard) || 0,
    assets: Number(row.Total_Exposed_Value_To_Any_Hazard) || 0,
    infrastructure: Number(row.Exposed_Infrastructure) || 0,
    buildingCount: Number(row.Number_Exposed_Buildings) || 0,
  }));
}

/**
 * Convert impact by sector CSV to EconomicDamageData format (sector-level)
 */
function convertSectorEconomicData(impactBySector: any): any[] {
  if (!impactBySector || !Array.isArray(impactBySector)) return [];
  
  return impactBySector.map((row, index) => ({
    id: `damage-sector-${index}`,
    hazardId: 'tropical-cyclone',
    sectorId: row.Sector || 'Unknown',
    region: row.Region || 'National',
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    buildingCount: Number(row.Number_Damaged_Buildings) || Number(row.Number_Exposed_Buildings) || 0,
    year: 2023, // TC Lola actual event date: October 2023
    eventId: 'tc-lola-2023',
    sector: row.Sector || 'Unknown',
  }));
}

/**
 * Convert impact by asset type CSV to AssetDamageData format (asset-level)
 */
function convertAssetEconomicData(impactByAsset: any): any[] {
  if (!impactByAsset || !Array.isArray(impactByAsset)) return [];
  
  return impactByAsset.map((row, index) => ({
    id: `damage-asset-${index}`,
    hazardId: 'tropical-cyclone',
    assetType: row.Asset || 'Unknown',
    sectorId: mapAssetToSector(row.Asset || 'Unknown'), // Correct sector mapping
    assetCount: Number(row.Number_Damaged) || Number(row.Number_Exposed) || 0,
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    year: 2023, // TC Lola actual event date
    eventId: 'tc-lola-2023',
  }));
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
 * Load damaged buildings from geojson file (35MB - LARGE FILE - cached)
 */
export async function loadDamagedBuildings() {
  const { data } = await loadGeoJSON('/damaged-buildings.geojson', { cache: true });
  return data;
}

/**
 * Load damaged roads from geojson file (cached)
 */
export async function loadDamagedRoads() {
  const { data } = await loadGeoJSON('/damaged-roads.geojson', { cache: true });
  return data;
}

/**
 * Load regional summary by sector CSV data
 */
