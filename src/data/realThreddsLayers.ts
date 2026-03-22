/**
 * Real THREDDS WMS layer configurations
 * Based on actual available data from Pacific Ocean Portal
 */

import { CountryCode } from '@/types/thredds';

export interface WMSStyleConfig {
  wmsVersion?: '1.1.1' | '1.3.0';
  crs?: 'EPSG:4326' | 'EPSG:3857';
  styles?: string;
  colorScaleRange?: string;
  numColorBands?: number;
  aboveMaxColor?: string;
  belowMinColor?: string;
  bgColor?: string;
  logScale?: boolean;
  time?: string;
}

export interface RealWMSLayer {
  id: string;
  name: string;
  countryCode: CountryCode;
  ncFile: string;
  layerName: string;
  description: string;
  hazardType: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  maxNativeZoom?: number;
  styleConfig?: WMSStyleConfig;
}

const DEFAULT_STYLE = 'default-scalar/default';
const DEFAULT_WMS_VERSION: NonNullable<WMSStyleConfig['wmsVersion']> = '1.3.0';
const DEFAULT_CRS: NonNullable<WMSStyleConfig['crs']> = 'EPSG:3857';
const NEXT_PUBLIC_BASE_PATH =
  process.env.NODE_ENV === 'production'
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '/partner2')
    : (process.env.NEXT_PUBLIC_BASE_PATH ?? '');

const COUNTRY_DATASET_BASE_PATH: Record<CountryCode, string> = {
  VU: '/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola',
  WS: '/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita',
  TO: '/POP/Partner2/case_study2/Harold_TO',
  CK: '/POP/Partner2/case_study2/hazard/ck_hazard/TC/Meena',
};

function buildDatasetPath(layer: RealWMSLayer): string {
  return `${COUNTRY_DATASET_BASE_PATH[layer.countryCode]}/${layer.ncFile}`;
}

const WEB_MERCATOR_MAX_LAT = 85.05112878;
const EARTH_RADIUS_METERS = 6378137;

function clampLatForMercator(lat: number): number {
  return Math.max(Math.min(lat, WEB_MERCATOR_MAX_LAT), -WEB_MERCATOR_MAX_LAT);
}

function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const clampedLat = clampLatForMercator(lat);
  const x = (lon * Math.PI * EARTH_RADIUS_METERS) / 180;
  const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360));
  return [x, y];
}

function bboxLonLatToWebMercator(bbox: [number, number, number, number]): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [minX, minY] = lonLatToWebMercator(minLon, minLat);
  const [maxX, maxY] = lonLatToWebMercator(maxLon, maxLat);
  return `${minX},${minY},${maxX},${maxY}`;
}

function applyNcWmsStyleParams(params: URLSearchParams, styleConfig?: WMSStyleConfig): void {
  if (!styleConfig) return;

  if (styleConfig.colorScaleRange) {
    params.set('COLORSCALERANGE', styleConfig.colorScaleRange);
  }
  if (styleConfig.numColorBands !== undefined) {
    params.set('NUMCOLORBANDS', styleConfig.numColorBands.toString());
  }
  if (styleConfig.aboveMaxColor) {
    params.set('ABOVEMAXCOLOR', styleConfig.aboveMaxColor);
  }
  if (styleConfig.belowMinColor) {
    params.set('BELOWMINCOLOR', styleConfig.belowMinColor);
  }
  if (styleConfig.bgColor) {
    params.set('BGCOLOR', styleConfig.bgColor);
  }
  if (styleConfig.logScale !== undefined) {
    params.set('LOGSCALE', styleConfig.logScale.toString());
  }
  if (styleConfig.time) {
    params.set('TIME', styleConfig.time);
  }
}

function createBaseWmsParams(options: {
  layerName: string;
  version: NonNullable<WMSStyleConfig['wmsVersion']>;
  crs: NonNullable<WMSStyleConfig['crs']>;
  bbox?: string;
  width: number;
  height: number;
  styles: string;
}): URLSearchParams {
  const { layerName, version, crs, bbox, width, height, styles } = options;
  const isWms111 = version === '1.1.1';

  return new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: version,
    REQUEST: 'GetMap',
    LAYERS: layerName,
    ...(isWms111 ? { SRS: crs } : { CRS: crs }),
    ...(bbox ? { BBOX: bbox } : {}),
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    STYLES: styles,
  });
}

/**
 * Real available WMS layers from THREDDS for TC Lola - Vanuatu and TC Gita - Western Samoa
 */
export const REAL_WMS_LAYERS: RealWMSLayer[] = [
  // Vanuatu - TC Lola
  // Note: All NetCDF files use "Depth" as the layer name
  // Different files contain different hazard types (wind vs flood)
  {
    id: 'vu-tc-lola-wind',
    name: 'TC Lola Wind Hazard',
    countryCode: 'VU',
    ncFile: 'local_wind.nc', // Wind data in local_wind.nc
    layerName: 'Depth', // All layers named "Depth" in THREDDS
    description: 'Wind hazard from TC Lola (local_wind.nc)',
    hazardType: 'wind',
    // Use dataset extent (not a single tile bbox) so image overlays stay geographically anchored.
    bbox: [166.54033818684763, -20.264667548114673, 170.24232553831496, -13.059866369838865],
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.1,65.74',
      numColorBands: 50,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'vu-tc-lola-inundation',
    name: 'TC Lola Flood Hazard',
    countryCode: 'VU',
    ncFile: '_merged.nc', // Flood data in _merged.nc
    layerName: 'Depth', // All layers named "Depth" in THREDDS
    description: 'Flood/inundation hazard from TC Lola (_merged.nc)',
    hazardType: 'flood',
    // Match server-advertised bounds from GetCapabilities for better map fit/loading.
    bbox: [166.54033818684763, -20.264667548114673, 170.24232553831496, -13.059866369838865],
    // Allow deeper native tile fetches so the flood raster stays sharp when users
    // zoom into island/coastal detail instead of overzooming z12 tiles.
    maxNativeZoom: 15,
    styleConfig: {
      // Match THREDDS Flood Depth default rendering for _merged.nc.
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0,4',
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'vu-tc-lola-flood-depth',
    name: 'TC Lola Flood Depth (South Santo)',
    countryCode: 'VU',
    ncFile: 'Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.nc',
    layerName: 'Depth',
    description: 'Flood depth from TC Lola - Pluvial and Fluvial flooding (South Santo)',
    // Keep this specialized raster out of default inundation rendering.
    // It is enabled through explicit fluvial hazard filtering.
    hazardType: 'fluvial-depth',
    bbox: [166.5, -16.0, 167.5, -15.0], // South Santo area
    styleConfig: {
      styles: 'default-scalar/seq-Blues',
      colorScaleRange: '0,5',
      numColorBands: 8,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'transparent',
      logScale: false,
    },
  },

  // Western Samoa - TC Gita
  // Note: All NetCDF files use "Depth" as the layer name
  {
    id: 'ws-tc-gita-wind',
    name: 'TC Gita Wind Hazard',
    countryCode: 'WS',
    ncFile: 'SA_savaii_upolu_local_wind.nc', // Wind data (correct filename from THREDDS)
    layerName: 'Depth', // All layers named "Depth"
    description: 'Wind hazard from TC Gita',
    hazardType: 'wind',
    bbox: [
      -172.8092202219999933, -14.0791361030754079, -171.3973987012869031, -13.4344756949999997,
    ],
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:4326',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.1,47.79',
      numColorBands: 50,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'ws-tc-gita-inundation',
    name: 'TC Gita Flood Hazard',
    countryCode: 'WS',
    ncFile: 'WS_merged.nc', // Flood data — confirmed filename from GetCapabilities
    layerName: 'Depth', // WMS layer name is "Depth" (title is "Flood Depth")
    description: 'Flood/inundation hazard from TC Gita (WS_merged.nc)',
    hazardType: 'flood',
    bbox: [
      -172.8092202219999933, -14.0791361030754079, -171.3973987012869031, -13.4344756949999997,
    ],
    // Allow deeper native tile fetches so the flood raster stays sharp when users
    // zoom into island/coastal detail instead of overzooming z12 tiles.
    maxNativeZoom: 15,
    styleConfig: {
      // Use EPSG:3857 + WMS 1.1.1 so the tiled rendering path is taken.
      // buildWMSTileUrl hardcodes SRS=EPSG:3857/WMS-1.1.1 which THREDDS supports.
      // Using EPSG:4326 forces the single static image path, which sends wrong
      // bbox coordinates and returns only 3 white tiles.
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      // Use x-Sst — confirmed working palette on this THREDDS server (same as VU/TO layers).
      // seq-Blues is not listed in GetCapabilities and returns white tiles on this server.
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.01,5', // 0–5m covers realistic TC coastal inundation depths
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'transparent',
      logScale: false,
    },
  },

  // Tonga - TC Harold
  {
    id: 'to-tc-harold-wind',
    name: 'TC Harold Wind Hazard',
    countryCode: 'TO',
    ncFile: 'local_wind_merged.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Harold (local_wind_merged.nc)',
    hazardType: 'wind',
    bbox: [-176.5, -23.5, -173.0, -15.0],
    styleConfig: {
      wmsVersion: '1.3.0',
      crs: 'EPSG:3857',
      // Keep calm/near-zero wind values transparent by setting a non-zero lower bound.
      // This mirrors the known-good Harold_TO WMS profile.
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '27.54,59.99',
      numColorBands: 250,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'to-tc-harold-inundation',
    name: 'TC Harold Flood Hazard',
    countryCode: 'TO',
    ncFile: 'best.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Harold (best.nc)',
    hazardType: 'flood',
    bbox: [-176.5, -23.5, -173.0, -15.0],
    // Use tiled requests to avoid a single full-extent static GetMap that can
    // exceed proxy timeout windows for Harold_TO/best.nc.
    maxNativeZoom: 12,
    styleConfig: {
      // Force the tiled path in RealDataLayers (EPSG:3857), which distributes
      // work into smaller GetMap calls and avoids repeated 30s+ static timeouts.
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      // Match the known-good Godiva request for Harold_TO/best.nc exactly.
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.0586,1.899',
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'extend',
      bgColor: 'extend',
      logScale: false,
    },
  },

  // Cook Islands - TC Meena
  {
    id: 'ck-tc-meena-wind-subdomain-1',
    name: 'TC Meena Wind Hazard (Subdomain 1)',
    countryCode: 'CK',
    ncFile: '_CK_subdomain_1_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Meena (_CK_subdomain_1_local_wind.nc)',
    hazardType: 'wind',
    // Use the server-advertised subdomain extent so the raster is not stretched
    // across the full Cook Islands archipelago.
    bbox: [-166.24347222222224, -13.386527777777781, -157.24347222222212, -8.38652777777778],
    maxNativeZoom: 15,
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.1,65.74',
      numColorBands: 50,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'ck-tc-meena-wind-subdomain-2',
    name: 'TC Meena Wind Hazard (Subdomain 2)',
    countryCode: 'CK',
    ncFile: '_CK_subdomain_2_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Meena (_CK_subdomain_2_local_wind.nc)',
    hazardType: 'wind',
    // Use the server-advertised subdomain extent so the raster is not stretched
    // across the full Cook Islands archipelago.
    bbox: [-160.60208333348902, -22.813472222378515, -156.60208333319275, -18.813472222156314],
    maxNativeZoom: 15,
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.1,65.74',
      numColorBands: 50,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
  {
    id: 'ck-tc-meena-inundation',
    name: 'TC Meena Flood Hazard',
    countryCode: 'CK',
    ncFile: 'CK_merged.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Meena (CK_merged.nc)',
    hazardType: 'flood',
    bbox: [
      -163.1997484633778299, -21.9594303145659886, -157.3212295556423328, -17.9868879088506723,
    ],
    // Verified against THREDDS with small-bbox GetMap requests after fixing the
    // palette name, so we can fetch native tiles deeper into the zoom range.
    maxNativeZoom: 15,
    styleConfig: {
      // Use tiled WMS requests for Cook Islands flood to avoid compressing the
      // entire archipelago into a single 256px image overlay.
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0.01,5',
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'transparent',
      logScale: false,
    },
  },
];

/**
 * Build WMS GetMap URL for a layer
 * Note: WMS 1.3.0 with EPSG:4326 requires lat,lon order in BBOX
 */
/** Base URL for WMS requests — routes through the same-origin proxy in the browser */
function wmsBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_THREDDS_WMS_URL ?? '/api/partner-proxy/thredds/wms';

  // In production the app is served under /partner2, so relative proxy URLs must
  // include the base path. Dev keeps an empty base path, so this stays unchanged.
  if (
    configuredUrl.startsWith('/') &&
    NEXT_PUBLIC_BASE_PATH &&
    !configuredUrl.startsWith(NEXT_PUBLIC_BASE_PATH)
  ) {
    return `${NEXT_PUBLIC_BASE_PATH}${configuredUrl}`;
  }

  return configuredUrl;
}

export function buildRealWMSUrl(
  layer: RealWMSLayer,
  width: number = 512,
  height: number = 512,
  styles?: string
): string {
  const baseUrl = wmsBaseUrl();

  const datasetPath = buildDatasetPath(layer);
  const wmsVersion = layer.styleConfig?.wmsVersion || DEFAULT_WMS_VERSION;
  const crs = layer.styleConfig?.crs || DEFAULT_CRS;
  const isEpsg4326 = crs === 'EPSG:4326';
  const wmsBbox = isEpsg4326
    ? `${layer.bbox[0]},${layer.bbox[1]},${layer.bbox[2]},${layer.bbox[3]}`
    : bboxLonLatToWebMercator(layer.bbox);

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || DEFAULT_STYLE;
  const params = createBaseWmsParams({
    layerName: layer.layerName,
    version: wmsVersion,
    crs,
    bbox: wmsBbox,
    width,
    height,
    styles: styleToUse,
  });
  applyNcWmsStyleParams(params, layer.styleConfig);

  return `${baseUrl}${datasetPath}?${params.toString()}`;
}

/**
 * Get WMS tile URL template for MapLibre
 * MapLibre expects {bbox-epsg-4326} to be replaced, but we need to provide proper tile coordinates
 */
export function buildWMSTileUrl(layer: RealWMSLayer): string {
  const baseUrl = wmsBaseUrl();

  const datasetPath = buildDatasetPath(layer);

  const styleToUse = layer.styleConfig?.styles || DEFAULT_STYLE;
  const params = createBaseWmsParams({
    layerName: layer.layerName,
    version: '1.1.1',
    crs: 'EPSG:3857',
    width: 256,
    height: 256,
    styles: styleToUse,
  });
  applyNcWmsStyleParams(params, layer.styleConfig);

  // Keep BBOX token unencoded so MapLibre can replace it per tile.
  // MapLibre reliably supports the EPSG:3857 placeholder for raster tile templates.
  const queryWithoutBbox = params.toString();
  return `${baseUrl}${datasetPath}?${queryWithoutBbox}&BBOX={bbox-epsg-3857}`;
}

/**
 * Build a static WMS image URL for a specific bounding box
 * This is used for image sources in MapLibre
 * Note: WMS 1.3.0 with EPSG:4326 requires lat,lon order in BBOX
 */
/**
 * Build WMS GetMap URL for THREDDS server
 *
 * Performance optimizations:
 * - Uses WMS 1.1.1 (faster than 1.3.0 for THREDDS)
 * - Defaults to 256×256 tiles (matches THREDDS optimal tile size)
 * - Requests are ~4× faster than 512×512, ~16× faster than 1024×1024
 *
 * @param layer - Layer configuration with ncFile and styling
 * @param bbox - Bounding box [minLon, minLat, maxLon, maxLat]
 * @param width - Image width in pixels (default 256)
 * @param height - Image height in pixels (default 256)
 * @param styles - Optional style override
 * @returns Complete WMS GetMap URL
 */
export function buildWMSImageUrl(
  layer: RealWMSLayer,
  bbox: [number, number, number, number],
  width: number = 256, // Default to 256 for optimal THREDDS tile size
  height: number = 256,
  styles?: string
): string {
  const baseUrl = wmsBaseUrl();

  const datasetPath = buildDatasetPath(layer);
  const wmsVersion = layer.styleConfig?.wmsVersion || DEFAULT_WMS_VERSION;
  const crs = layer.styleConfig?.crs || DEFAULT_CRS;
  const isEpsg4326 = crs === 'EPSG:4326';
  const wmsBbox = isEpsg4326
    ? `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`
    : bboxLonLatToWebMercator(bbox);

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || DEFAULT_STYLE;
  const params = createBaseWmsParams({
    layerName: layer.layerName,
    version: wmsVersion,
    crs,
    bbox: wmsBbox,
    width,
    height,
    styles: styleToUse,
  });

  // Note: THREDDS WMS responses include Cache-Control headers by default.
  // Browsers cache identical requests for faster subsequent loads.
  // For production, consider adding CDN (CloudFlare/AWS CloudFront) to reduce latency.

  applyNcWmsStyleParams(params, layer.styleConfig);

  return `${baseUrl}${datasetPath}?${params.toString()}`;
}

/**
 * Get available layers for a country
 */
export function getLayersForCountry(countryCode: CountryCode): RealWMSLayer[] {
  return REAL_WMS_LAYERS.filter(layer => layer.countryCode === countryCode);
}

/**
 * Available color styles for WMS layers
 * These are the styles available in the THREDDS WMS server
 * Verified from GetCapabilities response
 */
export const WMS_STYLES = {
  // Default and recommended
  DEFAULT: 'default-scalar/default',

  // Diverging color schemes (Blue-Red)
  DIV_BURD: 'default-scalar/div-BuRd',

  // Viridis color scheme (purple to yellow-green)
  PSU_VIRIDIS: 'default-scalar/psu-viridis',

  // Rainbow progression (violet→blue→cyan→green→yellow→orange→red)
  RAINBOW: 'default-scalar/rainbow',

  // Yellow-Orange-Red sequential scale (warm colors for intensity)
  SEQ_YLORD: 'default-scalar/seq-YlOrRd',
  YLORD: 'YlOrRd', // ColorBrewer format without prefix (more widely supported)

  // Alternative color schemes
  ANUJ: 'anuj',
  ANUJ6: 'anuj6',
  ANUJ11: 'anuj11',
  ANUJ12: 'anuj12',

  // Contour styles
  CONTOURS: 'colored_contours/default',

  // Convergence styles
  CONVERGE: 'converge',
  CONVERGE2: 'converge2',
  CONVERGE44: 'converge44',
  CONVERGE47: 'converge47',

  // Arrow styles (for wind direction)
  ARROW: 'arrow2',
  BLACK_ARROW: 'black-arrow',
};
