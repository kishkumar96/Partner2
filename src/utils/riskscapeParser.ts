/**
 * Utility functions for parsing and processing RiskScape data
 */

import {
  SLRAverageLoss,
  EventImpact,
  TimeSeriesData,
  RiskScapeStats,
  SectorImpact,
} from '@/types/riskscape';

/**
 * Convert SLR projections to time series data for chart display
 */
export function convertSLRToTimeSeries(
  slrData: SLRAverageLoss[],
  field: keyof SLRAverageLoss = 'totalAAL'
): TimeSeriesData[] {
  return slrData.map((data) => ({
    year: data.year,
    value: typeof data[field] === 'number' ? data[field] : 0,
    label: data.year.toString(),
    metadata: {
      scenario: data.scenario,
      slr: data.seaLevelRise,
    },
  }));
}

/**
 * Calculate aggregate statistics from multiple data sources.
 * 
 * @param slrData - Array of SLRAverageLoss data (will be sorted by year descending to find latest)
 * @param eventImpacts - Array of EventImpact data
 * @param sectorData - Array of SectorImpact data
 * @returns Partial RiskScapeStats with aggregated values
 */
export function calculateAggregateStats(
  slrData: SLRAverageLoss[],
  eventImpacts: EventImpact[],
  sectorData: SectorImpact[]
): Partial<RiskScapeStats> {
  // Get latest year data (sort by year descending to ensure we get the most recent)
  const sortedSLR = [...slrData].sort((a, b) => b.year - a.year);
  const latestSLR = sortedSLR.length > 0 ? sortedSLR[0] : null;
  
  // Sum sector impacts
  const totalSectorDamage = sectorData.reduce((sum, sector) => sum + sector.damage, 0);
  const totalBuildingsAffected = sectorData.reduce(
    (sum, sector) => sum + (sector.buildingsAffected || 0),
    0
  );

  return {
    totalExposedPopulation: latestSLR?.populationExposed || 0,
    totalEconomicLoss: latestSLR?.totalAAL || totalSectorDamage,
    buildingsAtRisk: totalBuildingsAffected,
    latestSLR: latestSLR?.seaLevelRise || 0,
  };
}

/**
 * Filter SLR data by year range
 */
export function filterSLRByYearRange(
  slrData: SLRAverageLoss[],
  startYear: number,
  endYear: number
): SLRAverageLoss[] {
  return slrData.filter((data) => data.year >= startYear && data.year <= endYear);
}

/**
 * Filter event impacts by return period
 */
export function filterEventsByReturnPeriod(
  events: EventImpact[],
  minReturnPeriod: number,
  maxReturnPeriod: number
): EventImpact[] {
  return events.filter(
    (event) => event.returnPeriod >= minReturnPeriod && event.returnPeriod <= maxReturnPeriod
  );
}

/**
 * Get available years from SLR dataset
 */
export function getAvailableYears(slrData: SLRAverageLoss[]): number[] {
  return [...new Set(slrData.map((data) => data.year))].sort((a, b) => a - b);
}

/**
 * Get SLR data for a specific year
 */
export function getSLRDataForYear(
  slrData: SLRAverageLoss[],
  year: number
): SLRAverageLoss | null {
  return slrData.find((data) => data.year === year) || null;
}

/**
 * Calculate year-over-year change for SLR metrics
 */
export function calculateYearOverYearChange(
  slrData: SLRAverageLoss[],
  field: keyof SLRAverageLoss = 'totalAAL'
): TimeSeriesData[] {
  const sorted = [...slrData].sort((a, b) => a.year - b.year);
  
  return sorted.map((data, index) => {
    if (index === 0) {
      return {
        year: data.year,
        value: 0,
        label: data.year.toString(),
      };
    }
    
    const prevValue = typeof sorted[index - 1][field] === 'number' 
      ? sorted[index - 1][field] as number
      : 0;
    const currentValue = typeof data[field] === 'number' 
      ? data[field] as number
      : 0;
    
    const change = prevValue !== 0 
      ? ((currentValue - prevValue) / prevValue) * 100
      : 0;
    
    return {
      year: data.year,
      value: change,
      label: data.year.toString(),
      metadata: {
        previous: prevValue,
        current: currentValue,
      },
    };
  });
}

/**
 * Calculate average annual growth rate
 */
export function calculateAverageGrowthRate(
  slrData: SLRAverageLoss[],
  field: keyof SLRAverageLoss = 'totalAAL'
): number {
  if (slrData.length < 2) return 0;
  
  const sorted = [...slrData].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  const firstValue = typeof first[field] === 'number' ? first[field] as number : 0;
  const lastValue = typeof last[field] === 'number' ? last[field] as number : 0;
  const years = last.year - first.year;
  
  if (firstValue === 0 || years === 0) return 0;
  
  return (Math.pow(lastValue / firstValue, 1 / years) - 1) * 100;
}

/**
 * Get sectors sorted by damage (descending)
 */
export function getSectorsByDamage(sectorData: SectorImpact[]): SectorImpact[] {
  return [...sectorData].sort((a, b) => b.damage - a.damage);
}

/**
 * Calculate total sector exposure
 */
export function calculateTotalSectorExposure(sectorData: SectorImpact[]): number {
  return sectorData.reduce((sum, sector) => sum + sector.exposure, 0);
}

/**
 * Parse CSV string to array of objects.
 * 
 * WARNING: This function is NOT implemented. Do NOT use this for any CSV parsing.
 * For production or development use, you MUST use the papaparse library, which is already added as a dependency.
 * 
 * Example usage with papaparse:
 * ```typescript
 * import Papa from 'papaparse';
 * const result = Papa.parse(csvString, { header: true, skipEmptyLines: true });
 * return result.data;
 * ```
 * 
 * @param csvString - The CSV string to parse
 * @returns Array of objects representing parsed CSV rows
 * @throws Error indicating this function is not implemented
 * @warning This is a simplified implementation. Use papaparse for production.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseCSV(_csvString: string): Record<string, string>[] {
  throw new Error(
    "parseCSV is not implemented. For robust CSV parsing, use the papaparse library. " +
    "See the comments in riskscapeParser.ts for example usage."
  );
}

/**
 * Convert parsed CSV data to SLRAverageLoss objects
 */
export function csvToSLRData(csvData: Record<string, string>[]): SLRAverageLoss[] {
  return csvData.map((row) => {
    // Validate scenario value before casting
    const scenario = row.scenario;
    const validScenario: 'SSP245' | 'SSP585' | undefined = (scenario === 'SSP245' || scenario === 'SSP585')
      ? scenario
      : undefined;
    
    return {
      year: parseInt(row.year || '0', 10),
      totalAAL: parseFloat(row.totalAAL || '0'),
      buildingAAL: parseFloat(row.buildingAAL || '0'),
      infrastructureAAL: parseFloat(row.infrastructureAAL || '0'),
      populationExposed: parseInt(row.populationExposed || '0', 10),
      seaLevelRise: parseFloat(row.seaLevelRise || '0'),
      scenario: validScenario,
    };
  });
}

/**
 * Convert parsed CSV data to EventImpact objects
 */
export function csvToEventImpacts(csvData: Record<string, string>[]): EventImpact[] {
  return csvData.map((row) => ({
    returnPeriod: parseInt(row.returnPeriod || '0', 10),
    exceedanceProbability: parseFloat(row.exceedanceProbability || '0'),
    totalLoss: parseFloat(row.totalLoss || '0'),
    buildingDamage: parseFloat(row.buildingDamage || '0'),
    infrastructureDamage: parseFloat(row.infrastructureDamage || '0'),
    populationAffected: parseInt(row.populationAffected || '0', 10),
    inundationDepth: parseFloat(row.inundationDepth || '0'),
  }));
}
