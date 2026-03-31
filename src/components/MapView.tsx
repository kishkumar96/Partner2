'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Event, Hazard, FilterState, DistrictGeoProperties } from '@/types';
import type { BuildingProperties, RoadProperties } from '@/types/realData';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { RealWMSLayer } from '@/data/realThreddsLayers';
import { formatCurrency, formatNumber, getHazardColor } from '@/utils/formatters';
import { filterEvents } from '@/utils/filterUtils';
import { districtsGeoJSON } from '@/data/districtsGeo';
import {
  LAYER_OPACITY,
  createScaleDependentOpacity,
  createLossColorExpression,
  createWindColorExpression,
} from '@/utils/colorSystem';
import { debugLogger } from '@/utils/debugLogger';
import type { CycloneForecastPoint } from '@/utils/cycloneAnimationLoader';
import type { StoryBeat } from '@/utils/cycloneStory';
import RealDataLayers from './RealDataLayers';
import RegionalImpactsLayer from './RegionalImpactsLayer';
import DamagedBuildingsLayer from './DamagedBuildingsLayer';
import DamagedRoadsLayer from './DamagedRoadsLayer';
import CycloneAnimationLayer from './CycloneAnimationLayer';
import CycloneAnimationToggle from './CycloneAnimationToggle';
import CycloneStoryOverlay from './CycloneStoryOverlay';

// Layer IDs for district polygons
const DISTRICTS_SOURCE_ID = 'districts-source';
const DISTRICTS_FILL_LAYER_ID = 'districts-fill';
const DISTRICTS_OUTLINE_LAYER_ID = 'districts-outline';
const DISTRICTS_HOVER_LAYER_ID = 'districts-hover';
const REGIONAL_IMPACTS_SOURCE_ID = 'regional-impacts';
const REGIONAL_EXTRUSION_LAYER_ID = 'regional-impacts-extrusion';
const REALISTIC_BUILDING_FALLBACK_HEIGHT = 8;
const REALISTIC_BUILDING_MAX_HEIGHT = 70;
const BUILDING_EXTRUSION_MIN_ZOOM = 12;
const STRONG_BUILDING_EXTRUSION_MIN_ZOOM = 2;

// Hazard zone layer configuration (unused - removed to avoid linter/TS warnings)

/**
 * Shared mapping between hazard IDs and their exposure property names.
 * Used in both popup HTML generation and filter sync logic.
 */
const HAZARD_EXPOSURE_FIELDS: Record<string, keyof DistrictGeoProperties> = {
  wind: 'windExposure',
  cyclone_track: 'cycloneTrackExposure',
  inundation: 'inundationExposure',
};

/**
 * Maps UI hazard IDs to internal map exposure field keys.
 * This bridges the gap between user-facing hazard names (e.g., "tropical-cyclone")
 * and the technical exposure property names used in district data.
 */
const UI_HAZARD_TO_EXPOSURE_MAP: Record<string, string[]> = {
  'tropical-cyclone': ['wind', 'cyclone_track'], // Tropical cyclones generate both wind and track exposure
  flood: ['inundation'], // Flooding maps to inundation
  wind: ['wind'], // Direct mapping for legacy compatibility
  cyclone_track: ['cyclone_track'],
  inundation: ['inundation'],
};

/**
 * Creates a MapLibre expression for hazard-based color matching.
 * Reused for fill layer, outline layer, and default expression.
 */
function createHazardColorExpression(): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'primaryHazard'],
    'wind',
    getHazardColor('wind'),
    'cyclone_track',
    getHazardColor('cyclone_track'),
    'inundation',
    getHazardColor('inundation'),
    '#6B7280', // default gray
  ];
}

function createDistrictOutlineColorExpression(): maplibregl.ExpressionSpecification {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(248, 250, 252, 0.9)',
    'rgba(148, 163, 184, 0.12)',
  ];
}

function createDistrictOutlineWidthExpression(): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    5,
    ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.12],
    8,
    ['case', ['boolean', ['feature-state', 'hover'], false], 1.2, 0.2],
    12,
    ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.3],
  ];
}

/**
 * Creates styled HTML for the district popup.
 */
function createDistrictPopupNode(
  props: DistrictGeoProperties,
  selectedHazards: string[],
  hazards: Hazard[]
): HTMLElement {
  const hazard = hazards.find(h => h.id === props.primaryHazard);
  const normalizeHazardLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, match => match.toUpperCase());
  const hazardName =
    hazard?.name || (props.primaryHazard ? normalizeHazardLabel(props.primaryHazard) : 'Unknown');
  const districtName = props.name || 'Unknown';
  const toNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Build exposure info using shared HAZARD_EXPOSURE_FIELDS mapping
  const exposureMap: Record<string, { label: string; value: number }> = {};
  for (const [hazardId, fieldName] of Object.entries(HAZARD_EXPOSURE_FIELDS)) {
    const rawValue = props[fieldName];
    const numericValue = Number(rawValue ?? 0);
    const clampedValue = Math.max(0, Math.min(1, numericValue));

    exposureMap[hazardId] = {
      label: normalizeHazardLabel(hazardId),
      value: clampedValue,
    };
  }

  // Determine which hazards to show (filtered or all)
  // Map UI hazard IDs to exposure field keys
  const mappedHazards = selectedHazards.flatMap(
    uiHazardId => UI_HAZARD_TO_EXPOSURE_MAP[uiHazardId] || []
  );
  const uniqueMappedHazards = Array.from(new Set(mappedHazards));
  const hazardsToShow =
    uniqueMappedHazards.length > 0 ? uniqueMappedHazards : Object.keys(exposureMap);

  const createEl = (tag: string, className?: string) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  };

  const root = createEl('div', 'popup-content');
  const title = createEl('h3', 'popup-title');
  title.textContent = districtName;
  root.appendChild(title);

  const body = createEl('div', 'popup-body');
  const field = createEl('div', 'popup-field');
  const label = createEl('span', 'popup-label');
  label.textContent = 'Primary Hazard:';
  field.appendChild(label);

  const badge = createEl('span', 'popup-badge');
  const hazardColor = getHazardColor(props.primaryHazard);
  badge.style.background = `${hazardColor}33`;
  badge.style.color = hazardColor;

  const badgeDot = createEl('span', 'popup-badge-dot');
  badgeDot.style.background = hazardColor;
  badge.appendChild(badgeDot);
  badge.appendChild(document.createTextNode(hazardName));
  field.appendChild(badge);
  body.appendChild(field);
  root.appendChild(body);

  const statsGrid = createEl('div', 'popup-stats-grid');
  const addStat = (labelText: string, valueText: string) => {
    const stat = createEl('div', 'popup-stat-card');
    const statLabel = createEl('div', 'popup-stat-label');
    statLabel.textContent = labelText;
    const statValue = createEl('div', 'popup-stat-value');
    statValue.textContent = valueText;
    stat.appendChild(statLabel);
    stat.appendChild(statValue);
    statsGrid.appendChild(stat);
  };

  addStat('Population', formatNumber(toNumber(props.population)));
  addStat('Economic Damage', formatCurrency(toNumber(props.economicDamageUSD)));
  addStat('Buildings', formatNumber(toNumber(props.buildingCount)));
  addStat('Infrastructure', formatNumber(toNumber(props.infrastructureCount)));
  root.appendChild(statsGrid);

  const exposureSection = createEl('div', 'popup-section');
  const exposureTitle = createEl('div', 'popup-section-title');
  exposureTitle.textContent = 'Hazard Exposure';
  exposureSection.appendChild(exposureTitle);

  hazardsToShow.forEach(hazardId => {
    const exp = exposureMap[hazardId];
    if (!exp) return;
    const color = getHazardColor(hazardId);
    const pct = Math.round(exp.value * 100);
    const container = createEl('div', 'popup-progress-container');
    const header = createEl('div', 'popup-progress-header');
    const headerLabel = createEl('span');
    headerLabel.textContent = exp.label;
    const headerValue = createEl('span');
    headerValue.textContent = `${pct}%`;
    header.appendChild(headerLabel);
    header.appendChild(headerValue);
    const bar = createEl('div', 'popup-progress-bar');
    const fill = createEl('div', 'popup-progress-fill');
    fill.style.width = `${pct}%`;
    fill.style.background = color;
    bar.appendChild(fill);
    container.appendChild(header);
    container.appendChild(bar);
    exposureSection.appendChild(container);
  });

  root.appendChild(exposureSection);
  return root;
}

interface MapViewProps {
  events: Event[];
  hazards: Hazard[];
  filters: FilterState;
  onEventSelect?: (event: Event | null) => void;
  selectedRegion?: string | null;
  onRegionSelect?: (regionId: string | null) => void;

  selectedCountry?: CountryCode | null;
  mapStyle?: 'loss' | 'wind';
  basemapStyle?: string;
  is3DView?: boolean;
  extrusionMode?: 'none' | 'loss' | 'wind';
  extrusionExaggeration?: number;
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  onLayersLoadingChange?: (isLoading: boolean) => void;
  onActiveWmsLayersChange?: (layers: RealWMSLayer[]) => void;
  damagedBuildings?: GeoJSON.FeatureCollection<GeoJSON.Geometry, BuildingProperties> | null;
  damagedRoads?: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProperties> | null;
  cycloneForecast?: CycloneForecastPoint[] | null;
  aggregationLevel?: string;
  showOverlays?: boolean;
  onCycloneTimestepChange?: (
    timestep: CycloneForecastPoint | null,
    index: number,
    totalSteps: number
  ) => void;
  showCycloneAnimation?: boolean;
  onCycloneAnimationChange?: (visible: boolean) => void;
  isCyclonePlaying?: boolean;
  onCyclonePlayingChange?: (isPlaying: boolean) => void;
  showCycloneToggle?: boolean;
  cycloneControlsHost?: HTMLElement | null;
  isLeftPanelOpen?: boolean;
  isRightPanelOpen?: boolean;
  storyMode?: boolean;
  storyBeats?: StoryBeat[];
  currentCycloneIndex?: number;
  onStoryModeChange?: (enabled: boolean) => void;
  onMapReady?: (map: maplibregl.Map) => void;
  onStoryIndexChange?: (index: number) => void;
  /** 0–100 opacity scale applied to all hazard/data layers */
  layerOpacity?: number;
}

export default function MapView({
  events,
  hazards,
  filters,
  selectedRegion = null,
  onRegionSelect,
  selectedCountry = null,
  mapStyle = 'loss',
  basemapStyle = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  is3DView = false,
  extrusionMode = 'none',
  extrusionExaggeration = 1,
  showWindLayer = true,
  showInundationLayer = true,
  onLayersLoadingChange,
  onActiveWmsLayersChange,
  damagedBuildings,
  damagedRoads,
  cycloneForecast,
  showOverlays = true,
  onCycloneTimestepChange,
  showCycloneAnimation = true,
  onCycloneAnimationChange,
  isCyclonePlaying,
  onCyclonePlayingChange,
  showCycloneToggle = true,
  cycloneControlsHost = null,
  isLeftPanelOpen = false,
  isRightPanelOpen = false,
  storyMode = false,
  storyBeats = [],
  currentCycloneIndex = 0,
  onStoryModeChange,
  onMapReady,
  onStoryIndexChange,
  layerOpacity = 70,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleChangeCounter, setStyleChangeCounter] = useState(0); // Track style changes to trigger layer reload
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [wmsWarning, setWmsWarning] = useState<string | null>(null);
  const [basemapError, setBasemapError] = useState<string | null>(null);
  const tileErrorCountRef = useRef(0);
  const styleLoadAttemptsRef = useRef(0);
  const mapStyleRef = useRef(mapStyle);

  const handleStorySelect = useCallback(
    (index: number) => {
      if (index === currentCycloneIndex) return;
      onStoryIndexChange?.(index);
    },
    [currentCycloneIndex, onStoryIndexChange]
  );
  const handleCyclonePlayingChange = useCallback(
    (isPlaying: boolean) => {
      setIsAnimationPlaying(prev => (prev === isPlaying ? prev : isPlaying));
      onCyclonePlayingChange?.(isPlaying);
    },
    [onCyclonePlayingChange]
  );
  const basemapRequestIdRef = useRef(0);
  const pendingStyleLoadHandlerRef = useRef<(() => void) | null>(null);

  // Filter events based on current filters using shared utility
  const filteredEvents = useMemo(() => filterEvents(events, filters), [events, filters]);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    // Use selected country's center if available, otherwise show Pacific region view
    const initialCenter: [number, number] = selectedCountry
      ? COUNTRIES[selectedCountry].center
      : [175.0, -18.0]; // Central Pacific - shows all island nations
    const initialZoom = selectedCountry ? COUNTRIES[selectedCountry].zoom : 5; // Zoomed out to see all countries

    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: basemapStyle,
      center: initialCenter,
      zoom: initialZoom,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      maxTileCacheSize: 100, // Limit cache for better memory management
      transformRequest: (url, resourceType) => {
        // Enhanced tile request handling with credentials
        if (resourceType === 'Tile' || resourceType === 'Source') {
          debugLogger.debug(`Loading ${resourceType}: ${url}`);

          // Add credentials for same-origin requests
          return {
            url,
            credentials: 'same-origin',
          };
        }
        return { url };
      },
    });

    // Log map initialization
    debugLogger.info('Map initialized', 'map-initialization', {
      center: initialCenter,
      zoom: initialZoom,
      style: basemapStyle,
    });

    onMapReady?.(map.current);

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    map.current.on('error', (e: any) => {
      // Suppress expected WMS/THREDDS network errors (external server issues are common)
      const errorMessage = e?.error?.message || String(e?.error || e);
      const isWMSError =
        errorMessage.includes('thredds') ||
        errorMessage.includes('WMS') ||
        errorMessage.includes('Failed to fetch');

      // Suppress style diff and filesystem warnings (non-critical MapLibre internal warnings)
      const isStyleDiffWarning =
        errorMessage.includes('style diff') || errorMessage.includes('setState');
      const isFileSystemWarning =
        errorMessage.includes('filesystem') || errorMessage.includes('illegal path');

      // Detect basemap tile/resource loading errors
      const isTileError =
        errorMessage.includes('tile') ||
        errorMessage.includes('sprite') ||
        errorMessage.includes('glyph') ||
        errorMessage.includes('style');
      const isNetworkError =
        errorMessage.includes('network') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('fetch');
      const isCORSError = errorMessage.includes('CORS') || errorMessage.includes('Cross-Origin');

      if (isWMSError && !isTileError) {
        setWmsWarning(prev => prev ?? 'Hazard layer unavailable. Check THREDDS connectivity.');
        return;
      }

      if (isStyleDiffWarning || isFileSystemWarning) {
        // Silently ignore - these are expected warnings that don't affect functionality
        return;
      }

      // Critical basemap errors - notify user
      if (isTileError || isNetworkError || isCORSError) {
        tileErrorCountRef.current += 1;
        // Log only via debugLogger to avoid duplicate console output
        debugLogger.error('Basemap error', 'map-initialization', {
          error: errorMessage,
          errorCount: tileErrorCountRef.current,
          url: e?.sourceId || 'unknown',
        });

        // Show error to user after multiple failures
        if (tileErrorCountRef.current >= 3) {
          let errorMsg = 'Basemap tiles failed to load. ';
          if (isCORSError) {
            errorMsg += 'CORS configuration issue detected.';
          } else if (isNetworkError) {
            errorMsg += 'Check your internet connection.';
          } else {
            errorMsg += 'Please try switching to a different basemap.';
          }
          setBasemapError(errorMsg);
        }
        return;
      }

      // Log other critical errors
      if (e?.error) {
        console.error('Map error:', e.error.message || e.error);
      } else if (e && typeof e === 'object' && 'sourceId' in e) {
        console.error(`Map source error (${(e as any).sourceId}):`, e);
      } else {
        console.warn('Map warning:', e);
      }
    });

    // Handle tile loading errors gracefully
    map.current.on('sourcedataloading', e => {
      if (e.sourceId && e.sourceId.includes('riskscape')) {
        console.log(`Loading RiskScape layer: ${e.sourceId}`);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // Map instance must be created once; country updates are handled by flyTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle country-based map positioning when real data is enabled
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedCountry) return;

    const country = COUNTRIES[selectedCountry];
    if (country) {
      map.current.flyTo({
        center: country.center,
        zoom: country.zoom,
        duration: 2000,
      });
    }
  }, [selectedCountry, mapLoaded]);

  useEffect(() => {
    if (typeof isCyclonePlaying !== 'boolean') return;
    setIsAnimationPlaying(prev => (prev === isCyclonePlaying ? prev : isCyclonePlaying));
  }, [isCyclonePlaying]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

  useEffect(() => {
    if (!wmsWarning) return;
    const id = window.setTimeout(() => setWmsWarning(null), 7000);
    return () => window.clearTimeout(id);
  }, [wmsWarning]);

  // Handle basemap style changes with error handling and attempt tracking
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const requestId = basemapRequestIdRef.current + 1;
    basemapRequestIdRef.current = requestId;

    if (pendingStyleLoadHandlerRef.current) {
      map.current.off('style.load', pendingStyleLoadHandlerRef.current);
      pendingStyleLoadHandlerRef.current = null;
    }

    // Reset error counters on style change
    tileErrorCountRef.current = 0;
    setBasemapError(null);
    styleLoadAttemptsRef.current = 0;

    const applyBasemapStyle = () => {
      if (!map.current) return;
      styleLoadAttemptsRef.current += 1;

      try {
        // Store current center and zoom to restore after style change
        const center = map.current.getCenter();
        const zoom = map.current.getZoom();

        console.log(
          `Applying basemap style (attempt ${styleLoadAttemptsRef.current}):`,
          basemapStyle
        );
        map.current.setStyle(basemapStyle, { diff: false });

        const handleStyleLoad = () => {
          if (!map.current) return;
          if (basemapRequestIdRef.current !== requestId) return;

          console.log('Basemap style loaded successfully');
          styleLoadAttemptsRef.current = 0;
          tileErrorCountRef.current = 0;

          // Restore position
          map.current.setCenter(center);
          map.current.setZoom(zoom);

          // Increment counter to trigger district layers effect
          setStyleChangeCounter(prev => prev + 1);
        };

        pendingStyleLoadHandlerRef.current = handleStyleLoad;
        map.current.once('style.load', handleStyleLoad);
      } catch (e) {
        // Silently handle - basemap changes are non-critical
      }
    };

    // Only change style if the current style is fully loaded; otherwise,
    // wait for the current style to finish loading and then apply.
    if (!map.current.isStyleLoaded()) {
      const handleStyleLoad = () => {
        if (!map.current || !map.current.isStyleLoaded()) return;
        if (basemapRequestIdRef.current !== requestId) return;
        applyBasemapStyle();
      };

      pendingStyleLoadHandlerRef.current = handleStyleLoad;
      map.current.once('style.load', handleStyleLoad);

      return () => {
        map.current?.off('style.load', handleStyleLoad);
      };
    }

    applyBasemapStyle();
  }, [basemapStyle, mapLoaded]);

  // Apply 2D/3D camera and best-effort basemap building extrusions.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    const apply3DMode = () => {
      if (!m || !m.isStyleLoaded()) return;

      const layers = m.getStyle()?.layers || [];
      const customExtrusionLayerId = 'copilot-3d-buildings';
      const nativeExtrusionLayerIds = layers
        .filter(
          layer =>
            layer.type === 'fill-extrusion' &&
            layer.id !== customExtrusionLayerId &&
            layer.id !== REGIONAL_EXTRUSION_LAYER_ID
        )
        .map(layer => layer.id);
      const setLayerVisibilityIfNeeded = (layerId: string, visibility: 'visible' | 'none') => {
        if (!m.getLayer(layerId)) return;
        const currentVisibility = m.getLayoutProperty(layerId, 'visibility');
        const normalizedCurrent = currentVisibility === 'none' ? 'none' : 'visible';
        if (normalizedCurrent !== visibility) {
          m.setLayoutProperty(layerId, 'visibility', visibility);
        }
      };
      const targetPitch = is3DView ? 52 : 0;
      const targetBearing = is3DView ? -15 : 0;
      const pitchDelta = Math.abs(m.getPitch() - targetPitch);
      const bearingDelta = Math.abs(((((m.getBearing() - targetBearing) % 360) + 540) % 360) - 180);

      if (pitchDelta > 0.2 || bearingDelta > 0.2) {
        // Cancel queued camera transitions to keep 2D/3D switching responsive.
        m.stop();
        m.easeTo({ pitch: targetPitch, bearing: targetBearing, duration: 350, essential: true });
      }

      if (is3DView) {
        // Hide native extrusion layers and render a stronger custom layer for
        // consistent 3D readability across different basemap styles.
        nativeExtrusionLayerIds.forEach(layerId => {
          setLayerVisibilityIfNeeded(layerId, 'none');
        });

        // Create/update custom extrusion from a building source-layer when available.
        const candidateLayer = layers.find(layer => {
          const sourceLayer = (layer as any)['source-layer'];
          return (
            typeof sourceLayer === 'string' &&
            /building/i.test(sourceLayer) &&
            typeof (layer as any).source === 'string'
          );
        }) as
          | (maplibregl.LayerSpecification & {
              source?: string;
              'source-layer'?: string;
            })
          | undefined;

        if (candidateLayer?.source && candidateLayer['source-layer']) {
          const beforeId = layers.find(layer => layer.type === 'symbol')?.id;
          const baseHeightExpr: maplibregl.ExpressionSpecification = [
            'min',
            [
              'coalesce',
              ['to-number', ['get', 'height']],
              ['to-number', ['get', 'render_height']],
              ['*', ['to-number', ['get', 'building:levels']], 3.2],
              REALISTIC_BUILDING_FALLBACK_HEIGHT,
            ],
            REALISTIC_BUILDING_MAX_HEIGHT,
          ];

          const extrusionHeightExpr: maplibregl.ExpressionSpecification = [
            'interpolate',
            ['linear'],
            ['zoom'],
            STRONG_BUILDING_EXTRUSION_MIN_ZOOM,
            ['max', ['*', baseHeightExpr, ['*', 1.35, extrusionExaggeration]], 8],
            14,
            ['max', ['*', baseHeightExpr, ['*', 1.65, extrusionExaggeration]], 14],
            16,
            ['max', ['*', baseHeightExpr, ['*', 1.9, extrusionExaggeration]], 20],
          ];

          const extrusionLayer: maplibregl.AddLayerObject = {
            id: customExtrusionLayerId,
            type: 'fill-extrusion',
            source: candidateLayer.source,
            'source-layer': candidateLayer['source-layer'],
            minzoom: STRONG_BUILDING_EXTRUSION_MIN_ZOOM,
            paint: {
              'fill-extrusion-color': '#8fa5bf',
              'fill-extrusion-height': extrusionHeightExpr,
              'fill-extrusion-base': [
                'coalesce',
                ['to-number', ['get', 'min_height']],
                ['*', ['to-number', ['get', 'building:min_level']], 3.2],
                0,
              ],
              'fill-extrusion-opacity': 0.86,
            },
          };

          if (!m.getLayer(customExtrusionLayerId)) {
            if (beforeId) {
              m.addLayer(extrusionLayer, beforeId);
            } else {
              m.addLayer(extrusionLayer);
            }
          } else {
            m.setPaintProperty(
              customExtrusionLayerId,
              'fill-extrusion-height',
              extrusionHeightExpr
            );
            m.setPaintProperty(customExtrusionLayerId, 'fill-extrusion-opacity', 0.86);
          }
        }

        setLayerVisibilityIfNeeded(customExtrusionLayerId, 'visible');
      } else {
        nativeExtrusionLayerIds.forEach(layerId => {
          setLayerVisibilityIfNeeded(layerId, 'none');
        });
        setLayerVisibilityIfNeeded(customExtrusionLayerId, 'none');
      }
    };

    if (m.isStyleLoaded()) {
      apply3DMode();
    } else {
      m.once('style.load', apply3DMode);
      return () => {
        m.off('style.load', apply3DMode);
      };
    }
  }, [is3DView, mapLoaded, styleChangeCounter]);

  // Add district polygon layers after map loads
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    const hazardColorExpression = createHazardColorExpression();
    const districtOutlineColorExpression = createDistrictOutlineColorExpression();
    const districtOutlineWidthExpression = createDistrictOutlineWidthExpression();

    const addDistrictLayers = () => {
      // Add source for district polygons if not exists
      if (!m.getSource(DISTRICTS_SOURCE_ID)) {
        m.addSource(DISTRICTS_SOURCE_ID, {
          type: 'geojson',
          data: districtsGeoJSON as GeoJSON.FeatureCollection,
          promoteId: 'id', // Required for feature state
        });

        // Find first symbol layer for proper z-ordering
        // District polygons should render BELOW roads, buildings, and cyclone layers
        // but ABOVE the basemap
        const layers = m.getStyle()?.layers || [];
        const firstSymbolLayer = layers.find(layer => layer.type === 'symbol');
        const beforeId = firstSymbolLayer?.id;

        // Add fill layer for districts with scale-dependent opacity
        m.addLayer(
          {
            id: DISTRICTS_FILL_LAYER_ID,
            type: 'fill',
            source: DISTRICTS_SOURCE_ID,
            paint: {
              'fill-color': hazardColorExpression,
              'fill-opacity': createScaleDependentOpacity(LAYER_OPACITY.district.fill),
              'fill-opacity-transition': { duration: 300 },
            },
          },
          beforeId
        );

        // Add outline layer for clean borders
        m.addLayer(
          {
            id: DISTRICTS_OUTLINE_LAYER_ID,
            type: 'line',
            source: DISTRICTS_SOURCE_ID,
            paint: {
              'line-color': districtOutlineColorExpression,
              'line-width': districtOutlineWidthExpression,
              'line-opacity': LAYER_OPACITY.district.outline,
            },
          },
          beforeId
        );

        // Add hover highlight layer (initially invisible)
        m.addLayer(
          {
            id: DISTRICTS_HOVER_LAYER_ID,
            type: 'fill',
            source: DISTRICTS_SOURCE_ID,
            paint: {
              'fill-color': '#ffffff',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.3, 0],
            },
          },
          beforeId
        );
      }
    };

    // If style already loaded, add layers immediately, otherwise wait for style.load
    if (m.isStyleLoaded && m.isStyleLoaded()) {
      addDistrictLayers();
    } else {
      m.once('style.load', addDistrictLayers);
    }
  }, [mapLoaded, styleChangeCounter]); // Re-run when style changes

  // Update regional impacts 3D extrusion based on selected metric.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    let rafId = 0;

    const ensureRegionalExtrusionLayer = () => {
      if (!m.getSource(REGIONAL_IMPACTS_SOURCE_ID)) return;

      const beforeId = m.getStyle()?.layers?.find(layer => layer.type === 'symbol')?.id;

      if (!m.getLayer(REGIONAL_EXTRUSION_LAYER_ID)) {
        const layer: maplibregl.AddLayerObject = {
          id: REGIONAL_EXTRUSION_LAYER_ID,
          type: 'fill-extrusion',
          source: REGIONAL_IMPACTS_SOURCE_ID,
          layout: {
            visibility: 'none',
          },
          paint: {
            'fill-extrusion-color': '#f43f5e',
            'fill-extrusion-opacity': 0.82,
            'fill-extrusion-base': 0,
            'fill-extrusion-height': 0,
          },
        };

        if (beforeId) {
          m.addLayer(layer, beforeId);
        } else {
          m.addLayer(layer);
        }
      } else if (beforeId) {
        m.moveLayer(REGIONAL_EXTRUSION_LAYER_ID, beforeId);
      }
    };

    const applyRegionalExtrusion = () => {
      ensureRegionalExtrusionLayer();
      if (!m.getLayer(REGIONAL_EXTRUSION_LAYER_ID)) return;

      if (!is3DView || extrusionMode === 'none') {
        const currentVisibility = m.getLayoutProperty(REGIONAL_EXTRUSION_LAYER_ID, 'visibility');
        if (currentVisibility !== 'none') {
          m.setLayoutProperty(REGIONAL_EXTRUSION_LAYER_ID, 'visibility', 'none');
        }
        return;
      }

      let rawExtrusionHeight: maplibregl.ExpressionSpecification;
      if (extrusionMode === 'loss') {
        const lossStops =
          selectedCountry === 'WS'
            ? [0, 0, 50000, 50, 250000, 150, 750000, 360, 3000000, 900]
            : [0, 0, 100000, 40, 1000000, 120, 10000000, 380, 100000000, 900];
        rawExtrusionHeight = [
          'interpolate',
          ['linear'],
          ['to-number', ['get', 'Total_Loss']],
          ...lossStops,
        ];
      } else {
        rawExtrusionHeight = [
          'interpolate',
          ['linear'],
          ['to-number', ['get', 'Max_Wind_Gusts']],
          0,
          0,
          60,
          120,
          120,
          360,
          180,
          780,
          240,
          1300,
        ];
      }

      // Keep bars readable when zoomed in, but avoid unrealistic spikes at country-scale zoom.
      // MapLibre requires ["zoom"] to be the input of a top-level step/interpolate expression.
      const extrusionHeight: maplibregl.ExpressionSpecification = [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        ['*', rawExtrusionHeight, ['*', 0.2, extrusionExaggeration]],
        7,
        ['*', rawExtrusionHeight, ['*', 0.35, extrusionExaggeration]],
        9,
        ['*', rawExtrusionHeight, ['*', 0.55, extrusionExaggeration]],
        11,
        ['*', rawExtrusionHeight, ['*', 0.8, extrusionExaggeration]],
        13,
        ['*', rawExtrusionHeight, extrusionExaggeration],
      ];

      const extrusionColorExpression =
        mapStyleRef.current === 'wind'
          ? createWindColorExpression()
          : createLossColorExpression(selectedCountry);

      m.setLayoutProperty(REGIONAL_EXTRUSION_LAYER_ID, 'visibility', 'visible');
      m.setPaintProperty(REGIONAL_EXTRUSION_LAYER_ID, 'fill-extrusion-height', extrusionHeight);
      m.setPaintProperty(
        REGIONAL_EXTRUSION_LAYER_ID,
        'fill-extrusion-color',
        extrusionColorExpression
      );
      m.setPaintProperty(REGIONAL_EXTRUSION_LAYER_ID, 'fill-extrusion-opacity', 0.72);
    };

    const scheduleRegionalExtrusionUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyRegionalExtrusion();
      });
    };

    scheduleRegionalExtrusionUpdate();

    m.on('styledata', scheduleRegionalExtrusionUpdate);
    m.on('sourcedata', scheduleRegionalExtrusionUpdate);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      m.off('styledata', scheduleRegionalExtrusionUpdate);
      m.off('sourcedata', scheduleRegionalExtrusionUpdate);
    };
  }, [
    mapLoaded,
    is3DView,
    extrusionMode,
    extrusionExaggeration,
    styleChangeCounter,
    selectedCountry,
  ]);

  // Keep extrusion colors aligned with map mode changes without altering the main effect signature.
  useEffect(() => {
    if (!map.current || !mapLoaded || !is3DView || extrusionMode === 'none') return;
    if (!map.current.getLayer(REGIONAL_EXTRUSION_LAYER_ID)) return;

    const colorExpression =
      mapStyle === 'wind'
        ? createWindColorExpression()
        : createLossColorExpression(selectedCountry);
    map.current.setPaintProperty(
      REGIONAL_EXTRUSION_LAYER_ID,
      'fill-extrusion-color',
      colorExpression
    );
  }, [mapLoaded, is3DView, extrusionMode, mapStyle, selectedCountry]);

  // Handle district hover and click interactions
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    let hoveredDistrictId: string | number | null = null;

    // Change cursor on hover
    const handleMouseEnter = () => {
      m.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      m.getCanvas().style.cursor = '';
      if (hoveredDistrictId !== null) {
        m.setFeatureState({ source: DISTRICTS_SOURCE_ID, id: hoveredDistrictId }, { hover: false });
        hoveredDistrictId = null;
      }
    };

    const handleMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const featureId = feature.id;

        if (hoveredDistrictId !== null && hoveredDistrictId !== featureId) {
          m.setFeatureState(
            { source: DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
            { hover: false }
          );
        }

        if (featureId !== undefined && featureId !== null) {
          hoveredDistrictId = featureId;
          m.setFeatureState({ source: DISTRICTS_SOURCE_ID, id: featureId }, { hover: true });
        }
      }
    };

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties as unknown as DistrictGeoProperties;

        // Close existing popup using ref
        if (popupRef.current) {
          popupRef.current.remove();
        }

        // Create styled popup and store in ref
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: '280px',
          className: 'district-popup',
        })
          .setLngLat(e.lngLat)
          .setDOMContent(createDistrictPopupNode(props, filters.selectedHazards, hazards))
          .addTo(m);
      }
    };

    // Register event handlers
    m.on('mouseenter', DISTRICTS_FILL_LAYER_ID, handleMouseEnter);
    m.on('mouseleave', DISTRICTS_FILL_LAYER_ID, handleMouseLeave);
    m.on('mousemove', DISTRICTS_FILL_LAYER_ID, handleMouseMove);
    m.on('click', DISTRICTS_FILL_LAYER_ID, handleClick);

    return () => {
      m.off('mouseenter', DISTRICTS_FILL_LAYER_ID, handleMouseEnter);
      m.off('mouseleave', DISTRICTS_FILL_LAYER_ID, handleMouseLeave);
      m.off('mousemove', DISTRICTS_FILL_LAYER_ID, handleMouseMove);
      m.off('click', DISTRICTS_FILL_LAYER_ID, handleClick);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [mapLoaded, filters.selectedHazards, hazards]);

  // Update district layer visibility/opacity based on selected hazards
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    if (!m.getLayer(DISTRICTS_FILL_LAYER_ID)) return;

    // Use shared color expression for default styling
    const defaultColorExpression = createHazardColorExpression();

    if (filters.selectedHazards.length === 0) {
      // Show all districts with default styling
      m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, 'fill-color', defaultColorExpression);
      m.setPaintProperty(
        DISTRICTS_FILL_LAYER_ID,
        'fill-opacity',
        createScaleDependentOpacity(LAYER_OPACITY.district.fill * (layerOpacity / 100))
      );
      m.setPaintProperty(
        DISTRICTS_OUTLINE_LAYER_ID,
        'line-opacity',
        LAYER_OPACITY.district.outline * (layerOpacity / 100)
      );
    } else {
      const opacityScale = layerOpacity / 100;

      // Build case expression for selected hazards
      // Map UI hazard IDs to exposure field keys first
      const selectedMappedHazards = Array.from(
        new Set(
          filters.selectedHazards.flatMap(uiHazardId => UI_HAZARD_TO_EXPOSURE_MAP[uiHazardId] || [])
        )
      );

      // TypeScript assertions needed due to MapLibre's complex expression types
      const caseArgs: (maplibregl.ExpressionSpecification | string)[] = [];
      for (const hazard of selectedMappedHazards) {
        caseArgs.push([
          '==',
          ['get', 'primaryHazard'],
          hazard,
        ] as maplibregl.ExpressionSpecification);
        caseArgs.push(getHazardColor(hazard));
      }
      caseArgs.push('#9CA3AF'); // fallback for non-matching

      // Type assertion required for dynamic case expression construction
      const colorExpression = ['case', ...caseArgs] as maplibregl.ExpressionSpecification;

      m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, 'fill-color', colorExpression);

      // Build max exposure expression for selected hazards using shared mapping
      // Reuse selectedMappedHazards already defined above
      const exposureExpressions = selectedMappedHazards
        .filter(h => HAZARD_EXPOSURE_FIELDS[h])
        .map(h => ['get', HAZARD_EXPOSURE_FIELDS[h]] as maplibregl.ExpressionSpecification);

      if (exposureExpressions.length > 0) {
        // Type assertion required for dynamic max expression construction
        const maxExposure: maplibregl.ExpressionSpecification =
          exposureExpressions.length === 1
            ? exposureExpressions[0]
            : (['max', ...exposureExpressions] as maplibregl.ExpressionSpecification);

        // Opacity based on exposure level
        const opacityExpression: maplibregl.ExpressionSpecification = [
          'interpolate',
          ['linear'],
          maxExposure,
          0,
          0.15 * opacityScale,
          0.5,
          0.4 * opacityScale,
          1,
          0.6 * opacityScale,
        ];

        m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, 'fill-opacity', opacityExpression);
      } else {
        // No valid exposure fields for selected hazards, use low opacity
        m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, 'fill-opacity', 0.15 * (layerOpacity / 100));
      }
    }
  }, [filters.selectedHazards, mapLoaded, layerOpacity]);

  // Note: Mock hazard zones and event markers removed - now using real data from THREDDS server via RealData Layers

  return (
    <div className="relative flex-1 h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <div id="map-overlay-root" className="absolute inset-0 z-[60] pointer-events-none" />

      {showOverlays && wmsWarning && (
        <div className="absolute top-4 right-4 z-[25] max-w-[calc(100vw-2rem)] rounded-lg border border-amber-500/40 bg-slate-900/90 px-3 py-2 text-xs text-amber-200 shadow-lg backdrop-blur">
          {wmsWarning}
        </div>
      )}

      {showOverlays && showCycloneAnimation && storyMode && map.current && (
        <CycloneStoryOverlay
          map={map.current}
          forecastTrack={cycloneForecast ?? null}
          storyBeats={storyBeats}
          currentIndex={currentCycloneIndex}
          onSelect={handleStorySelect}
          onExit={() => onStoryModeChange?.(false)}
        />
      )}

      {/* Map Title Overlay */}
      {/* MapTitleOverlay removed - info now in UnifiedMapLegend and top controls */}
      {/* Real Data Layers */}
      {map.current && (
        <>
          <RealDataLayers
            map={map.current}
            countryCode={selectedCountry}
            visible={true}
            // Show static cyclone track by default; hide it only when animated cyclone
            // forecast is actively visible to avoid duplicate lines.
            showCycloneTrack={
              !showCycloneAnimation || !cycloneForecast || cycloneForecast.length === 0
            }
            mapStyle={mapStyle}
            basemapStyle={basemapStyle}
            styleChangeCounter={styleChangeCounter}
            filters={filters}
            showWindLayer={showWindLayer}
            showInundationLayer={showInundationLayer}
            onLoadingChange={onLayersLoadingChange}
            onActiveLayersChange={onActiveWmsLayersChange}
            layerOpacityScale={layerOpacity}
          />
          <RegionalImpactsLayer
            map={map.current}
            visible={true}
            mapStyle={mapStyle}
            styleChangeCounter={styleChangeCounter}
            selectedRegion={selectedRegion}
            onRegionSelect={onRegionSelect}
            countryCode={selectedCountry}
            layerOpacityScale={layerOpacity}
          />
          <DamagedBuildingsLayer
            map={map.current}
            data={damagedBuildings ?? null}
            visible={!!damagedBuildings}
            styleChangeCounter={styleChangeCounter}
          />
          <DamagedRoadsLayer
            map={map.current}
            data={damagedRoads ?? null}
            visible={!!damagedRoads}
            styleChangeCounter={styleChangeCounter}
          />
          {cycloneForecast && cycloneForecast.length > 0 && (
            <CycloneAnimationLayer
              map={map.current}
              forecastTrack={cycloneForecast}
              isVisible={showCycloneAnimation}
              uiVisible={showOverlays && showCycloneAnimation}
              onClose={() => onCycloneAnimationChange?.(false)}
              onPlayingChange={handleCyclonePlayingChange}
              onTimestepChange={onCycloneTimestepChange}
              isLeftPanelOpen={isLeftPanelOpen}
              isRightPanelOpen={isRightPanelOpen}
              controlsContainer={cycloneControlsHost}
              isPlayingExternal={isCyclonePlaying}
              alwaysDocked={true}
              storyMode={storyMode}
              storyBeats={storyBeats}
              onStoryModeChange={onStoryModeChange}
              currentIndexExternal={currentCycloneIndex}
              onCurrentIndexChange={handleStorySelect}
              showStoryBeatCard={false}
            />
          )}
        </>
      )}
      {/* PDIEDataLayers disabled - using local data files instead of THREDDS PDIE output */}
      {/* <PDIEDataLayers
        map={map.current}
        countryCode="VU"
        visible={true}
      /> */}

      {/* Cyclone Animation Toggle Button */}
      {cycloneForecast && showOverlays && showCycloneToggle && (
        <CycloneAnimationToggle
          isVisible={showCycloneAnimation}
          isPlaying={isAnimationPlaying}
          onToggleVisibility={() => onCycloneAnimationChange?.(!showCycloneAnimation)}
        />
      )}

      {/* Basemap Error Notification */}
      {basemapError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] pointer-events-auto">
          <div className="glass-panel px-6 py-4 rounded-lg border-2 border-amber-500/50 bg-amber-900/30 backdrop-blur-sm max-w-md animate-fadeSlide">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="text-amber-400 text-lg">⚠️</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-300 mb-1">Basemap Loading Issue</h4>
                <p className="text-xs text-amber-200/90 mb-3">{basemapError}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setBasemapError(null);
                      tileErrorCountRef.current = 0;
                      // Force reload by incrementing counter
                      setStyleChangeCounter(prev => prev + 1);
                    }}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium rounded transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => setBasemapError(null)}
                    className="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
