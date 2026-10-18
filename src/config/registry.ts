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
