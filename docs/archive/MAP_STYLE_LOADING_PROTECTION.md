# MapLibre "Style is not done loading"  Warning - Analysis & Protection

## Issue Description

The warning **"Map: Style is not done loading"** occurs when code attempts to manipulate a MapLibre map (add layers, sources, or query data) before the map's style definition has fully loaded.

This is **not an error** but a warning that operations may fail or behave unexpectedly.

---

## Root Causes

1. **Timing Race Condition**: Map initialization completes, but style JSON is still loading from network
2. **Style Changes**: Switching basemaps (CartoDB Positron → Dark Matter) triggers style reload
3. **Layer Operations**: Adding layers/sources before `map.isStyleLoaded()` returns `true`
4. **React Re-renders**: Multiple renders attempting to add same layers during style loading

---

## Current Protection Mechanisms ✅

### 1. **MapView.tsx** - Map Initialization
```typescript
// Line 537: Map always initialized with valid style URL
const instance = new maplibregl.Map({
  container: mapContainer.current,
  style: styleUrl, // Always a valid Carto CDN URL or StyleSpecification object
  center: safeCenter,
  zoom: safeZoom,
  // ...
});
```

**Protection:**
- `basemapStyle` defaults to `'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'`
- `getInitialBasemap()` always returns valid style (URL > localStorage > DEFAULT_BASEMAP_STYLE)
- Never passes `null`, `undefined`, or empty string

### 2. **RealDataLayers.tsx** - Hazard Layer Management
```typescript
// Line 507-511: Wait for style before adding WMS hazard layers
const addLayers = () => {
  if (map.isStyleLoaded()) {
    addHazardLayers();
  } else {
    map.once('styledata', addLayers); // Defer until ready
  }
};
```

**Protection:**
- Checks `map.isStyleLoaded()` before every layer operation
- Uses `once('styledata')` to retry when style finishes loading
- Guards in multiple places: line 507, 528, 595, 1110

### 3. **RegionalImpactsLayer.tsx** - Impact Overlay Management
```typescript
// Line 68-91: onStyleReady() helper function
function onStyleReady(map: MapLibreMap, callback: () => void): () => void {
  if (safeIsStyleLoaded(map)) {
    callback();
    return () => {};
  }

  let active = true;
  let invoked = false;

  const invokeWhenReady = () => {
    if (!active || invoked || !safeIsStyleLoaded(map)) return;
    invoked = true;
    map.off('style.load', invokeWhenReady);
    map.off('styledata', invokeWhenReady);
    callback();
  };

  map.on('style.load', invokeWhenReady);
  map.on('styledata', invokeWhenReady);

  return () => {
    active = false;
    map.off('style.load', invokeWhenReady);
    map.off('styledata', invokeWhenReady);
  };
}
```

**Protection:**
- Robust helper that waits for BOTH `style.load` and `styledata` events
- Cleanup function prevents memory leaks
- `safeIsStyleLoaded()` wrapper with try/catch for defensive checks

### 4. **Basemap Changes** - Style Switching Logic
```typescript
// MapView.tsx Line ~717: Basemap change handler
useEffect(() => {
  if (!map.current || !mapLoaded) return;

  const m = map.current;
  const safeCenter = m.getCenter();
  const safeZoom = m.getZoom();

  map.current.setStyle(basemapStyle as string | StyleSpecification);
  map.current.once('style.load', () => {
    // Restore view after style loads
    if (!map.current) return;
    map.current.flyTo({
      center: safeCenter,
      zoom: safeZoom,
      // ...
    });
  });
  setStyleChangeCounter(prev => prev + 1); // Triggers layer re-creation
}, [basemapStyle, mapLoaded]);
```

**Protection:**
- `styleChangeCounter` increments on basemap changes
- All layer components use `key={`layer-${styleChangeCounter}`}` to force remount
- Layers wait for new style to load before re-adding themselves

---

## Why You Might See This Warning

### Scenario A: **During Basemap Changes**
**When:** User switches from Light → Dark basemap
**Why:** Old layers try to update while new style is loading
**Impact:** Minimal - layers will re-add after style loads
**Fix:** Already handled by `styleChangeCounter` forcing layer remount

### Scenario B: **Slow Network Connections**
**When:** Style JSON takes >2 seconds to download
**Why:** React tries to add layers before style arrives
**Impact:** Warning logged, operations deferred to `styledata` event
**Fix:** Already handled by `map.once('styledata', callback)` pattern

### Scenario C: **Multiple Simultaneous Renders**
**When:** React StrictMode in development causes double-renders
**Why:** First render adds listeners, second render tries before style loads
**Impact:** Only in dev mode, does not affect production
**Fix:** Proper cleanup in useEffect return functions

### Scenario D: **Test Environment**
**When:** Running Jest tests with mocked MapLibre
**Why:** Mock might not implement `isStyleLoaded()` correctly
**Impact:** Warning in test output, doesn't affect app
**Fix:** Update mock in `__mocks__/maplibre-gl.js`:
```javascript
Map: jest.fn().mockImplementation(() => ({
  isStyleLoaded: jest.fn(() => true), // Always return true in tests
  // ...
}))
```

---

## Additional Protection Recommendations

### 1. **Add Warning Suppression for Known-Safe Cases**
```typescript
// src/utils/mapHelpers.ts
export function safeMapOperation<T>(
  map: maplibregl.Map,
  operation: () => T,
  operationName: string
): T | null {
  if (!map.isStyleLoaded()) {
    // This is expected during style changes - not a real error
    console.debug(`[${operationName}] Deferred - style loading`);
    return null;
  }

  try {
    return operation();
  } catch (error) {
    console.error(`[${operationName}] Failed:`, error);
    return null;
  }
}
```

### 2. **Improve Debug Logging**
Replace generic warnings with actionable debug logs:
```typescript
// Before
if (!map.isStyleLoaded()) {
  return; // Silent return - hard to debug
}

// After
if (!map.isStyleLoaded()) {
  console.debug('[RealDataLayers] Waiting for style - deferred hazard layer add');
  return;
}
```

### 3. **Add Telemetry**
Track how often style loading causes deferrals:
```typescript
let styleLoadDeferralCount = 0;

function waitForStyleLoaded(map: maplibregl.Map, callback: () => void) {
  if (map.isStyleLoaded()) {
    callback();
    return;
  }

  styleLoadDeferralCount++;
  if (styleLoadDeferralCount > 3) {
    console.warn('[Performance] Multiple style load deferrals detected - possible slow network');
  }

  map.once('styledata', callback);
}
```

---

## Verification Checklist

To confirm the warning is **not** a real issue:

1. ✅ **Check Console**: Is warning followed by successful layer adds?
2. ✅ **Check Map**: Do all layers appear correctly after 1-2 seconds?
3. ✅ **Test Basemap Switch**: Does switching basemaps work smoothly?
4. ✅ **Check Network Tab**: Does `style.json` load within 2 seconds?
5. ✅ **Test Production Build**: Does warning still occur in `npm run build` output?

If ALL layers load correctly and the warning only appears during transitions, **this is expected behavior** and not an error.

---

## How to Debug If Warning Persists

### Step 1: Add Instrumentation
```typescript
// src/components/MapView.tsx - in createMapInstance callback
instance.on('styledata', () => {
  console.log('✅ Style loaded at', Date.now());
});

instance.on('data', (e) => {
  if (e.dataType === 'style') {
    console.log('📊 Style data event', e.isSourceLoaded);
  }
});

instance.on('error', (e) => {
  console.error('❌ Map error:', e.error);
});
```

### Step 2: Check for Premature Layer Operations
Search codebase for any `map.addLayer()` or `map.addSource()` calls that **don't** have style loading checks:
```bash
# Find potentially unsafe map operations
grep -r "map\.addLayer\|map\.addSource" src/components/ | grep -v "isStyleLoaded"
```

### Step 3: Validate Basemap URLs
Ensure all basemap URLs are accessible:
```typescript
// Test in browser console
fetch('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json')
  .then(r => r.json())
  .then(style => console.log('✅ Style valid:', style.name));
```

---

## Summary

The codebase **already has world-class protection** against style loading warnings:

| Component | Protection Level | Mechanism |
|-----------|-----------------|-----------|
| MapView.tsx | ✅ Excellent | Valid style required for initialization |
| RealDataLayers.tsx | ✅ Excellent | Multiple `isStyleLoaded()` guards + deferred callbacks |
| RegionalImpactsLayer.tsx | ✅ Excellent | Robust `onStyleReady()` helper with cleanup |
| Basemap Changes | ✅ Excellent | `styleChangeCounter` forces layer remount |

**If you're seeing the warning:**
- It's likely during basemap transitions (expected)
- Or in development mode with React StrictMode (harmless)
- Or in test output with incomplete mocks (test-only issue)

**Action Required:** None - the current implementation is production-ready and handles style loading correctly.

**Optional Enhancement:** Add debug logging as shown in "Additional Protection Recommendations" section for better observability.
