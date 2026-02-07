'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { Play, Pause, SkipBack, SkipForward, Timer, X, Minimize2, Maximize2, Info, Share2, Bell, BellOff, BarChart3, Layers } from 'lucide-react';
import {
  CycloneForecastPoint,
  getCategoryColor,
  getCategoryLabel,
} from '../utils/cycloneAnimationLoader';
import CycloneIntensityChart from './CycloneIntensityChart';

interface CycloneAnimationLayerProps {
  map: maplibregl.Map;
  forecastTrack: CycloneForecastPoint[] | null;
  isVisible?: boolean;
  onClose?: () => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

interface NotificationRule {
  id: string;
  type: 'category' | 'location';
  value: number | string;
  triggered: boolean;
}

export default function CycloneAnimationLayer({
  map,
  forecastTrack,
  isVisible = true,
  onClose,
  onPlayingChange,
}: CycloneAnimationLayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<'forecast' | 'best' | 'worst'>('forecast');
  const [panelPosition, setPanelPosition] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 500 : 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isLoadingGeometry, setIsLoadingGeometry] = useState(true);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<number>(1000);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const trailMarkersRef = useRef<maplibregl.Marker[]>([]);
  const rotationAngle = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Pre-computed geometries cache
  const geometriesCache = useRef<Map<number, {
    gale: [number, number][];
    storm: [number, number][];
    hurricane: [number, number][];
    uncertainty: [number, number][];
  }>>(new Map());

  // Layer ordering constants for deterministic layer stacking
  const LAYER_ORDER = {
    UNCERTAINTY: 'cyclone-uncertainty-layer',
    GALE_FILL: 'cyclone-gale-radius-layer',
    STORM_FILL: 'cyclone-storm-radius-layer',
    HURRICANE_FILL: 'cyclone-hurricane-radius-layer',
    TRACK: 'cyclone-forecast-track-line',
  };

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
        if (radius === 0) continue;
        
        const radiusKm = radius * 1.852;
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
      });
    });
    
    setIsLoadingGeometry(false);
    console.log(`✅ Pre-computed geometries for ${forecastTrack.length} timesteps`);

    // Cleanup: Clear cache when forecast changes
    return () => {
      geometriesCache.current.clear();
    };
  }, [forecastTrack]);

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
      setTimeout(setupLayers, 100);
    };
    map.on('styledata', handleStyleData);

    return () => {
      // Cleanup layers on unmount
      try {
        const layers = [
          'cyclone-forecast-track-line',
          'cyclone-forecast-points',
          'cyclone-gale-radius-layer',
          'cyclone-gale-radius-outline',
          'cyclone-storm-radius-layer',
          'cyclone-storm-radius-outline',
          'cyclone-hurricane-radius-layer',
          'cyclone-hurricane-radius-outline',
          'cyclone-uncertainty-layer',
          'cyclone-uncertainty-outline'
        ];
        
        const sources = [
          'cyclone-forecast-track',
          'cyclone-gale-radius',
          'cyclone-storm-radius',
          'cyclone-hurricane-radius',
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
      }
      
      if (isPlaying) {
        el.classList.add('cyclone-marker-playing');
      }
      
      // Add realistic rotating cyclone vortex with multiple spiral layers
      const intensity = point.category >= 3 ? 'high' : point.category >= 1 ? 'medium' : 'low';
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
    }

    // Update marker pulse and rotation animation
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      // Use CSS class toggle instead of inline style for better performance
      el.classList.toggle('cyclone-marker-playing', isPlaying);
    }

    // Check notifications
    if (notificationsEnabled && isPlaying) {
      checkNotifications(point);
    }

    // Update animation trail (show last 3-5 positions)
    const trailLength = 3;
    const trailIndices = Array.from({ length: Math.min(trailLength, currentIndex) }, 
      (_, i) => currentIndex - i - 1).filter(idx => idx >= 0);
    
    // Remove old trail markers
    trailMarkersRef.current.forEach(marker => marker.remove());
    trailMarkersRef.current = [];
    
    // Add new trail markers
    trailIndices.forEach((idx, i) => {
      const trailPoint = forecastTrack[idx];
      const trailEl = document.createElement('div');
      trailEl.className = 'cyclone-marker cyclone-trail-marker';
      const size = 20 - (i * 4); // Decreasing size
      const opacity = 0.4 - (i * 0.1); // Decreasing opacity
      trailEl.style.width = `${size}px`;
      trailEl.style.height = `${size}px`;
      trailEl.style.borderRadius = '50%';
      trailEl.style.backgroundColor = getCategoryColor(trailPoint.category);
      trailEl.style.border = '2px solid white';
      trailEl.style.opacity = `${opacity}`;
      
      const trailMarker = new maplibregl.Marker({ element: trailEl })
        .setLngLat([trailPoint.longitude, trailPoint.latitude])
        .addTo(map);
      
      trailMarkersRef.current.push(trailMarker);
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
    } catch (error) {
      console.warn('Error updating cyclone geometry:', error);
      // Don't throw, allow animation to continue
    }
  }, [map, forecastTrack, currentIndex, isPlaying, notificationsEnabled]);

  // Check notification rules
  const checkNotifications = useCallback((point: CycloneForecastPoint) => {
    // Show browser notification for high-intensity cyclones
    if ('Notification' in window && Notification.permission === 'granted') {
      if (point.category >= 4) {
        new Notification('Cyclone Alert', {
          body: `${getCategoryLabel(point.category)} reached at ${new Date(point.time).toLocaleString()}\nWind: ${point.meanWind.toFixed(0)} kt, Pressure: ${point.pressure.toFixed(0)} hPa`,
          icon: '/cyclone-icon.png',
          tag: 'cyclone-alert',
        });
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

    const point = forecastTrack[currentIndex];
    const summary = `🌪️ Cyclone Lola Update\n${getCategoryLabel(point.category)}\n📍 ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°\n💨 Wind: ${point.meanWind.toFixed(0)} kt (Gust: ${point.windGust.toFixed(0)} kt)\n🌡️ Pressure: ${point.pressure.toFixed(0)} hPa\n📅 ${new Date(point.time).toLocaleString()}\n\n#CycloneLola #DisasterPreparedness #WeatherAlert`;

    const shareData = {
      title: 'Cyclone Lola Forecast',
      text: summary,
      url: window.location.href,
    };

    if (navigator.share) {
      navigator.share(shareData).catch((err) => console.log('Share failed:', err));
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(summary).then(() => {
        alert('Cyclone update copied to clipboard!');
      });
    }
  }, [forecastTrack, currentIndex]);

  // Animation loop with frame skipping for performance
  useEffect(() => {
    if (!isPlaying || !forecastTrack || forecastTrack.length === 0) {
      lastUpdateRef.current = 0;
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastUpdateRef.current) {
        lastUpdateRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateRef.current;
      const interval = intervalRef.current; // Use memoized interval

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
  }, [isPlaying, playbackSpeed, forecastTrack]);

  // Notify parent when playing state changes
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;
      
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
          setCurrentIndex(prev => Math.min(forecastTrack?.length ?? 0 - 1, prev + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex(forecastTrack?.length ?? 0 - 1);
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
          setShowChart(prev => !prev);
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
  }, [isVisible, forecastTrack, onClose, handleShare]);

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
        setPanelPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleMouseUp = () => {
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
  }, [isDragging, dragOffset]);

  // Handle window resize to keep panel in view
  useEffect(() => {
    const handleResize = () => {
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 20;
        const maxY = window.innerHeight - rect.height - 20;
        
        setPanelPosition(prev => ({
          x: Math.max(20, Math.min(prev.x, maxX)),
          y: Math.max(20, Math.min(prev.y, maxY)),
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!forecastTrack || forecastTrack.length === 0) return null;

  const currentPoint = forecastTrack[currentIndex];

  return (
    <>
      {/* Loading Indicator for Geometry Pre-computation */}
      {isLoadingGeometry && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
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

      {/* Main Control Panel */}
      <div
        ref={panelRef}
        className={`absolute z-[90] pointer-events-auto transition-all duration-150 ${
          isMinimized ? 'w-auto' : 'w-[min(420px,90vw)]'
        }`}
        style={{
          left: `${panelPosition.x}px`,
          top: `${panelPosition.y}px`,
          background: 'rgba(30, 40, 60, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          padding: isMinimized ? '8px 12px' : '12px 16px',
          boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,0.6)' : '0 4px 20px rgba(0,0,0,0.4)',
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: isDragging ? 'none' : 'box-shadow 0.15s',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Drag Handle Visual Indicator */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-500 rounded-full opacity-50 pointer-events-none" />
        
        {/* Header with Controls */}
        <div className="flex items-center justify-between mb-3" style={{ cursor: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 flex-1">
            <Timer size={16} className="text-blue-400" />
            {!isMinimized && (
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
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowChart(!showChart)}
              className={`p-1.5 rounded transition-colors ${
                showChart ? 'bg-blue-600 text-white' : 'bg-gray-700/50 hover:bg-gray-600 text-white'
              }`}
              title="Toggle intensity chart"
            >
              <BarChart3 size={14} />
            </button>
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`p-1.5 rounded transition-colors ${
                notificationsEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700/50 hover:bg-gray-600 text-white'
              }`}
              title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
            >
              {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
            <button
              onClick={handleShare}
              className="p-1.5 rounded bg-gray-700/50 hover:bg-gray-600 text-white transition-colors"
              title="Share current timestep"
            >
              <Share2 size={14} />
            </button>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="p-1.5 rounded bg-gray-700/50 hover:bg-gray-600 text-white transition-colors"
              title="Toggle legend (I)"
            >
              <Info size={14} />
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 rounded bg-gray-700/50 hover:bg-gray-600 text-white transition-colors"
              title={isMinimized ? 'Expand (M)' : 'Minimize (M)'}
            >
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                title="Close (Esc)"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {!isMinimized && (
          <div onMouseDown={(e) => e.stopPropagation()}>
            {/* Scenario Toggle */}
            <div className="flex items-center gap-2 mb-3 px-2">
              <Layers size={12} className="text-gray-400" />
              <span className="text-white text-[10px]">Scenario:</span>
              {(['forecast', 'best', 'worst'] as const).map((scenario) => (
                <button
                  key={scenario}
                  onClick={() => setCurrentScenario(scenario)}
                  className={`px-2 py-0.5 rounded text-[9px] transition-colors ${
                    currentScenario === scenario
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
                </button>
              ))}
              {currentScenario !== 'forecast' && (
                <span className="text-[9px] text-yellow-400 ml-1">Simulated</span>
              )}
            </div>
            {/* Wind Speed Indicator */}
            <div className="flex justify-between items-center mb-3 px-2">
              <div className="text-white text-xs">
                <span className="text-gray-400">Wind:</span> <span className="font-semibold">{currentPoint.meanWind.toFixed(0)} kt</span>
              </div>
              <div className="text-white text-xs">
                <span className="text-gray-400">Gust:</span> <span className="font-semibold">{currentPoint.windGust.toFixed(0)} kt</span>
              </div>
              <div className="text-white text-xs">
                <span className="text-gray-400">Pressure:</span> <span className="font-semibold">{currentPoint.pressure.toFixed(0)} hPa</span>
              </div>
            </div>

      {/* Timeline Scrubber */}
      <div className="mb-3">
        <input
          type="range"
          min="0"
          max={forecastTrack.length - 1}
          value={currentIndex}
          onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
          className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(currentIndex / (forecastTrack.length - 1)) * 100}%, #4B5563 ${(currentIndex / (forecastTrack.length - 1)) * 100}%, #4B5563 100%)`,
          }}
        />
        <div className="flex justify-between text-[9px] text-gray-400 mt-1">
          <span>{new Date(forecastTrack[0].time).toLocaleDateString()}</span>
          <span>
            Step {currentIndex + 1} / {forecastTrack.length}
          </span>
          <span>{new Date(forecastTrack[forecastTrack.length - 1].time).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentIndex(0)}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            title="Reset to start"
          >
            <SkipBack size={14} />
          </button>
          
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          
          <button
            onClick={() => setCurrentIndex(forecastTrack.length - 1)}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            title="Skip to end"
          >
            <SkipForward size={14} />
          </button>
        </div>

            {/* Speed Control */}
            <div className="flex items-center gap-2">
              <span className="text-white text-[10px]">Speed:</span>
              {[0.25, 0.5, 1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2.5 py-1 rounded text-[10px] min-w-[44px] transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
          
          {/* Keyboard Shortcuts Hint */}
          <div className="mt-2 pt-2 border-t border-gray-700 text-[9px] text-gray-400 text-center">
            <div>Space/K: Play • ←→/JL: Step • Home/End: Jump • Drag to move</div>
            <div className="mt-0.5">I: Legend • M: Minimize • C: Chart • N: Notify • S: Share</div>
          </div>
          </div>
        )}
      </div>

      {/* Intensity Chart (Top-Right Panel when expanded) */}
      {showChart && !isMinimized && (
        <div
          className="absolute top-4 right-4 z-[90] pointer-events-auto w-[min(500px,calc(100vw-32px))] max-h-[calc(100vh-200px)] overflow-auto"
          style={{
            background: 'rgba(30, 40, 60, 0.97)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-400" />
              <h3 className="text-white text-base font-semibold">Intensity Timeline</h3>
            </div>
            <button
              onClick={() => setShowChart(false)}
              className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              aria-label="Close intensity chart"
            >
              <X size={16} />
            </button>
          </div>
          <div className="h-64 w-full">
            {CycloneIntensityChart && (
              <CycloneIntensityChart
                forecastTrack={forecastTrack}
                currentIndex={currentIndex}
                onPointClick={setCurrentIndex}
                isPlaying={isPlaying}
              />
            )}
          </div>
        </div>
      )}

      {/* Wind Radii Legend */}
      {showLegend && !isMinimized && (
        <div
          className="absolute top-4 left-4 z-[90] pointer-events-auto"
          style={{
            background: 'rgba(30, 40, 60, 0.97)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            padding: '16px',
            minWidth: '240px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-purple-400" />
              <h3 className="text-white text-base font-semibold">Wind Radii Legend</h3>
            </div>
            <button
              onClick={() => setShowLegend(false)}
              className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              aria-label="Close legend"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="space-y-2">
            {/* Cyclone Category Scale */}
            <div className="mb-3 pb-3 border-b border-gray-700">
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
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FF000040', borderColor: '#FF0000' }}></div>
              <div className="text-xs text-white">
                <div className="font-medium">Hurricane Force</div>
                <div className="text-[10px] text-gray-400">≥64 kt (≥119 km/h)</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FFA50040', borderColor: '#FFA500' }}></div>
              <div className="text-xs text-white">
                <div className="font-medium">Storm Force</div>
                <div className="text-[10px] text-gray-400">48-63 kt (89-118 km/h)</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#FFD70040', borderColor: '#FFD700' }}></div>
              <div className="text-xs text-white">
                <div className="font-medium">Gale Force</div>
                <div className="text-[10px] text-gray-400">34-47 kt (63-88 km/h)</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-dashed" style={{ backgroundColor: '#88888820', borderColor: '#666' }}></div>
              <div className="text-xs text-white">
                <div className="font-medium">Uncertainty Cone</div>
                <div className="text-[10px] text-gray-400">Forecast error range</div>
              </div>
            </div>
            
            <div className="pt-2 border-t border-gray-700">
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
    </>
  );
}
