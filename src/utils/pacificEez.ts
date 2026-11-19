import { prependBasePath } from '@/utils/basePath';
import { COUNTRIES, type CountryCode } from '@/types/thredds';

/**
 * The Pacific EEZ outlines: visual context for the map, not boundaries (see public/data/eez/README.md).
 * Everything here is pure or a plain fetch, so the layer, its controls and the tests share one definition.
 */

export const EEZ_ZONES_PATH = '/data/eez/pacific-eez.geojson';
export const EEZ_LABELS_PATH = '/data/eez/eez-labels.geojson';

export const EEZ_ATTRIBUTION = 'EEZ outlines: Marine Regions (VLIZ), CC BY 4.0';
export const EEZ_SOURCE_NOTE =
  'Simplified outlines for context only, not official maritime boundaries. Source: Marine Regions (VLIZ), CC BY 4.0.';

export type EezStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** A view change asked for by the controls; `nonce` makes a repeated request count as a new one */
export interface MapViewCommand {
  kind: 'overview' | 'country' | 'countryEez' | 'forecast';
  nonce: number;
  /** west, south, east, north: what "forecast" frames (the islands and the track near them) */
  bounds?: [number, number, number, number];
}

export interface EezZoneProperties {
  name: string;
  iso: string;
  territory: string;
  sovereign: string;
  type: string;
  mrgid: number | string;
  /** The dashboard country this zone belongs to, or '' for neighbours */
  country: string;
}

export type EezZones = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, EezZoneProperties>;
export type EezLabels = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { label: string; rank: number; country: string }
>;

export interface EezAssets {
  zones: EezZones;
  /** Each zone's outer rings as lines: drawing the polygons would also trace every island's coast */
  outlines: GeoJSON.FeatureCollection<GeoJSON.MultiLineString, EezZoneProperties>;
  labels: EezLabels;
}

/** A view that frames the whole of the Pacific the dataset covers: [west, south, east, north] */
export const PACIFIC_OVERVIEW_BOUNDS: [number, number, number, number] = [124, -32, 245, 22];

/**
 * Outer rings of every zone as one MultiLineString each. Zones crossing the dateline have longitudes
 * past 180, which MapLibre draws as one continuous line.
 */
export function outlinesOf(zones: EezZones): EezAssets['outlines'] {
  return {
    type: 'FeatureCollection',
    features: zones.features.map(zone => ({
      type: 'Feature',
      properties: zone.properties,
      geometry: {
        type: 'MultiLineString',
        coordinates: zone.geometry.coordinates.map(polygon => polygon[0]),
      },
    })),
  };
}

/**
 * [west, south, east, north] of the dashboard country's own zones, or null when it has none. Longitudes
 * may pass 180 (Fiji), which `fitBounds` accepts.
 */
export function countryEezBounds(
  zones: EezZones,
  country: CountryCode | string
): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const zone of zones.features) {
    if (zone.properties.country !== country) continue;
    for (const polygon of zone.geometry.coordinates) {
      for (const [lon, lat] of polygon[0]) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** What `applyMapViewCommand` needs of a map */
export interface ViewableMap {
  fitBounds: (
    bounds: [number, number, number, number],
    options: {
      padding: { top: number; bottom: number; left: number; right: number };
      duration: number;
    }
  ) => unknown;
  flyTo: (options: { center: [number, number]; zoom: number; duration: number }) => unknown;
}

const VIEW_PADDING = { top: 72, bottom: 72, left: 48, right: 48 };

/**
 * Moves the map for a view command. "Back to country" and the country landing view are the existing
 * country centre and zoom, so the EEZ never changes where a country opens; "Show country EEZ" is a
 * separate, explicit view, since a scattered zone makes a poor default.
 * Resolves to whether the map moved.
 */
export async function applyMapViewCommand(
  map: ViewableMap | null,
  kind: MapViewCommand['kind'],
  country: CountryCode | null,
  bounds?: MapViewCommand['bounds']
): Promise<boolean> {
  if (!map) return false;
  if (kind === 'overview') {
    map.fitBounds(PACIFIC_OVERVIEW_BOUNDS, { padding: VIEW_PADDING, duration: 1200 });
    return true;
  }
  if (kind === 'forecast') {
    // Needs no country: the caller worked out what the forecast covers. No bounds, no move.
    if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite)) return false;
    map.fitBounds(bounds, { padding: VIEW_PADDING, duration: 1200 });
    return true;
  }
  if (!country) return false;
  if (kind === 'country') {
    const landing = COUNTRIES[country];
    if (!landing) return false;
    map.flyTo({ center: landing.center, zoom: landing.zoom, duration: 1200 });
    return true;
  }
  try {
    const { zones } = await loadEezAssets();
    const bounds = countryEezBounds(zones, country);
    if (!bounds) return false;
    map.fitBounds(bounds, { padding: VIEW_PADDING, duration: 1200 });
    return true;
  } catch {
    // The controls already show the failed load and a retry
    return false;
  }
}

let cached: Promise<EezAssets> | null = null;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(prependBasePath(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Both files, fetched once. A failure is not cached, so retrying fetches again; success is, so a country
 * change or a basemap switch (which rebuilds the layer) never downloads them twice. It takes no abort
 * signal: the request is shared, so one caller leaving must not fail the others.
 */
export function loadEezAssets(): Promise<EezAssets> {
  if (!cached) {
    const request = Promise.all([
      getJson<EezZones>(EEZ_ZONES_PATH),
      getJson<EezLabels>(EEZ_LABELS_PATH),
    ]).then(([zones, labels]) => ({ zones, outlines: outlinesOf(zones), labels }));
    cached = request;
    request.catch(() => {
      if (cached === request) cached = null;
    });
  }
  return cached;
}

/** For tests */
export function resetEezCache() {
  cached = null;
}
