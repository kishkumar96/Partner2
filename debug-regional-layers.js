/**
 * Debug script to check if regional impacts layers are present on the map
 * 
 * Open browser console (F12) and copy/paste this entire script
 * It will show you the status of the regional impacts layers
 */

(function checkRegionalImpactsLayers() {
  console.log('🔍 Checking Regional Impacts Layers...');
  console.log('='.repeat(50));
  
  // Find the map instance
  const mapElement = document.querySelector('.maplibregl-map, [class*="map"]');
  if (!mapElement) {
    console.error('❌ Could not find map element');
    return;
  }
  
  // Try to get map instance from various possible locations
  let map = mapElement.__maplibre_map__ || 
            mapElement._map || 
            window.__map__;
  
  if (!map) {
    console.error('❌ Could not find map instance');
    console.log('Try: window.__mapInstance = map (in your code first)');
    return;
  }
  
  console.log('✅ Map instance found');
  console.log(`   Map loaded: ${map.loaded()}`);
  console.log(`   Style loaded: ${map.isStyleLoaded()}`);
  
  // Check sources
  const regionalSource = map.getSource('regional-impacts');
  console.log('\n📦 Source Status:');
  if (regionalSource) {
    console.log('   ✅ regional-impacts source EXISTS');
    const sourceData = regionalSource._data || regionalSource.data;
    console.log(`   Features: ${sourceData?.features?.length || 0}`);
  } else {
    console.log('   ❌ regional-impacts source NOT FOUND');
  }
  
  // Check layers
  console.log('\n🎨 Layer Status:');
  const fillLayer = map.getLayer('regional-impacts-fill');
  const lineLayer = map.getLayer('regional-impacts-line');
  
  if (fillLayer) {
    console.log('   ✅ regional-impacts-fill EXISTS');
    const fillColor = map.getPaintProperty('regional-impacts-fill', 'fill-color');
    const fillOpacity = map.getPaintProperty('regional-impacts-fill', 'fill-opacity');
    console.log(`      Color: ${JSON.stringify(fillColor).substring(0, 50)}...`);
    console.log(`      Opacity: ${JSON.stringify(fillOpacity)}`);
    console.log(`      Visible: ${map.getLayoutProperty('regional-impacts-fill', 'visibility') !== 'none'}`);
  } else {
    console.log('   ❌ regional-impacts-fill NOT FOUND');
  }
  
  if (lineLayer) {
    console.log('   ✅ regional-impacts-line EXISTS');
    const lineColor = map.getPaintProperty('regional-impacts-line', 'line-color');
    const lineOpacity = map.getPaintProperty('regional-impacts-line', 'line-opacity');
    const lineWidth = map.getPaintProperty('regional-impacts-line', 'line-width');
    console.log(`      Color: ${JSON.stringify(lineColor).substring(0, 50)}...`);
    console.log(`      Opacity: ${JSON.stringify(lineOpacity).substring(0, 50)}...`);
    console.log(`      Width: ${JSON.stringify(lineWidth)}`);
    console.log(`      Visible: ${map.getLayoutProperty('regional-impacts-line', 'visibility') !== 'none'}`);
  } else {
    console.log('   ❌ regional-impacts-line NOT FOUND');
  }
  
  // Check layer order
  console.log('\n📊 Layer Stack (order):');
  const allLayers = map.getStyle()?.layers || [];
  const relevantLayers = allLayers
    .map((l, idx) => ({ id: l.id, index: idx }))
    .filter(l => 
      l.id.includes('regional') || 
      l.id.includes('damaged') || 
      l.id.includes('wms') ||
      l.id.includes('districts') ||
      l.id.includes('heatmap')
    );
  
  relevantLayers.forEach(layer => {
    const prefix = layer.id.includes('regional') ? '   👉' : '     ';
    console.log(`${prefix} [${layer.index}] ${layer.id}`);
  });
  
  // Check viewport
  console.log('\n🗺️ Map Viewport:');
  const bounds = map.getBounds();
  const center = map.getCenter();
  const zoom = map.getZoom();
  console.log(`   Center: [${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}]`);
  console.log(`   Zoom: ${zoom.toFixed(2)}`);
  console.log(`   Bounds: SW[${bounds.getSouthWest().lng.toFixed(2)}, ${bounds.getSouthWest().lat.toFixed(2)}]`);
  console.log(`           NE[${bounds.getNorthEast().lng.toFixed(2)}, ${bounds.getNorthEast().lat.toFixed(2)}]`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Debug check complete!');
  
  // Return summary for programmatic use
  return {
    hasSource: !!regionalSource,
    hasFillLayer: !!fillLayer,
    hasLineLayer: !!lineLayer,
    sourceFeatureCount: regionalSource?._data?.features?.length || 0,
    mapLoaded: map.loaded(),
    styleLoaded: map.isStyleLoaded(),
    zoom: zoom,
    center: center
  };
})();
