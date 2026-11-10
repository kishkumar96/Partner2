import type { District, Event, FilterState, Province } from '@/types';
import { useFilteredDataStore, getFilteredData } from '@/stores/filteredDataStore';

const districts: District[] = [];
const provinces: Province[] = [];

const filters: FilterState = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'national',
};

const events: Event[] = [
  {
    id: 'evt-1',
    name: 'Test Cyclone',
    date: '2020-01-01',
    hazardId: 'tropical-cyclone',
    location: { lat: 0, lng: 0 },
    severity: 'high',
    totalAffectedPopulation: 100,
    totalEconomicDamage: 1000,
    affectedRegions: 1,
  },
];

describe('filteredDataStore', () => {
  beforeEach(() => {
    useFilteredDataStore.setState({ lastArgs: null, lastResult: null });
  });

  it('reuses the cached result object when called again with the same input references', () => {
    const first = getFilteredData({ events, filters, districts, provinces });
    const second = getFilteredData({ events, filters, districts, provinces });

    expect(second).toBe(first);
    expect(second.filteredEvents).toBe(first.filteredEvents);
  });

  it('recomputes a fresh result when an input reference changes', () => {
    const first = getFilteredData({ events, filters, districts, provinces });
    const otherFilters: FilterState = { ...filters, selectedHazards: ['flood'] };
    const second = getFilteredData({ events, filters: otherFilters, districts, provinces });

    expect(second).not.toBe(first);
  });
});
