/**
 * Type definitions for RiskScape climate risk data integration
 * Based on data from the riskscape-nexus repository
 */

/**
 * Pacific Island countries available in the dataset
 */
export type Country = 
  | 'cook-islands'
  | 'samoa'
  | 'tuvalu'
  | 'vanuatu'
  | 'vanuatu-slr'
  | 'marshall-islands';

/**
 * Sea Level Rise (SLR) average loss data - year-by-year projections
 */
export interface SLRAverageLoss {
  year: number;
  totalAAL: number; // Annual Average Loss in USD
  buildingAAL: number;
  infrastructureAAL: number;
  populationExposed: number;
  seaLevelRise: number; // in meters
  scenario?: 'SSP245' | 'SSP585'; // Climate scenario
}

/**
 * Event impact analysis with return periods
 */
export interface EventImpact {
  returnPeriod: number; // years (e.g., 5, 10, 25, 50, 100)
  exceedanceProbability: number; // probability (0-1)
  totalLoss: number; // USD
  buildingDamage: number;
  infrastructureDamage: number;
  populationAffected: number;
  inundationDepth: number; // meters
}

/**
 * Post-Disaster Needs Assessment (PDNA) summary
 */
export interface PDNASummary {
  country: Country;
  disasterType: string;
  year: number;
  totalDamage: number; // USD
  totalLoss: number; // USD
  recoveryNeeds: number; // USD
  affectedPopulation: number;
  sectors: SectorImpact[];
}

/**
 * Sector-specific impact data
 */
export interface SectorImpact {
  sectorName: string;
  damage: number; // USD
  loss: number; // USD
  exposure: number; // USD - total exposed assets
  affectedPopulation?: number;
  buildingsAffected?: number;
}

/**
 * SLR threshold exceedance data
 */
export interface SLRThreshold {
  threshold: number; // meters (e.g., 0.5, 1.0, 1.5)
  yearExceeded: number;
  scenario: 'SSP245' | 'SSP585';
}

/**
 * Country dataset configuration
 */
export interface CountryDataset {
  id: Country;
  name: string;
  description: string;
  coordinates: {
    lat: number;
    lng: number;
    zoom: number;
  };
  availableData: {
    slr: boolean;
    pdna: boolean;
    sectors: boolean;
    regional: boolean;
  };
  regions?: string[]; // Sub-national regions/provinces
  dataYearRange: {
    start: number;
    end: number;
  };
}

/**
 * Aggregated statistics for a country
 */
export interface RiskScapeStats {
  country: Country;
  totalExposedPopulation: number;
  totalEconomicLoss: number; // USD
  buildingsAtRisk: number;
  infrastructureAtRisk: number;
  primaryHazards: string[];
  latestSLR?: number; // meters
  dataLastUpdated: string; // ISO date
}

/**
 * Time series data point for charts
 */
export interface TimeSeriesData {
  year: number;
  value: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Multi-hazard analysis data
 */
export interface MultiHazardData {
  hazardType: 'wind' | 'coastal_flooding' | 'fluvial_flooding' | 'sea_level_rise' | 'cyclone';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedArea: number; // square kilometers
  exposedPopulation: number;
  economicImpact: number; // USD
}

/**
 * Regional breakdown data
 */
export interface RegionalData {
  regionName: string;
  regionType: 'national' | 'province' | 'district';
  parentRegion?: string;
  population: number;
  exposure: {
    buildings: number;
    infrastructure: number;
    agricultural: number;
    total: number; // USD
  };
  risks: MultiHazardData[];
}

/**
 * Complete country risk profile
 */
export interface CountryRiskProfile {
  country: CountryDataset;
  stats: RiskScapeStats;
  slrProjections: SLRAverageLoss[];
  eventImpacts: EventImpact[];
  sectorBreakdown: SectorImpact[];
  regionalData?: RegionalData[];
  thresholds?: SLRThreshold[];
}
