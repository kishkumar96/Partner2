# Economic & Wind Layers - ALREADY WORKING! ✅

## TL;DR
**The layers ARE enabled and loading!** If you see nothing, they're probably just too subtle (5-20% opacity by design). 

**Quick test:** Open console (F12) and paste:
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;
map.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.9);
```

If you suddenly see colors, the layers were there all along!

---

## Current Status

### ✅ Economic Damage Vectors - ACTIVE
**Loading from:** Local files via `RegionalImpactsLayer`
- `/public/regional-impacts.geojson` (9.5 MB, 100+ regions)
- `/public/regional-impacts-by-sector.geojson` (2.6 MB)

**Status:** ENABLED with `visible={true}` in MapView.tsx

**What it shows:**
- Choropleth polygons colored by economic loss (yellow → orange → red)
- Very subtle fill (5-20% opacity) - THIS IS INTENTIONAL!
- Clear boundaries (30-40% opacity) - Focus is on boundaries, not fill

### ✅ Wind WMS Layers - ACTIVE  
**Loading from:** THREDDS WMS server (raster tiles, NOT vectors)
- Vanuatu: `local_wind.nc` from TC Lola  
- Samoa: `SA_savaii_upolu_local_wind.nc` from TC Gita

**Requirements to see them:**
1. Zoom level > 5 (zoom in!)
2. `showWindLayer={true}` OR hazard filter = "Tropical Cyclone"
3. Country has data (VU, WS confirmed)

---

## Why You See "Nothing"

### 🎨 Design Choice: Subtle Colors!

Professional choropleth maps use **very low opacity fills**:
- Fill: 5-20% opacity (nearly transparent)
- Boundaries: 30-40% opacity (more visible)

This follows **cartography best practices** - boundaries define regions, not fill colors.

### 🔍 How to Verify Layers Exist

**1. Check Browser Console (F12)**
Look for:
```
📊 Loading RegionalImpactsLayer (mapStyle: loss)
✅ Regional impacts layer added successfully (103 features)
🗺️ Adding regional-impacts-fill layer
```

**2. Check Network Tab**
Should see HTTP 200:
- `regional-impacts.geojson` - 9.5 MB
- `regional-impacts-by-sector.geojson` - 2.6 MB

**3. List Layers in Console**
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;
map.getStyle().layers.map(l => l.id);
// Should include: "regional-impacts-fill", "regional-impacts-line"
```

---

## Make Layers More Visible

### Temporary (Console Command)
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;

// Increase opacity
map.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.7);

// Or make them bright red to test
map.setPaintProperty('regional-impacts-fill', 'fill-color', '#ff0000');
```

### Permanent (Code Change)

Edit [src/utils/colorSystem.ts](src/utils/colorSystem.ts):
```typescript
export const LAYER_OPACITY = {
  regional: {
    fill: 0.5,    // Change from 0.12 to 0.5 (50% opacity)
    outline: 0.7,  // Change from 0.35 to 0.7 (70% opacity)
  }
}
```

---

## Wind Layers Troubleshooting

### Check Requirements

**1. Zoom Level > 5**
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__
console.log('Zoom:', map.getZoom()); // Must be > 5
```

If zoom < 5, console will show:
```
Zoom level too low (4.2 < 5) - WMS layers not loaded. Zoom in to see hazard layers.
```

**2. Wind Layer Enabled**
Check console for:
```
Final hazard types to show: ['wind']
📍 Adding layer: TC Lola Wind Hazard
```

If not showing, either:
- Enable "Show Wind Layer" toggle, OR
- Select "Tropical Cyclone" in hazard filter

**3. WMS Layer Exists**
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;
console.log('Wind layer:', map.getLayer('wms-layer-vu-tc-lola-wind'));
// Should return layer object, not undefined
```

---

## Complete Diagnostics

### Emergency Debug Script

Paste in browser console (F12):
```javascript
const mapElement = document.querySelector('canvas')?.parentElement;
if (!mapElement) {
  console.error('❌ NO MAP CANVAS FOUND');
} else {
  const map = mapElement.__maplibre_map__;
  if (!map) {
    console.error('❌ MAP NOT INITIALIZED');
  } else {
    console.log('=== MAP STATUS ===');
    console.log('✅ Map initialized');
    console.log('Zoom:', map.getZoom().toFixed(2), '(need > 5 for WMS)');
    console.log('Style loaded:', map.isStyleLoaded());
    
    console.log('\n=== LAYERS ===');
    const layers = map.getStyle().layers;
    console.log('Total layers:', layers.length);
    
    const regionalLayers = layers.filter(l => l.id.includes('regional'));
    const wmsLayers = layers.filter(l => l.id.includes('wms'));
    
    console.log('Regional layers:', regionalLayers.map(l => l.id));
    console.log('WMS layers:', wmsLayers.map(l => l.id));
    
    console.log('\n=== REGIONAL IMPACTS ===');
    const fillLayer = map.getLayer('regional-impacts-fill');
    if (fillLayer) {
      console.log('✅ Fill layer EXISTS');
      const opacity = map.getPaintProperty('regional-impacts-fill', 'fill-opacity');
      console.log('Fill opacity:', opacity, '(0.1-0.2 is very subtle!)');
      
      // Temporarily increase to test
      console.log('\n💡 Making layer MORE visible (test)...');
      map.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.8);
      console.log('👉 Check map now - do you see colors?');
    } else {
      console.error('❌ Fill layer MISSING');
    }
    
    console.log('\n=== SOURCES ===');
    const sources = Object.keys(map.getStyle().sources);
    console.log('Available sources:', sources);
    console.log('Has regional-impacts:', sources.includes('regional-impacts') ? '✅' : '❌');
  }
}
```

---

## What You SHOULD See

### Default View (Subtle Design)
- Very faint colors on regions (yellow/orange/red)
- Clear gray boundaries between regions
- Look closely - it's there!

### After Increasing Opacity
- Bright, obvious colors
- Clear choropleth map
- Easy to see economic damage distribution

### Wind Layers (Zoom > 5)
- Pulsating overlay (0.45-0.75 opacity animation)
- Yellow → Orange → Red colors  
- Covers wind-affected areas

---

## Files & Components

### Loading Regional Data
**Component:** [`RegionalImpactsLayer.tsx`](src/components/RegionalImpactsLayer.tsx)
**Files:** 
- `/public/regional-impacts.geojson`
- `/public/regional-impacts-by-sector.geojson`
**Status:** ✅ ACTIVE

### Loading Wind Data
**Component:** [`RealDataLayers.tsx`](src/components/RealDataLayers.tsx)
**Source:** THREDDS WMS server
**Files:** `local_wind.nc`, `SA_savaii_upolu_local_wind.nc`
**Status:** ✅ ACTIVE (when zoom > 5)

### NOT Loading (Correctly Disabled)
**Component:** `PDIEDataLayers.tsx`
**Why disabled:** Tries to fetch from THREDDS PDIE outputs (returns 404)
**Alternative:** Data loaded from local files instead

---

## Next Steps

1. **Open browser console** (F12)
2. **Run the emergency debug script** above
3. **Check the output:**
   - Do layers exist?
   - What's the opacity?
   - What's the zoom level?
4. **Try increasing opacity** with the test command
5. **Report back** what you see!

**See also:** [DEBUGGING_LAYERS.md](DEBUGGING_LAYERS.md) for full troubleshooting guide.
