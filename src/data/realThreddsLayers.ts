import { BUILDING_DAMAGE_COLORS, ROAD_DAMAGE_COLORS } from '@/theme/colors';
import { getLossSequentialColors, WIND_SEQUENTIAL_COLORS } from '@/utils/colorSystem';
import { CountryCode } from '@/types/thredds';
import { getStaticLayerCatalog, listCountryCodes } from '@/config/registry';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';

// Get basePath from env — empty in dev, '/partner2' in production
const BASE_PATH =
  process.env.NODE_ENV === 'production'
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '/partner2')
    : (process.env.NEXT_PUBLIC_BASE_PATH ?? '');

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
  /** Scenario dimensions for multi-scenario hazard catalogs (currently only
   * Cook Islands' Zarr-backed xyz layers). One catalog can contain thousands
   * of (product x SLR x return-period/event) combinations, so a UI selector
   * narrows these down to a single layer to render rather than rendering
   * every combination as its own map source at once. */
  hazardScenario?: {
    /** hazard_tiles product key, e.g. 'combined' | 'tc' | 'swell' |
     * 'historical_tcs' | 'synthetic_tcs' | 'swell_driven'. */
    product: string;
    slrScenarioM: number;
    returnPeriodYears: number | null;
    eventLabel: string | null;
  };
}

const DEFAULT_STYLE = 'default-scalar/default';
const DEFAULT_WMS_VERSION: NonNullable<WMSStyleConfig['wmsVersion']> = '1.3.0';
const DEFAULT_CRS: NonNullable<WMSStyleConfig['crs']> = 'EPSG:3857';
const NEXT_PUBLIC_BASE_PATH = getConfiguredBasePath(
  process.env.NODE_ENV === 'production' ? '/partner2' : ''
);

// Each country's dataset base path, and its static layers, live in config/layers/<country>.json.

function buildDatasetPath(layer: RealWMSLayer): string {
  if (layer.datasetPath) {
    return layer.datasetPath;
  }
  const basePath = getStaticLayerCatalog(layer.countryCode)?.datasetBasePath;
  if (!basePath) {
    throw new Error(
      `Layer ${layer.id} has no dataset path: ${layer.countryCode} has no datasetBasePath in config/layers`
    );
  }
  return `${basePath}/${layer.ncFile}`;
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

export const REAL_WMS_LAYERS: RealWMSLayer[] = listCountryCodes().flatMap(countryCode =>
  (getStaticLayerCatalog(countryCode)?.layers ?? []).map(layer => ({ ...layer, countryCode }))
);

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

export type HazardScenarioSelection = NonNullable<RealWMSLayer['hazardScenario']>;

function hazardScenarioMatches(a: HazardScenarioSelection, b: HazardScenarioSelection): boolean {
  return (
    a.product === b.product &&
    a.slrScenarioM === b.slrScenarioM &&
    a.returnPeriodYears === b.returnPeriodYears &&
    a.eventLabel === b.eventLabel
  );
}

// A multi-scenario catalog (currently only Cook Islands) can contain
// thousands of (product x SLR x return-period/event) layers. Rendering all
// of them at once means adding thousands of map sources simultaneously, so
// this narrows a layer set down to the layers matching a single scenario
// selection -falling back to a deterministic default when none is chosen
// yet, rather than rendering everything.
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Historical event labels look like "02-Jan-1995"; returns a sortable time, or null. */
function parseEventDate(label: string): number | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(label.trim());
  const month = match ? MONTHS[match[2].toLowerCase()] : undefined;
  if (!match || month === undefined) return null;
  return Date.UTC(Number(match[3]), month, Number(match[1]));
}

/**
 * Orders a scenario's return period / event: return periods ascending first,
 * then events -- dated labels chronologically, others (synthetic event ids
 * like "361") in natural order, so "2" comes before "10".
 */
export function compareHazardScenarioPeriods(
  a: Pick<HazardScenarioSelection, 'returnPeriodYears' | 'eventLabel'>,
  b: Pick<HazardScenarioSelection, 'returnPeriodYears' | 'eventLabel'>
): number {
  if (a.returnPeriodYears !== null && b.returnPeriodYears !== null) {
    return a.returnPeriodYears - b.returnPeriodYears;
  }
  if (a.returnPeriodYears !== null) return -1;
  if (b.returnPeriodYears !== null) return 1;
  const labelA = a.eventLabel ?? '';
  const labelB = b.eventLabel ?? '';
  const dateA = parseEventDate(labelA);
  const dateB = parseEventDate(labelB);
  if (dateA !== null && dateB !== null && dateA !== dateB) return dateA - dateB;
  return labelA.localeCompare(labelB, undefined, { numeric: true });
}

/**
 * Whether the loss-curve selector can be drawn: a curve is loaded and the
 * current selection is a return-period scenario of the product being shown.
 * With no selection (e.g. after switching from Scenarios to Forecast) there is
 * nothing to draw, even when no product is selected either, where
 * `selection?.product === selectedProduct` is `undefined === undefined`.
 */
export function canShowLossCurve(
  curve: unknown,
  selection: HazardScenarioSelection | null | undefined,
  selectedProduct: string | undefined
): boolean {
  return (
    !!curve &&
    !!selection &&
    selection.product === selectedProduct &&
    selection.returnPeriodYears !== null &&
    selection.returnPeriodYears !== undefined
  );
}

/**
 * Whether a chosen scenario should be swapped for a default because the offered
 * layers no longer include its product. With no layers at all the catalogue is
 * still loading (or absent), which says nothing about the choice: acting on it
 * threw away a scenario restored from a reload or shared link before its layers
 * had arrived.
 */
export function shouldResetHazardScenario(
  offeredLayers: RealWMSLayer[],
  selection: HazardScenarioSelection | null | undefined
): boolean {
  if (!selection || offeredLayers.length === 0) return false;
  return !offeredLayers.some(layer => layer.hazardScenario?.product === selection.product);
}

export function getDefaultHazardScenario(layers: RealWMSLayer[]): HazardScenarioSelection | null {
  const scenarioLayers = layers.filter(
    (layer): layer is RealWMSLayer & { hazardScenario: HazardScenarioSelection } =>
      !!layer.hazardScenario
  );
  if (scenarioLayers.length === 0) {
    return null;
  }

  const sorted = [...scenarioLayers].sort((layerA, layerB) => {
    const a = layerA.hazardScenario;
    const b = layerB.hazardScenario;
    if (a.product !== b.product) {
      if (a.product === 'combined') return -1;
      if (b.product === 'combined') return 1;
      return a.product.localeCompare(b.product);
    }
    if (a.slrScenarioM !== b.slrScenarioM) return a.slrScenarioM - b.slrScenarioM;
    return compareHazardScenarioPeriods(a, b);
  });

  return sorted[0].hazardScenario;
}

function narrowByHazardScenario(
  layers: RealWMSLayer[],
  selection?: HazardScenarioSelection | null
): RealWMSLayer[] {
  const scenarioLayers = layers.filter(layer => layer.hazardScenario);
  if (scenarioLayers.length === 0) {
    return layers;
  }

  const nonScenarioLayers = layers.filter(layer => !layer.hazardScenario);
  const effectiveSelection = selection ?? getDefaultHazardScenario(scenarioLayers);
  if (!effectiveSelection) {
    return nonScenarioLayers;
  }

  const matched = scenarioLayers.filter(layer =>
    hazardScenarioMatches(layer.hazardScenario as HazardScenarioSelection, effectiveSelection)
  );
  return [...nonScenarioLayers, ...matched];
}

/**
 * Which hazard layers a view draws: 'event' = the event's own layers (never
 * planning-scenario layers), 'planning' = only the selected scenario's
 * layers (never the static event fallback), 'all' = both (legacy).
 */
export type HazardLayerMode = 'event' | 'planning' | 'all';

export function getLayersForCountry(
  countryCode: CountryCode,
  dynamicLayers: RealWMSLayer[] = [],
  selectedEventIds: string[] = [],
  hazardScenarioSelection?: HazardScenarioSelection | null,
  layerMode: HazardLayerMode = 'all'
): RealWMSLayer[] {
  const countryPartnerLayers = dynamicLayers.filter(layer => layer.countryCode === countryCode);
  if (layerMode === 'planning') {
    return narrowByHazardScenario(
      countryPartnerLayers.filter(layer => layer.hazardScenario),
      hazardScenarioSelection
    );
  }
  const partnerLayers =
    layerMode === 'event'
      ? countryPartnerLayers.filter(layer => !layer.hazardScenario)
      : countryPartnerLayers;
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
    return filterByEventIds(narrowByHazardScenario(partnerLayers, hazardScenarioSelection));
  }

  return filterByEventIds(REAL_WMS_LAYERS.filter(layer => layer.countryCode === countryCode));
}

export const HAZARD_SCENARIO_PRODUCT_LABELS: Record<string, string> = {
  combined: 'Combined (TC + Swell)',
  tc: 'Tropical Cyclone (probabilistic)',
  swell: 'Swell (probabilistic)',
  historical_tcs: 'Historical Cyclones',
  synthetic_tcs: 'Synthetic Cyclones',
  swell_driven: 'Historical Swell Events',
  coastal_flood: 'Coastal Flood (Sea Level Rise)',
  fluvial_flood: 'Fluvial / Pluvial Flood (Rainfall & River)',
  rapid_impact_assessment: 'Rapid Impact Assessment Cyclones',
};

/** A scenario as short labels: product, SLR, then return period or event. */
export function describeHazardScenario(scenario: HazardScenarioSelection): string[] {
  const parts = [
    HAZARD_SCENARIO_PRODUCT_LABELS[scenario.product] ?? scenario.product,
    `SLR ${scenario.slrScenarioM} m`,
  ];
  if (scenario.returnPeriodYears !== null) {
    parts.push(`${scenario.returnPeriodYears}-yr return period`);
  } else if (scenario.eventLabel) {
    parts.push(`event: ${scenario.eventLabel}`);
  }
  return parts;
}

// Two fundamentally different kinds of thing a "hazard scenario" can be,
// which the UI must not blur together (a disaster manager reasons about a
// real storm that happened very differently from a statistical planning
// figure): whether a product is real, dated history, or a synthetic/
// statistical construct used to estimate risk. Not derivable from the
// event/return_period selector dimension alone -- synthetic_tcs shares the
// "event" selector with historical_tcs/swell_driven despite being
// statistically generated, never observed, storms (see
// hazard_tiles/views.py's PRODUCTS mapping in the middleware repo).
export type HazardScenarioCategory = 'observed' | 'planning';

export const HAZARD_SCENARIO_PRODUCT_CATEGORY: Record<string, HazardScenarioCategory> = {
  historical_tcs: 'observed',
  swell_driven: 'observed',
  // A rapid_impact_assessment row is a RiskScape run against one specific,
  // real cyclone forecast (see model.ModelRun) -- an actual event being
  // assessed, not a statistical planning figure -- even though no country's
  // catalog uses this product yet.
  rapid_impact_assessment: 'observed',
  combined: 'planning',
  tc: 'planning',
  swell: 'planning',
  synthetic_tcs: 'planning',
  coastal_flood: 'planning',
  fluvial_flood: 'planning',
};

export const HAZARD_SCENARIO_CATEGORY_LABELS: Record<HazardScenarioCategory, string> = {
  observed: 'Historical events',
  planning: 'Probabilistic scenarios',
};

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
