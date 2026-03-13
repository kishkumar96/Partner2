/**
 * Component to load and display regional impacts GeoJSON layer
 */

import { useEffect, useRef } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import {
  createLossColorExpression,
  createWindColorExpression,
  createRegionalFillOpacity,
  createRegionalLineColor,
  createRegionalLineWidth,
  LAYER_OPACITY,
} from '@/utils/colorSystem';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { debugLogger } from '@/utils/debugLogger';
import { loadGeoJSON } from '@/utils/dataLoader';
import { CountryCode } from '@/types/thredds';
import { DATA_PATH, getCountryDataFilePath } from '@/utils/realDataLoader';

function safeIsStyleLoaded(map: MapLibreMap | null): boolean {
  if (!map) return false;
  try {
    const styleLoaded = map.isStyleLoaded();
    return !!map.getStyle() && styleLoaded === true;
  } catch {
    return false;
  }
}

const REGIONAL_SOURCE_ID = 'regional-impacts';
const REGIONAL_FILL_LAYER_ID = 'regional-impacts-fill';
const REGIONAL_LINE_LAYER_ID = 'regional-impacts-line';
const REGIONAL_EXTRUSION_LAYER_ID = 'regional-impacts-extrusion';

function removeRegionalLayersAndSource(map: MapLibreMap) {
  if (map.getLayer(REGIONAL_EXTRUSION_LAYER_ID)) {
    map.removeLayer(REGIONAL_EXTRUSION_LAYER_ID);
  }
  if (map.getLayer(REGIONAL_FILL_LAYER_ID)) {
    map.removeLayer(REGIONAL_FILL_LAYER_ID);
  }
  if (map.getLayer(REGIONAL_LINE_LAYER_ID)) {
    map.removeLayer(REGIONAL_LINE_LAYER_ID);
  }
  if (map.getSource(REGIONAL_SOURCE_ID)) {
    map.removeSource(REGIONAL_SOURCE_ID);
  }
}

interface RegionalImpactsLayerProps {
  map: MapLibreMap | null;
  visible: boolean;
  mapStyle?: 'loss' | 'wind' | 'satellite' | 'street';
  selectedRegion?: string | null;
  onRegionSelect?: (regionId: string | null) => void;
  styleChangeCounter?: number;
  countryCode?: CountryCode | null;
  /** 0–100 opacity scale for regional fill layers */
  layerOpacityScale?: number;
}

export default function RegionalImpactsLayer({
  map,
  visible,
  mapStyle = 'loss',
  selectedRegion = null,
  onRegionSelect,
  styleChangeCounter = 0,
  countryCode = null,
  layerOpacityScale = 70,
}: RegionalImpactsLayerProps) {
  // Store event handlers as refs to enable proper cleanup
  const handlersRef = useRef<{
    handleClick?: (e: any) => void;
    handleMouseEnter?: () => void;
    handleMouseLeave?: () => void;
  }>({});

  // Cache regional impacts data to avoid refetching
  const dataCache = useRef<{
    geojson?: any;
    sectorGeojson?: any;
    cachedCountry?: CountryCode | null;
  }>({});

  // Track if we're currently loading to prevent race conditions
  const isLoadingRef = useRef(false);
  const mountedRef = useRef(true);
  const loadEventListenerRef = useRef<(() => void) | null>(null);
  const layersAddedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!map || !visible) {
      console.log(`❌ RegionalImpactsLayer: Skipping load (map: ${!!map}, visible: ${visible})`);
      return;
    }

    // Prevent concurrent loading
    if (isLoadingRef.current) {
      console.log('⏳ RegionalImpactsLayer: Already loading, skipping...');
      return;
    }

    const loadRegionalImpacts = async () => {
      if (!mountedRef.current) {
        console.log('🚫 Component unmounted, aborting load');
        return;
      }

      isLoadingRef.current = true;

      try {
        debugLogger.info('Loading regional impacts layer', 'map-source');
        console.log(
          `📊 Loading RegionalImpactsLayer (mapStyle: ${mapStyle}, selectedRegion: ${selectedRegion})`
        );
        console.log(
          `🗺️ Map instance exists: ${!!map}, Map loaded: ${map.loaded()}, Style loaded: ${safeIsStyleLoaded(map)}`
        );

        // Load both regional impacts and sector-specific data with caching
        // Use cached data if available to avoid refetching on style changes
        let geojson, sectorGeojson;

        const effectiveCountry = countryCode ?? 'VU';
        const basePath = DATA_PATH[effectiveCountry];
        const regionalImpactsPath = getCountryDataFilePath(
          effectiveCountry,
          'regional-impacts.geojson'
        );
        const regionalImpactsBySectorPath = getCountryDataFilePath(
          effectiveCountry,
          'regional-impacts-by-sector.geojson'
        );

        if (
          dataCache.current.geojson &&
          dataCache.current.sectorGeojson &&
          dataCache.current.cachedCountry === effectiveCountry
        ) {
          console.log('✅ Using cached regional impacts data');
          geojson = dataCache.current.geojson;
          sectorGeojson = dataCache.current.sectorGeojson;
        } else {
          if (!mountedRef.current) {
            console.log('🚫 Component unmounted during load, aborting');
            isLoadingRef.current = false;
            return;
          }

          console.log('🔄 Fetching regional impacts data from server...');
          const [regionalResult, sectorResult] = await Promise.all([
            loadGeoJSON(regionalImpactsPath || `${basePath}/regional-impacts.geojson`, {
              cache: true,
            }),
            loadGeoJSON(
              regionalImpactsBySectorPath || `${basePath}/regional-impacts-by-sector.geojson`,
              { cache: true }
            ),
          ]);

          if (!mountedRef.current) {
            console.log('🚫 Component unmounted after fetch, aborting');
            isLoadingRef.current = false;
            return;
          }

          console.log('📥 Regional impacts fetch result:', {
            hasData: !!regionalResult.data,
            error: regionalResult.error?.message,
            cached: regionalResult.cached,
            featureCount: regionalResult.data?.features?.length || 0,
          });

          console.log('📥 Sector impacts fetch result:', {
            hasData: !!sectorResult.data,
            error: sectorResult.error?.message,
            cached: sectorResult.cached,
            featureCount: sectorResult.data?.features?.length || 0,
          });

          if (!regionalResult.data) {
            console.error('❌ Failed to load regional impacts data:', regionalResult.error);
            debugLogger.warn('Could not load regional impacts data', 'map-source');
            isLoadingRef.current = false;
            return;
          }

          geojson = regionalResult.data;
          sectorGeojson = sectorResult.data || null;

          // Cache for future use
          dataCache.current = { geojson, sectorGeojson, cachedCountry: effectiveCountry };
          console.log(`✅ Cached regional impacts data (${geojson.features?.length || 0} regions)`);
        }

        const sourceId = REGIONAL_SOURCE_ID;
        const fillLayerId = REGIONAL_FILL_LAYER_ID;

        // Remove existing layers and source if present
        try {
          removeRegionalLayersAndSource(map);
        } catch (e) {
          debugLogger.warn('Error removing existing regional impacts layers', 'map-layer', e);
        }

        // Create sector data lookup by region
        const sectorDataByRegion = new Map<string, any>();
        if (sectorGeojson?.features) {
          sectorGeojson.features.forEach((feature: any) => {
            const region = feature.properties?.Region || feature.properties?.ID;
            if (region) {
              sectorDataByRegion.set(region, feature.properties);
            }
          });
        }

        // Function to add layers
        const addLayers = () => {
          // Prevent multiple simultaneous additions
          if (layersAddedRef.current) {
            console.log('⏭️ Layers already added, skipping duplicate add');
            return;
          }

          console.log(
            '🎨 addLayers() called - Map loaded:',
            map.loaded(),
            ', Style loaded:',
            safeIsStyleLoaded(map)
          );

          // Check if source already exists and remove it first to prevent "already exists" error
          if (map.getSource(sourceId)) {
            console.log('⚠️ Source already exists, removing...');
            try {
              removeRegionalLayersAndSource(map);
              console.log('✅ Removed existing layers and source');
            } catch (e) {
              console.error('❌ Error removing existing source:', e);
              debugLogger.warn('Error removing existing source before re-adding', 'map-source', e);
            }
          }

          // Add source
          console.log(
            `📦 Adding source '${sourceId}' with ${geojson.features?.length || 0} features`
          );
          map.addSource(sourceId, {
            type: 'geojson',
            data: geojson,
          });
          console.log('✅ Source added successfully');

          // Define color expressions using unified color system
          const lossColorExpression = createLossColorExpression(countryCode);
          const windColorExpression = createWindColorExpression();

          // Use deterministic z-order system for consistent layer placement
          const fillBeforeId = getBeforeLayerId(map, 'regional-impacts-fill');

          // Add fill layer for regions with dynamic color based on mapStyle
          // World-class design: Extremely subtle choropleth with clear boundaries
          // Focus on boundary definition rather than fill - industry best practice
          console.log(
            `🗺️ Adding regional-impacts-fill layer (mapStyle: ${mapStyle}, beforeId: ${fillBeforeId})`
          );
          try {
            map.addLayer(
              {
                id: 'regional-impacts-fill',
                type: 'fill',
                source: sourceId,
                paint: {
                  'fill-color': mapStyle === 'wind' ? windColorExpression : lossColorExpression,
                  // Use unified opacity system from colorSystem.ts
                  'fill-opacity': createRegionalFillOpacity(
                    mapStyle as 'wind' | 'loss',
                    selectedRegion,
                    layerOpacityScale / 100
                  ) as any,
                },
              },
              fillBeforeId
            );
            console.log(
              `✅ Regional impacts FILL layer added successfully (${geojson.features?.length || 0} features)`
            );
          } catch (e) {
            console.error('❌ Error adding fill layer:', e);
            throw e;
          }

          // Enable smooth transitions for animated region updates
          map.setPaintProperty(fillLayerId, 'fill-color-transition', {
            duration: 800,
            delay: 0,
          });
          map.setPaintProperty(fillLayerId, 'fill-opacity-transition', {
            duration: 500,
            delay: 0,
          });

          // Add outline layer with selection highlighting
          // World-class design: Crisp boundaries for professional choropleth visualization
          const lineBeforeId = getBeforeLayerId(map, 'regional-impacts-line');
          console.log(`🗺️ Adding regional-impacts-line layer (beforeId: ${lineBeforeId})`);
          try {
            map.addLayer(
              {
                id: 'regional-impacts-line',
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': createRegionalLineColor(selectedRegion) as any,
                  'line-width': createRegionalLineWidth(selectedRegion) as any,
                  'line-opacity': [
                    'case',
                    ['==', ['get', 'Region.Region'], selectedRegion || ''],
                    1.0, // Fully visible selected
                    LAYER_OPACITY.regional.outline, // Crisp visible boundaries
                  ],
                },
              },
              lineBeforeId
            );
            console.log('✅ Regional impacts LINE layer added successfully');
          } catch (e) {
            console.error('❌ Error adding line layer:', e);
            throw e;
          }

          // Store event handlers for proper cleanup
          handlersRef.current.handleClick = (e: any) => {
            if (!e.features || e.features.length === 0) return;

            const feature = e.features[0];
            const props = feature.properties;
            const regionName = props['Region.Region'] || 'Unknown Region';

            // Update selected region (for filtering charts/analytics)
            if (onRegionSelect) {
              const isAlreadySelected = selectedRegion === regionName;
              onRegionSelect(isAlreadySelected ? null : regionName);
            }

            // Get sector-specific data for this region
            const sectorData = sectorDataByRegion.get(regionName);

            let sectorBreakdown = '';
            if (sectorData) {
              const sectors = [
                { name: 'Education', key: 'Sector.Education.Loss' },
                { name: 'Infrastructure', key: 'Sector.Infrastructure.Loss' },
                { name: 'Productive', key: 'Sector.Productive.Loss' },
                { name: 'Public', key: 'Sector.Public.Loss' },
                { name: 'Residential', key: 'Sector.Residential.Loss' },
                { name: 'Other', key: 'Sector.Other.Loss' },
              ];

              const sectorLines = sectors
                .map(sector => {
                  const loss = Number(sectorData[sector.key]) || 0;
                  if (loss > 0) {
                    return `<p style="margin: 2px 0 2px 16px;">• ${sector.name}: $${loss.toLocaleString()}</p>`;
                  }
                  return '';
                })
                .filter(Boolean)
                .join('');

              if (sectorLines) {
                sectorBreakdown = `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 4px 0; font-weight: bold;">Sector Breakdown:</p>
                  ${sectorLines}
                </div>
              `;
              }
            }

            // Determine wind category
            const windSpeed = Number(props.Max_Wind_Gusts) || 0;
            let windCategory = '';
            let windColor = '#f0f9ff';
            if (windSpeed >= 252) {
              windCategory = 'Category 5 Hurricane';
              windColor = '#075985';
            } else if (windSpeed >= 165) {
              windCategory = 'Category 4 Hurricane';
              windColor = '#0369a1';
            } else if (windSpeed >= 118) {
              windCategory = 'Category 2-3 Hurricane';
              windColor = '#0284c7';
            } else if (windSpeed >= 88) {
              windCategory = 'Category 1 Hurricane';
              windColor = '#0ea5e9';
            } else if (windSpeed >= 63) {
              windCategory = 'Tropical Storm';
              windColor = '#38bdf8';
            } else if (windSpeed >= 25) {
              windCategory = 'Tropical Depression';
              windColor = '#7dd3fc';
            }

            const popupContent = `
            <div style="padding: 8px; font-family: system-ui, sans-serif;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
                ${regionName}
              </h3>
              ${
                windCategory
                  ? `
                <div style="background: ${windColor}; color: ${windSpeed >= 88 ? 'white' : '#0f172a'}; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11px; font-weight: bold;">
                  Wind Category: ${windCategory}
                </div>
              `
                  : ''
              }
              <div style="font-size: 12px;">
                <p style="margin: 4px 0;"><strong>Max Wind Gusts:</strong> ${windSpeed} km/h</p>
                <p style="margin: 4px 0;"><strong>Avg Wind Gusts:</strong> ${Number(props.Average_Wind_Gusts || 0)} km/h</p>
                <p style="margin: 4px 0;"><strong>Total Loss:</strong> $${Number(props.Total_Loss || 0).toLocaleString()}</p>
                <p style="margin: 4px 0;"><strong>Buildings Damaged:</strong> ${Number(props.Damaged_Buildings || 0).toLocaleString()}</p>
                <p style="margin: 4px 0;"><strong>Population Affected:</strong> ${Number(props.Population_Exposed_To_Any_Hazard || 0).toLocaleString()}</p>
                ${sectorBreakdown}
              </div>
            </div>
          `;

            new maplibregl.Popup().setLngLat(e.lngLat).setHTML(popupContent).addTo(map);
          };

          handlersRef.current.handleMouseEnter = () => {
            map.getCanvas().style.cursor = 'pointer';
          };

          handlersRef.current.handleMouseLeave = () => {
            map.getCanvas().style.cursor = '';
          };
          layersAddedRef.current = true;
          console.log('✅ Regional impacts layer loaded successfully with all event listeners');
          isLoadingRef.current = false;
        };

        // Check if style is loaded before adding layers
        console.log('🔍 Checking map style status...');
        console.log(`   - Map isStyleLoaded(): ${safeIsStyleLoaded(map)}`);
        console.log(`   - Map loaded(): ${map.loaded()}`);

        if (!mountedRef.current) {
          console.log('🚫 Component unmounted before adding layers, aborting');
          isLoadingRef.current = false;
          return;
        }

        if (safeIsStyleLoaded(map)) {
          console.log('✅ Map style is loaded, adding layers immediately');
          addLayers();
        } else {
          console.log('⏳ Map style not loaded yet, waiting for "load" event');

          // Remove any existing load listener to prevent duplicates
          if (loadEventListenerRef.current) {
            console.log('🧹 Removing previous load listener');
            map.off('load', loadEventListenerRef.current);
          }

          // Create and store the listener
          loadEventListenerRef.current = () => {
            if (!mountedRef.current) {
              console.log('🚫 Component unmounted before load event, skipping');
              isLoadingRef.current = false;
              return;
            }
            console.log('🎉 Map "load" event fired, now adding layers');
            addLayers();
          };

          map.once('load', loadEventListenerRef.current);
        }
      } catch (error) {
        console.error('❌ CRITICAL ERROR loading regional impacts:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        debugLogger.error('Failed to load regional impacts layer', 'map-layer', error);
        isLoadingRef.current = false;
      }
    };

    // Wait for map to be fully loaded before adding layers
    let styleLoadListener: (() => void) | null = null;

    console.log('🔍 Setting up regional impacts layer loader...');
    console.log(`   - Map exists: ${!!map}`);
    console.log(`   - Visible: ${visible}`);
    console.log(`   - Map isStyleLoaded: ${safeIsStyleLoaded(map)}`);
    console.log(`   - Map loaded: ${map.loaded()}`);

    if (!safeIsStyleLoaded(map)) {
      console.log('⏳ Map not ready, attaching styledata listener (ONCE)');
      styleLoadListener = () => {
        console.log('🎉 Map styledata event fired, calling loadRegionalImpacts');
        loadRegionalImpacts();
      };
      // Use 'once' instead of 'on' to prevent multiple calls
      map.once('styledata', styleLoadListener);
    } else {
      console.log('✅ Map is ready, calling loadRegionalImpacts immediately');
      loadRegionalImpacts();
    }

    // Cleanup
    return () => {
      if (!map) return;

      console.log('🧹 Cleaning up RegionalImpactsLayer');

      // Remove styledata listener if it was registered
      if (styleLoadListener) {
        map.off('styledata', styleLoadListener);
      }

      // Remove load listener if it was registered
      if (loadEventListenerRef.current) {
        map.off('load', loadEventListenerRef.current);
        loadEventListenerRef.current = null;
      }

      const fillLayerId = REGIONAL_FILL_LAYER_ID;

      try {
        // Remove event listeners
        if (handlersRef.current.handleClick) {
          map.off('click', fillLayerId, handlersRef.current.handleClick);
        }
        if (handlersRef.current.handleMouseEnter) {
          map.off('mouseenter', fillLayerId, handlersRef.current.handleMouseEnter);
        }
        if (handlersRef.current.handleMouseLeave) {
          map.off('mouseleave', fillLayerId, handlersRef.current.handleMouseLeave);
        }

        // Remove layers and source — only when the style is still accessible.
        // On full page unmount the map can be partially destroyed; isStyleLoaded()
        // returns false (or throws) in that state, so we skip layer removal safely.
        if (safeIsStyleLoaded(map)) {
          removeRegionalLayersAndSource(map);
        }

        // Reset flags regardless
        layersAddedRef.current = false;
        isLoadingRef.current = false;
      } catch (e) {
        // Any error here means the map was destroyed or style removed before cleanup ran.
        // MapLibre throws 'There is no style added to the map.' (a plain Error, not TypeError)
        // when isStyleLoaded() is called after the style has been torn down. This is expected
        // on full page unmount and is not actionable — suppress all cleanup errors silently.
        layersAddedRef.current = false;
        isLoadingRef.current = false;
      }
    };
  }, [map, visible, styleChangeCounter, selectedRegion, onRegionSelect, mapStyle, countryCode]); // styleChangeCounter needed to recreate layers after basemap changes

  // Separate effect to update colors when style changes (without recreating layers)
  useEffect(() => {
    if (!map || !visible) return;

    // Wait for style to be loaded before accessing layers
    if (!safeIsStyleLoaded(map)) return;

    const fillLayerId = 'regional-impacts-fill';
    const lineLayerId = 'regional-impacts-line';

    try {
      if (map.getLayer(fillLayerId)) {
        // Use consistent color expressions from colorSystem.ts
        const colorExpression =
          mapStyle === 'wind'
            ? createWindColorExpression()
            : createLossColorExpression(countryCode);
        const opacityExpression = createRegionalFillOpacity(
          mapStyle as 'wind' | 'loss',
          selectedRegion,
          layerOpacityScale / 100
        );

        // Smoothly transition to new color scheme using setPaintProperty only
        map.setPaintProperty(fillLayerId, 'fill-color', colorExpression);
        map.setPaintProperty(fillLayerId, 'fill-opacity', opacityExpression as any);

        // Update line highlighting based on selection using unified helpers
        if (map.getLayer(lineLayerId)) {
          map.setPaintProperty(
            lineLayerId,
            'line-color',
            createRegionalLineColor(selectedRegion) as any
          );
          map.setPaintProperty(
            lineLayerId,
            'line-width',
            createRegionalLineWidth(selectedRegion) as any
          );
        }

        console.log(`Switched to ${mapStyle} color scheme via setPaintProperty`);
      }
    } catch (e) {
      console.warn('Error updating map style:', e);
    }
  }, [map, visible, mapStyle, selectedRegion, styleChangeCounter, layerOpacityScale, countryCode]);

  return null;
}
