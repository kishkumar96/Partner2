import { create } from 'zustand';
import { computeFilteredData } from '@/utils/filteredData';
import type {
  Event,
  ExposureData,
  EconomicDamageData,
  FilterState,
  District,
  Province,
} from '@/types';

/**
 * First-slice implementation of the store proposed in
 * src/stores/ARCHITECTURE_PROPOSAL.md: DashboardView, SummaryPanel, and
 * BottomTabs each independently ran computeFilteredData() with identical
 * inputs on every filter change. This caches the last result by input
 * identity so the computation runs once per change instead of once per
 * subscriber, without requiring those components to change how they
 * receive their other props.
 */

interface FilteredDataArgs {
  events: Event[];
  exposureData?: ExposureData[];
  economicDamageData?: EconomicDamageData[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
}

type FilteredDataResult = ReturnType<typeof computeFilteredData>;

interface FilteredDataStore {
  lastArgs: FilteredDataArgs | null;
  lastResult: FilteredDataResult | null;
  getFilteredData: (args: FilteredDataArgs) => FilteredDataResult;
}

function argsEqual(a: FilteredDataArgs | null, b: FilteredDataArgs): boolean {
  if (!a) return false;
  return (
    a.events === b.events &&
    a.exposureData === b.exposureData &&
    a.economicDamageData === b.economicDamageData &&
    a.filters === b.filters &&
    a.districts === b.districts &&
    a.provinces === b.provinces
  );
}

export const useFilteredDataStore = create<FilteredDataStore>((set, get) => ({
  lastArgs: null,
  lastResult: null,

  getFilteredData: args => {
    const { lastArgs, lastResult } = get();
    if (lastResult && argsEqual(lastArgs, args)) {
      return lastResult;
    }
    const result = computeFilteredData(args);
    set({ lastArgs: args, lastResult: result });
    return result;
  },
}));

/** Convenience non-hook accessor for use inside useMemo/callbacks. */
export function getFilteredData(args: FilteredDataArgs): FilteredDataResult {
  return useFilteredDataStore.getState().getFilteredData(args);
}
