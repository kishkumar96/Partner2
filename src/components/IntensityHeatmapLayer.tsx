'use client';

import { useEffect } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { Event } from '@/types';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { LAYER_OPACITY } from '@/utils/colorSystem';

interface IntensityHeatmapLayerProps {
  map: MapLibreMap | null;
  events: Event[];
  visible?: boolean;
  /**
   * Optional normalization factor for heatmap intensity
   * If not provided, will use the maximum damage value from events
   * Exposed to allow users to understand what "hotter" means
   * @example 10000000 (10M USD) - anything above this is max heat
   */
  maxDamageScale?: number;
}

export default function IntensityHeatmapLayer({
  map,
  events,
  visible = true,
  maxDamageScale,
}: IntensityHeatmapLayerProps) {
  useEffect(() => {
    if (!map || !visible || !events || events.length === 0) return;

    const loadHeatmap = () => {
      const sourceId = 'intensity-heatmap-source';
      const layerId = 'intensity-heatmap';

      try {
        // Calculate maximum damage across all events for auto-scaling
        const maxDamage = Math.max(
          ...events.map(e => e.totalEconomicDamage || 0),
          1 // Avoid division by zero
        );

        // Use provided scale or dynamic normalization based on actual data range
        // This ensures the heatmap intensity scales correctly regardless of data magnitude
        const normalizationFactor = maxDamageScale || (maxDamage > 0 ? maxDamage : 10000000);

        // Log the scaling for transparency (helps users understand "hotter" areas)
        console.log(
          `📊 Heatmap scaling: max damage = $${maxDamage.toLocaleString()}, normalization = $${normalizationFactor.toLocaleString()}`
        );

        // Create a GeoJSON with events as points, weighted by economic damage
        const features = events
          .filter(e => e.location?.lat && e.location?.lng)
          .map(event => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [event.location.lng, event.location.lat],
            },
            properties: {
              damage: event.totalEconomicDamage || 0,
              // Normalize to 0-1 scale based on actual maximum damage
              intensity: Math.min((event.totalEconomicDamage || 0) / normalizationFactor, 1),
            },
          }));

        if (features.length === 0) return;

        const geojson = {
          type: 'FeatureCollection' as const,
          features,
        };

        // Remove existing source and layer
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }

        // Add source
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojson as any,
        });

        // Use deterministic z-order system for consistent layer placement
        const beforeId = getBeforeLayerId(map, 'intensity-heatmap');

        map.addLayer(
          {
            id: layerId,
            type: 'heatmap',
            source: sourceId,
            paint: {
              // Increase the heatmap weight based on damage
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
              // Increase the heatmap color saturation with higher damage intensities
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
              // Colors transition from yellow to red based on damage
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(0, 255, 0, 0)', // Transparent green for low
                0.2,
                '#fee5d9', // Light orange
                0.4,
                '#fcae91', // Orange
                0.6,
                '#fb6a4a', // Light red
                0.8,
                '#de2d26', // Red
                1,
                '#a50f15', // Dark red
              ],
              // Adjust heatmap radius by zoom level
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
              // Use unified opacity from colorSystem for consistency
              // Lower opacity prevents overwhelming choropleth, roads, and buildings
              'heatmap-opacity': LAYER_OPACITY.heatmap.base,
            },
          },
          beforeId
        );

        console.log('Intensity heatmap layer added');
      } catch (error) {
        console.error('Error loading intensity heatmap:', error);
      }
    };

    // Wait for map to be ready
    if (map.isStyleLoaded()) {
      loadHeatmap();
    } else {
      map.once('load', loadHeatmap);
    }

    return () => {
      // Cleanup
      try {
        if (map.getLayer('intensity-heatmap')) {
          map.removeLayer('intensity-heatmap');
        }
        if (map.getSource('intensity-heatmap-source')) {
          map.removeSource('intensity-heatmap-source');
        }
      } catch (_e) {
        // Layer might not exist
      }
    };
  }, [map, events, visible, maxDamageScale]);

  return null;
}
