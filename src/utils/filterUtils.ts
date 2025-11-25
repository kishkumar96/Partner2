import { Event, ExposureData, EconomicDamageData, FilterState } from "@/types";

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
