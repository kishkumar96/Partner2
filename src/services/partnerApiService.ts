import type { CountryCode } from '@/types/thredds';
import type {
  PartnerCountry,
  PartnerRiskForecast,
  PartnerCitizenScience,
  PartnerApiPaginatedResponse,
  PartnerApiHealthStatus,
  CountryApiAvailability,
} from '@/types/partnerApi';

export type PartnerApiResource =
  | 'country'
  | 'cyclone_track'
  | 'risk_information'
  | 'risk_forecast'
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

const DEFAULT_PARTNER_API_BASE = 'https://opmthredds.gem.spc.int';

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

export function buildPartnerApiEndpoints(
  baseUrl: string = DEFAULT_PARTNER_API_BASE
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
      risk_forecast: `${v1}/risk_forecast/`,
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
    risk_forecast: `${endpoints.resource.risk_forecast}?country=${countryId}`,
    hazard_information: `${endpoints.resource.hazard_information}?country=${countryId}`,
    citizen_science: `${endpoints.resource.citizen_science}?country=${countryId}`,
    event: `${endpoints.resource.event}?country=${countryId}`,
  };
}

export async function fetchPartnerCountries(
  baseUrl?: string
): Promise<Array<Record<string, unknown>>> {
  const endpoints = buildPartnerApiEndpoints(baseUrl);
  console.log(`[Partner API] Fetching countries from:`, endpoints.resource.country);
  
  const response = await fetch(endpoints.resource.country);
  console.log(`[Partner API] Countries response status:`, response.status);
  
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

/**
 * Map country code to Partner API endpoints.
 * Now supports all countries (VU, WS, TO, CK) - previously limited to WS and TO.
 */
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
  
  try {
    const countries = await fetchPartnerCountries(baseUrl);
    const countryId = resolveCountryId(countries, countryCode);

    return {
      countryCode,
      countryId,
      endpoints,
      scopedUrls: countryId !== null ? buildCountryScopedResourceUrls(countryId, baseUrl) : null,
    };
  } catch (error) {
    console.warn(`Failed to map Partner API for ${countryCode}:`, error);
    return {
      countryCode,
      countryId: null,
      endpoints,
      scopedUrls: null,
    };
  }
}

/**
 * Fetch risk forecast data for a country
 * @param countryCode - Country code (VU, WS, TO, CK)
 * @param options - Optional filters (cycloneId, forecastHorizon)
 * @returns Array of risk forecast records
 */
export async function fetchRiskForecasts(
  countryCode: CountryCode,
  options: {
    cycloneId?: string;
    forecastHorizon?: number; // hours
    signal?: AbortSignal;
    baseUrl?: string;
  } = {}
): Promise<PartnerRiskForecast[]> {
  const { cycloneId, forecastHorizon, signal, baseUrl } = options;
  
  try {
    const mapping = await mapCountryPartnerApis(countryCode, baseUrl);
    
    if (!mapping.scopedUrls) {
      console.warn(`No Partner API mapping available for ${countryCode}`);
      return [];
    }

    let url = mapping.scopedUrls.risk_forecast;
    
    // Add optional filters
    const params = new URLSearchParams();
    if (cycloneId) params.append('cyclone_id', cycloneId);
    if (forecastHorizon) params.append('forecast_horizon', forecastHorizon.toString());
    
    if (params.toString()) {
      url += `&${params.toString()}`;
    }

    const response = await fetch(url, { signal });
    
    if (!response.ok) {
      throw new Error(`Risk forecast API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Handle both array and paginated responses
    if (Array.isArray(data)) {
      return data as PartnerRiskForecast[];
    }
    
    if ((data as PartnerApiPaginatedResponse<PartnerRiskForecast>).results) {
      return (data as PartnerApiPaginatedResponse<PartnerRiskForecast>).results;
    }

    return [];
  } catch (error) {
    console.error(`Failed to fetch risk forecasts for ${countryCode}:`, error);
    return [];
  }
}

/**
 * Fetch citizen science observations for a country
 * @param countryCode - Country code (VU, WS, TO, CK)
 * @param options - Optional filters (verifiedOnly, observationType)
 * @returns Array of citizen science observations
 */
export async function fetchCitizenScience(
  countryCode: CountryCode,
  options: {
    verifiedOnly?: boolean;
    observationType?: string;
    eventId?: number;
    signal?: AbortSignal;
    baseUrl?: string;
  } = {}
): Promise<PartnerCitizenScience[]> {
  const { verifiedOnly, observationType, eventId, signal, baseUrl } = options;
  
  try {
    const mapping = await mapCountryPartnerApis(countryCode, baseUrl);
    
    if (!mapping.scopedUrls) {
      console.warn(`No Partner API mapping available for ${countryCode}`);
      return [];
    }

    let url = mapping.scopedUrls.citizen_science;
    
    // Add optional filters
    const params = new URLSearchParams();
    if (verifiedOnly) params.append('verified', 'true');
    if (observationType) params.append('observation_type', observationType);
    if (eventId) params.append('event', eventId.toString());
    
    if (params.toString()) {
      url += `&${params.toString()}`;
    }

    const response = await fetch(url, { signal });
    
    if (!response.ok) {
      throw new Error(`Citizen science API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Handle both array and paginated responses
    if (Array.isArray(data)) {
      return data as PartnerCitizenScience[];
    }
    
    if ((data as PartnerApiPaginatedResponse<PartnerCitizenScience>).results) {
      return (data as PartnerApiPaginatedResponse<PartnerCitizenScience>).results;
    }

    return [];
  } catch (error) {
    console.error(`Failed to fetch citizen science data for ${countryCode}:`, error);
    return [];
  }
}

/**
 * Check health status of a specific API endpoint
 * @param url - Endpoint URL to check
 * @returns Health status with response time
 */
async function checkEndpointHealth(url: string): Promise<PartnerApiHealthStatus> {
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(url, { 
      signal: controller.signal,
      method: 'HEAD', // Use HEAD for faster checks
    });
    
    clearTimeout(timeoutId);
    const responseTime = performance.now() - startTime;
    
    return {
      endpoint: url,
      available: response.ok,
      responseTime,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = performance.now() - startTime;
    return {
      endpoint: url,
      available: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check availability of Partner API endpoints for a specific country
 * @param countryCode - Country code to check
 * @param baseUrl - Optional base URL override
 * @returns Availability status for all endpoints
 */
export async function checkCountryApiAvailability(
  countryCode: CountryCode,
  baseUrl?: string
): Promise<CountryApiAvailability> {
  try {
    const mapping = await mapCountryPartnerApis(countryCode, baseUrl);
    
    if (!mapping.scopedUrls) {
      // Country not found in API
      const endpoints = buildPartnerApiEndpoints(baseUrl);
      return {
        countryCode,
        countryId: null,
        available: false,
        endpoints: {
          cyclone_track: await checkEndpointHealth(endpoints.resource.cyclone_track),
          event: await checkEndpointHealth(endpoints.resource.event),
          risk_information: await checkEndpointHealth(endpoints.resource.risk_information),
          risk_forecast: await checkEndpointHealth(endpoints.resource.risk_forecast),
          hazard_information: await checkEndpointHealth(endpoints.resource.hazard_information),
          citizen_science: await checkEndpointHealth(endpoints.resource.citizen_science),
        },
      };
    }

    // Check all endpoints in parallel
    const [
      cycloneTrack,
      event,
      riskInformation,
      riskForecast,
      hazardInformation,
      citizenScience,
    ] = await Promise.all([
      checkEndpointHealth(mapping.scopedUrls.cyclone_track),
      checkEndpointHealth(mapping.scopedUrls.event),
      checkEndpointHealth(mapping.scopedUrls.risk_information),
      checkEndpointHealth(mapping.scopedUrls.risk_forecast),
      checkEndpointHealth(mapping.scopedUrls.hazard_information),
      checkEndpointHealth(mapping.scopedUrls.citizen_science),
    ]);

    const available = cycloneTrack.available || event.available || riskInformation.available;

    return {
      countryCode,
      countryId: mapping.countryId,
      available,
      endpoints: {
        cyclone_track: cycloneTrack,
        event: event,
        risk_information: riskInformation,
        risk_forecast: riskForecast,
        hazard_information: hazardInformation,
        citizen_science: citizenScience,
      },
    };
  } catch (error) {
    console.error(`Failed to check Partner API availability for ${countryCode}:`, error);
    
    // Return unavailable status on error
    const endpoints = buildPartnerApiEndpoints(baseUrl);
    return {
      countryCode,
      countryId: null,
      available: false,
      endpoints: {
        cyclone_track: {
          endpoint: endpoints.resource.cyclone_track,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
        event: {
          endpoint: endpoints.resource.event,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
        risk_information: {
          endpoint: endpoints.resource.risk_information,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
        risk_forecast: {
          endpoint: endpoints.resource.risk_forecast,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
        hazard_information: {
          endpoint: endpoints.resource.hazard_information,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
        citizen_science: {
          endpoint: endpoints.resource.citizen_science,
          available: false,
          error: 'Check failed',
          lastChecked: new Date().toISOString(),
        },
      },
    };
  }
}

/**
 * Check availability of Partner API for all supported countries
 * @param baseUrl - Optional base URL override
 * @returns Complete health check result
 */
export async function checkPartnerApiHealth(
  baseUrl: string = DEFAULT_PARTNER_API_BASE
): Promise<{ healthy: boolean; countries: Record<CountryCode, CountryApiAvailability> }> {
  const countryCodes: CountryCode[] = ['VU', 'WS', 'TO', 'CK'];
  
  const results = await Promise.all(
    countryCodes.map(code => checkCountryApiAvailability(code, baseUrl))
  );

  const countries = results.reduce((acc, result) => {
    acc[result.countryCode] = result;
    return acc;
  }, {} as Record<CountryCode, CountryApiAvailability>);

  const healthy = results.some(result => result.available);

  return {
    healthy,
    countries,
  };
}
