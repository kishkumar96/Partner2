import { AggregationLevel, District, Hazard, Province, Sector } from '@/types';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { getCountryPresentation, listCountryCodes } from '@/config/registry';
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
  return getCountryPresentation(countryCode).appName;
}

/** A country's labels for its areas, from config/countries/<country>.json */
function uiFor(countryCode: CountryCode): CountryConfig['ui'] {
  const { appName, terminology } = getCountryPresentation(countryCode);
  return { appName, ...terminology };
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
  ui: uiFor(country),
});

const coreHazardsForWmsCountries = vanuatuHazards.filter(
  hazard => hazard.id === 'tropical-cyclone' || hazard.id === 'flood'
);

/**
 * What each country has beyond the standard (empty) configuration: the areas it reports by and
 * whether its hazard/risk data is loaded. A country with no entry here, such as one just added in
 * config/, gets the empty configuration with `dataAvailable: false`, which the dashboard shows as
 * "no data yet" instead of failing. (Moving this into config/ is Phase 2.)
 */
const COUNTRY_DATA: Partial<Record<CountryCode, Partial<CountryConfig>>> = {
  VU: {
    hazards: coreHazardsForWmsCountries,
    provinces: vanuatuProvinces,
    districts: vanuatuDistricts,
    dataAvailable: true,
  },
  WS: { hazards: coreHazardsForWmsCountries, dataAvailable: true },
  TO: { hazards: coreHazardsForWmsCountries, dataAvailable: true },
  CK: { hazards: coreHazardsForWmsCountries, dataAvailable: true },
};

export const COUNTRY_CONFIGS = Object.fromEntries(
  listCountryCodes().map(code => [code, { ...emptyConfig(code), ...COUNTRY_DATA[code] }])
) as Record<CountryCode, CountryConfig>;

export function getAggregationLabel(countryCode: CountryCode, level: AggregationLevel): string {
  const ui = COUNTRY_CONFIGS[countryCode].ui;

  if (level === 'district') return ui.focusAreaPlural;
  if (level === 'province') return ui.broaderAreaPlural;
  return ui.nationalLabel;
}
