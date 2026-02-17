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

interface RegionalImpactsLayerProps {
  map: MapLibreMap | null;
  visible: boolean;
  mapStyle?: 'loss' | 'wind' | 'satellite' | 'street';
  selectedRegion?: string | null;
  onRegionSelect?: (regionId: string | null) => void;
  styleChangeCounter?: number;
}

export default function RegionalImpactsLayer({
  map,
  visible,
  mapStyle = 'loss',
  selectedRegion = null,
  onRegionSelect,
  styleChangeCounter = 0,
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
  }>({});

  useEffect(() => {
    if (!map || !visible) {
      console.log(`❌ RegionalImpactsLayer: Skipping load (map: ${!!map}, visible: ${visible})`);
      return;
    }

    const loadRegionalImpacts = async () => {
      try {
        debugLogger.info('Loading regional impacts layer', 'map-source');
        console.log(
          `📊 Loading RegionalImpactsLayer (mapStyle: ${mapStyle}, selectedRegion: ${selectedRegion})`
        );

        // Load both regional impacts and sector-specific data with caching
        // Use cached data if available to avoid refetching on style changes
        let geojson, sectorGeojson;

        if (dataCache.current.geojson && dataCache.current.sectorGeojson) {
          geojson = dataCache.current.geojson;
          sectorGeojson = dataCache.current.sectorGeojson;
        } else {
          const [regionalResult, sectorResult] = await Promise.all([
            loadGeoJSON('/regional-impacts.geojson', { cache: true }),
            loadGeoJSON('/regional-impacts-by-sector.geojson', { cache: true }),
          ]);

          if (!regionalResult.data) {
            debugLogger.warn('Could not load regional impacts data', 'map-source');
            return;
          }

          geojson = regionalResult.data;
          sectorGeojson = sectorResult.data || null;

          // Cache for future use
          dataCache.current = { geojson, sectorGeojson };
        }

        const sourceId = 'regional-impacts';
        const fillLayerId = 'regional-impacts-fill';
        const lineLayerId = 'regional-impacts-line';

        // Remove existing layers and source if present
        try {
          if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
          }
          if (map.getLayer(lineLayerId)) {
            map.removeLayer(lineLayerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
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
          // Check if source already exists and remove it first to prevent "already exists" error
          if (map.getSource(sourceId)) {
            try {
              if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
              if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
              map.removeSource(sourceId);
            } catch (e) {
              debugLogger.warn('Error removing existing source before re-adding', 'map-source', e);
            }
          }

          // Add source
          map.addSource(sourceId, {
            type: 'geojson',
            data: geojson,
          });

          // Define color expressions using unified color system
          const lossColorExpression = createLossColorExpression();
          const windColorExpression = createWindColorExpression();

          // Use deterministic z-order system for consistent layer placement
          const fillBeforeId = getBeforeLayerId(map, 'regional-impacts-fill');

          // Add fill layer for regions with dynamic color based on mapStyle
          // World-class design: Extremely subtle choropleth with clear boundaries
          // Focus on boundary definition rather than fill - industry best practice
          console.log(
            `🗺️ Adding regional-impacts-fill layer (mapStyle: ${mapStyle}, beforeId: ${fillBeforeId})`
          );
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
                  selectedRegion
                ) as any,
              },
            },
            fillBeforeId
          );
          console.log(
            `✅ Regional impacts layer added successfully (${geojson.features?.length || 0} features)`
          );

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

          // Add event listeners
          map.on('click', fillLayerId, handlersRef.current.handleClick);
          map.on('mouseenter', fillLayerId, handlersRef.current.handleMouseEnter);
          map.on('mouseleave', fillLayerId, handlersRef.current.handleMouseLeave);

          console.log('Loaded regional impacts layer successfully');
        };

        // Check if style is loaded before adding layers
        if (map.isStyleLoaded()) {
          addLayers();
        } else {
          map.once('load', addLayers);
        }
      } catch (error) {
        console.error('Error loading regional impacts:', error);
      }
    };

    // Wait for map to be fully loaded before adding layers
    let styleLoadListener: (() => void) | null = null;

    if (!map.isStyleLoaded()) {
      styleLoadListener = () => {
        loadRegionalImpacts();
      };
      map.on('styledata', styleLoadListener);
    } else {
      loadRegionalImpacts();
    }

    // Cleanup
    return () => {
      if (!map) return;

      // Remove styledata listener if it was registered
      if (styleLoadListener) {
        map.off('styledata', styleLoadListener);
      }

      const sourceId = 'regional-impacts';
      const fillLayerId = 'regional-impacts-fill';
      const lineLayerId = 'regional-impacts-line';

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

        // Remove layers and source
        if (map.getLayer(fillLayerId)) {
          map.removeLayer(fillLayerId);
        }
        if (map.getLayer(lineLayerId)) {
          map.removeLayer(lineLayerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        console.warn('Error cleaning up regional impacts layers:', e);
      }
    };
  }, [map, visible, styleChangeCounter, selectedRegion, onRegionSelect]); // styleChangeCounter needed to recreate layers after basemap changes

  // Separate effect to update colors when style changes (without recreating layers)
  useEffect(() => {
    if (!map || !visible) return;

    // Wait for style to be loaded before accessing layers
    if (!map.isStyleLoaded()) return;

    const fillLayerId = 'regional-impacts-fill';
    const lineLayerId = 'regional-impacts-line';

    try {
      if (map.getLayer(fillLayerId)) {
        // Use consistent color expressions from colorSystem.ts
        const colorExpression =
          mapStyle === 'wind' ? createWindColorExpression() : createLossColorExpression();
        const opacityExpression = createRegionalFillOpacity(
          mapStyle as 'wind' | 'loss',
          selectedRegion
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
  }, [map, visible, mapStyle, selectedRegion, styleChangeCounter]);

  return null;
}
