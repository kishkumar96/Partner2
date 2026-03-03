/**
 * URL State Management
 *
 * Serialize/deserialize application state to/from URL query parameters.
 * Enables shareable links and bookmarking of specific map views.
 *
 * Example URL:
 * /vanuatu?lat=-17.7&lng=168.3&zoom=10&hazards=cyclone&layers=buildings,roads
 */

/**
 * Map state that can be persisted in URL
 */
export interface MapURLState {
  // Map view
  center?: { lat: number; lng: number };
  zoom?: number;

  // Region selection
  region?: string | null;

  // Filters
  hazards?: string[];
  sectors?: string[];
  events?: string[];
  dateStart?: string;
  dateEnd?: string;
  aggregation?: 'district' | 'province';

  // Layer visibility
  layers?: string[];
  mapStyle?: 'loss' | 'wind';
  basemap?: string;

  // Cyclone animation
  cycloneIndex?: number;
  storyMode?: boolean;

  // Panel states
  showFilters?: boolean;
  showSummary?: boolean;
}

export function serializeMapState(state: MapURLState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.center) {
    params.set('lat', state.center.lat.toFixed(4));
    params.set('lng', state.center.lng.toFixed(4));
  }
  if (state.zoom !== undefined) {
    params.set('zoom', state.zoom.toFixed(1));
  }

  if (state.region) {
    params.set('region', state.region);
  }

  if (state.hazards?.length) params.set('hazards', state.hazards.join(','));
  if (state.sectors?.length) params.set('sectors', state.sectors.join(','));
  if (state.events?.length) params.set('events', state.events.join(','));
  if (state.dateStart) params.set('dateStart', state.dateStart);
  if (state.dateEnd) params.set('dateEnd', state.dateEnd);
  if (state.aggregation && state.aggregation !== 'district') params.set('agg', state.aggregation);

  if (state.layers?.length) params.set('layers', state.layers.join(','));
  if (state.mapStyle && state.mapStyle !== 'loss') params.set('style', state.mapStyle);
  if (state.basemap) {
    const defaultBasemap = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    if (state.basemap !== defaultBasemap) {
      params.set('basemap', encodeBasemapUrl(state.basemap));
    }
  }

  if (state.cycloneIndex !== undefined && state.cycloneIndex > 0) {
    params.set('cyclone', String(state.cycloneIndex));
  }
  if (state.storyMode) params.set('story', 'true');
  if (state.showFilters) params.set('filters', 'true');
  if (state.showSummary) params.set('summary', 'true');

  return params;
}

export function deserializeMapState(params: URLSearchParams): Partial<MapURLState> {
  const state: Partial<MapURLState> = {};

  const lat = params.get('lat');
  const lng = params.get('lng');
  if (lat && lng) {
    state.center = { lat: parseFloat(lat), lng: parseFloat(lng) };
  }

  const zoom = params.get('zoom');
  if (zoom) state.zoom = parseFloat(zoom);

  const region = params.get('region');
  if (region) state.region = region;

  const hazards = params.get('hazards');
  if (hazards) state.hazards = hazards.split(',').filter(Boolean);

  const sectors = params.get('sectors');
  if (sectors) state.sectors = sectors.split(',').filter(Boolean);

  const events = params.get('events');
  if (events) state.events = events.split(',').filter(Boolean);

  const dateStart = params.get('dateStart');
  if (dateStart) state.dateStart = dateStart;

  const dateEnd = params.get('dateEnd');
  if (dateEnd) state.dateEnd = dateEnd;

  const agg = params.get('agg');
  if (agg === 'province' || agg === 'district') state.aggregation = agg;

  const layers = params.get('layers');
  if (layers) state.layers = layers.split(',').filter(Boolean);

  const style = params.get('style');
  if (style === 'loss' || style === 'wind') state.mapStyle = style;

  const basemap = params.get('basemap');
  if (basemap) state.basemap = decodeBasemapUrl(basemap);

  const cycloneIndex = params.get('cyclone');
  if (cycloneIndex) state.cycloneIndex = parseInt(cycloneIndex, 10);

  if (params.get('story') === 'true') state.storyMode = true;
  if (params.get('filters') === 'true') state.showFilters = true;
  if (params.get('summary') === 'true') state.showSummary = true;

  return state;
}

function encodeBasemapUrl(url: string): string {
  const shortcuts: Record<string, string> = {
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json': 'positron',
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json': 'dark',
    'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json': 'voyager',
  };
  return shortcuts[url] || encodeURIComponent(url);
}

function decodeBasemapUrl(encoded: string): string {
  const shortcuts: Record<string, string> = {
    positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  };
  return shortcuts[encoded] || decodeURIComponent(encoded);
}

export function buildShareableUrl(state: MapURLState, path: string, baseUrl?: string): string {
  const params = serializeMapState(state);
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const query = params.toString();
  return `${base}${path}${query ? `?${query}` : ''}`;
}

export async function copyShareableUrl(state: MapURLState, path: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    const url = buildShareableUrl(state, path);
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    console.error('Failed to copy URL to clipboard:', error);
    return false;
  }
}

export function getZoomToDataState(
  dataType: 'buildings' | 'roads',
  bounds: { lat: number; lng: number }
): MapURLState {
  return {
    center: bounds,
    zoom: 14,
    layers: [dataType],
    mapStyle: 'loss',
  };
}
