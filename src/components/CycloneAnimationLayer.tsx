'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Minimize2,
  Maximize2,
  Share2,
  Bell,
  BellOff,
  BarChart3,
  Layers,
  Book,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
} from 'lucide-react';

import {
  CycloneForecastPoint,
  getCategoryColor,
  getCategoryLabel,
} from '../utils/cycloneAnimationLoader';
import { buildCumulativeWindEnvelopes } from '@/utils/forecastCone';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { SolidPolygonLayer } from 'deck.gl';

import {
  detectStoryBeats,
  getNextBeat,
  getPreviousBeat,
  getStoryBeatIcon,
  isAtBeat,
  StoryBeat,
} from '../utils/cycloneStory';
import { useCycloneTrackPlayback } from '@/hooks/useCycloneTrackPlayback';
import { WIND_RADII_COLORS } from '@/theme/colors';
import { CATEGORY_COLORS, CHART_COLORS } from '@/theme/cycloneScale';
import {
  CATEGORY_COLORS as WIND_GLOW_CATEGORY_COLORS,
  initWindParticles,
  updateWindParticles,
  type WindParticle,
} from '@/utils/windGlowParticles';
import CycloneShareCard from './CycloneShareCard';
import StoryBeatAnnotation from './StoryBeatAnnotation';

const CycloneIntensityChart = dynamic(() => import('./CycloneIntensityChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">
      Loading timeline...
    </div>
  ),
});

interface CycloneAnimationLayerProps {
  map: maplibregl.Map | null | undefined;
  forecastTrack: CycloneForecastPoint[] | null;
  isVisible?: boolean;
  uiVisible?: boolean;
  onClose?: () => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  isPlayingExternal?: boolean;
  onTimestepChange?: (
    timestep: CycloneForecastPoint | null,
    index: number,
    totalSteps: number
  ) => void;
  isLeftPanelOpen?: boolean;
  isRightPanelOpen?: boolean;
  controlsContainer?: HTMLElement | null;
  alwaysDocked?: boolean; // Force controls to always be docked, never floating on map
  storyMode?: boolean;
  storyBeats?: StoryBeat[];
  onStoryModeChange?: (enabled: boolean) => void;
  currentIndexExternal?: number;
  onCurrentIndexChange?: (index: number) => void;
  showStoryBeatCard?: boolean;
}

const QUALITY_SETTINGS = {
  balanced: {
    maxParticles: 500,
    spawnRate: 3,
    glowRings: 2,
    trailLength: 3,
    glowOpacity: [0.18, 0.08, 0.04],
    stormEye: false,
    rainBands: 0,
    windShear: false,
    noiseDetail: 2,
  },
  high: {
    maxParticles: 1400,
    spawnRate: 8,
    glowRings: 3,
    trailLength: 6,
    glowOpacity: [0.22, 0.11, 0.05],
    stormEye: true,
    rainBands: 3,
    windShear: false,
    noiseDetail: 3,
  },
  cinematic: {
    maxParticles: 2200,
    spawnRate: 12,
    glowRings: 5,
    trailLength: 9,
    glowOpacity: [0.26, 0.15, 0.08, 0.05, 0.03],
    stormEye: true,
    rainBands: 5,
    windShear: true,
    noiseDetail: 4,
  },
} as const;
type WindGlowQuality = (typeof QUALITY_SETTINGS)[keyof typeof QUALITY_SETTINGS];

// ── Swath color system (module-level for stable useCallback deps) ─────────────
// High-contrast wind-zone palette for swaths (readability-first).
const SWATH_WIND_RGB: Record<'gale' | 'storm' | 'hurricane', [number, number, number]> = {
  gale: [56, 189, 248], // cyan
  storm: [250, 204, 21], // amber
  hurricane: [244, 63, 94], // rose-red
};
// Base fill alpha per wind zone.  With the donut structure (gale−storm, storm−hurricane,
// hurricane) fills are spatially non-overlapping across zone types, so these values won't
// compound between zones.  A per-category boost (+cat*12) makes stronger categories
// slightly more opaque so they visually dominate when two category segments overlap.
// Per-segment alpha is lower than the old single-polygon values because multiple
// consecutive segment capsules overlap in the traversed corridor, compounding opacity.
// Target effective opacity (after ~3–4 segment stacks): gale ~14%, storm ~17%, hurricane ~18%.
const SWATH_BASE_ALPHA: Record<'gale' | 'storm' | 'hurricane', number> = {
  gale: 22, // outer annulus  — single polygon, no stacking
  storm: 35, // middle donut
  hurricane: 55, // inner fill
};
function getSwathFillColor(
  category: number,
  windType: 'gale' | 'storm' | 'hurricane'
): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(5, category));
  const [r, g, b] = SWATH_WIND_RGB[windType];
  return [r, g, b, Math.min(SWATH_BASE_ALPHA[windType] + Math.round(clamped * 3), 80)];
}

// ── Deck.gl layer data type and stable accessor references ────────────────────
// Defined at module level so the function identities are constant across renders.
// Deck.gl compares accessor references shallowly; stable references mean the GPU
// attribute buffers are only rebuilt when the corresponding updateTrigger changes.
type ZoneItem = {
  polygon: [number, number][][];
  windType: 'gale' | 'storm' | 'hurricane';
  category: number;
};

// Polygon geometry — rebuilds every frame (frameIndex trigger).
const getZonePolygon = (d: ZoneItem) => d.polygon as unknown as [number, number][];
// Fill colour — only rebuilt when the cyclone category changes (not every frame).
const getZoneFillColor = (d: ZoneItem) => getSwathFillColor(d.category, d.windType);

function unwrapTrackLongitudes(track: CycloneForecastPoint[]): number[] {
  if (track.length === 0) return [];

  const unwrapped: number[] = [track[0].longitude];
  let offset = 0;
  for (let i = 1; i < track.length; i++) {
    const prev = unwrapped[i - 1];
    const raw = track[i].longitude;
    const candidate = raw + offset;
    const diff = candidate - prev;

    if (diff > 180) {
      offset -= 360;
    } else if (diff < -180) {
      offset += 360;
    }

    unwrapped.push(raw + offset);
  }

  return unwrapped;
}

function shortestDeltaLongitude(startLon: number, endLon: number): number {
  return ((endLon - startLon + 540) % 360) - 180;
}

export default function CycloneAnimationLayer({
  map,
  forecastTrack,
  isVisible = true,
  uiVisible = true,
  onClose,
  onPlayingChange,
  isPlayingExternal,
  onTimestepChange,
  isLeftPanelOpen = false,
  isRightPanelOpen = false,
  controlsContainer = null,
  alwaysDocked = false,
  storyMode: storyModeProp,
  storyBeats: storyBeatsProp,
  onStoryModeChange,
  currentIndexExternal,
  onCurrentIndexChange,
  showStoryBeatCard = true,
}: CycloneAnimationLayerProps) {
  const [isMinimized, setIsMinimized] = useState(false); // Start expanded so controls are visible
  const [showLegend, setShowLegend] = useState(true);
  const [showChart, setShowChart] = useState(false); // Start closed
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [storyModeInternal, setStoryModeInternal] = useState(false);
  const [storyBeatsInternal, setStoryBeatsInternal] = useState<StoryBeat[]>([]);
  const [showShareCard, setShowShareCard] = useState(false);
  const [qualityMode, setQualityMode] = useState<'balanced' | 'high' | 'cinematic'>('high');
  const [windGlowActivated, setWindGlowActivated] = useState(uiVisible);
  const [panelPosition, setPanelPosition] = useState({ x: 20, y: 80 }); // Will be set correctly on mount
  const [beatFeedbackEnabled, setBeatFeedbackEnabled] = useState(false);
  const [isLooping, setIsLooping] = useState(true); // Loop animation by default
  const [showDetails, setShowDetails] = useState(false); // Secondary metrics hidden by default

  // Helper function to calculate optimal panel position
  const getDefaultPanelPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: 20, y: 80 };
    }

    // Smart positioning: Top-right corner, avoiding sidebars
    // Left panel is 320px wide, right panel is 320px wide
    const baseLeftMargin = isLeftPanelOpen ? 336 : 20; // Clear of left panel when open (320px + 16px gap)
    const windowWidth = window.innerWidth;

    // Position in top-right quadrant for minimal clutter
    // If right panel is open, position to its left
    const rightMargin = isRightPanelOpen ? 336 : 20; // 320px panel + 16px gap
    const xPosition = Math.max(baseLeftMargin, windowWidth - 540 - rightMargin); // 540px panel width (520px + padding)

    return { x: Math.max(baseLeftMargin, xPosition), y: 80 };
  }, [isLeftPanelOpen, isRightPanelOpen]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [userHasManuallyPositioned, setUserHasManuallyPositioned] = useState(false);
  const [isLoadingGeometry, setIsLoadingGeometry] = useState(true);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<number>(1000);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const trailMarkersRef = useRef<maplibregl.Marker[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [chartPanelPosition, setChartPanelPosition] = useState({ x: 24, y: 120 });
  const [chartPanelSize, setChartPanelSize] = useState({ width: 520, height: 240 });
  const [isChartDragging, setIsChartDragging] = useState(false);
  const [isChartResizing, setIsChartResizing] = useState(false);
  const [chartDragOffset, setChartDragOffset] = useState({ x: 0, y: 0 });
  const [chartResizeOrigin, setChartResizeOrigin] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [chartUserPositioned, setChartUserPositioned] = useState(false);
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const windGlowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windGlowWorkerRef = useRef<Worker | null>(null);
  const glowAnimationFrameRef = useRef<number | undefined>(undefined);
  const glowPhase = useRef<number>(0);
  const styleDataTimeoutRef = useRef<number | null>(null);
  const lastNotifiedRef = useRef<{ category: number; index: number } | null>(null);
  const storyModeEnabled = typeof storyModeProp === 'boolean' ? storyModeProp : storyModeInternal;
  const storyBeats = storyBeatsProp ?? storyBeatsInternal;
  const displayedPositionRef = useRef<[number, number] | null>(null);
  const storyBeatActiveRef = useRef<{ startTime: number; type: string } | null>(null);
  const uiVisibleRef = useRef(uiVisible);
  const isVisibleRef = useRef(isVisible);
  const isDocked = alwaysDocked || !!controlsContainer;

  // Performance monitoring refs
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const performanceCheckIntervalRef = useRef<number | null>(null);

  const { state: playbackState, controls: playbackControls } = useCycloneTrackPlayback({
    forecastTrack,
    storyMode: storyModeEnabled,
    storyBeats,
    suspendPlayback: storyModeEnabled || (isDocked && !controlsContainer && !uiVisible),
    loop: isLooping,
    isPlayingExternal,
    currentIndexExternal,
    onPlayingChange,
    onIndexChange: onCurrentIndexChange,
    onTimestepChange,
  });

  const { isPlaying, currentIndex, playbackSpeed } = playbackState;
  const { pause, toggle, seekTo, next, previous, setSpeed, nextBeat, previousBeat } =
    playbackControls;

  // Particle system refs
  const particlesRef = useRef<WindParticle[]>([]);
  const workerInFlightRef = useRef(false);
  const workerFrameSeqRef = useRef(0);
  const workerLastRenderedSeqRef = useRef(0);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const storyModeEnabledRef = useRef(false);
  const activeQualityRef = useRef<WindGlowQuality>(QUALITY_SETTINGS.balanced);

  const activeQuality = QUALITY_SETTINGS[qualityMode];
  currentIndexRef.current = currentIndex;
  isPlayingRef.current = isPlaying;
  storyModeEnabledRef.current = storyModeEnabled;
  activeQualityRef.current = activeQuality;

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    storyModeEnabledRef.current = storyModeEnabled;
  }, [storyModeEnabled]);

  useEffect(() => {
    activeQualityRef.current = activeQuality;
  }, [activeQuality]);

  useEffect(() => {
    uiVisibleRef.current = uiVisible;
    if (uiVisible) {
      setWindGlowActivated(true);
    }
  }, [uiVisible]);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) return;

    pause();
    setShowChart(false);
    setShowShareCard(false);
    setWindGlowActivated(false);
    if (storyModeProp === undefined) {
      setStoryModeInternal(false);
    } else {
      onStoryModeChange?.(false);
    }
  }, [isVisible, pause, onStoryModeChange, storyModeProp]);

  const clampPanelPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };

    const panelWidth = panelRef.current?.offsetWidth ?? 520;
    const panelHeight = panelRef.current?.offsetHeight ?? 320;

    // Get the parent container dimensions (the map container)
    // instead of using window dimensions
    const parentElement = panelRef.current?.parentElement;
    const containerWidth = parentElement?.offsetWidth ?? window.innerWidth;
    const containerHeight = parentElement?.offsetHeight ?? window.innerHeight;

    // Improved bounds to prevent clipping
    const minX = 16;
    const minY = 80; // Reduced from 88 to allow more vertical space
    const maxX = Math.max(minX, containerWidth - panelWidth - 16);
    const maxY = Math.max(minY, containerHeight - panelHeight - 20); // Extra bottom margin

    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }, []);

  const clampChartPosition = useCallback((x: number, y: number, width: number, height: number) => {
    if (typeof window === 'undefined') return { x, y };

    const parentElement = chartPanelRef.current?.parentElement;
    const containerWidth = parentElement?.offsetWidth ?? window.innerWidth;
    const containerHeight = parentElement?.offsetHeight ?? window.innerHeight;
    const minX = 16;
    const minY = 16;
    const maxX = Math.max(minX, containerWidth - width - 16);
    const maxY = Math.max(minY, containerHeight - height - 16);

    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }, []);

  // Pre-computed geometries cache
  const geometriesCache = useRef<
    Map<
      number,
      {
        gale: [number, number][];
        storm: [number, number][];
        hurricane: [number, number][];
        uncertainty: [number, number][];
        eye: [number, number][]; // Eye of the storm
        oci: [number, number][]; // Outermost closed isobar circulation
      }
    >
  >(new Map());

  // Pre-computed wind envelope polygons (one convex-hull polygon per wind type)
  // deck.gl overlay — mounted once on the map, updated cheaply via setProps
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  const sanitizeDeckLayers = useCallback((layers: any[]) => {
    return layers.filter(
      layer => !!layer && typeof layer === 'object' && typeof layer.id === 'string'
    );
  }, []);

  // Per-frame cumulative wind-swath envelopes.  Each entry holds three smooth
  // polygon rings (outer boundaries of the union of all visited wind-radius rings
  // up to that frame), structured as donuts: gale minus storm hole, storm minus
  // hurricane hole, and a solid hurricane fill.  A single deck.gl polygon render
  // call per frame — no seams, no stacking artefacts.
  type FrameEnvelope = {
    gale: [number, number][][] | null; // [outerRing, stormHole?]
    storm: [number, number][][] | null; // [outerRing, hurricaneHole?]
    hurricane: [number, number][][] | null; // [[outerRing]]
    category: number;
  };
  const frameEnvelopesRef = useRef<FrameEnvelope[]>([]);

  // Animation interval in milliseconds (base: 1000ms per timestep)
  const ANIMATION_INTERVAL = 1000;

  // Memoize animation interval based on playback speed
  useEffect(() => {
    intervalRef.current = ANIMATION_INTERVAL / playbackSpeed;
  }, [playbackSpeed]);

  // ── deck.gl helpers ─────────────────────────────────────────────────────────

  const buildDeckLayers = useCallback(
    (frameIndex: number) => {
      const envelope = frameEnvelopesRef.current[frameIndex];
      if (!envelope) return [];

      const hasGaleRadiusLayer =
        !!map && typeof map.getLayer === 'function' && !!map.getLayer('cyclone-gale-radius-layer');
      const swathBeforeId = hasGaleRadiusLayer ? 'cyclone-gale-radius-layer' : undefined;

      // Three smooth polygons (gale → storm → hurricane) for this frame.
      // Each is a single seamless boundary — no per-segment stacking.
      // category is embedded in each item so getZoneFillColor is a pure function
      // of the datum (no closure over envelope.category), enabling Deck.gl to
      // avoid rebuilding the colour buffer unless the category actually changes.
      const data: ZoneItem[] = [];
      if (envelope.gale)
        data.push({ polygon: envelope.gale, windType: 'gale', category: envelope.category });
      if (envelope.storm)
        data.push({ polygon: envelope.storm, windType: 'storm', category: envelope.category });
      if (envelope.hurricane)
        data.push({
          polygon: envelope.hurricane,
          windType: 'hurricane',
          category: envelope.category,
        });
      if (!data.length) return [];

      return [
        new SolidPolygonLayer({
          id: 'cyclone-swath-fill',
          data,
          getPolygon: getZonePolygon,
          getFillColor: getZoneFillColor,
          extruded: false,
          stroked: false,
          pickable: false,
          // Granular triggers: geometry rebuilds every frame; colour rebuilds only
          // when the cyclone category changes (much less frequently).
          updateTriggers: {
            getPolygon: frameIndex,
            getFillColor: envelope.category,
          },
          beforeId: swathBeforeId,
        }),
      ];
    },
    [map]
  );

  const updateDeckLayers = useCallback(
    (frameIndex: number) => {
      if (!deckOverlayRef.current) return;
      const layers: any = sanitizeDeckLayers(buildDeckLayers(frameIndex) as any[]);
      (deckOverlayRef.current as any).setProps({ layers });
    },
    [buildDeckLayers, sanitizeDeckLayers]
  );

  // Pre-compute all geometries on initial load for performance
  useEffect(() => {
    if (!map || !forecastTrack || forecastTrack.length === 0) return;

    setIsLoadingGeometry(true);

    const createAsymmetricCircle = (
      center: [number, number],
      radiusNE: number,
      radiusSE: number,
      radiusSW: number,
      radiusNW: number
    ): [number, number][] => {
      const points: [number, number][] = [];
      const segments = 90;
      const radii = [radiusNE, radiusSE, radiusSW, radiusNW];

      for (let i = 0; i <= segments * 4; i++) {
        const quadrant = Math.floor(i / segments);
        const radius = radii[quadrant] || 0;
        const radiusKm = Math.max(0, radius) * 1.852;
        const radiusDeg = radiusKm / 111.32;
        const bearing = i * (360 / (segments * 4)) * (Math.PI / 180);
        const lat = center[1] + radiusDeg * Math.cos(bearing);
        const lon =
          center[0] + (radiusDeg * Math.sin(bearing)) / Math.cos((center[1] * Math.PI) / 180);
        points.push([lon, lat]);
      }

      if (points.length > 0) points.push(points[0]);
      return points;
    };

    const createUncertaintyCone = (
      center: [number, number],
      uncertainty: number
    ): [number, number][] => {
      const points: [number, number][] = [];
      const segments = 64;
      const radiusKm = uncertainty * 1.852;
      const radiusDeg = radiusKm / 111.32;

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        const lat = center[1] + radiusDeg * Math.cos(angle);
        const lon =
          center[0] + (radiusDeg * Math.sin(angle)) / Math.cos((center[1] * Math.PI) / 180);
        points.push([lon, lat]);
      }
      if (points.length > 0) points.push(points[0]);
      return points;
    };

    // Pre-compute all geometries
    forecastTrack.forEach((point, index) => {
      geometriesCache.current.set(index, {
        gale: createAsymmetricCircle(
          [point.longitude, point.latitude],
          point.galeRadiusNE,
          point.galeRadiusSE,
          point.galeRadiusSW,
          point.galeRadiusNW
        ),
        storm: createAsymmetricCircle(
          [point.longitude, point.latitude],
          point.stormRadiusNE,
          point.stormRadiusSE,
          point.stormRadiusSW,
          point.stormRadiusNW
        ),
        hurricane: createAsymmetricCircle(
          [point.longitude, point.latitude],
          point.hurricaneRadiusNE,
          point.hurricaneRadiusSE,
          point.hurricaneRadiusSW,
          point.hurricaneRadiusNW
        ),
        uncertainty: createUncertaintyCone([point.longitude, point.latitude], point.uncertainty),
        eye:
          point.eyeRadius > 0
            ? createCircle([point.longitude, point.latitude], point.eyeRadius)
            : [],
        oci:
          point.radiusOCI > 0
            ? createCircle([point.longitude, point.latitude], point.radiusOCI)
            : [],
      });
    });

    // Helper: Create symmetric circle
    function createCircle(center: [number, number], radiusKm: number): [number, number][] {
      const points: [number, number][] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        const dx = (radiusKm / 111) * Math.cos(angle); // Approximate km to degrees
        const dy = (radiusKm / 111) * Math.sin(angle);
        points.push([center[0] + dx, center[1] + dy]);
      }
      if (points.length > 0) points.push(points[0]);
      return points;
    }

    setIsLoadingGeometry(false);

    // Gaussian-weighted category smoothing over a ±3-frame window (~18 h).
    const smoothedCategoryByFrame = forecastTrack.map((_, frame) => {
      const start = Math.max(0, frame - 3);
      const end = Math.min(forecastTrack.length - 1, frame + 2);
      let weightedSum = 0;
      let weightTotal = 0;
      for (let i = start; i <= end; i++) {
        const distance = Math.abs(i - frame);
        const weight = Math.exp(-0.5 * distance * distance);
        weightedSum += (forecastTrack[i].category ?? 0) * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : (forecastTrack[frame].category ?? 0);
    });

    // Build one smooth cumulative envelope per wind zone per frame.
    // Each envelope is a single seamless polygon — the support-function outer
    // boundary of all wind-radius rings visited so far (frames 0 … f).
    const galeRings = buildCumulativeWindEnvelopes(forecastTrack, 'gale');
    const stormRings = buildCumulativeWindEnvelopes(forecastTrack, 'storm');
    const hurricaneRings = buildCumulativeWindEnvelopes(forecastTrack, 'hurricane');

    frameEnvelopesRef.current = forecastTrack.map((_, f) => {
      const galePts = galeRings[f];
      const stormPts = stormRings[f];
      const hurricanePts = hurricaneRings[f];
      return {
        gale: galePts ? (stormPts ? [galePts, stormPts] : [galePts]) : null,
        storm: stormPts ? (hurricanePts ? [stormPts, hurricanePts] : [stormPts]) : null,
        hurricane: hurricanePts ? [hurricanePts] : null,
        category: smoothedCategoryByFrame[f],
      };
    });

    // Mount or update the deck.gl overlay
    if (!deckOverlayRef.current) {
      deckOverlayRef.current = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(deckOverlayRef.current as any);
    }
    // Push frame-0 immediately
    updateDeckLayers(0);

    // Cleanup: Clear cache when forecast changes
    return () => {
      geometriesCache.current.clear();
      frameEnvelopesRef.current = [];
      if (deckOverlayRef.current) {
        deckOverlayRef.current.setProps({ layers: [] });
      }
    };
  }, [forecastTrack, map, updateDeckLayers]);

  // Keep current index in bounds when forecast length changes
  useEffect(() => {
    if (!forecastTrack || forecastTrack.length === 0) {
      if (currentIndex !== 0) {
        seekTo(0);
      }
      return;
    }

    const maxIndex = forecastTrack.length - 1;
    if (currentIndex > maxIndex) {
      seekTo(maxIndex);
    }
  }, [forecastTrack, currentIndex, seekTo]);

  // Detect story beats when forecast track changes (only if not externally provided)
  // Use useMemo to avoid unnecessary recomputation when forecastTrack reference changes
  const detectedBeats = useMemo(() => {
    if (!forecastTrack || forecastTrack.length === 0) return [];
    return detectStoryBeats(forecastTrack);
  }, [forecastTrack]);

  useEffect(() => {
    if (storyBeatsProp) return;
    setStoryBeatsInternal(detectedBeats);
    if (detectedBeats.length > 0) {
      console.log(`Detected ${detectedBeats.length} story beats:`, detectedBeats);
    }
  }, [detectedBeats, storyBeatsProp]);

  // ============================================================================
  // CAMERA CHOREOGRAPHY - Story Mode
  // ============================================================================
  /**
   * Automatically fly camera to follow the cyclone in story mode
   * Provides cinematic experience with smooth transitions and appropriate framing
   */
  useEffect(() => {
    if (!map || !storyModeEnabled || !forecastTrack || forecastTrack.length === 0) return;
    // When an external controller is driving the index (e.g. a parent component
    // that also manages camera), skip the auto-flyTo to prevent the playback
    // hook and this effect from fighting each other.
    if (currentIndexExternal !== undefined) return;

    const currentPoint = forecastTrack[currentIndex];
    if (!currentPoint) return;

    // Calculate appropriate zoom level based on cyclone intensity and wind radii
    const calculateDynamicZoom = (): number => {
      // Get maximum wind radius to frame the cyclone appropriately
      const maxGaleRadius = Math.max(
        currentPoint.galeRadiusNE,
        currentPoint.galeRadiusSE,
        currentPoint.galeRadiusSW,
        currentPoint.galeRadiusNW,
        0
      );

      // Zoom based on cyclone size:
      // - Small cyclones (< 100km): Zoom in closer (z10-11)
      // - Medium cyclones (100-200km): Medium zoom (z9-10)
      // - Large cyclones (> 200km): Zoom out to show full extent (z8-9)
      if (maxGaleRadius > 200) return 8.5;
      if (maxGaleRadius > 100) return 9.5;
      return 10.5;
    };

    const zoom = calculateDynamicZoom();

    // Fly to cyclone position with smooth animation
    map.flyTo({
      center: [currentPoint.longitude, currentPoint.latitude],
      zoom: zoom,
      duration: 1500, // 1.5 second transition
      essential: true, // Respect prefers-reduced-motion
      pitch: 0, // Top-down view for clarity
      bearing: 0, // North-up orientation
    });

    // Log camera movement in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `📷 Story mode camera: Flying to [${currentPoint.latitude.toFixed(2)}, ${currentPoint.longitude.toFixed(2)}] zoom ${zoom}`
      );
    }
  }, [map, storyModeEnabled, forecastTrack, currentIndex, currentIndexExternal]);

  // Initialize panel position on mount
  useEffect(() => {
    const initialPosition = getDefaultPanelPosition();
    setPanelPosition(clampPanelPosition(initialPosition.x, initialPosition.y));
  }, [getDefaultPanelPosition, clampPanelPosition]);

  // Auto-reposition when sidebars open/close (only if user hasn't manually moved it)
  useEffect(() => {
    if (!userHasManuallyPositioned) {
      const newPosition = getDefaultPanelPosition();
      setPanelPosition(clampPanelPosition(newPosition.x, newPosition.y));
    }
  }, [
    isLeftPanelOpen,
    isRightPanelOpen,
    userHasManuallyPositioned,
    getDefaultPanelPosition,
    clampPanelPosition,
  ]);

  // Auto-minimize on small screens for better cartographic clarity
  useEffect(() => {
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 768; // Tablet breakpoint
      const isVerySmallScreen = window.innerWidth < 640; // Mobile breakpoint

      // Auto-minimize on small screens unless user explicitly expanded
      if (isSmallScreen && !isMinimized) {
        setIsMinimized(true);
        console.log('Auto-minimized cyclone panel for small screen');
      }

      // Adjust quality mode for performance on small screens
      if (isVerySmallScreen && qualityMode === 'high') {
        setQualityMode('balanced');
        console.log('Switched to balanced quality for mobile performance');
      }
    };

    // Check on mount
    handleResize();

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized, qualityMode]);

  useEffect(() => {
    return () => {
      if (styleElementRef.current?.parentNode) {
        styleElementRef.current.parentNode.removeChild(styleElementRef.current);
        styleElementRef.current = null;
      }
    };
  }, []);

  // Auto-minimize when map is interacted with (optional enhancement)
  useEffect(() => {
    if (!map) return;

    const handleMapInteraction = () => {
      const isSmallScreen = window.innerWidth < 768;
      // Only auto-minimize on small screens to preserve cartographic context
      if (isSmallScreen && !isMinimized && isPlaying) {
        setIsMinimized(true);
      }
    };

    // Listen for map interactions
    map.on('dragstart', handleMapInteraction);
    map.on('zoomstart', handleMapInteraction);

    return () => {
      map.off('dragstart', handleMapInteraction);
      map.off('zoomstart', handleMapInteraction);
    };
  }, [map, isMinimized, isPlaying]);

  // Story mode is handled entirely by CycloneStoryOverlay to avoid conflicts
  // No auto-pause or beat feedback here - keeps animation smooth

  // Camera easing function for smooth tracking
  const easeInOutCubic = useCallback((t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }, []);

  // Detect and track story beat hits for visual effects
  useEffect(() => {
    if (!storyModeEnabled || !storyBeats || storyBeats.length === 0) {
      storyBeatActiveRef.current = null;
      return;
    }

    const currentBeat = storyBeats.find(beat => beat.index === currentIndex);
    if (currentBeat) {
      // Trigger beat visual effect for 2.5 seconds
      const beatStartTime = Date.now();
      storyBeatActiveRef.current = {
        startTime: beatStartTime,
        type: currentBeat.type,
      };

      // Clear after duration, but only if this is still the active beat
      setTimeout(() => {
        if (storyBeatActiveRef.current?.startTime === beatStartTime) {
          storyBeatActiveRef.current = null;
        }
      }, 2500);
    }
  }, [currentIndex, storyBeats, storyModeEnabled]);

  // Performance monitoring and adaptive quality
  useEffect(() => {
    if (!isPlaying || qualityMode === 'balanced') return; // Skip monitoring at lowest quality

    const checkPerformance = () => {
      const now = performance.now();
      if (lastFrameTimeRef.current > 0) {
        const frameTime = now - lastFrameTimeRef.current;
        frameTimesRef.current.push(frameTime);

        // Keep only last 60 frames (1 second at 60fps)
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift();
        }

        // Check average FPS every 60 frames
        if (frameTimesRef.current.length === 60) {
          const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b) / 60;
          const fps = 1000 / avgFrameTime;

          // Auto-downgrade if FPS drops below 30 and we're not already at balanced
          if (fps < 30) {
            if (qualityMode === 'cinematic') {
              console.log(
                '📉 Performance: Downgrading from Cinematic to High quality (FPS:',
                fps.toFixed(1),
                ')'
              );
              setQualityMode('high');
            } else if (qualityMode === 'high') {
              console.log(
                '📉 Performance: Downgrading from High to Balanced quality (FPS:',
                fps.toFixed(1),
                ')'
              );
              setQualityMode('balanced');
            }
          }

          // Clear array after check
          frameTimesRef.current = [];
        }
      }
      lastFrameTimeRef.current = now;
    };

    // Guard against stale interval when the effect re-runs quickly (e.g. fast
    // re-mount) – clear any existing interval before starting a new one.
    if (performanceCheckIntervalRef.current) {
      clearInterval(performanceCheckIntervalRef.current);
    }
    // Check performance every 16ms (60fps)
    performanceCheckIntervalRef.current = window.setInterval(checkPerformance, 16);

    return () => {
      if (performanceCheckIntervalRef.current) {
        clearInterval(performanceCheckIntervalRef.current);
      }
    };
  }, [isPlaying, qualityMode]);

  // Wind-glow worker path (preferred): persistent worker with frame backpressure.
  useEffect(() => {
    if (
      !windGlowActivated ||
      !map ||
      !forecastTrack ||
      forecastTrack.length === 0 ||
      !windGlowCanvasRef.current
    ) {
      return;
    }
    if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const canvas = windGlowCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const worker = new Worker(new URL('../workers/windGlow.worker.ts', import.meta.url));
    windGlowWorkerRef.current = worker;
    workerInFlightRef.current = false;
    workerFrameSeqRef.current = 0;
    workerLastRenderedSeqRef.current = 0;

    const container = map.getContainer();
    worker.postMessage({
      type: 'init',
      width: container.clientWidth,
      height: container.clientHeight,
    });

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type !== 'bitmap') return;
      const bm: ImageBitmap = e.data.bitmap;
      if (!uiVisibleRef.current) {
        bm.close();
        workerInFlightRef.current = false;
        return;
      }
      const seq = typeof e.data.seq === 'number' ? e.data.seq : 0;
      if (seq < workerLastRenderedSeqRef.current) {
        bm.close();
        return;
      }
      workerLastRenderedSeqRef.current = seq;
      workerInFlightRef.current = false;

      const w = map.getContainer().clientWidth;
      const h = map.getContainer().clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bm, 0, 0);
      bm.close();
    };

    const getProjectedState = () => {
      const idx = Math.min(currentIndexRef.current, forecastTrack.length - 1);
      const cp = forecastTrack[idx];
      const dp = (displayedPositionRef.current ?? [cp.longitude, cp.latitude]) as [number, number];
      const pos = map.project(dp);
      const avgRadius = (cp.galeRadiusNE + cp.galeRadiusSE + cp.galeRadiusSW + cp.galeRadiusNW) / 4;
      const rp = map.project([dp[0], dp[1] + avgRadius / 60] as [number, number]);
      return {
        cp,
        x: pos.x,
        y: pos.y,
        rPx: Math.max(40, Math.abs(rp.y - pos.y)),
      };
    };

    const prevPx = { x: 0, y: 0 };
    const snapPrevPos = () => {
      const p = getProjectedState();
      prevPx.x = p.x;
      prevPx.y = p.y;
    };
    snapPrevPos();

    let pendingDx = 0;
    let pendingDy = 0;
    const tryPostFrame = (dx = 0, dy = 0, runPhysics = true) => {
      if (!uiVisibleRef.current) return;
      pendingDx += dx;
      pendingDy += dy;
      if (!windGlowWorkerRef.current || workerInFlightRef.current) return;

      const { cp, x, y, rPx } = getProjectedState();
      const beat = storyBeatActiveRef.current;
      const quality = activeQualityRef.current;
      const c = map.getContainer();
      const seq = ++workerFrameSeqRef.current;
      workerInFlightRef.current = true;

      windGlowWorkerRef.current.postMessage({
        type: 'frame',
        seq,
        cycloneX: x,
        cycloneY: y,
        radiusPixels: rPx,
        category: cp.category,
        meanWind: cp.meanWind,
        quality,
        beatInfo: beat ? { ...beat, storyModeEnabled: storyModeEnabledRef.current } : null,
        width: c.clientWidth,
        height: c.clientHeight,
        translateDx: pendingDx,
        translateDy: pendingDy,
        runPhysics,
      });
      pendingDx = 0;
      pendingDy = 0;
    };

    tryPostFrame(0, 0, true);

    const handleMapChange = () => {
      if (!uiVisibleRef.current) return;
      const p = getProjectedState();
      const dx = p.x - prevPx.x;
      const dy = p.y - prevPx.y;
      prevPx.x = p.x;
      prevPx.y = p.y;
      tryPostFrame(dx, dy, false);
    };
    map.on('move', handleMapChange);
    map.on('zoom', handleMapChange);
    map.on('resize', handleMapChange);

    const animate = () => {
      snapPrevPos();
      if (uiVisibleRef.current && (isPlayingRef.current || storyModeEnabledRef.current)) {
        tryPostFrame(0, 0, true);
      }
      glowAnimationFrameRef.current = requestAnimationFrame(animate);
    };
    glowAnimationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      map.off('move', handleMapChange);
      map.off('zoom', handleMapChange);
      map.off('resize', handleMapChange);
      if (glowAnimationFrameRef.current) {
        cancelAnimationFrame(glowAnimationFrameRef.current);
      }
      worker.terminate();
      windGlowWorkerRef.current = null;
      workerInFlightRef.current = false;
    };
  }, [map, forecastTrack, windGlowActivated]);

  // Wind Field Glow & Particle Flow Effect
  useEffect(() => {
    if (!windGlowActivated || !map || !forecastTrack || !windGlowCanvasRef.current) return;
    if (typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined') return;

    const canvas = windGlowCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Fallback: main-thread Canvas2D rendering ──────────────────────────────
    // Reached only when OffscreenCanvas/Worker are unavailable (rare legacy
    // browsers).  Includes a per-other-frame physics throttle on balanced quality.

    const MAX_PARTICLES = activeQuality.maxParticles;
    const PARTICLE_SPAWN_RATE = activeQuality.spawnRate; // particles per frame when playing

    // Initialize particle pool
    const initializeParticles = (count: number) => {
      const currentPoint = forecastTrack[currentIndex];
      const displayPosition = displayedPositionRef.current ?? [
        currentPoint.longitude,
        currentPoint.latitude,
      ];
      const cyclonePos = map.project(displayPosition);
      const avgGaleRadius =
        (currentPoint.galeRadiusNE +
          currentPoint.galeRadiusSE +
          currentPoint.galeRadiusSW +
          currentPoint.galeRadiusNW) /
        4;
      // Proper NM→pixel conversion via geo-projection (1 degree lat = 60 NM)
      const nmToDeg = avgGaleRadius / 60;
      const radiusRefPt = map.project([displayPosition[0], displayPosition[1] + nmToDeg] as [
        number,
        number,
      ]);
      const radiusPixels = Math.max(40, Math.abs(radiusRefPt.y - cyclonePos.y));

      particlesRef.current = initWindParticles(
        particlesRef.current,
        count,
        cyclonePos.x,
        cyclonePos.y,
        radiusPixels,
        MAX_PARTICLES
      );
    };

    const updateParticles = () => {
      const currentPoint = forecastTrack[currentIndex];
      const displayPosition = displayedPositionRef.current ?? [
        currentPoint.longitude,
        currentPoint.latitude,
      ];
      const cyclonePos = map.project(displayPosition);
      const avgGaleRadius =
        (currentPoint.galeRadiusNE +
          currentPoint.galeRadiusSE +
          currentPoint.galeRadiusSW +
          currentPoint.galeRadiusNW) /
        4;
      const nmToDeg = avgGaleRadius / 60;
      const radiusRefPt = map.project([displayPosition[0], displayPosition[1] + nmToDeg] as [
        number,
        number,
      ]);
      const radiusPixels = Math.max(40, Math.abs(radiusRefPt.y - cyclonePos.y));

      updateWindParticles(
        particlesRef.current,
        cyclonePos.x,
        cyclonePos.y,
        radiusPixels,
        currentPoint.meanWind,
        activeQuality.noiseDetail,
        glowPhase.current
      );
    };

    const drawWindGlow = () => {
      if (!uiVisibleRef.current) {
        return;
      }
      const currentPoint = forecastTrack[currentIndex];
      const container = map.getContainer();

      // Set canvas size to match map container
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Convert cyclone lat/lon to screen coordinates
      const displayPosition = displayedPositionRef.current ?? [
        currentPoint.longitude,
        currentPoint.latitude,
      ];
      const cyclonePos = map.project(displayPosition);

      // Don't draw if cyclone is off-screen
      if (
        cyclonePos.x < -200 ||
        cyclonePos.x > width + 200 ||
        cyclonePos.y < -200 ||
        cyclonePos.y > height + 200
      ) {
        return;
      }

      // Get category color with adjusted opacity (using pre-parsed values)
      const colorInfo =
        WIND_GLOW_CATEGORY_COLORS[
          currentPoint.category as keyof typeof WIND_GLOW_CATEGORY_COLORS
        ] || WIND_GLOW_CATEGORY_COLORS[0];
      const color = colorInfo.rgba;
      const particleColor = colorInfo.rgb;

      // Calculate radius based on gale radius (average of quadrants)
      const avgGaleRadius =
        (currentPoint.galeRadiusNE +
          currentPoint.galeRadiusSE +
          currentPoint.galeRadiusSW +
          currentPoint.galeRadiusNW) /
        4;
      const nmToDeg = avgGaleRadius / 60;
      const radiusRefPt = map.project([displayPosition[0], displayPosition[1] + nmToDeg] as [
        number,
        number,
      ]);
      const radiusPixels = Math.max(40, Math.abs(radiusRefPt.y - cyclonePos.y));

      // Increment phase for rotation animation
      glowPhase.current += 0.005;
      const phase = glowPhase.current;

      // Draw concentric ring-shaped glow halos (hollow at center, peak at mid-radius)
      for (let ring = 0; ring < activeQuality.glowRings; ring++) {
        const ringRadius = radiusPixels * (0.85 + ring * 0.55);
        // Use inner radius gradient so the very center is transparent (ring, not disc)
        const innerR = ringRadius * 0.18;
        const gradient = ctx.createRadialGradient(
          cyclonePos.x,
          cyclonePos.y,
          innerR,
          cyclonePos.x,
          cyclonePos.y,
          ringRadius
        );

        const baseOpacity = activeQuality.glowOpacity[ring] ?? 0.08;
        // ring shape: transparent at inner edge, peak at 30%, fade to 0 at outer edge
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.28, color.replace(/[\d.]+\)$/, `${baseOpacity})`));
        gradient.addColorStop(0.55, color.replace(/[\d.]+\)$/, `${baseOpacity * 0.45})`));
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;

        ctx.save();
        ctx.translate(cyclonePos.x, cyclonePos.y);
        ctx.rotate(phase + (ring * Math.PI) / 3);
        ctx.translate(-cyclonePos.x, -cyclonePos.y);

        ctx.beginPath();
        ctx.arc(cyclonePos.x, cyclonePos.y, ringRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
      }

      // Draw rain bands (spiral arcs with rotation drift)
      if (activeQuality.rainBands > 0 && currentPoint.category >= 1) {
        const bandCount = activeQuality.rainBands;
        const bandRotationSpeed = 0.003;
        const bandPhase = phase * bandRotationSpeed;

        for (let band = 0; band < bandCount; band++) {
          const bandRadius = radiusPixels * (0.3 + band * 0.25);
          const bandAngleOffset = (band * Math.PI * 2) / bandCount + bandPhase;
          const bandOpacity = 0.15 - band * 0.02;

          ctx.save();
          ctx.globalAlpha = bandOpacity;
          ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.4)');
          ctx.lineWidth = Math.max(1, radiusPixels * 0.022);
          ctx.lineCap = 'round';

          // Draw spiral arc
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 1.5; a += 0.1) {
            const spiralRadius = bandRadius * (1 + a * 0.15);
            const x = cyclonePos.x + Math.cos(a + bandAngleOffset) * spiralRadius;
            const y = cyclonePos.y + Math.sin(a + bandAngleOffset) * spiralRadius;
            if (a === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw storm eye (dark void with subtle shimmer) for high intensity storms
      if (activeQuality.stormEye && currentPoint.category >= 2) {
        const eyeRadius = radiusPixels * 0.12; // Eye is ~12% of gale radius

        // Dark void center
        const eyeGradient = ctx.createRadialGradient(
          cyclonePos.x,
          cyclonePos.y,
          0,
          cyclonePos.x,
          cyclonePos.y,
          eyeRadius
        );

        eyeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        eyeGradient.addColorStop(0.7, 'rgba(20, 20, 30, 0.7)');
        eyeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = eyeGradient;
        ctx.beginPath();
        ctx.arc(cyclonePos.x, cyclonePos.y, eyeRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Subtle shimmer on eye wall (animated)
        const shimmerPhase = phase * 2;
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.sin(shimmerPhase) * 0.08;
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -shimmerPhase * 5;
        ctx.beginPath();
        ctx.arc(cyclonePos.x, cyclonePos.y, eyeRadius * 0.95, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }

      // Story beat visual triggers (lightning/surge pulses)
      const beatActive = storyBeatActiveRef.current;
      if (beatActive && storyModeEnabled) {
        const elapsed = Date.now() - beatActive.startTime;
        const beatProgress = Math.min(elapsed / 2500, 1); // 2.5 second duration
        const beatIntensity = Math.sin(beatProgress * Math.PI); // Peak at middle

        // Lightning flash effect for intensity-related beats
        if (
          ['peak-intensity', 'rapid-intensification', 'category-upgrade'].includes(beatActive.type)
        ) {
          const flashPhase = (elapsed % 400) / 400; // Flash every 400ms
          if (flashPhase < 0.15) {
            // Quick flash
            ctx.save();
            ctx.globalAlpha = (0.15 - flashPhase) * beatIntensity * 0.4;

            // Radial flash
            const flashGradient = ctx.createRadialGradient(
              cyclonePos.x,
              cyclonePos.y,
              0,
              cyclonePos.x,
              cyclonePos.y,
              radiusPixels * 2
            );
            flashGradient.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
            flashGradient.addColorStop(0.5, 'rgba(255, 255, 150, 0.2)');
            flashGradient.addColorStop(1, 'rgba(255, 255, 100, 0)');

            ctx.fillStyle = flashGradient;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          }
        }

        // Surge pulse for approach-related beats
        if (['closest-approach'].includes(beatActive.type)) {
          ctx.save();
          const pulseRadius = radiusPixels * (1 + beatProgress * 0.5);
          ctx.globalAlpha = beatIntensity * 0.3;
          ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 5]);
          ctx.beginPath();
          ctx.arc(cyclonePos.x, cyclonePos.y, pulseRadius, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw particles — cap draw opacity to prevent screen-blend saturation
      particlesRef.current.forEach(particle => {
        const drawOpacity = Math.min(particle.opacity * 0.55, 0.45);
        ctx.save();
        ctx.globalAlpha = drawOpacity;

        // Minimal shadow only in cinematic mode (screen blend amplifies blur)
        if (activeQuality.windShear) {
          ctx.shadowBlur = 3;
          ctx.shadowColor = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, 0.4)`;
        }

        ctx.strokeStyle = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, 1)`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        // Draw particle as a longer streak
        const streakLength = activeQuality.trailLength;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(
          particle.x - particle.vx * streakLength,
          particle.y - particle.vy * streakLength
        );
        ctx.stroke();

        // Draw wind shear streaks (cinematic quality only)
        if (activeQuality.windShear && particle.opacity > 0.5) {
          ctx.save();
          ctx.globalAlpha = drawOpacity * 0.25;
          ctx.strokeStyle = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, 0.4)`;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([3, 3]);

          // Draw additional shear streaks offset to sides
          const perpAngle = Math.atan2(particle.vy, particle.vx) + Math.PI / 2;
          const shearOffset = 4;

          ctx.beginPath();
          ctx.moveTo(
            particle.x + Math.cos(perpAngle) * shearOffset,
            particle.y + Math.sin(perpAngle) * shearOffset
          );
          ctx.lineTo(
            particle.x - particle.vx * streakLength * 0.7 + Math.cos(perpAngle) * shearOffset,
            particle.y - particle.vy * streakLength * 0.7 + Math.sin(perpAngle) * shearOffset
          );
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(
            particle.x - Math.cos(perpAngle) * shearOffset,
            particle.y - Math.sin(perpAngle) * shearOffset
          );
          ctx.lineTo(
            particle.x - particle.vx * streakLength * 0.7 - Math.cos(perpAngle) * shearOffset,
            particle.y - particle.vy * streakLength * 0.7 - Math.sin(perpAngle) * shearOffset
          );
          ctx.stroke();

          ctx.restore();
        }

        // Draw bright core (very subtle)
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${drawOpacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });
    };

    // Initialize some particles
    if (particlesRef.current.length === 0) {
      initializeParticles(Math.min(240, activeQuality.maxParticles));
    }

    // Initial draw
    drawWindGlow();

    // Track the last projected cyclone screen position so we can translate
    // particles by the exact pixel delta whenever the map pans or zooms.
    const prevCyclonePx = { x: 0, y: 0 };
    const snapPrevCyclonePos = () => {
      const cp = forecastTrack[currentIndex];
      const dp = displayedPositionRef.current ?? [cp.longitude, cp.latitude];
      const pos = map.project(dp);
      prevCyclonePx.x = pos.x;
      prevCyclonePx.y = pos.y;
    };
    snapPrevCyclonePos();

    // Redraw on map move/zoom — also translate in-flight particles so they
    // move seamlessly with the map instead of snapping after a frame delay.
    const handleMapChange = () => {
      if (!uiVisibleRef.current) return;
      const cp = forecastTrack[currentIndex];
      const dp = displayedPositionRef.current ?? [cp.longitude, cp.latitude];
      const newPos = map.project(dp);
      const dx = newPos.x - prevCyclonePx.x;
      const dy = newPos.y - prevCyclonePx.y;
      prevCyclonePx.x = newPos.x;
      prevCyclonePx.y = newPos.y;
      if (dx !== 0 || dy !== 0) {
        for (const p of particlesRef.current) {
          p.x += dx;
          p.y += dy;
        }
      }
      drawWindGlow();
    };
    map.on('move', handleMapChange);
    map.on('zoom', handleMapChange);
    map.on('resize', handleMapChange);

    // Animate rotation and particles when playing OR in story mode
    let animationId: number;
    if (uiVisibleRef.current && (isPlaying || storyModeEnabled)) {
      // Local frame counter used for the balanced-quality physics throttle below.
      let fallbackPhysicsTick = 0;
      const animate = () => {
        // Snap the reference position first so the map-move handler sees the
        // correct pre-frame cyclone origin on very fast pans, preventing a
        // one-frame particle jump when both animate() and handleMapChange fire
        // in the same vsync cycle.
        snapPrevCyclonePos();

        fallbackPhysicsTick++;
        // On balanced quality, run physics every other frame (~30 Hz) to halve
        // the per-frame CPU cost.  drawWindGlow still runs every vsync so the
        // existing particle positions render smoothly without gaps.
        const isBalanced = activeQuality === QUALITY_SETTINGS.balanced;
        if (!isBalanced || fallbackPhysicsTick % 2 === 0) {
          // Spawn new particles
          if (particlesRef.current.length < MAX_PARTICLES) {
            initializeParticles(PARTICLE_SPAWN_RATE);
          }
          // Update particle positions
          updateParticles();
        }

        // Redraw
        drawWindGlow();

        animationId = requestAnimationFrame(animate);
      };
      animationId = requestAnimationFrame(animate);
      glowAnimationFrameRef.current = animationId;
    }

    return () => {
      map.off('move', handleMapChange);
      map.off('zoom', handleMapChange);
      map.off('resize', handleMapChange);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [
    map,
    forecastTrack,
    currentIndex,
    isPlaying,
    activeQuality,
    storyModeEnabled,
    windGlowActivated,
  ]);

  useEffect(() => {
    if (!map || !forecastTrack || forecastTrack.length === 0) return;

    // Function to add all layers and sources
    const addLayers = () => {
      try {
        // Ensure style is fully loaded before manipulating layers
        if (!map.isStyleLoaded()) {
          console.warn('Map style not loaded yet, deferring layer addition');
          return;
        }

        const layerVisibility = isVisibleRef.current ? 'visible' : 'none';

        // Determine beforeId to insert cyclone layers below damaged buildings/roads
        let beforeId: string | undefined = undefined;
        try {
          if (map.getLayer('damaged-buildings-layer')) {
            beforeId = 'damaged-buildings-layer';
          } else if (map.getLayer('damaged-buildings-clusters')) {
            beforeId = 'damaged-buildings-clusters';
          } else if (map.getLayer('damaged-roads-layer')) {
            beforeId = 'damaged-roads-layer';
          }
        } catch (e) {
          // Layer check might fail during style transition, continue without beforeId
          console.warn('Could not determine layer order:', e);
        }

        // Add track line source
        if (!map.getSource('cyclone-forecast-track')) {
          // Category-color expression for track line/points (independent of swath zone palette)
          const catColorExpr = [
            'match',
            ['to-number', ['get', 'category']],
            5,
            '#7C3AED', // violet  — Cat 5
            4,
            '#DC2626', // red     — Cat 4
            3,
            '#FB923C', // orange  — Cat 3
            2,
            '#FACC15', // yellow  — Cat 2
            1,
            '#FDE047', // lt-yel  — Cat 1
            '#7DD3FC', // sky-bl  — tropical storm fallback
          ] as any; // MapLibre expression — runtime type is fine

          // FeatureCollection: one LineString per consecutive point-pair (colored by departure
          // category) + one Point per timestep (for category-colored waypoint circles).
          // MapLibre's line layer auto-filters to LineString features; circle auto-filters
          // to Point features — no explicit geometry-type filter needed.
          const unwrappedLons = unwrapTrackLongitudes(forecastTrack);
          const trackFeatures: object[] = [];
          for (let i = 0; i < forecastTrack.length - 1; i++) {
            trackFeatures.push({
              type: 'Feature',
              properties: { category: forecastTrack[i].category },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [unwrappedLons[i], forecastTrack[i].latitude],
                  [unwrappedLons[i + 1], forecastTrack[i + 1].latitude],
                ],
              },
            });
          }
          for (let i = 0; i < forecastTrack.length; i++) {
            const p = forecastTrack[i];
            trackFeatures.push({
              type: 'Feature',
              properties: { category: p.category },
              geometry: { type: 'Point', coordinates: [unwrappedLons[i], p.latitude] },
            });
          }

          map.addSource('cyclone-forecast-track', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: trackFeatures } as any,
          });

          // Track line: solid, per-segment category colors
          map.addLayer(
            {
              id: 'cyclone-forecast-track-line',
              type: 'line',
              source: 'cyclone-forecast-track',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': catColorExpr,
                'line-width': 2.5,
              },
            },
            beforeId
          );

          // Track waypoints: category-colored filled circles
          map.addLayer(
            {
              id: 'cyclone-forecast-points',
              type: 'circle',
              source: 'cyclone-forecast-track',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'circle-radius': 4,
                'circle-color': catColorExpr,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
              },
            },
            beforeId
          );
        }

        // Add OCI (Outermost Closed Isobar) circulation layer
        if (!map.getSource('cyclone-oci')) {
          map.addSource('cyclone-oci', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-oci-layer',
              type: 'line',
              source: 'cyclone-oci',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': '#94a3b8',
                'line-width': 1.5,
                'line-dasharray': [8, 4],
                'line-opacity': 0.4,
              },
            },
            beforeId
          );
        }

        // ── Wind-radii SWATHS are now rendered by deck.gl (see deckOverlayRef) ──

        // Mark swaths as ready once layers are set up
        // (data will be pushed on the first animation tick)

        // Add wind radii sources
        if (!map.getSource('cyclone-gale-radius')) {
          map.addSource('cyclone-gale-radius', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-gale-radius-layer',
              type: 'fill',
              source: 'cyclone-gale-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'fill-color': WIND_RADII_COLORS.gale.stroke,
                'fill-opacity': 0.03,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'cyclone-gale-radius-outline',
              type: 'line',
              source: 'cyclone-gale-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': WIND_RADII_COLORS.gale.stroke,
                'line-width': 1.5,
                'line-opacity': 0.45,
              },
            },
            beforeId
          );
        }

        if (!map.getSource('cyclone-storm-radius')) {
          map.addSource('cyclone-storm-radius', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-storm-radius-layer',
              type: 'fill',
              source: 'cyclone-storm-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'fill-color': WIND_RADII_COLORS.storm.stroke,
                'fill-opacity': 0.05,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'cyclone-storm-radius-outline',
              type: 'line',
              source: 'cyclone-storm-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': WIND_RADII_COLORS.storm.stroke,
                'line-width': 2,
                'line-opacity': 0.55,
              },
            },
            beforeId
          );
        }

        if (!map.getSource('cyclone-hurricane-radius')) {
          map.addSource('cyclone-hurricane-radius', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-hurricane-radius-layer',
              type: 'fill',
              source: 'cyclone-hurricane-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'fill-color': WIND_RADII_COLORS.hurricane.stroke,
                'fill-opacity': 0.07,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'cyclone-hurricane-radius-outline',
              type: 'line',
              source: 'cyclone-hurricane-radius',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': WIND_RADII_COLORS.hurricane.stroke,
                'line-width': 2.5,
                'line-opacity': 0.65,
              },
            },
            beforeId
          );
        }

        // Add eye layer (calm center)
        if (!map.getSource('cyclone-eye')) {
          map.addSource('cyclone-eye', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-eye-layer',
              type: 'fill',
              source: 'cyclone-eye',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'fill-color': '#1e293b',
                'fill-opacity': 0.7,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'cyclone-eye-outline',
              type: 'line',
              source: 'cyclone-eye',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': '#64748b',
                'line-width': 2,
              },
            },
            beforeId
          );
        }

        // Add uncertainty cone source
        if (!map.getSource('cyclone-uncertainty')) {
          map.addSource('cyclone-uncertainty', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer(
            {
              id: 'cyclone-uncertainty-layer',
              type: 'fill',
              source: 'cyclone-uncertainty',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'fill-color': '#888888',
                'fill-opacity': 0.06,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'cyclone-uncertainty-outline',
              type: 'line',
              source: 'cyclone-uncertainty',
              layout: {
                visibility: layerVisibility,
              },
              paint: {
                'line-color': '#666666',
                'line-width': 1.5,
                'line-dasharray': [4, 4],
                'line-opacity': 0.18,
              },
            },
            beforeId
          );
        }
      } catch (error) {
        console.error('Error adding cyclone layers:', error);
        // Don't throw, allow the component to continue
      }
    };

    // Wait for both 'load' and 'styledata' events to ensure map is fully ready
    const setupLayers = () => {
      if (map.isStyleLoaded()) {
        addLayers();
      }
    };

    if (map.loaded()) {
      setupLayers();
    } else {
      map.once('load', setupLayers);
    }

    // Also listen for style changes (e.g., basemap switch)
    const handleStyleData = () => {
      // Small delay to ensure style is fully applied
      if (styleDataTimeoutRef.current) {
        window.clearTimeout(styleDataTimeoutRef.current);
      }
      styleDataTimeoutRef.current = window.setTimeout(() => {
        if (map.isStyleLoaded()) setupLayers();
      }, 100);
    };
    map.on('styledata', handleStyleData);

    return () => {
      // Check if map still exists before cleanup
      if (!map || !map.getStyle()) return;

      // Cleanup layers on unmount
      try {
        // Remove deck.gl overlay
        if (deckOverlayRef.current) {
          try {
            map.removeControl(deckOverlayRef.current as any);
          } catch (_) {}
          deckOverlayRef.current = null;
        }

        const layers = [
          'cyclone-forecast-track-line',
          'cyclone-forecast-points',
          'cyclone-oci-layer',
          // Active wind-radius layers
          'cyclone-gale-radius-layer',
          'cyclone-gale-radius-outline',
          'cyclone-storm-radius-layer',
          'cyclone-storm-radius-outline',
          'cyclone-hurricane-radius-layer',
          'cyclone-hurricane-radius-outline',
          'cyclone-eye-layer',
          'cyclone-eye-outline',
          'cyclone-uncertainty-layer',
          'cyclone-uncertainty-outline',
        ];

        const sources = [
          'cyclone-forecast-track',
          'cyclone-oci',
          // Active radius sources
          'cyclone-gale-radius',
          'cyclone-storm-radius',
          'cyclone-hurricane-radius',
          'cyclone-eye',
          'cyclone-uncertainty',
        ];

        layers.forEach(layerId => {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        });

        sources.forEach(sourceId => {
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        });

        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }

        // Clean up trail markers
        trailMarkersRef.current.forEach(marker => marker.remove());
        trailMarkersRef.current = [];
      } catch (_e) {
        // Silently ignore cleanup errors when map is destroyed
      }

      // Remove styledata listener
      if (handleStyleData) {
        map.off('styledata', handleStyleData);
      }
      if (styleDataTimeoutRef.current) {
        window.clearTimeout(styleDataTimeoutRef.current);
        styleDataTimeoutRef.current = null;
      }
    };
  }, [map, forecastTrack]);

  // Check notification rules
  const checkNotifications = useCallback((point: CycloneForecastPoint, index: number) => {
    // Show browser notification for high-intensity cyclones
    if ('Notification' in window && Notification.permission === 'granted') {
      const last = lastNotifiedRef.current;
      if (point.category < 4) {
        lastNotifiedRef.current = { category: point.category, index };
        return;
      }
      const shouldNotify =
        !last || last.category < 4 || point.category > last.category || last.index !== index;
      if (!shouldNotify) return;
      if (point.category >= 4) {
        new Notification('Cyclone Alert', {
          body: `${getCategoryLabel(point.category)} reached at ${new Date(point.time).toLocaleString()}\nWind: ${point.meanWind.toFixed(0)} kt, Pressure: ${point.pressure.toFixed(0)} hPa`,
          icon: '/cyclone-icon.png',
          tag: 'cyclone-alert',
        });
        lastNotifiedRef.current = { category: point.category, index };
      }
    }
  }, []);

  // Update visualization for current timestep
  useEffect(() => {
    if (!map || !forecastTrack || forecastTrack.length === 0) return;

    const point = forecastTrack[currentIndex];
    if (!point) return;

    // When hidden, keep overlays suppressed and skip per-frame visual updates
    // that can otherwise re-show marker trails.
    if (!isVisible) {
      if (markerRef.current) {
        markerRef.current.getElement().style.display = 'none';
      }
      trailMarkersRef.current.forEach(marker => {
        marker.getElement().style.display = 'none';
      });
      return;
    }

    // Update or create animated marker
    if (markerRef.current) {
      markerRef.current.setLngLat([point.longitude, point.latitude]);
      if (!isPlaying) {
        displayedPositionRef.current = [point.longitude, point.latitude];
      }

      // Update marker color and shadow based on current category
      const el = markerRef.current.getElement();
      const categoryColor = getCategoryColor(point.category);
      el.style.backgroundColor = categoryColor;
      el.style.boxShadow = '0 0 20px rgba(0,0,0,0.6), 0 0 40px ' + categoryColor + '60';

      // Update spiral colors based on intensity
      const spiralColor =
        point.category >= 4
          ? 'rgba(255, 255, 255, 0.9)'
          : point.category >= 2
            ? 'rgba(255, 255, 255, 0.85)'
            : 'rgba(255, 255, 255, 0.75)';
      const paths = el.querySelectorAll('path');
      paths.forEach(path => {
        path.setAttribute('stroke', spiralColor);
      });
      const circle = el.querySelector('circle');
      if (circle) {
        circle.setAttribute('fill', spiralColor);
      }

      // Update rotation speeds based on intensity
      const outerSpeed = point.category >= 3 ? '3s' : point.category >= 1 ? '4s' : '5s';
      const middleSpeed = point.category >= 3 ? '1.8s' : point.category >= 1 ? '2.5s' : '3s';
      const innerSpeed = point.category >= 3 ? '1s' : point.category >= 1 ? '1.5s' : '2s';

      const outerSpiral = el.querySelector('.cyclone-spiral-outer') as HTMLElement;
      const middleSpiral = el.querySelector('.cyclone-spiral-middle') as HTMLElement;
      const innerSpiral = el.querySelector('.cyclone-spiral-inner') as HTMLElement;

      if (outerSpiral) outerSpiral.style.animationDuration = outerSpeed;
      if (middleSpiral) middleSpiral.style.animationDuration = middleSpeed;
      if (innerSpiral) innerSpiral.style.animationDuration = innerSpeed;

      // Update popup content (safe DOM creation to avoid XSS)
      const popup = markerRef.current.getPopup();
      if (popup) {
        const div = document.createElement('div');
        div.style.fontSize = '11px';
        div.style.minWidth = '180px';

        const categoryLabel = document.createElement('strong');
        categoryLabel.style.fontSize = '12px';
        categoryLabel.style.color = categoryColor;
        categoryLabel.textContent = getCategoryLabel(point.category);
        div.appendChild(categoryLabel);
        div.appendChild(document.createElement('br'));

        const timeLabel = document.createElement('strong');
        timeLabel.textContent = 'Time:';
        div.appendChild(timeLabel);
        div.appendChild(document.createTextNode(' ' + new Date(point.time).toLocaleString()));
        div.appendChild(document.createElement('br'));

        const windLabel = document.createElement('strong');
        windLabel.textContent = 'Wind:';
        div.appendChild(windLabel);
        div.appendChild(
          document.createTextNode(
            ` ${point.meanWind.toFixed(0)} kt (Gust: ${point.windGust.toFixed(0)} kt)`
          )
        );
        div.appendChild(document.createElement('br'));

        const pressureLabel = document.createElement('strong');
        pressureLabel.textContent = 'Pressure:';
        div.appendChild(pressureLabel);
        div.appendChild(document.createTextNode(` ${point.pressure.toFixed(0)} hPa`));
        div.appendChild(document.createElement('br'));

        const positionLabel = document.createElement('strong');
        positionLabel.textContent = 'Position:';
        div.appendChild(positionLabel);
        div.appendChild(
          document.createTextNode(` ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°`)
        );

        popup.setDOMContent(div);
      }
    } else {
      const el = document.createElement('div');
      el.className = 'cyclone-marker';
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = getCategoryColor(point.category);
      el.style.border = '4px solid white';
      el.style.boxShadow =
        '0 0 20px rgba(0,0,0,0.6), 0 0 40px ' + getCategoryColor(point.category) + '60';
      el.style.cursor = 'pointer';
      el.style.position = 'relative';

      // Add CSS classes for realistic cyclone rotation animation
      if (!document.getElementById('cyclone-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'cyclone-animation-styles';
        style.textContent = `
          @keyframes cyclone-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: 0.9; }
          }
          @keyframes cyclone-rotate-outer {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes cyclone-rotate-middle {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes cyclone-rotate-inner {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .cyclone-marker-playing {
            animation: cyclone-pulse 2s ease-in-out infinite;
          }
          .cyclone-marker-vortex {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            overflow: visible;
          }
          .cyclone-spiral-outer {
            animation: cyclone-rotate-outer 4s linear infinite;
            transform-origin: 50px 50px;
            transform-box: fill-box;
          }
          .cyclone-spiral-middle {
            animation: cyclone-rotate-middle 2.5s linear infinite;
            transform-origin: 50px 50px;
            transform-box: fill-box;
          }
          .cyclone-spiral-inner {
            animation: cyclone-rotate-inner 1.5s linear infinite;
            transform-origin: 50px 50px;
            transform-box: fill-box;
          }
          .cyclone-trail-marker {
            opacity: 0.4;
            pointer-events: none;
          }
        `;
        document.head.appendChild(style);
        styleElementRef.current = style;
      }

      if (isPlaying) {
        el.classList.add('cyclone-marker-playing');
      }

      // Add realistic rotating cyclone vortex with multiple spiral layers
      const spiralColor =
        point.category >= 4
          ? 'rgba(255, 255, 255, 0.9)'
          : point.category >= 2
            ? 'rgba(255, 255, 255, 0.85)'
            : 'rgba(255, 255, 255, 0.75)';

      // Adjust rotation speed based on intensity (faster for stronger cyclones)
      const outerSpeed = point.category >= 3 ? '3s' : point.category >= 1 ? '4s' : '5s';
      const middleSpeed = point.category >= 3 ? '1.8s' : point.category >= 1 ? '2.5s' : '3s';
      const innerSpeed = point.category >= 3 ? '1s' : point.category >= 1 ? '1.5s' : '2s';

      el.innerHTML = `
        <svg class="cyclone-marker-vortex" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
          <!-- Outer spiral arms (slowest rotation) -->
          <g class="cyclone-spiral-outer" opacity="0.6" style="animation-duration: ${outerSpeed}; will-change: transform;">
            <path d="M 50 50 Q 65 40, 75 30 Q 80 25, 85 25" 
                  stroke="${spiralColor}" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 60 65, 70 75 Q 75 80, 75 85" 
                  stroke="${spiralColor}" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 35 60, 25 70 Q 20 75, 15 75" 
                  stroke="${spiralColor}" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 40 35, 30 25 Q 25 20, 25 15" 
                  stroke="${spiralColor}" stroke-width="3" fill="none" stroke-linecap="round"/>
          </g>
          
          <!-- Middle spiral arms (medium rotation) -->
          <g class="cyclone-spiral-middle" opacity="0.8" style="animation-duration: ${middleSpeed}; will-change: transform;">
            <path d="M 50 50 Q 60 45, 68 42 Q 72 40, 75 40" 
                  stroke="${spiralColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 55 60, 58 68 Q 60 72, 60 75" 
                  stroke="${spiralColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 40 55, 32 58 Q 28 60, 25 60" 
                  stroke="${spiralColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 45 40, 42 32 Q 40 28, 40 25" 
                  stroke="${spiralColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          </g>
          
          <!-- Inner spiral core (fastest rotation) -->
          <g class="cyclone-spiral-inner" opacity="1" style="animation-duration: ${innerSpeed}; will-change: transform;">
            <path d="M 50 50 Q 56 48, 60 48" 
                  stroke="${spiralColor}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 52 56, 52 60" 
                  stroke="${spiralColor}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 44 52, 40 52" 
                  stroke="${spiralColor}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M 50 50 Q 48 44, 48 40" 
                  stroke="${spiralColor}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <!-- Eye of the storm -->
            <circle cx="50" cy="50" r="4" fill="${spiralColor}" opacity="0.9"/>
          </g>
        </svg>
      `;

      // Create popup with safe DOM construction
      const popupDiv = document.createElement('div');
      popupDiv.style.fontSize = '11px';
      popupDiv.style.minWidth = '180px';

      const categoryLabel = document.createElement('strong');
      categoryLabel.style.fontSize = '12px';
      categoryLabel.style.color = getCategoryColor(point.category);
      categoryLabel.textContent = getCategoryLabel(point.category);
      popupDiv.appendChild(categoryLabel);
      popupDiv.appendChild(document.createElement('br'));

      const timeLabel = document.createElement('strong');
      timeLabel.textContent = 'Time:';
      popupDiv.appendChild(timeLabel);
      popupDiv.appendChild(document.createTextNode(' ' + new Date(point.time).toLocaleString()));
      popupDiv.appendChild(document.createElement('br'));

      const windLabel = document.createElement('strong');
      windLabel.textContent = 'Wind:';
      popupDiv.appendChild(windLabel);
      popupDiv.appendChild(
        document.createTextNode(
          ` ${point.meanWind.toFixed(0)} kt (Gust: ${point.windGust.toFixed(0)} kt)`
        )
      );
      popupDiv.appendChild(document.createElement('br'));

      const pressureLabel = document.createElement('strong');
      pressureLabel.textContent = 'Pressure:';
      popupDiv.appendChild(pressureLabel);
      popupDiv.appendChild(document.createTextNode(` ${point.pressure.toFixed(0)} hPa`));
      popupDiv.appendChild(document.createElement('br'));

      const positionLabel = document.createElement('strong');
      positionLabel.textContent = 'Position:';
      popupDiv.appendChild(positionLabel);
      popupDiv.appendChild(
        document.createTextNode(` ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°`)
      );

      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setDOMContent(popupDiv))
        .addTo(map);
      displayedPositionRef.current = [point.longitude, point.latitude];
    }

    // Update marker pulse and rotation animation
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      // Use CSS class toggle instead of inline style for better performance
      el.classList.toggle('cyclone-marker-playing', isPlaying);
    }

    // Check notifications
    if (notificationsEnabled && isPlaying) {
      checkNotifications(point, currentIndex);
    }

    // Update animation trail (show last 3-5 positions)
    const trailLength = activeQuality.trailLength;
    const trailIndices = Array.from(
      { length: Math.min(trailLength, currentIndex) },
      (_, i) => currentIndex - i - 1
    ).filter(idx => idx >= 0);

    while (trailMarkersRef.current.length < trailLength) {
      const trailEl = document.createElement('div');
      trailEl.className = 'cyclone-marker cyclone-trail-marker';
      trailEl.style.borderRadius = '50%';
      trailEl.style.border = '2px solid white';
      const trailMarker = new maplibregl.Marker({ element: trailEl })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
      trailMarkersRef.current.push(trailMarker);
    }

    while (trailMarkersRef.current.length > trailLength) {
      const marker = trailMarkersRef.current.pop();
      marker?.remove();
    }

    trailMarkersRef.current.forEach((marker, i) => {
      const trailIndex = trailIndices[i];
      const el = marker.getElement();

      if (trailIndex === undefined) {
        el.style.opacity = '0';
        el.style.display = 'none';
        return;
      }

      const trailPoint = forecastTrack[trailIndex];
      const size = 20 - i * 4; // Decreasing size
      const opacity = Math.max(0.1, 0.4 - i * 0.1); // Decreasing opacity
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.backgroundColor = getCategoryColor(trailPoint.category);
      el.style.opacity = `${opacity}`;
      el.style.display = 'block';
      marker.setLngLat([trailPoint.longitude, trailPoint.latitude]);
    });

    // Use pre-computed geometries from cache
    const cached = geometriesCache.current.get(currentIndex);
    if (!cached) return;

    // Ensure map style is still loaded before updating sources
    if (!map.isStyleLoaded()) return;

    try {
      // Update gale radius (yellow)
      const galeSource = map.getSource('cyclone-gale-radius') as maplibregl.GeoJSONSource;
      if (galeSource && cached.gale.length > 0) {
        galeSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [cached.gale],
          },
        } as any);
      }

      // Update storm radius (orange)
      const stormSource = map.getSource('cyclone-storm-radius') as maplibregl.GeoJSONSource;
      if (stormSource && cached.storm.length > 0) {
        stormSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [cached.storm],
          },
        } as any);
      }

      // Update hurricane radius (red)
      const hurricaneSource = map.getSource('cyclone-hurricane-radius') as maplibregl.GeoJSONSource;
      if (hurricaneSource && cached.hurricane.length > 0) {
        hurricaneSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [cached.hurricane],
          },
        } as any);
      }

      // Update uncertainty cone
      const uncertaintySource = map.getSource('cyclone-uncertainty') as maplibregl.GeoJSONSource;
      if (uncertaintySource && cached.uncertainty.length > 0 && point.uncertainty > 0) {
        uncertaintySource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [cached.uncertainty],
          },
        } as any);
      }

      // Update eye (calm center)
      const eyeSource = map.getSource('cyclone-eye') as maplibregl.GeoJSONSource;
      if (eyeSource && cached.eye.length > 0 && point.eyeRadius > 0) {
        eyeSource.setData({
          type: 'Feature',
          properties: { eyeRadius: point.eyeRadius },
          geometry: {
            type: 'Polygon',
            coordinates: [cached.eye],
          },
        } as any);
      }

      // Update OCI (outermost closed isobar)
      const ociSource = map.getSource('cyclone-oci') as maplibregl.GeoJSONSource;
      if (ociSource && cached.oci.length > 0 && point.radiusOCI > 0) {
        ociSource.setData({
          type: 'Feature',
          properties: { pressureOCI: point.pressureOCI },
          geometry: {
            type: 'Polygon',
            coordinates: [cached.oci],
          },
        } as any);
      }

      // Update deck.gl swath: pure GPU uniform change, no data re-upload.
      updateDeckLayers(currentIndex);
    } catch (error) {
      console.warn('Error updating cyclone geometry:', error);
      // Don't throw, allow animation to continue
    }
  }, [
    map,
    forecastTrack,
    currentIndex,
    isVisible,
    isPlaying,
    isLoadingGeometry, // re-run when geometry finishes building so swaths appear immediately
    notificationsEnabled,
    activeQuality,
    checkNotifications,
  ]);

  // Request notification permission
  useEffect(() => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [notificationsEnabled]);

  // Social media sharing function
  const handleShare = useCallback(() => {
    if (!forecastTrack || currentIndex >= forecastTrack.length) return;
    setShowShareCard(true);
  }, [forecastTrack, currentIndex]);

  // Smooth marker interpolation while playback advances via the hook
  useEffect(() => {
    if (!forecastTrack || forecastTrack.length === 0) {
      lastUpdateRef.current = 0;
      displayedPositionRef.current = null;
      return;
    }

    const currentPoint = forecastTrack[currentIndex];
    if (!isPlaying || storyModeEnabled || (isDocked && !controlsContainer && !uiVisible)) {
      if (currentPoint) {
        displayedPositionRef.current = [currentPoint.longitude, currentPoint.latitude];
        markerRef.current?.setLngLat([currentPoint.longitude, currentPoint.latitude]);
      }
      lastUpdateRef.current = 0;
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastUpdateRef.current) {
        lastUpdateRef.current = timestamp;
      }

      const interval = intervalRef.current;
      const elapsed = timestamp - lastUpdateRef.current;
      const progress = Math.min(elapsed / interval, 1);

      // Apply easing for smoother motion
      const easedProgress = easeInOutCubic(progress);

      const baseIndex = currentIndex;
      const nextIndex = Math.min(baseIndex + 1, forecastTrack.length - 1);
      const basePoint = forecastTrack[baseIndex];
      const nextPoint = forecastTrack[nextIndex];
      if (markerRef.current && basePoint && nextPoint) {
        const lng =
          basePoint.longitude +
          shortestDeltaLongitude(basePoint.longitude, nextPoint.longitude) * easedProgress;
        const lat = basePoint.latitude + (nextPoint.latitude - basePoint.latitude) * easedProgress;
        displayedPositionRef.current = [lng, lat];
        markerRef.current.setLngLat([lng, lat]);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      lastUpdateRef.current = 0;
    };
  }, [
    isPlaying,
    forecastTrack,
    currentIndex,
    isDocked,
    controlsContainer,
    uiVisible,
    storyModeEnabled,
    easeInOutCubic,
  ]);

  const toggleChart = useCallback(() => {
    setShowChart(prev => {
      const next = !prev;
      if (next) {
        setIsMinimized(false);
      }
      return next;
    });
  }, []);

  const toggleStoryMode = useCallback(() => {
    const next = !storyModeEnabled;
    if (onStoryModeChange) {
      onStoryModeChange(next);
    } else {
      setStoryModeInternal(next);
    }
    if (next) {
      setIsMinimized(false);
      pause();
    }
  }, [storyModeEnabled, onStoryModeChange, pause]);

  useEffect(() => {
    if (storyModeEnabled) {
      setIsMinimized(false);
      if (isPlaying) pause();
    }
  }, [storyModeEnabled, isPlaying, pause]);

  // Keyboard shortcuts
  // Shortcuts: Space/K: Play/Pause, Arrow Keys/J/L: Navigate, Home/End: Jump, Escape: Close
  // I: Toggle legend, M: Minimize, C: Toggle chart, B: Story mode, N: Notifications, S: Share
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || !uiVisible) return;

      // Don't hijack typing in inputs, textareas, selects, or contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          previous();
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          next();
          break;
        case 'Home':
          e.preventDefault();
          seekTo(0);
          break;
        case 'End':
          e.preventDefault();
          if (forecastTrack) {
            seekTo(forecastTrack.length - 1);
          }
          break;
        case 'Escape':
          if (onClose) onClose();
          break;
        case 'i':
          e.preventDefault();
          setShowLegend(prev => !prev);
          break;
        case 'm':
          e.preventDefault();
          setIsMinimized(prev => !prev);
          break;
        case 'c':
          e.preventDefault();
          toggleChart();
          break;
        case 'b':
          e.preventDefault();
          toggleStoryMode();
          break;
        case 'n':
          e.preventDefault();
          setNotificationsEnabled(prev => !prev);
          break;
        case 's':
          e.preventDefault();
          handleShare();
          break;
        case 'r':
          e.preventDefault();
          setIsLooping(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isVisible,
    uiVisible,
    forecastTrack,
    onClose,
    handleShare,
    toggleStoryMode,
    toggleChart,
    next,
    previous,
    seekTo,
    toggle,
  ]);

  // Visibility control
  useEffect(() => {
    if (!map) return;

    const applyVisibility = () => {
      try {
        const visibility = isVisible ? 'visible' : 'none';

        // Toggle deck.gl overlay visibility
        if (deckOverlayRef.current) {
          const layers: any = isVisible
            ? sanitizeDeckLayers(buildDeckLayers(currentIndexRef.current) as any[])
            : [];
          (deckOverlayRef.current as any).setProps({ layers });
        }

        // Marker and trail markers are DOM overlays and should hide regardless of map style state
        if (markerRef.current) {
          const el = markerRef.current.getElement();
          el.style.display = isVisible ? 'block' : 'none';
        }
        trailMarkersRef.current.forEach(marker => {
          const el = marker.getElement();
          el.style.display = isVisible ? 'block' : 'none';
        });

        // Layer visibility requires a loaded style
        if (!map.isStyleLoaded()) return;

        [
          'cyclone-forecast-track-line',
          'cyclone-forecast-points',
          'cyclone-forecast-cone-layer',
          'cyclone-forecast-cone-layer-outline',
          'cyclone-oci-layer',
          // Active radius layers
          'cyclone-gale-radius-layer',
          'cyclone-gale-radius-outline',
          'cyclone-storm-radius-layer',
          'cyclone-storm-radius-outline',
          'cyclone-hurricane-radius-layer',
          'cyclone-hurricane-radius-outline',
          'cyclone-eye-layer',
          'cyclone-eye-outline',
          'cyclone-uncertainty-layer',
          'cyclone-uncertainty-outline',
        ].forEach(layerId => {
          if (map.getLayer(layerId)) {
            const currentVisibility = map.getLayoutProperty(layerId, 'visibility');
            if (currentVisibility !== visibility) {
              map.setLayoutProperty(layerId, 'visibility', visibility);
            }
          }
        });
      } catch (error) {
        console.warn('Error updating visibility:', error);
      }
    };

    applyVisibility();

    // Re-apply visibility after style changes so hidden cyclone layers don't reappear.
    map.on('styledata', applyVisibility);
    return () => {
      map.off('styledata', applyVisibility);
    };
  }, [map, isVisible, buildDeckLayers, sanitizeDeckLayers]);

  // Drag handlers for panel
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (panelRef.current && e.target === e.currentTarget) {
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const next = clampPanelPosition(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
        setPanelPosition(next);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setUserHasManuallyPositioned(true); // Mark as manually positioned after drag
      }
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, clampPanelPosition]);

  // Handle window resize to keep panel in view
  useEffect(() => {
    const handleResize = () => {
      if (panelRef.current) {
        // Use current panelPosition state instead of getBoundingClientRect
        // since the panel is position: absolute (relative to parent, not viewport)
        setPanelPosition(prev => clampPanelPosition(prev.x, prev.y));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPanelPosition]);

  // Ensure panel position is clamped on mount and when visibility changes
  useEffect(() => {
    if (uiVisible && panelRef.current) {
      setPanelPosition(prev => clampPanelPosition(prev.x, prev.y));
    }
  }, [uiVisible, clampPanelPosition]);

  useEffect(() => {
    if (!isMinimized && showLegend) {
      setShowLegend(false);
    }
  }, [isMinimized, showLegend]);

  const hasForecast = !!forecastTrack && forecastTrack.length > 0;
  // currentIndex is bounded by the playback hook, but use fallback for safety
  const currentPoint = (forecastTrack && forecastTrack[currentIndex]) ?? forecastTrack?.[0] ?? null;

  useEffect(() => {
    if (!showChart || chartUserPositioned) return;
    if (typeof window === 'undefined') return;
    if (!hasForecast) return;

    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const gap = 12;
    const baseX = panelPosition.x + 12;
    const baseY = panelPosition.y + panelHeight + gap;
    const clamped = clampChartPosition(baseX, baseY, chartPanelSize.width, chartPanelSize.height);
    setChartPanelPosition(clamped);
  }, [
    showChart,
    chartUserPositioned,
    panelPosition.x,
    panelPosition.y,
    chartPanelSize.width,
    chartPanelSize.height,
    clampChartPosition,
    hasForecast,
  ]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (isChartDragging) {
        const nextX = event.clientX - chartDragOffset.x;
        const nextY = event.clientY - chartDragOffset.y;
        const clamped = clampChartPosition(
          nextX,
          nextY,
          chartPanelSize.width,
          chartPanelSize.height
        );
        setChartPanelPosition(clamped);
      }

      if (isChartResizing) {
        const dx = event.clientX - chartResizeOrigin.x;
        const dy = event.clientY - chartResizeOrigin.y;
        const minWidth = 360;
        const minHeight = 200;
        const parentElement = chartPanelRef.current?.parentElement;
        const containerWidth = parentElement?.offsetWidth ?? window.innerWidth;
        const containerHeight = parentElement?.offsetHeight ?? window.innerHeight;
        const maxWidth = Math.max(minWidth, containerWidth - chartPanelPosition.x - 16);
        const maxHeight = Math.max(minHeight, containerHeight - chartPanelPosition.y - 16);
        const nextWidth = Math.min(maxWidth, Math.max(minWidth, chartResizeOrigin.width + dx));
        const nextHeight = Math.min(maxHeight, Math.max(minHeight, chartResizeOrigin.height + dy));
        setChartPanelSize({ width: nextWidth, height: nextHeight });
      }
    };

    const handleUp = () => {
      if (isChartDragging) {
        setIsChartDragging(false);
      }
      if (isChartResizing) {
        setIsChartResizing(false);
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [
    isChartDragging,
    isChartResizing,
    chartDragOffset.x,
    chartDragOffset.y,
    chartResizeOrigin.x,
    chartResizeOrigin.y,
    chartResizeOrigin.width,
    chartResizeOrigin.height,
    chartPanelSize.width,
    chartPanelSize.height,
    chartPanelPosition.x,
    chartPanelPosition.y,
    clampChartPosition,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setChartPanelPosition(prev =>
        clampChartPosition(prev.x, prev.y, chartPanelSize.width, chartPanelSize.height)
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chartPanelSize.width, chartPanelSize.height, clampChartPosition]);

  // Memoised style objects – avoids allocating new objects on every render,
  // which would also invalidate any child memo comparisons.
  // Both must live before the early return to satisfy React's Rules of Hooks.
  const mainPanelStyle = useMemo<React.CSSProperties>(
    () =>
      isDocked
        ? {
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            padding: '8px',
            boxShadow: 'none',
            fontSize: '11px',
            border: 'none',
          }
        : {
            left: `${panelPosition.x}px`,
            top: `${panelPosition.y}px`,
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(16px)',
            borderRadius: isMinimized ? '8px' : '12px',
            padding: isMinimized ? '8px 12px' : 'clamp(10px, 2vw, 14px) clamp(14px, 3vw, 18px)',
            boxShadow: isDragging
              ? '0 12px 40px rgba(0,0,0,0.8), 0 0 0 2px rgba(59, 130, 246, 0.5)'
              : '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(148, 163, 184, 0.3)',
            cursor: isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'box-shadow 0.2s ease, border-color 0.2s',
            userSelect: 'none',
            maxHeight: 'calc(100vh - 120px)',
            overflow: 'hidden',
            fontSize: 'clamp(11px, 1.5vw, 13px)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          },
    [isDocked, panelPosition.x, panelPosition.y, isMinimized, isDragging]
  );

  const chartPanelStyle = useMemo<React.CSSProperties>(
    () => ({
      left: `${chartPanelPosition.x}px`,
      top: `${chartPanelPosition.y}px`,
      width: `${chartPanelSize.width}px`,
      height: `${chartPanelSize.height}px`,
      background: 'rgba(30, 40, 60, 0.97)',
      backdropFilter: 'blur(16px)',
      borderRadius: '12px',
      padding: '12px 14px 14px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      border: '1px solid rgba(148, 163, 184, 0.25)',
    }),
    [chartPanelPosition.x, chartPanelPosition.y, chartPanelSize.width, chartPanelSize.height]
  );

  // Early return AFTER all hooks - React Rules of Hooks compliance
  if (!forecastTrack || forecastTrack.length === 0) {
    return null;
  }

  const mainControls = (
    <div
      ref={panelRef}
      className={`${
        isDocked
          ? 'relative w-full pointer-events-auto'
          : `absolute z-[90] pointer-events-auto transition-all duration-150 ${
              isMinimized
                ? 'w-auto'
                : 'w-[min(520px,calc(100vw-40px))] sm:w-[min(520px,calc(100vw-64px))]'
            }`
      }`}
      style={mainPanelStyle}
      onMouseDown={isDocked ? undefined : handleMouseDown}
    >
      {!isDocked && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-slate-400 rounded-full opacity-70 pointer-events-none shadow-lg" />
      )}

      {/* Header with Controls */}
      {!isMinimized && (
        <div
          className="flex items-center justify-between mb-2"
          style={{ cursor: 'auto' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 flex-1">
            {currentPoint && (
              <>
                <span className="text-white text-[10px] font-semibold">
                  {new Date(currentPoint.time).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/30">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getCategoryColor(currentPoint.category) }}
                  />
                  <span className="text-white text-[10px] font-semibold">
                    {getCategoryLabel(currentPoint.category)}
                  </span>
                </div>
              </>
            )}
          </div>

          {!isDocked && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={toggleChart}
                className={`p-1.5 rounded-lg transition-all ${
                  showChart
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-transparent'
                }`}
                title="Toggle intensity chart (C)"
                aria-label={showChart ? 'Hide intensity chart' : 'Show intensity chart'}
                aria-pressed={showChart}
              >
                <BarChart3 size={14} className="sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={toggleStoryMode}
                className={`p-1.5 rounded-lg transition-all ${
                  storyModeEnabled
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-transparent'
                }`}
                title={`${storyModeEnabled ? 'Disable' : 'Enable'} story mode - Navigate key cyclone moments (B)`}
                aria-label={storyModeEnabled ? 'Disable story mode' : 'Enable story mode'}
                aria-pressed={storyModeEnabled}
              >
                <Book size={14} className="sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`p-1.5 rounded-lg transition-all ${
                  notificationsEnabled
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-transparent'
                }`}
                title={
                  notificationsEnabled ? 'Disable notifications (N)' : 'Enable notifications (N)'
                }
                aria-label={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
                aria-pressed={notificationsEnabled}
              >
                {notificationsEnabled ? (
                  <Bell size={14} className="sm:w-3.5 sm:h-3.5" />
                ) : (
                  <BellOff size={14} className="sm:w-3.5 sm:h-3.5" />
                )}
              </button>
              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white transition-all border border-transparent"
                title="Share current timestep (S)"
                aria-label="Share current timestep"
              >
                <Share2 size={14} className="sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={() => setShowLegend(!showLegend)}
                className="p-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white transition-all border border-transparent"
                title="Toggle legend (I)"
                aria-label={showLegend ? 'Hide legend' : 'Show legend'}
                aria-pressed={showLegend}
              >
                <Layers size={14} className="sm:w-3.5 sm:h-3.5" />
              </button>
              {!isDocked && (
                <button
                  onClick={() => {
                    const next = getDefaultPanelPosition();
                    const clamped = clampPanelPosition(next.x, next.y);
                    setPanelPosition(clamped);
                    setUserHasManuallyPositioned(false); // Re-enable auto-positioning
                  }}
                  className="p-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white transition-all border border-transparent"
                  title="Reset panel position"
                  aria-label="Reset panel position"
                >
                  <RotateCcw size={14} className="sm:w-3.5 sm:h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className={`p-1.5 rounded-lg transition-all ${
                  !isMinimized
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-transparent'
                }`}
                title={isMinimized ? 'Expand (M)' : 'Minimize (M)'}
                aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
                aria-pressed={!isMinimized}
              >
                {isMinimized ? (
                  <Maximize2 size={14} className="sm:w-3.5 sm:h-3.5" />
                ) : (
                  <Minimize2 size={14} className="sm:w-3.5 sm:h-3.5" />
                )}
              </button>
              {onClose && !isDocked && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-red-500/25 hover:bg-red-500/40 text-red-300 hover:text-red-200 transition-all border border-red-500/30 hover:border-red-500/50"
                  title="Close (Esc)"
                  aria-label="Close panel"
                >
                  <X size={14} className="sm:w-3.5 sm:h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded Content */}
      {!isMinimized && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          {/* Primary Intensity Metrics */}
          {currentPoint && (
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <div className="px-2 py-1.5 bg-slate-800/20 rounded-lg border border-slate-700/20">
                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                  WIND
                </div>
                <div className="text-xs font-bold text-cyan-300">
                  {currentPoint.meanWind.toFixed(0)}{' '}
                  <span className="text-[9px] text-slate-400">kt</span>
                </div>
              </div>
              <div className="px-2 py-1.5 bg-slate-800/20 rounded-lg border border-slate-700/20">
                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                  GUST
                </div>
                <div className="text-xs font-bold text-blue-300">
                  {currentPoint.windGust.toFixed(0)}{' '}
                  <span className="text-[9px] text-slate-400">kt</span>
                </div>
              </div>
              <div className="px-2 py-1.5 bg-slate-800/20 rounded-lg border border-slate-700/20">
                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                  PRESSURE
                </div>
                <div className="text-xs font-bold text-slate-200">
                  {currentPoint.pressure.toFixed(0)}{' '}
                  <span className="text-[9px] text-slate-400">hPa</span>
                </div>
              </div>
            </div>
          )}

          {/* Additional Metrics Grid - collapsed by default */}
          {currentPoint && showDetails && (
            <div className="grid grid-cols-2 gap-1.5 mb-2 text-[10px]">
              {/* Dvorak T-Number */}
              {currentPoint.dvorakTNumber > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">Dvorak T:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.dvorakTNumber.toFixed(1)}
                  </span>
                </div>
              )}

              {/* Eye Radius */}
              {currentPoint.eyeRadius > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">Eye:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.eyeRadius.toFixed(0)} km
                  </span>
                  {currentPoint.eyeRadiusUncertainty > 0 && (
                    <span className="text-slate-600 text-[9px] ml-0.5">
                      ±{currentPoint.eyeRadiusUncertainty.toFixed(0)}
                    </span>
                  )}
                </div>
              )}

              {/* Vertical Extent */}
              {currentPoint.verticalExtent > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">Vert Ext:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.verticalExtent.toFixed(1)}
                  </span>
                </div>
              )}

              {/* OCI Circulation Extent */}
              {currentPoint.radiusOCI > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">OCI:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.radiusOCI.toFixed(0)} km
                  </span>
                </div>
              )}

              {/* P5Wind Alternative Metric */}
              {currentPoint.p5Wind > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">P5 Wind:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.p5Wind.toFixed(0)} kt
                  </span>
                </div>
              )}

              {/* Current Intensity */}
              {currentPoint.currentIntensity > 0 && (
                <div className="bg-slate-800/15 rounded px-2 py-1 border border-slate-700/10">
                  <span className="text-slate-400">Intensity:</span>
                  <span className="text-cyan-300 font-semibold ml-1">
                    {currentPoint.currentIntensity.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Timeline Scrubber with Beat Markers */}
          {forecastTrack && (
            <div className="mb-2">
              <div className="relative">
                {(() => {
                  const maxIndex = Math.max(0, forecastTrack.length - 1);
                  const progress = maxIndex === 0 ? 0 : (currentIndex / maxIndex) * 100;
                  return (
                    <input
                      id="cyclone-timeline-scrubber"
                      name="timelineScrubber"
                      type="range"
                      min="0"
                      max={maxIndex}
                      value={currentIndex}
                      onChange={e => seekTo(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-600/70 rounded-lg appearance-none cursor-pointer relative z-10"
                      aria-label="Cyclone animation timeline slider"
                      style={{
                        background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${progress}%, #4B5563 ${progress}%, #4B5563 100%)`,
                      }}
                    />
                  );
                })()}

                {/* Beat Markers */}
                {storyModeEnabled &&
                  forecastTrack.length > 1 &&
                  storyBeats.map(beat => {
                    const position = (beat.index / (forecastTrack.length - 1)) * 100;
                    const beatColor =
                      beat.type === 'peak-intensity'
                        ? '#ef4444'
                        : beat.type === 'rapid-intensification'
                          ? '#f59e0b'
                          : beat.type === 'category-upgrade'
                            ? '#8b5cf6'
                            : beat.type === 'closest-approach'
                              ? '#ec4899'
                              : '#6366f1'; // peak-uncertainty

                    return (
                      <button
                        key={beat.id}
                        type="button"
                        className="absolute rounded-full border-2 border-white cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 hover:scale-150"
                        style={{
                          left: `${position}%`,
                          top: '50%',
                          backgroundColor: beatColor,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 20,
                          // Larger click target (12px visible + 12px padding = 24x24px hit area)
                          width: '12px',
                          height: '12px',
                          padding: '6px',
                          boxSizing: 'content-box',
                        }}
                        title={`Story beat: ${beat.title}`}
                        aria-label={`Story beat: ${beat.title} at ${beat.time.toLocaleString()}`}
                        onClick={() => seekTo(beat.index)}
                      />
                    );
                  })}
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>
                  {new Date(forecastTrack[0].time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>
                  {currentIndex + 1}/{forecastTrack.length}
                </span>
                <span>
                  {new Date(forecastTrack[forecastTrack.length - 1].time).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' }
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Playback Controls */}
          <div className="space-y-1.5">
            {/* Play/Pause and Navigation */}
            <div className="flex items-center justify-center gap-1.5">
              {!storyModeEnabled ? (
                <>
                  <button
                    onClick={() => seekTo(0)}
                    className="p-1 rounded bg-slate-700/50 hover:bg-slate-600/60 text-white transition-colors"
                    title="Reset to start (Home)"
                    aria-label="Reset to start"
                  >
                    <SkipBack size={12} />
                  </button>

                  <button
                    onClick={() => {
                      toggle();
                    }}
                    className="p-1.5 rounded bg-blue-500/80 hover:bg-blue-500 text-white transition-colors"
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                  >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  </button>

                  <button
                    onClick={() => setIsLooping(!isLooping)}
                    className={`p-1 rounded transition-colors ${
                      isLooping
                        ? 'bg-cyan-500/80 hover:bg-cyan-500 text-white'
                        : 'bg-slate-700/50 hover:bg-slate-600/60 text-slate-300'
                    }`}
                    title={isLooping ? 'Disable loop (R)' : 'Enable loop (R)'}
                    aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                    aria-pressed={isLooping}
                  >
                    <Repeat size={12} />
                  </button>

                  <button
                    onClick={() => {
                      if (forecastTrack) {
                        seekTo(forecastTrack.length - 1);
                      }
                    }}
                    className="p-1 rounded bg-slate-700/50 hover:bg-slate-600/60 text-white transition-colors"
                    title="Skip to end"
                    aria-label="Skip to end"
                  >
                    <SkipForward size={12} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={previousBeat}
                    disabled={!getPreviousBeat(storyBeats, currentIndex)}
                    className="p-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Previous Beat"
                    aria-label="Previous beat"
                  >
                    <ChevronLeft size={12} />
                  </button>

                  <button
                    onClick={toggle}
                    className="p-1.5 rounded bg-blue-500/80 hover:bg-blue-500 text-white transition-colors"
                    title={isPlaying ? 'Pause' : 'Play'}
                    aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                  >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  </button>

                  <button
                    onClick={nextBeat}
                    disabled={!getNextBeat(storyBeats, currentIndex)}
                    className="p-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Next Beat"
                    aria-label="Next beat"
                  >
                    <ChevronRight size={12} />
                  </button>
                </>
              )}
            </div>

            {/* Speed Control - Separate Row */}
            <div className="flex items-center justify-center gap-1">
              <span className="text-white text-[10px] font-medium mr-1">Speed:</span>
              {[0.25, 0.5, 1, 2, 4].map(speed => (
                <button
                  key={speed}
                  onClick={() => setSpeed(speed)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[32px] transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-blue-500/80 text-white'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/60 hover:text-slate-300'
                  }`}
                  title={`${speed}x speed`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Details / Quality toggle row */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-700/30">
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="text-[10px] text-slate-400 hover:text-slate-300 transition-colors"
              aria-expanded={showDetails}
            >
              {showDetails ? '▲ Less' : '▼ Details'}
            </button>
            {showDetails && (
              <div className="flex items-center gap-1">
                <span className="text-white text-[10px] font-medium">Quality:</span>
                {(['balanced', 'high', 'cinematic'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setQualityMode(mode)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      qualityMode === mode
                        ? 'bg-emerald-500/80 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/60 hover:text-slate-300'
                    }`}
                    title={`${mode} quality`}
                  >
                    {mode === 'balanced' ? 'Bal' : mode === 'high' ? 'Hi' : 'Cin'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const categoryLegendItems = [
    { label: 'Category 5', color: CATEGORY_COLORS.category5 },
    { label: 'Category 4', color: CATEGORY_COLORS.category4 },
    { label: 'Category 3', color: CATEGORY_COLORS.category3 },
    { label: 'Category 2', color: CATEGORY_COLORS.category2 },
    { label: 'Category 1', color: CATEGORY_COLORS.category1 },
    { label: 'Tropical Storm', color: CATEGORY_COLORS.tropicalStorm },
  ] as const;

  const swathLegendItems = [
    {
      windType: 'hurricane' as const,
      label: 'Hurricane Swath',
      subtitle: 'Maximum hurricane-force footprint',
    },
    {
      windType: 'storm' as const,
      label: 'Storm Swath',
      subtitle: 'Maximum storm-force footprint',
    },
    {
      windType: 'gale' as const,
      label: 'Gale Swath',
      subtitle: 'Maximum gale-force footprint',
    },
  ] as const;

  const renderCategoryLegendSection = (
    <div className="mb-3 pb-3 border-b border-slate-700">
      <div className="text-xs text-white font-medium mb-2">Cyclone Category</div>
      <div className="space-y-1.5">
        {categoryLegendItems.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                backgroundColor: item.color,
                border: '2px solid white',
              }}
            />
            <div className="text-xs text-white">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSwathLegendRows = (
    <div className="space-y-1.5">
      {swathLegendItems.map(item => {
        const [r, g, b] = SWATH_WIND_RGB[item.windType];
        // Render legend chips at a representative mid-to-strong category opacity.
        const alpha = Math.min(SWATH_BASE_ALPHA[item.windType] + 12, 80) / 100;
        return (
          <div key={item.windType} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border"
              style={{
                backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
                borderColor: `rgb(${r}, ${g}, ${b})`,
              }}
            />
            <div className="text-xs text-white">
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-slate-400">{item.subtitle}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const dockedPanels = (
    <div className="space-y-2">
      {mainControls}
      {showLegend && !isMinimized && (
        <div
          className="relative w-full"
          style={{
            background: 'rgba(30, 40, 60, 0.97)',
            backdropFilter: 'blur(16px)',
            borderRadius: '12px',
            padding: '14px',
            minWidth: '220px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-blue-400" />
              <h3 className="text-white text-base font-semibold">Wind Radii Legend</h3>
            </div>
            <button
              onClick={() => setShowLegend(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              aria-label="Close legend"
            >
              <X size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {renderCategoryLegendSection}
            <div className="mb-3 pb-3 border-b border-slate-700">
              <div className="text-xs text-white font-medium mb-2">Swath Envelope</div>
              {renderSwathLegendRows}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Wind Field Glow Canvas Overlay */}
      <canvas
        ref={windGlowCanvasRef}
        className="absolute inset-0 pointer-events-none z-[5] w-full h-full"
        style={{
          mixBlendMode: 'screen',
          maxWidth: '100%',
          maxHeight: '100%',
          opacity: uiVisible ? 1 : 0,
        }}
      />

      {/* Loading Indicator for Geometry Pre-computation */}
      {uiVisible && isLoadingGeometry && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[18] pointer-events-none"
          style={{
            background: 'rgba(30, 40, 60, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '12px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-white text-sm font-medium">
              Pre-computing animation geometries...
            </span>
          </div>
        </div>
      )}

      {/* Story Beat Annotations - Narrative text overlay */}
      {currentPoint && (
        <StoryBeatAnnotation
          currentPoint={currentPoint}
          storyBeats={storyBeats}
          currentIndex={currentIndex}
          visible={uiVisible && storyModeEnabled}
        />
      )}

      {/* Story Beat Moment Card */}
      {uiVisible &&
        storyModeEnabled &&
        showStoryBeatCard &&
        (() => {
          const currentBeat = isAtBeat(storyBeats, currentIndex);
          if (!currentBeat) return null;

          const BeatIcon = getStoryBeatIcon(currentBeat.type);

          const beatColor =
            currentBeat.type === 'peak-intensity'
              ? '#ef4444'
              : currentBeat.type === 'rapid-intensification'
                ? '#f59e0b'
                : currentBeat.type === 'category-upgrade'
                  ? '#8b5cf6'
                  : currentBeat.type === 'closest-approach'
                    ? '#ec4899'
                    : '#6366f1';

          return (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[18] pointer-events-none w-[min(400px,calc(100vw-32px))] max-w-md px-4"
              style={{
                background: 'rgba(30, 40, 60, 0.97)',
                backdropFilter: 'blur(16px)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 2px ${beatColor}`,
                animation: 'fadeInScale 0.3s ease-out',
              }}
            >
              <div className="text-center">
                <h3 className="text-white text-lg font-bold mb-1 flex items-center justify-center gap-2">
                  <BeatIcon className="w-4 h-4 text-white/90" aria-hidden="true" />
                  {currentBeat.title}
                </h3>
                <p className="text-slate-300 text-sm">{currentBeat.description}</p>
                {currentBeat.metrics && (
                  <div className="flex justify-center gap-3 mt-2 text-xs">
                    {currentBeat.metrics.wind && (
                      <span className="text-blue-300">
                        {Math.round(currentBeat.metrics.wind)} kt
                      </span>
                    )}
                    {currentBeat.metrics.pressure && (
                      <span className="text-amber-300">
                        {Math.round(currentBeat.metrics.pressure)} hPa
                      </span>
                    )}
                    {currentBeat.metrics.distance !== undefined && (
                      <span className="text-pink-300">
                        {Math.round(currentBeat.metrics.distance)} km
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Main Control Panel - Only show on map if NOT docked */}
      {uiVisible && !isDocked && mainControls}

      {/* Docked Controls - Portal to container when available, inline fallback otherwise */}
      {isDocked && controlsContainer && createPortal(dockedPanels, controlsContainer)}

      {/* Intensity Chart - Floating and resizable */}
      {uiVisible && showChart && !isMinimized && (
        <div
          ref={chartPanelRef}
          className="absolute z-[90] pointer-events-auto"
          style={chartPanelStyle}
        >
          <div
            className="flex items-center justify-between mb-3 cursor-move"
            onMouseDown={event => {
              event.preventDefault();
              setChartUserPositioned(true);
              setIsChartDragging(true);
              setChartDragOffset({
                x: event.clientX - chartPanelPosition.x,
                y: event.clientY - chartPanelPosition.y,
              });
            }}
          >
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-blue-400" />
              <h3 className="text-white text-sm font-semibold">Intensity Timeline</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBeatFeedbackEnabled(prev => !prev)}
                className={`transition-colors p-1 rounded ${
                  beatFeedbackEnabled
                    ? 'text-emerald-300 hover:text-emerald-200 bg-emerald-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title={beatFeedbackEnabled ? 'Disable beat feedback' : 'Enable beat feedback'}
                aria-label={beatFeedbackEnabled ? 'Disable beat feedback' : 'Enable beat feedback'}
              >
                {beatFeedbackEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button
                onClick={() => {
                  setChartPanelSize({ width: 520, height: 240 });
                  setChartUserPositioned(false);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                title="Reset size"
                aria-label="Reset chart size"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => setShowChart(false)}
                className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                aria-label="Close intensity chart"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="h-[calc(100%-40px)] w-full">
            {CycloneIntensityChart && (
              <CycloneIntensityChart
                forecastTrack={forecastTrack}
                currentIndex={currentIndex}
                onPointClick={seekTo}
                isPlaying={isPlaying}
                storyBeats={storyBeats}
              />
            )}
          </div>
          <div
            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize"
            onMouseDown={event => {
              event.preventDefault();
              setChartUserPositioned(true);
              setIsChartResizing(true);
              setChartResizeOrigin({
                x: event.clientX,
                y: event.clientY,
                width: chartPanelSize.width,
                height: chartPanelSize.height,
              });
            }}
            aria-hidden="true"
          >
            <div className="h-full w-full rounded-sm border-b-2 border-r-2 border-slate-400/70" />
          </div>
        </div>
      )}

      {/* Wind Radii Legend */}
      {uiVisible && showLegend && !isMinimized && !isDocked && (
        <div
          className="absolute bottom-4 right-4 z-[90] pointer-events-auto max-h-[calc(100vh-120px)] overflow-y-auto"
          style={{
            background: 'rgba(30, 40, 60, 0.97)',
            backdropFilter: 'blur(16px)',
            borderRadius: '12px',
            padding: '14px',
            minWidth: '220px',
            maxWidth: 'calc(100vw - 32px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-blue-400" />
              <h3 className="text-white text-base font-semibold">Wind Radii Legend</h3>
            </div>
            <button
              onClick={() => setShowLegend(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              aria-label="Close legend"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {renderCategoryLegendSection}

            <div className="text-xs text-white font-medium mb-2">Wind Radii</div>
            {(currentPoint?.hurricaneRadiusNE ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border-2"
                  style={{
                    backgroundColor: `${WIND_RADII_COLORS.hurricane.stroke}40`,
                    borderColor: WIND_RADII_COLORS.hurricane.stroke,
                  }}
                ></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Hurricane Force</div>
                  <div className="text-xs text-slate-400">≥64 kt (≥119 km/h)</div>
                </div>
              </div>
            )}

            {(currentPoint?.stormRadiusNE ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border-2"
                  style={{
                    backgroundColor: `${WIND_RADII_COLORS.storm.stroke}40`,
                    borderColor: WIND_RADII_COLORS.storm.stroke,
                  }}
                ></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Storm Force</div>
                  <div className="text-xs text-slate-400">48-63 kt (89-118 km/h)</div>
                </div>
              </div>
            )}

            {(currentPoint?.galeRadiusNE ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border-2"
                  style={{
                    backgroundColor: `${WIND_RADII_COLORS.gale.stroke}40`,
                    borderColor: WIND_RADII_COLORS.gale.stroke,
                  }}
                ></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Gale Force</div>
                  <div className="text-xs text-slate-400">34-47 kt (63-88 km/h)</div>
                </div>
              </div>
            )}

            {(currentPoint?.uncertainty ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border-2 border-dashed"
                  style={{ backgroundColor: '#88888826', borderColor: '#666666' }}
                ></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Uncertainty Cone</div>
                  <div className="text-xs text-slate-400">Forecast error range</div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-700">
              <div className="text-xs text-white font-medium mb-2">Swath Envelope</div>
              {renderSwathLegendRows}
            </div>

            <div className="pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-1 rounded"
                  style={{ backgroundColor: CHART_COLORS.pressure }}
                ></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Forecast Track</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Card Modal */}
      {uiVisible && showShareCard && forecastTrack && (
        <CycloneShareCard
          cycloneData={forecastTrack}
          currentIndex={currentIndex}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </>
  );
}
