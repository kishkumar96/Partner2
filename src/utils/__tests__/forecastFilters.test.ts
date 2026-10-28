import { filtersShownFor } from '../forecastFilters';
import type { FilterState } from '@/types';

const chosen: FilterState = {
  selectedHazards: ['flood'],
  selectedSectors: ['housing'],
  selectedEvents: ['12'],
  dateRange: { start: '2026-01-01', end: '2026-02-01' },
  aggregationLevel: 'district',
};

describe('filtersShownFor', () => {
  it('lists none of the observed-event filters for a forecast, which ignores them', () => {
    expect(filtersShownFor('forecast', chosen)).toEqual({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: '', end: '' },
      aggregationLevel: 'district',
    });
  });

  it('leaves the filters of every other mode as they are', () => {
    for (const mode of ['assessment', 'scenarios', 'history'] as const) {
      expect(filtersShownFor(mode, chosen)).toBe(chosen);
    }
  });

  it('does not change the stored filters, so another mode finds them as left', () => {
    filtersShownFor('forecast', chosen);
    expect(chosen.selectedSectors).toEqual(['housing']);
    expect(chosen.dateRange.start).toBe('2026-01-01');
  });
});
