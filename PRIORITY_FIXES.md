# 🔧 Priority Fixes from Code Review

**Created**: February 8, 2026  
**Based on**: Ollama AI Review (qwen2.5:14b-instruct)  
**Focus**: Legitimate technical debt and improvement opportunities

---

## 🔴 HIGH PRIORITY (Fix Soon)

### 1. **Type Safety in AdvancedCharts.tsx**
**Issue**: Using `any` types loses TypeScript benefits and can lead to runtime errors.

**Current Code**:
```typescript
interface AdvancedChartsProps {
  regionalSummary: any[];
  regionalSummaryBySector: any[];
}

const regions = [...new Set(regionalSummaryBySector.map((r: any) => r.Region))]
```

**Fixed Code**:
```typescript
// Add to src/types/index.ts
export interface RegionalSummary {
  Region: string;
  Population_Exposed_To_Any_Hazard: number;
  Total_Loss: number;
  Exposed_Infrastructure: number;
  Total_Exposed_Value_To_Any_Hazard: number;
}

export interface RegionalSummaryBySector {
  Region: string;
  Sector: string;
  Total_Loss: number;
  Number_Exposed_Buildings: number;
  Total_Wind_Loss: number;
  Total_Fluvial_Loss: number;
  Total_Coastal_Loss: number;
}

// Update AdvancedCharts.tsx
interface AdvancedChartsProps {
  regionalSummary: RegionalSummary[];
  regionalSummaryBySector: RegionalSummaryBySector[];
}
```

**Files to Edit**:
- `src/types/index.ts` (add interfaces)
- `src/components/AdvancedCharts.tsx` (update props, remove `any` casts)
- `src/components/SummaryPanel.tsx` (update props)
- `src/app/page.tsx` (update prop types)

**Impact**: ⭐⭐⭐⭐⭐ (High - improves safety, catches bugs at compile time)

---

### 2. **Dynamic Region Limit in AdvancedCharts**
**Issue**: Hardcoded `.slice(0, 6)` limits scalability and doesn't adapt to data size.

**Current Code**:
```typescript
const regions = [...new Set(regionalSummaryBySector.map((r) => r.Region))]
  .filter(Boolean)
  .sort()
  .slice(0, 6); // Top 6 regions
```

**Fixed Code**:
```typescript
// Option A: Make it configurable
interface AdvancedChartsProps {
  regionalSummary: RegionalSummary[];
  regionalSummaryBySector: RegionalSummaryBySector[];
  maxRegions?: number; // Allow caller to specify
}

const MAX_REGIONS = maxRegions ?? 10; // Reasonable default

// Sort by total loss descending to show most impacted
const topRegions = [...new Set(regionalSummaryBySector.map((r) => r.Region))]
  .filter(Boolean)
  .map(region => ({
    name: region,
    totalLoss: regionalSummaryBySector
      .filter(r => r.Region === region)
      .reduce((sum, r) => sum + r.Total_Loss, 0)
  }))
  .sort((a, b) => b.totalLoss - a.totalLoss)
  .slice(0, MAX_REGIONS)
  .map(r => r.name);
```

**Files to Edit**:
- `src/components/AdvancedCharts.tsx`

**Impact**: ⭐⭐⭐⭐ (Medium-High - more flexible, shows most relevant data)

---

### 3. **Add Data Validation Before Processing**
**Issue**: No checks for malformed/missing data could cause runtime errors.

**Current Code**:
```typescript
const heatmapData = useMemo(() => {
  if (!regionalSummaryBySector || regionalSummaryBySector.length === 0) return null;
  // ... processing
}, [regionalSummaryBySector]);
```

**Fixed Code**:
```typescript
const heatmapData = useMemo(() => {
  // Comprehensive validation
  if (!regionalSummaryBySector || 
      !Array.isArray(regionalSummaryBySector) || 
      regionalSummaryBySector.length === 0) {
    console.warn('AdvancedCharts: Invalid or empty regionalSummaryBySector data');
    return null;
  }

  // Validate data structure
  const hasValidStructure = regionalSummaryBySector.every(item => 
    item && 
    typeof item === 'object' && 
    'Region' in item && 
    'Sector' in item
  );

  if (!hasValidStructure) {
    console.error('AdvancedCharts: Data structure validation failed');
    return null;
  }

  // ... processing with confidence
}, [regionalSummaryBySector]);
```

**Files to Edit**:
- `src/components/AdvancedCharts.tsx` (all useMemo hooks)
- `src/components/PopulationLossScatter.tsx` (already partially done)

**Impact**: ⭐⭐⭐⭐⭐ (High - prevents crashes, improves debugging)

---

## 🟡 MEDIUM PRIORITY (Improve Performance)

### 4. **Lazy Load Heavy Chart Components**
**Issue**: Loading all chart libraries upfront increases initial bundle size.

**Current Code**:
```typescript
import AdvancedCharts from "./AdvancedCharts";
import PopulationLossScatter from "./PopulationLossScatter";
```

**Fixed Code**:
```typescript
import dynamic from 'next/dynamic';

// Lazy load chart components with loading states
const AdvancedCharts = dynamic(
  () => import('./AdvancedCharts'),
  { 
    loading: () => <ChartLoadingSkeleton />,
    ssr: false // Charts don't need SSR
  }
);

const PopulationLossScatter = dynamic(
  () => import('./PopulationLossScatter'),
  { 
    loading: () => <ChartLoadingSkeleton />,
    ssr: false
  }
);
```

**Files to Edit**:
- `src/components/BottomTabs.tsx`
- `src/components/SummaryPanel.tsx`

**Impact**: ⭐⭐⭐⭐ (Medium-High - reduces initial load time by ~150KB)

---

### 5. **Error Boundary for Basemap Loading**
**Issue**: Failed basemap loads can break the entire map component.

**Current Code**:
```typescript
// No error handling in BasemapSwitcher
const handleBasemapChange = (basemap: string) => {
  setCurrentBasemap(basemap);
  if (map) {
    map.setStyle(BASEMAPS.find((b) => b.id === basemap)?.style || BASEMAPS[0].style);
  }
};
```

**Fixed Code**:
```typescript
const handleBasemapChange = async (basemap: string) => {
  const newBasemap = BASEMAPS.find((b) => b.id === basemap);
  if (!newBasemap) {
    console.error(`Basemap not found: ${basemap}`);
    return;
  }

  try {
    setCurrentBasemap(basemap);
    if (map) {
      map.setStyle(newBasemap.style);
      
      // Wait for style load with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Style load timeout')), 5000);
        map.once('style.load', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
      
      console.log(`✅ Basemap loaded: ${newBasemap.name}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load basemap ${newBasemap.name}:`, error);
    // Fallback to default basemap
    if (currentBasemap !== 'light') {
      setCurrentBasemap('light');
      map?.setStyle(BASEMAPS[0].style);
    }
  }
};
```

**Files to Edit**:
- `src/components/BasemapSwitcher.tsx`

**Impact**: ⭐⭐⭐ (Medium - better UX when network fails)

---

## 🟢 LOW PRIORITY (Nice to Have)

### 6. **Add Loading Skeleton Component**
**Issue**: Charts render blank during data load, poor UX.

**New File**: `src/components/ChartLoadingSkeleton.tsx`
```typescript
export default function ChartLoadingSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
      <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded"></div>
    </div>
  );
}
```

**Impact**: ⭐⭐⭐ (Medium - better perceived performance)

---

### 7. **Document useRealData Removal**
**Issue**: State variable removed without explanation in commit/PR.

**Add to `src/app/page.tsx`**:
```typescript
/**
 * Main Dashboard Page Component
 * 
 * Data Management:
 * - Previously used useRealData toggle for mock/real data switching
 * - Removed in v2.0 as real data is now the primary source
 * - Mock data generation moved to dev-only utils for testing
 * 
 * Real data loaded from:
 * - /public/*.csv (tabular data)
 * - /public/*.geojson (spatial data)
 */
export default function Home() {
  // ...
}
```

**Files to Edit**:
- `src/app/page.tsx` (add JSDoc comment)

**Impact**: ⭐⭐ (Low - documentation only, no functional change)

---

## 📊 Summary of Priorities

| Priority | Issue | Effort | Impact | Status |
|----------|-------|--------|--------|--------|
| 🔴 HIGH | Type safety in charts | 2-3 hours | ⭐⭐⭐⭐⭐ | Not started |
| 🔴 HIGH | Dynamic region limits | 30 mins | ⭐⭐⭐⭐ | Not started |
| 🔴 HIGH | Data validation | 1 hour | ⭐⭐⭐⭐⭐ | Partial (PopulationLossScatter) |
| 🟡 MED | Lazy load charts | 1 hour | ⭐⭐⭐⭐ | Not started |
| 🟡 MED | Basemap error handling | 1 hour | ⭐⭐⭐ | Not started |
| 🟢 LOW | Loading skeleton | 30 mins | ⭐⭐⭐ | Not started |
| 🟢 LOW | Documentation | 15 mins | ⭐⭐ | Not started |

**Total Estimated Effort**: 6-7 hours  
**Expected Impact**: Significantly improved type safety, error resilience, and performance

---

## 🚫 Rejected Suggestions from Review

These were flagged by Ollama but are **intentional design choices**:

1. ❌ **31536000s cache for static assets** - Correct for immutable versioned assets
2. ❌ **Restrictive Permissions-Policy** - Appropriate for climate dashboard (no camera/mic needed)
3. ❌ **External basemap stylesheets** - Standard MapLibre practice, not a vulnerability
4. ❌ **"Use Redux"** - Current Context + useState is sufficient for app size
5. ❌ **"Implement WebAssembly"** - No performance bottlenecks requiring WASM
6. ❌ **"ML for basemap prediction"** - Over-engineering for simple user preference

---

## 🎯 Next Steps

1. **Fix Type Safety** - Start with HIGH priority items #1-3
2. **Test Changes** - Verify with real data scenarios
3. **Performance Audit** - Use Next.js metrics after lazy loading
4. **Update Tests** - Ensure ErrorBoundary tests cover new validation

**Ready to implement?** Start with Priority 1 (Type Safety) for maximum impact.
