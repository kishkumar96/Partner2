"use client";

import { useEffect } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

interface DamagedRoadsLayerProps {
  map: MapLibreMap | null;
  data: any;
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
    const handleClick = (e: any) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties;

      const html = `
        <div class="p-2">
          <h3 class="font-bold text-sm mb-1">Damaged Road</h3>
          <p class="text-xs"><strong>Damage:</strong> $${Number(
            props.Wind_Loss || 0
          ).toLocaleString()}</p>
          <p class="text-xs"><strong>Exposure:</strong> $${Number(
            props.Exposure || 0
          ).toLocaleString()}</p>
          <p class="text-xs"><strong>Damage Ratio:</strong> ${(
            (Number(props.Damage_Ratio) || 0) * 100
          ).toFixed(1)}%</p>
          <p class="text-xs"><strong>Road Type:</strong> ${
            props.Road_Type || "Unknown"
          }</p>
          <p class="text-xs"><strong>Surface:</strong> ${
            props.Surface || "Unknown"
          }</p>
        </div>
      `;

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(html)
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
          data: data,
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
              "interpolate",
              ["linear"],
              ["get", "Total_Loss"],
              0, 5,
              10000, 7,
              50000, 9,
              100000, 11,
            ],
            "line-opacity": 0.3,
          },
        });
      }

      // Add main line layer
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            // Width based on damage severity
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "Total_Loss"],
              0, 3,
              10000, 5,
              50000, 7,
              100000, 9,
            ],
            // Color by damage severity
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "Total_Loss"],
              0, "#10b981", // green - minimal
              5000, "#fbbf24", // yellow - moderate
              20000, "#f97316", // orange - significant
              50000, "#ef4444", // red - severe
              100000, "#991b1b", // dark red - catastrophic
            ],
            "line-opacity": 0.8,
          },
        });
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
