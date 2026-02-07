"use client";

import { useEffect } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import { Event } from "@/types";

interface IntensityHeatmapLayerProps {
  map: MapLibreMap | null;
  events: Event[];
  visible?: boolean;
}

export default function IntensityHeatmapLayer({
  map,
  events,
  visible = true,
}: IntensityHeatmapLayerProps) {
  useEffect(() => {
    if (!map || !visible || !events || events.length === 0) return;

    const loadHeatmap = () => {
      const sourceId = "intensity-heatmap-source";
      const layerId = "intensity-heatmap";

      try {
        // Create a GeoJSON with events as points, weighted by economic damage
        const features = events
          .filter((e) => e.location?.lat && e.location?.lng)
          .map((event) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [event.location.lng, event.location.lat],
            },
            properties: {
              damage: event.economicDamage || 0,
              intensity: Math.min(
                (event.economicDamage || 0) / 10000000, // Normalize to 0-1 scale
                1
              ),
            },
          }));

        if (features.length === 0) return;

        const geojson = {
          type: "FeatureCollection" as const,
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
          type: "geojson",
          data: geojson as any,
        });

        // Add heatmap layer with intensity gradient
        // Insert before interactive layers (damaged buildings/roads) to keep at bottom
        let beforeId: string | undefined = undefined;
        if (map.getLayer('damaged-buildings-layer')) {
          beforeId = 'damaged-buildings-layer';
        } else if (map.getLayer('damaged-buildings-clusters')) {
          beforeId = 'damaged-buildings-clusters';  
        } else if (map.getLayer('damaged-roads-layer')) {
          beforeId = 'damaged-roads-layer';
        } else if (map.getLayer('cyclone-forecast-track-line')) {
          beforeId = 'cyclone-forecast-track-line';
        } else if (map.getLayer('regional-impacts-fill')) {
          beforeId = 'regional-impacts-fill';
        }
        
        map.addLayer(
          {
            id: layerId,
            type: "heatmap",
            source: sourceId,
            paint: {
              // Increase the heatmap weight based on damage
              "heatmap-weight": [
                "interpolate",
                ["linear"],
                ["get", "intensity"],
                0,
                0,
                1,
                1,
              ],
              // Increase the heatmap color saturation with higher damage intensities
              "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                1,
                9,
                3,
              ],
              // Colors transition from yellow to red based on damage
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(0, 255, 0, 0)", // Transparent green for low
                0.2,
                "#fee5d9", // Light orange
                0.4,
                "#fcae91", // Orange
                0.6,
                "#fb6a4a", // Light red
                0.8,
                "#de2d26", // Red
                1,
                "#a50f15", // Dark red
              ],
              // Adjust heatmap radius by zoom level
              "heatmap-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                2,
                9,
                20,
              ],
              // Adjust opacity
              "heatmap-opacity": 0.7,
            },
          },
          beforeId
        );

        console.log("✅ Intensity heatmap layer added");
      } catch (error) {
        console.error("Error loading intensity heatmap:", error);
      }
    };

    // Wait for map to be ready
    if (map.isStyleLoaded()) {
      loadHeatmap();
    } else {
      map.once("load", loadHeatmap);
    }

    return () => {
      // Cleanup
      try {
        if (map.getLayer("intensity-heatmap")) {
          map.removeLayer("intensity-heatmap");
        }
        if (map.getSource("intensity-heatmap-source")) {
          map.removeSource("intensity-heatmap-source");
        }
      } catch (e) {
        // Layer might not exist
      }
    };
  }, [map, events, visible]);

  return null;
}
