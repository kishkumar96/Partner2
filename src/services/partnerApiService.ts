import type { CountryCode } from '@/types/thredds';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';

export type PartnerApiResource =
  | 'country'
  | 'cyclone_track'
  | 'risk_information'
  | 'risk_scenario'
  | 'hazard_information'
  | 'citizen_science'
  | 'event';

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
const DEFAULT_PARTNER_API_COUNTRIES: CountryCode[] = ['VU', 'WS', 'TO', 'CK'];
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
  const normalized = value.trim().toUpperCase();
  if (normalized === 'VU' || normalized === 'WS' || normalized === 'TO' || normalized === 'CK') {
    return normalized;
  }
  return null;
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

// Human-readable country aliases used to resolve Samoa/Tonga country records.
const COUNTRY_IDENTITIES: Record<CountryCode, PartnerCountryIdentity> = {
  VU: { code: 'VU', names: ['vanuatu', 'republic of vanuatu'] },
  WS: { code: 'WS', names: ['samoa', 'independent state of samoa'] },
  TO: { code: 'TO', names: ['tonga', 'kingdom of tonga'] },
  CK: { code: 'CK', names: ['cook islands'] },
};

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

/**
 * Resolve a country ID from /country/ endpoint payload.
 * The server schema can vary, so this accepts common id key names.
 */
export function resolveCountryId(
  countries: Array<Record<string, unknown>>,
  countryCode: CountryCode
): number | null {
  const match = countries.find(country => isMatchingCountryRecord(country, countryCode));
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
): Record<Exclude<PartnerApiResource, 'country'>, string> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);

  return {
    cyclone_track: `${endpoints.resource.cyclone_track}?country=${countryId}`,
    risk_information: `${endpoints.resource.risk_information}?country=${countryId}`,
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
  scopedUrls: Record<Exclude<PartnerApiResource, 'country'>, string> | null;
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
