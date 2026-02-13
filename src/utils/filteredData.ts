/**
 * =============================================================================
 * ARCHITECTURAL CRITIQUE: Map State & Data Filtering
 * =============================================================================
 * 
 * CURRENT IMPLEMENTATION STRENGTHS:
 * Clear separation of concerns with dedicated filtering utilities
 * Type-safe with TypeScript interfaces
 * Pure functions that are predictable and testable
 * Leverages useMemo in calling components for memoization
 * 
 * CRITICAL LIMITATIONS & RECOMMENDED IMPROVEMENTS:
 * 
 * 1. LINEAR ARRAY SCANNING - PERFORMANCE BOTTLENECK
 *    Problem: Every filter change triggers O(n) scan of entire events array.
 *    With 1000s of events, this causes UI lag on filter interactions.
 *    
 *    Solution: PRE-INDEX DATA FOR O(1) LOOKUPS
 *    ```typescript
 *    // Run once on data load:
 *    const eventIndexes = {
 *      byDistrict: new Map<string, Event[]>(),
 *      byProvince: new Map<string, Event[]>(),
 *      byHazard: new Map<string, Event[]>(),
 *      bySector: new Map<string, Event[]>(),
 *    };
 *    
 *    events.forEach(event => {
 *      if (!eventIndexes.byDistrict.has(event.districtId)) {
 *        eventIndexes.byDistrict.set(event.districtId, []);
 *      }
 *      eventIndexes.byDistrict.get(event.districtId)!.push(event);
 *      // Repeat for province, hazard, sector...
 *    });
 *    
 *    // Then filtering becomes instant:
 *    const filtered = selectedDistrictIds.flatMap(id => 
 *      eventIndexes.byDistrict.get(id) || []
 *    );
 *    ```
 * 
 * 2. NO MAP VIEWPORT AWARENESS - MISSING GEOSPATIAL CONTEXT
 *    Problem: Filtering ignores what's actually visible on the map. User pans/zooms
 *    but data doesn't update to reflect current view. This is a major UX gap for
 *    a map-centric application.
 *    
 *    Solution: INTEGRATE MAP BOUNDS INTO FILTER STATE
 *    ```typescript
 *    interface FilterState {
 *      // ... existing filters
 *      mapBounds?: {
 *        north: number;
 *        south: number;
 *        east: number;
 *        west: number;
 *      };
 *    }
 *    
 *    // For performance with large datasets, use spatial indexing:
 *    import KDBush from 'kdbush';
 *    
 *    const spatialIndex = new KDBush(
 *      events,
 *      (e) => e.location.lng,
 *      (e) => e.location.lat
 *    );
 *    
 *    // Fast bounding box query:
 *    const visibleIds = spatialIndex.range(
 *      bounds.west, bounds.south,
 *      bounds.east, bounds.north
 *    );
 *    const visibleEvents = visibleIds.map(i => events[i]);
 *    ```
 * 
 * 3. SCATTERED STATE MANAGEMENT - DUPLICATED LOGIC
 *    Problem: Filter state lives in page.tsx, but multiple components (SummaryPanel,
 *    MapView, etc.) independently recalculate filtered data using useMemo. This causes:
 *    - Duplicated filtering logic across components
 *    - Multiple recalculations of the same filtered dataset
 *    - No single source of truth for derived data
 *    
 *    Solution: CENTRALIZED STATE STORE WITH SELECTORS
 *    ```typescript
 *    // stores/dataStore.ts
 *    import { create } from 'zustand';
 *    
 *    interface DataStore {
 *      // Raw data
 *      events: Event[];
 *      districts: District[];
 *      
 *      // Filter state
 *      filters: FilterState;
 *      
 *      // Pre-computed indexes (set once on data load)
 *      indexes: EventIndexes;
 *      
 *      // Derived/computed state (auto-computed via selectors)
 *      getFilteredEvents: () => Event[];
 *      getAggregatedData: () => AggregatedEventData[];
 *      
 *      // Actions
 *      setFilter: (filter: Partial<FilterState>) => void;
 *      loadData: (events: Event[]) => void;
 *    }
 *    
 *    export const useDataStore = create<DataStore>((set, get) => ({
 *      events: [],
 *      filters: initialFilters,
 *      indexes: {},
 *      
 *      getFilteredEvents: () => {
 *        const { events, filters, indexes } = get();
 *        // Use indexes for O(1) filtering
 *        return fastFilterEvents(events, filters, indexes);
 *      },
 *      
 *      setFilter: (filter) => set((state) => ({
 *        filters: { ...state.filters, ...filter }
 *      })),
 *      
 *      loadData: (events) => {
 *        const indexes = buildEventIndexes(events);
 *        set({ events, indexes });
 *      }
 *    }));
 *    
 *    // Usage in components:
 *    const filteredEvents = useDataStore(state => state.getFilteredEvents());
 *    const setFilter = useDataStore(state => state.setFilter);
 *    ```
 *    
 *    Benefits:
 *    - Single calculation per filter change (not per component)
 *    - Components automatically re-render when relevant data changes
 *    - No prop drilling for filter state
 *    - Easier testing and debugging
 * 
 * 4. INEFFICIENT AGGREGATION
 *    Problem: aggregateEventsByLevel() iterates through ALL districts/provinces
 *    even if they have no events (includeEmpty=true default).
 *    
 *    Solution: Build aggregation map from events directly:
 *    ```typescript
 *    const aggregationMap = new Map<string, AggregatedMetrics>();
 *    events.forEach(event => {
 *      const key = event[aggregationKey]; // districtId, provinceId, etc.
 *      if (!aggregationMap.has(key)) {
 *        aggregationMap.set(key, createEmptyMetrics());
 *      }
 *      accumulate(aggregationMap.get(key)!, event);
 *    });
 *    ```
 * 
 * 5. DATE FILTERING WITH STRING NORMALIZATION
 *    Problem: Date normalization on every filter call is inefficient.
 *    
 *    Solution: Normalize dates once during data ingestion:
 *    ```typescript
 *    const processedEvents = rawEvents.map(e => ({
 *      ...e,
 *      date: normalizeDate(e.date), // Do once, not on every filter
 *      timestamp: new Date(e.date).getTime() // For range queries
 *    }));
 *    ```
 * 
 * IMPLEMENTATION PRIORITY:
 * Phase 1 (Critical - Do First):
 *   - Adopt Zustand or Context+useReducer for centralized state
 *   - Pre-index events by district/province/hazard/sector on data load
 * 
 * Phase 2 (High Priority):
 *   - Add spatial indexing (KDBush) for map viewport filtering
 *   - Integrate map bounds into FilterState
 *   - Update MapView to dispatch bounds changes to store
 * 
 * Phase 3 (Optimization):
 *   - Normalize dates during data ingestion
 *   - Implement virtual scrolling for large result sets
 *   - Add Web Workers for heavy filtering operations
 * 
 * ESTIMATED PERFORMANCE GAINS:
 * - Current: ~50-200ms filter operations with 1000 events
 * - With indexing: ~1-5ms filter operations (40-200x faster)
 * - With spatial indexing: Sub-millisecond viewport queries
 * 
 * =============================================================================
 */

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

/**
 * Computes filtered and aggregated data based on current filter state.
 * 
 * CURRENT LIMITATIONS:
 * 1. O(n) complexity - scans entire array on each filter change
 * 2. Called independently by multiple components (duplicated work)
 * 3. No spatial/geographic filtering based on map viewport
 * 4. Re-aggregates all districts even if only a few have events
 * 
 * MIGRATION PATH:
 * This function should be converted into a selector/computed property
 * in a centralized store. Components would subscribe to the store and
 * automatically receive updates when filters change, with computation
 * happening only once per change.
 * 
 * @example
 * // Current usage (inefficient):
 * const Component1 = () => {
 *   const result = useMemo(() => computeFilteredData({...}), [deps]);
 * }
 * const Component2 = () => {
 *   const result = useMemo(() => computeFilteredData({...}), [deps]);
 * }
 * // ^ Both components recalculate the same data
 * 
 * // Recommended usage (efficient):
 * const Component1 = () => {
 *   const result = useDataStore(state => state.filteredData);
 * }
 * const Component2 = () => {
 *   const result = useDataStore(state => state.filteredData);
 * }
 * // ^ Data computed once, both components subscribe
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
