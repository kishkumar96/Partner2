'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { FilterState } from '@/types';
import { buildWMSImageUrl, getLayersForCountry, RealWMSLayer } from '@/data/realThreddsLayers';
import { loadCycloneForecastTrack } from '@/utils/cycloneAnimationLoader';
import { loadCycloneTrackData } from '@/utils/realDataLoader';
import { generateForecastCone } from '@/utils/forecastCone';

// Mapping between filter hazard IDs and WMS layer hazard types
const HAZARD_ID_TO_LAYER_TYPE: Record<string, string[]> = {
  'tropical-cyclone': ['cyclone', 'wind'],
  flood: ['flood', 'inundation'],
  volcanic: [],
  earthquake: [],
  drought: [],
  tsunami: [],
  'storm-surge': ['inundation'],
};

interface RealDataLayersProps {
  map: MapLibreMap | null;
  countryCode: CountryCode | null; // Allow null to load all countries
  visible: boolean;
  mapStyle?: 'loss' | 'wind';
  styleChangeCounter?: number; // Used to trigger re-render when basemap changes
  filters?: FilterState;
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  onLoadingChange?: (isLoading: boolean) => void;
  onActiveLayersChange?: (layers: RealWMSLayer[]) => void;
}

export default function RealDataLayers({
  map,
  countryCode,
  visible,
  mapStyle = 'loss',
  styleChangeCounter = 0,
  filters,
  showWindLayer = false,
  showInundationLayer = false,
  onLoadingChange,
  onActiveLayersChange,
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

  // Track progressive resolution upgrade timeouts for cleanup
  const resolutionUpgradeTimeouts = useRef<number[]>([]);

  // Store cyclone track event handlers for proper cleanup
  const cycloneHandlersRef = useRef<{
    handleMouseEnter?: () => void;
    handleMouseLeave?: () => void;
  }>({});

  // Create stable reference for selectedHazards to avoid unnecessary re-renders
  const selectedHazardsKey = useMemo(
    () => JSON.stringify(filters?.selectedHazards ?? []),
    [filters?.selectedHazards]
  );

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

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      // Create smooth pulsing effect: 0.45 to 0.75 opacity over 3 second cycle
      const pulse = 0.45 + (0.3 * (Math.sin(elapsed / 1500) + 1)) / 2;

      // Apply animation to all wind layers
      windLayerIds.current.forEach(id => {
        try {
          if (map.getLayer(id)) {
            map.setPaintProperty(id, 'raster-opacity', pulse);
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

        // Load from public directory using dataLoader (handles basePath)
        const geojson = await loadCycloneTrackData();
        if (!geojson) {
          console.warn('Could not load cyclone track data');
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }

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
              type: 'geojson',
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
                type: 'geojson',
                data: forecastConeData,
              });
            }

            // Add cone fill layer (subtle background)
            if (!map.getLayer(coneLayerId)) {
              map.addLayer(
                {
                  id: coneLayerId,
                  type: 'fill',
                  source: coneSourceId,
                  paint: {
                    'fill-color': '#8B5CF6',
                    'fill-opacity': 0.15, // Subtle uncertainty visualization
                  },
                },
                beforeId
              );
            }

            // Add cone outline for clarity
            const coneOutlineLayerId = `${coneLayerId}-outline`;
            if (!map.getLayer(coneOutlineLayerId)) {
              map.addLayer(
                {
                  id: coneOutlineLayerId,
                  type: 'line',
                  source: coneSourceId,
                  paint: {
                    'line-color': '#8B5CF6',
                    'line-width': 1,
                    'line-opacity': 0.4,
                    'line-dasharray': [3, 2],
                  },
                },
                beforeId
              );
            }

            console.log(`Added forecast cone with ${forecastConeData.features.length} segments`);
          }

          // Add line layer for cyclone tracks
          if (!map.getLayer(layerId)) {
            map.addLayer(
              {
                id: layerId,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': '#8B5CF6',
                  'line-width': 3,
                  'line-opacity': 0.8,
                },
              },
              beforeId
            );
          }

          // Add point layer for cyclone positions
          const pointsLayerId = `${layerId}-points`;
          if (!map.getLayer(pointsLayerId)) {
            map.addLayer(
              {
                id: pointsLayerId,
                type: 'circle',
                source: sourceId,
                filter: ['==', '$type', 'Point'],
                paint: {
                  'circle-radius': 6,
                  'circle-color': '#8B5CF6',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                },
              },
              beforeId
            );
          }

          // Store event handlers for proper cleanup
          cycloneHandlersRef.current.handleMouseEnter = () => {
            map.getCanvas().style.cursor = 'pointer';
          };

          cycloneHandlersRef.current.handleMouseLeave = () => {
            map.getCanvas().style.cursor = '';
          };

          // Add rich interactivity: hover cursor for cyclone track
          map.on('mouseenter', pointsLayerId, cycloneHandlersRef.current.handleMouseEnter);
          map.on('mouseleave', pointsLayerId, cycloneHandlersRef.current.handleMouseLeave);

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
        // Remove event listeners
        if (cycloneHandlersRef.current.handleMouseEnter) {
          map.off('mouseenter', pointLayerId, cycloneHandlersRef.current.handleMouseEnter);
        }
        if (cycloneHandlersRef.current.handleMouseLeave) {
          map.off('mouseleave', pointLayerId, cycloneHandlersRef.current.handleMouseLeave);
        }

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

    // Reset loaded status when country or filters change
    wmsLayersLoaded.current = false;
    windLayerIds.current = []; // Clear wind layer tracking on country/style/filter change

    const removeWmsLayers = (countries: CountryCode[]) => {
      countries.forEach(country => {
        const layers = getLayersForCountry(country);
        layers.forEach(layer => {
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
      // Clear any pending progressive resolution upgrades from previous loads
      resolutionUpgradeTimeouts.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      resolutionUpgradeTimeouts.current = [];

      // Define minimum zoom level for WMS layer loading to optimize performance
      // WMS raster layers are expensive to fetch and render at low zoom levels
      const MIN_ZOOM_FOR_WMS = 5;

      // Skip if zoom level is too low (user is viewing large area)
      if (map.getZoom() < MIN_ZOOM_FOR_WMS) {
        console.log(
          `Zoom level too low (${map.getZoom().toFixed(1)} < ${MIN_ZOOM_FOR_WMS}) - WMS layers not loaded. Zoom in to see hazard layers.`
        );
        onLoadingChange?.(false);
        return;
      }

      // Skip if WMS layers already loaded (prevent redundant loading)
      if (wmsLayersLoaded.current) {
        console.log('WMS layers already loaded - skipping redundant load');
        onLoadingChange?.(false);
        return;
      }

      loadingStateRef.current = { ...loadingStateRef.current, hazards: true };
      onLoadingChange?.(true);

      try {
        // Determine which countries to load hazards for
        const countriesToLoad: CountryCode[] = countryCode
          ? [countryCode]
          : (Object.keys(COUNTRIES) as CountryCode[]);

        // First, remove all existing WMS layers to ensure clean slate
        // This is important when filters change
        console.log('Removing existing WMS layers before reloading...');
        removeWmsLayers(countriesToLoad);

        // Define hazard types to display based on mapStyle and selected hazards
        // If no hazards are selected, show all relevant hazards
        // If hazards are selected, only show layers matching those hazards
        let hazardTypesToShow: string[] = [];

        if (filters && filters.selectedHazards.length > 0) {
          // Use selected hazards to determine which layer types to show
          filters.selectedHazards.forEach(hazardId => {
            const layerTypes = HAZARD_ID_TO_LAYER_TYPE[hazardId] || [];
            hazardTypesToShow = [...hazardTypesToShow, ...layerTypes];
          });
          // Remove duplicates
          hazardTypesToShow = Array.from(new Set(hazardTypesToShow));
          // Respect user layer toggles even when hazard filters are active
          if (!showWindLayer) {
            hazardTypesToShow = hazardTypesToShow.filter(type => type !== 'wind');
          }
          if (!showInundationLayer) {
            hazardTypesToShow = hazardTypesToShow.filter(
              type => type !== 'inundation' && type !== 'flood'
            );
          }
          console.log(
            `Hazard filter active: showing layers for selected hazards:`,
            filters.selectedHazards,
            `-> layer types:`,
            hazardTypesToShow
          );
        } else {
          // No hazard filter selected - build list based on mapStyle and user toggles
          hazardTypesToShow = [];

          // Add layers based on explicit user toggles
          if (showWindLayer) {
            hazardTypesToShow.push('wind');
          }
          if (showInundationLayer) {
            hazardTypesToShow.push('inundation', 'flood');
          }

          console.log(
            `No hazard filter - showing layers based on toggles and ${mapStyle} mode:`,
            hazardTypesToShow
          );
        }

        console.log(
          `✅ Final hazard types to show:`,
          hazardTypesToShow,
          `(Wind: ${showWindLayer}, Flood/Inundation: ${showInundationLayer})`
        );

        // Collect all active layers for the legend
        const allActiveLayers: RealWMSLayer[] = [];

        for (const country of countriesToLoad) {
          const availableLayers = getLayersForCountry(country).filter(layer =>
            hazardTypesToShow.includes(layer.hazardType)
          );

          // Add to active layers list
          allActiveLayers.push(...availableLayers);

          if (availableLayers.length === 0) {
            console.log(
              `No WMS layers match filters for ${country} (hazard types: ${hazardTypesToShow.join(', ')})`
            );
            continue;
          }

          console.log(
            `Loading ${availableLayers.length} WMS layers for ${country}:`,
            availableLayers.map(l => `${l.name} [${l.hazardType}]`)
          );
          console.log(
            `Current zoom: ${map.getZoom().toFixed(1)}, Map style: ${mapStyle}, Hazard filter: ${filters?.selectedHazards.length ? filters.selectedHazards.join(', ') : 'none'}`
          );

          // Add each WMS layer to the map
          for (const layer of availableLayers) {
            const sourceId = `wms-${layer.id}`;
            const layerId = `wms-layer-${layer.id}`;

            console.log(
              `📍 Adding layer: ${layer.name} (Type: ${layer.hazardType}, File: ${layer.ncFile}, Layer: ${layer.layerName})`
            );

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

            // Add WMS image source (optimized 512x512 for faster loading)
            try {
              // Mark layer as loading
              loadingStateRef.current = {
                ...loadingStateRef.current,
                layers: { ...loadingStateRef.current.layers, [layer.id]: true },
              };
              console.log(`⏳ Loading WMS layer: ${layer.name}...`);

              // Function to add WMS layer
              const addWMSLayer = () => {
                try {
                  // Progressive loading: 256→512→1024 for optimal speed/quality balance
                  // 256×256 matches THREDDS tile size for instant display
                  const tileSize = 256; // Initial: instant display
                  const mediumRes = 512; // Medium upgrade after 1s
                  const highRes = 1024; // Final quality after 3s

                  map.addSource(sourceId, {
                    type: 'image',
                    url: buildWMSImageUrl(layer, layer.bbox, tileSize, tileSize),
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

                  // Calculate opacity based on layer type, mapStyle, filter selection, and user toggles
                  // Priority: User toggles > Hazard filters > mapStyle defaults
                  let layerOpacity = 0.15; // Default low opacity for context

                  const hasHazardFilter = filters && filters.selectedHazards.length > 0;

                  if (hasHazardFilter) {
                    // User selected specific hazards via filters - show them prominently
                    if (layer.hazardType === 'wind') {
                      layerOpacity = 0.75;
                    } else if (layer.hazardType === 'cyclone') {
                      layerOpacity = 0.65;
                    } else if (layer.hazardType === 'flood' || layer.hazardType === 'inundation') {
                      layerOpacity = 0.55;
                    }
                  } else {
                    // No filter - check if user explicitly enabled layer via toggle
                    if (layer.hazardType === 'wind' && showWindLayer) {
                      // Wind layer explicitly enabled by toggle
                      layerOpacity = mapStyle === 'wind' ? 0.85 : 0.5;
                    } else if (
                      (layer.hazardType === 'flood' || layer.hazardType === 'inundation') &&
                      showInundationLayer
                    ) {
                      // Inundation layer explicitly enabled by toggle
                      layerOpacity = 0.55;
                    } else if (layer.hazardType === 'cyclone') {
                      // Cyclone layer (if any) - only visible in loss mode
                      layerOpacity = mapStyle === 'loss' ? 0.65 : 0;
                    } else {
                      // Fallback to mapStyle-based opacity
                      if (layer.hazardType === 'wind') {
                        layerOpacity = mapStyle === 'wind' ? 0.85 : 0.15;
                      } else if (
                        layer.hazardType === 'flood' ||
                        layer.hazardType === 'inundation'
                      ) {
                        layerOpacity = mapStyle === 'loss' ? 0.55 : 0;
                      }
                    }
                  }

                  console.log(
                    `  → Layer opacity for ${layer.name} (${layer.hazardType}): ${layerOpacity} (mapStyle: ${mapStyle}, hasFilter: ${hasHazardFilter}, windToggle: ${showWindLayer}, floodToggle: ${showInundationLayer})`
                  );

                  map.addLayer(
                    {
                      id: layerId,
                      type: 'raster',
                      source: sourceId,
                      paint: {
                        'raster-opacity': layerOpacity,
                        'raster-fade-duration': 300,
                        'raster-contrast': 0.2,
                      },
                    },
                    beforeId
                  );

                  // Mark layer as loaded
                  loadingStateRef.current = {
                    ...loadingStateRef.current,
                    layers: { ...loadingStateRef.current.layers, [layer.id]: false },
                  };
                  console.log(
                    `✅ WMS layer loaded: ${layer.name} (type: ${layer.hazardType}, opacity: ${layerOpacity}${hasHazardFilter ? ' [filtered]' : ''})`
                  );

                  // Progressive resolution upgrades for optimal speed/quality
                  // Stage 1: Upgrade to 512×512 after 1 second
                  const mediumResTimeout = window.setTimeout(() => {
                    try {
                      const source = map.getSource(sourceId) as any;
                      if (source && source.setUrl) {
                        const mediumResUrl = buildWMSImageUrl(layer, layer.bbox, 512, 512);
                        source.setUrl(mediumResUrl);
                        console.log(`📈 Upgraded to medium-res: ${layer.name}`);
                      }
                    } catch (e) {
                      // Silently fail if upgrade doesn't work
                    }
                  }, 1000);
                  resolutionUpgradeTimeouts.current.push(mediumResTimeout);

                  // Stage 2: Final upgrade to 1024×1024 after 3 seconds
                  const highResTimeout = window.setTimeout(() => {
                    try {
                      const source = map.getSource(sourceId) as any;
                      if (source && source.setUrl) {
                        const highResUrl = buildWMSImageUrl(layer, layer.bbox, 1024, 1024);
                        source.setUrl(highResUrl);
                        console.log(`🔍 Upgraded to high-res: ${layer.name}`);
                      }
                    } catch (e) {
                      // Silently fail if upgrade doesn't work
                      // Silently fail if upgrade doesn't work
                    }
                  }, 3000);
                  resolutionUpgradeTimeouts.current.push(highResTimeout);
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

        // Notify parent of active WMS layers for legend display
        onActiveLayersChange?.(allActiveLayers);
      } catch (error) {
        console.error(`Error loading WMS layers:`, error);
      } finally {
        loadingStateRef.current = { ...loadingStateRef.current, hazards: false };
        onLoadingChange?.(false);
      }
    };

    // Wait for map to be fully loaded before adding WMS layers
    let wmsStyleLoadListener: (() => void) | null = null;

    if (!map.isStyleLoaded()) {
      wmsStyleLoadListener = () => {
        loadRealWMSLayers();
      };
      map.on('styledata', wmsStyleLoadListener);
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
      // Remove styledata listener if it was registered
      if (wmsStyleLoadListener) {
        try {
          map.off('styledata', wmsStyleLoadListener);
        } catch (e) {
          // Silently ignore if already removed
        }
      }

      map.off('zoomend', onZoomEnd);

      // Cleanup wind animation when component unmounts
      if (windAnimationFrame.current) {
        cancelAnimationFrame(windAnimationFrame.current);
        windAnimationFrame.current = null;
      }

      // Clear all pending progressive resolution upgrade timeouts
      resolutionUpgradeTimeouts.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      resolutionUpgradeTimeouts.current = [];
    };
  }, [
    map,
    countryCode,
    visible,
    mapStyle,
    styleChangeCounter,
    selectedHazardsKey,
    showWindLayer,
    showInundationLayer,
  ]); // Re-load WMS layers when basemap, hazard filters, or layer visibility changes

  // Update wind layer opacity dynamically when mapStyle changes
  useEffect(() => {
    if (!map || !visible) return;

    // Dynamic opacity: high when in wind mode for analysis, low otherwise for context
    // Reduced from 0.25 to 0.15 to prevent overwhelming choropleth, roads, and buildings
    const windOpacity = mapStyle === 'wind' ? 0.85 : 0.15;

    // Update all wind layer opacities
    windLayerIds.current.forEach(layerId => {
      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'raster-opacity', windOpacity);
        }
      } catch (e) {
        // Layer might not exist yet, ignore
      }
    });

    // Control animation based on mode
    if (mapStyle === 'wind') {
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
