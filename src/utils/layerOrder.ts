/**
 * Deterministic Layer Z-Order System
 *
 * This module defines the canonical ordering of all map layers to ensure
 * consistent visual hierarchy across the application.
 *
 * STACK ORDER (bottom to top):
 * 1. WMS raster layers (basemap-like overlays)
 * 2. Regional impacts (fill + outline)
 * 3. Intensity heatmap
 * 4. Cyclone tracks and forecast
 * 5. Damaged roads
 * 6. Damaged buildings (clusters + individual)
 * 7. Popups (managed by MapLibre, always on top)
 *
 * Usage:
 * - Use LAYER_ORDER to get the relative order of layers
 * - Use getBeforeLayerId() to determine which layer to insert before
 * - All layers should use beforeId when calling map.addLayer()
 */

/**
 * Canonical layer ordering from bottom (0) to top (highest number)
 * Lower z-index = rendered first (below other layers)
 */
export const LAYER_ORDER = {
  // WMS raster layers at the bottom (basemap-like)
  'wms-wind-layer': 10,
  'wms-rainfall-layer': 11,
  'wms-storm-surge-layer': 12,
  'wms-wave-height-layer': 13,

  // Regional polygons next (context layer)
  'regional-impacts-fill': 20,
  'regional-impacts-line': 21,

  // District polygons
  'districts-fill': 25,
  'districts-outline': 26,

  // Intensity heatmap (density visualization)
  'intensity-heatmap': 30,

  // Cyclone tracks and forecasts
  'cyclone-forecast-track-line': 40,
  'cyclone-forecast-points': 41,
  'cyclone-historical-track': 42,

  // Damaged infrastructure
  'damaged-roads-layer': 50,
  'damaged-roads-outline': 51,

  // Buildings (clusters render before individual points)
  'damaged-buildings-clusters': 60,
  'damaged-buildings-cluster-count': 61,
  'damaged-buildings-layer': 62,
  'damaged-buildings-outline': 63,

  // PDIE data layers
  'pdie-exposure-layer': 70,
  'pdie-vulnerability-layer': 71,

  // Popups are managed by MapLibre and always render on top
} as const;

/**
 * Get the layer ID that a new layer should be inserted before
 * This ensures proper z-ordering without recreating all layers
 *
 * @param map - MapLibre map instance
 * @param targetLayerId - The layer you want to add
 * @returns The ID of the layer to insert before, or undefined (top)
 */
export function getBeforeLayerId(map: any, targetLayerId: string): string | undefined {
  if (!map || !map.getStyle) return undefined;

  const targetOrder = LAYER_ORDER[targetLayerId as keyof typeof LAYER_ORDER];
  if (targetOrder === undefined) {
    console.warn(`Layer ${targetLayerId} not found in LAYER_ORDER, adding to top`);
    return undefined;
  }

  // Get all existing layers on the map
  const existingLayers = map.getStyle()?.layers || [];

  // Find the first layer with a higher z-order than our target
  for (const layer of existingLayers) {
    let layerOrder: number | undefined = LAYER_ORDER[layer.id as keyof typeof LAYER_ORDER];

    // Handle dynamic WMS layer IDs (wms-layer-*)
    // These should be at the bottom, below regional impacts
    if (layerOrder === undefined && layer.id.startsWith('wms-layer-')) {
      layerOrder = 15;
    }

    if (layerOrder !== undefined && layerOrder > targetOrder) {
      return layer.id;
    }
  }

  // If no layer has a higher order, insert before the first symbol layer
  // This prevents our layers from covering up map labels
  const firstSymbolLayer = existingLayers.find((layer: any) => layer.type === 'symbol');
  return firstSymbolLayer?.id;
}

/**
 * Validate that all layers are in the correct z-order
 * Useful for debugging layer ordering issues
 *
 * @param map - MapLibre map instance
 * @returns Array of layers in current order with their expected order
 */
export function validateLayerOrder(map: any): Array<{
  id: string;
  currentIndex: number;
  expectedOrder: number | undefined;
  isCorrect: boolean;
}> {
  if (!map || !map.getStyle) return [];

  const existingLayers = map.getStyle()?.layers || [];
  const results = [];

  for (let i = 0; i < existingLayers.length; i++) {
    const layer = existingLayers[i];
    const expectedOrder = LAYER_ORDER[layer.id as keyof typeof LAYER_ORDER];

    if (expectedOrder !== undefined) {
      // Check if this layer is in the correct position relative to others
      let isCorrect = true;
      for (let j = 0; j < existingLayers.length; j++) {
        const otherLayer = existingLayers[j];
        const otherOrder = LAYER_ORDER[otherLayer.id as keyof typeof LAYER_ORDER];

        if (otherOrder !== undefined) {
          // If this layer should be below the other, but it's rendered after (higher index)
          if (expectedOrder < otherOrder && i > j) {
            isCorrect = false;
            break;
          }
          // If this layer should be above the other, but it's rendered before (lower index)
          if (expectedOrder > otherOrder && i < j) {
            isCorrect = false;
            break;
          }
        }
      }

      results.push({
        id: layer.id,
        currentIndex: i,
        expectedOrder,
        isCorrect,
      });
    }
  }

  return results;
}

/**
 * Log the current layer order for debugging
 * @param map - MapLibre map instance
 */
export function debugLayerOrder(map: any): void {
  const validation = validateLayerOrder(map);
  console.group('🗺️ Layer Z-Order Validation');
  console.table(validation);

  const incorrect = validation.filter(v => !v.isCorrect);
  if (incorrect.length > 0) {
    console.warn(`❌ ${incorrect.length} layers are not in correct z-order:`, incorrect);
  } else {
    console.log('✅ All layers are correctly ordered');
  }
  console.groupEnd();
}
