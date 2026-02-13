"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import {

  buildWMSImageUrl,
  getLayersForCountry,
} from "@/data/realThreddsLayers";
import { loadCycloneForecastTrack } from "@/utils/cycloneAnimationLoader";
import { generateForecastCone } from "@/utils/forecastCone";

interface RealDataLayersProps {
  map: MapLibreMap | null;
  countryCode: CountryCode | null; // Allow null to load all countries
  visible: boolean;
  mapStyle?: "loss" | "wind";
  styleChangeCounter?: number; // Used to trigger re-render when basemap changes
}

export default function RealDataLayers({
  map,
  countryCode,
  visible,
  mapStyle = "loss",
  styleChangeCounter = 0,
}: RealDataLayersProps) {
  const loadingStateRef = useRef<{
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
      loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: true };

      try {
        console.log(`Loading cyclone tracks from real data...`);

        // Load from public directory
        const response = await fetch('/cyclone-track.geojson');
        if (!response.ok) {
          console.warn('Could not load cyclone track data');
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }

        const geojson = await response.json();
        const sourceId = 'cyclone-tracks-real';
        const layerId = 'cyclone-tracks-layer-real';
        
        // Also load forecast data for cone visualization
        const forecastData = await loadCycloneForecastTrack();
        const forecastConeData = forecastData ? generateForecastCone(forecastData) : null;

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
          if (map.getSource(sourceId)) {
            const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
            existing?.setData(geojson);
          } else {
            map.addSource(sourceId, {
              type: "geojson",
              data: geojson,
            });
          }

          // Insert before interactive layers (damaged buildings/roads) to keep proper order
          let beforeId: string | undefined = undefined;
          if (map.getLayer('damaged-buildings-layer')) {
            beforeId = 'damaged-buildings-layer';
          } else if (map.getLayer('damaged-buildings-clusters')) {
            beforeId = 'damaged-buildings-clusters';  
          } else if (map.getLayer('damaged-roads-layer')) {
            beforeId = 'damaged-roads-layer';
          }

          // Add forecast cone (uncertainty visualization) - professional standard
          const coneSourceId = 'cyclone-forecast-cone';
          const coneLayerId = 'cyclone-forecast-cone-layer';
          
          if (forecastConeData && forecastConeData.features.length > 0) {
            // Add cone source
            if (map.getSource(coneSourceId)) {
              const existing = map.getSource(coneSourceId) as maplibregl.GeoJSONSource | undefined;
              existing?.setData(forecastConeData);
            } else {
              map.addSource(coneSourceId, {
                type: "geojson",
                data: forecastConeData,
              });
            }
            
            // Add cone fill layer (subtle background)
            if (!map.getLayer(coneLayerId)) {
              map.addLayer({
                id: coneLayerId,
                type: "fill",
                source: coneSourceId,
                paint: {
                  "fill-color": "#8B5CF6",
                  "fill-opacity": 0.15, // Subtle uncertainty visualization
                },
              }, beforeId);
            }
            
            // Add cone outline for clarity
            const coneOutlineLayerId = `${coneLayerId}-outline`;
            if (!map.getLayer(coneOutlineLayerId)) {
              map.addLayer({
                id: coneOutlineLayerId,
                type: "line",
                source: coneSourceId,
                paint: {
                  "line-color": "#8B5CF6",
                  "line-width": 1,
                  "line-opacity": 0.4,
                  "line-dasharray": [3, 2],
                },
              }, beforeId);
            }
            
            console.log(`Added forecast cone with ${forecastConeData.features.length} segments`);
          }

          // Add line layer for cyclone tracks
          if (!map.getLayer(layerId)) {
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
          }

          // Add point layer for cyclone positions
          const pointsLayerId = `${layerId}-points`;
          if (!map.getLayer(pointsLayerId)) {
            map.addLayer({
              id: pointsLayerId,
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
          }

          // Add rich interactivity: hover cursor and tooltips for cyclone track
          map.on('mouseenter', pointsLayerId, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          
          map.on('mouseleave', pointsLayerId, () => {
            map.getCanvas().style.cursor = '';
          });

          console.log(`Loaded cyclone track data successfully`);
        };

        // Check if style is loaded before adding layers
        if (map.isStyleLoaded()) {
          addLayers();
        } else {
          map.once('styledata', addLayers);
        }
      } catch (error) {
        console.error(`Error loading cyclone data:`, error);
      } finally {
        loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
      }
    };

    const sourceId = 'cyclone-tracks-real';
    const layerId = 'cyclone-tracks-layer-real';
    const pointLayerId = `${layerId}-points`;
    const coneSourceId = 'cyclone-forecast-cone';
    const coneLayerId = 'cyclone-forecast-cone-layer';
    const coneOutlineLayerId = `${coneLayerId}-outline`;
    let onStyleLoad: (() => void) | null = null;

    if (!map.isStyleLoaded()) {
      onStyleLoad = () => {
        map.off('styledata', onStyleLoad!);
        loadCycloneTracks();
      };
      map.on('styledata', onStyleLoad);
    } else {
      loadCycloneTracks();
    }

    // Cleanup
    return () => {
      if (!map) return;

      if (onStyleLoad) {
        try {
          map.off('styledata', onStyleLoad);
        } catch (e) {
          // Silently ignore cleanup errors for event listener
        }
      }
      try {
        // Remove cone layers
        if (map.getLayer(coneOutlineLayerId)) {
          map.removeLayer(coneOutlineLayerId);
        }
        if (map.getLayer(coneLayerId)) {
          map.removeLayer(coneLayerId);
        }
        if (map.getSource(coneSourceId)) {
          map.removeSource(coneSourceId);
        }
        // Remove track layers
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
  }, [map, countryCode, visible, styleChangeCounter]); // Re-load cyclone tracks when basemap changes

  // Load real WMS hazard layers from THREDDS (with lazy loading based on zoom)
  useEffect(() => {
    if (!map || !visible) return;
    
    // Reset loaded status when country changes
    wmsLayersLoaded.current = false;
    windLayerIds.current = []; // Clear wind layer tracking on country/style change

    const removeWmsLayers = (countries: CountryCode[]) => {
      countries.forEach((country) => {
        const layers = getLayersForCountry(country);
        layers.forEach((layer) => {
          const sourceId = `wms-${layer.id}`;
          const layerId = `wms-layer-${layer.id}`;
          try {
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
              map.removeSource(sourceId);
            }
          } catch (e) {
            // Silently ignore cleanup errors
          }
        });
      });
    };

    const loadRealWMSLayers = async () => {
      // Skip if WMS layers already loaded (prevent redundant loading)
      if (wmsLayersLoaded.current) {
        return;
      }

      loadingStateRef.current = { ...loadingStateRef.current, hazards: true };

      try {
        // Determine which countries to load hazards for
        const countriesToLoad: CountryCode[] = countryCode 
          ? [countryCode] 
          : Object.keys(COUNTRIES) as CountryCode[];

        // Wind layers are now always loaded for context
        // Opacity is controlled by mapStyle (high when "wind", low when "loss")

        for (const country of countriesToLoad) {
          const availableLayers = getLayersForCountry(country).filter(
            (layer) => layer.hazardType === "wind"
          );
          
          if (availableLayers.length === 0) {
            console.log(`No real WMS layers available for ${country}`);
            continue;
          }

          console.log(
            `Loading ${availableLayers.length} real WMS layers for ${country}:`,
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
              loadingStateRef.current = {
                ...loadingStateRef.current,
                layers: { ...loadingStateRef.current.layers, [layer.id]: true },
              };
              console.log(`Loading WMS layer: ${layer.name}...`);
              
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
                  
                  // Dynamic opacity: high when viewing wind, low for context when viewing loss
                  const windOpacity = mapStyle === "wind" ? 0.85 : 0.25;
                  
                  map.addLayer({
                    id: layerId,
                    type: "raster",
                    source: sourceId,
                    paint: {
                      "raster-opacity": windOpacity, // Always visible, opacity varies by mode
                      "raster-fade-duration": 300,
                      "raster-contrast": 0.2,
                    },
                  }, beforeId);

                  // Mark layer as loaded
                  loadingStateRef.current = {
                    ...loadingStateRef.current,
                    layers: { ...loadingStateRef.current.layers, [layer.id]: false },
                  };
                  console.log(`WMS layer loaded: ${layer.name} (opacity: ${windOpacity})`);
                  
                  // Start subtle animation for wind layers when in wind mode
                  if (layer.hazardType === "wind" && mapStyle === "wind" && !windAnimationFrame.current) {
                    startWindAnimation(map, layerId);
                  }
                } catch (innerError) {
                  console.error(`Error adding WMS layer ${layer.id}:`, innerError);
                  loadingStateRef.current = {
                    ...loadingStateRef.current,
                    layers: { ...loadingStateRef.current.layers, [layer.id]: false },
                  };
                }
              };

              // Check if style is loaded before adding layer
              if (map.isStyleLoaded()) {
                addWMSLayer();
              } else {
                map.once('styledata', addWMSLayer);
              }
            } catch (error) {
              console.error(`Error preparing WMS layer ${layer.id}:`, error);
              loadingStateRef.current = {
                ...loadingStateRef.current,
                layers: { ...loadingStateRef.current.layers, [layer.id]: false },
              };
            }
          }
        }

        console.log(`Real WMS hazard layers loaded`);
        wmsLayersLoaded.current = true; // Mark as loaded to prevent re-loading
      } catch (error) {
        console.error(`Error loading WMS layers:`, error);
      } finally {
        loadingStateRef.current = { ...loadingStateRef.current, hazards: false };
      }
    };

    // Wait for map to be fully loaded before adding WMS layers
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        map.off('styledata', onStyleLoad);
        loadRealWMSLayers();
      };
      map.on('styledata', onStyleLoad);
    } else {
      // Load layers immediately if zoom is sufficient
      loadRealWMSLayers();
    }
    
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
  }, [map, countryCode, visible, mapStyle, styleChangeCounter]); // Re-load WMS layers when basemap changes

  // Update wind layer opacity dynamically when mapStyle changes
  useEffect(() => {
    if (!map || !visible) return;
    
    const windOpacity = mapStyle === "wind" ? 0.85 : 0.25;
    
    // Update all wind layer opacities
    windLayerIds.current.forEach(layerId => {
      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, "raster-opacity", windOpacity);
        }
      } catch (e) {
        // Layer might not exist yet, ignore
      }
    });
    
    // Control animation based on mode
    if (mapStyle === "wind") {
      // Start animation in wind mode
      if (windLayerIds.current.length > 0 && !windAnimationFrame.current) {
        startWindAnimation(map, windLayerIds.current[0]);
      }
    } else {
      // Stop animation in loss mode (static context layer)
      if (windAnimationFrame.current) {
        cancelAnimationFrame(windAnimationFrame.current);
        windAnimationFrame.current = null;
      }
    }
  }, [map, visible, mapStyle]);

  return null; // This is a non-visual component that manages map layers
}
