'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { Play, Pause, SkipBack, SkipForward, Timer, X, Minimize2, Maximize2, Share2, Bell, BellOff, BarChart3, Layers, Book, ChevronLeft, ChevronRight, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import {
  CycloneForecastPoint,
  getCategoryColor,
  getCategoryLabel,
} from '../utils/cycloneAnimationLoader';
import {
  detectStoryBeats,
  getNextBeat,
  getPreviousBeat,
  isAtBeat,
  StoryBeat,
} from '../utils/cycloneStory';
import CycloneIntensityChart from './CycloneIntensityChart';
import CycloneShareCard from './CycloneShareCard';

interface CycloneAnimationLayerProps {
  map: maplibregl.Map;
  forecastTrack: CycloneForecastPoint[] | null;
  isVisible?: boolean;
  uiVisible?: boolean;
  onClose?: () => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  isPlayingExternal?: boolean;
  onTimestepChange?: (timestep: CycloneForecastPoint | null, index: number, totalSteps: number) => void;
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
    trailLength: 2,
    glowOpacity: [0.45, 0.2, 0.08],
  },
  high: {
    maxParticles: 1400,
    spawnRate: 8,
    glowRings: 3,
    trailLength: 5,
    glowOpacity: [0.6, 0.35, 0.18],
  },
} as const;

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMinimized, setIsMinimized] = useState(true); // Start minimized to reduce clutter
  const [showLegend, setShowLegend] = useState(true);
  const [showChart, setShowChart] = useState(false); // Start closed
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [storyModeInternal, setStoryModeInternal] = useState(false);
  const [storyBeatsInternal, setStoryBeatsInternal] = useState<StoryBeat[]>([]);
  const beatPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBeatFeedbackRef = useRef<string | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<'forecast' | 'best' | 'worst'>('forecast');
  const [qualityMode, setQualityMode] = useState<'balanced' | 'high'>('balanced');
  const [panelPosition, setPanelPosition] = useState({ x: 20, y: 80 }); // Will be set correctly on mount
  const [beatFeedbackEnabled, setBeatFeedbackEnabled] = useState(false);
  const scenarioDisabled = true;
  
  // Helper function to calculate optimal panel position
  const getDefaultPanelPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: 20, y: 80 };
    }
    
    // Smart positioning: Top-right corner, avoiding sidebars
    // Left panel is 288px wide, right panel is 320px wide
    const baseLeftMargin = isLeftPanelOpen ? 304 : 20; // Clear of left panel when open
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
  const glowAnimationFrameRef = useRef<number | undefined>(undefined);
  const glowPhase = useRef<number>(0);
  const isPlayingSyncRef = useRef(false);
  const isExternalIndexSyncRef = useRef(false);
  const lastExternalIndexRef = useRef<number | null>(null);
  const lastReportedIndexRef = useRef<number | null>(null);
  const onCurrentIndexChangeRef = useRef<typeof onCurrentIndexChange>(onCurrentIndexChange);
  const onTimestepChangeRef = useRef<typeof onTimestepChange>(onTimestepChange);
  const audioContextRef = useRef<AudioContext | null>(null);
  const styleDataTimeoutRef = useRef<number | null>(null);
  const lastNotifiedRef = useRef<{ category: number; index: number } | null>(null);
  const storyModeEnabled = typeof storyModeProp === "boolean" ? storyModeProp : storyModeInternal;
  const storyBeats = storyBeatsProp ?? storyBeatsInternal;
  const currentIndexRef = useRef(0);
  const displayedPositionRef = useRef<[number, number] | null>(null);
  const isPlayingRef = useRef(false);
  
  // Particle system refs
  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    opacity: number;
  }
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (typeof isPlayingExternal !== "boolean") return;
    if (isPlayingExternal === isPlaying) return;
    isPlayingSyncRef.current = true;
    setIsPlaying(isPlayingExternal);
  }, [isPlayingExternal]); // Only watch external prop, not internal state

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    onCurrentIndexChangeRef.current = onCurrentIndexChange;
  }, [onCurrentIndexChange]);

  useEffect(() => {
    onTimestepChangeRef.current = onTimestepChange;
  }, [onTimestepChange]);

  useEffect(() => {
    if (typeof currentIndexExternal !== "number") return;
    if (!Number.isFinite(currentIndexExternal)) return;
    const maxIndex = Math.max(0, (forecastTrack?.length ?? 1) - 1);
    const nextIndex = Math.max(0, Math.min(currentIndexExternal, maxIndex));
    if (nextIndex === currentIndexRef.current) return;
    if (lastExternalIndexRef.current === nextIndex) return;
    lastExternalIndexRef.current = nextIndex;
    isExternalIndexSyncRef.current = true;
    setCurrentIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  }, [currentIndexExternal, forecastTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const activeQuality = QUALITY_SETTINGS[qualityMode];

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

  const playBeatTick = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined);
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      oscillator.stop(ctx.currentTime + 0.09);
      oscillator.onended = () => {
        gain.disconnect();
        oscillator.disconnect();
      };
    } catch (e) {
      // Ignore audio errors in restricted environments
    }
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
  const geometriesCache = useRef<Map<number, {
    gale: [number, number][];
    storm: [number, number][];
    hurricane: [number, number][];
    uncertainty: [number, number][];
    eye: [number, number][]; // Eye of the storm
    oci: [number, number][]; // Outermost closed isobar circulation
  }>>(new Map());

  // Animation interval in milliseconds (base: 1000ms per timestep)
  const ANIMATION_INTERVAL = 1000;

  // Memoize animation interval based on playback speed
  useEffect(() => {
    intervalRef.current = ANIMATION_INTERVAL / playbackSpeed;
  }, [playbackSpeed]);

  // Pre-compute all geometries on initial load for performance
  useEffect(() => {
    if (!forecastTrack || forecastTrack.length === 0) return;

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
        const lon = center[0] + radiusDeg * Math.sin(bearing) / Math.cos(center[1] * Math.PI / 180);
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
        const lon = center[0] + radiusDeg * Math.sin(angle) / Math.cos(center[1] * Math.PI / 180);
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
        uncertainty: createUncertaintyCone(
          [point.longitude, point.latitude],
          point.uncertainty
        ),
        eye: point.eyeRadius > 0 ? createCircle(
          [point.longitude, point.latitude],
          point.eyeRadius
        ) : [],
        oci: point.radiusOCI > 0 ? createCircle(
          [point.longitude, point.latitude],
          point.radiusOCI
        ) : [],
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
    console.log(`✅ Pre-computed geometries for ${forecastTrack.length} timesteps`);

    // Cleanup: Clear cache when forecast changes
    return () => {
      geometriesCache.current.clear();
    };
  }, [forecastTrack]);

  // Notify parent of timestep changes
  useEffect(() => {
    if (isExternalIndexSyncRef.current) {
      isExternalIndexSyncRef.current = false;
      lastReportedIndexRef.current = currentIndex;
    } else if (typeof onCurrentIndexChangeRef.current === "function") {
      if (lastReportedIndexRef.current === currentIndex) return;
      lastReportedIndexRef.current = currentIndex;
      onCurrentIndexChangeRef.current(currentIndex);
    }
    const onTimestepChangeHandler = onTimestepChangeRef.current;
    if (!forecastTrack || !onTimestepChangeHandler) return;
    
    const currentPoint = forecastTrack[currentIndex];
    onTimestepChangeHandler(currentPoint || null, currentIndex, forecastTrack.length);
  }, [currentIndex, forecastTrack]);

  // Detect story beats when forecast track changes (only if not externally provided)
  useEffect(() => {
    if (storyBeatsProp) return;
    if (!forecastTrack || forecastTrack.length === 0) {
      setStoryBeatsInternal([]);
      return;
    }
    
    const beats = detectStoryBeats(forecastTrack);
    setStoryBeatsInternal(beats);
    console.log(`✨ Detected ${beats.length} story beats:`, beats);
  }, [forecastTrack, storyBeatsProp]);

  // Initialize panel position on mount
  useEffect(() => {
    const initialPosition = getDefaultPanelPosition();
    setPanelPosition(clampPanelPosition(initialPosition.x, initialPosition.y));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reposition when sidebars open/close (only if user hasn't manually moved it)
  useEffect(() => {
    if (!userHasManuallyPositioned) {
      const newPosition = getDefaultPanelPosition();
      setPanelPosition(clampPanelPosition(newPosition.x, newPosition.y));
    }
  }, [isLeftPanelOpen, isRightPanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-minimize on small screens for better cartographic clarity
  useEffect(() => {
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 768; // Tablet breakpoint
      const isVerySmallScreen = window.innerWidth < 640; // Mobile breakpoint
      
      // Auto-minimize on small screens unless user explicitly expanded
      if (isSmallScreen && !isMinimized) {
        setIsMinimized(true);
        console.log('📱 Auto-minimized cyclone panel for small screen');
      }
      
      // Adjust quality mode for performance on small screens
      if (isVerySmallScreen && qualityMode === 'high') {
        setQualityMode('balanced');
        console.log('⚡ Switched to balanced quality for mobile performance');
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

  // Auto-pause at beats when in story mode and playing
  useEffect(() => {
    if (!storyModeEnabled || !forecastTrack) return;

    const currentBeat = isAtBeat(storyBeats, currentIndex);
    if (!currentBeat || !isPlayingRef.current) return;

    // Pause briefly at beat
    setIsPlaying(false);
    if (beatPauseTimeoutRef.current) {
      clearTimeout(beatPauseTimeoutRef.current);
    }
    beatPauseTimeoutRef.current = setTimeout(() => {
      setIsPlaying(true);
    }, 800); // 0.8s pause

    return () => {
      if (beatPauseTimeoutRef.current) {
        clearTimeout(beatPauseTimeoutRef.current);
        beatPauseTimeoutRef.current = null;
      }
    };
  }, [currentIndex, storyModeEnabled, storyBeats, forecastTrack]);

  // Optional beat feedback (audio + haptics)
  useEffect(() => {
    if (!beatFeedbackEnabled || !forecastTrack) return;
    const beat = isAtBeat(storyBeats, currentIndex);
    if (!beat) {
      lastBeatFeedbackRef.current = null;
      return;
    }
    if (lastBeatFeedbackRef.current === beat.id) return;
    lastBeatFeedbackRef.current = beat.id;
    playBeatTick();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as any).vibrate?.(15);
    }
  }, [beatFeedbackEnabled, currentIndex, storyBeats, forecastTrack, playBeatTick]);

  // Wind Field Glow & Particle Flow Effect
  useEffect(() => {
    if (!map || !forecastTrack || !windGlowCanvasRef.current) return;
    
    const canvas = windGlowCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const MAX_PARTICLES = activeQuality.maxParticles;
    const PARTICLE_SPAWN_RATE = activeQuality.spawnRate; // particles per frame when playing
    
    // Initialize particle pool
    const initializeParticles = (count: number) => {
      const currentPoint = forecastTrack[currentIndex];
      const displayPosition = displayedPositionRef.current ?? [currentPoint.longitude, currentPoint.latitude];
      const cyclonePos = map.project(displayPosition);
      const avgGaleRadius = (currentPoint.galeRadiusNE + currentPoint.galeRadiusSE + 
                            currentPoint.galeRadiusSW + currentPoint.galeRadiusNW) / 4;
      const radiusPixels = (avgGaleRadius / 111) * map.getZoom() * 15;
      
      for (let i = 0; i < count; i++) {
        // Spawn within gale radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radiusPixels;
        
        particlesRef.current.push({
          x: cyclonePos.x + Math.cos(angle) * distance,
          y: cyclonePos.y + Math.sin(angle) * distance,
          vx: 0,
          vy: 0,
          life: Math.random() * 100,
          maxLife: 100 + Math.random() * 50,
          opacity: 1.0,
        });
      }
      
      // Limit pool size
      if (particlesRef.current.length > MAX_PARTICLES) {
        particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES);
      }
    };
    
    const updateParticles = () => {
      const currentPoint = forecastTrack[currentIndex];
      const displayPosition = displayedPositionRef.current ?? [currentPoint.longitude, currentPoint.latitude];
      const cyclonePos = map.project(displayPosition);
      const avgGaleRadius = (currentPoint.galeRadiusNE + currentPoint.galeRadiusSE + 
                            currentPoint.galeRadiusSW + currentPoint.galeRadiusNW) / 4;
      const radiusPixels = (avgGaleRadius / 111) * map.getZoom() * 15;
      
      particlesRef.current = particlesRef.current.filter(particle => {
        // Age particle
        particle.life += 1;
        if (particle.life > particle.maxLife) return false;
        
        // Calculate distance and angle from cyclone center
        const dx = particle.x - cyclonePos.x;
        const dy = particle.y - cyclonePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Don't update particles too far from center
        if (distance > radiusPixels * 1.5) return false;
        
        // Tangential swirl velocity (counter-clockwise in northern hemisphere)
        const angle = Math.atan2(dy, dx);
        const swirlAngle = angle + Math.PI / 2;
        const swirlSpeed = (currentPoint.meanWind / 100) * 2;
        
        // Add radial wobble
        const radialSpeed = Math.sin(particle.life * 0.1) * 0.5;
        
        particle.vx = Math.cos(swirlAngle) * swirlSpeed + Math.cos(angle) * radialSpeed;
        particle.vy = Math.sin(swirlAngle) * swirlSpeed + Math.sin(angle) * radialSpeed;
        
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Fade out near end of life (slower fade)
        particle.opacity = Math.min(1, (particle.maxLife - particle.life) / 20);
        
        return true;
      });
    };
    
    const drawWindGlow = () => {
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
      const displayPosition = displayedPositionRef.current ?? [currentPoint.longitude, currentPoint.latitude];
      const cyclonePos = map.project(displayPosition);
      
      // Don't draw if cyclone is off-screen
      if (cyclonePos.x < -200 || cyclonePos.x > width + 200 || 
          cyclonePos.y < -200 || cyclonePos.y > height + 200) {
        return;
      }
      
      // Get category color with adjusted opacity
      const categoryColors = {
        5: 'rgba(139, 0, 0, 0.4)',    // Dark red for Cat 5
        4: 'rgba(255, 0, 0, 0.35)',    // Red for Cat 4
        3: 'rgba(255, 102, 0, 0.3)',   // Orange for Cat 3
        2: 'rgba(255, 165, 0, 0.25)',  // Light orange for Cat 2
        1: 'rgba(255, 215, 0, 0.2)',   // Gold for Cat 1
        0: 'rgba(59, 130, 246, 0.15)', // Blue for tropical depression
      };
      const color = categoryColors[currentPoint.category as keyof typeof categoryColors] || categoryColors[0];
      
      // Parse RGB from color for particles
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const particleColor = rgbMatch ? [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])] : [59, 130, 246];
      
      // Calculate radius based on gale radius (average of quadrants)
      const avgGaleRadius = (currentPoint.galeRadiusNE + currentPoint.galeRadiusSE + 
                            currentPoint.galeRadiusSW + currentPoint.galeRadiusNW) / 4;
      const radiusPixels = (avgGaleRadius / 111) * map.getZoom() * 15; // Approximate conversion
      
      // Increment phase for rotation animation
      glowPhase.current += 0.005;
      const phase = glowPhase.current;
      
      // Draw three concentric gradient rings
      for (let ring = 0; ring < activeQuality.glowRings; ring++) {
        const ringRadius = radiusPixels * (1 + ring * 0.5);
        const gradient = ctx.createRadialGradient(
          cyclonePos.x, cyclonePos.y, 0,
          cyclonePos.x, cyclonePos.y, ringRadius
        );
        
        // Adjust opacity based on ring (inner is stronger)
        const baseOpacity = activeQuality.glowOpacity[ring] ?? 0.12;
        const colorWithOpacity = color.replace(/[\d.]+\)$/, `${baseOpacity})`);
        
        gradient.addColorStop(0, colorWithOpacity);
        gradient.addColorStop(0.6, color.replace(/[\d.]+\)$/, `${baseOpacity * 0.3})`));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        
        // Apply subtle rotation using noise pattern
        ctx.save();
        ctx.translate(cyclonePos.x, cyclonePos.y);
        ctx.rotate(phase + ring * Math.PI / 3);
        ctx.translate(-cyclonePos.x, -cyclonePos.y);
        
        ctx.beginPath();
        ctx.arc(cyclonePos.x, cyclonePos.y, ringRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
      }
      
      // Draw particles with glow
      particlesRef.current.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        
        // Add glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, ${particle.opacity * 0.8})`;
        
        ctx.strokeStyle = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, ${particle.opacity})`;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        
        // Draw particle as a longer streak
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 5, particle.y - particle.vy * 5);
        ctx.stroke();
        
        // Draw bright core
        ctx.shadowBlur = 4;
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 1.5, 0, Math.PI * 2);
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
    
    // Redraw on map move/zoom
    const handleMapChange = () => {
      drawWindGlow();
    };
    map.on('move', handleMapChange);
    map.on('zoom', handleMapChange);
    map.on('resize', handleMapChange);
    
    // Animate rotation and particles when playing
    let animationId: number;
    if (isPlaying) {
      const animate = () => {
        // Spawn new particles
        if (particlesRef.current.length < MAX_PARTICLES) {
          initializeParticles(PARTICLE_SPAWN_RATE);
        }
        
        // Update particle positions
        updateParticles();
        
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
  }, [map, forecastTrack, currentIndex, isPlaying, activeQuality]);

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
        map.addSource('cyclone-forecast-track', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: forecastTrack.map(p => [p.longitude, p.latitude]),
            },
          },
        });

        // Add track line
        map.addLayer({
          id: 'cyclone-forecast-track-line',
          type: 'line',
          source: 'cyclone-forecast-track',
          paint: {
            'line-color': '#9333ea',
            'line-width': 3,
            'line-dasharray': [4, 3],
          },
        }, beforeId);

        // Add forecast points
        map.addLayer({
          id: 'cyclone-forecast-points',
          type: 'circle',
          source: 'cyclone-forecast-track',
          paint: {
            'circle-radius': 4,
            'circle-color': '#666',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        }, beforeId);
      }

      // Add OCI (Outermost Closed Isobar) circulation layer
      if (!map.getSource('cyclone-oci')) {
        map.addSource('cyclone-oci', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-oci-layer',
          type: 'line',
          source: 'cyclone-oci',
          paint: {
            'line-color': '#94a3b8',
            'line-width': 1.5,
            'line-dasharray': [8, 4],
            'line-opacity': 0.4,
          },
        }, beforeId);
      }

      // Add wind radii sources
      if (!map.getSource('cyclone-gale-radius')) {
        map.addSource('cyclone-gale-radius', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-gale-radius-layer',
          type: 'fill',
          source: 'cyclone-gale-radius',
          paint: {
            'fill-color': '#FFD700',
            'fill-opacity': 0.25,
          },
        }, beforeId);
        map.addLayer({
          id: 'cyclone-gale-radius-outline',
          type: 'line',
          source: 'cyclone-gale-radius',
          paint: {
            'line-color': '#FFD700',
            'line-width': 3,
            'line-opacity': 0.8,
          },
        }, beforeId);
      }

      if (!map.getSource('cyclone-storm-radius')) {
        map.addSource('cyclone-storm-radius', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-storm-radius-layer',
          type: 'fill',
          source: 'cyclone-storm-radius',
          paint: {
            'fill-color': '#FFA500',
            'fill-opacity': 0.3,
          },
        }, beforeId);
        map.addLayer({
          id: 'cyclone-storm-radius-outline',
          type: 'line',
          source: 'cyclone-storm-radius',
          paint: {
            'line-color': '#FFA500',
            'line-width': 3,
            'line-opacity': 0.85,
          },
        }, beforeId);
      }

      if (!map.getSource('cyclone-hurricane-radius')) {
        map.addSource('cyclone-hurricane-radius', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-hurricane-radius-layer',
          type: 'fill',
          source: 'cyclone-hurricane-radius',
          paint: {
            'fill-color': '#FF0000',
            'fill-opacity': 0.3,
          },
        }, beforeId);
        map.addLayer({
          id: 'cyclone-hurricane-radius-outline',
          type: 'line',
          source: 'cyclone-hurricane-radius',
          paint: {
            'line-color': '#FF0000',
            'line-width': 3,
            'line-opacity': 0.9,
          },
        }, beforeId);
      }

      // Add eye layer (calm center)
      if (!map.getSource('cyclone-eye')) {
        map.addSource('cyclone-eye', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-eye-layer',
          type: 'fill',
          source: 'cyclone-eye',
          paint: {
            'fill-color': '#1e293b',
            'fill-opacity': 0.7,
          },
        }, beforeId);
        map.addLayer({
          id: 'cyclone-eye-outline',
          type: 'line',
          source: 'cyclone-eye',
          paint: {
            'line-color': '#64748b',
            'line-width': 2,
          },
        }, beforeId);
      }

      // Add uncertainty cone source
      if (!map.getSource('cyclone-uncertainty')) {
        map.addSource('cyclone-uncertainty', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'cyclone-uncertainty-layer',
          type: 'fill',
          source: 'cyclone-uncertainty',
          paint: {
            'fill-color': '#888888',
            'fill-opacity': 0.15,
          },
        }, beforeId);
        map.addLayer({
          id: 'cyclone-uncertainty-outline',
          type: 'line',
          source: 'cyclone-uncertainty',
          paint: {
            'line-color': '#666666',
            'line-width': 2,
            'line-dasharray': [4, 4],
            'line-opacity': 0.5,
          },
        }, beforeId);
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
      // Cleanup layers on unmount
      try {
        const layers = [
          'cyclone-forecast-track-line',
          'cyclone-forecast-points',
          'cyclone-oci-layer',
          'cyclone-gale-radius-layer',
          'cyclone-gale-radius-outline',
          'cyclone-storm-radius-layer',
          'cyclone-storm-radius-outline',
          'cyclone-hurricane-radius-layer',
          'cyclone-hurricane-radius-outline',
          'cyclone-eye-layer',
          'cyclone-eye-outline',
          'cyclone-uncertainty-layer',
          'cyclone-uncertainty-outline'
        ];
        
        const sources = [
          'cyclone-forecast-track',
          'cyclone-oci',
          'cyclone-gale-radius',
          'cyclone-storm-radius',
          'cyclone-hurricane-radius',
          'cyclone-eye',
          'cyclone-uncertainty'
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
      } catch (e) {
        console.warn('Cleanup error:', e);
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

  // Update visualization for current timestep
  useEffect(() => {
    if (!map || !forecastTrack || forecastTrack.length === 0) return;

    const point = forecastTrack[currentIndex];
    if (!point) return;

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
      const spiralColor = point.category >= 4 ? 'rgba(255, 255, 255, 0.9)' : 
                         point.category >= 2 ? 'rgba(255, 255, 255, 0.85)' : 
                         'rgba(255, 255, 255, 0.75)';
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
      
      // Update popup content
      const popup = markerRef.current.getPopup();
      if (popup) {
        popup.setHTML(`
          <div style="font-size: 11px; min-width: 180px;">
            <strong style="font-size: 12px; color: ${categoryColor};">${getCategoryLabel(point.category)}</strong><br/>
            <strong>Time:</strong> ${new Date(point.time).toLocaleString()}<br/>
            <strong>Wind:</strong> ${point.meanWind.toFixed(0)} kt (Gust: ${point.windGust.toFixed(0)} kt)<br/>
            <strong>Pressure:</strong> ${point.pressure.toFixed(0)} hPa<br/>
            <strong>Position:</strong> ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°
          </div>
        `);
      }
    } else {
      const el = document.createElement('div');
      el.className = 'cyclone-marker';
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = getCategoryColor(point.category);
      el.style.border = '4px solid white';
      el.style.boxShadow = '0 0 20px rgba(0,0,0,0.6), 0 0 40px ' + getCategoryColor(point.category) + '60';
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
      const spiralColor = point.category >= 4 ? 'rgba(255, 255, 255, 0.9)' : 
                         point.category >= 2 ? 'rgba(255, 255, 255, 0.85)' : 
                         'rgba(255, 255, 255, 0.75)';
      
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

      
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div style="font-size: 11px; min-width: 180px;">
              <strong style="font-size: 12px; color: ${getCategoryColor(point.category)};">${getCategoryLabel(point.category)}</strong><br/>
              <strong>Time:</strong> ${new Date(point.time).toLocaleString()}<br/>
              <strong>Wind:</strong> ${point.meanWind.toFixed(0)} kt (Gust: ${point.windGust.toFixed(0)} kt)<br/>
              <strong>Pressure:</strong> ${point.pressure.toFixed(0)} hPa<br/>
              <strong>Position:</strong> ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°
            </div>
          `)
        )
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
    const trailIndices = Array.from({ length: Math.min(trailLength, currentIndex) }, 
      (_, i) => currentIndex - i - 1).filter(idx => idx >= 0);

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
      const size = 20 - (i * 4); // Decreasing size
      const opacity = Math.max(0.1, 0.4 - (i * 0.1)); // Decreasing opacity
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
    } catch (error) {
      console.warn('Error updating cyclone geometry:', error);
      // Don't throw, allow animation to continue
    }
  }, [map, forecastTrack, currentIndex, isPlaying, notificationsEnabled, activeQuality]);

  // Check notification rules
  const checkNotifications = useCallback((point: CycloneForecastPoint, index: number) => {
    // Show browser notification for high-intensity cyclones
    if ('Notification' in window && Notification.permission === 'granted') {
      const last = lastNotifiedRef.current;
      if (point.category < 4) {
        lastNotifiedRef.current = { category: point.category, index };
        return;
      }
      const shouldNotify = !last || last.category < 4 || point.category > last.category || last.index !== index;
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

  // Controls should ALWAYS be docked when a container is provided or when explicitly requested
  // Never show floating controls on the map - they belong in the Summary panel
  const isDocked = alwaysDocked || !!controlsContainer;

  // Animation loop with frame skipping for performance
  // Also stop animation when controls are hidden (isDocked but no container = panel closed)
  useEffect(() => {
    if (!isPlaying || !forecastTrack || forecastTrack.length === 0) {
      lastUpdateRef.current = 0;
      return;
    }

    // Pause when docked controls are hidden (no container and no floating fallback)
    if (isDocked && !controlsContainer && !uiVisible) {
      lastUpdateRef.current = 0;
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastUpdateRef.current) {
        lastUpdateRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateRef.current;
      const interval = intervalRef.current; // Use memoized interval

      const baseIndex = currentIndexRef.current;
      const nextIndex = Math.min(baseIndex + 1, forecastTrack.length - 1);
      const basePoint = forecastTrack[baseIndex];
      const nextPoint = forecastTrack[nextIndex];
      if (markerRef.current && basePoint && nextPoint) {
        const progress = Math.min(elapsed / interval, 1);
        const lng = basePoint.longitude + (nextPoint.longitude - basePoint.longitude) * progress;
        const lat = basePoint.latitude + (nextPoint.latitude - basePoint.latitude) * progress;
        displayedPositionRef.current = [lng, lat];
        markerRef.current.setLngLat([lng, lat]);
      }

      if (elapsed > interval) {
        // Frame skipping: if we're falling behind, skip frames
        const framesToAdvance = elapsed > interval * 2 
          ? Math.floor(elapsed / interval) 
          : 1;
        
        lastUpdateRef.current = timestamp - (elapsed % interval); // Maintain timing accuracy
        
        setCurrentIndex((prev) => {
          const nextIndex = prev + framesToAdvance;
          if (nextIndex >= forecastTrack.length) {
            // Stop at the end instead of looping
            setIsPlaying(false);
            return forecastTrack.length - 1;
          }
          return nextIndex;
        });
      }

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    lastUpdateRef.current = 0; // Reset timestamp on play start
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      lastUpdateRef.current = 0;
    };
  }, [isPlaying, playbackSpeed, forecastTrack, isDocked, controlsContainer, uiVisible]);

  // Notify parent when playing state changes
  useEffect(() => {
    if (isPlayingSyncRef.current) {
      isPlayingSyncRef.current = false;
      return;
    }
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const toggleChart = useCallback(() => {
    setShowChart((prev) => {
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
      setIsPlaying(false);
    }
  }, [storyModeEnabled, onStoryModeChange]);

  useEffect(() => {
    if (storyModeEnabled) {
      setIsMinimized(false);
      if (isPlaying) setIsPlaying(false);
    }
  }, [storyModeEnabled, isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || !uiVisible) return;
      
      switch(e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          setCurrentIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          setCurrentIndex(prev => Math.min((forecastTrack?.length ?? 0) - 1, prev + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex((forecastTrack?.length ?? 0) - 1);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, uiVisible, forecastTrack, onClose, handleShare, toggleStoryMode]);

  // Visibility control
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    try {
      const visibility = isVisible ? 'visible' : 'none';
    
    ['cyclone-forecast-track-line', 'cyclone-forecast-points',
     'cyclone-gale-radius-layer', 'cyclone-gale-radius-outline',
     'cyclone-storm-radius-layer', 'cyclone-storm-radius-outline',
     'cyclone-hurricane-radius-layer', 'cyclone-hurricane-radius-outline',
     'cyclone-uncertainty-layer', 'cyclone-uncertainty-outline'
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });

    if (markerRef.current) {
      const el = markerRef.current.getElement();
      el.style.display = isVisible ? 'block' : 'none';
    }
    } catch (error) {
      console.warn('Error updating visibility:', error);
    }
  }, [map, isVisible]);

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
        const next = clampPanelPosition(
          e.clientX - dragOffset.x,
          e.clientY - dragOffset.y
        );
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
  const currentPoint = hasForecast ? forecastTrack[currentIndex] : null;
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
  }, [showChart, chartUserPositioned, panelPosition.x, panelPosition.y, chartPanelSize.width, chartPanelSize.height, clampChartPosition, hasForecast]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (isChartDragging) {
        const nextX = event.clientX - chartDragOffset.x;
        const nextY = event.clientY - chartDragOffset.y;
        const clamped = clampChartPosition(nextX, nextY, chartPanelSize.width, chartPanelSize.height);
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
  }, [isChartDragging, isChartResizing, chartDragOffset.x, chartDragOffset.y, chartResizeOrigin.x, chartResizeOrigin.y, chartResizeOrigin.width, chartResizeOrigin.height, chartPanelSize.width, chartPanelSize.height, chartPanelPosition.x, chartPanelPosition.y, clampChartPosition]);

  useEffect(() => {
    const handleResize = () => {
      setChartPanelPosition((prev) =>
        clampChartPosition(prev.x, prev.y, chartPanelSize.width, chartPanelSize.height)
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chartPanelSize.width, chartPanelSize.height, clampChartPosition]);

  const mainControls = (
    <div
      ref={panelRef}
      className={`${
        isDocked
          ? 'relative w-full'
          : `absolute z-[90] pointer-events-auto transition-all duration-150 ${
              isMinimized ? 'w-auto' : 'w-[min(520px,calc(100vw-40px))] sm:w-[min(520px,calc(100vw-64px))]'
            }`
      }`}
      style={isDocked ? {
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(148, 163, 184, 0.2)',
        fontSize: '12px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      } : {
        left: `${panelPosition.x}px`,
        top: `${panelPosition.y}px`,
        background: 'rgba(15, 23, 42, 0.96)', // Darker, more opaque for better visibility
        backdropFilter: 'blur(16px)',
        borderRadius: isMinimized ? '8px' : '12px',
        padding: isMinimized ? '8px 12px' : 'clamp(10px, 2vw, 14px) clamp(14px, 3vw, 18px)',
        boxShadow: isDragging 
          ? '0 12px 40px rgba(0,0,0,0.8), 0 0 0 2px rgba(59, 130, 246, 0.5)' 
          : '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(148, 163, 184, 0.3)', // Visible border
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease, border-color 0.2s',
        userSelect: 'none',
        maxHeight: 'calc(100vh - 120px)', // More conservative height
        overflow: 'auto', // Changed from visible to auto to handle content overflow
        fontSize: 'clamp(11px, 1.5vw, 13px)', // Slightly larger for readability
        border: '1px solid rgba(148, 163, 184, 0.2)', // Explicit border for visibility
      }}
      onMouseDown={isDocked ? undefined : handleMouseDown}
    >
    {!isDocked && (
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-slate-400 rounded-full opacity-70 pointer-events-none shadow-lg" />
    )}
    
    {/* Header with Controls */}
    <div className="flex items-center justify-between mb-3" style={{ cursor: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 flex-1">
        <Timer size={16} className="text-blue-400" />
        {!isMinimized && currentPoint && (
          <>
            <span className="text-white text-xs font-medium">
              {new Date(currentPoint.time).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getCategoryColor(currentPoint.category) }}
              />
              <span className="text-white text-xs font-medium">
                {getCategoryLabel(currentPoint.category)}
              </span>
            </div>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={toggleChart}
          className={`p-1 sm:p-1.5 rounded transition-colors ${
            showChart ? 'bg-blue-600 text-white' : 'bg-slate-700/60 hover:bg-slate-600/70 text-white'
          }`}
          title="Toggle intensity chart (C)"
          aria-label={showChart ? "Hide intensity chart" : "Show intensity chart"}
          aria-pressed={showChart}
        >
          <BarChart3 size={13} className="sm:w-3.5 sm:h-3.5" />
        </button>
        <button
          onClick={toggleStoryMode}
          className={`p-1 sm:p-1.5 rounded transition-colors ${
            storyModeEnabled ? 'bg-blue-600 text-white' : 'bg-slate-700/60 hover:bg-slate-600/70 text-white'
          }`}
          title={`${storyModeEnabled ? 'Disable' : 'Enable'} story mode - Navigate key cyclone moments (B)`}
          aria-label={storyModeEnabled ? 'Disable story mode' : 'Enable story mode'}
          aria-pressed={storyModeEnabled}
        >
          <Book size={13} className="sm:w-3.5 sm:h-3.5" />
        </button>
        <button
          onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          className={`p-1 sm:p-1.5 rounded transition-colors ${
            notificationsEnabled ? 'bg-blue-600 text-white' : 'bg-slate-700/60 hover:bg-slate-600/70 text-white'
          }`}
          title={notificationsEnabled ? 'Disable notifications (N)' : 'Enable notifications (N)'}
          aria-label={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
          aria-pressed={notificationsEnabled}
        >
          {notificationsEnabled ? <Bell size={13} className="sm:w-3.5 sm:h-3.5" /> : <BellOff size={13} className="sm:w-3.5 sm:h-3.5" />}
        </button>
        <button
          onClick={handleShare}
          className="p-1 sm:p-1.5 rounded bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors"
          title="Share current timestep (S)"
          aria-label="Share current timestep"
        >
          <Share2 size={13} className="sm:w-3.5 sm:h-3.5" />
        </button>
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="p-1 sm:p-1.5 rounded bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors"
          title="Toggle legend (I)"
          aria-label={showLegend ? 'Hide legend' : 'Show legend'}
          aria-pressed={showLegend}
        >
          <Layers size={13} className="sm:w-3.5 sm:h-3.5" />
        </button>
        {!isDocked && (
          <button
            onClick={() => {
              const next = getDefaultPanelPosition();
              const clamped = clampPanelPosition(next.x, next.y);
              setPanelPosition(clamped);
              setUserHasManuallyPositioned(false); // Re-enable auto-positioning
            }}
            className="p-1 sm:p-1.5 rounded bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors"
            title="Reset panel position"
            aria-label="Reset panel position"
          >
            <RotateCcw size={13} className="sm:w-3.5 sm:h-3.5" />
          </button>
        )}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 sm:p-1.5 rounded bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors"
          title={isMinimized ? 'Expand (M)' : 'Minimize (M)'}
          aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
          aria-pressed={!isMinimized}
        >
          {isMinimized ? <Maximize2 size={13} className="sm:w-3.5 sm:h-3.5" /> : <Minimize2 size={13} className="sm:w-3.5 sm:h-3.5" />}
        </button>
        {onClose && !isDocked && (
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors"
            title="Close (Esc)"
            aria-label="Close panel"
          >
            <X size={13} className="sm:w-3.5 sm:h-3.5" />
          </button>
        )}
      </div>
    </div>

    {/* Expanded Content */}
    {!isMinimized && (
      <div onMouseDown={(e) => e.stopPropagation()}>
        {/* Scenario Toggle - Enhanced visibility */}
        <div className="flex items-center gap-2 mb-3 px-2 py-2 bg-slate-800/40 rounded-lg border border-slate-700/30">
          <Layers size={13} className="text-blue-400" />
          <span className="text-white text-xs font-semibold">Scenario:</span>
          {(['forecast', 'best', 'worst'] as const).map((scenario) => (
            <button
              key={scenario}
              type="button"
              disabled={scenarioDisabled}
              onClick={() => {
                if (scenarioDisabled) return;
                setCurrentScenario(scenario);
              }}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                currentScenario === scenario
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/70 text-slate-300'
              } ${scenarioDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600/70'}`}
              aria-disabled={scenarioDisabled}
              title={scenarioDisabled ? 'Scenario data not available yet' : `${scenario.charAt(0).toUpperCase() + scenario.slice(1)} scenario`}
            >
              {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
            </button>
          ))}
          {currentScenario !== 'forecast' && (
            <span className="text-xs text-yellow-400 ml-1">Simulated</span>
          )}
        </div>
        {/* Primary Intensity Metrics - Enhanced visibility */}
        {currentPoint && (
        <div className="flex justify-between items-center mb-2 px-2 py-2 bg-slate-800/40 rounded-lg border border-slate-700/30">
          <div className="text-white text-xs">
            <span className="text-slate-300">Wind:</span> <span className="font-bold text-cyan-400">{currentPoint.meanWind.toFixed(0)} kt</span>
          </div>
          <div className="text-white text-xs">
            <span className="text-slate-300">Gust:</span> <span className="font-bold text-orange-400">{currentPoint.windGust.toFixed(0)} kt</span>
          </div>
          <div className="text-white text-xs">
            <span className="text-slate-300">Pressure:</span> <span className="font-bold text-blue-400">{currentPoint.pressure.toFixed(0)} hPa</span>
          </div>
        </div>
        )}

        {/* Enhanced Metrics Grid */}
        {currentPoint && (
        <div className="grid grid-cols-2 gap-2 mb-3 px-2 text-xs">
          {/* Dvorak T-Number (Professional Intensity) */}
          {currentPoint.dvorakTNumber > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">Dvorak T:</span>
              <span className="text-amber-400 font-semibold ml-1">{currentPoint.dvorakTNumber.toFixed(1)}</span>
            </div>
          )}
          
          {/* Eye Radius */}
          {currentPoint.eyeRadius > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">Eye:</span>
              <span className="text-cyan-400 font-semibold ml-1">{currentPoint.eyeRadius.toFixed(0)} km</span>
              {currentPoint.eyeRadiusUncertainty > 0 && (
                <span className="text-slate-500 text-xs ml-0.5">±{currentPoint.eyeRadiusUncertainty.toFixed(0)}</span>
              )}
            </div>
          )}
          
          {/* Vertical Extent */}
          {currentPoint.verticalExtent > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">Vert Ext:</span>
              <span className="text-blue-400 font-semibold ml-1">{currentPoint.verticalExtent.toFixed(1)}</span>
            </div>
          )}
          
          {/* OCI Circulation Extent */}
          {currentPoint.radiusOCI > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">OCI Radius:</span>
              <span className="text-blue-400 font-semibold ml-1">{currentPoint.radiusOCI.toFixed(0)} km</span>
            </div>
          )}
          
          {/* P5Wind Alternative Metric */}
          {currentPoint.p5Wind > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">P5 Wind:</span>
              <span className="text-green-400 font-semibold ml-1">{currentPoint.p5Wind.toFixed(0)} kt</span>
            </div>
          )}
          
          {/* Current Intensity */}
          {currentPoint.currentIntensity > 0 && (
            <div className="bg-slate-800/60 rounded px-2 py-1">
              <span className="text-slate-400">Intensity:</span>
              <span className="text-orange-400 font-semibold ml-1">{currentPoint.currentIntensity.toFixed(1)}</span>
            </div>
          )}
        </div>
        )}

        {/* Timeline Scrubber with Beat Markers */}
        {forecastTrack && (
        <div className="mb-3">
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
              onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-600/70 rounded-lg appearance-none cursor-pointer relative z-10"
              aria-label="Cyclone animation timeline slider"
              style={{
                background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${progress}%, #4B5563 ${progress}%, #4B5563 100%)`,
              }}
            />
              );
            })()}
            
            {/* Beat Markers */}
            {storyModeEnabled && forecastTrack.length > 1 && storyBeats.map((beat) => {
              const position = (beat.index / (forecastTrack.length - 1)) * 100;
              const beatColor = 
                beat.type === 'peak-intensity' ? '#ef4444' :
                beat.type === 'rapid-intensification' ? '#f59e0b' :
                beat.type === 'category-upgrade' ? '#8b5cf6' :
                beat.type === 'closest-approach' ? '#ec4899' :
                '#6366f1'; // peak-uncertainty
              
              return (
                <button
                  key={beat.id}
                  type="button"
                  className="absolute w-2 h-2 rounded-full border-2 border-white cursor-pointer hover:scale-150 transition-transform"
                  style={{
                    left: `${position}%`,
                    top: '50%',
                    backgroundColor: beatColor,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20,
                  }}
                  title={beat.title}
                  aria-label={`${beat.title} at ${beat.time.toLocaleString()}`}
                  onClick={() => setCurrentIndex(beat.index)}
                />
              );
            })}
          </div>
          
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{new Date(forecastTrack[0].time).toLocaleDateString()}</span>
            <span>
              Step {currentIndex + 1} / {forecastTrack.length}
            </span>
            <span>{new Date(forecastTrack[forecastTrack.length - 1].time).toLocaleDateString()}</span>
          </div>
        </div>
        )}

        {/* Playback Controls */}
        <div className="space-y-2">
          {/* Play/Pause and Navigation */}
          <div className="flex items-center justify-center gap-2">
            {!storyModeEnabled ? (
              <>
                <button
                  onClick={() => setCurrentIndex(0)}
                  className="p-1.5 rounded bg-slate-700/70 hover:bg-slate-600/70 text-white transition-colors"
                  title="Reset to start"
                  aria-label="Reset to start"
                >
                  <SkipBack size={14} />
                </button>
                
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                
                <button
                  onClick={() => forecastTrack && setCurrentIndex(forecastTrack.length - 1)}
                  className="p-1.5 rounded bg-slate-700/70 hover:bg-slate-600/70 text-white transition-colors"
                  title="Skip to end"
                  aria-label="Skip to end"
                >
                  <SkipForward size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    const prevBeat = getPreviousBeat(storyBeats, currentIndex);
                    if (prevBeat) setCurrentIndex(prevBeat.index);
                  }}
                  disabled={!getPreviousBeat(storyBeats, currentIndex)}
                  className="p-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous Beat"
                  aria-label="Previous beat"
                >
                  <ChevronLeft size={14} />
                </button>
                
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                
                <button
                  onClick={() => {
                    const nextBeat = getNextBeat(storyBeats, currentIndex);
                    if (nextBeat) setCurrentIndex(nextBeat.index);
                  }}
                  disabled={!getNextBeat(storyBeats, currentIndex)}
                  className="p-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next Beat"
                  aria-label="Next beat"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>

          {/* Speed Control - Separate Row */}
          <div className="flex items-center justify-center gap-1.5 px-2">
            <span className="text-white text-xs font-medium mr-1">Speed:</span>
            {[0.25, 0.5, 1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 rounded text-xs font-medium min-w-[40px] transition-all ${
                  playbackSpeed === speed
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/50'
                    : 'bg-slate-700/70 text-slate-300 hover:bg-slate-600/70'
                }`}
                title={`${speed}x speed`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        
        {/* Quality Toggle */}
        <div className="flex items-center justify-center gap-2 px-2">
          <span className="text-white text-xs font-medium">Quality:</span>
          {(['balanced', 'high'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setQualityMode(mode)}
              className={`px-2.5 py-1 rounded text-xs min-w-[68px] font-medium transition-all ${
                qualityMode === mode
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/50'
                  : 'bg-slate-700/70 text-slate-300 hover:bg-slate-600/70'
              }`}
              title={`${mode === 'balanced' ? 'Balanced' : 'High'} quality`}
            >
              {mode === 'balanced' ? 'Balanced' : 'High'}
            </button>
          ))}
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400 text-center">
          <div>Space/K: Play • ←→/JL: Step • Home/End: Jump • Drag to move</div>
          <div className="mt-0.5">I: Legend • M: Minimize • C: Chart • B: Story • N: Notify • S: Share</div>
        </div>
      </div>
    )}
    </div>
  );

  const dockedPanels = (
    <div className="space-y-3">
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
            <div className="mb-3 pb-3 border-b border-slate-700">
              <div className="text-xs text-white font-medium mb-2">Cyclone Category</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#8B0000', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 5</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF0000', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 4</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF6600', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 3</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFA500', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 2</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFD700', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 1</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#4169E1', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Tropical Storm</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!hasForecast || !currentPoint) return null;

  return (
    <>
      {/* Wind Field Glow Canvas Overlay */}
      {uiVisible && (
        <canvas
          ref={windGlowCanvasRef}
          className="absolute inset-0 pointer-events-none z-[5] w-full h-full"
          style={{
            mixBlendMode: 'screen',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      )}

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

      {/* Story Beat Moment Card */}
      {uiVisible && storyModeEnabled && showStoryBeatCard && (() => {
        const currentBeat = isAtBeat(storyBeats, currentIndex);
        if (!currentBeat) return null;
        
        const beatColor = 
          currentBeat.type === 'peak-intensity' ? '#ef4444' :
          currentBeat.type === 'rapid-intensification' ? '#f59e0b' :
          currentBeat.type === 'category-upgrade' ? '#8b5cf6' :
          currentBeat.type === 'closest-approach' ? '#ec4899' :
          '#6366f1';
        
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
              <h3 className="text-white text-lg font-bold mb-1">
                {currentBeat.title}
              </h3>
              <p className="text-slate-300 text-sm">
                {currentBeat.description}
              </p>
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
          style={{
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
          }}
        >
          <div
            className="flex items-center justify-between mb-3 cursor-move"
            onMouseDown={(event) => {
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
                onClick={() => setBeatFeedbackEnabled((prev) => !prev)}
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
                onPointClick={setCurrentIndex}
                isPlaying={isPlaying}
                storyBeats={storyBeats}
              />
            )}
          </div>
          <div
            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize"
            onMouseDown={(event) => {
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
            {/* Cyclone Category Scale */}
            <div className="mb-3 pb-3 border-b border-slate-700">
              <div className="text-xs text-white font-medium mb-2">Cyclone Category</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#8B0000', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 5</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF0000', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 4</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF6600', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 3</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFA500', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 2</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFD700', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Category 1</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#4169E1', border: '2px solid white' }}></div>
                  <div className="text-xs text-white">Tropical Storm</div>
                </div>
              </div>
            </div>
            
            <div className="text-xs text-white font-medium mb-2">Wind Radii</div>
            {currentPoint.hurricaneRadiusNE > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FF000040', borderColor: '#FF0000' }}></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Hurricane Force</div>
                  <div className="text-xs text-slate-400">≥64 kt (≥119 km/h)</div>
                </div>
              </div>
            )}
            
            {currentPoint.stormRadiusNE > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FFA50040', borderColor: '#FFA500' }}></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Storm Force</div>
                  <div className="text-xs text-slate-400">48-63 kt (89-118 km/h)</div>
                </div>
              </div>
            )}
            
            {currentPoint.galeRadiusNE > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FFD70040', borderColor: '#FFD700' }}></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Gale Force</div>
                  <div className="text-xs text-slate-400">34-47 kt (63-88 km/h)</div>
                </div>
              </div>
            )}
            
            {currentPoint.uncertainty > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-dashed" style={{ backgroundColor: '#88888820', borderColor: '#666' }}></div>
                <div className="text-xs text-white">
                  <div className="font-medium">Uncertainty Cone</div>
                  <div className="text-xs text-slate-400">Forecast error range</div>
                </div>
              </div>
            )}
            
            <div className="pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 rounded" style={{ backgroundColor: '#9333ea' }}></div>
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
