import { CountryCode } from '@/types/thredds';

export const SLUG_TO_CODE: Record<string, CountryCode> = {
  vanuatu: 'VU',
  samoa: 'WS',
  tonga: 'TO',
  'cook-islands': 'CK',
};

export const CODE_TO_SLUG: Record<CountryCode, string> = {
  VU: 'vanuatu',
  WS: 'samoa',
  TO: 'tonga',
  CK: 'cook-islands',
};
