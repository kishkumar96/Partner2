"use client";

import { useEffect, useState } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import {
  loadCycloneTrack,
  getHazardColorScale,
  getAvailableHazards,
} from "@/utils/geotiffLoader";
import {
  REAL_WMS_LAYERS,
  buildWMSImageUrl,
  getLayersForCountry,
} from "@/data/realThreddsLayers";

interface RealDataLayersProps {
  map: MapLibreMap | null;
  countryCode: CountryCode | null; // Allow null to load all countries
  visible: boolean;
}

export default function RealDataLayers({
  map,
  countryCode,
  visible,
}: RealDataLayersProps) {
  const [loadingState, setLoadingState] = useState<{
    cycloneTracks: boolean;
    hazards: boolean;
  }>({
    cycloneTracks: false,
    hazards: false,
  });

  // Load cyclone tracks for all countries or specific country
  useEffect(() => {
    if (!map || !visible) return;

    const loadCycloneTracks = async () => {
      setLoadingState((prev) => ({ ...prev, cycloneTracks: true }));

      try {
        // Determine which countries to load data for
        const countriesToLoad: CountryCode[] = countryCode 
          ? [countryCode] 
          : Object.keys(COUNTRIES) as CountryCode[];

        console.log(`📍 Loading cyclone tracks for: ${countriesToLoad.join(', ')}...`);

        // Load data for each country
        for (const country of countriesToLoad) {
          try {
            const geojson = await loadCycloneTrack(country);

            if (!geojson) {
              console.info(`ℹ️ Using mock data for ${country} (no real-time cyclone data available)`);
              continue;
            }

            const sourceId = `cyclone-tracks-${country}`;
            const layerId = `cyclone-tracks-layer-${country}`;

            // Remove existing layers and source if present
            try {
              const pointLayerId = `${layerId}-points`;
              
              if (map.getLayer(pointLayerId)) {
                map.removeLayer(pointLayerId);
              }
              
              if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
              }
              
              if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
              }
            } catch (e) {
              console.warn(`Error removing existing layers for ${country}:`, e);
            }

            // Add source
            map.addSource(sourceId, {
              type: "geojson",
              data: geojson,
            });

            // Add line layer for cyclone tracks
            map.addLayer({
              id: layerId,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": "#8B5CF6",
                "line-width": 3,
                "line-opacity": 0.8,
              },
            });

            // Add point layer for cyclone positions
            map.addLayer({
              id: `${layerId}-points`,
              type: "circle",
              source: sourceId,
              filter: ["==", "$type", "Point"],
              paint: {
                "circle-radius": 6,
                "circle-color": "#8B5CF6",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
            });

            console.log(`✅ Loaded cyclone tracks for ${country}`);
          } catch (error) {
            console.error(`Error loading cyclone tracks for ${country}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error loading cyclone tracks:`, error);
      } finally {
        setLoadingState((prev) => ({ ...prev, cycloneTracks: false }));
      }
    };

    // Wait for map to be fully loaded before adding layers
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        map.off('styledata', onStyleLoad);
        loadCycloneTracks();
      };
      map.on('styledata', onStyleLoad);
      return;
    }

    loadCycloneTracks();

    // Cleanup
    return () => {
      if (!map) return;
      
      const countriesToClean = countryCode 
        ? [countryCode] 
        : Object.keys(COUNTRIES) as CountryCode[];
      
      for (const country of countriesToClean) {
        const sourceId = `cyclone-tracks-${country}`;
        const layerId = `cyclone-tracks-layer-${country}`;
        const pointLayerId = `${layerId}-points`;
        
        try {
          if (map.getLayer(pointLayerId)) {
            map.removeLayer(pointLayerId);
          }
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        } catch (e) {
          // Silently ignore cleanup errors
        }
      }
    };
  }, [map, countryCode, visible]);

  // Load real WMS hazard layers from THREDDS
  useEffect(() => {
    if (!map || !visible) return;

    const loadRealWMSLayers = async () => {
      setLoadingState((prev) => ({ ...prev, hazards: true }));

      try {
        // Determine which countries to load hazards for
        const countriesToLoad: CountryCode[] = countryCode 
          ? [countryCode] 
          : Object.keys(COUNTRIES) as CountryCode[];

        for (const country of countriesToLoad) {
          const availableLayers = getLayersForCountry(country);
          
          if (availableLayers.length === 0) {
            console.log(`ℹ️ No real WMS layers available for ${country}`);
            continue;
          }

          console.log(
            `📊 Loading ${availableLayers.length} real WMS layers for ${country}:`,
            availableLayers.map((l) => l.name)
          );

          // Add each WMS layer to the map
          for (const layer of availableLayers) {
            const sourceId = `wms-${layer.id}`;
            const layerId = `wms-layer-${layer.id}`;

            // Remove existing layer and source if present
            try {
              if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
              }
              if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
              }
            } catch (e) {
              // Layer/source doesn't exist, continue
            }

            // Add WMS image source (not tiled, but bounded image)
            try {
              map.addSource(sourceId, {
                type: "image",
                url: buildWMSImageUrl(layer, layer.bbox, 2048, 2048),
                coordinates: [
                  [layer.bbox[0], layer.bbox[3]], // top-left
                  [layer.bbox[2], layer.bbox[3]], // top-right
                  [layer.bbox[2], layer.bbox[1]], // bottom-right
                  [layer.bbox[0], layer.bbox[1]], // bottom-left
                ],
              });

              // Add raster layer
              map.addLayer({
                id: layerId,
                type: "raster",
                source: sourceId,
                paint: {
                  "raster-opacity": 0.6,
                  "raster-fade-duration": 300,
                },
              });

              console.log(`✅ Added WMS layer: ${layer.name}`);
            } catch (error) {
              console.error(`Error adding WMS layer ${layer.id}:`, error);
            }
          }
        }

        console.log(`✅ Real WMS hazard layers loaded`);
      } catch (error) {
        console.error(`Error loading WMS layers:`, error);
      } finally {
        setLoadingState((prev) => ({ ...prev, hazards: false }));
      }
    };

    // Wait for map to be fully loaded before adding WMS layers
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        map.off('styledata', onStyleLoad);
        loadRealWMSLayers();
      };
      map.on('styledata', onStyleLoad);
      return;
    }

    loadRealWMSLayers();
  }, [map, countryCode, visible]);

  return null; // This is a non-visual component that manages map layers
}
