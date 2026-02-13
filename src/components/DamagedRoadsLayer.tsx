"use client";

import { useEffect } from "react";
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
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
  useEffect(() => {
    if (!map || !data) return;

    const sourceId = "damaged-roads";
    const layerId = "damaged-roads-layer";
    const layerIdOutline = "damaged-roads-outline";

    // Define event handlers outside addLayers so we can remove them in cleanup
    const handleClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties as RoadProperties;

      const popupContent = document.createElement("div");
      popupContent.className = "p-2";

      const title = document.createElement("h3");
      title.className = "font-bold text-sm mb-1";
      title.textContent = "Damaged Road";
      popupContent.appendChild(title);

      const damageP = document.createElement("p");
      damageP.className = "text-xs";
      const damageStrong = document.createElement("strong");
      damageStrong.textContent = "Damage:";
      damageP.appendChild(damageStrong);
      damageP.appendChild(document.createTextNode(" $" + Number(props.Wind_Loss || 0).toLocaleString()));
      popupContent.appendChild(damageP);

      const exposureP = document.createElement("p");
      exposureP.className = "text-xs";
      const exposureStrong = document.createElement("strong");
      exposureStrong.textContent = "Exposure:";
      exposureP.appendChild(exposureStrong);
      exposureP.appendChild(document.createTextNode(" $" + Number(props.Exposure || 0).toLocaleString()));
      popupContent.appendChild(exposureP);

      const ratioP = document.createElement("p");
      ratioP.className = "text-xs";
      const ratioStrong = document.createElement("strong");
      ratioStrong.textContent = "Damage Ratio:";
      ratioP.appendChild(ratioStrong);
      const ratioValue = ((Number(props.Damage_Ratio) || 0) * 100).toFixed(1) + "%";
      ratioP.appendChild(document.createTextNode(" " + ratioValue));
      popupContent.appendChild(ratioP);

      const roadTypeP = document.createElement("p");
      roadTypeP.className = "text-xs";
      const roadTypeStrong = document.createElement("strong");
      roadTypeStrong.textContent = "Road Type:";
      roadTypeP.appendChild(roadTypeStrong);
      roadTypeP.appendChild(document.createTextNode(" " + (props.Road_Type || "Unknown")));
      popupContent.appendChild(roadTypeP);

      const surfaceP = document.createElement("p");
      surfaceP.className = "text-xs";
      const surfaceStrong = document.createElement("strong");
      surfaceStrong.textContent = "Surface:";
      surfaceP.appendChild(surfaceStrong);
      surfaceP.appendChild(document.createTextNode(" " + (props.Surface || "Unknown")));
      popupContent.appendChild(surfaceP);

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setDOMContent(popupContent)
        .addTo(map);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    // Function to add layers and sources
    const addLayers = () => {
      // Add source if it doesn't exist
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: data as GeoJSON.FeatureCollection,
        });
      }

      // Add outline layer for visibility
      if (!map.getLayer(layerIdOutline)) {
        map.addLayer({
          id: layerIdOutline,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#000000",
            "line-width": [
              "step",
              ["get", "Total_Loss"],
              5,        // < $5K
              5000, 7,   // $5K-$25K
              25000, 9,  // $25K-$75K
              75000, 11  // > $75K
            ],
            "line-opacity": 0.4,
          },
        });
      }

      // Add main line layer - MUST render above regional polygons
      if (!map.getLayer(layerId)) {
        // Find the first symbol layer to insert before
        const layers = map.getStyle()?.layers || [];
        const firstSymbolId = layers.find(layer => layer.type === 'symbol')?.id;
        
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            // Width based on damage severity - matches legend
            "line-width": [
              "step",
              ["get", "Total_Loss"],
              3,       // < $5K
              5000, 5,  // $5K-$25K
              25000, 7, // $25K-$75K
              75000, 9  // > $75K
            ],
            // Color by damage severity - using theme colors
            "line-color": [
              "step",
              ["get", "Total_Loss"],
              ROAD_DAMAGE_COLORS.light,    // < $5K
              5000, ROAD_DAMAGE_COLORS.moderate,   // $5K-$25K
              25000, ROAD_DAMAGE_COLORS.heavy,     // $25K-$75K
              75000, ROAD_DAMAGE_COLORS.severe     // > $75K
            ],
            "line-opacity": 0.9,
          },
        }, firstSymbolId); // Insert before symbol layers for proper z-order
      }

      // Add event listeners using handlers defined in outer scope
      map.on("click", layerId, handleClick);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);

      // Toggle visibility
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          visible ? "visible" : "none"
        );
      }
      if (map.getLayer(layerIdOutline)) {
        map.setLayoutProperty(
          layerIdOutline,
          "visibility",
          visible ? "visible" : "none"
        );
      }
    };

    // Check if style is loaded before adding layers
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }

    return () => {
      // Cleanup on unmount - remove event listeners, layers, and sources
      try {
        // Remove event listeners
        map.off("click", layerId, handleClick);
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mouseleave", layerId, handleMouseLeave);

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
      } catch (e) {
        // Layers/sources might not exist
      }
    };
  }, [map, data, visible, styleChangeCounter]);

  return null;
}
