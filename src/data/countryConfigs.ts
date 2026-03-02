import { District, Hazard, Province, Sector } from '@/types';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import {
  vanuatuDistricts,
  vanuatuHazards,
  vanuatuProvinces,
  vanuatuSectors,
} from '@/data/vanuatuHazards';

export interface CountryConfig {
  hazards: Hazard[];
  sectors: Sector[];
  provinces: Province[];
  districts: District[];
  defaultMapCenter: [number, number];
  defaultZoom: number;
  dataAvailable: boolean;
}

const emptyConfig = (country: CountryCode): CountryConfig => ({
  hazards: [],
  sectors: [],
  provinces: [],
  districts: [],
  defaultMapCenter: COUNTRIES[country].center,
  defaultZoom: COUNTRIES[country].zoom,
  dataAvailable: false,
});

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  VU: {
    hazards: vanuatuHazards,
    sectors: vanuatuSectors,
    provinces: vanuatuProvinces,
    districts: vanuatuDistricts,
    defaultMapCenter: COUNTRIES.VU.center,
    defaultZoom: COUNTRIES.VU.zoom,
    dataAvailable: true,
  },
  WS: emptyConfig('WS'),
  TO: emptyConfig('TO'),
  CK: emptyConfig('CK'),
};
