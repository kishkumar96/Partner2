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
  styleConfig?: WMSStyleConfig;
}

function getHazardDatasetInfo(countryCode: CountryCode): {
  countryPath: string;
  cycloneName: string;
} {
  switch (countryCode) {
    case 'VU':
      return { countryPath: 'vu_hazard', cycloneName: 'Lola' };
    case 'WS':
      return { countryPath: 'ws_hazard', cycloneName: 'Gita' };
    case 'TO':
      return { countryPath: 'Harold_TO', cycloneName: 'Harold' };
    case 'CK':
      return { countryPath: 'ck_hazard', cycloneName: 'Meena' };
    default:
      return { countryPath: 'vu_hazard', cycloneName: 'Lola' };
  }
}

function buildDatasetPath(layer: RealWMSLayer): string {
  // Samoa Gita datasets are published under a flat Gita_WS path.
  if (layer.countryCode === 'WS') {
    return `/POP/Partner2/case_study2/Gita_WS/${layer.ncFile}`;
  }

  // Tonga Harold datasets are published under a flat Harold_TO path.
  if (layer.countryCode === 'TO') {
    return `/POP/Partner2/case_study2/Harold_TO/${layer.ncFile}`;
  }

  const { countryPath, cycloneName } = getHazardDatasetInfo(layer.countryCode);
  return `/POP/Partner2/case_study2/hazard/${countryPath}/TC/${cycloneName}/${layer.ncFile}`;
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
    ncFile: 'SA_savaii_upolu_local_wind.nc', // Wind data
    layerName: 'Depth', // All layers named "Depth"
    description: 'Wind hazard from TC Gita (Savaii & Upolu)',
    hazardType: 'wind',
    // Use full regional extent for map rendering. A single-tile BBOX from a
    // manual GetMap request is too small and makes the layer appear missing.
    bbox: [-173.0, -14.5, -171.0, -13.0],
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
    ncFile: '_merged.nc', // Flood data
    layerName: 'Depth', // All layers named "Depth"
    description: 'Flood/inundation hazard from TC Gita (_merged.nc)',
    hazardType: 'flood',
    bbox: [-171.32576857676, -14.341425919499, -170.84386683102, -13.859524173763],
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:4326',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      colorScaleRange: '0,50',
      numColorBands: 50,
      aboveMaxColor: 'extend',
      belowMinColor: 'extend',
      bgColor: 'extend',
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
      wmsVersion: '1.1.1',
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
    styleConfig: {
      // Tonga flood depths use a narrower dataset range than Vanuatu.
      // Keep a country-specific COLORSCALERANGE to preserve local contrast.
      styles: 'default-scalar/x-Sst',
      colorScaleRange: '0.001694,2.691',
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },

  // Cook Islands - TC Meena
  {
    id: 'ck-tc-meena-wind',
    name: 'TC Meena Wind Hazard',
    countryCode: 'CK',
    ncFile: '_CK_subdomain_1_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Meena (_CK_subdomain_1_local_wind.nc)',
    hazardType: 'wind',
    bbox: [-162.0, -22.0, -157.0, -19.0], // Cook Islands southern group
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:4326',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      // Color scale from WMS GetMap request for Cook Islands wind speeds
      colorScaleRange: '0.1,27.93',
      numColorBands: 20,
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
    bbox: [-162.0, -22.0, -157.0, -19.0], // Cook Islands southern group
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:4326',
      styles: 'default-scalar/x-Sst',
      time: '2022-06-14T00:00:00.000Z',
      // Color scale from WMS GetMap request for Cook Islands flood depths
      colorScaleRange: '2.412,2.666',
      numColorBands: 20,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'extend',
      logScale: false,
    },
  },
];

/**
 * Build WMS GetMap URL for a layer
 * Note: WMS 1.3.0 with EPSG:4326 requires lat,lon order in BBOX
 */
export function buildRealWMSUrl(
  layer: RealWMSLayer,
  width: number = 512,
  height: number = 512,
  styles?: string
): string {
  const baseUrl = 'https://gemthreddshpc.spc.int/thredds/wms';

  const datasetPath = buildDatasetPath(layer);
  const wmsVersion = layer.styleConfig?.wmsVersion || '1.3.0';
  const isWms111 = wmsVersion === '1.1.1';
  const crs = layer.styleConfig?.crs || 'EPSG:3857';
  const isEpsg4326 = crs === 'EPSG:4326';
  const wmsBbox = isEpsg4326
    ? `${layer.bbox[0]},${layer.bbox[1]},${layer.bbox[2]},${layer.bbox[3]}`
    : bboxLonLatToWebMercator(layer.bbox);

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || 'default-scalar/default';

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: wmsVersion,
    REQUEST: 'GetMap',
    LAYERS: layer.layerName,
    ...(isWms111 ? { SRS: crs } : { CRS: crs }),
    BBOX: wmsBbox,
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    STYLES: styleToUse,
  });

  // Add ncWMS-specific parameters from layer config
  if (layer.styleConfig) {
    if (layer.styleConfig.colorScaleRange) {
      params.set('COLORSCALERANGE', layer.styleConfig.colorScaleRange);
    }
    if (layer.styleConfig.numColorBands !== undefined) {
      params.set('NUMCOLORBANDS', layer.styleConfig.numColorBands.toString());
    }
    if (layer.styleConfig.aboveMaxColor) {
      params.set('ABOVEMAXCOLOR', layer.styleConfig.aboveMaxColor);
    }
    if (layer.styleConfig.belowMinColor) {
      params.set('BELOWMINCOLOR', layer.styleConfig.belowMinColor);
    }
    if (layer.styleConfig.bgColor) {
      params.set('BGCOLOR', layer.styleConfig.bgColor);
    }
    if (layer.styleConfig.logScale !== undefined) {
      params.set('LOGSCALE', layer.styleConfig.logScale.toString());
    }
    if (layer.styleConfig.time) {
      params.set('TIME', layer.styleConfig.time);
    }
  }

  return `${baseUrl}${datasetPath}?${params.toString()}`;
}

/**
 * Get WMS tile URL template for MapLibre
 * MapLibre expects {bbox-epsg-4326} to be replaced, but we need to provide proper tile coordinates
 */
export function buildWMSTileUrl(layer: RealWMSLayer): string {
  const baseUrl = 'https://gemthreddshpc.spc.int/thredds/wms';

  const datasetPath = buildDatasetPath(layer);

  const styleToUse = layer.styleConfig?.styles || 'default-scalar/default';
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer.layerName,
    SRS: 'EPSG:3857',
    WIDTH: '256',
    HEIGHT: '256',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    STYLES: styleToUse,
  });

  if (layer.styleConfig?.colorScaleRange) {
    params.set('COLORSCALERANGE', layer.styleConfig.colorScaleRange);
  }
  if (layer.styleConfig?.numColorBands !== undefined) {
    params.set('NUMCOLORBANDS', layer.styleConfig.numColorBands.toString());
  }
  if (layer.styleConfig?.aboveMaxColor) {
    params.set('ABOVEMAXCOLOR', layer.styleConfig.aboveMaxColor);
  }
  if (layer.styleConfig?.belowMinColor) {
    params.set('BELOWMINCOLOR', layer.styleConfig.belowMinColor);
  }
  if (layer.styleConfig?.bgColor) {
    params.set('BGCOLOR', layer.styleConfig.bgColor);
  }
  if (layer.styleConfig?.logScale !== undefined) {
    params.set('LOGSCALE', layer.styleConfig.logScale.toString());
  }
  if (layer.styleConfig?.time) {
    params.set('TIME', layer.styleConfig.time);
  }

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
  const baseUrl = 'https://gemthreddshpc.spc.int/thredds/wms';

  const datasetPath = buildDatasetPath(layer);
  const wmsVersion = layer.styleConfig?.wmsVersion || '1.3.0';
  const isWms111 = wmsVersion === '1.1.1';
  const crs = layer.styleConfig?.crs || 'EPSG:3857';
  const isEpsg4326 = crs === 'EPSG:4326';
  const wmsBbox = isEpsg4326
    ? `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`
    : bboxLonLatToWebMercator(bbox);

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || 'default-scalar/default';

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: wmsVersion,
    REQUEST: 'GetMap',
    LAYERS: layer.layerName,
    ...(isWms111 ? { SRS: crs } : { CRS: crs }),
    BBOX: wmsBbox,
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    STYLES: styleToUse,
  });

  // Note: THREDDS WMS responses include Cache-Control headers by default.
  // Browsers cache identical requests for faster subsequent loads.
  // For production, consider adding CDN (CloudFlare/AWS CloudFront) to reduce latency.

  // Add ncWMS-specific parameters from layer config
  if (layer.styleConfig) {
    if (layer.styleConfig.colorScaleRange) {
      params.set('COLORSCALERANGE', layer.styleConfig.colorScaleRange);
    }
    if (layer.styleConfig.numColorBands !== undefined) {
      params.set('NUMCOLORBANDS', layer.styleConfig.numColorBands.toString());
    }
    if (layer.styleConfig.aboveMaxColor) {
      params.set('ABOVEMAXCOLOR', layer.styleConfig.aboveMaxColor);
    }
    if (layer.styleConfig.belowMinColor) {
      params.set('BELOWMINCOLOR', layer.styleConfig.belowMinColor);
    }
    if (layer.styleConfig.bgColor) {
      params.set('BGCOLOR', layer.styleConfig.bgColor);
    }
    if (layer.styleConfig.logScale !== undefined) {
      params.set('LOGSCALE', layer.styleConfig.logScale.toString());
    }
    if (layer.styleConfig.time) {
      params.set('TIME', layer.styleConfig.time);
    }
  }

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
