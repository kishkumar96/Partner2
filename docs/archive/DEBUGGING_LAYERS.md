# Debugging: Why Can't I See Layers?

## Current Status ✅
Your layers ARE enabled and loading:
- **RegionalImpactsLayer**: Loading `/regional-impacts.geojson` (economic damage polygons)
- **RealDataLayers**: Loading WMS tiles for wind/inundation (requires zoom > 5)
- **DamagedBuildingsLayer**: Loaded when damage data is requested
- **DamagedRoadsLayer**: Loaded when damage data is requested

## Quick Checklist

### 1. Open Browser Console (F12)
Look for these messages:

**✅ GOOD SIGNS:**
```
📊 Loading RegionalImpactsLayer (mapStyle: loss, selectedRegion: null)
✅ Regional impacts layer added successfully (XX features)
🗺️ Adding regional-impacts-fill layer
```

**❌ BAD SIGNS:**
```
❌ RegionalImpactsLayer: Skipping load
Could not load regional impacts data
Error loading regional impacts
```

### 2. Check Map Zoom Level
**Wind/Inundation WMS layers require zoom > 5**

In browser console, type:
```javascript
// Check current zoom
document.querySelector('canvas').parentElement.__maplibre_map__.getZoom()
```

If zoom < 5, you'll see:
```
Zoom level too low (4.2 < 5) - WMS layers not loaded. Zoom in to see hazard layers.
```

### 3. Verify Files Exist
Check Network tab (F12 → Network) for these requests:

**Should see HTTP 200:**
- `http://localhost:3002/regional-impacts.geojson` (9.5 MB)
- `http://localhost:3002/regional-impacts-by-sector.geojson` (2.6 MB)
- `http://localhost:3002/damaged-buildings.geojson` (3.8 MB)

**Should see HTTP 404 = Missing file:**
- Check if file exists in `/public/` folder

### 4. Check Layer Visibility Settings

#### Map Style Affects Colors
- **Loss mode**: Yellow → Orange → Red (economic damage)
- **Wind mode**: Blue → Purple → Red (wind speed)
- **Satellite/Street**: Different color schemes

#### Opacity Settings
Regional layers use very subtle fill opacity:
- **Default fill**: 5-20% opacity (VERY subtle - industry best practice)
- **Boundaries**: More visible (30-40% opacity)

**This is intentional!** Choropleth maps use subtle fills with clear boundaries.

### 5. Check Map Loaded
In console:
```javascript
// Check if map is ready
const mapElement = document.querySelector('canvas').parentElement;
const map = mapElement.__maplibre_map__;

// List all layers
map.getStyle().layers.map(l => l.id)

// Should include:
// - "regional-impacts-fill"
// - "regional-impacts-line"
// - "wms-layer-vu-tc-lola-wind" (if zoomed in)
```

### 6. Force Layer Visibility Debug

**Make layers MORE visible** (temporary test):

In browser console:
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;

// Make regional impacts VERY visible
map.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.8);
map.setPaintProperty('regional-impacts-fill', 'fill-color', '#ff0000'); // Bright red

// Check if layer exists
console.log('Has fill layer:', map.getLayer('regional-impacts-fill') !== undefined);
console.log('Has line layer:', map.getLayer('regional-impacts-line') !== undefined);
```

If you still see nothing after this, the layer doesn't exist or map isn't initialized.

## Common Issues & Solutions

### Issue: "I see the basemap but no layers"

**Possible causes:**
1. **Files missing from /public/** 
   - Solution: Verify files exist
   
2. **Layer order issue**
   - Layers might be behind basemap
   - Check console for layer IDs
   
3. **Opacity too low**
   - Default is 5-20% (very subtle)
   - Use console command above to increase

### Issue: "Wind layers not showing"

**Requirements for WMS wind layers:**
- ✅ Zoom level > 5
- ✅ `showWindLayer={true}` or hazard filter = "Tropical Cyclone"
- ✅ Country has wind data (VU=Vanuatu, WS=Samoa confirmed)

**Console commands:**
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;

// Check zoom
console.log('Zoom:', map.getZoom());

// Check if wind layer exists
console.log('Wind layer:', map.getLayer('wms-layer-vu-tc-lola-wind'));

// List all WMS layers
map.getStyle().layers.filter(l => l.id.includes('wms')).map(l => l.id)
```

### Issue: "Console shows errors"

**CORS errors:**
```
Access to fetch at 'https://...' from origin has been blocked by CORS
```
- This is normal for THREDDS PDIE data (disabled)
- Regional data uses local files (no CORS issue)

**404 errors:**
```
Failed to load resource: net::ERR_FAILED /regional-impacts.geojson
```
- File missing from /public folder
- Check file path

### Issue: "Layers disappeared after zoom/pan"

**This is normal!** Layers reload on:
- Map style change (loss ↔ wind ↔ satellite)
- Basemap change
- Country selection change

Check console for reload messages.

## What You SHOULD See

### At Zoom Level < 5 (Far view)
- ✅ Basemap (street/satellite/etc)
- ✅ Regional impact polygons (VERY subtle colors)
- ✅ Regional boundaries (gray lines)
- ❌ Wind WMS layers (too far out)

### At Zoom Level > 5 (Close view)
- ✅ Everything from above, PLUS:
- ✅ Wind WMS raster (if enabled, pulsing opacity)
- ✅ Inundation WMS raster (if enabled)

### When Damage Data Loaded
- ✅ Colored dots for damaged buildings
- ✅ Colored lines for damaged roads

## Still Nothing?

### Emergency Debug Script

Paste this in browser console:
```javascript
const mapElement = document.querySelector('canvas')?.parentElement;
if (!mapElement) {
  console.error('❌ NO MAP CANVAS FOUND');
} else {
  const map = mapElement.__maplibre_map__;
  if (!map) {
    console.error('❌ MAP NOT INITIALIZED');
  } else {
    console.log('✅ Map initialized');
    console.log('Zoom level:', map.getZoom().toFixed(2));
    console.log('Center:', map.getCenter());
    console.log('Style loaded:', map.isStyleLoaded());
    
    const layers = map.getStyle().layers;
    console.log('Total layers:', layers.length);
    console.log('Regional layers:', layers.filter(l => l.id.includes('regional')).map(l => l.id));
    console.log('WMS layers:', layers.filter(l => l.id.includes('wms')).map(l => l.id));
    console.log('Damage layers:', layers.filter(l => l.id.includes('damage')).map(l => l.id));
    
    // Check regional impacts specifically
    const fillLayer = map.getLayer('regional-impacts-fill');
    if (fillLayer) {
      console.log('✅ Regional fill layer exists');
      console.log('Fill opacity:', map.getPaintProperty('regional-impacts-fill', 'fill-opacity'));
      console.log('Fill color:', map.getPaintProperty('regional-impacts-fill', 'fill-color'));
    } else {
      console.error('❌ Regional fill layer MISSING');
    }
    
    // Check sources
    const sources = map.getStyle().sources;
    console.log('Sources:', Object.keys(sources));
    if (sources['regional-impacts']) {
      console.log('✅ Regional impacts source exists');
    } else {
      console.error('❌ Regional impacts source MISSING');
    }
  }
}
```

### Report Results
After running the debug script, report:
1. What layers are listed?
2. Does regional-impacts-fill exist?
3. What is the zoom level?
4. Any errors in console?

## Most Likely Issue

**The layers ARE there, but opacity is TOO LOW to see!**

Regional choropleth maps use **very subtle** fill colors (5-20% opacity) so the boundaries stand out. This is **intentional design** following cartography best practices.

**To confirm**, run this in console:
```javascript
const map = document.querySelector('canvas').parentElement.__maplibre_map__;
map.setPaintProperty('regional-impacts-fill', 'fill-opacity', 0.9);
```

If you suddenly see bright colors, the layers were there all along!
