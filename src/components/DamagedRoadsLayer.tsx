'use client';

import { useEffect } from 'react';
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { LegendThreshold } from '@/data/realThreddsLayers';
import { ROAD_DAMAGE_COLORS } from '@/theme/colors';
import type { RoadProperties } from '@/types/realData';

interface DamagedRoadsLayerProps {
  map: MapLibreMap | null;
  data: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProperties> | null;
  thresholds?: LegendThreshold[];
  visible?: boolean;
  styleChangeCounter?: number;
}

/**
 * Component to render damaged roads on the map
 * Line thickness and color based on damage severity
 */
export default function DamagedRoadsLayer({
  map,
  data,
  thresholds,
  visible = true,
  styleChangeCounter = 0,
}: DamagedRoadsLayerProps) {
  const sourceId = 'damaged-roads';
  const layerId = 'damaged-roads-layer';
  const layerIdOutline = 'damaged-roads-outline';

  // Effect 1: Setup layers/sources - doesn't depend on data
  useEffect(() => {
    if (!map) return;

    // Define event handlers outside addLayers so we can remove them in cleanup
    const handleClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties as RoadProperties;

      const popupContent = document.createElement('div');
      popupContent.className = 'p-2';

      const title = document.createElement('h3');
      title.className = 'font-bold text-sm mb-1';
      title.textContent = props.road_name || 'Damaged Road';
      popupContent.appendChild(title);

      const damageP = document.createElement('p');
      damageP.className = 'text-xs';
      const damageStrong = document.createElement('strong');
      damageStrong.textContent = 'Total Damage:';
      damageP.appendChild(damageStrong);
      damageP.appendChild(
        document.createTextNode(' $' + Number(props.Total_Loss || 0).toLocaleString())
      );
      popupContent.appendChild(damageP);

      const roadTypeP = document.createElement('p');
      roadTypeP.className = 'text-xs';
      const roadTypeStrong = document.createElement('strong');
      roadTypeStrong.textContent = 'Road Type:';
      roadTypeP.appendChild(roadTypeStrong);
      roadTypeP.appendChild(document.createTextNode(' ' + (props.road_type || 'Unknown')));
      popupContent.appendChild(roadTypeP);

      const surfaceP = document.createElement('p');
      surfaceP.className = 'text-xs';
      const surfaceStrong = document.createElement('strong');
      surfaceStrong.textContent = 'Surface:';
      surfaceP.appendChild(surfaceStrong);
      surfaceP.appendChild(document.createTextNode(' ' + (props.Surface || 'Unknown')));
      popupContent.appendChild(surfaceP);

      new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(popupContent).addTo(map);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    // Function to add layers and sources
    const addLayers = () => {
      // Add source with empty data initially
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Build color and width expressions from thresholds
      let colorExpression: maplibregl.ExpressionSpecification;
      let widthExpression: maplibregl.ExpressionSpecification;
      let outlineWidthExpression: maplibregl.ExpressionSpecification;

      if (thresholds && thresholds.length > 0) {
        const sorted = [...thresholds].sort((a, b) => a.value - b.value);
        const finiteThresholds = sorted.filter(t => isFinite(t.value));

        // Use first color as base (for values below first threshold)
        const baseColor = finiteThresholds[0]?.color || ROAD_DAMAGE_COLORS.light;
        const colorStops: (string | number)[] = [];
        const widthStops: number[] = [];
        const outlineStops: number[] = [];

        finiteThresholds.forEach((t, index) => {
          colorStops.push(t.value, t.color);
          // Width progression: 4px base, +1.5px per threshold step
          const width = 4 + index * 1.5;
          widthStops.push(t.value, width);
          // Outline is always 2px wider than main line
          outlineStops.push(t.value, width + 2);
        });

        // Use coalesce to handle null/undefined values
        const lossProperty: maplibregl.ExpressionSpecification = [
          'coalesce',
          ['get', 'Total_Loss'],
          0,
        ];
        colorExpression = ['step', lossProperty, baseColor, ...colorStops];
        widthExpression = ['step', lossProperty, 4, ...widthStops];
        outlineWidthExpression = ['step', lossProperty, 6, ...outlineStops];
      } else {
        // Default thresholds: $1K, $2K, $3K (aligned with legend)
        const lossProperty: maplibregl.ExpressionSpecification = [
          'coalesce',
          ['get', 'Total_Loss'],
          0,
        ];
        colorExpression = [
          'step',
          lossProperty,
          ROAD_DAMAGE_COLORS.light,
          1000,
          ROAD_DAMAGE_COLORS.moderate,
          2000,
          ROAD_DAMAGE_COLORS.heavy,
          3000,
          ROAD_DAMAGE_COLORS.severe,
        ];
        widthExpression = ['step', lossProperty, 4, 1000, 5.5, 2000, 7, 3000, 8.5];
        outlineWidthExpression = ['step', lossProperty, 6, 1000, 7.5, 2000, 9, 3000, 10.5];
      }

      // Add outline layer for visibility
      if (!map.getLayer(layerIdOutline)) {
        map.addLayer({
          id: layerIdOutline,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#000000',
            'line-width': outlineWidthExpression,
            'line-opacity': 0.4,
          },
        });
      }

      // Add main line layer - render above regional polygons, below symbols
      if (!map.getLayer(layerId)) {
        // Find the first symbol layer to insert before (roads should be above fills, below labels)
        const layers = map.getStyle()?.layers || [];
        const firstSymbolId = layers.find(layer => layer.type === 'symbol')?.id;

        map.addLayer(
          {
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              // Dynamic width based on thresholds - scales with damage severity
              'line-width': widthExpression,
              // Color by damage severity - uses theme colors or custom thresholds
              'line-color': colorExpression,
              // Zoom-based opacity: subtle at mid-zoom, clearer when zoomed in
              // Prevents overwhelming regional fills while maintaining detail at high zoom
              'line-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                7,
                0.65, // More subtle at mid-zoom
                10,
                0.85, // Gradually increase
                14,
                0.95, // Nearly full opacity when zoomed in
              ],
            },
          },
          firstSymbolId
        ); // Insert before symbol layers for proper z-order
      }

      // Add event listeners using handlers defined in outer scope
      map.on('click', layerId, handleClick);
      map.on('mouseenter', layerId, handleMouseEnter);
      map.on('mouseleave', layerId, handleMouseLeave);

      // Apply current visibility immediately to avoid style-load race.
      const visibility = visible ? 'visible' : 'none';
      [layerId, layerIdOutline].forEach(id => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visibility);
        }
      });
    };

    // Check if style is loaded before adding layers
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }

    return () => {
      // Cleanup on unmount - remove event listeners, layers, and sources
      if (!map || !map.getStyle()) return;

      try {
        // Remove event listeners
        map.off('click', layerId, handleClick);
        map.off('mouseenter', layerId, handleMouseEnter);
        map.off('mouseleave', layerId, handleMouseLeave);

        // Remove layers
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(layerIdOutline)) {
          map.removeLayer(layerIdOutline);
        }
        // Remove source
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (_e) {
        // Layers/sources might not exist
      }
    };
  }, [map, styleChangeCounter, visible, thresholds]); // Re-run if thresholds/visibility/style change (data handled in Effect 2)

  // Effect 2: Update data in existing source when data changes
  useEffect(() => {
    if (!map || !data) return;

    const applyData = () => {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (source && typeof source.setData === 'function') {
        source.setData(data as GeoJSON.FeatureCollection);
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      // Handle race where data arrives before style/source is ready.
      map.once('load', applyData);
    }
  }, [map, data]); // Only depend on map and data

  // Effect 3: Handle visibility changes
  useEffect(() => {
    if (!map) return;

    // Wait for style to be loaded before accessing layers
    if (!map.isStyleLoaded()) return;

    const visibility = visible ? 'visible' : 'none';
    [layerId, layerIdOutline].forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visibility);
      }
    });
  }, [map, visible]); // Only depend on map and visible

  return null;
}
