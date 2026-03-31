import { AggregationLevel, District, Hazard, Province, Sector } from '@/types';
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
  ui: {
    appName: string;
    focusAreaSingular: string;
    focusAreaPlural: string;
    broaderAreaSingular: string;
    broaderAreaPlural: string;
    nationalLabel: string;
  };
}

export function getCountryAppName(countryCode: CountryCode): string {
  return `${COUNTRIES[countryCode].name} Resilience Atlas`;
}

const emptyConfig = (country: CountryCode): CountryConfig => ({
  hazards: [],
  // Use the standard PDIE sector taxonomy across countries.
  sectors: vanuatuSectors,
  provinces: [],
  districts: [],
  defaultMapCenter: COUNTRIES[country].center,
  defaultZoom: COUNTRIES[country].zoom,
  dataAvailable: false,
  ui: {
    appName: getCountryAppName(country),
    focusAreaSingular: 'Region',
    focusAreaPlural: 'Regions',
    broaderAreaSingular: 'Region',
    broaderAreaPlural: 'Regions',
    nationalLabel: 'National',
  },
});

const coreHazardsForWmsCountries = vanuatuHazards.filter(
  hazard => hazard.id === 'tropical-cyclone' || hazard.id === 'flood'
);

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  VU: {
    hazards: coreHazardsForWmsCountries,
    sectors: vanuatuSectors,
    provinces: vanuatuProvinces,
    districts: vanuatuDistricts,
    defaultMapCenter: COUNTRIES.VU.center,
    defaultZoom: COUNTRIES.VU.zoom,
    dataAvailable: true,
    ui: {
      appName: getCountryAppName('VU'),
      focusAreaSingular: 'District',
      focusAreaPlural: 'Districts',
      broaderAreaSingular: 'Province',
      broaderAreaPlural: 'Provinces',
      nationalLabel: 'National',
    },
  },
  WS: {
    ...emptyConfig('WS'),
    hazards: coreHazardsForWmsCountries,
    dataAvailable: true,
    ui: {
      appName: getCountryAppName('WS'),
      focusAreaSingular: 'District',
      focusAreaPlural: 'Districts',
      broaderAreaSingular: 'District',
      broaderAreaPlural: 'Districts',
      nationalLabel: 'National',
    },
  },
  TO: {
    ...emptyConfig('TO'),
    hazards: coreHazardsForWmsCountries,
    dataAvailable: true,
    ui: {
      appName: getCountryAppName('TO'),
      focusAreaSingular: 'District',
      focusAreaPlural: 'Districts',
      broaderAreaSingular: 'District',
      broaderAreaPlural: 'Districts',
      nationalLabel: 'National',
    },
  },
  CK: {
    ...emptyConfig('CK'),
    hazards: coreHazardsForWmsCountries,
    dataAvailable: true,
  },
};

export function getAggregationLabel(countryCode: CountryCode, level: AggregationLevel): string {
  const ui = COUNTRY_CONFIGS[countryCode].ui;

  if (level === 'district') return ui.focusAreaPlural;
  if (level === 'province') return ui.broaderAreaPlural;
  return ui.nationalLabel;
}
