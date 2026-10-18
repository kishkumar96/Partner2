/**
 * Typed access to the deployment's configuration (config/, via the generated
 * registry). The one place the app learns which countries exist: nothing else
 * in the code should spell out country codes or slugs.
 *
 * Plain data and pure functions, so it is safe in the Edge runtime (proxy.ts),
 * server components and the browser alike.
 */
import {
  CONFIG_RELEASE,
  COUNTRY_DEFINITIONS,
  DEFAULT_COUNTRY_CODE,
  EVENT_DEFINITIONS,
  LAYER_DEFINITIONS,
} from '@/generated/config-registry';

export type CountryDefinition = (typeof COUNTRY_DEFINITIONS)[number];
/** The configured country codes, e.g. 'VU' | 'WS' | 'TO' | 'CK', generated from config/. */
export type CountryCode = CountryDefinition['code'];

export interface CountryPresentation {
  code: CountryCode;
  name: string;
  fullName: string;
  center: [number, number];
  zoom: number;
  /** "Tropical Cyclone Rapid Impact Assessment Tool", prefixed with the country */
  appName: string;
  terminology: CountryDefinition['terminology'];
}

export interface ConfigRelease {
  configVersion: string;
  schemaVersion: number;
  contentSha256: string;
}

const APP_NAME_SUFFIX = 'Tropical Cyclone Rapid Impact Assessment Tool';

/** Every configured country, in the order the release lists them. */
export function listCountries(): readonly CountryDefinition[] {
  return COUNTRY_DEFINITIONS;
}

export function listCountryCodes(): CountryCode[] {
  return COUNTRY_DEFINITIONS.map(country => country.code);
}

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRY_DEFINITIONS.some(country => country.code === value);
}

/** Looks a country up by code, ignoring case and surrounding spaces. */
export function getCountryByCode(code: string | null | undefined): CountryDefinition | null {
  const wanted = (code ?? '').trim().toUpperCase();
  if (!wanted) return null;
  return COUNTRY_DEFINITIONS.find(country => country.code === wanted) ?? null;
}

/** Looks a country up by URL slug, ignoring case and surrounding spaces. */
export function getCountryBySlug(slug: string | null | undefined): CountryDefinition | null {
  const wanted = (slug ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return COUNTRY_DEFINITIONS.find(country => country.slug === wanted) ?? null;
}

/** The country shown when a request names none. */
export function getDefaultCountry(): CountryDefinition {
  return getCountryByCode(DEFAULT_COUNTRY_CODE) ?? COUNTRY_DEFINITIONS[0];
}

export function getCountryPresentation(code: CountryCode): CountryPresentation {
  const country = getCountryByCode(code);
  if (!country) throw new Error(`Unknown country code: ${code}`);
  return {
    code: country.code,
    name: country.name,
    fullName: country.fullName,
    center: [country.viewport.center[0], country.viewport.center[1]],
    zoom: country.viewport.zoom,
    appName: `${country.name} ${APP_NAME_SUFFIX}`,
    terminology: country.terminology,
  };
}

/** Version and content hash of the configuration this build was made from. */
export function getConfigRelease(): ConfigRelease {
  return { ...CONFIG_RELEASE };
}

/** What /api/config reports: the release and the configured country codes, nothing else. */
export function getConfigDiagnostic(): ConfigRelease & { countries: CountryCode[] } {
  return { ...getConfigRelease(), countries: listCountryCodes() };
}

type BBox = [number, number, number, number];

/** An approved fallback event: shown when the Partner API has no event of its own. */
export interface StaticEventDefinition {
  id: string;
  name: string;
  date: string;
  hazardId: string;
  location: { lat: number; lng: number };
  bbox: BBox;
  trackFile?: string;
  forecastFile?: string;
  isDefault: boolean;
  aliases: string[];
}

export interface StaticLayerStyle {
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

/** A static hazard map layer (a THREDDS dataset). */
export interface StaticLayerDefinition {
  id: string;
  eventId?: string;
  name: string;
  ncFile: string;
  layerName: string;
  description: string;
  hazardType: 'wind' | 'flood' | 'inundation' | 'cyclone' | 'fluvial-depth';
  bbox: BBox;
  maxNativeZoom?: number;
  styleConfig?: StaticLayerStyle;
  datasetPath?: string;
}

export interface StaticLayerCatalog {
  /** Where the country's static hazard datasets live on the THREDDS server */
  datasetBasePath: string;
  layers: StaticLayerDefinition[];
}

// The generated tables are readonly literals keyed only by countries that have entries
const eventTable = EVENT_DEFINITIONS as unknown as Record<
  string,
  ReadonlyArray<StaticEventDefinition & { enabled?: boolean }>
>;
const layerTable = LAYER_DEFINITIONS as unknown as Record<
  string,
  { datasetBasePath: string; layers: ReadonlyArray<StaticLayerDefinition & { enabled?: boolean }> }
>;

/** Strip `enabled` and deep-copy (the data is plain JSON), so callers cannot alter the registry. */
const withoutEnabled = <T extends { enabled?: boolean }>({
  enabled: _enabled,
  ...rest
}: T): Omit<T, 'enabled'> => JSON.parse(JSON.stringify(rest));

/** A country's approved fallback events, disabled ones left out; [] when it has none. */
export function getStaticEvents(code: string): StaticEventDefinition[] {
  const country = getCountryByCode(code);
  if (!country) return [];
  return (eventTable[country.code] ?? [])
    .filter(event => event.enabled !== false)
    .map(withoutEnabled);
}

/** A country's static map layers, disabled ones left out; null when it has none. */
export function getStaticLayerCatalog(code: string): StaticLayerCatalog | null {
  const country = getCountryByCode(code);
  const entry = country ? layerTable[country.code] : undefined;
  if (!entry) return null;
  const layers = entry.layers.filter(layer => layer.enabled !== false).map(withoutEnabled);
  return layers.length > 0 ? { datasetBasePath: entry.datasetBasePath, layers } : null;
}
