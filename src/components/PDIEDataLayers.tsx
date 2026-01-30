"use client";

import { useEffect, useState } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import { CountryCode } from "@/types/thredds";
import { loadPDIEOutputData } from "@/utils/geotiffLoader";

interface PDIEDataLayersProps {
  map: MapLibreMap | null;
  countryCode: CountryCode | null;
  visible: boolean;
}

export default function PDIEDataLayers({
  map,
  countryCode,
  visible,
}: PDIEDataLayersProps) {
  const [loading, setLoading] = useState(false);

  // Load PDIE output data layers
  useEffect(() => {
    if (!map || !visible || !countryCode) return;

    const loadPDIELayers = async () => {
      setLoading(true);

      try {
        // Wait for map style to load
        if (!map.isStyleLoaded()) {
          const onStyleLoad = () => {
            map.off('styledata', onStyleLoad);
            loadPDIELayers();
          };
          map.on('styledata', onStyleLoad);
          return;
        }

        console.log(`📊 Loading PDIE output data for ${countryCode}...`);

        // Load exposure points
        const exposureData = await loadPDIEOutputData(countryCode, 'exposure');
        if (exposureData) {
          const sourceId = `pdie-exposure-${countryCode}`;
          const layerId = `pdie-exposure-layer-${countryCode}`;

          // Remove existing layer/source
          try {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
          } catch (e) { /* ignore */ }

          // Add exposure points
          map.addSource(sourceId, {
            type: "geojson",
            data: exposureData,
          });

          map.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 2,
                12, 4,
                16, 8
              ],
              "circle-color": [
                "match",
                ["get", "Asset"],
                "Evacuation Centre", "#10b981",
                "Health Facility", "#ef4444",
                "School", "#3b82f6",
                "Building", "#f59e0b",
                "Road", "#6b7280",
                "#8b5cf6" // default
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#ffffff",
              "circle-opacity": 0.8,
            },
          });

          console.log(`✅ Added PDIE exposure layer with ${exposureData.features?.length || 0} points`);
        }

        // Load regional impacts
        const impactsData = await loadPDIEOutputData(countryCode, 'impacts');
        if (impactsData) {
          const sourceId = `pdie-impacts-${countryCode}`;
          const fillLayerId = `pdie-impacts-fill-${countryCode}`;
          const lineLayerId = `pdie-impacts-line-${countryCode}`;

          // Remove existing layers/source
          try {
            if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
            if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
          } catch (e) { /* ignore */ }

          // Add regional impact polygons
          map.addSource(sourceId, {
            type: "geojson",
            data: impactsData,
          });

          // Fill layer
          map.addLayer({
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "Total_Loss"],
                0, "#fef3c7",
                100000, "#fbbf24",
                1000000, "#f59e0b",
                10000000, "#dc2626"
              ],
              "fill-opacity": 0.5,
            },
          });

          // Outline layer
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#64748b",
              "line-width": 1,
            },
          });

          console.log(`✅ Added PDIE regional impacts layer with ${impactsData.features?.length || 0} regions`);
        }

        console.log(`✅ PDIE output layers loaded successfully`);
      } catch (error) {
        console.error(`Error loading PDIE layers:`, error);
      } finally {
        setLoading(false);
      }
    };

    loadPDIELayers();

    // Cleanup
    return () => {
      if (!map || !countryCode) return;
      
      try {
        const layers = [
          `pdie-exposure-layer-${countryCode}`,
          `pdie-impacts-fill-${countryCode}`,
          `pdie-impacts-line-${countryCode}`,
        ];
        
        const sources = [
          `pdie-exposure-${countryCode}`,
          `pdie-impacts-${countryCode}`,
        ];

        layers.forEach(layerId => {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        });

        sources.forEach(sourceId => {
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        });
      } catch (e) { /* ignore */ }
    };
  }, [map, countryCode, visible]);

  return null;
}
