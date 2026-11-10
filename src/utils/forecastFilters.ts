import type { AnalysisMode } from '@/components/AnalysisModeSwitch';
import type { FilterState } from '@/types';

/**
 * The filters to describe to the user (chips, status line) for a mode.
 *
 * A forecast reads one model run's exposure directly, so hazard, sector, event and date
 * selections left over from another mode don't change its figures. Listing them as active
 * would say they do; they stay in state, so coming back to another mode finds them as left.
 */
export function filtersShownFor(mode: AnalysisMode, filters: FilterState): FilterState {
  if (mode !== 'forecast') return filters;
  return {
    ...filters,
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: '', end: '' },
  };
}
