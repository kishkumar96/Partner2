# 🏗️ Improved State Management Architecture

> **Status:** Phase 1's core problem (duplicated `computeFilteredData` calls)
> is fixed — see `src/stores/filteredDataStore.ts`, wired into
> `DashboardView.tsx`, `SummaryPanel.tsx`, and `BottomTabs.tsx` (not
> `MapView.tsx`, which never actually called `computeFilteredData`; that
> was a hypothetical in the original write-up below). It's a targeted
> cache keyed by input identity, not the full `DataStore`
> shape sketched below — this app's real `Event`/`District`/`Province`
> types (`src/types/index.ts`) don't carry per-event `lat`/`lng` at the
> granularity the spatial-index section assumes, and no map-viewport
> filtering requirement has actually been requested, so Phases 2-4 below
> (viewport integration, KDBush spatial indexing, full component
> migration) are still just proposed, not started. Treat the code below
> as the original design sketch, not a description of what's shipped.

## Current Problems

### 1. Scattered State & Duplicated Computations

```typescript
// ❌ CURRENT: Multiple components independently compute the same data
// In SummaryPanel.tsx:
const { filteredEvents } = useMemo(() =>
  computeFilteredData({ events, filters, ... }),
  [events, filters]
);

// In MapView.tsx (hypothetically):
const { filteredEvents } = useMemo(() =>
  computeFilteredData({ events, filters, ... }),
  [events, filters]
);
// ^ Same computation runs twice on every filter change!
```

### 2. No Map Viewport Integration

```typescript
// ❌ CURRENT: Map pans/zooms but data doesn't update
// User sees all districts, not just the ones in view
const filteredEvents = filterEvents(allEvents, filters);

// ✅ NEEDED: Filter by what's visible
const filteredEvents = filterEvents(allEvents, { ...filters, mapBounds: currentViewport });
```

### 3. Inefficient Array Scanning

```typescript
// ❌ CURRENT: O(n) scan on every filter change
return events.filter(
  e => selectedDistricts.includes(e.districtId) && selectedHazards.includes(e.hazardId)
); // Scans all 10,000 events

// ✅ NEEDED: O(1) lookup from pre-indexed data
return selectedDistricts.flatMap(id => eventsByDistrict.get(id) || []); // Instant lookup
```

## Proposed Solution: Zustand Store

### Implementation

```typescript
// stores/dataStore.ts
import { create } from 'zustand';
import { Event, FilterState, District, Province } from '@/types';
import KDBush from 'kdbush';

// Pre-computed indexes for fast lookups
interface EventIndexes {
  byDistrict: Map<string, Event[]>;
  byProvince: Map<string, Event[]>;
  byHazard: Map<string, Event[]>;
  bySector: Map<string, Event[]>;
  spatial: KDBush<Event> | null;
}

interface MapViewport {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

interface DataStore {
  // =============== RAW DATA ===============
  events: Event[];
  districts: District[];
  provinces: Province[];

  // =============== PRE-COMPUTED INDEXES ===============
  indexes: EventIndexes;

  // =============== FILTER STATE ===============
  filters: FilterState;
  mapViewport: MapViewport | null;
  selectedRegion: string | null;

  // =============== DERIVED STATE (Selectors) ===============
  // These are computed only once per state change, not per component
  getFilteredEvents: () => Event[];
  getVisibleEvents: () => Event[]; // Filtered + in viewport
  getAggregatedData: () => AggregatedEventData[];
  getDistrictStats: (districtId: string) => DistrictStats | null;

  // =============== ACTIONS ===============
  loadData: (events: Event[], districts: District[], provinces: Province[]) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setMapViewport: (viewport: MapViewport) => void;
  setSelectedRegion: (regionId: string | null) => void;
  clearFilters: () => void;
}

// Build indexes once when data loads
function buildIndexes(events: Event[]): EventIndexes {
  const indexes: EventIndexes = {
    byDistrict: new Map(),
    byProvince: new Map(),
    byHazard: new Map(),
    bySector: new Map(),
    spatial: null,
  };

  // Group events by various dimensions
  events.forEach(event => {
    // By district
    if (!indexes.byDistrict.has(event.districtId)) {
      indexes.byDistrict.set(event.districtId, []);
    }
    indexes.byDistrict.get(event.districtId)!.push(event);

    // By province
    if (!indexes.byProvince.has(event.provinceId)) {
      indexes.byProvince.set(event.provinceId, []);
    }
    indexes.byProvince.get(event.provinceId)!.push(event);

    // By hazard
    if (!indexes.byHazard.has(event.hazardId)) {
      indexes.byHazard.set(event.hazardId, []);
    }
    indexes.byHazard.get(event.hazardId)!.push(event);

    // By sector
    if (!indexes.bySector.has(event.sectorId)) {
      indexes.bySector.set(event.sectorId, []);
    }
    indexes.bySector.get(event.sectorId)!.push(event);
  });

  // Build spatial index for fast bounding box queries
  if (events.length > 0) {
    indexes.spatial = new KDBush(
      events,
      e => e.location.lng,
      e => e.location.lat,
      64 // Node size
    );
  }

  return indexes;
}

// Fast filtering using pre-built indexes
function fastFilterEvents(
  allEvents: Event[],
  filters: FilterState,
  indexes: EventIndexes,
  viewport: MapViewport | null,
  selectedRegion: string | null
): Event[] {
  // Start with base set
  let candidates = allEvents;

  // Filter by region (fastest - most restrictive)
  if (selectedRegion && indexes.byDistrict.has(selectedRegion)) {
    candidates = indexes.byDistrict.get(selectedRegion)!;
  }

  // Filter by hazards (use index if available)
  if (filters.selectedHazards.length > 0) {
    const hazardEvents = filters.selectedHazards.flatMap(
      hazardId => indexes.byHazard.get(hazardId) || []
    );
    candidates = candidates.filter(e => hazardEvents.includes(e));
  }

  // Filter by sectors (use index if available)
  if (filters.selectedSectors.length > 0) {
    const sectorEvents = filters.selectedSectors.flatMap(
      sectorId => indexes.bySector.get(sectorId) || []
    );
    candidates = candidates.filter(e => sectorEvents.includes(e));
  }

  // Filter by map viewport (spatial query)
  if (viewport && indexes.spatial) {
    const visibleIndices = indexes.spatial.range(
      viewport.west,
      viewport.south,
      viewport.east,
      viewport.north
    );
    const visibleEvents = visibleIndices.map(i => allEvents[i]);
    candidates = candidates.filter(e => visibleEvents.includes(e));
  }

  // Date range filter (only if specified)
  if (filters.dateRange.start || filters.dateRange.end) {
    candidates = candidates.filter(e => {
      const eventDate = new Date(e.date).getTime();
      const startDate = filters.dateRange.start
        ? new Date(filters.dateRange.start).getTime()
        : -Infinity;
      const endDate = filters.dateRange.end ? new Date(filters.dateRange.end).getTime() : Infinity;
      return eventDate >= startDate && eventDate <= endDate;
    });
  }

  return candidates;
}

// Create the store
export const useDataStore = create<DataStore>((set, get) => ({
  // Initial state
  events: [],
  districts: [],
  provinces: [],
  indexes: {
    byDistrict: new Map(),
    byProvince: new Map(),
    byHazard: new Map(),
    bySector: new Map(),
    spatial: null,
  },
  filters: {
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: '', end: '' },
    aggregationLevel: 'district',
  },
  mapViewport: null,
  selectedRegion: null,

  // Selectors (derived state)
  getFilteredEvents: () => {
    const { events, filters, indexes, mapViewport, selectedRegion } = get();
    return fastFilterEvents(events, filters, indexes, mapViewport, selectedRegion);
  },

  getVisibleEvents: () => {
    const { events, mapViewport, indexes } = get();
    if (!mapViewport || !indexes.spatial) return events;

    const visibleIndices = indexes.spatial.range(
      mapViewport.west,
      mapViewport.south,
      mapViewport.east,
      mapViewport.north
    );
    return visibleIndices.map(i => events[i]);
  },

  getAggregatedData: () => {
    const { getFilteredEvents, filters, districts, provinces } = get();
    const filtered = getFilteredEvents();
    return aggregateEventsByLevel(filtered, filters.aggregationLevel, districts, provinces);
  },

  getDistrictStats: (districtId: string) => {
    const { indexes } = get();
    const districtEvents = indexes.byDistrict.get(districtId);
    if (!districtEvents) return null;

    return {
      totalEvents: districtEvents.length,
      totalDamage: districtEvents.reduce((sum, e) => sum + e.economicDamage, 0),
      totalPopulation: districtEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
    };
  },

  // Actions
  loadData: (events, districts, provinces) => {
    const indexes = buildIndexes(events);
    set({ events, districts, provinces, indexes });
  },

  setFilter: filter =>
    set(state => ({
      filters: { ...state.filters, ...filter },
    })),

  setMapViewport: viewport => set({ mapViewport: viewport }),

  setSelectedRegion: regionId => set({ selectedRegion: regionId }),

  clearFilters: () =>
    set({
      filters: {
        selectedHazards: [],
        selectedSectors: [],
        selectedEvents: [],
        dateRange: { start: '', end: '' },
        aggregationLevel: 'district',
      },
      selectedRegion: null,
    }),
}));
```

### Component Usage (After Migration)

```typescript
// ✅ SummaryPanel.tsx
function SummaryPanel() {
  // Subscribe only to the data you need
  const filteredEvents = useDataStore(state => state.getFilteredEvents());
  const aggregatedData = useDataStore(state => state.getAggregatedData());
  const setFilter = useDataStore(state => state.setFilter);

  // No more useMemo, no more prop drilling
  return (
    <div>
      <h2>Total Events: {filteredEvents.length}</h2>
      {/* ... */}
    </div>
  );
}

// ✅ MapView.tsx
function MapView() {
  const visibleEvents = useDataStore(state => state.getVisibleEvents());
  const setMapViewport = useDataStore(state => state.setMapViewport);
  const mapRef = useRef<maplibregl.Map>();

  // Update store when map moves
  const handleMapMove = useCallback(() => {
    const bounds = mapRef.current?.getBounds();
    if (bounds) {
      setMapViewport({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: mapRef.current?.getZoom() || 0,
      });
    }
  }, [setMapViewport]);

  useEffect(() => {
    mapRef.current?.on('moveend', handleMapMove);
    return () => mapRef.current?.off('moveend', handleMapMove);
  }, [handleMapMove]);

  return <Map events={visibleEvents} />;
}

// ✅ FilterPanel.tsx
function FilterPanel() {
  const filters = useDataStore(state => state.filters);
  const setFilter = useDataStore(state => state.setFilter);

  return (
    <div>
      <button onClick={() => setFilter({ selectedHazards: ['cyclone'] })}>
        Show Cyclones
      </button>
      {/* ... */}
    </div>
  );
}

// ✅ page.tsx (now much simpler!)
function Page() {
  const loadData = useDataStore(state => state.loadData);

  useEffect(() => {
    // Load data once on mount
    loadAllRealData().then(data => {
      loadData(data.events, districts, provinces);
    });
  }, [loadData]);

  // No more passing props to every component!
  return (
    <div>
      <FilterPanel />
      <MapView />
      <SummaryPanel />
    </div>
  );
}
```

## Migration Steps

### Phase 1: Setup Store (1-2 days)

1. `npm install zustand kdbush`
2. Create `src/stores/dataStore.ts` with the code above
3. Migrate `loadData` function to use `useDataStore().loadData()`

### Phase 2: Migrate Components (2-3 days)

1. **FilterPanel**: Replace local filter state with `useDataStore`
2. **SummaryPanel**: Replace `useMemo(computeFilteredData)` with store selectors
3. **MapView**: Add viewport tracking with `setMapViewport`
4. Remove filter props from component interfaces

### Phase 3: Add Viewport Filtering (1 day)

1. Integrate `mapViewport` into filtering logic
2. Test performance with large datasets
3. Add viewport reset on filter changes (optional)

### Phase 4: Cleanup (1 day)

1. Remove old `computeFilteredData` function
2. Remove `FilterState` from component props
3. Update tests to use store directly

## Expected Results

### Performance Improvements

| Operation          | Before (O(n)) | After (Indexed) | Speedup         |
| ------------------ | ------------- | --------------- | --------------- |
| Filter by District | 50-200ms      | 1-5ms           | **40-200x**     |
| Viewport Query     | N/A           | 0.5-2ms         | **New feature** |
| Aggregation        | 100-300ms     | 10-30ms         | **10-30x**      |

### Code Quality Improvements

- ✅ Single source of truth for all state
- ✅ No prop drilling (15+ fewer prop types)
- ✅ Easier testing (mock store instead of components)
- ✅ Better TypeScript inference
- ✅ Automatic re-rendering optimization

### New Features Enabled

- ✅ Viewport-based filtering ("Show only visible data")
- ✅ Persistent filter state (localStorage sync)
- ✅ Undo/redo filter history
- ✅ Real-time collaboration (via state sync)

## Questions?

Contact the architecture team or see:

- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [KDBush Documentation](https://github.com/mourner/kdbush)
