/**
 * WORLD-CLASS DATA NORMALIZATION LAYER
 *
 * Problem: CSV data arrives as strings, lacks population in sector files, has inconsistent
 * aggregation levels, and requires manual Number() wrapping everywhere.
 *
 * Solution: Type-safe parsing + automatic aggregation + data quality validation
 */

// ============================================================================
// TYPE-SAFE SCHEMAS
// ============================================================================

export interface NormalizedRegionalData {
  regionId: string;
  regionName: string;
  totalPopulation: number;
  populationExposed: number;
  totalBuildings: number;
  damagedBuildings: number;
  totalLoss: number;
  totalValue: number;
  exposedValue: number;
  // Enriched fields
  populationExposureRate: number; // 0-1
  buildingDamageRate: number; // 0-1
  lossRate: number; // loss / value
}

export interface NormalizedSectorData {
  sectorName: string;
  regionName: string | null; // null = national aggregate
  totalLoss: number;
  windLoss: number;
  fluvialLoss: number;
  coastalLoss: number;
  totalValue: number;
  exposedValue: number;
  totalBuildings: number;
  exposedBuildings: number;
  damagedBuildings: number;
  // Attributed population (calculated from regional data)
  estimatedPopulationExposed: number;
  estimatedTotalPopulation: number;
}

export interface NormalizedNationalSummary {
  totalPopulation: number;
  populationExposed: number;
  totalLoss: number;
  totalValue: number;
  exposedValue: number;
  damagedBuildings: number;
  totalBuildings: number;
  // Calculated rates
  nationalExposureRate: number;
  nationalDamageRate: number;
}

export interface DataQualityReport {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    regionsLoaded: number;
    sectorsLoaded: number;
    nationalAggregateMatches: boolean;
    sectorSumMatchesNational: boolean;
  };
}

// ============================================================================
// CORE NORMALIZER
// ============================================================================

export class CSVDataNormalizer {
  private nationalData: NormalizedNationalSummary | null = null;
  private regionalData: Map<string, NormalizedRegionalData> = new Map();
  private sectorData: NormalizedSectorData[] = [];
  private qualityReport: DataQualityReport = {
    isValid: false,
    warnings: [],
    errors: [],
    stats: {
      regionsLoaded: 0,
      sectorsLoaded: 0,
      nationalAggregateMatches: false,
      sectorSumMatchesNational: false,
    },
  };

  /**
   * Load and normalize all CSV data sources
   */
  async loadAll(rawData: {
    nationalSummary: any[];
    regionalSummary: any[];
    impactBySector: any[];
    regionalSummaryBySector?: any[];
  }): Promise<void> {
    // Step 1: Parse national summary
    this.nationalData = this.parseNationalSummary(rawData.nationalSummary);

    // Step 2: Parse regional data (has population)
    this.regionalData = this.parseRegionalSummary(rawData.regionalSummary);
    this.qualityReport.stats.regionsLoaded = this.regionalData.size;

    // Step 3: Parse sector data (NO population - we'll attribute it)
    this.sectorData = this.parseSectorData(rawData.impactBySector, rawData.regionalSummaryBySector);
    this.qualityReport.stats.sectorsLoaded = this.sectorData.length;

    // Step 4: Attribute population to sectors
    this.attributePopulationToSectors();

    // Step 5: Validate data quality
    this.validateDataQuality();
  }

  /**
   * Get normalized regional data (with population)
   */
  getRegionalData(regionName?: string | null): NormalizedRegionalData[] {
    const regions = Array.from(this.regionalData.values());
    if (!regionName) return regions;
    return regions.filter(r => r.regionName === regionName);
  }

  /**
   * Get normalized sector data (with attributed population)
   */
  getSectorData(filterSectors?: string[], filterRegion?: string | null): NormalizedSectorData[] {
    let filtered = this.sectorData;

    if (filterSectors && filterSectors.length > 0) {
      filtered = filtered.filter(s => filterSectors.includes(s.sectorName));
    }

    if (filterRegion) {
      filtered = filtered.filter(s => s.regionName === filterRegion);
    }

    return filtered;
  }

  /**
   * Get aggregated totals (respects filters)
   */
  getAggregatedTotals(
    filterSectors?: string[],
    filterRegion?: string | null
  ): {
    totalLoss: number;
    totalValue: number;
    exposedValue: number;
    totalPopulation: number;
    populationExposed: number;
    totalBuildings: number;
    damagedBuildings: number;
  } {
    // If no filters, return national summary
    if (!filterSectors?.length && !filterRegion) {
      return {
        totalLoss: this.nationalData?.totalLoss ?? 0,
        totalValue: this.nationalData?.totalValue ?? 0,
        exposedValue: this.nationalData?.exposedValue ?? 0,
        totalPopulation: this.nationalData?.totalPopulation ?? 0,
        populationExposed: this.nationalData?.populationExposed ?? 0,
        totalBuildings: this.nationalData?.totalBuildings ?? 0,
        damagedBuildings: this.nationalData?.damagedBuildings ?? 0,
      };
    }

    // Apply filters and aggregate
    const regions = this.getRegionalData(filterRegion);
    const sectors = this.getSectorData(filterSectors, filterRegion);

    return {
      totalLoss: sectors.reduce((sum, s) => sum + s.totalLoss, 0),
      totalValue: sectors.reduce((sum, s) => sum + s.totalValue, 0),
      exposedValue: sectors.reduce((sum, s) => sum + s.exposedValue, 0),
      // Population comes from regional data, not sector data
      totalPopulation: regions.reduce((sum, r) => sum + r.totalPopulation, 0),
      populationExposed: regions.reduce((sum, r) => sum + r.populationExposed, 0),
      totalBuildings: sectors.reduce((sum, s) => sum + s.totalBuildings, 0),
      damagedBuildings: sectors.reduce((sum, s) => sum + s.damagedBuildings, 0),
    };
  }

  /**
   * Get data quality report
   */
  getQualityReport(): DataQualityReport {
    return this.qualityReport;
  }

  // ========================================================================
  // PRIVATE PARSING METHODS
  // ========================================================================

  private parseNationalSummary(raw: any[]): NormalizedNationalSummary {
    if (!raw || raw.length === 0) {
      return {
        totalPopulation: 0,
        populationExposed: 0,
        totalLoss: 0,
        totalValue: 0,
        exposedValue: 0,
        damagedBuildings: 0,
        totalBuildings: 0,
        nationalExposureRate: 0,
        nationalDamageRate: 0,
      };
    }

    const row = raw[0];
    const totalPop = this.parseNumber(row.Total_Population);
    const popExposed = this.parseNumber(row.Population_Exposed_To_Any_Hazard);
    const totalValue = this.parseNumber(row.Total_Value);
    const totalLoss = this.parseNumber(row.Total_Loss);

    return {
      totalPopulation: totalPop,
      populationExposed: popExposed,
      totalLoss: totalLoss,
      totalValue: totalValue,
      exposedValue: this.parseNumber(row.Total_Exposed_Value_To_Any_Hazard),
      damagedBuildings: this.parseNumber(row.Damaged_Buildings),
      totalBuildings: this.parseNumber(row.Total_Buildings),
      nationalExposureRate: totalPop > 0 ? popExposed / totalPop : 0,
      nationalDamageRate: totalValue > 0 ? totalLoss / totalValue : 0,
    };
  }

  private parseRegionalSummary(raw: any[]): Map<string, NormalizedRegionalData> {
    const map = new Map<string, NormalizedRegionalData>();

    for (const row of raw) {
      const regionName = String(row.Region || '').trim();
      if (!regionName) continue; // Skip blank rows

      const totalPop = this.parseNumber(row.Total_Population);
      const popExposed = this.parseNumber(row.Population_Exposed_To_Any_Hazard);
      const totalBuildings = this.parseNumber(row.Total_Buildings);
      const damagedBuildings = this.parseNumber(row.Damaged_Buildings);
      const totalValue = this.parseNumber(row.Total_Value);
      const totalLoss = this.parseNumber(row.Total_Loss);

      map.set(regionName, {
        regionId: String(row.Region_ID || regionName),
        regionName,
        totalPopulation: totalPop,
        populationExposed: popExposed,
        totalBuildings,
        damagedBuildings,
        totalLoss,
        totalValue,
        exposedValue: this.parseNumber(row.Total_Exposed_Value_To_Any_Hazard),
        populationExposureRate: totalPop > 0 ? popExposed / totalPop : 0,
        buildingDamageRate: totalBuildings > 0 ? damagedBuildings / totalBuildings : 0,
        lossRate: totalValue > 0 ? totalLoss / totalValue : 0,
      });
    }

    return map;
  }

  private parseSectorData(impactBySector: any[], regionalBySector?: any[]): NormalizedSectorData[] {
    const sectors: NormalizedSectorData[] = [];

    // National-level sector data (from impact-by-sector.csv)
    for (const row of impactBySector) {
      const sectorName = String(row.Sector || '').trim();
      if (!sectorName) continue;

      sectors.push({
        sectorName,
        regionName: null, // National aggregate
        totalLoss: this.parseNumber(row.Total_Loss),
        windLoss: this.parseNumber(row.Total_Wind_Loss),
        fluvialLoss: this.parseNumber(row.Total_Fluvial_Loss),
        coastalLoss: this.parseNumber(row.Total_Coastal_Loss),
        totalValue: this.parseNumber(row.Total_Value),
        exposedValue: this.parseNumber(row.Total_Exposed_Value),
        totalBuildings: this.parseNumber(row.Total_Number_Buildings),
        exposedBuildings: this.parseNumber(row.Number_Exposed_Buildings),
        damagedBuildings: this.parseNumber(row.Number_Damaged_Buildings),
        estimatedPopulationExposed: 0, // Will be calculated
        estimatedTotalPopulation: 0,
      });
    }

    // Regional-level sector data (from regional-summary-by-sector.csv)
    if (regionalBySector) {
      for (const row of regionalBySector) {
        const sectorName = String(row.Sector || '').trim();
        const regionName = String(row.Region || '').trim();
        if (!sectorName || !regionName) continue;

        sectors.push({
          sectorName,
          regionName,
          totalLoss: this.parseNumber(row.Total_Loss),
          windLoss: this.parseNumber(row.Total_Wind_Loss),
          fluvialLoss: this.parseNumber(row.Total_Fluvial_Loss),
          coastalLoss: this.parseNumber(row.Total_Coastal_Loss),
          totalValue: this.parseNumber(row.Total_Value),
          exposedValue: this.parseNumber(row.Total_Exposed_Value),
          totalBuildings: this.parseNumber(row.Total_Number_Buildings),
          exposedBuildings: this.parseNumber(row.Number_Exposed_Buildings),
          damagedBuildings: this.parseNumber(row.Number_Damaged_Buildings),
          estimatedPopulationExposed: 0, // Will be calculated
          estimatedTotalPopulation: 0,
        });
      }
    }

    return sectors;
  }

  /**
   * CRITICAL: Attribute population to sectors based on exposure proportions
   *
   * Since sector CSVs have no population columns, we distribute regional
   * population proportionally based on exposed building value.
   */
  private attributePopulationToSectors(): void {
    for (const sector of this.sectorData) {
      if (!sector.regionName) {
        // National-level sector: use national population proportionally
        if (this.nationalData && this.nationalData.exposedValue > 0) {
          const proportion = sector.exposedValue / this.nationalData.exposedValue;
          sector.estimatedPopulationExposed = Math.round(
            this.nationalData.populationExposed * proportion
          );
          sector.estimatedTotalPopulation = Math.round(
            this.nationalData.totalPopulation * proportion
          );
        }
      } else {
        // Regional-level sector: use regional population
        const region = this.regionalData.get(sector.regionName);
        if (region && region.exposedValue > 0) {
          const proportion = sector.exposedValue / region.exposedValue;
          sector.estimatedPopulationExposed = Math.round(region.populationExposed * proportion);
          sector.estimatedTotalPopulation = Math.round(region.totalPopulation * proportion);
        }
      }
    }
  }

  /**
   * Validate data quality and generate warnings/errors
   */
  private validateDataQuality(): void {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if sector sums match national totals
    const nationalSectors = this.sectorData.filter(s => !s.regionName);
    const sectorTotalLoss = nationalSectors.reduce((sum, s) => sum + s.totalLoss, 0);
    const sectorTotalValue = nationalSectors.reduce((sum, s) => sum + s.totalValue, 0);

    const nationalLoss = this.nationalData?.totalLoss ?? 0;
    const nationalValue = this.nationalData?.totalValue ?? 0;

    const lossDiscrepancy = Math.abs(sectorTotalLoss - nationalLoss) / Math.max(nationalLoss, 1);
    const valueDiscrepancy =
      Math.abs(sectorTotalValue - nationalValue) / Math.max(nationalValue, 1);

    if (lossDiscrepancy > 0.01) {
      warnings.push(
        `Sector loss sum (${sectorTotalLoss.toFixed(0)}) differs from national (${nationalLoss.toFixed(0)}) by ${(lossDiscrepancy * 100).toFixed(1)}%`
      );
    }

    if (valueDiscrepancy > 0.01) {
      warnings.push(
        `Sector value sum (${sectorTotalValue.toFixed(0)}) differs from national (${nationalValue.toFixed(0)}) by ${(valueDiscrepancy * 100).toFixed(1)}%`
      );
    }

    // Check for missing regional data
    if (this.regionalData.size === 0) {
      errors.push('No regional data loaded');
    }

    // Check for blank population values
    let blankPopCount = 0;
    for (const region of this.regionalData.values()) {
      if (region.totalPopulation === 0) blankPopCount++;
    }
    if (blankPopCount > 0) {
      warnings.push(`${blankPopCount} regions have zero population`);
    }

    this.qualityReport = {
      isValid: errors.length === 0,
      warnings,
      errors,
      stats: {
        regionsLoaded: this.regionalData.size,
        sectorsLoaded: this.sectorData.length,
        nationalAggregateMatches: lossDiscrepancy < 0.01 && valueDiscrepancy < 0.01,
        sectorSumMatchesNational: lossDiscrepancy < 0.01,
      },
    };
  }

  /**
   * Safe number parser (handles strings, undefined, null, NaN)
   */
  private parseNumber(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalNormalizer: CSVDataNormalizer | null = null;

export function getDataNormalizer(): CSVDataNormalizer {
  if (!globalNormalizer) {
    globalNormalizer = new CSVDataNormalizer();
  }
  return globalNormalizer;
}

export async function initializeNormalizedData(rawData: {
  nationalSummary: any[];
  regionalSummary: any[];
  impactBySector: any[];
  regionalSummaryBySector?: any[];
}): Promise<CSVDataNormalizer> {
  const normalizer = getDataNormalizer();
  await normalizer.loadAll(rawData);

  // Log quality report in dev
  if (process.env.NODE_ENV === 'development') {
    const report = normalizer.getQualityReport();
    console.log('[Data Normalizer] Quality Report:', report);
    if (report.warnings.length > 0) {
      console.warn('[Data Normalizer] Warnings:', report.warnings);
    }
    if (report.errors.length > 0) {
      console.error('[Data Normalizer] Errors:', report.errors);
    }
  }

  return normalizer;
}
