/**
 * Map Highlight Utility
 *
 * Provides visual feedback when zooming to map features by adding
 * temporary highlight animations (pulse, flash, glow effects).
 */

import { Map as MapLibreMap } from 'maplibre-gl';
import { logger } from '@/utils/logger';

export interface HighlightOptions {
  duration?: number; // Animation duration in ms (default: 2000)
  pulseCount?: number; // Number of pulse cycles (default: 3)
  color?: string; // Highlight color (default: '#fbbf24' - amber-400)
  maxRadius?: number; // Maximum pulse radius in pixels (default: 50)
  type?: 'point' | 'line' | 'polygon'; // Feature type
}

const DEFAULT_OPTIONS: Required<HighlightOptions> = {
  duration: 2000,
  pulseCount: 3,
  color: '#fbbf24',
  maxRadius: 50,
  type: 'point',
};

/**
 * Highlight a point feature with a pulsing ring animation
 */
export function highlightPoint(
  map: MapLibreMap,
  coordinates: [number, number],
  options: HighlightOptions = {}
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceId = `highlight-${Date.now()}`;
  const layerId = `highlight-layer-${Date.now()}`;

  let animationFrame: number | null = null;
  const startTime = Date.now();

  try {
    // Create GeoJSON source for the highlight
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates,
        },
        properties: {},
      },
    });

    // Add pulsing circle layer
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 0,
        'circle-color': opts.color,
        'circle-opacity': 1,
        'circle-stroke-width': 3,
        'circle-stroke-color': opts.color,
        'circle-stroke-opacity': 1,
      },
    });

    // Animation function
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / opts.duration, 1);

      if (progress >= 1) {
        // Animation complete - cleanup
        cleanup();
        return;
      }

      // Calculate pulse based on number of cycles
      const cycleProgress = (progress * opts.pulseCount) % 1;
      const pulse = Math.sin(cycleProgress * Math.PI);

      // Animate radius and opacity
      const radius = pulse * opts.maxRadius;
      const opacity = (1 - cycleProgress) * (1 - progress * 0.5); // Fade out over time

      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'circle-radius', radius);
          map.setPaintProperty(layerId, 'circle-opacity', opacity * 0.3);
          map.setPaintProperty(layerId, 'circle-stroke-opacity', opacity);
        }
      } catch (_e) {
        // Layer removed, stop animation
        cleanup();
        return;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    // Start animation
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    logger.warn('Failed to create highlight animation:', error);
  }

  // Cleanup function
  const cleanup = () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    try {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (_e) {
      // Already removed
    }
  };

  return cleanup;
}

/**
 * Highlight a line feature with a pulsing glow effect
 */
export function highlightLine(
  map: MapLibreMap,
  coordinates: [number, number][],
  options: HighlightOptions = {}
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceId = `highlight-line-${Date.now()}`;
  const layerId = `highlight-line-layer-${Date.now()}`;

  let animationFrame: number | null = null;
  const startTime = Date.now();

  try {
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {},
      },
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': opts.color,
        'line-width': 4,
        'line-opacity': 1,
      },
    });

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / opts.duration, 1);

      if (progress >= 1) {
        cleanup();
        return;
      }

      const cycleProgress = (progress * opts.pulseCount) % 1;
      const pulse = Math.sin(cycleProgress * Math.PI);

      const width = 4 + pulse * 8;
      const opacity = (1 - cycleProgress) * (1 - progress * 0.5);

      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-width', width);
          map.setPaintProperty(layerId, 'line-opacity', opacity);
        }
      } catch (_e) {
        cleanup();
        return;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    logger.warn('Failed to create line highlight:', error);
  }

  const cleanup = () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    try {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (_e) {
      // Already removed
    }
  };

  return cleanup;
}

/**
 * Highlight a polygon feature with a pulsing border
 */
export function highlightPolygon(
  map: MapLibreMap,
  coordinates: [number, number][] | [number, number][][],
  options: HighlightOptions = {}
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceId = `highlight-polygon-${Date.now()}`;
  const fillLayerId = `highlight-polygon-fill-${Date.now()}`;
  const lineLayerId = `highlight-polygon-line-${Date.now()}`;

  let animationFrame: number | null = null;
  const startTime = Date.now();

  try {
    // Normalize coordinates to handle both single ring and multi-ring polygons
    const polygonCoords = Array.isArray(coordinates[0]?.[0])
      ? (coordinates as [number, number][][])
      : [coordinates as [number, number][]];

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: polygonCoords,
        },
        properties: {},
      },
    });

    // Fill layer
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': opts.color,
        'fill-opacity': 0.2,
      },
    });

    // Border layer
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': opts.color,
        'line-width': 3,
        'line-opacity': 1,
      },
    });

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / opts.duration, 1);

      if (progress >= 1) {
        cleanup();
        return;
      }

      const cycleProgress = (progress * opts.pulseCount) % 1;
      const pulse = Math.sin(cycleProgress * Math.PI);

      const lineWidth = 3 + pulse * 4;
      const opacity = (1 - cycleProgress) * (1 - progress * 0.5);
      const fillOpacity = opacity * 0.2;

      try {
        if (map.getLayer(lineLayerId)) {
          map.setPaintProperty(lineLayerId, 'line-width', lineWidth);
          map.setPaintProperty(lineLayerId, 'line-opacity', opacity);
          map.setPaintProperty(fillLayerId, 'fill-opacity', fillOpacity);
        }
      } catch (_e) {
        cleanup();
        return;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    logger.warn('Failed to create polygon highlight:', error);
  }

  const cleanup = () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    try {
      if (map.getLayer(lineLayerId)) {
        map.removeLayer(lineLayerId);
      }
      if (map.getLayer(fillLayerId)) {
        map.removeLayer(fillLayerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (_e) {
      // Already removed
    }
  };

  return cleanup;
}

/**
 * Smart highlight that automatically detects feature type
 */
export function highlightFeature(
  map: MapLibreMap,
  feature: GeoJSON.Feature,
  options: HighlightOptions = {}
): () => void {
  const geometry = feature.geometry;

  if (geometry.type === 'Point') {
    return highlightPoint(map, geometry.coordinates as [number, number], {
      ...options,
      type: 'point',
    });
  } else if (geometry.type === 'LineString') {
    return highlightLine(map, geometry.coordinates as [number, number][], {
      ...options,
      type: 'line',
    });
  } else if (geometry.type === 'Polygon') {
    return highlightPolygon(
      map,
      geometry.coordinates as [number, number][] | [number, number][][],
      {
        ...options,
        type: 'polygon',
      }
    );
  } else if (geometry.type === 'MultiPolygon') {
    // For MultiPolygon, highlight the first polygon
    return highlightPolygon(
      map,
      geometry.coordinates[0] as [number, number][] | [number, number][][],
      {
        ...options,
        type: 'polygon',
      }
    );
  }

  logger.warn('Unsupported geometry type for highlight:', geometry.type);
  return () => {}; // No-op cleanup
}
