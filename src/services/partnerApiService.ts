import type { CountryCode } from '@/types/thredds';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';
import { getCountryByCode, listCountries, listCountryCodes } from '@/config/registry';

export type PartnerApiResource =
  | 'country'
  | 'cyclone_track'
  | 'risk_information'
  | 'risk_scenario'
  | 'risk_scenario_breakdown'
  | 'hazard_information'
  | 'citizen_science'
  | 'event';

// Sector/asset-type rows hang off one RiskScenario (filtered by
// ?risk_scenario=), not off a country, so they have no country-scoped URL.
type CountryScopedPartnerApiResource = Exclude<
  PartnerApiResource,
  'country' | 'risk_scenario_breakdown'
>;

export interface PartnerApiEndpoints {
  base: string;
  admin: string;
  tokenAuth: string;
  resource: Record<PartnerApiResource, string>;
}

export interface PartnerCountryIdentity {
  code: CountryCode;
  names: string[];
}

const DEFAULT_PARTNER_API_BASE = 'http://localhost:8000';
const NEXT_PUBLIC_BASE_PATH = getConfiguredBasePath(
  process.env.NODE_ENV === 'production' ? '/partner2' : ''
);
const DEFAULT_PARTNER_API_COUNTRIES: CountryCode[] = listCountryCodes();
let cachedPartnerCountries: Array<Record<string, unknown>> | null = null;
let cachedPartnerCountriesPromise: Promise<Array<Record<string, unknown>>> | null = null;

export function isPartnerApiEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_ENABLE_PARTNER_API === 'true';
  }

  return (
    process.env.PARTNER_API_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_PARTNER_API === 'true'
  );
}

function normalizeCountryCode(value: string): CountryCode | null {
  return getCountryByCode(value)?.code ?? null;
}

function getPartnerApiEnabledCountries(): CountryCode[] {
  const configured =
    process.env.NEXT_PUBLIC_PARTNER_API_COUNTRIES ?? process.env.PARTNER_API_COUNTRIES ?? '';
  const parsed = configured
    .split(',')
    .map(normalizeCountryCode)
    .filter((value): value is CountryCode => value !== null);

  return parsed.length > 0 ? parsed : DEFAULT_PARTNER_API_COUNTRIES;
}

export function isPartnerApiCountryEnabled(countryCode: CountryCode): boolean {
  return getPartnerApiEnabledCountries().includes(countryCode);
}

function getPartnerApiStrictCountries(): CountryCode[] {
  const configured =
    process.env.NEXT_PUBLIC_PARTNER_API_STRICT_COUNTRIES ??
    process.env.PARTNER_API_STRICT_COUNTRIES ??
    '';
  return configured
    .split(',')
    .map(normalizeCountryCode)
    .filter((value): value is CountryCode => value !== null);
}

export function isPartnerApiCountryStrict(countryCode: CountryCode): boolean {
  return getPartnerApiStrictCountries().includes(countryCode);
}

// Human-readable country aliases used to resolve each country's Partner API record (config/countries).
const COUNTRY_IDENTITIES = Object.fromEntries(
  listCountries().map(country => [
    country.code,
    { code: country.code, names: [...country.partnerApi.aliases] },
  ])
) as Record<CountryCode, PartnerCountryIdentity>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function withBasePath(path: string): string {
  return prependBasePath(path, NEXT_PUBLIC_BASE_PATH);
}

function getDefaultPartnerApiBase(): string {
  // Browser-side requests must stay same-origin and go through the proxy route.
  if (typeof window !== 'undefined') {
    return withBasePath('/api/partner-proxy');
  }

  return process.env.PARTNER_API_BASE_URL ?? DEFAULT_PARTNER_API_BASE;
}

export function buildPartnerApiEndpoints(
  baseUrl: string = getDefaultPartnerApiBase()
): PartnerApiEndpoints {
  const base = `${trimTrailingSlash(baseUrl)}/partner_api`;
  const v1 = `${base}/v1`;

  return {
    base,
    admin: `${base}/admin/`,
    tokenAuth: `${base}/api-token-auth/`,
    resource: {
      country: `${v1}/country/`,
      cyclone_track: `${v1}/cyclone_track/`,
      risk_information: `${v1}/risk_information/`,
      risk_scenario: `${v1}/risk_scenario/`,
      risk_scenario_breakdown: `${v1}/risk_scenario_breakdown/`,
      hazard_information: `${v1}/hazard_information/`,
      citizen_science: `${v1}/citizen_science/`,
      event: `${v1}/event/`,
    },
  };
}

function getStringValues(record: Record<string, unknown>): string[] {
  return Object.values(record)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim().toLowerCase());
}

function isMatchingCountryRecord(record: Record<string, unknown>, code: CountryCode): boolean {
  const values = getStringValues(record);
  const aliases = COUNTRY_IDENTITIES[code]?.names ?? [];

  // Match either country code-like values or known aliases for each country.
  return values.some(
    value => value === code.toLowerCase() || aliases.some(alias => value.includes(alias))
  );
}

/** A record's canonical `code` ("CK"), upper-cased, or null when the API does not give one. */
function recordCode(record: Record<string, unknown>): string | null {
  const code = record.code;
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
}

/**
 * Find a country's record in the /country/ payload.
 *
 * The record's canonical `code` is authoritative: ids and names differ between deployments (Cook Islands
 * is id 3 on the live API and 1 locally; Tonga's short name is "Ton"), so the code is the only thing that
 * means the same everywhere. A record that carries a different code is never matched by name, so
 * "American Samoa" (AS) cannot be mistaken for Samoa (WS). Only records with no code, from an API that has
 * not been migrated yet, fall back to matching names.
 */
export function findCountryRecord(
  countries: Array<Record<string, unknown>>,
  countryCode: CountryCode
): Record<string, unknown> | null {
  const byCode = countries.find(country => recordCode(country) === countryCode);
  if (byCode) return byCode;
  return (
    countries.find(
      country => recordCode(country) === null && isMatchingCountryRecord(country, countryCode)
    ) ?? null
  );
}

/**
 * Resolve a country ID from /country/ endpoint payload.
 * The server schema can vary, so this accepts common id key names.
 */
export function resolveCountryId(
  countries: Array<Record<string, unknown>>,
  countryCode: CountryCode
): number | null {
  const match = findCountryRecord(countries, countryCode);
  if (!match) return null;

  const rawId = match.id ?? match.pk ?? match.country_id ?? match.countryId;

  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return rawId;
  }

  if (typeof rawId === 'string') {
    const parsed = Number(rawId);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Build URLs for country-scoped resource lookups.
 * Note: /partner_api/v1/ itself is not a valid endpoint and returns 404.
 */
export function buildCountryScopedResourceUrls(
  countryId: number,
  baseUrl: string = getDefaultPartnerApiBase()
): Record<CountryScopedPartnerApiResource, string> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);

  return {
    cyclone_track: `${endpoints.resource.cyclone_track}?country=${countryId}`,
    // defer_large_assets skips the damaged-buildings/damaged-roads geometry
    // in this listing (tens of MB per country, only needed once that map
    // overlay is switched on) -- see loadPartnerApiCountryData, which
    // re-fetches a row's full geometry individually by id on demand.
    risk_information: `${endpoints.resource.risk_information}?country=${countryId}&defer_large_assets=true`,
    // RiskScenario has no direct `country` field of its own (it's reached
    // through its RiskInformation parent), so this filters on the FK path
    // instead of the `?country=` convention every other resource here uses.
    risk_scenario: `${endpoints.resource.risk_scenario}?risk_information__country=${countryId}`,
    hazard_information: `${endpoints.resource.hazard_information}?country=${countryId}`,
    citizen_science: `${endpoints.resource.citizen_science}?country=${countryId}`,
    event: `${endpoints.resource.event}?country=${countryId}`,
  };
}

export async function fetchPartnerCountries(
  baseUrl?: string
): Promise<Array<Record<string, unknown>>> {
  if (cachedPartnerCountries) {
    return cachedPartnerCountries;
  }

  if (cachedPartnerCountriesPromise) {
    return cachedPartnerCountriesPromise;
  }

  const endpoints = buildPartnerApiEndpoints(baseUrl);
  cachedPartnerCountriesPromise = (async () => {
    const response = await fetch(endpoints.resource.country);
    if (!response.ok) {
      throw new Error(`Failed to fetch partner countries: ${response.status}`);
    }
    const data = await response.json();

    if (Array.isArray(data)) {
      cachedPartnerCountries = data as Array<Record<string, unknown>>;
      return cachedPartnerCountries;
    }
    if (Array.isArray((data as { results?: unknown[] }).results)) {
      cachedPartnerCountries = (data as { results: Array<Record<string, unknown>> }).results;
      return cachedPartnerCountries;
    }

    cachedPartnerCountries = [];
    return cachedPartnerCountries;
  })();

  try {
    return await cachedPartnerCountriesPromise;
  } finally {
    cachedPartnerCountriesPromise = null;
  }
}

export async function mapCountryPartnerApis(
  countryCode: CountryCode,
  baseUrl?: string
): Promise<{
  countryCode: CountryCode;
  countryId: number | null;
  endpoints: PartnerApiEndpoints;
  scopedUrls: Record<CountryScopedPartnerApiResource, string> | null;
}> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);
  const countries = await fetchPartnerCountries(baseUrl);
  const countryId = resolveCountryId(countries, countryCode);

  return {
    countryCode,
    countryId,
    endpoints,
    scopedUrls: countryId !== null ? buildCountryScopedResourceUrls(countryId, baseUrl) : null,
  };
}
