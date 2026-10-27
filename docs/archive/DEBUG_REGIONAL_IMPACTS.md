# Debug Guide: Regional Impacts Layer Not Showing

## Changes Made

### 1. **Increased Layer Opacity** (colorSystem.ts)
- **Fill opacity:** 50% → **65%** (loss mode)
- **Fill opacity:** 35% → **50%** (wind mode)
- **Outline opacity:** 85% → **100%** (maximum visibility)

### 2. **Added Comprehensive Debugging** (RegionalImpactsLayer.tsx)
- Tracks every step of the loading process
- Shows when data is fetched/cached
- Logs when layers are added/removed
- Prevents race conditions with loading state

### 3. **Exposed Map for Debugging** (MapView.tsx)
- Map instance now available as `window.__mapInstance`

## How to Debug

### Step 1: Open Browser Console
1. Open your app: `http://localhost:3002/partner2`
2. Press `F12` to open Developer Tools
3. Go to the **Console** tab

### Step 2: Check Loading Logs

Look for these messages in order:

```
📊 Loading RegionalImpactsLayer (mapStyle: loss)
🗺️ Map instance exists: true, Map loaded: true, Style loaded: true
🔄 Fetching regional impacts data from server...
📥 Regional impacts fetch result: { hasData: true, featureCount: 66 }
📦 Adding source 'regional-impacts' with 66 features
✅ Source added successfully
🗺️ Adding regional-impacts-fill layer (mapStyle: loss, beforeId: ...)
✅ Regional impacts FILL layer added successfully (66 features)
🗺️ Adding regional-impacts-line layer
✅ Regional impacts LINE layer added successfully
✅ Regional impacts layer loaded successfully with all event listeners
```

### Step 3: Run Debug Script

Copy the entire contents of `debug-regional-layers.js` into the browser console and press Enter.

It will show you:
- ✅ or ❌ if layers exist
- Layer properties (opacity, colors, visibility)
- Layer stack order
- Current map viewport

### Step 4: Manual Layer Check

In the browser console, run:

```javascript
// Get the map
const m = window.__mapInstance;

// Check if layers exist
console.log('Source:', m.getSource('regional-impacts'));
console.log('Fill layer:', m.getLayer('regional-impacts-fill'));
console.log('Line layer:', m.getLayer('regional-impacts-line'));

// Check visibility
console.log('Fill visible:', m.getLayoutProperty('regional-impacts-fill', 'visibility'));
console.log('Fill opacity:', m.getPaintProperty('regional-impacts-fill', 'fill-opacity'));
console.log('Line opacity:', m.getPaintProperty('regional-impacts-line', 'line-opacity'));

// List all layers
console.log('All layers:', m.getStyle().layers.map(l => l.id));
```

## Common Issues & Solutions

### Issue 1: "Source not found"
**Cause:** GeoJSON files not loading
**Solution:** Check Network tab for 404 errors on `/partner2/regional-impacts.geojson`

### Issue 2: "Layers exist but not visible"
**Cause:** Opacity too low or hidden behind other layers
**Solution:** Opacity is now 65%+. Check z-order in debug output.

### Issue 3: "Component unmounted" messages
**Cause:** Too many re-renders
**Solution:** Check parent component (page.tsx) for state changes

### Issue 4: Layers added then immediately removed
**Cause:** Race condition or conflicting effects
**Solution:** Check console for "Error removing" messages

## Expected Behavior

After successful loading, you should see:
- **On the map:** Colored polygons showing regional impacts
  - Loss mode: Yellow/Orange/Red gradients
  - Wind mode: Blue/Purple gradients
- **Opacity:** 65% fill, 100% outlines
- **Clickable:** Hover shows pointer cursor, click shows popup

## Quick Test

Run this in console to force-set high opacity:

```javascript
const m = window.__mapInstance;
m.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.8);
m.setPaintProperty('regional-impacts-line', 'line-opacity', 1.0);
m.setPaintProperty('regional-impacts-line', 'line-width', 2);
```

If layers appear after this, the issue was opacity/visibility.

## What to Report Back

Please share:
1. Console output (especially any ❌ errors)
2. Result of debug script run
3. Network tab showing regional-impacts.geojson status
4. Screenshot of what you see (or don't see) on the map
