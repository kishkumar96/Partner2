import { CountryCode } from '@/types/thredds';

const slugToCode = Object.create(null) as Record<string, CountryCode>;
slugToCode.vanuatu = 'VU';
slugToCode.samoa = 'WS';
slugToCode.tonga = 'TO';
slugToCode['cook-islands'] = 'CK';

const codeToSlug = Object.create(null) as Record<CountryCode, string>;
codeToSlug.VU = 'vanuatu';
codeToSlug.WS = 'samoa';
codeToSlug.TO = 'tonga';
codeToSlug.CK = 'cook-islands';

export const SLUG_TO_CODE: Record<string, CountryCode> = Object.freeze(slugToCode);
export const CODE_TO_SLUG: Record<CountryCode, string> = Object.freeze(codeToSlug);

export function getCountryCodeFromSlug(slug: string): CountryCode | null {
  if (!Object.prototype.hasOwnProperty.call(SLUG_TO_CODE, slug)) {
    return null;
  }

  return SLUG_TO_CODE[slug];
}

export function getCountrySlugFromCode(code: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(CODE_TO_SLUG, code)) {
    return null;
  }

  return CODE_TO_SLUG[code as CountryCode];
}
