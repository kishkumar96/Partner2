'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { FilterState } from '@/types';
import {
  buildWMSImageUrl,
  buildWMSTileUrl,
  getLayersForCountry,
  RealWMSLayer,
} from '@/data/realThreddsLayers';
import { loadCycloneForecastTrack } from '@/utils/cycloneAnimationLoader';
import {
  loadCycloneTrackData,
  DATA_PATH,
  COUNTRY_CYCLONE_CONFIG,
  buildCycloneTrackFromForecastPoints,
} from '@/utils/realDataLoader';
import { generateForecastCone } from '@/utils/forecastCone';

const HAZARD_ID_TO_LAYER_TYPE: Record<string, string[]> = {
  'tropical-cyclone': ['cyclone', 'wind'],
  flood: ['flood', 'inundation'],
  inundation: ['flood', 'inundation'],
  'coastal-flooding': ['flood', 'inundation'],
  'fluvial-flooding': ['flood', 'inundation', 'fluvial-depth'],
  volcanic: [],
  earthquake: [],
  drought: [],
  tsunami: [],
  'storm-surge': ['flood', 'inundation'],
};

const RAW_WMS_PARITY_LAYER_IDS = new Set(['to-tc-harold-wind', 'vu-tc-lola-wind']);
const isRawParityMapLayerId = (layerId: string): boolean =>
  RAW_WMS_PARITY_LAYER_IDS.has(layerId.replace('wms-layer-', ''));

function normalizeDateValue(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEffectiveDateRange(
  startDate: string,
  endDate: string
): {
  effectiveStartDate: string;
  effectiveEndDate: string;
} {
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);

  return {
    effectiveStartDate:
      normalizedStartDate && normalizedEndDate && normalizedStartDate > normalizedEndDate
        ? normalizedEndDate
        : normalizedStartDate,
    effectiveEndDate:
      normalizedStartDate && normalizedEndDate && normalizedStartDate > normalizedEndDate
        ? normalizedStartDate
        : normalizedEndDate,
  };
}

function countryIsExcludedByTemporalFilters(
  country: CountryCode,
  selectedEventIds: string[],
  effectiveStartDate: string,
  effectiveEndDate: string
): boolean {
  const cycloneConfig = COUNTRY_CYCLONE_CONFIG?.[country];
  if (!cycloneConfig) return false;

  if (selectedEventIds.length > 0 && !selectedEventIds.includes(cycloneConfig.eventId)) {
    return true;
  }

  const normalizedEventDate = normalizeDateValue(cycloneConfig.eventDate);
  if (effectiveStartDate && normalizedEventDate && normalizedEventDate < effectiveStartDate) {
    return true;
  }
  if (effectiveEndDate && normalizedEventDate && normalizedEventDate > effectiveEndDate) {
    return true;
  }

  return false;
}

function getHazardTypesToShow(
  selectedHazards: string[],
  showWindLayer: boolean,
  showInundationLayer: boolean
): string[] {
  if (selectedHazards.length > 0) {
    const filteredHazardTypes = new Set(
      selectedHazards.flatMap(hazardId => HAZARD_ID_TO_LAYER_TYPE[hazardId] ?? [])
    );

    if (!showWindLayer) {
      filteredHazardTypes.delete('wind');
    }
    if (!showInundationLayer) {
      filteredHazardTypes.delete('flood');
      filteredHazardTypes.delete('inundation');
      filteredHazardTypes.delete('fluvial-depth');
    }

    return Array.from(filteredHazardTypes);
  }

  const hazardTypesToShow: string[] = [];
  if (showWindLayer) {
    hazardTypesToShow.push('wind');
  }
  if (showInundationLayer) {
    hazardTypesToShow.push('inundation', 'flood');
  }
  return hazardTypesToShow;
}

interface RealDataLayersProps {
  map: MapLibreMap | null;
  countryCode: CountryCode | null; // Allow null to load all countries
  visible: boolean;
  mapStyle?: 'loss' | 'wind';
  basemapStyle?: string;
  styleChangeCounter?: number; // Used to trigger re-render when basemap changes
  filters?: FilterState;
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  onLoadingChange?: (isLoading: boolean) => void;
  onActiveLayersChange?: (layers: RealWMSLayer[]) => void;
  /** 0–100 scale applied to all raster layer opacities */
  layerOpacityScale?: number;
  showCycloneTrack?: boolean;
}

export default function RealDataLayers({
  map,
  countryCode,
  visible,
  mapStyle = 'loss',
  basemapStyle = '',
  styleChangeCounter = 0,
  filters,
  showWindLayer = true,
  showInundationLayer = true,
  onLoadingChange,
  onActiveLayersChange,
  layerOpacityScale = 70,
  showCycloneTrack = true,
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
  const layerBaseOpacityRef = useRef<Record<string, number>>({});
  const layerHazardTypeRef = useRef<Record<string, string>>({});
  const layerOpacityScaleRef = useRef(layerOpacityScale);

  // Track progressive resolution upgrade timeouts for cleanup
  const resolutionUpgradeTimeouts = useRef<number[]>([]);

  // Store cyclone track event handlers for proper cleanup
  const cycloneHandlersRef = useRef<{
    handleMouseEnter?: () => void;
    handleMouseLeave?: () => void;
  }>({});

  const selectedEventsKey = useMemo(
    () => JSON.stringify(filters?.selectedEvents ?? []),
    [filters?.selectedEvents]
  );
  const selectedHazardsKey = useMemo(
    () => JSON.stringify(filters?.selectedHazards ?? []),
    [filters?.selectedHazards]
  );
  const dateRangeStart = filters?.dateRange.start ?? '';
  const dateRangeEnd = filters?.dateRange.end ?? '';

  useEffect(() => {
    layerOpacityScaleRef.current = layerOpacityScale;
  }, [layerOpacityScale]);

  // Animate wind layer opacity with smooth pulsing effect
  const startWindAnimation = (map: MapLibreMap) => {
    // Only start animation if not already running
    if (windAnimationFrame.current) {
      return;
    }

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      // Pulse between 70%-100% of base layer opacity for wind mode readability.
      const pulseFactor = 0.7 + (0.3 * (Math.sin(elapsed / 1500) + 1)) / 2;
      const scale = layerOpacityScaleRef.current / 100;

      // Apply animation to all wind layers
      windLayerIds.current.forEach(id => {
        try {
          if (map.getLayer(id)) {
            const baseOpacity = layerBaseOpacityRef.current[id] ?? 0.85;
            map.setPaintProperty(
              id,
              'raster-opacity',
              Math.min(1, baseOpacity * pulseFactor * scale)
            );
          }
        } catch (_e) {
          // Layer might have been removed, filter it out and clear stale metadata.
          windLayerIds.current = windLayerIds.current.filter(layerId => layerId !== id);
          delete layerBaseOpacityRef.current[id];
          delete layerHazardTypeRef.current[id];
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

        const cycloneConfigByCountry = COUNTRY_CYCLONE_CONFIG ?? ({} as Record<CountryCode, never>);
        const countriesToLoad: CountryCode[] = countryCode
          ? [countryCode]
          : (Object.keys(cycloneConfigByCountry) as CountryCode[]);
        const selectedEventIds = filters?.selectedEvents ?? [];
        const { effectiveStartDate, effectiveEndDate } = getEffectiveDateRange(
          dateRangeStart,
          dateRangeEnd
        );

        // If we are not in a country route, prefer the first country that matches
        // temporal filters instead of hardcoding a VU fallback.
        const effectiveCountry = countriesToLoad.find(
          country =>
            !countryIsExcludedByTemporalFilters(
              country,
              selectedEventIds,
              effectiveStartDate,
              effectiveEndDate
            )
        );

        if (!effectiveCountry) {
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }

        const cycloneConfig = COUNTRY_CYCLONE_CONFIG?.[effectiveCountry];
        if (!cycloneConfig) {
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }
        const trackFile = cycloneConfig.trackFile
          ? `${DATA_PATH[effectiveCountry]}/${cycloneConfig.trackFile}`
          : null;
        const forecastFile = cycloneConfig.forecastFile
          ? `${DATA_PATH[effectiveCountry]}/${cycloneConfig.forecastFile}`
          : null;

        if (!trackFile) {
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }

        // Load forecast data first so we can synthesize a track if GeoJSON is empty.
        const forecastData = forecastFile ? await loadCycloneForecastTrack({ forecastFile }) : null;
        const fallbackTrack =
          forecastData &&
          typeof buildCycloneTrackFromForecastPoints === 'function' &&
          Array.isArray(forecastData) &&
          forecastData.length > 0
            ? buildCycloneTrackFromForecastPoints(forecastData)
            : null;

        // Load from public directory using dataLoader (handles basePath)
        const geojson = await loadCycloneTrackData({ trackFile });
        const hasGeojsonFeatures = Boolean(
          geojson &&
          Array.isArray((geojson as any).features) &&
          (geojson as any).features.length > 0
        );
        const effectiveTrackGeojson = hasGeojsonFeatures ? geojson : fallbackTrack;
        if (!effectiveTrackGeojson) {
          console.warn('Could not load cyclone track data');
          loadingStateRef.current = { ...loadingStateRef.current, cycloneTracks: false };
          return;
        }

        const sourceId = 'cyclone-tracks-real';
        const layerId = 'cyclone-tracks-layer-real';

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
            existing?.setData(effectiveTrackGeojson as any);
          } else {
            map.addSource(sourceId, {
              type: 'geojson',
              data: effectiveTrackGeojson as any,
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

            // Cone hidden — wind swath layers in CycloneAnimationLayer replace this
            if (!map.getLayer(coneLayerId)) {
              map.addLayer(
                {
                  id: coneLayerId,
                  type: 'fill',
                  source: coneSourceId,
                  paint: {
                    'fill-color': '#8B5CF6',
                    'fill-opacity': 0,
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
                    'line-width': 0,
                    'line-opacity': 0,
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

    if (showCycloneTrack) {
      if (!map.isStyleLoaded()) {
        onStyleLoad = () => {
          map.off('styledata', onStyleLoad!);
          loadCycloneTracks();
        };
        map.on('styledata', onStyleLoad);
      } else {
        loadCycloneTracks();
      }
    }

    // Cleanup
    return () => {
      if (!map) return;

      if (onStyleLoad) {
        try {
          map.off('styledata', onStyleLoad);
        } catch (_e) {
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
      } catch (_e) {
        // Silently ignore cleanup errors
      }
    };
  }, [map, countryCode, visible, styleChangeCounter, showCycloneTrack]); // Re-load cyclone tracks when basemap changes

  // Load real WMS hazard layers from THREDDS (with lazy loading based on zoom)
  useEffect(() => {
    if (!map || !visible) return;

    // Reset loaded status when country or filters change
    wmsLayersLoaded.current = false;
    windLayerIds.current = []; // Clear wind layer tracking on country/style/filter change

    const loadRealWMSLayers = async () => {
      // Guard against style race: do not proceed until style is fully ready.
      if (!map.isStyleLoaded()) {
        return;
      }

      // Clear any pending progressive resolution upgrades from previous loads
      resolutionUpgradeTimeouts.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      resolutionUpgradeTimeouts.current = [];

      // Define minimum zoom level for WMS layer loading to optimize performance
      // WMS raster layers are expensive to fetch and render at low zoom levels.
      // Pacific island nations are small and viewed at zoom ~6-9 at country level,
      // so use 6 as the threshold to ensure layers load at typical country views.
      const MIN_ZOOM_FOR_WMS = 6;

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
        const selectedEventIds = filters?.selectedEvents ?? [];
        const { effectiveStartDate, effectiveEndDate } = getEffectiveDateRange(
          dateRangeStart,
          dateRangeEnd
        );

        const getBasemapCategory = (): 'light' | 'dark' | 'imagery' => {
          const value = basemapStyle.toLowerCase();
          if (
            value.includes('satellite') ||
            value.includes('imagery') ||
            value.includes('hybrid')
          ) {
            return 'imagery';
          }
          if (value.includes('dark') || value.includes('night') || value.includes('matter')) {
            return 'dark';
          }
          return 'light';
        };

        const getBaseLayerOpacity = (hazardType: string, layerId?: string): number => {
          if (layerId && RAW_WMS_PARITY_LAYER_IDS.has(layerId)) {
            // Keep parity layers visually aligned with direct WMS previews.
            return 1;
          }
          const basemapCategory = getBasemapCategory();

          if (hazardType === 'wind' && showWindLayer) {
            return mapStyle === 'wind' ? 0.85 : 0.5;
          }
          if (
            (hazardType === 'flood' ||
              hazardType === 'inundation' ||
              hazardType === 'fluvial-depth') &&
            showInundationLayer
          ) {
            const base = mapStyle === 'loss' ? 0.82 : 0.76;
            if (basemapCategory === 'dark') return base + 0.06;
            if (basemapCategory === 'imagery') return base + 0.1;
            return base;
          }
          if (hazardType === 'cyclone') {
            return mapStyle === 'loss' ? 0.65 : 0;
          }
          if (hazardType === 'wind') {
            return mapStyle === 'wind' ? 0.85 : 0.15;
          }
          if (
            hazardType === 'flood' ||
            hazardType === 'inundation' ||
            hazardType === 'fluvial-depth'
          ) {
            const base = mapStyle === 'loss' ? 0.66 : 0;
            if (base === 0) return 0;
            if (basemapCategory === 'dark') return base + 0.06;
            if (basemapCategory === 'imagery') return base + 0.1;
            return base;
          }

          return 0.15;
        };

        const getRasterVisualTuning = (hazardType: string, layerId?: string) => {
          if (layerId && RAW_WMS_PARITY_LAYER_IDS.has(layerId)) {
            // Match direct WMS rendering as closely as possible for Tonga wind.
            return {
              contrast: 0,
              saturation: 0,
              brightnessMin: 0,
              brightnessMax: 1,
            };
          }

          if (
            hazardType === 'flood' ||
            hazardType === 'inundation' ||
            hazardType === 'fluvial-depth'
          ) {
            // Match QGIS/WMS default presentation as closely as possible:
            // keep flood rasters unmodified in the client pipeline.
            return {
              contrast: 0,
              saturation: 0,
              brightnessMin: 0,
              brightnessMax: 1,
            };
          }

          if (hazardType === 'wind') {
            return {
              contrast: 0.25,
              saturation: 0.2,
              brightnessMin: 0.05,
              brightnessMax: 0.98,
            };
          }

          return {
            contrast: 0.2,
            saturation: 0,
            brightnessMin: 0,
            brightnessMax: 1,
          };
        };

        const getRasterResampling = (hazardType: string, layerId?: string) => {
          if (layerId && RAW_WMS_PARITY_LAYER_IDS.has(layerId)) {
            return 'nearest' as const;
          }

          if (
            hazardType === 'flood' ||
            hazardType === 'inundation' ||
            hazardType === 'fluvial-depth'
          ) {
            // Flood rasters look softer than intended with linear interpolation,
            // especially after native tiles are overzoomed at coastal scales.
            return 'nearest' as const;
          }

          return 'linear' as const;
        };

        // Determine which countries to load hazards for
        const countriesToLoad: CountryCode[] = countryCode
          ? [countryCode]
          : (Object.keys(COUNTRIES) as CountryCode[]);

        const countryMatchesTemporalFilters = (country: CountryCode) => {
          return !countryIsExcludedByTemporalFilters(
            country,
            selectedEventIds,
            effectiveStartDate,
            effectiveEndDate
          );
        };

        const hazardTypesToShow = getHazardTypesToShow(
          filters?.selectedHazards ?? [],
          showWindLayer,
          showInundationLayer
        );

        console.log(
          `✅ Final hazard types to show:`,
          hazardTypesToShow,
          `(Wind: ${showWindLayer}, Flood/Inundation: ${showInundationLayer}, Selected events: ${selectedEventIds.length || 'all'}, Date range: ${effectiveStartDate || '...'} → ${effectiveEndDate || '...'})`
        );

        // Collect all active layers for the legend
        const allActiveLayers: RealWMSLayer[] = [];

        for (const country of countriesToLoad) {
          if (!countryMatchesTemporalFilters(country)) {
            console.log(
              `Skipping WMS layers for ${country} because current temporal filters exclude its historical event.`
            );
            // Hide any already-loaded layers for this country so they don't linger.
            getLayersForCountry(country).forEach(layer => {
              const layerId = `wms-layer-${layer.id}`;
              try {
                if (map.getLayer(layerId)) {
                  map.setLayoutProperty(layerId, 'visibility', 'none');
                }
              } catch (_e) {
                // Layer may be mid-transition; ignore.
              }
            });
            continue;
          }

          const countryLayers = getLayersForCountry(country);
          const availableLayers = countryLayers.filter(layer =>
            hazardTypesToShow.includes(layer.hazardType)
          );

          // Reconcile visibility for existing layers first to avoid expensive remove/add churn.
          countryLayers.forEach(layer => {
            const layerId = `wms-layer-${layer.id}`;
            if (!map.getLayer(layerId)) return;
            const shouldBeVisible = hazardTypesToShow.includes(layer.hazardType);
            map.setLayoutProperty(layerId, 'visibility', shouldBeVisible ? 'visible' : 'none');
          });

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
                  // Use tiled WMS whenever layer CRS matches map CRS (EPSG:3857).
                  // This is faster, crisper, and avoids static-image georeferencing drift.
                  const useTiledWms = (layer.styleConfig?.crs || 'EPSG:3857') === 'EPSG:3857';

                  if (useTiledWms) {
                    // Flood rasters render best as tiled WMS layers.
                    const tileUrl = buildWMSTileUrl(layer);
                    if (!map.getSource(sourceId)) {
                      map.addSource(sourceId, {
                        type: 'raster',
                        tiles: [tileUrl],
                        tileSize: 256,
                        // Clamp native tile fetching conservatively by default,
                        // but allow per-layer overrides where the upstream WMS
                        // has been verified to support deeper zoom tiles.
                        maxzoom: layer.maxNativeZoom ?? 12,
                      });
                    }
                  } else {
                    const updateImageSource = (
                      bbox: [number, number, number, number],
                      width: number,
                      height: number
                    ) => {
                      const imageUrl = buildWMSImageUrl(layer, bbox, width, height);
                      const imageCoordinates: [
                        [number, number],
                        [number, number],
                        [number, number],
                        [number, number],
                      ] = [
                        [bbox[0], bbox[3]], // top-left
                        [bbox[2], bbox[3]], // top-right
                        [bbox[2], bbox[1]], // bottom-right
                        [bbox[0], bbox[1]], // bottom-left
                      ];

                      const existingSource = map.getSource(sourceId) as
                        | (maplibregl.Source & {
                            updateImage?: (opts: {
                              url: string;
                              coordinates: [
                                [number, number],
                                [number, number],
                                [number, number],
                                [number, number],
                              ];
                            }) => void;
                            setCoordinates?: (
                              coords: [
                                [number, number],
                                [number, number],
                                [number, number],
                                [number, number],
                              ]
                            ) => void;
                            setUrl?: (url: string) => void;
                          })
                        | undefined;

                      if (existingSource) {
                        if (typeof existingSource.updateImage === 'function') {
                          existingSource.updateImage({
                            url: imageUrl,
                            coordinates: imageCoordinates,
                          });
                        } else {
                          if (typeof existingSource.setCoordinates === 'function') {
                            existingSource.setCoordinates(imageCoordinates);
                          }
                          if (typeof existingSource.setUrl === 'function') {
                            existingSource.setUrl(imageUrl);
                          }
                        }
                      } else {
                        map.addSource(sourceId, {
                          type: 'image',
                          url: imageUrl,
                          coordinates: imageCoordinates,
                        });
                      }
                    };

                    const initialImageSize = layer.hazardType === 'wind' ? 1024 : 256;
                    updateImageSource(layer.bbox, initialImageSize, initialImageSize);
                  }

                  // Add raster layer above polygon fills (better flood legibility),
                  // but still below interactive/point overlays.
                  let beforeId: string | undefined = undefined;

                  if (map.getLayer('damaged-buildings-clusters')) {
                    beforeId = 'damaged-buildings-clusters';
                  } else if (map.getLayer('cyclone-forecast-track-line')) {
                    beforeId = 'cyclone-forecast-track-line';
                  } else {
                    beforeId = map
                      .getStyle()
                      ?.layers?.find(existingLayer => existingLayer.type === 'symbol')?.id;
                  }

                  const isRawParityLayer = RAW_WMS_PARITY_LAYER_IDS.has(layer.id);
                  const layerOpacity = getBaseLayerOpacity(layer.hazardType, layer.id);
                  const scaledLayerOpacity = isRawParityLayer
                    ? layerOpacity
                    : layerOpacity * (layerOpacityScaleRef.current / 100);
                  const rasterVisual = getRasterVisualTuning(layer.hazardType, layer.id);
                  const rasterResampling = getRasterResampling(layer.hazardType, layer.id);

                  console.log(
                    `  → Layer opacity for ${layer.name} (${layer.hazardType}): ${layerOpacity} (mapStyle: ${mapStyle}, windToggle: ${showWindLayer}, floodToggle: ${showInundationLayer})`
                  );

                  if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', 'visible');
                    map.setPaintProperty(layerId, 'raster-opacity', scaledLayerOpacity);
                    map.setPaintProperty(
                      layerId,
                      'raster-fade-duration',
                      isRawParityLayer ? 0 : 300
                    );
                    map.setPaintProperty(layerId, 'raster-resampling', rasterResampling);
                    map.setPaintProperty(layerId, 'raster-contrast', rasterVisual.contrast);
                    map.setPaintProperty(layerId, 'raster-saturation', rasterVisual.saturation);
                    map.setPaintProperty(
                      layerId,
                      'raster-brightness-min',
                      rasterVisual.brightnessMin
                    );
                    map.setPaintProperty(
                      layerId,
                      'raster-brightness-max',
                      rasterVisual.brightnessMax
                    );
                    if (beforeId) {
                      map.moveLayer(layerId, beforeId);
                    }
                  } else {
                    const rasterLayer: maplibregl.AddLayerObject = {
                      id: layerId,
                      type: 'raster',
                      source: sourceId,
                      paint: {
                        'raster-opacity': scaledLayerOpacity,
                        'raster-fade-duration': isRawParityLayer ? 0 : 300,
                        'raster-resampling': rasterResampling,
                        'raster-contrast': rasterVisual.contrast,
                        'raster-saturation': rasterVisual.saturation,
                        'raster-brightness-min': rasterVisual.brightnessMin,
                        'raster-brightness-max': rasterVisual.brightnessMax,
                      },
                    };
                    if (beforeId) {
                      map.addLayer(rasterLayer, beforeId);
                    } else {
                      map.addLayer(rasterLayer);
                    }
                  }

                  // Mark layer as loaded
                  loadingStateRef.current = {
                    ...loadingStateRef.current,
                    layers: { ...loadingStateRef.current.layers, [layer.id]: false },
                  };
                  console.log(
                    `✅ WMS layer loaded: ${layer.name} (type: ${layer.hazardType}, opacity: ${layerOpacity})`
                  );
                  layerBaseOpacityRef.current[layerId] = layerOpacity;
                  layerHazardTypeRef.current[layerId] = layer.hazardType;
                  if (
                    layer.hazardType === 'wind' &&
                    !isRawParityLayer &&
                    !windLayerIds.current.includes(layerId)
                  ) {
                    windLayerIds.current.push(layerId);
                  }
                  const shouldAnimateWind =
                    mapStyle === 'wind' && layer.hazardType === 'wind' && !isRawParityLayer;
                  if (shouldAnimateWind) {
                    startWindAnimation(map);
                  }

                  // Keep progressive upgrades for low-res static image layers.
                  // Wind now starts at high resolution to avoid the blurred first paint.
                  if (!useTiledWms && layer.hazardType !== 'wind') {
                    // Stage 1: Upgrade to 512×512 after 1 second
                    const mediumResTimeout = window.setTimeout(() => {
                      try {
                        const source = map.getSource(sourceId) as any;
                        if (source && source.setUrl) {
                          const mediumResUrl = buildWMSImageUrl(layer, layer.bbox, 512, 512);
                          source.setUrl(mediumResUrl);
                          console.log(`📈 Upgraded to medium-res: ${layer.name}`);
                        }
                      } catch (_e) {
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
                      } catch (_e) {
                        // Silently fail if upgrade doesn't work
                      }
                    }, 3000);
                    resolutionUpgradeTimeouts.current.push(highResTimeout);
                  }
                } catch (innerError) {
                  console.error(`Error adding WMS layer ${layer.id}:`, innerError);
                  loadingStateRef.current = {
                    ...loadingStateRef.current,
                    layers: { ...loadingStateRef.current.layers, [layer.id]: false },
                  };
                }
              };

              // Map/style readiness is handled at loadRealWMSLayers() entry.
              addWMSLayer();
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
        } catch (_e) {
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
    basemapStyle,
    styleChangeCounter,
    selectedEventsKey,
    selectedHazardsKey,
    dateRangeStart,
    dateRangeEnd,
    showWindLayer,
    showInundationLayer,
    onActiveLayersChange,
    onLoadingChange,
  ]); // Re-load WMS layers when basemap, hazard filters, or layer visibility changes

  // Apply immediate visibility updates so toggles feel responsive even before layer reload completes.
  useEffect(() => {
    if (!map || !visible) return;

    const countriesToSync: CountryCode[] = countryCode
      ? [countryCode]
      : (Object.keys(COUNTRIES) as CountryCode[]);

    // Replicate temporal-exclusion logic so this fast-path sync doesn't re-show
    // layers that the main effect just hid due to event/date filter exclusion.
    const selectedEventIds = filters?.selectedEvents ?? [];
    const { effectiveStartDate, effectiveEndDate } = getEffectiveDateRange(
      filters?.dateRange.start ?? '',
      filters?.dateRange.end ?? ''
    );
    const visibleHazardTypes = new Set(
      getHazardTypesToShow(filters?.selectedHazards ?? [], showWindLayer, showInundationLayer)
    );

    countriesToSync.forEach(country => {
      const excluded = countryIsExcludedByTemporalFilters(
        country,
        selectedEventIds,
        effectiveStartDate,
        effectiveEndDate
      );

      getLayersForCountry(country).forEach(layer => {
        const layerId = `wms-layer-${layer.id}`;

        try {
          if (!map.getLayer(layerId)) {
            return;
          }

          const isLayerIncluded =
            visibleHazardTypes.has(layer.hazardType) ||
            (layer.hazardType === 'flood' && visibleHazardTypes.has('inundation'));
          const targetVisibility: 'visible' | 'none' =
            excluded || !isLayerIncluded ? 'none' : 'visible';

          map.setLayoutProperty(layerId, 'visibility', targetVisibility);
        } catch (_e) {
          // Layer might be in-flight during style rebuild; ignore transient errors.
        }
      });
    });
  }, [map, visible, countryCode, showWindLayer, showInundationLayer, styleChangeCounter, filters]);

  // Update WMS layer opacity dynamically when map mode or global opacity changes.
  useEffect(() => {
    if (!map || !visible) return;

    const isWindMode = mapStyle === 'wind';
    const scale = layerOpacityScale / 100;

    if (!isWindMode && windAnimationFrame.current) {
      cancelAnimationFrame(windAnimationFrame.current);
      windAnimationFrame.current = null;
    }

    Object.entries(layerBaseOpacityRef.current).forEach(([layerId, baseOpacity]) => {
      try {
        if (map.getLayer(layerId)) {
          const shouldAnimate = isWindMode && windLayerIds.current.includes(layerId);
          if (!shouldAnimate) {
            const targetOpacity = isRawParityMapLayerId(layerId)
              ? baseOpacity
              : baseOpacity * scale;
            map.setPaintProperty(layerId, 'raster-opacity', targetOpacity);
          }
        }
      } catch (_e) {
        // Layer might not exist yet, ignore
      }
    });

    if (isWindMode) {
      if (windLayerIds.current.length > 0 && !windAnimationFrame.current) {
        startWindAnimation(map);
      }
    }
  }, [map, visible, mapStyle, layerOpacityScale]);

  return null; // This is a non-visual component that manages map layers
}
