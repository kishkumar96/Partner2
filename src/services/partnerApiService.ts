import type { CountryCode } from '@/types/thredds';

export type PartnerApiResource =
  | 'country'
  | 'cyclone_track'
  | 'risk_information'
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

const DEFAULT_PARTNER_API_BASE = 'http://opmthredds.gem.spc.int';
const NEXT_PUBLIC_BASE_PATH =
  process.env.NODE_ENV === 'production'
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '/partner2')
    : (process.env.NEXT_PUBLIC_BASE_PATH ?? '');

export function isPartnerApiEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_ENABLE_PARTNER_API === 'true';
  }

  return (
    process.env.PARTNER_API_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_PARTNER_API === 'true'
  );
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
  if (!NEXT_PUBLIC_BASE_PATH) return path;
  return `${NEXT_PUBLIC_BASE_PATH}${path}`;
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
  baseUrl: string = DEFAULT_PARTNER_API_BASE
): Record<Exclude<PartnerApiResource, 'country'>, string> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);

  return {
    cyclone_track: `${endpoints.resource.cyclone_track}?country=${countryId}`,
    risk_information: `${endpoints.resource.risk_information}?country=${countryId}`,
    hazard_information: `${endpoints.resource.hazard_information}?country=${countryId}`,
    citizen_science: `${endpoints.resource.citizen_science}?country=${countryId}`,
    event: `${endpoints.resource.event}?country=${countryId}`,
  };
}

export async function fetchPartnerCountries(
  baseUrl?: string
): Promise<Array<Record<string, unknown>>> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);
  const response = await fetch(endpoints.resource.country);
  if (!response.ok) {
    throw new Error(`Failed to fetch partner countries: ${response.status}`);
  }
  const data = await response.json();

  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (Array.isArray((data as { results?: unknown[] }).results)) {
    return (data as { results: Array<Record<string, unknown>> }).results;
  }

  return [];
}

export async function mapCountryPartnerApis(
  countryCode: Extract<CountryCode, 'WS' | 'TO'>,
  baseUrl?: string
): Promise<{
  countryCode: 'WS' | 'TO';
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
