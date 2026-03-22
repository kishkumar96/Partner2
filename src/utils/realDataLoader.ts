/**
 * Utility to load real data from the project data files
 */

import { Event, RegionalImpact } from '@/types';
import type { RealDataLoadResult } from '@/types/realData';
import { loadCycloneForecastTrack, type CycloneForecastPoint } from './cycloneAnimationLoader';
import { parseCSV } from './csvParser';
import { loadGeoJSON, loadTextData, type DataLoaderOptions } from './dataLoader';
import { CountryCode } from '@/types/thredds';
import { mapCountryPartnerApis } from '@/services/partnerApiService';

// ---------------------------------------------------------------------------
// Per-country public/ subdirectory paths (must match folder names under public/)
// ---------------------------------------------------------------------------
export const DATA_PATH: Record<CountryCode, string> = {
  VU: '/vanuatu',
  WS: '/samoa',
  TO: '/tonga',
  CK: '/cook-islands',
};

type CountryDataLogicalFile =
  | 'regional-impacts.geojson'
  | 'regional-impacts-by-sector.geojson'
  | 'exposure-by-cluster.geojson'
  | 'national-summary.csv'
  | 'impact-by-asset-type.csv'
  | 'impact-by-sector.csv'
  | 'regional-summary.csv'
  | 'regional-summary-by-sector.csv'
  | 'damaged-buildings.geojson'
  | 'damaged-roads.geojson';

const COUNTRY_DATA_FILE_OVERRIDES: Partial<
  Record<CountryCode, Partial<Record<CountryDataLogicalFile, string>>>
> = {
  // Tonga dataset currently ships with hashed filenames for some files.
  TO: {
    'regional-impacts.geojson': 'regional-impacts_efhScII.geojson',
    'regional-impacts-by-sector.geojson': 'regional-impacts-by-sector_zprEa4h.geojson',
    'national-summary.csv': 'national-summary_SCV3LWV.csv',
    'impact-by-sector.csv': 'impact-by-sector_XQWXONf.csv',
    'damaged-buildings.geojson': 'damaged-buildings_fn3Gn3X.geojson',
  },
};

export function getCountryDataFilePath(
  countryCode: CountryCode,
  logicalFile: CountryDataLogicalFile
): string {
  const basePath = DATA_PATH[countryCode];
  const resolvedFile = COUNTRY_DATA_FILE_OVERRIDES[countryCode]?.[logicalFile] ?? logicalFile;
  return `${basePath}/${resolvedFile}`;
}

const NEXT_PUBLIC_BASE_PATH =
  process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_BASE_PATH ?? '/partner2'
    : process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function withBasePath(path: string): string {
  if (!NEXT_PUBLIC_BASE_PATH) return path;
  return `${NEXT_PUBLIC_BASE_PATH}${path}`;
}

interface CountryCycloneConfig {
  trackFile?: string; // relative to its country DATA_PATH
  forecastFile?: string; // relative to its country DATA_PATH
  eventId: string;
  eventName: string;
  eventDate: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  center: { lat: number; lng: number };
}

export const COUNTRY_CYCLONE_CONFIG: Record<CountryCode, CountryCycloneConfig> = {
  VU: {
    trackFile: 'cyclone-track.geojson',
    forecastFile: 'cyclone-lola-forecast.csv',
    eventId: 'tc-lola-2024',
    eventName: 'Tropical Cyclone Lola',
    eventDate: '2024-01-30',
    bbox: [165, -21, 170, -13],
    center: { lat: -17.7333, lng: 168.3167 },
  },
  WS: {
    trackFile: 'cyclone-track.geojson',
    forecastFile: 'Official_Forecast_Track_GITA_SA.csv',
    eventId: 'tc-gita-samoa-2018',
    eventName: 'Tropical Cyclone Gita',
    eventDate: '2018-02-09',
    bbox: [-173, -15, -171, -13],
    center: { lat: -13.759, lng: -172.1046 },
  },
  TO: {
    trackFile: 'cyclone-track.geojson',
    forecastFile: 'cyclone-forecast.csv',
    eventId: 'tc-harold-tonga-2020',
    eventName: 'Tropical Cyclone Harold',
    eventDate: '2020-04-09',
    bbox: [-177, -23, -173, -18],
    center: { lat: -21.179, lng: -175.198 },
  },
  CK: {
    trackFile: 'cyclone-track.geojson',
    forecastFile: 'cyclone-forecast.csv',
    eventId: 'tc-ck-event',
    eventName: 'Tropical Cyclone Event',
    eventDate: '2024-01-01',
    bbox: [-161, -23, -157, -18],
    center: { lat: -21.2367, lng: -159.7777 },
  },
};

/**
 * Unwraps a LineString's longitude coordinates across the antimeridian.
 * When adjacent points differ by more than 180°, adjusts by ±360° to keep
 * the path continuous — prevents MapLibre from drawing a line across the globe.
 */
export function unwrapAntimeridianLine(coords: [number, number][]): [number, number][] {
  if (coords.length < 2) return coords;
  const result: [number, number][] = [[...coords[0]] as [number, number]];
  let offset = 0;
  for (let i = 1; i < coords.length; i++) {
    const prevUnwrapped = result[i - 1][0];
    const rawLon = coords[i][0];
    const currWithOffset = rawLon + offset;
    const diff = currWithOffset - prevUnwrapped;
    if (diff > 180) {
      offset -= 360;
    } else if (diff < -180) {
      offset += 360;
    }
    result.push([rawLon + offset, coords[i][1]]);
  }
  return result;
}

/**
 * Load cyclone track data from the geojson file.
 * Automatically unwraps antimeridian crossings so MapLibre renders
 * the track as a continuous line rather than a globe-spanning artifact.
 * @param options.trackFile - Full relative path to the track file (e.g. '/vanuatu/cyclone-track.geojson')
 */
export async function loadCycloneTrackData(
  options: DataLoaderOptions & { trackFile?: string } = {}
) {
  const { trackFile = '/vanuatu/cyclone-track.geojson', ...loaderOptions } = options;
  const { data } = await loadGeoJSON(trackFile, {
    cache: true,
    signal: loaderOptions.signal,
  });

  // Unwrap antimeridian crossings in LineString/MultiLineString geometries
  if (data) {
    const unwrapped = JSON.parse(JSON.stringify(data));
    for (const feature of unwrapped.features ?? []) {
      if (feature.geometry?.type === 'LineString') {
        feature.geometry.coordinates = unwrapAntimeridianLine(
          feature.geometry.coordinates as [number, number][]
        );
      } else if (feature.geometry?.type === 'MultiLineString') {
        feature.geometry.coordinates = (feature.geometry.coordinates as [number, number][][]).map(
          unwrapAntimeridianLine
        );
      }
    }
    return unwrapped;
  }
  return data;
}

function hasTrackGeometry(trackData: any): boolean {
  if (!trackData || !Array.isArray(trackData.features) || trackData.features.length === 0) {
    return false;
  }

  return trackData.features.some(
    (feature: any) =>
      feature?.geometry?.type === 'LineString' &&
      Array.isArray(feature?.geometry?.coordinates) &&
      feature.geometry.coordinates.length > 1
  );
}

export function buildCycloneTrackFromForecastPoints(forecastPoints: CycloneForecastPoint[]) {
  if (!forecastPoints || forecastPoints.length < 2) {
    return null;
  }

  const sortedPoints = [...forecastPoints].sort((a, b) => a.time.getTime() - b.time.getTime());
  const coordinates: [number, number][] = sortedPoints.map(point => [
    point.longitude,
    point.latitude,
  ]);

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: unwrapAntimeridianLine(coordinates),
        },
        properties: {
          source: 'forecast_fallback',
        },
      },
    ],
  };
}

/**
 * Load regional impacts from geojson file (9.2MB - cached)
 */
export async function loadRegionalImpacts(
  options: DataLoaderOptions & { basePath?: string; countryCode?: CountryCode } = {}
) {
  const {
    basePath = '/vanuatu',
    countryCode,
    ...loaderOptions
  } = options as DataLoaderOptions & {
    basePath?: string;
    countryCode?: CountryCode;
  };
  const path = countryCode
    ? getCountryDataFilePath(countryCode, 'regional-impacts.geojson')
    : `${basePath}/regional-impacts.geojson`;
  const { data } = await loadGeoJSON(path, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return data;
}

/**
 * Load regional impacts by sector from geojson file (2.6MB - cached)
 */
export async function loadRegionalImpactsBySector(
  options: DataLoaderOptions & { basePath?: string; countryCode?: CountryCode } = {}
) {
  const {
    basePath = '/vanuatu',
    countryCode,
    ...loaderOptions
  } = options as DataLoaderOptions & {
    basePath?: string;
    countryCode?: CountryCode;
  };
  const path = countryCode
    ? getCountryDataFilePath(countryCode, 'regional-impacts-by-sector.geojson')
    : `${basePath}/regional-impacts-by-sector.geojson`;
  const { data } = await loadGeoJSON(path, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return data;
}

/**
 * Load exposure by cluster data
 */
export async function loadExposureByCluster(
  options: DataLoaderOptions & { basePath?: string } = {}
) {
  const { basePath = '/vanuatu', ...loaderOptions } = options;
  const { data } = await loadGeoJSON(`${basePath}/exposure-by-cluster.geojson`, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return data;
}

// CSV parsing now handled by unified csvParser utility

/**
 * Load national summary CSV data
 */
export async function loadNationalSummary(
  options: DataLoaderOptions & { basePath?: string; countryCode?: CountryCode } = {}
) {
  const {
    basePath = '/vanuatu',
    countryCode,
    ...loaderOptions
  } = options as DataLoaderOptions & {
    basePath?: string;
    countryCode?: CountryCode;
  };
  const path = countryCode
    ? getCountryDataFilePath(countryCode, 'national-summary.csv')
    : `${basePath}/national-summary.csv`;
  const { data: csvText } = await loadTextData(path, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by asset type CSV data
 */
export async function loadImpactByAssetType(
  options: DataLoaderOptions & { basePath?: string } = {}
) {
  const { basePath = '/vanuatu', ...loaderOptions } = options;
  const { data: csvText } = await loadTextData(`${basePath}/impact-by-asset-type.csv`, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load impact by sector CSV data
 */
export async function loadImpactBySector(
  options: DataLoaderOptions & { basePath?: string; countryCode?: CountryCode } = {}
) {
  const {
    basePath = '/vanuatu',
    countryCode,
    ...loaderOptions
  } = options as DataLoaderOptions & {
    basePath?: string;
    countryCode?: CountryCode;
  };
  const path = countryCode
    ? getCountryDataFilePath(countryCode, 'impact-by-sector.csv')
    : `${basePath}/impact-by-sector.csv`;
  const { data: csvText } = await loadTextData(path, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return csvText ? parseCSV(csvText) : null;
}

/**
 * Load regional summary CSV data
 */
export async function loadRegionalSummary(options: DataLoaderOptions & { basePath?: string } = {}) {
  const { basePath = '/vanuatu', ...loaderOptions } = options;
  const { data: csvText } = await loadTextData(`${basePath}/regional-summary.csv`, {
    cache: true,
    signal: loaderOptions.signal,
  });
  return csvText ? parseCSV(csvText) : null;
}

function normalizeRegionJoinValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function getRegionJoinCandidates(record: Record<string, unknown>): string[] {
  return [
    record.Region_ID,
    record['Region.ID'],
    record.Region,
    record['Region.Region'],
    record.ID,
  ]
    .map(normalizeRegionJoinValue)
    .filter(Boolean);
}

export function enrichRegionalImpactsWithSummary(
  geojson: any,
  regionalSummary: Array<Record<string, unknown>> | null | undefined
) {
  if (!geojson?.features || !regionalSummary || regionalSummary.length === 0) {
    return geojson;
  }

  const summaryByKey = new Map<string, Record<string, unknown>>();
  regionalSummary.forEach(row => {
    getRegionJoinCandidates(row).forEach(key => {
      if (!summaryByKey.has(key)) {
        summaryByKey.set(key, row);
      }
    });
  });

  const enrichedFeatures = geojson.features.map((feature: any) => {
    const props = feature?.properties ?? {};
    const match = getRegionJoinCandidates(props)
      .map(key => summaryByKey.get(key))
      .find(Boolean);

    if (!match) {
      return feature;
    }

    return {
      ...feature,
      properties: {
        ...props,
        ...match,
      },
    };
  });

  return {
    ...geojson,
    features: enrichedFeatures,
  };
}

/**
 * Load regional summary by sector CSV data
 */
export async function loadRegionalSummaryBySector(
  options: DataLoaderOptions & { basePath?: string } = {}
) {
  const { basePath = '/vanuatu', ...loaderOptions } = options;
  const { data: csvText } = await loadTextData(`${basePath}/regional-summary-by-sector.csv`, {
    cache: true,
    signal: loaderOptions.signal,
  });
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
export function convertRegionalImpactsToRegionalImpacts(
  geojson: any,
  eventId: string
): RegionalImpact[] {
  if (!geojson || !geojson.features) return [];

  const regionalImpacts: RegionalImpact[] = geojson.features
    .filter((feature: any) => {
      // GeoJSON spec permits null geometry (feature exists but has no spatial extent).
      // RiskScape outputs sometimes include summary/total rows as null-geometry features.
      // Silently skip these — they carry no renderable geometry.
      if (!feature || !feature.geometry || !feature.properties) {
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
      const severity: 'low' | 'medium' | 'high' | 'critical' =
        maxWindGusts > 200
          ? 'critical'
          : maxWindGusts > 150
            ? 'high'
            : maxWindGusts > 100
              ? 'medium'
              : 'low';

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
          parentEventId: event.id,
          name: `${event.name} - ${ri.regionName}`,
          districtId: ri.regionId,
          // ri.regionId from regional-impacts GeoJSON is a province-level ID (e.g. "VUT.1_1").
          // getProvinceIdFromDistrictId() only works for admin2 VUxxxx IDs.
          provinceId: ri.regionId,
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
        date: '2024-01-30', // TC Lola event date
        hazardId: 'tropical-cyclone',
        sectorId: 'Infrastructure', // Primary sector for regional aggregation
        districtId: regionId,
        provinceId: getProvinceIdFromDistrictId(regionId),
        location: {
          lat: centroid.lat,
          lng: centroid.lng,
        },
        severity:
          props.Max_Wind_Gusts > 200
            ? 'critical'
            : props.Max_Wind_Gusts > 150
              ? 'high'
              : props.Max_Wind_Gusts > 100
                ? 'medium'
                : 'low',
        affectedPopulation: Number(props.Population_Exposed_To_Any_Hazard) || 0,
        economicDamage: Number(props.Total_Loss) || 0,
        totalAffectedPopulation: Number(props.Population_Exposed_To_Any_Hazard) || 0,
        totalEconomicDamage: Number(props.Total_Loss) || 0,
        affectedRegions: 1,
        countryCode: 'VU', // All current data is for Vanuatu
      } as Event;
    });

  return events;
}

/**
 * Convert regional impacts by sector GeoJSON to sector-specific event data
 * This creates separate events for each sector in each region
 */
export function convertRegionalImpactsBySectorToEvents(
  geojson: any,
  countryCode: CountryCode = 'VU'
): Event[] {
  if (!geojson || !geojson.features) return [];

  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode] ?? COUNTRY_CYCLONE_CONFIG.VU;
  const cycloneLabel = cycloneConfig.eventName.replace(/^Tropical\s+/i, '');

  const sectors = [
    'Education',
    'Infrastructure',
    'Productive',
    'Public',
    'Residential',
    'Other',
    'Unknown',
  ];
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
    sectors.forEach(sector => {
      const sectorLossKey = `Sector.${sector}.Loss`;
      const sectorExposedKey = `Sector.${sector}.Number_Exposed_Buildings`;
      const sectorDamagedKey = `Sector.${sector}.Number_Damaged_Buildings`;

      const loss = Number(props[sectorLossKey]) || 0;
      const exposedBuildings = Number(props[sectorExposedKey]) || 0;
      const damagedBuildings = Number(props[sectorDamagedKey]) || 0;

      // Only create event if there's actual damage or exposure
      if (loss > 0 || exposedBuildings > 0 || damagedBuildings > 0) {
        // Calculate severity based on loss amount
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (loss > 1000000) severity = 'critical';
        else if (loss > 100000) severity = 'high';
        else if (loss > 10000) severity = 'medium';

        events.push({
          id: `${regionId}-${sector.toLowerCase()}`,
          parentEventId: cycloneConfig.eventId,
          name: `${cycloneLabel} - ${regionName} (${sector})`,
          date: cycloneConfig.eventDate,
          hazardId: 'tropical-cyclone',
          sectorId: sector,
          districtId: regionId,
          // regionId from the GeoJSON IS a province-level ID (e.g. "VUT.1_1"), so use it directly.
          // getProvinceIdFromDistrictId() only works for admin2 VUxxxx IDs, not admin1 IDs.
          provinceId: regionId,
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
          countryCode,
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
      high: 0, // 150-200 km/h
      moderate: 0, // 100-150 km/h
      low: 0, // < 100 km/h
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
export interface RealDataLoadOptions {
  signal?: AbortSignal;
  includeDamagedAssets?: boolean;
  includeSupplementaryData?: boolean;
  /** Country to load data for. Defaults to 'VU' (Vanuatu). */
  countryCode?: CountryCode;
}

function toArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object'
    );
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.results)) {
      return record.results.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object'
      );
    }
  }

  return [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildCycloneTrackFromPartnerPayload(payload: unknown): GeoJSON.FeatureCollection | null {
  if (payload && typeof payload === 'object') {
    const direct = payload as { type?: string; features?: unknown[] };
    if (direct.type === 'FeatureCollection' && Array.isArray(direct.features)) {
      return payload as GeoJSON.FeatureCollection;
    }
  }

  const rows = toArrayPayload(payload);
  if (rows.length === 0) return null;

  const points: Array<{ lon: number; lat: number; timestamp?: string }> = [];

  rows.forEach(row => {
    const lon =
      toNumber(row.longitude) ?? toNumber(row.lon) ?? toNumber(row.lng) ?? toNumber(row.x);
    const lat = toNumber(row.latitude) ?? toNumber(row.lat) ?? toNumber(row.y);

    if (lon === null || lat === null) return;

    points.push({
      lon,
      lat,
      timestamp:
        (typeof row.timestamp === 'string' && row.timestamp) ||
        (typeof row.time === 'string' && row.time) ||
        (typeof row.date === 'string' && row.date) ||
        undefined,
    });
  });

  if (points.length === 0) return null;

  const pointFeatures: GeoJSON.Feature[] = points.map((point, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [point.lon, point.lat],
    },
    properties: {
      source: 'partner_api',
      sequence: index,
      timestamp: point.timestamp,
    },
  }));

  const lineFeature: GeoJSON.Feature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map(point => [point.lon, point.lat]),
    },
    properties: {
      source: 'partner_api',
    },
  };

  return {
    type: 'FeatureCollection',
    features: [lineFeature, ...pointFeatures],
  };
}

function selectPartnerPrimaryEvent(payload: unknown): { name?: string; date?: string } | null {
  const events = toArrayPayload(payload);
  if (events.length === 0) return null;

  const first = events[0];
  const name =
    (typeof first.name === 'string' && first.name) ||
    (typeof first.event_name === 'string' && first.event_name) ||
    (typeof first.title === 'string' && first.title) ||
    undefined;
  const date =
    (typeof first.date === 'string' && first.date) ||
    (typeof first.event_date === 'string' && first.event_date) ||
    (typeof first.timestamp === 'string' && first.timestamp) ||
    undefined;

  return { name, date };
}

function toObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object'
  );
}

function extractPartnerRegionalSummaryRows(
  riskRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  for (const row of riskRows) {
    const geometryRows = toObjectArray(row.geometry);
    if (geometryRows.length === 0) continue;

    const sample = geometryRows[0];
    const hasRegion = typeof sample.Region === 'string' && sample.Region.length > 0;
    const hasSummarySignals =
      sample.Total_Population !== undefined ||
      sample.Population_Exposed_To_Any_Hazard !== undefined ||
      sample.Damaged_Buildings !== undefined;

    if (hasRegion && hasSummarySignals) {
      return geometryRows;
    }
  }

  return [];
}

function extractPartnerImpactByAssetRows(
  riskRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const assetTotals = new Map<
    string,
    {
      totalLoss: number;
      totalValue: number;
      damagedCount: number;
      exposedCount: number;
    }
  >();

  for (const row of riskRows) {
    if (!row.geometry || typeof row.geometry !== 'object') continue;
    const geometry = row.geometry as { type?: unknown; features?: unknown[] };
    if (geometry.type !== 'FeatureCollection' || !Array.isArray(geometry.features)) continue;

    for (const feature of geometry.features) {
      if (!feature || typeof feature !== 'object') continue;
      const properties = (feature as { properties?: unknown }).properties;
      if (!properties || typeof properties !== 'object') continue;

      const props = properties as Record<string, unknown>;
      const asset =
        (typeof props.Asset === 'string' && props.Asset.trim()) ||
        (typeof props.asset === 'string' && props.asset.trim()) ||
        'Unknown';
      const totalLoss =
        toNumber(props.Total_Loss) ?? toNumber(props.Loss) ?? toNumber(props.Wind_Loss) ?? 0;
      const totalValue =
        toNumber(props.Total_Exposed_Value) ??
        toNumber(props.Value) ??
        toNumber(props.Exposure) ??
        0;

      if (!assetTotals.has(asset)) {
        assetTotals.set(asset, {
          totalLoss: 0,
          totalValue: 0,
          damagedCount: 0,
          exposedCount: 0,
        });
      }

      const aggregate = assetTotals.get(asset)!;
      aggregate.totalLoss += totalLoss;
      aggregate.totalValue += totalValue;
      aggregate.exposedCount += 1;
      if (totalLoss > 0) {
        aggregate.damagedCount += 1;
      }
    }
  }

  return Array.from(assetTotals.entries()).map(([asset, aggregate]) => ({
    Asset: asset,
    Number_Damaged: aggregate.damagedCount,
    Number_Exposed: aggregate.exposedCount,
    Total_Loss: aggregate.totalLoss,
    Total_Exposed_Value: aggregate.totalValue,
    // Alias expected by existing conversion logic.
    Total_Wind_Loss: aggregate.totalLoss,
    Total_Fluvial_Loss: 0,
    Total_Coastal_Loss: 0,
  }));
}

function hasNonZeroLoss(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some(row => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return (toNumber(record.Total_Loss) ?? 0) > 0;
  });
}

function buildNationalSummaryFromRegionalRows(
  regionalRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (regionalRows.length === 0) return [];

  const sum = (field: string) =>
    regionalRows.reduce((total, row) => total + (toNumber(row[field]) ?? 0), 0);
  const max = (field: string) =>
    regionalRows.reduce((peak, row) => Math.max(peak, toNumber(row[field]) ?? 0), 0);

  return [
    {
      Region: 'National',
      Total_Loss: sum('Total_Loss'),
      Total_Population: sum('Total_Population'),
      Population_Exposed_To_Any_Hazard: sum('Population_Exposed_To_Any_Hazard'),
      Total_Buildings: sum('Total_Buildings'),
      Damaged_Buildings: sum('Damaged_Buildings'),
      Exposed_Households: sum('Exposed_Households'),
      Total_Households: sum('Total_Households'),
      Damaged_Road_km: sum('Damaged_Road_km'),
      Total_Road_km: sum('Total_Road_km'),
      Crop_Loss: sum('Crop_Loss'),
      Total_Crop_Value: sum('Total_Crop_Value'),
      Max_Wind_Gusts: max('Max_Wind_Gusts'),
      Total_Exposed_Value_To_Any_Hazard: sum('Total_Exposed_Value_To_Any_Hazard'),
      Total_Value: sum('Total_Value'),
    },
  ];
}

async function loadPartnerApiCountryData(
  countryCode: CountryCode,
  signal?: AbortSignal
): Promise<{
  countryId: number | null;
  cycloneTrack: GeoJSON.FeatureCollection | null;
  eventMeta: { name?: string; date?: string } | null;
  riskRegionalSummary: Array<Record<string, unknown>>;
  riskImpactByAsset: Array<Record<string, unknown>>;
}> {
  // Partner API mapping requested for Samoa and Tonga only.
  if (countryCode !== 'WS' && countryCode !== 'TO') {
    return {
      countryId: null,
      cycloneTrack: null,
      eventMeta: null,
      riskRegionalSummary: [],
      riskImpactByAsset: [],
    };
  }

  try {
    const mapping = await mapCountryPartnerApis(countryCode);

    if (!mapping.scopedUrls) {
      return {
        countryId: mapping.countryId,
        cycloneTrack: null,
        eventMeta: null,
        riskRegionalSummary: [],
        riskImpactByAsset: [],
      };
    }

    const [cycloneResponse, eventResponse, riskResponse] = await Promise.all([
      fetch(mapping.scopedUrls.cyclone_track, { signal }),
      fetch(mapping.scopedUrls.event, { signal }),
      fetch(mapping.scopedUrls.risk_information, { signal }),
    ]);

    const cyclonePayload = cycloneResponse.ok ? await cycloneResponse.json() : null;
    const eventPayload = eventResponse.ok ? await eventResponse.json() : null;
    const riskPayload = riskResponse.ok ? await riskResponse.json() : null;
    const riskRows = toArrayPayload(riskPayload);

    return {
      countryId: mapping.countryId,
      cycloneTrack: buildCycloneTrackFromPartnerPayload(cyclonePayload),
      eventMeta: selectPartnerPrimaryEvent(eventPayload),
      riskRegionalSummary: extractPartnerRegionalSummaryRows(riskRows),
      riskImpactByAsset: extractPartnerImpactByAssetRows(riskRows),
    };
  } catch (_error) {
    // Any partner API failure falls through to existing local-file loaders.
    return {
      countryId: null,
      cycloneTrack: null,
      eventMeta: null,
      riskRegionalSummary: [],
      riskImpactByAsset: [],
    };
  }
}

export async function loadAllRealData(
  options: RealDataLoadOptions = {}
): Promise<RealDataLoadResult> {
  const {
    signal,
    includeDamagedAssets = true,
    includeSupplementaryData = true,
    countryCode = 'VU',
  } = options;
  const basePath = DATA_PATH[countryCode];
  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode];
  const trackFile = cycloneConfig.trackFile ? `${basePath}/${cycloneConfig.trackFile}` : null;
  const forecastFile = cycloneConfig.forecastFile
    ? `${basePath}/${cycloneConfig.forecastFile}`
    : null;
  const partnerData = await loadPartnerApiCountryData(countryCode, signal);
  const cycloneTrackSource: 'partner_api' | 'local_files' = partnerData.cycloneTrack
    ? 'partner_api'
    : 'local_files';
  const eventMetadataSource: 'partner_api' | 'local_files' = partnerData.eventMeta
    ? 'partner_api'
    : 'local_files';
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Loading real data for ${countryCode} from ${basePath}...`);
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
    damagedRoads,
  ] = await Promise.all([
    partnerData.cycloneTrack
      ? Promise.resolve(partnerData.cycloneTrack)
      : trackFile
        ? loadCycloneTrackData({ signal, trackFile })
        : Promise.resolve(null),
    forecastFile ? loadCycloneForecastTrack({ signal, forecastFile }) : Promise.resolve(null),
    loadRegionalImpacts({ signal, basePath, countryCode }),
    includeSupplementaryData
      ? loadRegionalImpactsBySector({ signal, basePath, countryCode }) // Load sector-specific regional data
      : Promise.resolve(null),
    includeSupplementaryData ? loadExposureByCluster({ signal, basePath }) : Promise.resolve(null),
    includeSupplementaryData
      ? loadNationalSummary({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeSupplementaryData ? loadImpactByAssetType({ signal, basePath }) : Promise.resolve(null),
    includeSupplementaryData
      ? loadImpactBySector({ signal, basePath, countryCode })
      : Promise.resolve(null),
    loadRegionalSummary({ signal, basePath }),
    includeSupplementaryData
      ? loadRegionalSummaryBySector({ signal, basePath })
      : Promise.resolve(null),
    includeDamagedAssets ? loadDamagedBuildings({ signal, countryCode }) : Promise.resolve(null),
    includeDamagedAssets ? loadDamagedRoads({ signal, countryCode }) : Promise.resolve(null),
  ]);

  // Prefer partner risk_information values when local summary/asset CSVs are empty or zeroed.
  const regionalSummaryFromPartner = partnerData.riskRegionalSummary;
  const impactByAssetFromPartner = partnerData.riskImpactByAsset;

  const effectiveRegionalSummary =
    regionalSummaryFromPartner.length > 0 && !hasNonZeroLoss(regionalSummaryData)
      ? regionalSummaryFromPartner
      : regionalSummaryData;
  const enrichedRegionalImpacts = enrichRegionalImpactsWithSummary(
    regionalImpacts,
    (effectiveRegionalSummary || []) as Array<Record<string, unknown>>
  );

  const nationalSummaryFromPartner = buildNationalSummaryFromRegionalRows(
    regionalSummaryFromPartner
  );
  const effectiveNationalSummary =
    nationalSummaryFromPartner.length > 0 && !hasNonZeroLoss(nationalSummary)
      ? nationalSummaryFromPartner
      : nationalSummary;

  const effectiveImpactByAsset =
    impactByAssetFromPartner.length > 0 && !hasNonZeroLoss(impactByAsset)
      ? impactByAssetFromPartner
      : impactByAsset;

  const effectiveCycloneTrack = hasTrackGeometry(cycloneTrack)
    ? cycloneTrack
    : cycloneForecast
      ? buildCycloneTrackFromForecastPoints(cycloneForecast)
      : null;

  // Create a SINGLE event for the country's primary cyclone event
  const primaryEventId = cycloneConfig.eventId;

  // Convert regional impacts to RegionalImpact objects
  const regionalImpactsData = enrichedRegionalImpacts
    ? convertRegionalImpactsToRegionalImpacts(enrichedRegionalImpacts, primaryEventId)
    : [];

  // Calculate national aggregated statistics from regional impacts
  const totalAffectedPopulation = regionalImpactsData.reduce(
    (sum, ri) => sum + ri.affectedPopulation,
    0
  );
  const totalEconomicDamage = regionalImpactsData.reduce((sum, ri) => sum + ri.economicDamage, 0);
  const affectedRegions = regionalImpactsData.length;

  // Determine overall severity from regional impacts
  const criticalCount = regionalImpactsData.filter(ri => ri.severity === 'critical').length;
  const highCount = regionalImpactsData.filter(ri => ri.severity === 'high').length;
  const overallSeverity: 'low' | 'medium' | 'high' | 'critical' =
    criticalCount > 0
      ? 'critical'
      : highCount > affectedRegions / 2
        ? 'high'
        : highCount > 0
          ? 'medium'
          : 'low';

  // Create the single primary cyclone event
  const primaryEvent: Event = {
    id: primaryEventId,
    name: partnerData.eventMeta?.name || cycloneConfig.eventName,
    date: partnerData.eventMeta?.date || cycloneConfig.eventDate,
    hazardId: 'tropical-cyclone',
    countryCode,
    totalAffectedPopulation,
    totalEconomicDamage,
    affectedRegions,
    severity: overallSeverity,
    location: cycloneConfig.center,
    regionalImpacts: regionalImpactsData,
  };

  // Events array now contains only ONE event
  const events = [primaryEvent];

  // Also create sector-specific events for filtering (backward compatibility)
  // This allows sector filtering to work correctly
  const sectorSpecificEvents = regionalImpactsBySectorGeoJSON
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorGeoJSON, countryCode)
    : [];

  // Convert CSV data to dashboard format
  // Use regional-summary-by-sector for sector-specific exposure data
  const exposureData = convertToExposureData(
    regionalSummaryBySector,
    effectiveRegionalSummary,
    countryCode
  );

  // Separate economic data into sector-level and asset-level
  const sectorEconomicData = convertSectorEconomicData(impactBySector, countryCode);
  const assetEconomicData = convertAssetEconomicData(effectiveImpactByAsset, countryCode);

  // Process asset-level exposure data
  const assetExposureData = processAssetExposureData(exposureByCluster);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Loaded ${events.length} event(s) from real data`);
    console.log(
      `   - ${cycloneConfig.eventName} (${countryCode}): ${affectedRegions} regions, ${totalAffectedPopulation.toLocaleString()} people affected`
    );
    console.log(
      `Loaded ${regionalImpactsData.length} regional impacts for ${cycloneConfig.eventName}`
    );
    console.log(`Loaded ${exposureData.length} exposure records (sector-specific)`);
    console.log(`Loaded ${sectorEconomicData.length} sector economic damage records`);
    console.log(`Loaded ${assetEconomicData.length} asset economic damage records`);
    if (assetExposureData) {
      console.log(`Processed ${assetExposureData.assets.length} individual assets`);
      console.log(
        `   - Health Facilities: ${assetExposureData.stats.criticalInfrastructure.healthFacilities}`
      );
      console.log(`   - Schools: ${assetExposureData.stats.criticalInfrastructure.schools}`);
      console.log(
        `   - Evacuation Centers: ${assetExposureData.stats.criticalInfrastructure.evacuationCenters}`
      );
    }
  }

  return {
    cycloneTrack: effectiveCycloneTrack,
    cycloneForecast: (cycloneForecast as any) || null,
    regionalImpacts: enrichedRegionalImpacts,
    exposureByCluster,
    nationalSummary: (effectiveNationalSummary || []) as any,
    impactByAsset: (effectiveImpactByAsset || []) as any,
    impactBySector: (impactBySector || []) as any,
    regionalSummary: (effectiveRegionalSummary || []) as any,
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
    dataSourceInfo: {
      countryCode,
      cycloneTrackSource,
      eventMetadataSource,
    },
  };
}

export async function loadSupplementaryRealData(
  options: Omit<RealDataLoadOptions, 'includeDamagedAssets' | 'includeSupplementaryData'> & {
    regionalSummary: Array<Record<string, unknown>>;
  }
): Promise<
  Pick<
    RealDataLoadResult,
    | 'nationalSummary'
    | 'impactByAsset'
    | 'impactBySector'
    | 'regionalSummaryBySector'
    | 'exposureByCluster'
    | 'exposureData'
    | 'economicDamageData'
    | 'sectorEconomicData'
    | 'assetEconomicData'
    | 'assetExposureData'
    | 'sectorSpecificEvents'
  >
> {
  const { signal, countryCode = 'VU', regionalSummary } = options;
  const basePath = DATA_PATH[countryCode];
  const partnerData = await loadPartnerApiCountryData(countryCode, signal);

  const [
    regionalImpactsBySectorGeoJSON,
    exposureByCluster,
    nationalSummary,
    impactByAsset,
    impactBySector,
    regionalSummaryBySector,
  ] = await Promise.all([
    loadRegionalImpactsBySector({ signal, basePath, countryCode }),
    loadExposureByCluster({ signal, basePath }),
    loadNationalSummary({ signal, basePath, countryCode }),
    loadImpactByAssetType({ signal, basePath }),
    loadImpactBySector({ signal, basePath, countryCode }),
    loadRegionalSummaryBySector({ signal, basePath }),
  ]);

  const impactByAssetFromPartner = partnerData.riskImpactByAsset;
  const nationalSummaryFromPartner = buildNationalSummaryFromRegionalRows(
    partnerData.riskRegionalSummary
  );
  const effectiveNationalSummary =
    nationalSummaryFromPartner.length > 0 && !hasNonZeroLoss(nationalSummary)
      ? nationalSummaryFromPartner
      : nationalSummary;
  const effectiveImpactByAsset =
    impactByAssetFromPartner.length > 0 && !hasNonZeroLoss(impactByAsset)
      ? impactByAssetFromPartner
      : impactByAsset;

  const sectorSpecificEvents = regionalImpactsBySectorGeoJSON
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorGeoJSON, countryCode)
    : [];
  const exposureData = convertToExposureData(regionalSummaryBySector, regionalSummary, countryCode);
  const sectorEconomicData = convertSectorEconomicData(impactBySector, countryCode);
  const assetEconomicData = convertAssetEconomicData(effectiveImpactByAsset, countryCode);
  const assetExposureData = processAssetExposureData(exposureByCluster);

  return {
    nationalSummary: (effectiveNationalSummary || []) as any,
    impactByAsset: (effectiveImpactByAsset || []) as any,
    impactBySector: (impactBySector || []) as any,
    regionalSummaryBySector: (regionalSummaryBySector || []) as any,
    exposureByCluster: (exposureByCluster as any) || null,
    exposureData,
    economicDamageData: [...sectorEconomicData, ...assetEconomicData],
    sectorEconomicData,
    assetEconomicData,
    assetExposureData,
    sectorSpecificEvents,
  };
}

/**
 * Map asset types to their appropriate sectors
 */
function mapAssetToSector(assetType: string): string {
  const assetSectorMap: Record<string, string> = {
    School: 'Education',
    Hospital: 'Public',
    'Health Facility': 'Public',
    Health_Facility: 'Public',
    'Residential Building': 'Residential',
    Residential_Building: 'Residential',
    House: 'Residential',
    Road: 'Infrastructure',
    Bridge: 'Infrastructure',
    Port: 'Infrastructure',
    Airport: 'Infrastructure',
    Power_Station: 'Infrastructure',
    Water_Treatment: 'Infrastructure',
    Commercial: 'Productive',
    Office: 'Productive',
    Factory: 'Productive',
    Farm: 'Productive',
  };
  return assetSectorMap[assetType] || 'Other';
}

/**
 * Convert regional summary by sector CSV to ExposureData format
 * Uses sector-specific data for proper filtering
 *
 * CRITICAL: regional-summary-by-sector.csv has NO population columns.
 * Population is attributed proportionally from regional-summary.csv based on exposed value.
 */
function convertToExposureData(
  regionalSummaryBySector: any,
  regionalSummary: any | undefined,
  countryCode: CountryCode
): any[] {
  if (!regionalSummaryBySector || !Array.isArray(regionalSummaryBySector)) return [];
  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode] ?? COUNTRY_CYCLONE_CONFIG.VU;

  // Build region -> population lookup from full regional summary
  const regionPopulationMap: Record<
    string,
    { total: number; exposed: number; totalExposedValue: number }
  > = {};

  if (regionalSummary && Array.isArray(regionalSummary)) {
    for (const region of regionalSummary) {
      const regionName = String(region.Region || '').trim();
      if (!regionName) continue;

      regionPopulationMap[regionName] = {
        total: Number(region.Total_Population) || 0,
        exposed: Number(region.Population_Exposed_To_Any_Hazard) || 0,
        totalExposedValue: Number(region.Total_Exposed_Value_To_Any_Hazard) || 0,
      };
    }
  }

  return regionalSummaryBySector.map((row, index) => {
    const regionName = String(row.Region || 'Unknown').trim();
    const exposedValue = Number(row.Total_Exposed_Value) || 0;

    // Attribute population proportionally based on this sector's share of regional exposed value
    let attributedPopulation = 0;
    const regionData = regionPopulationMap[regionName];
    if (regionData && regionData.totalExposedValue > 0 && exposedValue > 0) {
      const proportion = exposedValue / regionData.totalExposedValue;
      attributedPopulation = Math.round(regionData.exposed * proportion);
    }

    return {
      id: `exposure-${index}`,
      hazardId: 'tropical-cyclone',
      sectorId: row.Sector || 'Unknown',
      eventId: cycloneConfig.eventId,
      eventDate: cycloneConfig.eventDate,
      region: regionName,
      population: attributedPopulation,
      assets: exposedValue,
      infrastructure: 0, // Not available in regional-summary-by-sector.csv (only in full regional-summary)
      buildingCount: Number(row.Number_Exposed_Buildings) || 0,
    };
  });
}

/**
 * Convert impact by sector CSV to EconomicDamageData format (sector-level)
 */
function convertSectorEconomicData(impactBySector: any, countryCode: CountryCode): any[] {
  if (!impactBySector || !Array.isArray(impactBySector)) return [];

  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode] ?? COUNTRY_CYCLONE_CONFIG.VU;
  const eventYear = Number.parseInt(cycloneConfig.eventDate.slice(0, 4), 10);
  const normalizedYear = Number.isFinite(eventYear) ? eventYear : 2023;

  return impactBySector.map((row, index) => ({
    id: `damage-sector-${index}`,
    hazardId: 'tropical-cyclone',
    sectorId: row.Sector || 'Unknown',
    region: row.Region || 'National',
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    buildingCount:
      Number(row.Number_Damaged_Buildings) || Number(row.Number_Exposed_Buildings) || 0,
    year: normalizedYear,
    eventId: cycloneConfig.eventId,
    eventDate: cycloneConfig.eventDate,
    sector: row.Sector || 'Unknown',
  }));
}

/**
 * Convert impact by asset type CSV to AssetDamageData format (asset-level)
 */
function convertAssetEconomicData(impactByAsset: any, countryCode: CountryCode): any[] {
  if (!impactByAsset || !Array.isArray(impactByAsset)) return [];

  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode] ?? COUNTRY_CYCLONE_CONFIG.VU;
  const eventYear = Number.parseInt(cycloneConfig.eventDate.slice(0, 4), 10);
  const normalizedYear = Number.isFinite(eventYear) ? eventYear : 2023;

  return impactByAsset.map((row, index) => ({
    id: `damage-asset-${index}`,
    hazardId: 'tropical-cyclone',
    assetType: row.Asset || 'Unknown',
    sectorId: mapAssetToSector(row.Asset || 'Unknown'), // Correct sector mapping
    assetCount: Number(row.Number_Damaged) || Number(row.Number_Exposed) || 0,
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    year: normalizedYear,
    eventId: cycloneConfig.eventId,
    eventDate: cycloneConfig.eventDate,
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
 * Load damaged buildings from database API (preferred) or geojson file (fallback)
 * The database provides better performance for large datasets
 */
export async function loadDamagedBuildings(
  options: { signal?: AbortSignal; countryCode?: CountryCode } = {}
) {
  const { signal, countryCode = 'VU' } = options;
  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode];
  const basePath = DATA_PATH[countryCode];
  // Try API first (database)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    const [minLng, minLat, maxLng, maxLat] = cycloneConfig.bbox;
    let response: Response;
    try {
      const buildingsApiPath = withBasePath('/api/buildings');
      response = await fetch(
        `${buildingsApiPath}?bbox=${minLng},${minLat},${maxLng},${maxLat}&country=${countryCode}&limit=100000`,
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = await response.json();
      const isDegraded =
        response.headers.get('X-Data-Status') === 'degraded' || data?.degraded === true;
      const featureCount = Array.isArray(data?.features) ? data.features.length : 0;

      if (!isDegraded && featureCount > 0) {
        console.log(`✅ Loaded ${featureCount} buildings from DATABASE`);
        return data;
      }

      if (!isDegraded && featureCount === 0) {
        console.warn('⚠️ Buildings API returned 0 features, falling back to file data');
      }

      // DB unavailable/empty path from API: continue to file fallback.
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) {
        return null;
      }
      // Internal timeout abort: continue to local file fallback without warning spam.
    } else {
      console.warn(
        '⚠️ Database API unavailable, falling back to file:',
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback to file (cached)
  const filePath = getCountryDataFilePath(countryCode, 'damaged-buildings.geojson');
  console.log(`[Debug] Falling back to file. Loading GeoJSON from: ${filePath}`);
  const { data } = await loadGeoJSON(filePath, {
    cache: true,
    signal,
  });

  const toPointCoordinate = (
    geometry: GeoJSON.Geometry | null | undefined
  ): [number, number] | null => {
    if (!geometry) return null;

    if (geometry.type === 'Point') {
      const coords = geometry.coordinates as number[];
      if (coords.length >= 2) return [coords[0], coords[1]];
      return null;
    }

    const bounds = {
      minLng: Infinity,
      minLat: Infinity,
      maxLng: -Infinity,
      maxLat: -Infinity,
    };

    const visit = (coords: unknown) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const lng = coords[0];
        const lat = coords[1];
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          bounds.minLng = Math.min(bounds.minLng, lng);
          bounds.minLat = Math.min(bounds.minLat, lat);
          bounds.maxLng = Math.max(bounds.maxLng, lng);
          bounds.maxLat = Math.max(bounds.maxLat, lat);
        }
        return;
      }
      coords.forEach(visit);
    };

    if (geometry.type === 'GeometryCollection') {
      geometry.geometries.forEach(geo =>
        visit((geo as GeoJSON.Geometry & { coordinates?: unknown }).coordinates)
      );
    } else {
      visit((geometry as GeoJSON.Geometry & { coordinates?: unknown }).coordinates);
    }

    if (
      !Number.isFinite(bounds.minLng) ||
      !Number.isFinite(bounds.minLat) ||
      !Number.isFinite(bounds.maxLng) ||
      !Number.isFinite(bounds.maxLat)
    ) {
      return null;
    }

    return [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2];
  };

  const pointFeatures =
    data?.features
      ?.map(feature => {
        const point = toPointCoordinate(feature.geometry as GeoJSON.Geometry | null | undefined);
        if (!point) return null;
        return {
          ...feature,
          geometry: {
            type: 'Point' as const,
            coordinates: point,
          },
        };
      })
      .filter(feature => feature !== null) || [];

  const normalizedData = {
    type: 'FeatureCollection' as const,
    features: pointFeatures,
  };

  console.log(
    `📁 Loaded buildings from FILE (normalized to ${normalizedData.features.length} points)`
  );
  return normalizedData;
}

/**
 * Load damaged roads from database API (preferred) or geojson file (fallback)
 */
export async function loadDamagedRoads(
  options: { signal?: AbortSignal; countryCode?: CountryCode } = {}
) {
  const { signal, countryCode = 'VU' } = options;
  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode];
  const basePath = DATA_PATH[countryCode];
  // Try API first (database)
  try {
    const [minLng, minLat, maxLng, maxLat] = cycloneConfig.bbox;
    const roadsApiPath = withBasePath('/api/roads');
    const url = `${roadsApiPath}?bbox=${minLng},${minLat},${maxLng},${maxLat}&country=${countryCode}&limit=10000`;
    console.log('🔍 Attempting to load roads from API:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('📡 API response status:', response.status, response.statusText);

    if (response.ok) {
      const data = await response.json();
      const isDegraded =
        response.headers.get('X-Data-Status') === 'degraded' || data?.degraded === true;
      const featureCount = Array.isArray(data?.features) ? data.features.length : 0;

      if (!isDegraded && featureCount > 0) {
        console.log(`✅ Loaded ${featureCount} roads from DATABASE`);
        console.log(
          '   Sample Total_Loss values:',
          data.features?.slice(0, 3).map((f: any) => f.properties?.Total_Loss)
        );
        return data;
      }

      if (!isDegraded && featureCount === 0) {
        console.warn('⚠️ Roads API returned 0 features, falling back to file data');
      }

      if (isDegraded) {
        console.warn('⚠️ Roads API is degraded, using local file fallback');
      }
    } else {
      console.warn(`⚠️ API returned ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) {
        return null;
      }
      // Internal timeout abort: continue to local file fallback without warning spam.
    } else {
      console.warn(
        '⚠️ Roads API unavailable, falling back to file:',
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback to file (cached)
  if (signal?.aborted) {
    return null;
  }
  console.log('📁 Falling back to damaged-roads.geojson file');
  const filePath = getCountryDataFilePath(countryCode, 'damaged-roads.geojson');
  const { data } = await loadGeoJSON(filePath, {
    cache: true,
    signal,
  });
  console.log(`📁 Loaded ${data?.features?.length || 0} roads from FILE`);
  return data;
}

/**
 * Load regional summary by sector CSV data
 */
