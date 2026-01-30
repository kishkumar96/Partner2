/**
 * Real THREDDS WMS layer configurations
 * Based on actual available data from Pacific Ocean Portal
 */

import { CountryCode } from "@/types/thredds";

export interface RealWMSLayer {
  id: string;
  name: string;
  countryCode: CountryCode;
  ncFile: string;
  layerName: string;
  description: string;
  hazardType: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Real available WMS layers from THREDDS for TC Lola - Vanuatu
 */
export const REAL_WMS_LAYERS: RealWMSLayer[] = [
  {
    id: "vu-tc-lola-flood-depth",
    name: "TC Lola Flood Depth (South Santo)",
    countryCode: "VU",
    ncFile: "Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.nc",
    layerName: "Depth",
    description: "Flood depth from TC Lola - Pluvial and Fluvial flooding (South Santo)",
    hazardType: "flood",
    bbox: [166.5, -16.0, 167.5, -15.0], // South Santo area
  },
  {
    id: "vu-tc-lola-wind-depth",
    name: "TC Lola Wind Impact",
    countryCode: "VU",
    ncFile: "local_wind.nc",
    layerName: "Depth", // local_wind.nc uses "Depth" as layer name
    description: "Wind impact/depth data from TC Lola",
    hazardType: "wind",
    bbox: [166.0, -20.5, 170.5, -13.0], // Full Vanuatu
  },
  {
    id: "vu-tc-lola-merged-hazard",
    name: "TC Lola Merged Hazard Depth",
    countryCode: "VU",
    ncFile: "VU_merged.nc",
    layerName: "Depth", // VU_merged.nc uses "Depth" as layer name
    description: "Merged hazard depth data from TC Lola",
    hazardType: "cyclone",
    bbox: [166.0, -20.5, 170.5, -13.0], // Full Vanuatu
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
  styles: string = "default-scalar/default"
): string {
  const baseUrl = "https://gemthreddshpc.spc.int/thredds/wms";
  const datasetPath = `/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola/${layer.ncFile}`;
  
  // WMS 1.3.0 with EPSG:4326 requires BBOX in lat,lon order: minLat,minLon,maxLat,maxLon
  // Our bbox is stored as [minLon, minLat, maxLon, maxLat]
  const wmsBbox = `${layer.bbox[1]},${layer.bbox[0]},${layer.bbox[3]},${layer.bbox[2]}`;
  
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.layerName,
    CRS: "EPSG:4326",
    BBOX: wmsBbox,
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: "image/png",
    TRANSPARENT: "true",
    STYLES: styles,
  });
  
  return `${baseUrl}${datasetPath}?${params.toString()}`;
}

/**
 * Get WMS tile URL template for MapLibre
 * MapLibre expects {bbox-epsg-4326} to be replaced, but we need to provide proper tile coordinates
 */
export function buildWMSTileUrl(layer: RealWMSLayer, styles: string = "default-scalar/default"): string {
  const baseUrl = "https://gemthreddshpc.spc.int/thredds/wms";
  const datasetPath = `/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola/${layer.ncFile}`;
  
  // For WMS with MapLibre, we can't use standard tiling
  // Instead, return base URL and we'll use image source with bounds
  return `${baseUrl}${datasetPath}`;
}

/**
 * Build a static WMS image URL for a specific bounding box
 * This is used for image sources in MapLibre
 * Note: WMS 1.3.0 with EPSG:4326 requires lat,lon order in BBOX
 */
export function buildWMSImageUrl(
  layer: RealWMSLayer,
  bbox: [number, number, number, number],
  width: number = 1024,
  height: number = 1024,
  styles: string = "default-scalar/default"
): string {
  const baseUrl = "https://gemthreddshpc.spc.int/thredds/wms";
  const datasetPath = `/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola/${layer.ncFile}`;
  
  // WMS 1.3.0 with EPSG:4326 requires BBOX in lat,lon order: minLat,minLon,maxLat,maxLon
  // Our bbox is stored as [minLon, minLat, maxLon, maxLat]
  const wmsBbox = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.layerName,
    CRS: "EPSG:4326",
    BBOX: wmsBbox,
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: "image/png",
    TRANSPARENT: "true",
    STYLES: styles,
  });
  
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
  DEFAULT: "default-scalar/default",
  
  // Alternative color schemes
  ANUJ: "anuj",
  ANUJ6: "anuj6",
  ANUJ11: "anuj11",
  ANUJ12: "anuj12",
  
  // Contour styles
  CONTOURS: "colored_contours/default",
  
  // Convergence styles
  CONVERGE: "converge",
  CONVERGE2: "converge2",
  CONVERGE44: "converge44",
  CONVERGE47: "converge47",
  
  // Arrow styles (for wind direction)
  ARROW: "arrow2",
  BLACK_ARROW: "black-arrow",
};
