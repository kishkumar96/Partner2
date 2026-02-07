import {
  Event,
  ExposureData,
  EconomicDamageData,
  FilterState,
  District,
  Province,
} from "@/types";
import {
  filterEvents,
  filterExposureData,
  filterEconomicDamageData,
  aggregateEventsByLevel,
} from "@/utils/filterUtils";

interface FilteredDataArgs {
  events: Event[];
  exposureData?: ExposureData[];
  economicDamageData?: EconomicDamageData[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
}

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
  const filteredEconomicDamageData = filterEconomicDamageData(
    economicDamageData,
    filters
  );
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
