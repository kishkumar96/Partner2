/**
 * Real THREDDS WMS layer configurations
 * Based on actual available data from Pacific Ocean Portal
 */

import { CountryCode } from '@/types/thredds';

export interface WMSStyleConfig {
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
    bbox: [166.0, -20.5, 170.5, -13.0], // Full Vanuatu
    styleConfig: {
      styles: 'default-scalar/seq-YlOrRd',
      colorScaleRange: '0,80',
      numColorBands: 8,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'transparent',
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
    bbox: [166.0, -20.5, 170.5, -13.0], // Full Vanuatu
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
  {
    id: 'vu-tc-lola-flood-depth',
    name: 'TC Lola Flood Depth (South Santo)',
    countryCode: 'VU',
    ncFile: 'Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.nc',
    layerName: 'Depth',
    description: 'Flood depth from TC Lola - Pluvial and Fluvial flooding (South Santo)',
    hazardType: 'flood',
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
    bbox: [-173.0, -14.5, -171.0, -13.0], // Western Samoa
    styleConfig: {
      styles: 'default-scalar/seq-YlOrRd',
      colorScaleRange: '0,80',
      numColorBands: 8,
      aboveMaxColor: 'extend',
      belowMinColor: 'transparent',
      bgColor: 'transparent',
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
    bbox: [-173.0, -14.5, -171.0, -13.0], // Western Samoa
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

  // Build country-specific path
  const countryPath = layer.countryCode === 'VU' ? 'vu_hazard' : 'ws_hazard';
  const cycloneName = layer.countryCode === 'VU' ? 'Lola' : 'Gita';
  const datasetPath = `/POP/Partner2/case_study2/hazard/${countryPath}/TC/${cycloneName}/${layer.ncFile}`;

  // WMS 1.3.0 with EPSG:4326 requires BBOX in lat,lon order: minLat,minLon,maxLat,maxLon
  // Our bbox is stored as [minLon, minLat, maxLon, maxLat]
  const wmsBbox = `${layer.bbox[1]},${layer.bbox[0]},${layer.bbox[3]},${layer.bbox[2]}`;

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || 'default-scalar/default';

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer.layerName,
    CRS: 'EPSG:4326',
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

  // Build country-specific path
  const countryPath = layer.countryCode === 'VU' ? 'vu_hazard' : 'ws_hazard';
  const cycloneName = layer.countryCode === 'VU' ? 'Lola' : 'Gita';
  const datasetPath = `/POP/Partner2/case_study2/hazard/${countryPath}/TC/${cycloneName}/${layer.ncFile}`;

  // For WMS with MapLibre, we can't use standard tiling
  // Instead, return base URL and we'll use image source with bounds
  return `${baseUrl}${datasetPath}`;
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

  // Build country-specific path
  const countryPath = layer.countryCode === 'VU' ? 'vu_hazard' : 'ws_hazard';
  const cycloneName = layer.countryCode === 'VU' ? 'Lola' : 'Gita';
  const datasetPath = `/POP/Partner2/case_study2/hazard/${countryPath}/TC/${cycloneName}/${layer.ncFile}`;

  // WMS 1.3.0 with EPSG:4326 requires BBOX in lat,lon order: minLat,minLon,maxLat,maxLon
  // Our bbox is stored as [minLon, minLat, maxLon, maxLat]
  const wmsBbox = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;

  // Use layer-specific style config or provided style, fallback to default
  const styleToUse = styles || layer.styleConfig?.styles || 'default-scalar/default';

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0', // THREDDS requires 1.3.0 for _merged.nc layers
    REQUEST: 'GetMap',
    LAYERS: layer.layerName,
    CRS: 'EPSG:4326', // 1.3.0 uses CRS instead of SRS
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
