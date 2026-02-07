"use client";

import { useEffect, useState, useRef } from "react";
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
    layers: Record<string, boolean>; // Track per-layer loading
  }>({
    cycloneTracks: false,
    hazards: false,
    layers: {},
  });
  
  // Track if WMS layers have been loaded to avoid redundant loading
  const wmsLayersLoaded = useRef(false);
  
  // Track animation frame for wind layer pulsing
  const windAnimationFrame = useRef<number | null>(null);
  const windLayerIds = useRef<string[]>([]); // Track wind layer IDs for animation
  
  // Animate wind layer opacity with smooth pulsing effect
  const startWindAnimation = (map: MapLibreMap, layerId: string) => {
    // Add to tracked wind layers if not already present
    if (!windLayerIds.current.includes(layerId)) {
      windLayerIds.current.push(layerId);
    }
    
    // Only start animation if not already running
    if (windAnimationFrame.current) {
      return;
    }
    
    let startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      // Create smooth pulsing effect: 0.45 to 0.75 opacity over 3 second cycle
      const pulse = 0.45 + 0.3 * (Math.sin(elapsed / 1500) + 1) / 2;
      
      // Apply animation to all wind layers
      windLayerIds.current.forEach(id => {
        try {
          if (map.getLayer(id)) {
            map.setPaintProperty(id, "raster-opacity", pulse);
          }
        } catch (e) {
          // Layer might have been removed, filter it out
          windLayerIds.current = windLayerIds.current.filter(layerId => layerId !== id);
        }
      });
      
      // Stop animation if no wind layers remain
      if (windLayerIds.current.length === 0) {
        if (windAnimationFrame.current) {
          cancelAnimationFrame(windAnimationFrame.current);
          windAnimationFrame.current = null;
        }
        return;
      }
      
      windAnimationFrame.current = requestAnimationFrame(animate);
    };
    
    windAnimationFrame.current = requestAnimationFrame(animate);
  };

  // Load cyclone tracks for all countries or specific country
  useEffect(() => {
    if (!map || !visible) {
      // Stop wind animation when not visible
      if (windAnimationFrame.current) {
        cancelAnimationFrame(windAnimationFrame.current);
        windAnimationFrame.current = null;
      }
      return;
    }

    const loadCycloneTracks = async () => {
      setLoadingState((prev) => ({ ...prev, cycloneTracks: true }));

      try {
        console.log(`📍 Loading cyclone tracks from real data...`);

        // Load from public directory
        const response = await fetch('/cyclone-track.geojson');
        if (!response.ok) {
          console.warn('Could not load cyclone track data');
          setLoadingState((prev) => ({ ...prev, cycloneTracks: false }));
          return;
        }

        const geojson = await response.json();
        const sourceId = 'cyclone-tracks-real';
        const layerId = 'cyclone-tracks-layer-real';

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
          console.warn(`Error removing existing layers:`, e);
        }

        // Function to add layers
        const addLayers = () => {
          // Add source
          map.addSource(sourceId, {
            type: "geojson",
            data: geojson,
          });

          // Insert before interactive layers (damaged buildings/roads) to keep proper order
          let beforeId: string | undefined = undefined;
          if (map.getLayer('damaged-buildings-layer')) {
            beforeId = 'damaged-buildings-layer';
          } else if (map.getLayer('damaged-buildings-clusters')) {
            beforeId = 'damaged-buildings-clusters';  
          } else if (map.getLayer('damaged-roads-layer')) {
            beforeId = 'damaged-roads-layer';
          }

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
          }, beforeId);

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
          }, beforeId);

          console.log(`✅ Loaded cyclone track data successfully`);
        };

        // Check if style is loaded before adding layers
        if (map.isStyleLoaded()) {
          addLayers();
        } else {
          map.once('load', addLayers);
        }
      } catch (error) {
        console.error(`Error loading cyclone data:`, error);
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
      
      const sourceId = 'cyclone-tracks-real';
      const layerId = 'cyclone-tracks-layer-real';
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
    };
  }, [map, countryCode, visible]);

  // Load real WMS hazard layers from THREDDS (with lazy loading based on zoom)
  useEffect(() => {
    if (!map || !visible) return;
    
    // Reset loaded status when country changes
    wmsLayersLoaded.current = false;
    windLayerIds.current = []; // Clear wind layer tracking on country change

    const loadRealWMSLayers = async () => {
      // Lazy loading: Only load WMS layers when zoomed in enough to see details
      const currentZoom = map.getZoom();
      const MIN_ZOOM_FOR_WMS = 6; // Only load WMS layers at zoom level 6 or higher
      
      if (currentZoom < MIN_ZOOM_FOR_WMS) {
        console.log(`⏸️ Skipping WMS layers (zoom ${currentZoom.toFixed(1)} < ${MIN_ZOOM_FOR_WMS})`);
        return;
      }
      
      // Skip if WMS layers already loaded (prevent redundant loading on zoom events)
      if (wmsLayersLoaded.current) {
        return;
      }

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
            `📊 Loading ${availableLayers.length} real WMS layers for ${country} (zoom: ${currentZoom.toFixed(1)}):`,
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

            // Add WMS image source (optimized 1024x1024 for faster loading)
            try {
              // Mark layer as loading
              setLoadingState((prev) => ({
                ...prev,
                layers: { ...prev.layers, [layer.id]: true },
              }));
              console.log(`⏳ Loading WMS layer: ${layer.name}...`);
              
              // Function to add WMS layer
              const addWMSLayer = () => {
                try {
                  map.addSource(sourceId, {
                    type: "image",
                    url: buildWMSImageUrl(layer, layer.bbox, 1024, 1024), // Reduced from 2048 for 4x faster loading
                    coordinates: [
                      [layer.bbox[0], layer.bbox[3]], // top-left
                      [layer.bbox[2], layer.bbox[3]], // top-right
                      [layer.bbox[2], layer.bbox[1]], // bottom-right
                      [layer.bbox[0], layer.bbox[1]], // bottom-left
                    ],
                  });

                  // Add raster layer - insert before other data layers to keep at bottom
                  // Try to insert before regional impacts or damaged buildings layers
                  let beforeId: string | undefined = undefined;
                  
                  // Check for existing layers and insert WMS below them
                  if (map.getLayer('regional-impacts-fill')) {
                    beforeId = 'regional-impacts-fill';
                  } else if (map.getLayer('damaged-buildings-clusters')) {
                    beforeId = 'damaged-buildings-clusters';
                  } else if (map.getLayer('cyclone-forecast-track-line')) {
                    beforeId = 'cyclone-forecast-track-line';
                  }
                  
                  map.addLayer({
                    id: layerId,
                    type: "raster",
                    source: sourceId,
                    paint: {
                      "raster-opacity": 0.6,
                      "raster-fade-duration": 300,
                    },
                  }, beforeId);

                  // Mark layer as loaded
                  setLoadingState((prev) => ({
                    ...prev,
                    layers: { ...prev.layers, [layer.id]: false },
                  }));
                  console.log(`✅ WMS layer loaded: ${layer.name}`);
                  
                  // Start animation for wind layers
                  if (layer.hazardType === "wind" && !windAnimationFrame.current) {
                    startWindAnimation(map, layerId);
                  }
                } catch (innerError) {
                  console.error(`❌ Error adding WMS layer ${layer.id}:`, innerError);
                  setLoadingState((prev) => ({
                    ...prev,
                    layers: { ...prev.layers, [layer.id]: false },
                  }));
                }
              };

              // Check if style is loaded before adding layer
              if (map.isStyleLoaded()) {
                addWMSLayer();
              } else {
                map.once('load', addWMSLayer);
              }
            } catch (error) {
              console.error(`❌ Error preparing WMS layer ${layer.id}:`, error);
              setLoadingState((prev) => ({
                ...prev,
                layers: { ...prev.layers, [layer.id]: false },
              }));
            }
          }
        }

        console.log(`✅ Real WMS hazard layers loaded`);
        wmsLayersLoaded.current = true; // Mark as loaded to prevent re-loading
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

    // Load layers immediately if zoom is sufficient
    loadRealWMSLayers();
    
    // Also listen for zoom changes to load layers when user zooms in
    const onZoomEnd = () => {
      loadRealWMSLayers();
    };
    map.on('zoomend', onZoomEnd);
    
    return () => {
      map.off('zoomend', onZoomEnd);
      
      // Cleanup wind animation when component unmounts
      if (windAnimationFrame.current) {
        cancelAnimationFrame(windAnimationFrame.current);
        windAnimationFrame.current = null;
      }
    };
  }, [map, countryCode, visible]);

  return null; // This is a non-visual component that manages map layers
}
