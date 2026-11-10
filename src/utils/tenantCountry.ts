import { CountryCode } from '@/types/thredds';
import { CODE_TO_SLUG, SLUG_TO_CODE } from '@/utils/countrySlug';

function normalizeCountryInput(input: string | null | undefined): CountryCode | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const slug = trimmed.toLowerCase();
  if (SLUG_TO_CODE[slug]) {
    return SLUG_TO_CODE[slug];
  }

  const code = trimmed.toUpperCase() as CountryCode;
  if (CODE_TO_SLUG[code]) {
    return code;
  }

  return null;
}

export function getTenantCountryCodeFromEnv(): CountryCode | null {
  return normalizeCountryInput(process.env.TENANT_COUNTRY);
}

export function getTenantCountrySlugFromEnv(): string | null {
  const code = getTenantCountryCodeFromEnv();
  return code ? CODE_TO_SLUG[code] : null;
}
