import { BUILDING_DAMAGE_COLORS, ROAD_DAMAGE_COLORS } from '@/theme/colors';
import { getLossSequentialColors, WIND_SEQUENTIAL_COLORS } from '@/utils/colorSystem';
import { CountryCode } from '@/types/thredds';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';

export interface LegendThreshold {
  value: number;
  label: string;
  rangeLabel?: string;
  descriptiveLabel?: string;
  color: string;
}

export function getLegendRangeLabel(
  threshold: Pick<LegendThreshold, 'label' | 'rangeLabel'>
): string {
  return threshold.rangeLabel || threshold.label;
}

export function getLegendDisplayLabel(
  threshold: Pick<LegendThreshold, 'label' | 'rangeLabel' | 'descriptiveLabel'>
): string {
  return threshold.descriptiveLabel?.trim() || getLegendRangeLabel(threshold);
}

export interface LegendSettings {
  loss: LegendThreshold[];
  wind: LegendThreshold[];
  buildings: LegendThreshold[];
  roads: LegendThreshold[];
}

export const createDefaultLegendSettings = (countryCode?: CountryCode | null): LegendSettings => {
  const lossColors = getLossSequentialColors(countryCode);

  return {
    loss: lossColors.map((item: { threshold: number; color: string }, index: number) => {
      const nextValue = lossColors[index + 1]?.threshold;
      return {
        value: item.threshold,
        label: nextValue
          ? `$${item.threshold / 1e6}M - $${nextValue / 1e6}M`
          : `> $${item.threshold / 1e6}M`,
        rangeLabel: nextValue
          ? `$${item.threshold / 1e6}M - $${nextValue / 1e6}M`
          : `> $${item.threshold / 1e6}M`,
        color: item.color,
      };
    }),
    wind: WIND_SEQUENTIAL_COLORS.map(
      (item: { threshold: number; color: string }, index: number) => {
        const nextValue = WIND_SEQUENTIAL_COLORS[index + 1]?.threshold;
        return {
          value: item.threshold,
          label: nextValue ? `${item.threshold}-${nextValue} km/h` : `> ${item.threshold} km/h`,
          rangeLabel: nextValue
            ? `${item.threshold}-${nextValue} km/h`
            : `> ${item.threshold} km/h`,
          color: item.color,
        };
      }
    ),
    buildings: [
      {
        value: 10000,
        color: BUILDING_DAMAGE_COLORS.minimal,
        label: '< $10K',
        rangeLabel: '< $10K',
      },
      {
        value: 50000,
        color: BUILDING_DAMAGE_COLORS.moderate,
        label: '$10K - $50K',
        rangeLabel: '$10K - $50K',
      },
      {
        value: 100000,
        color: BUILDING_DAMAGE_COLORS.substantial,
        label: '$50K - $100K',
        rangeLabel: '$50K - $100K',
      },
      {
        value: 500000,
        color: BUILDING_DAMAGE_COLORS.severe,
        label: '$100K - $500K',
        rangeLabel: '$100K - $500K',
      },
      {
        value: Infinity,
        color: BUILDING_DAMAGE_COLORS.catastrophic,
        label: '> $500K',
        rangeLabel: '> $500K',
      },
    ],
    roads: [
      { value: 1000, color: ROAD_DAMAGE_COLORS.light, label: '< $1K', rangeLabel: '< $1K' },
      {
        value: 2000,
        color: ROAD_DAMAGE_COLORS.moderate,
        label: '$1K - $2K',
        rangeLabel: '$1K - $2K',
      },
      {
        value: 3000,
        color: ROAD_DAMAGE_COLORS.heavy,
        label: '$2K - $3K',
        rangeLabel: '$2K - $3K',
      },
      { value: Infinity, color: ROAD_DAMAGE_COLORS.severe, label: '> $3K', rangeLabel: '> $3K' },
    ],
  };
};

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
  eventId?: string;
  name: string;
  countryCode: CountryCode;
  ncFile: string;
  layerName: string;
  description: string;
  hazardType: 'wind' | 'flood' | 'inundation' | 'cyclone' | 'fluvial-depth';
  bbox: [number, number, number, number];
  maxNativeZoom?: number;
  styleConfig?: WMSStyleConfig;
  datasetPath?: string;
  source?: 'static' | 'partner_api';
  /** Raster XYZ tile URL template (e.g. Zarr-backed hazard tiles), containing
   * literal {z}/{x}/{y} placeholders. When set, this layer is rendered as a
   * plain raster tile source instead of going through the WMS URL builders. */
  tileUrlTemplate?: string;
}

const DEFAULT_STYLE = 'default-scalar/default';
const DEFAULT_WMS_VERSION: NonNullable<WMSStyleConfig['wmsVersion']> = '1.3.0';
const DEFAULT_CRS: NonNullable<WMSStyleConfig['crs']> = 'EPSG:3857';
const NEXT_PUBLIC_BASE_PATH = getConfiguredBasePath(
  process.env.NODE_ENV === 'production' ? '/partner2' : ''
);

const COUNTRY_DATASET_BASE_PATH: Record<CountryCode, string> = {
  VU: '/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola',
  WS: '/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita',
  TO: '/POP/Partner2/case_study2/Harold_TO',
  CK: '/POP/Partner2/case_study2/hazard/ck_hazard/TC/Meena',
};

function buildDatasetPath(layer: RealWMSLayer): string {
  if (layer.datasetPath) {
    return layer.datasetPath;
  }
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

export const REAL_WMS_LAYERS: RealWMSLayer[] = [
  {
    id: 'vu-tc-lola-wind',
    eventId: 'tc-lola-2024',
    name: 'TC Lola Wind Hazard',
    countryCode: 'VU',
    ncFile: 'local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Lola (local_wind.nc)',
    hazardType: 'wind',
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
    eventId: 'tc-lola-2024',
    name: 'TC Lola Flood Hazard',
    countryCode: 'VU',
    ncFile: '_merged.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Lola (_merged.nc)',
    hazardType: 'flood',
    bbox: [166.54033818684763, -20.264667548114673, 170.24232553831496, -13.059866369838865],
    maxNativeZoom: 15,
    styleConfig: {
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
    eventId: 'tc-lola-2024',
    name: 'TC Lola Flood Depth (South Santo)',
    countryCode: 'VU',
    ncFile: 'Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.nc',
    layerName: 'Depth',
    description: 'Flood depth from TC Lola - Pluvial and Fluvial flooding (South Santo)',
    hazardType: 'fluvial-depth',
    bbox: [166.5, -16.0, 167.5, -15.0],
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
    id: 'ws-tc-gita-wind',
    eventId: 'tc-gita-samoa-2018',
    name: 'TC Gita Wind Hazard',
    countryCode: 'WS',
    ncFile: 'SA_savaii_upolu_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Gita',
    hazardType: 'wind',
    bbox: [-172.80922022199999, -14.079136103075408, -171.3973987012869, -13.434475695],
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
    eventId: 'tc-gita-samoa-2018',
    name: 'TC Gita Flood Hazard',
    countryCode: 'WS',
    ncFile: 'WS_merged.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Gita (WS_merged.nc)',
    hazardType: 'flood',
    bbox: [-172.80922022199999, -14.079136103075408, -171.3973987012869, -13.434475695],
    maxNativeZoom: 15,
    styleConfig: {
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
  {
    id: 'to-tc-harold-wind',
    eventId: 'tc-harold-tonga-2020',
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
    eventId: 'tc-harold-tonga-2020',
    name: 'TC Harold Flood Hazard',
    countryCode: 'TO',
    ncFile: 'best.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Harold (best.nc)',
    hazardType: 'flood',
    bbox: [-176.5, -23.5, -173.0, -15.0],
    maxNativeZoom: 12,
    styleConfig: {
      wmsVersion: '1.1.1',
      crs: 'EPSG:3857',
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
  {
    id: 'ck-tc-meena-wind-subdomain-1',
    eventId: 'tc-ck-event',
    name: 'TC Meena Wind Hazard (Subdomain 1)',
    countryCode: 'CK',
    ncFile: '_CK_subdomain_1_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Meena (_CK_subdomain_1_local_wind.nc)',
    hazardType: 'wind',
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
    eventId: 'tc-ck-event',
    name: 'TC Meena Wind Hazard (Subdomain 2)',
    countryCode: 'CK',
    ncFile: '_CK_subdomain_2_local_wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard from TC Meena (_CK_subdomain_2_local_wind.nc)',
    hazardType: 'wind',
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
    eventId: 'tc-ck-event',
    name: 'TC Meena Flood Hazard',
    countryCode: 'CK',
    ncFile: 'CK_merged.nc',
    layerName: 'Depth',
    description: 'Flood/inundation hazard from TC Meena (CK_merged.nc)',
    hazardType: 'flood',
    bbox: [-163.19974846337783, -21.95943031456599, -157.32122955564233, -17.986887908850672],
    maxNativeZoom: 15,
    styleConfig: {
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

function withBasePath(path: string): string {
  return prependBasePath(path, NEXT_PUBLIC_BASE_PATH);
}

function wmsBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_THREDDS_WMS_URL;
  if (configuredUrl) {
    return configuredUrl.startsWith('/') ? withBasePath(configuredUrl) : configuredUrl;
  }

  return withBasePath('/api/partner-proxy/thredds/wms');
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

  return `${baseUrl}${datasetPath}?${params.toString()}&BBOX={bbox-epsg-3857}`;
}

export function buildWMSImageUrl(
  layer: RealWMSLayer,
  bbox: [number, number, number, number],
  width: number = 256,
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

export function getLayersForCountry(
  countryCode: CountryCode,
  dynamicLayers: RealWMSLayer[] = [],
  selectedEventIds: string[] = []
): RealWMSLayer[] {
  const partnerLayers = dynamicLayers.filter(layer => layer.countryCode === countryCode);
  const filterByEventIds = (layers: RealWMSLayer[]) => {
    if (selectedEventIds.length === 0) {
      return layers;
    }

    const hasEventScopedLayers = layers.some(layer => typeof layer.eventId === 'string');
    if (!hasEventScopedLayers) {
      return layers;
    }

    return layers.filter(layer => !layer.eventId || selectedEventIds.includes(layer.eventId));
  };

  if (partnerLayers.length > 0) {
    return filterByEventIds(partnerLayers);
  }

  return filterByEventIds(REAL_WMS_LAYERS.filter(layer => layer.countryCode === countryCode));
}

export const WMS_STYLES = {
  DEFAULT: 'default-scalar/default',
  DIV_BURD: 'default-scalar/div-BuRd',
  PSU_VIRIDIS: 'default-scalar/psu-viridis',
  RAINBOW: 'default-scalar/rainbow',
  SEQ_YLORD: 'default-scalar/seq-YlOrRd',
  YLORD: 'YlOrRd',
  ANUJ: 'anuj',
  ANUJ6: 'anuj6',
  ANUJ11: 'anuj11',
  ANUJ12: 'anuj12',
  CONTOURS: 'colored_contours/default',
  CONVERGE: 'converge',
} as const;
