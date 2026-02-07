"use client";

import { useEffect } from "react";
import { Map as MapLibreMap } from "maplibre-gl";

interface DamagedRoadsLayerProps {
  map: MapLibreMap | null;
  data: any;
  visible?: boolean;
}

/**
 * Component to render damaged roads on the map
 * Line thickness and color based on damage severity
 */
export default function DamagedRoadsLayer({
  map,
  data,
  visible = true,
}: DamagedRoadsLayerProps) {
  useEffect(() => {
    if (!map || !data) return;

    const sourceId = "damaged-roads";
    const layerId = "damaged-roads-layer";
    const layerIdOutline = "damaged-roads-outline";

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

      // Define event handlers
      const handleClick = (e: any) => {
        if (!e.features || e.features.length === 0) return;
        
        const feature = e.features[0];
        const props = feature.properties;
        
        const html = `
          <div style="font-family: system-ui; padding: 4px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Damaged Road</h3>
            <div style="font-size: 12px; line-height: 1.6;">
              <p style="margin: 4px 0;"><strong>Type:</strong> ${props?.Type || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Surface:</strong> ${props?.Surface || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Condition:</strong> ${props?.Condition || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Length:</strong> ${Number(props?.Length_km || 0).toFixed(2)} km</p>
              <p style="margin: 4px 0;"><strong>Flood Depth:</strong> ${Number(props?.Inundation_m || 0).toFixed(2)} m</p>
              <p style="margin: 4px 0; color: #ef4444; font-weight: 600;"><strong>Total Loss:</strong> $${Number(props?.Total_Loss || 0).toLocaleString()}</p>
              <p style="margin: 4px 0; font-size: 10px; color: #666;"><strong>Region:</strong> ${props?.Admin1_Region || 'N/A'}</p>
            </div>
          </div>
        `;
        
        new (window as any).maplibregl.Popup()
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

      // Add event listeners
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
      // Cleanup on unmount - remove layers and sources
      try {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(layerIdOutline)) {
          map.removeLayer(layerIdOutline);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        // Layers/sources might not exist
      }
    };
  }, [map, data, visible]);

  return null;
}
