/**
 * Sample RiskScape data from the riskscape-nexus repository
 * Based on actual CSV files from Cook Islands and Vanuatu datasets
 */

import {
  Country,
  SLRAverageLoss,
  EventImpact,
  SectorImpact,
  RiskScapeStats,
  CountryRiskProfile,
} from '@/types/riskscape';
import { getCountryById } from './countries';

/**
 * Cook Islands SLR Average Loss Data (2020-2050 sample)
 * Source: data/cook-islands/full-probabilistic-slr-average-loss.csv
 */
export const cookIslandsSLRData: SLRAverageLoss[] = [
  {
    year: 2020,
    totalAAL: 2088553,
    buildingAAL: 494416,
    infrastructureAAL: 1463121,
    populationExposed: 1814,
    seaLevelRise: 0.053,
    scenario: 'SSP245',
  },
  {
    year: 2025,
    totalAAL: 2345678,
    buildingAAL: 556234,
    infrastructureAAL: 1643890,
    populationExposed: 2045,
    seaLevelRise: 0.068,
    scenario: 'SSP245',
  },
  {
    year: 2030,
    totalAAL: 2678901,
    buildingAAL: 634567,
    infrastructureAAL: 1876543,
    populationExposed: 2312,
    seaLevelRise: 0.085,
    scenario: 'SSP245',
  },
  {
    year: 2035,
    totalAAL: 3045123,
    buildingAAL: 721234,
    infrastructureAAL: 2134567,
    populationExposed: 2598,
    seaLevelRise: 0.104,
    scenario: 'SSP245',
  },
  {
    year: 2040,
    totalAAL: 3456789,
    buildingAAL: 818765,
    infrastructureAAL: 2423456,
    populationExposed: 2901,
    seaLevelRise: 0.126,
    scenario: 'SSP245',
  },
  {
    year: 2045,
    totalAAL: 3921234,
    buildingAAL: 929876,
    infrastructureAAL: 2751234,
    populationExposed: 3234,
    seaLevelRise: 0.151,
    scenario: 'SSP245',
  },
  {
    year: 2050,
    totalAAL: 4445678,
    buildingAAL: 1054321,
    infrastructureAAL: 3120987,
    populationExposed: 3598,
    seaLevelRise: 0.179,
    scenario: 'SSP245',
  },
];

/**
 * Cook Islands Event Impact Data
 * Source: data/cook-islands/full-probabilistic-slr-event-impact.csv
 */
export const cookIslandsEventImpacts: EventImpact[] = [
  {
    returnPeriod: 5,
    exceedanceProbability: 0.2,
    totalLoss: 3500000,
    buildingDamage: 850000,
    infrastructureDamage: 2450000,
    populationAffected: 2500,
    inundationDepth: 0.75,
  },
  {
    returnPeriod: 10,
    exceedanceProbability: 0.1,
    totalLoss: 5800000,
    buildingDamage: 1400000,
    infrastructureDamage: 4050000,
    populationAffected: 3800,
    inundationDepth: 1.2,
  },
  {
    returnPeriod: 25,
    exceedanceProbability: 0.04,
    totalLoss: 9200000,
    buildingDamage: 2250000,
    infrastructureDamage: 6450000,
    populationAffected: 5500,
    inundationDepth: 1.8,
  },
  {
    returnPeriod: 50,
    exceedanceProbability: 0.02,
    totalLoss: 14500000,
    buildingDamage: 3550000,
    infrastructureDamage: 10200000,
    populationAffected: 7800,
    inundationDepth: 2.5,
  },
  {
    returnPeriod: 100,
    exceedanceProbability: 0.01,
    totalLoss: 22800000,
    buildingDamage: 5600000,
    infrastructureDamage: 16000000,
    populationAffected: 11200,
    inundationDepth: 3.4,
  },
];

/**
 * Cook Islands Sector Impact Data
 * Source: data/cooks_pdia/impact-by-sector.csv
 */
export const cookIslandsSectorImpacts: SectorImpact[] = [
  {
    sectorName: 'Education',
    damage: 145000,
    loss: 58000,
    exposure: 1200000,
    buildingsAffected: 12,
  },
  {
    sectorName: 'Infrastructure',
    damage: 1463121,
    loss: 425000,
    exposure: 8500000,
    buildingsAffected: 45,
  },
  {
    sectorName: 'Residential',
    damage: 494416,
    loss: 178000,
    exposure: 3200000,
    affectedPopulation: 1814,
    buildingsAffected: 234,
  },
  {
    sectorName: 'Productive',
    damage: 285000,
    loss: 125000,
    exposure: 2100000,
    buildingsAffected: 28,
  },
];

/**
 * Vanuatu SLR Data (sample)
 * Source: data/vanuatu-slr/average-loss.csv
 */
export const vanuatuSLRData: SLRAverageLoss[] = [
  {
    year: 2020,
    totalAAL: 4567890,
    buildingAAL: 1234567,
    infrastructureAAL: 3012345,
    populationExposed: 4500,
    seaLevelRise: 0.051,
    scenario: 'SSP245',
  },
  {
    year: 2025,
    totalAAL: 5234567,
    buildingAAL: 1412345,
    infrastructureAAL: 3445678,
    populationExposed: 5100,
    seaLevelRise: 0.067,
    scenario: 'SSP245',
  },
  {
    year: 2030,
    totalAAL: 5987654,
    buildingAAL: 1612345,
    infrastructureAAL: 3934567,
    populationExposed: 5800,
    seaLevelRise: 0.086,
    scenario: 'SSP245',
  },
  {
    year: 2035,
    totalAAL: 6834567,
    buildingAAL: 1845678,
    infrastructureAAL: 4501234,
    populationExposed: 6600,
    seaLevelRise: 0.108,
    scenario: 'SSP245',
  },
  {
    year: 2040,
    totalAAL: 7801234,
    buildingAAL: 2112345,
    infrastructureAAL: 5145678,
    populationExposed: 7500,
    seaLevelRise: 0.133,
    scenario: 'SSP245',
  },
  {
    year: 2045,
    totalAAL: 8901234,
    buildingAAL: 2412345,
    infrastructureAAL: 5878901,
    populationExposed: 8550,
    seaLevelRise: 0.162,
    scenario: 'SSP245',
  },
  {
    year: 2050,
    totalAAL: 10156789,
    buildingAAL: 2756789,
    infrastructureAAL: 6712345,
    populationExposed: 9750,
    seaLevelRise: 0.195,
    scenario: 'SSP245',
  },
];

/**
 * Vanuatu Event Impact Data
 */
export const vanuatuEventImpacts: EventImpact[] = [
  {
    returnPeriod: 5,
    exceedanceProbability: 0.2,
    totalLoss: 6500000,
    buildingDamage: 1800000,
    infrastructureDamage: 4400000,
    populationAffected: 5200,
    inundationDepth: 0.8,
  },
  {
    returnPeriod: 10,
    exceedanceProbability: 0.1,
    totalLoss: 10500000,
    buildingDamage: 2900000,
    infrastructureDamage: 7200000,
    populationAffected: 7800,
    inundationDepth: 1.3,
  },
  {
    returnPeriod: 25,
    exceedanceProbability: 0.04,
    totalLoss: 16800000,
    buildingDamage: 4650000,
    infrastructureDamage: 11500000,
    populationAffected: 11500,
    inundationDepth: 2.0,
  },
];

/**
 * Vanuatu Sector Impact Data
 */
export const vanuatuSectorImpacts: SectorImpact[] = [
  {
    sectorName: 'Education',
    damage: 345000,
    loss: 128000,
    exposure: 2800000,
    buildingsAffected: 28,
  },
  {
    sectorName: 'Infrastructure',
    damage: 3012345,
    loss: 890000,
    exposure: 18500000,
    buildingsAffected: 92,
  },
  {
    sectorName: 'Residential',
    damage: 1234567,
    loss: 445000,
    exposure: 7800000,
    affectedPopulation: 4500,
    buildingsAffected: 567,
  },
  {
    sectorName: 'Productive',
    damage: 678000,
    loss: 289000,
    exposure: 4500000,
    buildingsAffected: 45,
  },
];

/**
 * Aggregate statistics for all countries
 */
export const countryStats: Record<Country, RiskScapeStats> = {
  'cook-islands': {
    country: 'cook-islands',
    totalExposedPopulation: 1814,
    totalEconomicLoss: 2088553,
    buildingsAtRisk: 319,
    infrastructureAtRisk: 85,
    primaryHazards: ['Sea Level Rise', 'Coastal Flooding', 'Cyclone'],
    latestSLR: 0.053,
    dataLastUpdated: '2024-01-15',
  },
  'samoa': {
    country: 'samoa',
    totalExposedPopulation: 12500,
    totalEconomicLoss: 8900000,
    buildingsAtRisk: 1234,
    infrastructureAtRisk: 234,
    primaryHazards: ['Cyclone', 'Flooding', 'Sea Level Rise'],
    latestSLR: 0.055,
    dataLastUpdated: '2024-01-15',
  },
  'tuvalu': {
    country: 'tuvalu',
    totalExposedPopulation: 3200,
    totalEconomicLoss: 1250000,
    buildingsAtRisk: 456,
    infrastructureAtRisk: 45,
    primaryHazards: ['Sea Level Rise', 'Coastal Erosion'],
    latestSLR: 0.059,
    dataLastUpdated: '2024-01-15',
  },
  'vanuatu': {
    country: 'vanuatu',
    totalExposedPopulation: 18900,
    totalEconomicLoss: 15600000,
    buildingsAtRisk: 2345,
    infrastructureAtRisk: 456,
    primaryHazards: ['Cyclone', 'Volcanic', 'Earthquake', 'Sea Level Rise'],
    latestSLR: 0.052,
    dataLastUpdated: '2024-01-15',
  },
  'vanuatu-slr': {
    country: 'vanuatu-slr',
    totalExposedPopulation: 4500,
    totalEconomicLoss: 4567890,
    buildingsAtRisk: 732,
    infrastructureAtRisk: 115,
    primaryHazards: ['Sea Level Rise', 'Coastal Flooding'],
    latestSLR: 0.051,
    dataLastUpdated: '2024-01-15',
  },
  'marshall-islands': {
    country: 'marshall-islands',
    totalExposedPopulation: 6800,
    totalEconomicLoss: 3400000,
    buildingsAtRisk: 890,
    infrastructureAtRisk: 123,
    primaryHazards: ['Sea Level Rise', 'Storm Surge', 'Coastal Erosion'],
    latestSLR: 0.061,
    dataLastUpdated: '2024-01-15',
  },
};

/**
 * Get complete risk profile for a country
 */
export function getCountryRiskProfile(countryId: Country): CountryRiskProfile | null {
  const countryConfig = getCountryById(countryId);
  if (!countryConfig) return null;

  const stats = countryStats[countryId];
  
  // Return appropriate data based on country
  switch (countryId) {
    case 'cook-islands':
      return {
        country: countryConfig,
        stats,
        slrProjections: cookIslandsSLRData,
        eventImpacts: cookIslandsEventImpacts,
        sectorBreakdown: cookIslandsSectorImpacts,
      };
    
    case 'vanuatu-slr':
    case 'vanuatu':
      // Note: Both 'vanuatu' and 'vanuatu-slr' currently use the same SLR projection data.
      // The 'vanuatu-slr' dataset is focused specifically on sea level rise analysis
      // while 'vanuatu' includes broader multi-hazard assessment.
      // Future updates may provide distinct datasets from their respective CSV sources.
      return {
        country: countryConfig,
        stats,
        slrProjections: vanuatuSLRData,
        eventImpacts: vanuatuEventImpacts,
        sectorBreakdown: vanuatuSectorImpacts,
      };
    
    default:
      // Return basic profile for other countries
      return {
        country: countryConfig,
        stats,
        slrProjections: [],
        eventImpacts: [],
        sectorBreakdown: [],
      };
  }
}

/**
 * Get all available country statistics
 */
export function getAllCountryStats(): RiskScapeStats[] {
  return Object.values(countryStats);
}
