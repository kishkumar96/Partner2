'use client';

import { useEffect } from 'react';
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { ROAD_DAMAGE_COLORS } from '@/theme/colors';
import type { RoadProperties } from '@/types/realData';

interface DamagedRoadsLayerProps {
  map: MapLibreMap | null;
  data: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProperties> | null;
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

      // Add outline layer for visibility
      if (!map.getLayer(layerIdOutline)) {
        map.addLayer({
          id: layerIdOutline,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#000000',
            'line-width': [
              'step',
              ['get', 'Total_Loss'],
              5, // < $5K
              5000,
              7, // $5K-$25K
              25000,
              9, // $25K-$75K
              75000,
              11, // > $75K
            ],
            'line-opacity': 0.4,
          },
        });
      }

      // Add main line layer - MUST render above regional polygons
      if (!map.getLayer(layerId)) {
        // Find the first symbol layer to insert before
        const layers = map.getStyle()?.layers || [];
        const firstSymbolId = layers.find(layer => layer.type === 'symbol')?.id;

        map.addLayer(
          {
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              // Width based on damage severity - adjusted for actual data range ($500-$5K)
              'line-width': [
                'step',
                ['get', 'Total_Loss'],
                4, // < $1K - base roads
                1000,
                5, // $1K-$2K - light damage
                2000,
                7, // $2K-$3K - moderate damage
                3000,
                9, // > $3K - severe damage
              ],
              // Color by damage severity - using theme colors
              'line-color': [
                'step',
                ['get', 'Total_Loss'],
                ROAD_DAMAGE_COLORS.light, // < $1K
                1000,
                ROAD_DAMAGE_COLORS.moderate, // $1K-$2K
                2000,
                ROAD_DAMAGE_COLORS.heavy, // $2K-$3K
                3000,
                ROAD_DAMAGE_COLORS.severe, // > $3K
              ],
              // Zoom-based opacity: more subtle at mid-zoom, clearer when zoomed in
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
  }, [map, styleChangeCounter]); // Only depend on map and styleChangeCounter

  // Effect 2: Update data in existing source when data changes
  useEffect(() => {
    if (!map || !data) return;

    // Wait for style to be loaded before accessing sources
    if (!map.isStyleLoaded()) return;

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source && typeof source.setData === 'function') {
      source.setData(data as GeoJSON.FeatureCollection);
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
