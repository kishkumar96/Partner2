import { Event, ExposureData, EconomicDamageData, FilterState, District, Province, AggregationLevel } from "@/types";

/**
 * Aggregated data structure for events grouped by region
 */
export interface AggregatedEventData {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
  highRiskAreas: number;
}

/**
 * Checks if an item matches the selected hazards filter.
 * Returns true if no hazards are selected (show all) or if the item's hazardId is in the selection.
 */
function matchesHazardFilter(hazardId: string, selectedHazards: string[]): boolean {
  return selectedHazards.length === 0 || selectedHazards.includes(hazardId);
}

/**
 * Checks if an item matches the selected sectors filter.
 * Returns true if no sectors are selected (show all) or if the item's sectorId is in the selection.
 */
function matchesSectorFilter(sectorId: string, selectedSectors: string[]): boolean {
  return selectedSectors.length === 0 || selectedSectors.includes(sectorId);
}

/**
 * Filters events based on the current filter state.
 * @param events - Array of events to filter
 * @param filters - Current filter state
 * @returns Filtered array of events
 */
export function filterEvents(events: Event[], filters: FilterState): Event[] {
  return events.filter((event) => {
    // Filter by hazards and sectors using shared helpers
    if (!matchesHazardFilter(event.hazardId, filters.selectedHazards)) {
      return false;
    }
    if (!matchesSectorFilter(event.sectorId, filters.selectedSectors)) {
      return false;
    }
    // Filter by specific events
    if (
      filters.selectedEvents.length > 0 &&
      !filters.selectedEvents.includes(event.id)
    ) {
      return false;
    }
    // Filter by date range
    if (filters.dateRange.start && event.date < filters.dateRange.start) {
      return false;
    }
    if (filters.dateRange.end && event.date > filters.dateRange.end) {
      return false;
    }
    return true;
  });
}

/**
 * Filters exposure data based on selected hazards and sectors.
 * @param exposureData - Array of exposure data to filter
 * @param filters - Current filter state
 * @returns Filtered array of exposure data
 */
export function filterExposureData(
  exposureData: ExposureData[],
  filters: FilterState
): ExposureData[] {
  return exposureData.filter((exposure) => {
    return (
      matchesHazardFilter(exposure.hazardId, filters.selectedHazards) &&
      matchesSectorFilter(exposure.sectorId, filters.selectedSectors)
    );
  });
}

/**
 * Filters economic damage data based on selected hazards and sectors.
 * @param economicDamageData - Array of economic damage data to filter
 * @param filters - Current filter state
 * @returns Filtered array of economic damage data
 */
export function filterEconomicDamageData(
  economicDamageData: EconomicDamageData[],
  filters: FilterState
): EconomicDamageData[] {
  return economicDamageData.filter((damage) => {
    return (
      matchesHazardFilter(damage.hazardId, filters.selectedHazards) &&
      matchesSectorFilter(damage.sectorId, filters.selectedSectors)
    );
  });
}

/**
 * Computes aggregated metrics from a list of events in a single pass.
 * @param events - Array of events to aggregate
 * @returns Aggregated metrics object
 */
function computeAggregatedMetrics(events: Event[]): Omit<AggregatedEventData, 'id' | 'name'> {
  return events.reduce(
    (acc, e) => {
      acc.totalEvents += 1;
      acc.totalAffectedPopulation += e.affectedPopulation;
      acc.totalEconomicDamage += e.economicDamage;
      if (e.severity === "high" || e.severity === "critical") {
        acc.highRiskAreas += 1;
      }
      return acc;
    },
    { totalEvents: 0, totalAffectedPopulation: 0, totalEconomicDamage: 0, highRiskAreas: 0 }
  );
}

/**
 * Aggregates events by the specified aggregation level (district, province, or national).
 * @param events - Array of filtered events to aggregate
 * @param aggregationLevel - The level at which to aggregate
 * @param districts - Array of district reference data
 * @param provinces - Array of province reference data
 * @param includeEmpty - Whether to include regions with zero events (default: false)
 * @returns Array of aggregated event data
 */
export function aggregateEventsByLevel(
  events: Event[],
  aggregationLevel: AggregationLevel,
  districts: District[],
  provinces: Province[],
  includeEmpty: boolean = false
): AggregatedEventData[] {
  if (aggregationLevel === "national") {
    const metrics = computeAggregatedMetrics(events);
    return [{
      id: "national",
      name: "National",
      ...metrics,
    }];
  } else if (aggregationLevel === "province") {
    const result = provinces.map((province) => {
      const provinceEvents = events.filter((e) => e.provinceId === province.id);
      const metrics = computeAggregatedMetrics(provinceEvents);
      return {
        id: province.id,
        name: province.name,
        ...metrics,
      };
    });
    return includeEmpty ? result : result.filter(d => d.totalEvents > 0);
  } else {
    const result = districts.map((district) => {
      const districtEvents = events.filter((e) => e.districtId === district.id);
      const metrics = computeAggregatedMetrics(districtEvents);
      return {
        id: district.id,
        name: district.name,
        ...metrics,
      };
    });
    return includeEmpty ? result : result.filter(d => d.totalEvents > 0);
  }
}
