import { CountryCode } from '@/types/thredds';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import { resolveCountryCode } from '@/lib/countryAuth';

let validated = false;

export function resetSecurityValidationForTests(): void {
  if (process.env.NODE_ENV === 'test') {
    validated = false;
  }
}

function getProtectedCountries(): CountryCode[] {
  const allCountries = Object.keys(CODE_TO_SLUG) as CountryCode[];
  const publicCountriesRaw = process.env.COUNTRY_PUBLIC_COUNTRIES || '';

  // Public-by-default policy unless COUNTRY_PUBLIC_COUNTRIES is explicitly provided.
  if (!publicCountriesRaw.trim()) {
    return [];
  }

  const publicCountries = new Set<CountryCode>();
  publicCountriesRaw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .forEach(entry => {
      const parsed = resolveCountryCode(entry);
      if (parsed) {
        publicCountries.add(parsed);
      }
    });

  return allCountries.filter(code => !publicCountries.has(code));
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function validateRedisUrl(redisUrl: string): boolean {
  try {
    const parsed = new URL(redisUrl);
    return parsed.protocol === 'redis:' || parsed.protocol === 'rediss:';
  } catch {
    return false;
  }
}

export function validateSecurityConfigOrThrow(): void {
  if (validated) {
    return;
  }

  const errors: string[] = [];
  const tenantCountry = process.env.TENANT_COUNTRY;
  if (tenantCountry && !resolveCountryCode(tenantCountry)) {
    errors.push('TENANT_COUNTRY must be a valid country code or slug.');
  }

  const protectedCountries = getProtectedCountries();
  if (protectedCountries.length > 0) {
    const authSecret = process.env.COUNTRY_AUTH_SECRET?.trim() || '';
    if (!authSecret) {
      errors.push('COUNTRY_AUTH_SECRET is required when any country is protected.');
    } else if (authSecret.length < 32) {
      errors.push('COUNTRY_AUTH_SECRET must be at least 32 characters.');
    }

    protectedCountries.forEach(code => {
      const password = process.env[`COUNTRY_PASSWORD_${code}`]?.trim();
      if (!password) {
        errors.push(`COUNTRY_PASSWORD_${code} is required when ${code} is protected.`);
      }
    });
  }

  // Redis is required only if AUTH_REQUIRE_REDIS is explicitly true,
  // or if we're in production AND AUTH_REQUIRE_REDIS is not explicitly false
  const authRequireRedisEnv = process.env.AUTH_REQUIRE_REDIS?.trim().toLowerCase();
  const isAuthRequireRedisExplicitlyFalse = authRequireRedisEnv === 'false' || authRequireRedisEnv === '0';
  const redisRequired =
    isTruthyEnv(process.env.AUTH_REQUIRE_REDIS) || 
    (process.env.NODE_ENV === 'production' && !isAuthRequireRedisExplicitlyFalse);
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisRequired) {
    if (!redisUrl) {
      errors.push('REDIS_URL is required for production/distributed auth controls.');
    } else if (!validateRedisUrl(redisUrl)) {
      errors.push('REDIS_URL must be a valid redis:// or rediss:// URL.');
    }
  } else if (redisUrl && !validateRedisUrl(redisUrl)) {
    errors.push('REDIS_URL must be a valid redis:// or rediss:// URL.');
  }

  if (errors.length > 0) {
    throw new Error(`Security config validation failed: ${errors.join(' ')}`);
  }

  validated = true;
}
