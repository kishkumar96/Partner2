import {
  Event,
  ExposureData,
  EconomicDamageData,
  FilterState,
  District,
  Province,
  AggregationLevel,
} from '@/types';
import { normalizeHazardId, normalizeHazardIds } from '@/utils/hazardIds';

/**
 * Aggregated data structure for events grouped by region
 */
export interface AggregatedEventData {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
}

function getEventAggregationKey(
  event: Event,
  aggregationLevel: Exclude<AggregationLevel, 'national'>
): string | null {
  if (aggregationLevel === 'province') {
    return event.provinceId || event.regionalImpacts?.[0]?.regionId || null;
  }
  return event.districtId || event.regionalImpacts?.[0]?.regionId || null;
}

function getFallbackAggregationName(
  event: Event,
  aggregationLevel: Exclude<AggregationLevel, 'national'>,
  fallbackId: string
): string {
  const regionalName = event.regionalImpacts?.[0]?.regionName?.trim();
  if (regionalName) return regionalName;

  const eventName = event.name?.trim();
  if (!eventName) return fallbackId;

  const withoutSectorSuffix = eventName.replace(/\s*\([^)]+\)\s*$/, '');
  const nameParts = withoutSectorSuffix.split(' - ');

  if (nameParts.length > 1) {
    return nameParts.slice(1).join(' - ') || fallbackId;
  }

  if (aggregationLevel === 'district') {
    return withoutSectorSuffix || fallbackId;
  }

  return eventName;
}

function aggregateEventsFromEventData(
  events: Event[],
  aggregationLevel: Exclude<AggregationLevel, 'national'>
): AggregatedEventData[] {
  const grouped = new Map<string, AggregatedEventData>();

  events.forEach(event => {
    const key = getEventAggregationKey(event, aggregationLevel);
    if (!key) return;

    const existing = grouped.get(key);
    if (existing) {
      existing.totalEvents += 1;
      existing.totalAffectedPopulation += event.totalAffectedPopulation || 0;
      existing.totalEconomicDamage += event.totalEconomicDamage || 0;
      return;
    }

    grouped.set(key, {
      id: key,
      name: getFallbackAggregationName(event, aggregationLevel, key),
      totalEvents: 1,
      totalAffectedPopulation: event.totalAffectedPopulation || 0,
      totalEconomicDamage: event.totalEconomicDamage || 0,
    });
  });

  return Array.from(grouped.values());
}

/**
 * Checks if an item matches the selected hazards filter.
 * Returns true if no hazards are selected (show all) or if the item's hazardId is in the selection.
 */
function matchesHazardFilter(hazardId: string, selectedHazards: string[]): boolean {
  if (selectedHazards.length === 0) return true;
  const normalizedHazardId = normalizeHazardId(hazardId);
  const normalizedSelectedHazards = normalizeHazardIds(selectedHazards);
  return normalizedSelectedHazards.includes(normalizedHazardId);
}

/**
 * Checks if an item matches the selected sectors filter.
 * Returns true if no sectors are selected (show all) or if the item's sectorId is in the selection.
 */
function matchesSectorFilter(sectorId: string, selectedSectors: string[]): boolean {
  return selectedSectors.length === 0 || selectedSectors.includes(sectorId);
}

/**
 * Validates if a date string is in ISO format (YYYY-MM-DD)
 * FIX: Prevent incorrect date filtering for non-ISO formats
 */
function isValidISODate(dateStr: string): boolean {
  if (!dateStr) return false;
  // Check format YYYY-MM-DD
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) return false;
  // Validate it's a real date
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Normalizes a date string to ISO format (YYYY-MM-DD)
 * Handles various date formats and converts them to ISO
 * @param dateStr - Date string in any format
 * @returns ISO formatted date string or empty string if invalid
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';

  // If already in ISO format, return as-is
  if (isValidISODate(dateStr)) return dateStr;

  // Try to parse the date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return ''; // Invalid date

  // Convert to ISO format (YYYY-MM-DD)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeFilterDateRange(dateRange: FilterState['dateRange']): {
  start: string;
  end: string;
} {
  const start = normalizeDate(dateRange.start);
  const end = normalizeDate(dateRange.end);

  if (start && end && start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}

function matchesEventSelection(
  itemId: string | undefined,
  parentEventId: string | undefined,
  selectedEvents: string[]
): boolean {
  if (selectedEvents.length === 0) return true;
  if (itemId && selectedEvents.includes(itemId)) return true;
  if (parentEventId && selectedEvents.includes(parentEventId)) return true;
  return false;
}

function matchesDateRange(
  eventDate: string | undefined,
  dateRange: FilterState['dateRange']
): boolean {
  const { start, end } = normalizeFilterDateRange(dateRange);
  if (!start && !end) return true;

  const normalizedEventDate = normalizeDate(eventDate || '');
  if (!normalizedEventDate) return true;

  if (start && normalizedEventDate < start) {
    return false;
  }
  if (end && normalizedEventDate > end) {
    return false;
  }

  return true;
}

/**
 * Filters events based on the current filter state.
 * @param events - Array of events to filter
 * @param filters - Current filter state
 * @returns Filtered array of events
 */
export function filterEvents(events: Event[], filters: FilterState): Event[] {
  return events.filter(event => {
    // Filter by hazards and sectors using shared helpers
    if (!matchesHazardFilter(event.hazardId, filters.selectedHazards)) {
      return false;
    }
    if (!matchesSectorFilter(event.sectorId || '', filters.selectedSectors)) {
      return false;
    }
    // Filter by specific events
    // Also check parentEventId so expanded/regional events (which have regional IDs)
    // are correctly matched against their master event ID.
    if (!matchesEventSelection(event.id, event.parentEventId, filters.selectedEvents)) {
      return false;
    }
    if (!matchesDateRange(event.date, filters.dateRange)) {
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
  return exposureData.filter(exposure => {
    return (
      matchesHazardFilter(exposure.hazardId, filters.selectedHazards) &&
      matchesSectorFilter(exposure.sectorId, filters.selectedSectors) &&
      matchesEventSelection(exposure.eventId, undefined, filters.selectedEvents) &&
      matchesDateRange(exposure.eventDate, filters.dateRange)
    );
  });
}

/**
 * Filters economic damage data based on selected hazards, sectors, and date range.
 * @param economicDamageData - Array of economic damage data to filter
 * @param filters - Current filter state
 * @returns Filtered array of economic damage data
 */
export function filterEconomicDamageData(
  economicDamageData: EconomicDamageData[],
  filters: FilterState
): EconomicDamageData[] {
  return economicDamageData.filter(damage => {
    // Hazard and sector filtering
    if (!matchesHazardFilter(damage.hazardId, filters.selectedHazards)) return false;
    if (!matchesSectorFilter(damage.sectorId, filters.selectedSectors)) return false;
    if (!matchesEventSelection(damage.eventId, undefined, filters.selectedEvents)) return false;

    if (damage.eventDate) {
      if (!matchesDateRange(damage.eventDate, filters.dateRange)) return false;
    } else if (filters.dateRange.start || filters.dateRange.end) {
      // Fall back to year-only filtering for legacy rows that don't carry exact event dates.
      const dataYear = damage.year;
      const { start, end } = normalizeFilterDateRange(filters.dateRange);
      const startYear = start ? new Date(start).getFullYear() : 0;
      const endYear = end ? new Date(end).getFullYear() : 9999;
      if (dataYear < startYear || dataYear > endYear) return false;
    }

    return true;
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
      acc.totalAffectedPopulation += e.totalAffectedPopulation || 0;
      acc.totalEconomicDamage += e.totalEconomicDamage || 0;
      return acc;
    },
    { totalEvents: 0, totalAffectedPopulation: 0, totalEconomicDamage: 0 }
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
  includeEmpty: boolean = true
): AggregatedEventData[] {
  if (aggregationLevel === 'national') {
    const metrics = computeAggregatedMetrics(events);
    return [
      {
        id: 'national',
        name: 'National',
        ...metrics,
      },
    ];
  } else if (aggregationLevel === 'province') {
    if (provinces.length === 0) {
      return aggregateEventsFromEventData(events, 'province');
    }

    const result = provinces.map(province => {
      const provinceEvents = events.filter(e => e.provinceId === province.id);
      const metrics = computeAggregatedMetrics(provinceEvents);
      return {
        id: province.id,
        name: province.name,
        ...metrics,
      };
    });
    const populated = includeEmpty ? result : result.filter(d => d.totalEvents > 0);
    return populated.length > 0 ? populated : aggregateEventsFromEventData(events, 'province');
  } else {
    if (districts.length === 0) {
      return aggregateEventsFromEventData(events, 'district');
    }

    const result = districts.map(district => {
      const districtEvents = events.filter(e => e.districtId === district.id);
      const metrics = computeAggregatedMetrics(districtEvents);
      return {
        id: district.id,
        name: district.name,
        ...metrics,
      };
    });
    const populated = includeEmpty ? result : result.filter(d => d.totalEvents > 0);
    return populated.length > 0 ? populated : aggregateEventsFromEventData(events, 'district');
  }
}
