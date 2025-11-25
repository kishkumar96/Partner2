import { Event, ExposureData, EconomicDamageData, FilterState } from "@/types";

/**
 * Filters events based on the current filter state.
 * @param events - Array of events to filter
 * @param filters - Current filter state
 * @returns Filtered array of events
 */
export function filterEvents(events: Event[], filters: FilterState): Event[] {
  return events.filter((event) => {
    // Filter by hazards
    if (
      filters.selectedHazards.length > 0 &&
      !filters.selectedHazards.includes(event.hazardId)
    ) {
      return false;
    }
    // Filter by sectors
    if (
      filters.selectedSectors.length > 0 &&
      !filters.selectedSectors.includes(event.sectorId)
    ) {
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
    // Filter by hazards
    if (
      filters.selectedHazards.length > 0 &&
      !filters.selectedHazards.includes(exposure.hazardId)
    ) {
      return false;
    }
    // Filter by sectors
    if (
      filters.selectedSectors.length > 0 &&
      !filters.selectedSectors.includes(exposure.sectorId)
    ) {
      return false;
    }
    return true;
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
    // Filter by hazards
    if (
      filters.selectedHazards.length > 0 &&
      !filters.selectedHazards.includes(damage.hazardId)
    ) {
      return false;
    }
    // Filter by sectors
    if (
      filters.selectedSectors.length > 0 &&
      !filters.selectedSectors.includes(damage.sectorId)
    ) {
      return false;
    }
    return true;
  });
}
