/**
 * Pacific Island country configurations for RiskScape data integration
 */

import { CountryDataset, Country } from '@/types/riskscape';

/**
 * Configuration for all Pacific Island countries in the RiskScape dataset
 */
export const countries: CountryDataset[] = [
  {
    id: 'cook-islands',
    name: 'Cook Islands',
    description: 'Comprehensive SLR projections and PDNA data for the Cook Islands archipelago',
    coordinates: {
      lat: -21.2367,
      lng: -159.7777,
      zoom: 8,
    },
    availableData: {
      slr: true,
      pdna: true,
      sectors: true,
      regional: true,
    },
    regions: ['Rarotonga', 'Aitutaki', 'Atiu', 'Mangaia', 'Mauke'],
    dataYearRange: {
      start: 2020,
      end: 2150,
    },
  },
  {
    id: 'samoa',
    name: 'Samoa',
    description: 'Multi-hazard risk assessment including cyclones, flooding, and sea level rise',
    coordinates: {
      lat: -13.759,
      lng: -172.1046,
      zoom: 9,
    },
    availableData: {
      slr: true,
      pdna: true,
      sectors: true,
      regional: true,
    },
    regions: ['Upolu', 'Savai\'i', 'Apolima', 'Manono'],
    dataYearRange: {
      start: 2020,
      end: 2100,
    },
  },
  {
    id: 'tuvalu',
    name: 'Tuvalu',
    description: 'Critical sea level rise and coastal inundation risk data for low-lying atolls',
    coordinates: {
      lat: -8.5211,
      lng: 179.1982,
      zoom: 10,
    },
    availableData: {
      slr: true,
      pdna: false,
      sectors: true,
      regional: false,
    },
    dataYearRange: {
      start: 2020,
      end: 2100,
    },
  },
  {
    id: 'vanuatu',
    name: 'Vanuatu',
    description: 'Comprehensive multi-hazard assessment including volcanic, cyclone, and coastal risks',
    coordinates: {
      lat: -15.3767,
      lng: 166.9592,
      zoom: 7,
    },
    availableData: {
      slr: true,
      pdna: true,
      sectors: true,
      regional: true,
    },
    regions: ['Shefa', 'Sanma', 'Tafea', 'Malampa', 'Penama', 'Torba'],
    dataYearRange: {
      start: 2020,
      end: 2100,
    },
  },
  {
    id: 'vanuatu-slr',
    name: 'Vanuatu (SLR Focus)',
    description: 'Detailed sea level rise projections and coastal vulnerability analysis',
    coordinates: {
      lat: -15.3767,
      lng: 166.9592,
      zoom: 7,
    },
    availableData: {
      slr: true,
      pdna: false,
      sectors: true,
      regional: true,
    },
    regions: ['Shefa', 'Sanma', 'Tafea', 'Malampa', 'Penama', 'Torba'],
    dataYearRange: {
      start: 2020,
      end: 2150,
    },
  },
  {
    id: 'marshall-islands',
    name: 'Marshall Islands (RMI)',
    description: 'Sea level rise and atoll vulnerability assessment for the Republic of Marshall Islands',
    coordinates: {
      lat: 7.1315,
      lng: 171.1845,
      zoom: 8,
    },
    availableData: {
      slr: true,
      pdna: false,
      sectors: true,
      regional: true,
    },
    regions: ['Majuro', 'Kwajalein', 'Arno', 'Jaluit', 'Ebeye'],
    dataYearRange: {
      start: 2020,
      end: 2100,
    },
  },
];

/**
 * Get country configuration by ID
 */
export function getCountryById(id: Country): CountryDataset | undefined {
  return countries.find(c => c.id === id);
}

/**
 * Get all available country IDs
 */
export function getCountryIds(): Country[] {
  return countries.map(c => c.id);
}

/**
 * Get countries with specific data type available
 */
export function getCountriesWithDataType(dataType: keyof CountryDataset['availableData']): CountryDataset[] {
  return countries.filter(c => c.availableData[dataType]);
}
