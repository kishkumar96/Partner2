# 🚀 Quick Reference: State Management Migration

## 📖 Before You Start

**Read First**: [MAP_STATE_CRITIQUE.md](./MAP_STATE_CRITIQUE.md) for full context  
**Implementation Guide**: [ARCHITECTURE_PROPOSAL.md](./src/stores/ARCHITECTURE_PROPOSAL.md)  
**Code Examples**: [filterUtilsIndexed.EXAMPLE.ts](./src/utils/filterUtilsIndexed.EXAMPLE.ts)

---

## 🔥 Quick Win Checklist

Use this checklist to track your progress through the migration.

### ✅ Setup (30 minutes)
```bash
# Install dependencies
npm install zustand kdbush

# Create store file
mkdir -p src/stores
touch src/stores/dataStore.ts
```

### ✅ Store Implementation (2 hours)
Copy the complete store from `ARCHITECTURE_PROPOSAL.md` or use this minimal version:

```typescript
// src/stores/dataStore.ts
import { create } from 'zustand';
import { Event, FilterState } from '@/types';

interface DataStore {
  events: Event[];
  filters: FilterState;
  indexes: Map<string, Event[]>;
  
  loadData: (events: Event[]) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  getFilteredEvents: () => Event[];
}

export const useDataStore = create<DataStore>((set, get) => ({
  events: [],
  filters: {
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: '', end: '' },
    aggregationLevel: 'district',
  },
  indexes: new Map(),
  
  loadData: (events) => {
    // Build indexes
    const indexes = new Map<string, Event[]>();
    events.forEach(e => {
      if (!indexes.has(e.districtId)) {
        indexes.set(e.districtId, []);
      }
      indexes.get(e.districtId)!.push(e);
    });
    set({ events, indexes });
  },
  
  setFilter: (filter) => set((state) => ({
    filters: { ...state.filters, ...filter }
  })),
  
  getFilteredEvents: () => {
    const { events, filters } = get();
    // Simple filter for now - enhance later
    return events.filter(e => {
      if (filters.selectedHazards.length > 0 && 
          !filters.selectedHazards.includes(e.hazardId)) return false;
      if (filters.selectedSectors.length > 0 && 
          !filters.selectedSectors.includes(e.sectorId)) return false;
      return true;
    });
  },
}));
```

### ✅ Migrate Data Loading (30 minutes)
```typescript
// page.tsx - OLD
const [events, setEvents] = useState<Event[]>([]);

useEffect(() => {
  loadAllRealData().then(data => {
    setEvents(data.events);
  });
}, []);

// page.tsx - NEW
const loadData = useDataStore(state => state.loadData);

useEffect(() => {
  loadAllRealData().then(data => {
    loadData(data.events); // ← Store handles it now
  });
}, [loadData]);
```

### ✅ Migrate FilterPanel (1 hour)
```typescript
// FilterPanel.tsx - OLD
interface Props {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  hazards: Hazard[];
  // ... 10+ more props
}

// FilterPanel.tsx - NEW
interface Props {
  hazards: Hazard[]; // Keep reference data as props
  sectors: Sector[];
}

function FilterPanel({ hazards, sectors }: Props) {
  const filters = useDataStore(state => state.filters);
  const setFilter = useDataStore(state => state.setFilter);
  
  return (
    <div>
      <button onClick={() => setFilter({ selectedHazards: ['cyclone'] })}>
        Filter Cyclones
      </button>
    </div>
  );
}
```

### ✅ Migrate SummaryPanel (1 hour)
```typescript
// SummaryPanel.tsx - OLD
const { filteredEvents } = useMemo(() => 
  computeFilteredData({ events, filters, ... }), 
  [events, filters, districts, provinces]
);

// SummaryPanel.tsx - NEW
const filteredEvents = useDataStore(state => state.getFilteredEvents());
// That's it! No more useMemo, no more prop drilling
```

---

## 🎯 Migration Patterns

### Pattern 1: Remove Filter Props
```typescript
// BEFORE
interface ComponentProps {
  events: Event[];
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  districts: District[];
  provinces: Province[];
}

// AFTER
interface ComponentProps {
  // Keep only reference data that doesn't change
  districts: District[];
  provinces: Province[];
}
```

### Pattern 2: Replace useMemo with Store Selectors
```typescript
// BEFORE
const computed = useMemo(() => {
  return expensiveComputation(data, filters);
}, [data, filters]);

// AFTER
const computed = useDataStore(state => state.getComputedData());
```

### Pattern 3: Replace useState with Store Actions
```typescript
// BEFORE
const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

// AFTER
const selectedRegion = useDataStore(state => state.selectedRegion);
const setSelectedRegion = useDataStore(state => state.setSelectedRegion);
```

---

## 🐛 Common Pitfalls

### ❌ DON'T: Destructure Too Much
```typescript
// BAD - Component re-renders on ANY store change
const { events, filters, districts, provinces } = useDataStore();

// GOOD - Component only re-renders when filteredEvents changes
const filteredEvents = useDataStore(state => state.getFilteredEvents());
```

### ❌ DON'T: Create Selectors Inside Render
```typescript
// BAD - Creates new function on every render
const data = useDataStore(state => {
  return expensiveComputation(state.events); // ← Computed every render!
});

// GOOD - Selector is in the store, memoized properly
const data = useDataStore(state => state.getComputedData());
```

### ❌ DON'T: Forget to Update Tests
```typescript
// BAD - Tests that mock props
const { render } = renderComponent({ filters: mockFilters });

// GOOD - Tests that mock the store
vi.mock('@/stores/dataStore', () => ({
  useDataStore: vi.fn(() => ({
    filters: mockFilters,
    setFilter: mockSetFilter,
  }))
}));
```

---

## 🧪 Testing Checklist

### Unit Tests
```typescript
import { renderHook, act } from '@testing-library/react';
import { useDataStore } from '@/stores/dataStore';

test('filters events by hazard', () => {
  const { result } = renderHook(() => useDataStore());
  
  // Load test data
  act(() => {
    result.current.loadData(mockEvents);
  });
  
  // Apply filter
  act(() => {
    result.current.setFilter({ selectedHazards: ['cyclone'] });
  });
  
  // Check result
  const filtered = result.current.getFilteredEvents();
  expect(filtered).toHaveLength(2);
  expect(filtered.every(e => e.hazardId === 'cyclone')).toBe(true);
});
```

### Integration Tests
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanel from '@/components/FilterPanel';

test('filtering updates summary panel', async () => {
  render(<App />);
  
  // Click filter
  await userEvent.click(screen.getByText('Cyclones'));
  
  // Check that summary updated
  expect(screen.getByText(/2 events/i)).toBeInTheDocument();
});
```

---

## 📊 Performance Monitoring

### Add These Console Logs During Migration
```typescript
// In store's getFilteredEvents:
export const useDataStore = create<DataStore>((set, get) => ({
  getFilteredEvents: () => {
    console.time('⚡ Filter computation');
    const result = /* ... filtering logic ... */;
    console.timeEnd('⚡ Filter computation');
    console.log(`📊 Filtered: ${result.length} of ${get().events.length} events`);
    return result;
  }
}));
```

### Expected Performance Targets
- Initial index build: < 100ms for 10k events
- Filter operation: < 5ms
- Viewport query: < 2ms
- Component re-renders: 1 per filter change (not 3-5)

---

## 🆘 Troubleshooting

### Issue: "Component not updating when filter changes"
**Solution**: Check that you're using a selector, not reading state directly
```typescript
// WRONG
const store = useDataStore();
console.log(store.filters); // Won't trigger re-render

// RIGHT
const filters = useDataStore(state => state.filters);
```

### Issue: "Too many re-renders"
**Solution**: Use shallow comparison for arrays/objects
```typescript
import { shallow } from 'zustand/shallow';

const [events, filters] = useDataStore(
  state => [state.events, state.filters],
  shallow
);
```

### Issue: "TypeScript errors after migration"
**Solution**: Update component prop interfaces
```typescript
// Remove FilterState from props
interface Props {
  // filters: FilterState; // ← DELETE
  // onFilterChange: (f: FilterState) => void; // ← DELETE
  districts: District[]; // ← KEEP
}
```

---

## 📚 Quick Links

- [Zustand Docs](https://zustand-demo.pmnd.rs/)
- [KDBush GitHub](https://github.com/mourner/kdbush)
- [React Performance](https://react.dev/learn/render-and-commit)
- [TypeScript with Zustand](https://github.com/pmndrs/zustand#typescript-usage)

---

## 🎉 Success Criteria

You've successfully migrated when:

✅ `page.tsx` has < 400 lines (down from 820)  
✅ `FilterPanel` has no `filters` or `onFilterChange` props  
✅ `SummaryPanel` has no `computeFilteredData` useMemo  
✅ Filter operations take < 5ms (check DevTools)  
✅ All tests pass  
✅ No console errors or warnings  

---

## 💬 Need Help?

- **Stuck?** Re-read [ARCHITECTURE_PROPOSAL.md](./src/stores/ARCHITECTURE_PROPOSAL.md)
- **Code examples?** Check [filterUtilsIndexed.EXAMPLE.ts](./src/utils/filterUtilsIndexed.EXAMPLE.ts)
- **Big picture?** Review [MAP_STATE_CRITIQUE.md](./MAP_STATE_CRITIQUE.md)

**Remember**: Migrate one component at a time. Don't try to do everything at once!
