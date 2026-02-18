/**
 * URL State Management
 *
 * Serialize/deserialize application state to/from URL query parameters.
 * Enables shareable links and bookmarking of specific map views.
 *
 * Example URL:
 * /map?lat=-17.7&lng=168.3&zoom=10&country=VU&hazards=cyclone&layers=buildings,roads&cyclone=15&story=true
 */

import { CountryCode } from '@/types/thredds';

/**
 * Map state that can be persisted in URL
 */
export interface MapURLState {
  // Map view
  center?: { lat: number; lng: number };
  zoom?: number;

  // Country & region selection
  country?: CountryCode | null;
  region?: string | null;

  // Filters
  hazards?: string[];
  sectors?: string[];
  events?: string[];
  dateStart?: string;
  dateEnd?: string;
  aggregation?: 'district' | 'province';

  // Layer visibility
  layers?: string[]; // e.g., ['buildings', 'roads', 'cyclone']
  mapStyle?: 'loss' | 'wind';
  basemap?: string;

  // Cyclone animation
  cycloneIndex?: number;
  storyMode?: boolean;

  // Panel states
  showFilters?: boolean;
  showSummary?: boolean;
}

/**
 * Serialize map state to URL search params
 */
export function serializeMapState(state: MapURLState): URLSearchParams {
  const params = new URLSearchParams();

  // Map view
  if (state.center) {
    params.set('lat', state.center.lat.toFixed(4));
    params.set('lng', state.center.lng.toFixed(4));
  }
  if (state.zoom !== undefined) {
    params.set('zoom', state.zoom.toFixed(1));
  }

  // Country & region
  if (state.country) {
    params.set('country', state.country);
  }
  if (state.region) {
    params.set('region', state.region);
  }

  // Filters
  if (state.hazards && state.hazards.length > 0) {
    params.set('hazards', state.hazards.join(','));
  }
  if (state.sectors && state.sectors.length > 0) {
    params.set('sectors', state.sectors.join(','));
  }
  if (state.events && state.events.length > 0) {
    params.set('events', state.events.join(','));
  }
  if (state.dateStart) {
    params.set('dateStart', state.dateStart);
  }
  if (state.dateEnd) {
    params.set('dateEnd', state.dateEnd);
  }
  if (state.aggregation && state.aggregation !== 'district') {
    params.set('agg', state.aggregation);
  }

  // Layer visibility
  if (state.layers && state.layers.length > 0) {
    params.set('layers', state.layers.join(','));
  }
  if (state.mapStyle && state.mapStyle !== 'loss') {
    params.set('style', state.mapStyle);
  }
  if (state.basemap) {
    // Only store if non-default
    const defaultBasemap = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    if (state.basemap !== defaultBasemap) {
      params.set('basemap', encodeBasemapUrl(state.basemap));
    }
  }

  // Cyclone animation
  if (state.cycloneIndex !== undefined && state.cycloneIndex > 0) {
    params.set('cyclone', state.cycloneIndex.toString());
  }
  if (state.storyMode) {
    params.set('story', 'true');
  }

  // Panel states
  if (state.showFilters) {
    params.set('filters', 'true');
  }
  if (state.showSummary) {
    params.set('summary', 'true');
  }

  return params;
}

/**
 * Deserialize URL search params to map state
 */
export function deserializeMapState(params: URLSearchParams): Partial<MapURLState> {
  const state: Partial<MapURLState> = {};

  // Map view
  const lat = params.get('lat');
  const lng = params.get('lng');
  if (lat && lng) {
    state.center = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    };
  }

  const zoom = params.get('zoom');
  if (zoom) {
    state.zoom = parseFloat(zoom);
  }

  // Country & region
  const country = params.get('country');
  if (country) {
    state.country = country as CountryCode;
  }

  const region = params.get('region');
  if (region) {
    state.region = region;
  }

  // Filters
  const hazards = params.get('hazards');
  if (hazards) {
    state.hazards = hazards.split(',').filter(Boolean);
  }

  const sectors = params.get('sectors');
  if (sectors) {
    state.sectors = sectors.split(',').filter(Boolean);
  }

  const events = params.get('events');
  if (events) {
    state.events = events.split(',').filter(Boolean);
  }

  const dateStart = params.get('dateStart');
  if (dateStart) {
    state.dateStart = dateStart;
  }

  const dateEnd = params.get('dateEnd');
  if (dateEnd) {
    state.dateEnd = dateEnd;
  }

  const agg = params.get('agg');
  if (agg === 'province' || agg === 'district') {
    state.aggregation = agg;
  }

  // Layer visibility
  const layers = params.get('layers');
  if (layers) {
    state.layers = layers.split(',').filter(Boolean);
  }

  const style = params.get('style');
  if (style === 'loss' || style === 'wind') {
    state.mapStyle = style;
  }

  const basemap = params.get('basemap');
  if (basemap) {
    state.basemap = decodeBasemapUrl(basemap);
  }

  // Cyclone animation
  const cycloneIndex = params.get('cyclone');
  if (cycloneIndex) {
    state.cycloneIndex = parseInt(cycloneIndex, 10);
  }

  const storyMode = params.get('story');
  if (storyMode === 'true') {
    state.storyMode = true;
  }

  // Panel states
  const filters = params.get('filters');
  if (filters === 'true') {
    state.showFilters = true;
  }

  const summary = params.get('summary');
  if (summary === 'true') {
    state.showSummary = true;
  }

  return state;
}

/**
 * Encode basemap URL for URL parameter (shorter representation)
 */
function encodeBasemapUrl(url: string): string {
  // Use short codes for common basemaps
  const shortcuts: Record<string, string> = {
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json': 'positron',
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json': 'dark',
    'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json': 'voyager',
  };

  return shortcuts[url] || encodeURIComponent(url);
}

/**
 * Decode basemap URL from parameter
 */
function decodeBasemapUrl(encoded: string): string {
  const shortcuts: Record<string, string> = {
    positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  };

  return shortcuts[encoded] || decodeURIComponent(encoded);
}

/**
 * Build a shareable URL for current map state
 */
export function buildShareableUrl(state: MapURLState, baseUrl?: string): string {
  const params = serializeMapState(state);
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/?${params.toString()}`;
}

/**
 * Copy shareable URL to clipboard
 */
export async function copyShareableUrl(state: MapURLState): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    const url = buildShareableUrl(state);
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    console.error('Failed to copy URL to clipboard:', error);
    return false;
  }
}

/**
 * Get minimal state for "zoom to data" URLs
 */
export function getZoomToDataState(
  dataType: 'buildings' | 'roads',
  bounds: { lat: number; lng: number },
  country: CountryCode | null
): MapURLState {
  return {
    center: bounds,
    zoom: 14, // Appropriate zoom for viewing data points
    country: country,
    layers: [dataType],
    mapStyle: 'loss',
  };
}
