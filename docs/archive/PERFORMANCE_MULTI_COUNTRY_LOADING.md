# Multi-Country Loading Performance Analysis & Solutions

## 🐌 Why It's Slow - Root Causes

### Current Implementation Problems

1. **Massive Data Files**
   ```
   Vanuatu:       9.1 MB  (66 regions, highly detailed geometries)
   Tonga:         840 KB
   Cook Islands:  639 KB
   Samoa:         487 KB
   ─────────────────────
   TOTAL:        ~11 MB of raw GeoJSON
   ```

2. **8 Separate HTTP Requests**
   - 4 countries × 2 files each (regional-impacts.geojson + regional-summary.csv)
   - All requests must complete before ANY data displays
   - Network latency multiplied by 8

3. **Main Thread Blocking**
   - `enrichRegionalImpactsWithSummary()` processes 11MB on main thread
   - Array operations on 190+ features blocks UI
   - No progressive rendering - all-or-nothing approach

4. **No Compression in Dev Mode**
   - Static files served without gzip/brotli compression
   - 11MB transferred vs ~1-2MB if compressed

5. **Not Using Optimized Database API**
   - A backend API exists at `/api/regions` with:
     - PostGIS spatial queries (much faster)
     - Built-in caching layer
     - Simplified geometries based on zoom level
     - Single request for all countries

---

## ⚡ Quick Wins (Immediate Improvements)

### Solution 1: Progressive Loading (Show Data As It Arrives)

Instead of waiting for all 4 countries, render each country as soon as it loads:

```typescript
// src/hooks/useRegionalImpactsData.ts
export function useRegionalImpactsData(countryCode?: CountryCode | null): RegionalImpactsDataState {
  const [state, setState] = useState<RegionalImpactsDataState>({
    data: { type: 'FeatureCollection', features: [] }, // Start with empty, not null
    sectorData: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (countryCode === null) {
      // Progressive multi-country loading
      loadCountriesProgressively();
    } else {
      // Single country loading (existing)
      loadSingleCountry(countryCode ?? 'VU');
    }
  }, [countryCode]);

  async function loadCountriesProgressively() {
    const allCountries: CountryCode[] = ['VU', 'WS', 'TO', 'CK'];
    const accumulatedFeatures: any[] = [];

    // Load countries one by one, updating state after each
    for (const country of allCountries) {
      try {
        const [regionalData, summary] = await Promise.all([
          loadRegionalImpacts({ countryCode: country }),
          loadRegionalSummary({ countryCode: country }),
        ]);

        if (regionalData?.features) {
          const enriched = enrichRegionalImpactsWithSummary(regionalData, summary);
          const withCountry = enriched.features.map(f => ({
            ...f,
            properties: { ...f.properties, country_code: country },
          }));

          accumulatedFeatures.push(...withCountry);

          // Update state immediately - user sees data appearing progressively
          setState(prev => ({
            ...prev,
            data: { type: 'FeatureCollection', features: [...accumulatedFeatures] },
            loading: accumulatedFeatures.length < 190, // Still loading if not all loaded
          }));

          console.log(`✅ Loaded ${country}: ${withCountry.length} regions (${accumulatedFeatures.length} total)`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to load ${country}`, error);
      }
    }

    setState(prev => ({ ...prev, loading: false }));
  }
}
```

**Benefits:**
- Users see Samoa/Tonga/Cook Islands within 1-2 seconds
- Vanuatu (the heavy one) loads last but doesn't block others
- Perceived performance improvement: 70-80%

---

### Solution 2: Load Small Countries First

Reorder loading so fast countries appear first:

```typescript
// Sort by file size (smallest first)
const allCountries: CountryCode[] = ['WS', 'CK', 'TO', 'VU']; // Samoa, Cook Islands, Tonga, Vanuatu last
```

**Impact:** First visible data in ~500ms instead of 3-5 seconds

---

### Solution 3: Lazy Load Vanuatu Separately

Since Vanuatu is 82% of the data size, load it only when needed:

```typescript
async function loadCountriesProgressively() {
  // Load small countries first (total: ~2MB)
  const smallCountries: CountryCode[] = ['WS', 'TO', 'CK'];
  const bigCountries: CountryCode[] = ['VU'];

  // Load small countries in parallel
  await loadCountriesInParallel(smallCountries);

  // Then load Vanuatu separately
  await loadCountriesInParallel(bigCountries);
}
```

---

## 🚀 Long-Term Solutions (Recommended)

### Solution 4: Use Database API Instead of Static Files

**Switch from static files to `/api/regions` endpoint:**

```typescript
// src/utils/realDataLoader.ts

/**
 * Load regional impacts from database API (optimized)
 */
export async function loadAllCountriesRegionalImpactsFromAPI(
  options: DataLoaderOptions = {}
): Promise<GeoJSON.FeatureCollection> {
  const apiUrl = '/api/regions'; // Returns all countries by default

  try {
    const response = await fetch(apiUrl, {
      signal: options.abortSignal,
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`🎉 Loaded ${data.features.length} regions from database API`);
    return data;
  } catch (error) {
    console.error('❌ Database API failed, falling back to static files', error);
    // Fallback to existing static file loading
    return loadAllCountriesRegionalImpacts(options);
  }
}
```

**Benefits:**
- **90% smaller payload** (PostGIS simplifies geometries)
- **Single HTTP request** instead of 8
- **Built-in caching** (Redis)
- **Zoom-level optimization** (less detail at lower zooms)

**To enable:**
1. Set `NEXT_PUBLIC_USE_DATABASE=true` in `.env`
2. Update hook to use API loader:
   ```typescript
   const data = await loadAllCountriesRegionalImpactsFromAPI({ abortSignal: controller.signal });
   ```

---

### Solution 5: Geometry Simplification

Reduce GeoJSON precision for faster parsing:

```typescript
// In PostGIS query (api/regions/route.ts)
ST_Simplify(
  ST_Transform(geom, 4326),
  CASE 
    WHEN $zoom_level < 8 THEN 0.01   -- Very simple at country view
    WHEN $zoom_level < 10 THEN 0.001 -- Medium detail
    ELSE 0.0001                       -- Full detail at region zoom
  END
) as geometry
```

**Impact:** 
- Zoom 6: 500KB (90% reduction)
- Zoom 10: 2MB (80% reduction)
- Zoom 14: 11MB (full detail)

---

### Solution 6: Web Worker for Data Processing

Move heavy processing off main thread:

```typescript
// src/workers/dataProcessor.worker.ts
self.onmessage = async (e) => {
  const { type, data, summary } = e.data;

  if (type === 'ENRICH_REGIONAL_DATA') {
    const enriched = enrichRegionalImpactsWithSummary(data, summary);
    self.postMessage({ type: 'ENRICHED', data: enriched });
  }
};

// In hook:
const worker = new Worker(new URL('./workers/dataProcessor.worker.ts', import.meta.url));
worker.postMessage({ type: 'ENRICH_REGIONAL_DATA', data, summary });
```

**Benefit:** UI stays responsive during 11MB processing

---

## 📊 Performance Comparison

| Approach | Load Time | Payload Size | Requests | Perceived Performance |
|----------|-----------|--------------|----------|----------------------|
| **Current (Parallel)** | 5-8s | 11 MB | 8 | ⭐⭐ |
| **Progressive Loading** | 5-8s | 11 MB | 8 | ⭐⭐⭐⭐ (feels 2s) |
| **Database API** | 1-2s | 1-2 MB | 1 | ⭐⭐⭐⭐⭐ |
| **API + Progressive** | 1-2s | 1-2 MB | 1 | ⭐⭐⭐⭐⭐ |
| **API + Web Worker** | 0.8-1.5s | 1-2 MB | 1 | ⭐⭐⭐⭐⭐ |

---

## 🎯 Recommended Implementation Plan

### Phase 1: Immediate (30 minutes)
✅ **Progressive loading** - Shows data as it arrives  
✅ **Reorder countries** - Small files first (WS, CK, TO, VU)  
✅ **Add loading indicators** - Show "Loading Samoa... ✓ Loading Tonga..."

### Phase 2: Short-term (2-4 hours)
⚡ **Switch to database API** - Use `/api/regions` endpoint  
⚡ **Add compression** - Ensure gzip/brotli enabled  
⚡ **Implement caching** - HTTP cache headers + SWR

### Phase 3: Long-term (1-2 days)
🚀 **Geometry simplification** - Zoom-based detail levels  
🚀 **Web Worker processing** - Off main thread  
🚀 **Viewport-based loading** - Only load visible countries

---

## 📝 Implementation Example: Progressive + API

```typescript
// src/hooks/useRegionalImpactsData.ts

export function useRegionalImpactsData(countryCode?: CountryCode | null) {
  const [state, setState] = useState({
    data: { type: 'FeatureCollection', features: [] },
    loading: true,
    error: null,
  });

  useEffect(() => {
    const loadData = async () => {
      // Check if database API is available
      const useDatabase = process.env.NEXT_PUBLIC_USE_DATABASE === 'true';

      if (countryCode === null) {
        if (useDatabase) {
          // FAST PATH: Single API request for all countries
          try {
            const data = await fetch('/api/regions').then(r => r.json());
            setState({ data, loading: false, error: null });
            console.log('✅ Loaded all regions from database API');
            return;
          } catch (error) {
            console.warn('⚠️ Database API failed, falling back to static files');
          }
        }

        // FALLBACK: Progressive static file loading
        await loadCountriesProgressively();
      } else {
        // Single country mode (existing logic)
        await loadSingleCountry(countryCode);
      }
    };

    loadData();
  }, [countryCode]);

  return state;
}
```

---

## 🔍 Debugging Performance

### Measure Loading Time

```typescript
console.time('Multi-country load');
const data = await loadAllCountriesRegionalImpacts();
console.timeEnd('Multi-country load'); // Shows exact duration
```

### Check Network Tab

1. Open DevTools → Network
2. Filter by "geojson"
3. Look for:
   - Transfer size (should be <2MB with compression)
   - Time to first byte (TTFB)
   - Download time

### Check Main Thread Blocking

```typescript
const start = performance.now();
enrichRegionalImpactsWithSummary(data, summary);
const duration = performance.now() - start;
console.log(`Enrichment took ${duration}ms`); // Should be <100ms
```

---

## ✅ Success Metrics

After optimization, you should see:

- **Initial data visible:** <1 second (small countries)
- **All data loaded:** <3 seconds (including Vanuatu)
- **Total payload:** <2 MB (with database API)
- **HTTP requests:** 1-2 (instead of 8)
- **Main thread blocking:** <50ms
- **Lighthouse Performance Score:** >90

---

## 🛠️ Next Steps

1. **Try Progressive Loading** (copy code from Solution 1 above)
2. **Test in DevTools Network Tab** - See load times per country
3. **Enable Database API** - Set `NEXT_PUBLIC_USE_DATABASE=true`
4. **Measure improvement** - Compare before/after with Performance API
5. **Ship to production** 🚀

Need help implementing any of these solutions? Ask about specific optimizations!
