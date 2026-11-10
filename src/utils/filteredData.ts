import { Event, ExposureData, EconomicDamageData, FilterState, District, Province } from '@/types';
import {
  filterEvents,
  filterExposureData,
  filterEconomicDamageData,
  aggregateEventsByLevel,
} from '@/utils/filterUtils';

interface FilteredDataArgs {
  events: Event[];
  exposureData?: ExposureData[];
  economicDamageData?: EconomicDamageData[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
}

/**
 * Computes filtered and aggregated data based on current filter state.
 *
 * Called via `getFilteredData` from `@/stores/filteredDataStore`, which
 * caches the result by input identity so DashboardView/BottomTabs/
 * SummaryPanel don't each recompute it independently on every filter
 * change. Call this directly only outside that shared-cache path (e.g.
 * one-off computations, tests).
 */
export function computeFilteredData({
  events,
  exposureData = [],
  economicDamageData = [],
  filters,
  districts,
  provinces,
}: FilteredDataArgs) {
  const filteredEvents = filterEvents(events, filters);
  const filteredExposureData = filterExposureData(exposureData, filters);
  const filteredEconomicDamageData = filterEconomicDamageData(economicDamageData, filters);
  const aggregatedEventData = aggregateEventsByLevel(
    filteredEvents,
    filters.aggregationLevel,
    districts,
    provinces
  );

  return {
    filteredEvents,
    filteredExposureData,
    filteredEconomicDamageData,
    aggregatedEventData,
  };
}
