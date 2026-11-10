import type { CountryCode } from '@/types/thredds';
import { getCountryByCode, getCountryBySlug, listCountries } from '@/config/registry';

const slugToCode = Object.create(null) as Record<string, CountryCode>;
const codeToSlug = Object.create(null) as Record<CountryCode, string>;
for (const country of listCountries()) {
  slugToCode[country.slug] = country.code;
  codeToSlug[country.code] = country.slug;
}

export const SLUG_TO_CODE: Record<string, CountryCode> = Object.freeze(slugToCode);
export const CODE_TO_SLUG: Record<CountryCode, string> = Object.freeze(codeToSlug);

export function getCountryCodeFromSlug(slug: string): CountryCode | null {
  // An exact slug only: a code or a differently-cased slug is not a slug
  const country = getCountryBySlug(slug);
  return country && country.slug === slug ? country.code : null;
}

export function getCountrySlugFromCode(code: string): string | null {
  // An exact code only
  const country = getCountryByCode(code);
  return country && country.code === code ? country.slug : null;
}
