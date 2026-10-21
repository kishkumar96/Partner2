/**
 * Types for THREDDS server data integration
 */

import { listCountries, type CountryCode as ConfiguredCountryCode } from '@/config/registry';

/** The configured countries (see config/); generated, so adding one needs no edit here. */
export type CountryCode = ConfiguredCountryCode;

export interface Country {
  code: CountryCode;
  name: string;
  fullName: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export interface THREDDSDataSource {
  baseUrl: string;
  hazardPath: string;
  riskPath: string;
}

export interface GeoTIFFLayer {
  id: string;
  name: string;
  url: string;
  type: 'hazard' | 'risk';
  hazardType?: string;
  countryCode: CountryCode;
}

export interface CycloneTrack {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'LineString' | 'Point';
      coordinates: number[][];
    };
    properties: {
      name?: string;
      intensity?: string;
      date?: string;
      [key: string]: any;
    };
  }>;
}

// Built from config/countries/*.json. A country's map viewport lives there: the Cook Islands one is
// centred on Rarotonga, the only island the hazard/risk catalogue covers, at a zoom (11) that suits one
// ~6 km island; the whole scattered Cook Islands EEZ (zoom 6) rendered the island and its flood overlay
// as a few invisible pixels.
export const COUNTRIES = Object.fromEntries(
  listCountries().map(country => [
    country.code,
    {
      code: country.code,
      name: country.name,
      fullName: country.fullName,
      center: [country.viewport.center[0], country.viewport.center[1]] as [number, number],
      zoom: country.viewport.zoom,
    },
  ])
) as Record<CountryCode, Country>;

export const THREDDS_CONFIG: THREDDSDataSource = {
  baseUrl: 'https://gemthreddshpc.spc.int/thredds',
  hazardPath: '/POP/Partner2/case_study2/hazard',
  riskPath: '/POP/Partner2/case_study2/pdie_ini',
};
