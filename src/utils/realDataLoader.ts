/**
 * Utility to load real data from the project data files
 */

import { Event, RegionalImpact } from '@/types';
import type { RealDataLoadResult } from '@/types/realData';
import {
  loadCycloneForecastTrack,
  parseForecastPointsFromGeometry,
  type CycloneForecastPoint,
} from './cycloneAnimationLoader';
import { parseCSV } from './csvParser';
import { loadGeoJSON, loadTextData, type DataLoaderOptions } from './dataLoader';
import { COUNTRIES, CountryCode } from '@/types/thredds';
import {
  createPartnerEventId,
  type EventRecord,
  getDefaultEventRecord,
  getLocalEventRecords,
  resolveActiveEventRecord,
  resolveEventRecords,
} from '@/data/eventRecords';
import {
  isPartnerApiEnabled,
  isPartnerApiCountryEnabled,
  isPartnerApiCountryStrict,
  mapCountryPartnerApis,
} from '@/services/partnerApiService';
import { getAreaId, getAreaName } from '@/utils/adminNormalization';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';
import type { HazardScenarioSelection, RealWMSLayer } from '@/data/realThreddsLayers';

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
  return appendDataVersion(`${basePath}/${resolvedFile}`);
}

function appendDataVersion(path: string): string {
  const version = process.env.NEXT_PUBLIC_DATA_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(version)}`;
}

const NEXT_PUBLIC_BASE_PATH = getConfiguredBasePath(
  process.env.NODE_ENV === 'production' ? '/partner2' : ''
);

function withBasePath(path: string): string {
  return prependBasePath(path, NEXT_PUBLIC_BASE_PATH);
}

// Rewrites an absolute middleware URL (e.g. from a partner_api response
// field) into a same-origin partner-proxy path, so the browser never talks
// to the middleware host directly. Uses string slicing rather than the URL
// API so any {z}/{x}/{y}-style template placeholders in the path survive
// unencoded.
function proxyPartnerApiUrl(url: string): string {
  const marker = '/partner_api/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) {
    return url;
  }
  return withBasePath(`/api/partner-proxy${url.slice(markerIndex)}`);
}

function normalizeDateValue(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Deprecated compatibility export.
 * New event resolution should use event records from `src/data/eventRecords.ts`.
 */
export const COUNTRY_CYCLONE_CONFIG = Object.fromEntries(
  (['VU', 'WS', 'TO', 'CK'] as CountryCode[]).map(countryCode => {
    const eventRecord = getDefaultEventRecord(countryCode);
    return [
      countryCode,
      {
        trackFile: eventRecord.trackFile,
        forecastFile: eventRecord.forecastFile,
        eventId: eventRecord.id,
        eventName: eventRecord.name,
        eventDate: eventRecord.date,
        bbox: eventRecord.bbox,
        center: eventRecord.location,
      },
    ];
  })
) as Record<
  CountryCode,
  {
    trackFile?: string;
    forecastFile?: string;
    eventId: string;
    eventName: string;
    eventDate: string;
    bbox: [number, number, number, number];
    center: { lat: number; lng: number };
  }
>;

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
  const { data } = await loadGeoJSON(appendDataVersion(trackFile), {
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
    ? getCountryDataFilePath(countryCode, 'exposure-by-cluster.geojson')
    : `${basePath}/exposure-by-cluster.geojson`;
  const { data } = await loadGeoJSON(path, {
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
    ? getCountryDataFilePath(countryCode, 'impact-by-asset-type.csv')
    : `${basePath}/impact-by-asset-type.csv`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[loadImpactByAssetType] Loading from ${path}`);
  }

  const { data: csvText } = await loadTextData(path, {
    cache: true,
    signal: loaderOptions.signal,
  });

  const parsed = csvText ? parseCSV(csvText) : null;

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[loadImpactByAssetType] Loaded ${parsed ? (parsed as any[]).length : 0} rows from ${path}`
    );
  }

  return parsed;
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

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[loadImpactBySector] Loading from ${path}`);
  }

  const { data: csvText } = await loadTextData(path, {
    cache: true,
    signal: loaderOptions.signal,
  });

  const parsed = csvText ? parseCSV(csvText) : null;

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[loadImpactBySector] Loaded ${parsed ? (parsed as any[]).length : 0} rows from ${path}`
    );
  }

  return parsed;
}

/**
 * Load regional summary CSV data
 */
export async function loadRegionalSummary(
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
    ? getCountryDataFilePath(countryCode, 'regional-summary.csv')
    : `${basePath}/regional-summary.csv`;
  const { data: csvText } = await loadTextData(path, {
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
  return [record.Region_ID, record['Region.ID'], record.Region, record['Region.Region'], record.ID]
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
    ? getCountryDataFilePath(countryCode, 'regional-summary-by-sector.csv')
    : `${basePath}/regional-summary-by-sector.csv`;
  const { data: csvText } = await loadTextData(path, {
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
      const regionName = props['Region.Region'] || props.Region || `Region ${index + 1}`;
      const centroid = calculateCentroid(feature.geometry);
      const regionId = props['Region.ID'] || props.Region_ID || props.Region || `region-${index}`;

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
export function convertRegionalImpactsToEvents(
  geojson: any,
  countryCode: CountryCode = 'VU'
): Event[] {
  if (!geojson || !geojson.features) return [];

  const cycloneConfig = COUNTRY_CYCLONE_CONFIG[countryCode] ?? COUNTRY_CYCLONE_CONFIG.VU;
  const cycloneLabel = cycloneConfig.eventName.replace(/^Tropical\s+/i, '');
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
      const regionName = props['Region.Region'] || props.Region || `Region ${index + 1}`;
      const centroid = calculateCentroid(feature.geometry);
      const regionId = props['Region.ID'] || props.Region_ID || props.Region || `region-${index}`;

      return {
        id: regionId,
        name: `${cycloneLabel} Impact - ${regionName}`,
        date: cycloneConfig.eventDate,
        hazardId: 'tropical-cyclone',
        sectorId: 'Infrastructure', // Primary sector for regional aggregation
        districtId: regionId,
        // regionId from these files is a region/admin1 identifier, not a Vanuatu admin2 district ID.
        provinceId: regionId,
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
        countryCode,
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
  selectedEventIds?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
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

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const geometry = row.geometry;
    if (
      geometry &&
      typeof geometry === 'object' &&
      (geometry as { type?: unknown }).type === 'FeatureCollection' &&
      Array.isArray((geometry as { features?: unknown[] }).features) &&
      (geometry as { features: unknown[] }).features.length > 0
    ) {
      const fc = geometry as GeoJSON.FeatureCollection;
      const hasLine = fc.features.some(
        f => f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
      );
      if (hasLine) return fc;

      // Partner API returns Point-per-timestep — synthesize a LineString for map rendering.
      const rawCoords = fc.features
        .filter(f => f?.geometry?.type === 'Point')
        .map(f => (f.geometry as GeoJSON.Point).coordinates as [number, number]);
      if (rawCoords.length > 1) {
        // Unwrap longitudes to handle antimeridian-crossing tracks (e.g. Harold: 157°E→170°W).
        const unwrappedLons: number[] = [rawCoords[0][0]];
        let offset = 0;
        for (let i = 1; i < rawCoords.length; i++) {
          const prev = unwrappedLons[i - 1];
          const raw = rawCoords[i][0];
          const candidate = raw + offset;
          const diff = candidate - prev;
          if (diff > 180) offset -= 360;
          else if (diff < -180) offset += 360;
          unwrappedLons.push(raw + offset);
        }
        const coords = rawCoords.map((c, i) => [unwrappedLons[i], c[1]] as [number, number]);
        const lineFeature: GeoJSON.Feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { source: 'partner_api' },
        };
        return { ...fc, features: [lineFeature, ...fc.features] };
      }
      return fc;
    }
  }

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

function filterPartnerRowsByIds(
  rows: Array<Record<string, unknown>>,
  ids: string[],
  fieldNames: string[]
): Array<Record<string, unknown>> {
  if (ids.length === 0) {
    return rows;
  }

  const idSet = new Set(ids);
  return rows.filter(row =>
    fieldNames.some(fieldName => {
      const rawValue = row[fieldName];
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        return idSet.has(String(rawValue));
      }
      if (typeof rawValue === 'string' && rawValue.trim()) {
        return idSet.has(rawValue.trim());
      }
      return false;
    })
  );
}

function buildCycloneTrackFromPartnerPayloadForTrackIds(
  payload: unknown,
  trackIds: string[]
): GeoJSON.FeatureCollection | null {
  if (trackIds.length === 0) {
    return buildCycloneTrackFromPartnerPayload(payload);
  }

  const filteredRows = filterPartnerRowsByIds(toArrayPayload(payload), trackIds, ['id']);
  return buildCycloneTrackFromPartnerPayload(filteredRows);
}

function selectPartnerPrimaryEvent(
  payload: unknown,
  fallbackRows: Array<Record<string, unknown>> = []
): { name?: string; date?: string } | null {
  const events = toArrayPayload(payload);
  const first = events[0] ?? fallbackRows[0];
  if (!first) return null;

  const name =
    (typeof first.title === 'string' && first.title) ||
    (typeof first.cyclone_name === 'string' && first.cyclone_name) ||
    (typeof first.name === 'string' && first.name) ||
    (typeof first.event_name === 'string' && first.event_name) ||
    (typeof first.CycloneName === 'string' && first.CycloneName) ||
    undefined;
  const date =
    (typeof first.event_datetime === 'string' && first.event_datetime) ||
    (typeof first.issued_time === 'string' && first.issued_time) ||
    (typeof first.date === 'string' && first.date) ||
    (typeof first.event_date === 'string' && first.event_date) ||
    (typeof first.timestamp === 'string' && first.timestamp) ||
    undefined;

  return { name, date };
}

function normalizePartnerEventRow(
  countryCode: CountryCode,
  row: Record<string, unknown>
): EventRecord | null {
  const country = COUNTRIES[countryCode];
  const name =
    (typeof row.event_name === 'string' && row.event_name.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.title === 'string' && row.title.trim()) ||
    (typeof row.cyclone_name === 'string' && row.cyclone_name.trim()) ||
    (typeof row.CycloneName === 'string' && row.CycloneName.trim()) ||
    '';
  const date =
    (typeof row.event_datetime === 'string' && row.event_datetime.trim()) ||
    (typeof row.event_date === 'string' && row.event_date.trim()) ||
    (typeof row.date === 'string' && row.date.trim()) ||
    (typeof row.issued_time === 'string' && row.issued_time.trim()) ||
    (typeof row.timestamp === 'string' && row.timestamp.trim()) ||
    '';
  const explicitId =
    (typeof row.id === 'number' && Number.isFinite(row.id) ? String(row.id) : '') ||
    (typeof row.id === 'string' && row.id.trim()) ||
    (typeof row.event_id === 'string' && row.event_id.trim()) ||
    (typeof row.eventId === 'string' && row.eventId.trim()) ||
    (typeof row.cyclone_id === 'string' && row.cyclone_id.trim()) ||
    (typeof row.cycloneId === 'string' && row.cycloneId.trim()) ||
    '';
  const cycloneTrackId =
    (typeof row.cyclone_track === 'number' && Number.isFinite(row.cyclone_track)
      ? String(row.cyclone_track)
      : '') ||
    (typeof row.cyclone_track === 'string' && row.cyclone_track.trim()) ||
    (typeof row.cycloneTrack === 'number' && Number.isFinite(row.cycloneTrack)
      ? String(row.cycloneTrack)
      : '') ||
    (typeof row.cycloneTrack === 'string' && row.cycloneTrack.trim()) ||
    '';
  const backendHazardIds = Array.isArray(row.hazards)
    ? row.hazards
        .map(value =>
          typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : typeof value === 'string' && value.trim()
              ? value.trim()
              : null
        )
        .filter((value): value is string => value !== null)
    : [];
  const backendRiskIds = Array.isArray(row.risks)
    ? row.risks
        .map(value =>
          typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : typeof value === 'string' && value.trim()
              ? value.trim()
              : null
        )
        .filter((value): value is string => value !== null)
    : [];

  if (!name && !explicitId) {
    return null;
  }
  const normalizedDate = normalizeDateValue(date);
  const eventId =
    explicitId || createPartnerEventId(countryCode, name || country.name, normalizedDate);

  return {
    id: eventId,
    countryCode,
    name: name || country.name,
    date: normalizedDate,
    hazardId: 'tropical-cyclone',
    backendEventId: explicitId || undefined,
    backendCycloneTrackId: cycloneTrackId || undefined,
    backendHazardIds,
    backendRiskIds,
    location: { lat: country.center[1], lng: country.center[0] },
    bbox: [
      country.center[0] - 1,
      country.center[1] - 1,
      country.center[0] + 1,
      country.center[1] + 1,
    ],
    aliases: [
      ...(explicitId ? [explicitId] : []),
      ...(cycloneTrackId ? [`cyclone-track-${cycloneTrackId}`] : []),
    ],
    source: 'partner_api',
  };
}

function normalizePartnerEvents(
  countryCode: CountryCode,
  payload: unknown,
  countryId?: number | null
): EventRecord[] {
  const rows = toArrayPayload(payload);
  const filtered =
    countryId != null ? rows.filter(row => toNumber(row.country) === countryId) : rows;
  return filtered
    .map(row => normalizePartnerEventRow(countryCode, row))
    .filter((record): record is EventRecord => record !== null);
}

function createCountryScopedEventRecord(
  countryCode: CountryCode,
  eventMeta?: { name?: string; date?: string } | null
): EventRecord {
  const country = COUNTRIES[countryCode];
  return {
    id: createPartnerEventId(countryCode, eventMeta?.name || country.name, eventMeta?.date || ''),
    countryCode,
    name: eventMeta?.name || country.name,
    date: eventMeta?.date || '',
    hazardId: 'tropical-cyclone',
    location: { lat: country.center[1], lng: country.center[0] },
    bbox: [
      country.center[0] - 1,
      country.center[1] - 1,
      country.center[0] + 1,
      country.center[1] + 1,
    ],
    source: 'partner_api',
  };
}

type PartnerRiskDataKey =
  | 'regionalImpacts'
  | 'regionalImpactsBySector'
  | 'exposureByCluster'
  | 'nationalSummary'
  | 'impactByAsset'
  | 'impactBySector'
  | 'regionalSummary'
  | 'regionalSummaryBySector'
  | 'damagedBuildings'
  | 'damagedRoads';

interface PartnerRiskBundle {
  regionalImpacts: GeoJSON.FeatureCollection | null;
  regionalImpactsBySector: GeoJSON.FeatureCollection | null;
  exposureByCluster: GeoJSON.FeatureCollection | null;
  nationalSummary: Array<Record<string, unknown>>;
  impactByAsset: Array<Record<string, unknown>>;
  impactBySector: Array<Record<string, unknown>>;
  regionalSummary: Array<Record<string, unknown>>;
  regionalSummaryBySector: Array<Record<string, unknown>>;
  damagedBuildings: GeoJSON.FeatureCollection | null;
  damagedRoads: GeoJSON.FeatureCollection | null;
}

function createEmptyPartnerRiskBundle(): PartnerRiskBundle {
  return {
    regionalImpacts: null,
    regionalImpactsBySector: null,
    exposureByCluster: null,
    nationalSummary: [],
    impactByAsset: [],
    impactBySector: [],
    regionalSummary: [],
    regionalSummaryBySector: [],
    damagedBuildings: null,
    damagedRoads: null,
  };
}

function toObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object'
  );
}

function filterPartnerRowsByCountryId(
  rows: Array<Record<string, unknown>>,
  countryId: number | null
): Array<Record<string, unknown>> {
  if (countryId === null) {
    return rows;
  }

  const rowsWithCountryField = rows.filter(row => row.country !== undefined);
  if (rowsWithCountryField.length === 0) {
    return rows;
  }

  return rowsWithCountryField.filter(row => toNumber(row.country) === countryId);
}

function getUploadFilename(row: Record<string, unknown>): string {
  const uploadValue = typeof row.upload === 'string' ? row.upload : '';
  if (!uploadValue) return '';

  try {
    const parsed = new URL(uploadValue, 'http://localhost');
    const path = parsed.pathname || uploadValue;
    const filename = path.split('/').filter(Boolean).pop() || '';
    return filename.toLowerCase();
  } catch {
    return uploadValue.split('/').filter(Boolean).pop()?.toLowerCase() || '';
  }
}

function inferLogicalDatasetTypeFromFilename(filename: string): PartnerRiskDataKey | null {
  const lowered = filename.trim().toLowerCase();
  if (!lowered) return null;

  if (lowered.includes('regional-impacts-by-sector')) return 'regionalImpactsBySector';
  if (lowered.includes('regional-impacts')) return 'regionalImpacts';
  if (lowered.includes('regional-summary-by-sector')) return 'regionalSummaryBySector';
  if (lowered.includes('regional-summary')) return 'regionalSummary';
  if (lowered.includes('impact-by-asset-type')) return 'impactByAsset';
  if (lowered.includes('impact-by-sector')) return 'impactBySector';
  if (lowered.includes('national-summary')) return 'nationalSummary';
  if (lowered.includes('exposure-by-cluster')) return 'exposureByCluster';
  if (lowered.includes('damaged-buildings')) return 'damagedBuildings';
  if (lowered.includes('damaged-roads')) return 'damagedRoads';

  return null;
}

function parseCreatedAtTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function extractFeatureCollectionFromValue(value: unknown): GeoJSON.FeatureCollection | null {
  if (
    value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown[] }).features)
  ) {
    return value as GeoJSON.FeatureCollection;
  }

  return null;
}

function inferPartnerRiskKey(
  row: Record<string, unknown>,
  geometryValue: unknown
): PartnerRiskDataKey | null {
  const filename = getUploadFilename(row);
  const inferredFromFilename = inferLogicalDatasetTypeFromFilename(filename);
  if (inferredFromFilename) return inferredFromFilename;

  // Title field is a secondary signal — useful when the upload path uses a
  // hashed or non-standard filename (e.g. "regional-impacts_abc123.geojson").
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (title) {
    const inferredFromTitle = inferLogicalDatasetTypeFromFilename(title);
    if (inferredFromTitle) return inferredFromTitle;
  }

  const featureCollection = extractFeatureCollectionFromValue(geometryValue);
  if (featureCollection) {
    const sample = featureCollection.features?.[0]?.properties;
    if (!sample || typeof sample !== 'object') {
      return null;
    }

    const record = sample as Record<string, unknown>;
    if (record.Asset !== undefined || record.UseType !== undefined) {
      return 'exposureByCluster';
    }
    if (
      record['Sector.Education.Loss'] !== undefined ||
      record['Sector.Infrastructure.Loss'] !== undefined
    ) {
      return 'regionalImpactsBySector';
    }
    if (
      record.Region !== undefined ||
      record['Region.Region'] !== undefined ||
      record.Population_Exposed_To_Any_Hazard !== undefined
    ) {
      if (record.Wind_Loss !== undefined || record.Building_Type !== undefined) {
        return 'damagedBuildings';
      }
      if (record.road_type !== undefined || record.Road_Type !== undefined) {
        return 'damagedRoads';
      }
      return 'regionalImpacts';
    }
  }

  const rows = toObjectArray(geometryValue);
  if (rows.length === 0) return null;
  const sample = rows[0];
  if (sample.Region !== undefined && sample.Sector !== undefined) return 'regionalSummaryBySector';
  if (sample.Region !== undefined) return 'regionalSummary';
  if (sample.Asset !== undefined || sample.Asset_Type !== undefined) return 'impactByAsset';
  if (sample.Sector !== undefined) return 'impactBySector';
  if (
    sample.Country !== undefined ||
    sample.Total_Population !== undefined ||
    sample.Damaged_Buildings !== undefined
  ) {
    return 'nationalSummary';
  }

  return null;
}

function mergePartnerRiskBundle(
  bundle: PartnerRiskBundle,
  key: PartnerRiskDataKey,
  geometryValue: unknown
): PartnerRiskBundle {
  const next = { ...bundle };

  if (
    key === 'regionalImpacts' ||
    key === 'regionalImpactsBySector' ||
    key === 'exposureByCluster' ||
    key === 'damagedBuildings' ||
    key === 'damagedRoads'
  ) {
    const featureCollection = extractFeatureCollectionFromValue(geometryValue);
    if (featureCollection && !next[key]) {
      next[key] = featureCollection as never;
    }
    return next;
  }

  const rows = toObjectArray(geometryValue);
  if (rows.length > 0 && next[key].length === 0) {
    next[key] = rows as never;
  }
  return next;
}

function extractPartnerRiskBundle(riskRows: Array<Record<string, unknown>>): PartnerRiskBundle {
  return riskRows.reduce((bundle, row) => {
    const key = inferPartnerRiskKey(row, row.geometry);
    if (!key) return bundle;
    return mergePartnerRiskBundle(bundle, key, row.geometry);
  }, createEmptyPartnerRiskBundle());
}

function dedupePartnerRiskRows(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const latestByDataset = new Map<PartnerRiskDataKey, Record<string, unknown>>();
  const passthroughRows: Array<Record<string, unknown>> = [];

  rows.forEach(row => {
    const filename = getUploadFilename(row);
    const datasetType = inferLogicalDatasetTypeFromFilename(filename);

    if (!datasetType) {
      // If upload is missing or unrecognized, don't let it override known datasets.
      passthroughRows.push(row);
      return;
    }

    const current = latestByDataset.get(datasetType);
    const rowCreatedAt = parseCreatedAtTimestamp(row.created_at);
    const currentCreatedAt = current
      ? parseCreatedAtTimestamp(current.created_at)
      : Number.NEGATIVE_INFINITY;

    if (!current || rowCreatedAt >= currentCreatedAt) {
      latestByDataset.set(datasetType, row);
    }
  });

  return [...latestByDataset.values(), ...passthroughRows];
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

function normalizeRegionalSummaryContract(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return rows
    .filter(row => row && typeof row === 'object')
    .map(row => {
      const areaId = getAreaId(row);
      const areaName = getAreaName(row);

      return {
        ...row,
        areaId,
        areaName,
        Region_ID: row.Region_ID ?? areaId,
        Region: row.Region ?? areaName,
      };
    });
}

async function fetchPartnerCollection(url: string, signal?: AbortSignal): Promise<unknown> {
  const normalizePartnerProxyUrl = (nextUrl: string): string => {
    if (typeof window === 'undefined') {
      return nextUrl;
    }

    try {
      const parsed = new URL(nextUrl, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return parsed.toString();
      }

      if (parsed.pathname.startsWith('/partner_api/') || parsed.pathname.startsWith('/media/')) {
        const proxiedPath = `/api/partner-proxy${parsed.pathname}${parsed.search}`;
        return window.location.origin + withBasePath(proxiedPath);
      }

      return nextUrl;
    } catch {
      return nextUrl;
    }
  };

  try {
    const response = await fetch(normalizePartnerProxyUrl(url), { signal, cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const record = payload as {
      results?: unknown[];
      next?: string | null;
    };

    if (!Array.isArray(record.results)) {
      return payload;
    }

    const results = [...record.results];
    let nextUrl = typeof record.next === 'string' ? record.next : null;
    let safetyCounter = 0;

    while (nextUrl && safetyCounter < 20) {
      safetyCounter += 1;

      try {
        const nextResponse = await fetch(normalizePartnerProxyUrl(nextUrl), {
          signal,
          cache: 'no-store',
        });
        if (!nextResponse.ok) {
          break;
        }
        const nextPayload = await nextResponse.json();
        if (!nextPayload || typeof nextPayload !== 'object') {
          break;
        }
        const nextRecord = nextPayload as {
          results?: unknown[];
          next?: string | null;
        };
        if (Array.isArray(nextRecord.results)) {
          results.push(...nextRecord.results);
        }
        nextUrl = typeof nextRecord.next === 'string' ? nextRecord.next : null;
      } catch {
        // Keep the successfully fetched pages instead of failing the entire partner-data load.
        break;
      }
    }

    return results;
  } catch {
    return null;
  }
}

// RiskScenario rows carry no product label of their own (tc/combined/
// historical_tcs/...) -- only their parent RiskInformation's title does,
// following the exact naming import_ck_risk_scenarios.py used when
// ingesting them ("CK {product} national impact[ + AAL]"). This is
// currently CK-specific since CK is the only country with RiskScenario
// data ingested.
function matchesHazardScenarioProduct(riskInformationTitle: unknown, product: string): boolean {
  return (
    typeof riskInformationTitle === 'string' && riskInformationTitle.startsWith(`CK ${product} `)
  );
}

/**
 * Looks up the national-level RiskScenario row (loss/exposure totals) for
 * the currently-selected hazard scenario, so the risk/impact summary can
 * match whichever SLR x return-period/event is shown on the map instead of
 * always showing one fixed, scenario-independent figure.
 */
export async function fetchHazardScenarioRiskSummary(
  countryCode: CountryCode,
  scenario: HazardScenarioSelection,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const mapping = await mapCountryPartnerApis(countryCode);
    if (mapping.countryId === null || !mapping.scopedUrls) {
      return null;
    }

    const params = new URLSearchParams({
      slr_scenario_m: String(scenario.slrScenarioM),
      is_annual_average_loss: 'false',
    });
    if (scenario.returnPeriodYears !== null) {
      params.set('return_period_years', String(scenario.returnPeriodYears));
    }
    if (scenario.eventLabel !== null) {
      params.set('event_label', scenario.eventLabel);
    }

    const url = `${mapping.scopedUrls.risk_scenario}&${params.toString()}`;
    const payload = await fetchPartnerCollection(url, signal);
    const results = toArrayPayload(payload);

    return (
      results.find(row =>
        matchesHazardScenarioProduct(row.risk_information_title, scenario.product)
      ) ?? null
    );
  } catch {
    return null;
  }
}

function parsePartnerDatasetPath(urlValue: unknown): string | null {
  if (typeof urlValue !== 'string' || !urlValue.trim()) {
    return null;
  }

  try {
    const parsed = new URL(urlValue);
    const marker = '/thredds/wms';
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) {
      return parsed.pathname.slice(index + marker.length);
    }
    return parsed.pathname || null;
  } catch {
    const marker = '/thredds/wms';
    const index = urlValue.indexOf(marker);
    if (index >= 0) {
      return urlValue.slice(index + marker.length).split('?')[0] || null;
    }
    return null;
  }
}

function inferPartnerHazardType(row: Record<string, unknown>): RealWMSLayer['hazardType'] | null {
  const values = [row.protocol, row.layer_name, row.style, row.url, row.hazard_type, row.hazardType]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (values.includes('wind')) return 'wind';
  if (values.includes('fluvial')) return 'fluvial-depth';
  if (values.includes('flood') || values.includes('inundation') || values.includes('surge')) {
    return 'flood';
  }
  if (values.includes('cyclone') || values.includes('track')) return 'cyclone';
  return null;
}

function defaultHazardBbox(countryCode: CountryCode): [number, number, number, number] {
  const [lng, lat] = COUNTRIES[countryCode].center;
  return [lng - 1, lat - 1, lng + 1, lat + 1];
}

function buildPartnerHazardLayers(
  countryCode: CountryCode,
  hazardRows: Array<Record<string, unknown>>,
  eventRecords: EventRecord[] = []
): RealWMSLayer[] {
  const layers: RealWMSLayer[] = [];
  const hazardIdToEventId = new Map<string, string>();

  eventRecords.forEach(eventRecord => {
    (eventRecord.backendHazardIds ?? []).forEach(hazardId => {
      if (!hazardIdToEventId.has(hazardId)) {
        hazardIdToEventId.set(hazardId, eventRecord.id);
      }
    });
  });

  hazardRows.forEach((row, index) => {
    const layerName = (typeof row.layer_name === 'string' && row.layer_name.trim()) || 'Depth';
    const layerIdBase =
      (typeof row.id === 'number' && Number.isFinite(row.id) ? String(row.id) : `${index}`) ||
      `${index}`;
    const min = toNumber(row.min);
    const max = toNumber(row.max);

    if (row.protocol === 'xyz' && typeof row.url === 'string' && row.url.includes('{z}')) {
      // Zarr-backed raster tile layer (hazard_tiles endpoint) — bypasses the
      // THREDDS/WMS URL parsing entirely, since it's already a ready-to-use
      // {z}/{x}/{y} tile template. The middleware returns this as an absolute
      // URL (its own host); the browser can't reach that host directly in
      // production, so route it through the same partner-proxy every other
      // partner_api request uses. String-sliced rather than parsed as a URL
      // so the literal {z}/{x}/{y} placeholders survive untouched.
      const tileUrlTemplate = proxyPartnerApiUrl(row.url);
      // layer_name is generated server-side as `{product}_slr{slr}_rp{rp}` or
      // `{product}_slr{slr}_event{event}` (populate_hazard_catalog.py) — the
      // product key itself (tc/combined/historical_tcs/...) isn't otherwise
      // exposed by the API, so it's recovered here rather than duplicating
      // the six-product enum on the frontend.
      const scenarioMatch = layerName.match(/^(.+)_slr([\d.]+)_(?:rp(\d+)|event(.+))$/);
      const slrScenarioM = toNumber(row.slr_scenario_m);
      const hazardScenario =
        scenarioMatch && slrScenarioM !== null
          ? {
              product: scenarioMatch[1],
              slrScenarioM,
              returnPeriodYears: toNumber(row.return_period_years),
              eventLabel: typeof row.event_label === 'string' ? row.event_label : null,
            }
          : undefined;
      layers.push({
        id: `partner-${countryCode.toLowerCase()}-${layerIdBase}-xyz`,
        eventId: hazardIdToEventId.get(String(row.id)) ?? undefined,
        name:
          (typeof row.title === 'string' && row.title.trim()) ||
          layerName ||
          'Partner hazard tile layer',
        countryCode,
        ncFile: layerName,
        layerName,
        description:
          (typeof row.title === 'string' && row.title) ||
          `Partner API tile layer for ${countryCode}`,
        hazardType: 'flood',
        bbox: defaultHazardBbox(countryCode),
        styleConfig:
          min !== null && max !== null
            ? {
                colorScaleRange: `${min},${max}`,
              }
            : undefined,
        source: 'partner_api',
        tileUrlTemplate,
        hazardScenario,
      });
      return;
    }

    const hazardType = inferPartnerHazardType(row);
    const datasetPath = parsePartnerDatasetPath(row.url);
    if (!hazardType || !datasetPath) {
      return;
    }

    layers.push({
      id: `partner-${countryCode.toLowerCase()}-${layerIdBase}-${hazardType}`,
      eventId: hazardIdToEventId.get(String(row.id)) ?? undefined,
      name:
        (typeof row.layer_name === 'string' && row.layer_name.trim()) ||
        (typeof row.protocol === 'string' && row.protocol.trim()) ||
        `Partner ${hazardType} layer`,
      countryCode,
      ncFile: datasetPath.split('/').filter(Boolean).pop() || `${hazardType}.nc`,
      datasetPath,
      layerName,
      description:
        (typeof row.url === 'string' && row.url) ||
        `Partner API ${hazardType} layer for ${countryCode}`,
      hazardType,
      bbox: defaultHazardBbox(countryCode),
      styleConfig:
        min !== null && max !== null
          ? {
              colorScaleRange: `${min},${max}`,
            }
          : undefined,
      source: 'partner_api',
    });
  });

  return layers;
}

async function loadPartnerApiCountryData(
  countryCode: CountryCode,
  signal?: AbortSignal,
  selectedEventIds: string[] = [],
  dateRange?: { start?: string; end?: string }
): Promise<{
  countryId: number | null;
  eventRecords: EventRecord[];
  cycloneTrack: GeoJSON.FeatureCollection | null;
  eventMeta: { name?: string; date?: string } | null;
  riskData: PartnerRiskBundle;
  hazardLayers: RealWMSLayer[];
  forecastTrackUrl: string | null;
  forecastPoints: CycloneForecastPoint[] | null;
  perEventRiskData: Map<string, PartnerRiskBundle>;
}> {
  if (!isPartnerApiEnabled() || !isPartnerApiCountryEnabled(countryCode)) {
    return {
      countryId: null,
      eventRecords: [],
      cycloneTrack: null,
      eventMeta: null,
      riskData: createEmptyPartnerRiskBundle(),
      hazardLayers: [],
      forecastTrackUrl: null,
      forecastPoints: null,
      perEventRiskData: new Map(),
    };
  }

  try {
    const mapping = await mapCountryPartnerApis(countryCode);

    if (!mapping.scopedUrls) {
      return {
        countryId: mapping.countryId,
        eventRecords: [],
        cycloneTrack: null,
        eventMeta: null,
        riskData: createEmptyPartnerRiskBundle(),
        hazardLayers: [],
        forecastTrackUrl: null,
        forecastPoints: null,
        perEventRiskData: new Map(),
      };
    }

    const [eventPayload, cyclonePayload, riskPayload, hazardPayload] = await Promise.all([
      fetchPartnerCollection(mapping.scopedUrls.event, signal),
      fetchPartnerCollection(mapping.scopedUrls.cyclone_track, signal),
      fetchPartnerCollection(mapping.scopedUrls.risk_information, signal),
      fetchPartnerCollection(mapping.scopedUrls.hazard_information, signal),
    ]);
    const normalizedEventRecords = normalizePartnerEvents(
      countryCode,
      eventPayload,
      mapping.countryId
    );
    const activeEventRecord =
      normalizedEventRecords.length > 0
        ? resolveActiveEventRecord(countryCode, normalizedEventRecords, selectedEventIds, dateRange)
        : createCountryScopedEventRecord(countryCode);
    const countryRiskRows = filterPartnerRowsByCountryId(
      toArrayPayload(riskPayload),
      mapping.countryId
    ).filter(row => row.country !== null);
    const scopedRiskRows = filterPartnerRowsByIds(
      countryRiskRows,
      activeEventRecord.backendRiskIds ?? [],
      ['id']
    );
    const riskRows = dedupePartnerRiskRows(scopedRiskRows);
    const allHazardIds = normalizedEventRecords.flatMap(er => er.backendHazardIds ?? []);
    const hazardRows = filterPartnerRowsByIds(
      filterPartnerRowsByCountryId(toArrayPayload(hazardPayload), mapping.countryId),
      allHazardIds,
      ['id']
    );
    const riskData = extractPartnerRiskBundle(riskRows);

    // Build per-event risk bundles for all backend events (enables multi-event metrics).
    const perEventRiskData = new Map<string, PartnerRiskBundle>();
    for (const eventRecord of normalizedEventRecords) {
      if (eventRecord.id === activeEventRecord.id) {
        perEventRiskData.set(eventRecord.id, {
          ...riskData,
          regionalSummary:
            riskData.regionalSummary.length > 0
              ? riskData.regionalSummary
              : extractPartnerRegionalSummaryRows(riskRows),
          impactByAsset:
            riskData.impactByAsset.length > 0
              ? riskData.impactByAsset
              : extractPartnerImpactByAssetRows(riskRows),
        });
        continue;
      }
      const eventRiskRows = dedupePartnerRiskRows(
        filterPartnerRowsByIds(countryRiskRows, eventRecord.backendRiskIds ?? [], ['id'])
      );
      const eventRiskData = extractPartnerRiskBundle(eventRiskRows);
      perEventRiskData.set(eventRecord.id, {
        ...eventRiskData,
        regionalSummary:
          eventRiskData.regionalSummary.length > 0
            ? eventRiskData.regionalSummary
            : extractPartnerRegionalSummaryRows(eventRiskRows),
        impactByAsset:
          eventRiskData.impactByAsset.length > 0
            ? eventRiskData.impactByAsset
            : extractPartnerImpactByAssetRows(eventRiskRows),
      });
    }

    const trackIds = activeEventRecord.backendCycloneTrackId
      ? [activeEventRecord.backendCycloneTrackId]
      : [];
    let cycloneTrack = buildCycloneTrackFromPartnerPayloadForTrackIds(cyclonePayload, trackIds);

    // If the embedded geometry is missing, try fetching from the track_file URL.
    if (!cycloneTrack && trackIds.length > 0) {
      const trackRows = filterPartnerRowsByIds(toArrayPayload(cyclonePayload), trackIds, ['id']);
      for (const trackRow of trackRows) {
        const trackFileUrl =
          typeof trackRow.track_file === 'string' ? trackRow.track_file.trim() : null;
        if (!trackFileUrl) continue;
        try {
          const normalizedUrl =
            typeof window === 'undefined'
              ? trackFileUrl
              : (() => {
                  try {
                    const p = new URL(trackFileUrl, window.location.origin);
                    if (
                      p.origin !== window.location.origin &&
                      (p.pathname.startsWith('/partner_api/') || p.pathname.startsWith('/media/'))
                    ) {
                      return (
                        window.location.origin +
                        withBasePath(`/api/partner-proxy${p.pathname}${p.search}`)
                      );
                    }
                    return trackFileUrl;
                  } catch {
                    return trackFileUrl;
                  }
                })();
          const res = await fetch(normalizedUrl, { signal, cache: 'no-store' });
          if (res.ok) {
            const trackData = await res.json();
            cycloneTrack = buildCycloneTrackFromPartnerPayload(trackData);
            if (cycloneTrack) break;
          }
        } catch {
          /* continue to next row */
        }
      }
    }

    // Resolve track rows for the active event (used by both URL and geometry extraction).
    const relevantTrackRows = (() => {
      const all = toArrayPayload(cyclonePayload);
      return trackIds.length > 0 ? filterPartnerRowsByIds(all, trackIds, ['id']) : all;
    })();

    // Resolve the proxied URL of the raw forecast CSV (kept as fallback).
    const forecastTrackUrl = (() => {
      for (const row of relevantTrackRows) {
        const url = typeof row.track_file === 'string' ? row.track_file.trim() : null;
        if (!url) continue;
        if (typeof window === 'undefined') return url;
        try {
          const p = new URL(url, window.location.origin);
          if (
            p.origin !== window.location.origin &&
            (p.pathname.startsWith('/partner_api/') || p.pathname.startsWith('/media/'))
          ) {
            return (
              window.location.origin + withBasePath(`/api/partner-proxy${p.pathname}${p.search}`)
            );
          }
          return url;
        } catch {
          return url;
        }
      }
      return null;
    })();

    // Parse forecast animation points from the pre-computed geometry — no extra
    // HTTP request. Falls back to null so the caller can chain to the CSV path.
    const forecastPoints = (() => {
      for (const row of relevantTrackRows) {
        if (!row.geometry_computed) continue;
        const points = parseForecastPointsFromGeometry(row.geometry);
        if (points && points.length > 0) return points;
      }
      return null;
    })();

    return {
      countryId: mapping.countryId,
      eventRecords: normalizedEventRecords,
      cycloneTrack,
      eventMeta: {
        name: activeEventRecord.name,
        date: activeEventRecord.date,
      },
      riskData: perEventRiskData.get(activeEventRecord.id) ?? {
        ...riskData,
        regionalSummary:
          riskData.regionalSummary.length > 0
            ? riskData.regionalSummary
            : extractPartnerRegionalSummaryRows(riskRows),
        impactByAsset:
          riskData.impactByAsset.length > 0
            ? riskData.impactByAsset
            : extractPartnerImpactByAssetRows(riskRows),
      },
      hazardLayers: buildPartnerHazardLayers(countryCode, hazardRows, normalizedEventRecords),
      forecastTrackUrl,
      forecastPoints,
      perEventRiskData,
    };
  } catch (_error) {
    // Partner API failures should not silently fall back to local event files.
    return {
      countryId: null,
      eventRecords: [],
      cycloneTrack: null,
      eventMeta: null,
      riskData: createEmptyPartnerRiskBundle(),
      hazardLayers: [],
      forecastTrackUrl: null,
      forecastPoints: null,
      perEventRiskData: new Map(),
    };
  }
}

// loadAllRealData and loadSupplementaryRealData both need the same
// country-scoped Partner API bundle and commonly run back-to-back for the
// same (countryCode, selectedEventIds, dateRange) — dedupe so the second
// caller reuses the first's in-flight/just-settled request instead of
// re-issuing all four resource fetches. Falls back to a fresh fetch whenever
// the params actually differ, so this never changes what data a caller sees.
const inFlightPartnerApiCountryData = new Map<
  string,
  ReturnType<typeof loadPartnerApiCountryData>
>();

function loadPartnerApiCountryDataDeduped(
  countryCode: CountryCode,
  signal?: AbortSignal,
  selectedEventIds: string[] = [],
  dateRange?: { start?: string; end?: string }
): ReturnType<typeof loadPartnerApiCountryData> {
  const cacheKey = `${countryCode}:${JSON.stringify(selectedEventIds)}:${JSON.stringify(dateRange ?? null)}`;
  const existing = inFlightPartnerApiCountryData.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = loadPartnerApiCountryData(
    countryCode,
    signal,
    selectedEventIds,
    dateRange
  ).finally(() => {
    inFlightPartnerApiCountryData.delete(cacheKey);
  });
  inFlightPartnerApiCountryData.set(cacheKey, promise);
  return promise;
}

export async function fetchEventRecords(
  countryCode: CountryCode,
  signal?: AbortSignal
): Promise<EventRecord[]> {
  const usePartnerOnly = isPartnerApiEnabled() && isPartnerApiCountryEnabled(countryCode);
  try {
    const response = await fetch(withBasePath(`/api/events?country=${countryCode}`), {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return usePartnerOnly ? [] : getLocalEventRecords(countryCode);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.events)) {
      return usePartnerOnly ? [] : getLocalEventRecords(countryCode);
    }

    return payload.events as EventRecord[];
  } catch {
    return usePartnerOnly ? [] : getLocalEventRecords(countryCode);
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
    selectedEventIds = [],
    dateRange,
  } = options;
  const basePath = DATA_PATH[countryCode];
  const partnerData = await loadPartnerApiCountryDataDeduped(
    countryCode,
    signal,
    selectedEventIds,
    dateRange
  );
  const partnerApiActive = isPartnerApiEnabled() && isPartnerApiCountryEnabled(countryCode);
  const fetchedEventRecords = await fetchEventRecords(countryCode, signal);
  const eventRecords = partnerApiActive
    ? fetchedEventRecords.filter(record => record.countryCode === countryCode)
    : resolveEventRecords(countryCode, fetchedEventRecords);
  const activeEventRecord = partnerApiActive
    ? eventRecords.length > 0
      ? resolveActiveEventRecord(countryCode, eventRecords, selectedEventIds, dateRange)
      : createCountryScopedEventRecord(countryCode, partnerData.eventMeta)
    : resolveActiveEventRecord(countryCode, eventRecords, selectedEventIds, dateRange);
  const trackFile = activeEventRecord.trackFile
    ? `${basePath}/${activeEventRecord.trackFile}`
    : null;
  const forecastFile = activeEventRecord.forecastFile
    ? `${basePath}/${activeEventRecord.forecastFile}`
    : null;
  const strictPartnerApi = partnerApiActive || isPartnerApiCountryStrict(countryCode);

  const partnerForecastUrl = partnerData.forecastTrackUrl;
  const cycloneTrackSource: 'partner_api' | 'local_files' = partnerData.cycloneTrack
    ? 'partner_api'
    : 'local_files';
  const eventMetadataSource: 'partner_api' | 'local_files' = partnerData.eventMeta
    ? 'partner_api'
    : 'local_files';
  const riskDataSource: 'partner_api' | 'local_files' =
    partnerData.riskData.regionalImpacts ||
    partnerData.riskData.regionalSummary.length > 0 ||
    partnerData.riskData.impactByAsset.length > 0
      ? 'partner_api'
      : 'local_files';
  const hazardLayerSource: 'partner_api' | 'static_config' =
    partnerData.hazardLayers.length > 0 ? 'partner_api' : 'static_config';
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
      : strictPartnerApi
        ? Promise.resolve(null)
        : trackFile
          ? loadCycloneTrackData({ signal, trackFile })
          : Promise.resolve(null),
    partnerData.forecastPoints
      ? Promise.resolve(partnerData.forecastPoints)
      : partnerForecastUrl
        ? loadCycloneForecastTrack({ signal, forecastFile: partnerForecastUrl })
        : forecastFile
          ? loadCycloneForecastTrack({ signal, forecastFile })
          : Promise.resolve(null),
    partnerData.riskData.regionalImpacts
      ? Promise.resolve(partnerData.riskData.regionalImpacts)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadRegionalImpacts({ signal, basePath, countryCode }),
    includeSupplementaryData
      ? partnerData.riskData.regionalImpactsBySector
        ? Promise.resolve(partnerData.riskData.regionalImpactsBySector)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadRegionalImpactsBySector({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeSupplementaryData
      ? partnerData.riskData.exposureByCluster
        ? Promise.resolve(partnerData.riskData.exposureByCluster)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadExposureByCluster({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeSupplementaryData
      ? partnerData.riskData.nationalSummary.length > 0
        ? Promise.resolve(partnerData.riskData.nationalSummary)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadNationalSummary({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeSupplementaryData
      ? partnerData.riskData.impactByAsset.length > 0
        ? Promise.resolve(partnerData.riskData.impactByAsset)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadImpactByAssetType({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeSupplementaryData
      ? partnerData.riskData.impactBySector.length > 0
        ? Promise.resolve(partnerData.riskData.impactBySector)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadImpactBySector({ signal, basePath, countryCode })
      : Promise.resolve(null),
    partnerData.riskData.regionalSummary.length > 0
      ? Promise.resolve(partnerData.riskData.regionalSummary)
      : strictPartnerApi
        ? Promise.resolve([])
        : loadRegionalSummary({ signal, basePath, countryCode }),
    includeSupplementaryData
      ? partnerData.riskData.regionalSummaryBySector.length > 0
        ? Promise.resolve(partnerData.riskData.regionalSummaryBySector)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadRegionalSummaryBySector({ signal, basePath, countryCode })
      : Promise.resolve(null),
    includeDamagedAssets
      ? partnerData.riskData.damagedBuildings
        ? Promise.resolve(partnerData.riskData.damagedBuildings)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadDamagedBuildings({ signal, countryCode, selectedEventIds, dateRange, eventRecords })
      : Promise.resolve(null),
    includeDamagedAssets
      ? partnerData.riskData.damagedRoads
        ? Promise.resolve(partnerData.riskData.damagedRoads)
        : strictPartnerApi
          ? Promise.resolve(null)
          : loadDamagedRoads({ signal, countryCode, selectedEventIds, dateRange, eventRecords })
      : Promise.resolve(null),
  ]);

  const regionalSummaryFromPartner = partnerData.riskData.regionalSummary;
  const impactByAssetFromPartner = partnerData.riskData.impactByAsset;

  const effectiveRegionalSummary =
    regionalSummaryFromPartner.length > 0 && !hasNonZeroLoss(regionalSummaryData)
      ? regionalSummaryFromPartner
      : regionalSummaryData;
  const normalizedRegionalSummary = normalizeRegionalSummaryContract(
    ((effectiveRegionalSummary || []) as Array<Record<string, unknown>>) ?? []
  );
  const enrichedRegionalImpacts = enrichRegionalImpactsWithSummary(
    regionalImpacts,
    normalizedRegionalSummary
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

  // Build metrics for the active event record selected by backend event metadata.
  const primaryEventId = activeEventRecord.id;

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
    name: activeEventRecord.name,
    date: activeEventRecord.date,
    hazardId: activeEventRecord.hazardId,
    countryCode,
    totalAffectedPopulation,
    totalEconomicDamage,
    affectedRegions,
    severity: overallSeverity,
    location: activeEventRecord.location,
    regionalImpacts: regionalImpactsData,
  };

  const events = eventRecords.map((eventRecord: EventRecord): Event => {
    if (eventRecord.id === primaryEvent.id) return primaryEvent;

    const evtRiskData = partnerData.perEventRiskData.get(eventRecord.id);
    if (evtRiskData?.regionalImpacts) {
      const evtRegionalImpacts = convertRegionalImpactsToRegionalImpacts(
        evtRiskData.regionalImpacts,
        eventRecord.id
      );
      const evtTotalPop = evtRegionalImpacts.reduce((sum, ri) => sum + ri.affectedPopulation, 0);
      const evtTotalEcon = evtRegionalImpacts.reduce((sum, ri) => sum + ri.economicDamage, 0);
      const evtCritCount = evtRegionalImpacts.filter(ri => ri.severity === 'critical').length;
      const evtHighCount = evtRegionalImpacts.filter(ri => ri.severity === 'high').length;
      const evtSeverity: 'low' | 'medium' | 'high' | 'critical' =
        evtCritCount > 0
          ? 'critical'
          : evtHighCount > evtRegionalImpacts.length / 2
            ? 'high'
            : evtHighCount > 0
              ? 'medium'
              : 'low';
      return {
        id: eventRecord.id,
        name: eventRecord.name,
        date: eventRecord.date,
        hazardId: eventRecord.hazardId,
        countryCode,
        totalAffectedPopulation: evtTotalPop,
        totalEconomicDamage: evtTotalEcon,
        affectedRegions: evtRegionalImpacts.length,
        severity: evtSeverity,
        location: eventRecord.location,
        regionalImpacts: evtRegionalImpacts,
      };
    }

    return {
      id: eventRecord.id,
      name: eventRecord.name,
      date: eventRecord.date,
      hazardId: eventRecord.hazardId,
      countryCode,
      totalAffectedPopulation: 0,
      totalEconomicDamage: 0,
      affectedRegions: 0,
      severity: 'low' as const,
      location: eventRecord.location,
    };
  });

  // Also create sector-specific events for filtering (backward compatibility)
  // This allows sector filtering to work correctly
  const sectorSpecificEvents = regionalImpactsBySectorGeoJSON
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorGeoJSON, countryCode)
    : [];

  // Convert CSV data to dashboard format
  // Use regional-summary-by-sector for sector-specific exposure data
  const exposureData = convertToExposureData(
    regionalSummaryBySector,
    normalizedRegionalSummary,
    activeEventRecord
  );

  // Separate economic data into sector-level and asset-level
  const sectorEconomicData = convertSectorEconomicData(impactBySector, activeEventRecord);
  const assetEconomicData = convertAssetEconomicData(effectiveImpactByAsset, activeEventRecord);

  // Process asset-level exposure data
  const assetExposureData = processAssetExposureData(exposureByCluster);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Loaded ${events.length} event(s) from real data`);
    console.log(
      `   - ${activeEventRecord.name} (${countryCode}): ${affectedRegions} regions, ${totalAffectedPopulation.toLocaleString()} people affected`
    );
    console.log(
      `Loaded ${regionalImpactsData.length} regional impacts for ${activeEventRecord.name}`
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
    regionalSummary: normalizedRegionalSummary as any,
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
      riskDataSource,
      hazardLayerSource,
    },
    partnerHazardLayers: partnerData.hazardLayers,
    fetchedEventRecords: eventRecords,
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

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[loadSupplementaryRealData] Loading for ${countryCode} from ${basePath}`);
  }

  const partnerData = await loadPartnerApiCountryDataDeduped(countryCode, signal);
  const strictPartnerApi =
    (isPartnerApiEnabled() && isPartnerApiCountryEnabled(countryCode)) ||
    isPartnerApiCountryStrict(countryCode);

  const [
    regionalImpactsBySectorGeoJSON,
    exposureByCluster,
    nationalSummary,
    impactByAsset,
    impactBySector,
    regionalSummaryBySector,
  ] = await Promise.all([
    partnerData.riskData.regionalImpactsBySector
      ? Promise.resolve(partnerData.riskData.regionalImpactsBySector)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadRegionalImpactsBySector({ signal, basePath, countryCode }),
    partnerData.riskData.exposureByCluster
      ? Promise.resolve(partnerData.riskData.exposureByCluster)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadExposureByCluster({ signal, basePath, countryCode }),
    partnerData.riskData.nationalSummary.length > 0
      ? Promise.resolve(partnerData.riskData.nationalSummary)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadNationalSummary({ signal, basePath, countryCode }),
    partnerData.riskData.impactByAsset.length > 0
      ? Promise.resolve(partnerData.riskData.impactByAsset)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadImpactByAssetType({ signal, basePath, countryCode }),
    partnerData.riskData.impactBySector.length > 0
      ? Promise.resolve(partnerData.riskData.impactBySector)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadImpactBySector({ signal, basePath, countryCode }),
    partnerData.riskData.regionalSummaryBySector.length > 0
      ? Promise.resolve(partnerData.riskData.regionalSummaryBySector)
      : strictPartnerApi
        ? Promise.resolve(null)
        : loadRegionalSummaryBySector({ signal, basePath, countryCode }),
  ]);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[loadSupplementaryRealData] Loaded CSV files:`, {
      impactByAsset: impactByAsset ? `${(impactByAsset as any[]).length} rows` : 'null',
      impactBySector: impactBySector ? `${(impactBySector as any[]).length} rows` : 'null',
    });
  }

  const impactByAssetFromPartner = partnerData.riskData.impactByAsset;
  const nationalSummaryFromPartner = buildNationalSummaryFromRegionalRows(
    partnerData.riskData.regionalSummary
  );
  const effectiveNationalSummary =
    nationalSummaryFromPartner.length > 0 && !hasNonZeroLoss(nationalSummary)
      ? nationalSummaryFromPartner
      : nationalSummary;
  const effectiveImpactByAsset =
    impactByAssetFromPartner.length > 0 && !hasNonZeroLoss(impactByAsset)
      ? impactByAssetFromPartner
      : impactByAsset;
  const activeEventRecord = strictPartnerApi
    ? createCountryScopedEventRecord(countryCode, partnerData.eventMeta)
    : getDefaultEventRecord(countryCode);

  const sectorSpecificEvents = regionalImpactsBySectorGeoJSON
    ? convertRegionalImpactsBySectorToEvents(regionalImpactsBySectorGeoJSON, countryCode)
    : [];
  const exposureData = convertToExposureData(
    regionalSummaryBySector,
    regionalSummary,
    activeEventRecord
  );
  const sectorEconomicData = convertSectorEconomicData(impactBySector, activeEventRecord);
  const assetEconomicData = convertAssetEconomicData(effectiveImpactByAsset, activeEventRecord);
  const assetExposureData = processAssetExposureData(exposureByCluster);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[loadSupplementaryRealData] Converted data:`, {
      sectorEconomicData: `${sectorEconomicData.length} rows`,
      assetEconomicData: `${assetEconomicData.length} rows`,
    });
  }

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
  eventRecord: Pick<EventRecord, 'id' | 'date'>
): any[] {
  if (!regionalSummaryBySector || !Array.isArray(regionalSummaryBySector)) return [];

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
      eventId: eventRecord.id,
      eventDate: eventRecord.date,
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
function convertSectorEconomicData(
  impactBySector: any,
  eventRecord: Pick<EventRecord, 'id' | 'date'> & { countryCode: CountryCode }
): any[] {
  if (!impactBySector || !Array.isArray(impactBySector)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[convertSectorEconomicData] Received null/non-array for ${eventRecord.countryCode}:`,
        impactBySector
      );
    }
    return [];
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[convertSectorEconomicData] Converting ${impactBySector.length} rows for ${eventRecord.countryCode}`
    );
    if (impactBySector.length > 0) {
      console.log(`[convertSectorEconomicData] First row:`, impactBySector[0]);
    }
  }

  const eventYear = Number.parseInt(eventRecord.date.slice(0, 4), 10);
  const normalizedYear = Number.isFinite(eventYear) ? eventYear : 2023;

  const converted = impactBySector.map((row, index) => ({
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
    eventId: eventRecord.id,
    eventDate: eventRecord.date,
    sector: row.Sector || 'Unknown',
  }));

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[convertSectorEconomicData] Converted ${converted.length} rows`);
  }

  return converted;
}

/**
 * Convert impact by asset type CSV to AssetDamageData format (asset-level)
 */
function convertAssetEconomicData(
  impactByAsset: any,
  eventRecord: Pick<EventRecord, 'id' | 'date'> & { countryCode: CountryCode }
): any[] {
  if (!impactByAsset || !Array.isArray(impactByAsset)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[convertAssetEconomicData] Received null/non-array for ${eventRecord.countryCode}:`,
        impactByAsset
      );
    }
    return [];
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[convertAssetEconomicData] Converting ${impactByAsset.length} rows for ${eventRecord.countryCode}`
    );
    if (impactByAsset.length > 0) {
      console.log(`[convertAssetEconomicData] First row:`, impactByAsset[0]);
    }
  }

  const eventYear = Number.parseInt(eventRecord.date.slice(0, 4), 10);
  const normalizedYear = Number.isFinite(eventYear) ? eventYear : 2023;

  const converted = impactByAsset.map((row, index) => ({
    id: `damage-asset-${index}`,
    hazardId: 'tropical-cyclone',
    assetType: row.Asset || 'Unknown',
    sectorId: mapAssetToSector(row.Asset || 'Unknown'), // Correct sector mapping
    assetCount: Number(row.Number_Damaged) || Number(row.Number_Exposed) || 0,
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    year: normalizedYear,
    eventId: eventRecord.id,
    eventDate: eventRecord.date,
  }));

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[convertAssetEconomicData] Converted ${converted.length} rows`);
  }

  return converted;
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
  options: {
    signal?: AbortSignal;
    countryCode?: CountryCode;
    selectedEventIds?: string[];
    dateRange?: { start?: string; end?: string };
    eventRecords?: EventRecord[];
  } = {}
) {
  const { signal, countryCode = 'VU', selectedEventIds = [], dateRange, eventRecords } = options;
  const recordPool =
    eventRecords && eventRecords.length > 0 ? eventRecords : getLocalEventRecords(countryCode);
  const eventRecord = resolveActiveEventRecord(
    countryCode,
    recordPool,
    selectedEventIds,
    dateRange
  );
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
    const [minLng, minLat, maxLng, maxLat] = eventRecord.bbox;
    const params = new URLSearchParams({
      bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
      country: countryCode,
      limit: '100000',
      event_id: eventRecord.id,
    });
    if (dateRange?.start) {
      params.set('date_start', dateRange.start);
    }
    if (dateRange?.end) {
      params.set('date_end', dateRange.end);
    }
    let response: Response;
    try {
      const buildingsApiPath = withBasePath('/api/buildings');
      response = await fetch(`${buildingsApiPath}?${params.toString()}`, {
        signal: controller.signal,
      });
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
        console.warn('⚠️ Buildings API returned 0 features');
      }

      return null;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) {
        return null;
      }
    } else {
      console.warn('⚠️ Database API unavailable:', error instanceof Error ? error.message : error);
    }
  }

  return null;
}

/**
 * Load damaged roads from database API
 */
export async function loadDamagedRoads(
  options: {
    signal?: AbortSignal;
    countryCode?: CountryCode;
    selectedEventIds?: string[];
    dateRange?: { start?: string; end?: string };
    eventRecords?: EventRecord[];
  } = {}
) {
  const { signal, countryCode = 'VU', selectedEventIds = [], dateRange, eventRecords } = options;
  const recordPool =
    eventRecords && eventRecords.length > 0 ? eventRecords : getLocalEventRecords(countryCode);
  const eventRecord = resolveActiveEventRecord(
    countryCode,
    recordPool,
    selectedEventIds,
    dateRange
  );
  // Try API first (database)
  try {
    const [minLng, minLat, maxLng, maxLat] = eventRecord.bbox;
    const roadsApiPath = withBasePath('/api/roads');
    const params = new URLSearchParams({
      bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
      country: countryCode,
      limit: '10000',
      event_id: eventRecord.id,
    });
    if (dateRange?.start) {
      params.set('date_start', dateRange.start);
    }
    if (dateRange?.end) {
      params.set('date_end', dateRange.end);
    }
    const url = `${roadsApiPath}?${params.toString()}`;
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
        console.warn('⚠️ Roads API returned 0 features');
      }

      if (isDegraded) {
        console.warn('⚠️ Roads API is degraded');
      }

      return null;
    } else {
      console.warn(`⚠️ API returned ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) {
        return null;
      }
    } else {
      console.warn('⚠️ Roads API unavailable:', error instanceof Error ? error.message : error);
    }
  }

  return null;
}

/**
 * Load regional summary by sector CSV data
 */
