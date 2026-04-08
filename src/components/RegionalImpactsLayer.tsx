/**
 * Component to load and display regional impacts GeoJSON layer
 */

import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import {
  createRegionalFillOpacity,
  createRegionalLineColor,
  createRegionalLineWidth,
  LAYER_OPACITY,
  createLossColorExpression,
  createWindColorExpression,
} from '@/utils/colorSystem';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { debugLogger } from '@/utils/debugLogger';
import { CountryCode } from '@/types/thredds';
import type { LegendSettings } from '@/data/realThreddsLayers';
import { useRegionalImpactsData } from '@/hooks/useRegionalImpactsData';

function safeIsStyleLoaded(map: MapLibreMap | null): boolean {
  if (!map) return false;
  try {
    const styleLoaded = map.isStyleLoaded();
    return !!map.getStyle() && styleLoaded === true;
  } catch {
    return false;
  }
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const REGIONAL_SOURCE_ID = 'regional-impacts';
const REGIONAL_FILL_LAYER_ID = 'regional-impacts-fill';
const REGIONAL_LINE_LAYER_ID = 'regional-impacts-line';
const REGIONAL_EXTRUSION_LAYER_ID = 'regional-impacts-extrusion';

function getFeatureRegionName(props: Record<string, unknown>): string {
  const value = props['Region.Region'] ?? props.Region ?? props.region_name;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unknown Region';
}

function getFeatureRegionId(props: Record<string, unknown>): string {
  const value = props['Region.ID'] ?? props.Region_ID ?? props['Region.Region'] ?? props.Region;
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : 'unknown-region';
}

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

function createDynamicColorExpression(
  field: string,
  thresholds: { value: number; color: string }[]
): maplibregl.ExpressionSpecification {
  const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);
  const stops: (string | number)[] = [];

  sortedThresholds.forEach(threshold => {
    if (isFinite(threshold.value)) {
      stops.push(threshold.value, threshold.color);
    }
  });

  const fallbackColor = sortedThresholds.find(t => !isFinite(t.value))?.color || '#cccccc';

  return ['step', ['get', field], fallbackColor, ...stops];
}

interface RegionalImpactsLayerProps {
  map: MapLibreMap | null;
  visible: boolean;
  mapStyle?: 'loss' | 'wind' | 'satellite' | 'street';
  selectedRegion?: string | null;
  onRegionSelect?: (regionId: string | null) => void;
  styleChangeCounter?: number;
  countryCode?: CountryCode | null;
  layerOpacityScale?: number;
  legendSettings?: LegendSettings;
  onDebugStateChange?: (state: RegionalImpactsDebugState) => void;
}

export interface RegionalImpactsDebugState {
  countryCode: CountryCode | null;
  mapStyle: 'loss' | 'wind' | 'satellite' | 'street';
  visible: boolean;
  loading: boolean;
  error: string | null;
  featureCount: number;
  sectorFeatureCount: number;
  hasTotalLoss: boolean;
  hasMaxWindGusts: boolean;
  selectedRegion: string | null;
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
  legendSettings,
  onDebugStateChange,
}: RegionalImpactsLayerProps) {
  const handlersRef = useRef<{
    handleClick?: (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => void;
    handleMouseEnter?: () => void;
    handleMouseLeave?: () => void;
  }>({});
  const mountedRef = useRef(true);
  const selectedRegionRef = useRef<string | null>(selectedRegion);
  const onRegionSelectRef = useRef<typeof onRegionSelect>(onRegionSelect);
  const sectorDataByRegionRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const { data, sectorData, loading, error } = useRegionalImpactsData(countryCode);

  const sectorDataByRegion = useMemo(() => {
    const regionMap = new Map<string, Record<string, unknown>>();

    sectorData?.features?.forEach(feature => {
      const region = feature.properties?.Region || feature.properties?.ID;
      if (typeof region === 'string' || typeof region === 'number') {
        regionMap.set(String(region), (feature.properties || {}) as Record<string, unknown>);
      }
    });

    return regionMap;
  }, [sectorData]);

  // Memoize color expressions to avoid recomputation
  const lossColorExpression = useMemo(() => {
    return legendSettings
      ? createDynamicColorExpression('Total_Loss', legendSettings.loss)
      : createLossColorExpression(countryCode);
  }, [legendSettings, countryCode]);

  const windColorExpression = useMemo(() => {
    return legendSettings
      ? createDynamicColorExpression('Max_Wind_Gusts', legendSettings.wind)
      : createWindColorExpression();
  }, [legendSettings]);

  const renderStateRef = useRef({
    mapStyle,
    layerOpacityScale,
    lossColorExpression,
    windColorExpression,
  });

  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  useEffect(() => {
    onRegionSelectRef.current = onRegionSelect;
  }, [onRegionSelect]);

  useEffect(() => {
    renderStateRef.current = {
      mapStyle,
      layerOpacityScale,
      lossColorExpression,
      windColorExpression,
    };
  }, [mapStyle, layerOpacityScale, lossColorExpression, windColorExpression]);

  useEffect(() => {
    sectorDataByRegionRef.current = sectorDataByRegion;
  }, [sectorDataByRegion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Effect 1: Layer Setup
   *
   * Responsibilities:
   * - Creates map source with empty GeoJSON data
   * - Adds fill and line layers with initial style expressions
   * - Attaches event handlers (click, mouseenter, mouseleave)
   *
   * Dependencies:
   * - map: Required for all MapLibre operations
   * - visible: Controls when layers should be added
   * - styleChangeCounter: Signals basemap change → full layer recreation needed
   *
   * Why it recreates on styleChangeCounter:
   * When basemap changes, the entire style is replaced, so all custom layers/sources
   * must be recreated. This effect handles that by tearing down and rebuilding.
   */
  useEffect(() => {
    if (!map || !visible) return;

    const handleClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = (feature.properties || {}) as Record<string, unknown>;
      const regionName = getFeatureRegionName(props);
      const regionId = getFeatureRegionId(props);

      if (onRegionSelectRef.current) {
        const isAlreadySelected =
          selectedRegionRef.current === regionId || selectedRegionRef.current === regionName;
        onRegionSelectRef.current(isAlreadySelected ? null : regionId);
      }

      const sectorDataForRegion = sectorDataByRegionRef.current.get(regionName);
      let sectorBreakdown = '';

      if (sectorDataForRegion) {
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
            const loss = Number(sectorDataForRegion[sector.key]) || 0;
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
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${regionName}</h3>
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

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const addLayers = () => {
      if (!mountedRef.current || !safeIsStyleLoaded(map)) return;
      const {
        mapStyle: currentMapStyle,
        layerOpacityScale: currentLayerOpacityScale,
        lossColorExpression: currentLossColorExpression,
        windColorExpression: currentWindColorExpression,
      } = renderStateRef.current;

      if (!map.getSource(REGIONAL_SOURCE_ID)) {
        map.addSource(REGIONAL_SOURCE_ID, {
          type: 'geojson',
          data: data ?? EMPTY_GEOJSON,
        });
      }

      const source = map.getSource(REGIONAL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source?.setData) {
        source.setData(data ?? EMPTY_GEOJSON);
      }

      const fillBeforeId = getBeforeLayerId(map, REGIONAL_FILL_LAYER_ID);
      if (!map.getLayer(REGIONAL_FILL_LAYER_ID)) {
        map.addLayer(
          {
            id: REGIONAL_FILL_LAYER_ID,
            type: 'fill',
            source: REGIONAL_SOURCE_ID,
            paint: {
              'fill-color':
                currentMapStyle === 'wind'
                  ? currentWindColorExpression
                  : currentLossColorExpression,
              'fill-opacity': createRegionalFillOpacity(
                currentMapStyle as 'wind' | 'loss',
                selectedRegionRef.current,
                currentLayerOpacityScale / 100
              ) as maplibregl.ExpressionSpecification,
            },
          },
          fillBeforeId
        );

        map.setPaintProperty(REGIONAL_FILL_LAYER_ID, 'fill-color-transition', {
          duration: 800,
          delay: 0,
        });
        map.setPaintProperty(REGIONAL_FILL_LAYER_ID, 'fill-opacity-transition', {
          duration: 500,
          delay: 0,
        });
      }

      const lineBeforeId = getBeforeLayerId(map, REGIONAL_LINE_LAYER_ID);
      if (!map.getLayer(REGIONAL_LINE_LAYER_ID)) {
        map.addLayer(
          {
            id: REGIONAL_LINE_LAYER_ID,
            type: 'line',
            source: REGIONAL_SOURCE_ID,
            paint: {
              'line-color': createRegionalLineColor(
                selectedRegionRef.current
              ) as maplibregl.ExpressionSpecification,
              'line-width': createRegionalLineWidth(
                selectedRegionRef.current
              ) as maplibregl.ExpressionSpecification,
              'line-opacity': [
                'case',
                [
                  'any',
                  [
                    '==',
                    ['to-string', ['coalesce', ['get', 'Region.ID'], '']],
                    selectedRegionRef.current || '',
                  ],
                  [
                    '==',
                    ['to-string', ['coalesce', ['get', 'Region_ID'], '']],
                    selectedRegionRef.current || '',
                  ],
                  [
                    '==',
                    ['to-string', ['coalesce', ['get', 'Region.Region'], '']],
                    selectedRegionRef.current || '',
                  ],
                  [
                    '==',
                    ['to-string', ['coalesce', ['get', 'Region'], '']],
                    selectedRegionRef.current || '',
                  ],
                ],
                1.0,
                LAYER_OPACITY.regional.outline,
              ] as maplibregl.ExpressionSpecification,
            },
          },
          lineBeforeId
        );
      }

      handlersRef.current = { handleClick, handleMouseEnter, handleMouseLeave };
      map.on('click', REGIONAL_FILL_LAYER_ID, handleClick);
      map.on('mouseenter', REGIONAL_FILL_LAYER_ID, handleMouseEnter);
      map.on('mouseleave', REGIONAL_FILL_LAYER_ID, handleMouseLeave);
    };

    let loadListener: (() => void) | null = null;

    if (safeIsStyleLoaded(map)) {
      addLayers();
    } else {
      loadListener = () => addLayers();
      map.once('load', loadListener);
    }

    return () => {
      if (loadListener) {
        map.off('load', loadListener);
      }

      const handlers = handlersRef.current;
      try {
        if (handlers.handleClick) {
          map.off('click', REGIONAL_FILL_LAYER_ID, handlers.handleClick);
        }
        if (handlers.handleMouseEnter) {
          map.off('mouseenter', REGIONAL_FILL_LAYER_ID, handlers.handleMouseEnter);
        }
        if (handlers.handleMouseLeave) {
          map.off('mouseleave', REGIONAL_FILL_LAYER_ID, handlers.handleMouseLeave);
        }
        if (safeIsStyleLoaded(map)) {
          removeRegionalLayersAndSource(map);
        }
      } catch {
        // Ignore cleanup errors when the style has already been torn down.
      } finally {
        handlersRef.current = {};
      }
    };
  }, [map, visible, styleChangeCounter, countryCode, data]);

  /**
   * Effect 2: Data Updates
   *
   * Responsibilities:
   * - Updates the GeoJSON source data when new data is loaded
   * - Uses source.setData() to update existing source (no layer recreation)
   *
   * Dependencies:
   * - map: Required for source access
   * - data: New GeoJSON data from hook
   *
   * Why it doesn't depend on styleChangeCounter:
   * Data updates should NOT recreate layers, only update the source.
   * Effect 1 handles layer creation, this only pushes new data.
   */
  useEffect(() => {
    if (!map) return;

    const applyData = () => {
      if (!safeIsStyleLoaded(map)) return;

      const source = map.getSource(REGIONAL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source?.setData) {
        source.setData(data ?? EMPTY_GEOJSON);
      }
    };

    let loadListener: (() => void) | null = null;

    if (safeIsStyleLoaded(map)) {
      applyData();
    } else {
      loadListener = () => applyData();
      map.once('load', loadListener);
    }

    return () => {
      if (loadListener) {
        map.off('load', loadListener);
      }
    };
  }, [map, data, countryCode, styleChangeCounter]);

  /**
   * Effect 3: Paint Property Updates
   *
   * Responsibilities:
   * - Updates layer colors when switching between loss/wind styles
   * - Updates opacity when layer opacity slider changes
   * - Updates line highlighting when region selection changes
   *
   * Dependencies:
   * - map, visible: Required for layer access
   * - mapStyle: Triggers color change (loss colors vs wind colors)
   * - selectedRegion: Updates line highlighting for selected region
   * - layerOpacityScale: Updates fill opacity
   * - legendSettings, countryCode: Affect color expressions (via memoized values)
   *
   * Why it doesn't depend on styleChangeCounter:
   * Paint property updates should NOT recreate layers, only modify existing ones.
   * Uses setPaintProperty() for smooth visual transitions without layer recreation.
   */
  useEffect(() => {
    if (!map || !visible || !safeIsStyleLoaded(map)) return;

    const propertyName = mapStyle === 'wind' ? 'Max_Wind_Gusts' : 'Total_Loss';
    const sourceData = data;

    if (sourceData?.features?.length) {
      const hasProperty = sourceData.features.some(
        feature => propertyName in ((feature.properties as Record<string, unknown>) || {})
      );

      if (!hasProperty) {
        console.warn(
          `[RegionalImpactsLayer] Missing '${propertyName}' in regional impacts source data; skipping style update`
        );
        return;
      }
    }

    try {
      if (map.getLayer(REGIONAL_FILL_LAYER_ID)) {
        const colorExpression = mapStyle === 'wind' ? windColorExpression : lossColorExpression;

        map.setPaintProperty(REGIONAL_FILL_LAYER_ID, 'fill-color', colorExpression);
        map.setPaintProperty(
          REGIONAL_FILL_LAYER_ID,
          'fill-opacity',
          createRegionalFillOpacity(
            mapStyle as 'wind' | 'loss',
            selectedRegion,
            layerOpacityScale / 100
          ) as maplibregl.ExpressionSpecification
        );
      }

      if (map.getLayer(REGIONAL_LINE_LAYER_ID)) {
        map.setPaintProperty(
          REGIONAL_LINE_LAYER_ID,
          'line-color',
          createRegionalLineColor(selectedRegion) as maplibregl.ExpressionSpecification
        );
        map.setPaintProperty(
          REGIONAL_LINE_LAYER_ID,
          'line-width',
          createRegionalLineWidth(selectedRegion) as maplibregl.ExpressionSpecification
        );
      }
    } catch (paintError) {
      debugLogger.warn('Error updating regional impacts paint properties', 'map-layer', paintError);
    }
  }, [
    map,
    visible,
    mapStyle,
    selectedRegion,
    layerOpacityScale,
    legendSettings,
    countryCode,
    data,
    lossColorExpression,
    windColorExpression,
  ]);

  /**
   * Effect 4: Error Handling
   *
   * Responsibilities:
   * - Logs data loading errors from the hook
   *
   * Dependencies:
   * - error: Error state from useRegionalImpactsData hook
   */
  useEffect(() => {
    if (!error) return;
    if (error.name === 'AbortError') return;
    debugLogger.warn('Could not load regional impacts data', 'map-source', error);
  }, [error]);

  useEffect(() => {
    if (!onDebugStateChange) return;

    const features = data?.features ?? [];
    const hasTotalLoss = features.some(
      feature => 'Total_Loss' in (((feature.properties || {}) as Record<string, unknown>) || {})
    );
    const hasMaxWindGusts = features.some(
      feature => 'Max_Wind_Gusts' in (((feature.properties || {}) as Record<string, unknown>) || {})
    );

    onDebugStateChange({
      countryCode,
      mapStyle,
      visible,
      loading,
      error: error?.name === 'AbortError' ? null : (error?.message ?? null),
      featureCount: features.length,
      sectorFeatureCount: sectorData?.features?.length ?? 0,
      hasTotalLoss,
      hasMaxWindGusts,
      selectedRegion,
    });
  }, [
    countryCode,
    mapStyle,
    visible,
    loading,
    error,
    data,
    sectorData,
    selectedRegion,
    onDebugStateChange,
  ]);

  return null;
}
