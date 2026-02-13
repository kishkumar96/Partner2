"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { X, Map as MapIcon, BookOpen, AlertCircle, Globe2 } from "lucide-react";
import maplibregl from "maplibre-gl";
import ActiveFilters from "@/components/ActiveFilters";
import { MapControls } from "@/components/MapControls";
import ShareLinkButton from "@/components/ShareLinkButton";
import { FilterState, Event } from "@/types";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import { vanuatuHazards, vanuatuSectors, vanuatuProvinces, vanuatuDistricts } from "@/data/vanuatuHazards";
import { loadAllRealData, expandEventsToRegionalEntries } from "@/utils/realDataLoader";
import { detectStoryBeats } from "@/utils/cycloneStory";
import { deserializeMapState, serializeMapState, MapURLState } from "@/utils/urlState";

// Vanuatu-specific data
const allHazards = vanuatuHazards;
const allSectors = vanuatuSectors;
const provinces = vanuatuProvinces;
const districts = vanuatuDistricts;

// Loading component for panels
const PanelLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p className="text-sm text-slate-400">Loading...</p>
    </div>
  </div>
);

// Dynamic imports for performance optimization - lazy load heavy components
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-slate-900/60 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-slate-400">Loading map...</p>
      </div>
    </div>
  ),
});

const FilterPanel = dynamic(() => import("@/components/FilterPanel"), {
  loading: () => <PanelLoader />,
});

const SummaryPanel = dynamic(() => import("@/components/SummaryPanel"), {
  loading: () => <PanelLoader />,
});

const BottomTabs = dynamic(() => import("@/components/BottomTabs"), {
  loading: () => <PanelLoader />,
});

const ExportButtons = dynamic(() => import("@/components/ExportButtons"), {
  loading: () => <div className="w-24 h-8 animate-pulse bg-slate-700/50 rounded" />,
});

const CountrySelector = dynamic(() => import("@/components/CountrySelector"), {
  loading: () => <PanelLoader />,
});

const MethodologyDrawer = dynamic(() => import("@/components/MethodologyDrawer"), {
  loading: () => null,
});

const DataQualityIndicator = dynamic(() => import("@/components/DataQualityIndicator"), {
  loading: () => null,
});

const ComparativeAnalytics = dynamic(() => import("@/components/ComparativeAnalytics"), {
  loading: () => null,
});

const UnifiedMapLegend = dynamic(() => import("@/components/UnifiedMapLegend"), {
  ssr: false,
  loading: () => null,
});

const Toast = dynamic(() => import("@/components/Toast"), {
  ssr: false,
  loading: () => null,
});

export default function Home() {
  // Next.js router for URL state management
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasLoadedFromUrl = useRef(false);
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [filters, setFilters] = useState<FilterState>({
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: "", end: "" },
    aggregationLevel: "district",
  });

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>("VU");
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [mapStyle, setMapStyle] = useState<"loss" | "wind">("loss");
  const [basemapStyle, setBasemapStyle] = useState("https://basemaps.cartocdn.com/gl/positron-gl-style/style.json");
  const [showFilters, setShowFilters] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showCycloneControls, setShowCycloneControls] = useState(true);
  const [isCyclonePlaying, setIsCyclonePlaying] = useState(false);
  const [storyMode, setStoryMode] = useState(false);
  const [currentCycloneIndex, setCurrentCycloneIndex] = useState(0);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "warning">("info");
  const [toastAction, setToastAction] = useState<{label: string; onClick: () => void} | undefined>(undefined);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const [cycloneControlsHost, setCycloneControlsHost] = useState<HTMLDivElement | null>(null);
  const cycloneControlsHostRef = useCallback((node: HTMLDivElement | null) => {
    setCycloneControlsHost(node);
  }, []);
  
  // Real data state
  const [events, setEvents] = useState<Event[]>([]); // Master events (e.g., 1 for TC Lola)
  const [expandedEvents, setExpandedEvents] = useState<Event[]>([]); // Regional-level entries for filtering
  const [exposureData, setExposureData] = useState<any[]>([]);
  const [economicDamageData, setEconomicDamageData] = useState<any[]>([]); // Combined for backward compatibility
  const [sectorEconomicData, setSectorEconomicData] = useState<any[]>([]); // Sector-level economic data
  const [assetEconomicData, setAssetEconomicData] = useState<any[]>([]); // Asset-level economic data
  const [assetExposureData, setAssetExposureData] = useState<any>(null);
  const [impactByAssetType, setImpactByAssetType] = useState<any[]>([]);
  const [impactBySector, setImpactBySector] = useState<any[] | undefined>();
  const [nationalSummary, setNationalSummary] = useState<any[] | undefined>();
  const [damagedBuildings, setDamagedBuildings] = useState<any>(null);
  const [damagedRoads, setDamagedRoads] = useState<any>(null);
  const [regionalSummary, setRegionalSummary] = useState<any[]>([]);
  const [regionalSummaryBySector, setRegionalSummaryBySector] = useState<any[]>([]);
  const [cycloneForecast, setCycloneForecast] = useState<any>(null);
  const storyBeats = useMemo(() => (
    cycloneForecast ? detectStoryBeats(cycloneForecast, selectedCountry) : []
  ), [cycloneForecast, selectedCountry]);

  // Memoized data values for legend (performance optimization)
  const legendDataValues = useMemo(() => {
    return regionalSummary
      .map((r: any) => {
        if (mapStyle === "loss") {
          return parseFloat(r.Total_Loss) || 0;
        } else {
          return parseFloat(r.Max_Wind_Gusts) || 0;
        }
      })
      .filter((v: number) => v > 0);
  }, [regionalSummary, mapStyle]);
  
  // Stable story beats to prevent empty-state flashing during recomputation
  const [stableStoryBeats, setStableStoryBeats] = useState<any[]>([]);
  useEffect(() => {
    if (storyBeats.length > 0) {
      setStableStoryBeats(storyBeats);
    }
  }, [storyBeats]);

  // ============================================================================
  // URL State Management - Shareable Links
  // ============================================================================
  
  /**
   * Restore application state from URL parameters (one-time on mount)
   */
  useEffect(() => {
    if (hasLoadedFromUrl.current) return;
    hasLoadedFromUrl.current = true;
    
    const urlState = deserializeMapState(searchParams);
    
    // Restore basic state
    if (urlState.country !== undefined) {
      setSelectedCountry(urlState.country);
    }
    if (urlState.region) {
      setSelectedRegion(urlState.region);
    }
    if (urlState.mapStyle) {
      setMapStyle(urlState.mapStyle);
    }
    if (urlState.basemap) {
      setBasemapStyle(urlState.basemap);
    }
    
    // Restore filters
    if (urlState.hazards || urlState.sectors || urlState.events || urlState.dateStart || urlState.dateEnd || urlState.aggregation) {
      setFilters(prev => ({
        selectedHazards: urlState.hazards || prev.selectedHazards,
        selectedSectors: urlState.sectors || prev.selectedSectors,
        selectedEvents: urlState.events || prev.selectedEvents,
        dateRange: {
          start: urlState.dateStart || prev.dateRange.start,
          end: urlState.dateEnd || prev.dateRange.end,
        },
        aggregationLevel: urlState.aggregation || prev.aggregationLevel,
      }));
    }
    
    // Restore cyclone state
    if (urlState.cycloneIndex !== undefined) {
      setCurrentCycloneIndex(urlState.cycloneIndex);
    }
    if (urlState.storyMode !== undefined) {
      setStoryMode(urlState.storyMode);
    }
    
    // Restore panel states
    if (urlState.showFilters) {
      setShowFilters(true);
    }
    if (urlState.showSummary) {
      setShowSummary(true);
    }
    
    // Map center/zoom handled by MapView component via onMapReady callback
    if (mapInstance && urlState.center && urlState.zoom) {
      mapInstance.jumpTo({
        center: [urlState.center.lng, urlState.center.lat],
        zoom: urlState.zoom,
      });
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('📍 Restored state from URL:', urlState);
    }
  }, [searchParams, mapInstance]);

  /**
   * Update URL when map state changes (debounced to avoid spam)
   */
  const updateUrl = useCallback((state: Partial<MapURLState>) => {
    if (typeof window === 'undefined') return;
    
    // Clear existing timeout
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current);
    }
    
    // Debounce URL updates (300ms)
    urlUpdateTimeoutRef.current = setTimeout(() => {
      // Get current map center/zoom
      let center: { lat: number; lng: number } | undefined;
      let zoom: number | undefined;
      
      if (mapInstance) {
        const mapCenter = mapInstance.getCenter();
        center = { lat: mapCenter.lat, lng: mapCenter.lng };
        zoom = mapInstance.getZoom();
      }
      
      const fullState: MapURLState = {
        center,
        zoom,
        country: selectedCountry,
        region: selectedRegion,
        hazards: filters.selectedHazards,
        sectors: filters.selectedSectors,
        events: filters.selectedEvents,
        dateStart: filters.dateRange.start || undefined,
        dateEnd: filters.dateRange.end || undefined,
        aggregation: filters.aggregationLevel === 'national' ? undefined : filters.aggregationLevel,
        mapStyle,
        basemap: basemapStyle,
        cycloneIndex: currentCycloneIndex,
        storyMode,
        showFilters,
        showSummary,
        // Merge with any partial updates
        ...state,
      };
      
      const params = serializeMapState(fullState);
      const newUrl = `${pathname}?${params.toString()}`;
      
      // Use replace to avoid cluttering browser history
      router.replace(newUrl, { scroll: false });
    }, 300);
  }, [
    mapInstance,
    selectedCountry,
    selectedRegion, 
    filters,
    mapStyle,
    basemapStyle,
    currentCycloneIndex,
    storyMode,
    showFilters,
    showSummary,
    pathname,
    router,
  ]);

  // Update URL when key state changes
  useEffect(() => {
    if (!hasLoadedFromUrl.current) return; // Don't update URL during initial load
    updateUrl({});
  }, [
    selectedCountry,
    selectedRegion,
    mapStyle,
    currentCycloneIndex,
    storyMode,
    filters.selectedHazards,
    filters.selectedSectors,
    filters.aggregationLevel,
    updateUrl,
  ]);

  // Cleanup URL update timeout
  useEffect(() => {
    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
      }
    };
  }, []);

  const getGeoJsonBounds = useCallback((data: GeoJSON.FeatureCollection): maplibregl.LngLatBoundsLike | null => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    const updateBounds = (lng: number, lat: number) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    };

    const walkCoords = (coords: any) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        updateBounds(coords[0], coords[1]);
        return;
      }
      coords.forEach(walkCoords);
    };

    const walkGeometry = (geometry: GeoJSON.Geometry) => {
      if (geometry.type === "GeometryCollection") {
        geometry.geometries.forEach(walkGeometry);
        return;
      }
      walkCoords((geometry as GeoJSON.Geometry & { coordinates: any }).coordinates);
    };

    data.features.forEach((feature) => {
      if (!feature.geometry) return;
      walkGeometry(feature.geometry as GeoJSON.Geometry);
    });

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
      return null;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as maplibregl.LngLatBoundsLike;
  }, []);

  const zoomToData = useCallback((data?: GeoJSON.FeatureCollection | null) => {
    if (!mapInstance || !data) return;
    const bounds = getGeoJsonBounds(data);
    if (!bounds) return;

    const fit = () => {
      mapInstance.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
        duration: 900,
      });
    };

    if (mapInstance.isStyleLoaded()) {
      fit();
    } else {
      mapInstance.once("load", fit);
    }
  }, [mapInstance, getGeoJsonBounds]);

  const handleZoomToBuildings = useCallback(() => {
    if (!damagedBuildings || !damagedBuildings.features || damagedBuildings.features.length === 0) {
      console.warn('No building data available to zoom to');
      return;
    }
    zoomToData(damagedBuildings);
    // URL will be updated by map moveend event
  }, [zoomToData, damagedBuildings]);

  const handleZoomToRoads = useCallback(() => {
    if (!damagedRoads || !damagedRoads.features || damagedRoads.features.length === 0) {
      console.warn('No road data available to zoom to');
      return;
    }
    zoomToData(damagedRoads);
    // URL will be updated by map moveend event
  }, [zoomToData, damagedRoads]);

  /**
   * Zoom to specific asset coordinates (for table row clicks)
   */
  const handleZoomToAsset = useCallback((coordinates: [number, number], zoom: number = 16) => {
    if (!mapInstance) {
      console.warn('Map not ready for zooming');
      return;
    }

    const flyTo = () => {
      mapInstance.flyTo({
        center: coordinates,
        zoom: zoom,
        duration: 1200,
        essential: true,
      });
    };

    if (mapInstance.isStyleLoaded()) {
      flyTo();
    } else {
      mapInstance.once('load', flyTo);
    }
  }, [mapInstance]);

  // Update URL when map view changes (pan/zoom)
  useEffect(() => {
    if (!mapInstance || !hasLoadedFromUrl.current) return;
    
    const handleMapMove = () => {
      updateUrl({});
    };
    
    // Listen to moveend (fired after pan/zoom completes)
    mapInstance.on('moveend', handleMapMove);
    
    return () => {
      mapInstance.off('moveend', handleMapMove);
    };
  }, [mapInstance, updateUrl]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const accessibleDistricts = useMemo(() => (
    regionalSummary.map((r: any) => ({
      id: r.Region_ID || r.Region,
      name: r.Region || "Unknown",
      population: parseFloat(r.Total_Population) || 0,
      economicDamageUSD: parseFloat(r.Total_Loss) || 0,
      buildingCount: parseFloat(r.Total_Buildings) || 0,
      primaryHazard: "Tropical Cyclone",
    }))
  ), [regionalSummary]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  
  // Track load request version to cancel stale data loads
  const loadRequestVersion = useRef(0);
  
  // Filter events by selected country and region
  // Use expandedEvents for filtering (contains regional-level entries)
  const countryEvents = useMemo(() => {
    let filtered = expandedEvents;
    
    // Filter by country
    if (selectedCountry) {
      filtered = filtered.filter(e => e.countryCode === selectedCountry);
    }
    
    // Filter by region/district if one is selected
    if (selectedRegion) {
      filtered = filtered.filter(e => e.districtId === selectedRegion);
    }
    
    return filtered;
  }, [expandedEvents, selectedCountry, selectedRegion]);

  // Filter hazards and sectors based on what data we actually have
  const hazards = useMemo(() => {
    // Using real PDIE data - only tropical cyclone data available
    return allHazards.filter((h: any) => h.id === 'tropical-cyclone');
  }, []);

  const sectors = useMemo(() => {
    // Using real PDIE data - all 4 sectors available from CSV output
    return allSectors;
  }, []);

  // Calculate total economic damage for export button state
  const totalEconomicDamage = useMemo(() => {
    return countryEvents.reduce((sum, e) => sum + (e.totalEconomicDamage || 0), 0);
  }, [countryEvents]);

  // Load real data function
  const handleCycloneTimestepChange = useCallback(
    (_timestep: any | null, index: number) => {
      // Bounds validation
      if (index < 0 || index >= (cycloneForecast?.length ?? 0)) return;
      // Use functional setState to access current value without dependency
      setCurrentCycloneIndex(prevIndex => {
        if (index === prevIndex) return prevIndex;
        if (process.env.NODE_ENV !== "production") {
          console.log('Cyclone timestep changed to:', index);
        }
        return index;
      });
    },
    [cycloneForecast]
  );

  // Story mode side effects: pause playback and show controls on entry
  useEffect(() => {
    if (storyMode && isCyclonePlaying) {
      setIsCyclonePlaying(false);
    }
  }, [storyMode, isCyclonePlaying]);

  useEffect(() => {
    if (storyMode && !showCycloneControls) {
      setShowCycloneControls(true);
    }
    // Note: We keep controls visible on exit for now (user can manually hide)
    // Could optionally restore previous state if needed
  }, [storyMode, showCycloneControls]);

  // Stabilized loadData with useCallback to prevent stale closures
  const loadData = useCallback(async () => {
    // Increment version to invalidate any in-flight requests
    const currentVersion = ++loadRequestVersion.current;
    
    if (!selectedCountry) {
      setImpactBySector(undefined);
      setNationalSummary(undefined);
      setDamagedBuildings(null);
      setDamagedRoads(null);
      setDataLoadError(null);
      // Ensure we are not left in a loading state if this is called mid-load
      setIsLoadingData(false);
      return;
    }
    
    setIsLoadingData(true);
    setDataLoadError(null);
    try {
      const realData = await loadAllRealData();
      
      // Check if this request is still current (not superseded by a newer request)
      if (currentVersion !== loadRequestVersion.current) {
        console.log('Ignoring stale data load response');
        return;
      }
      
      if (realData.events && realData.events.length > 0) {
        setEvents(realData.events);
        // Use sector-specific events for filtering if available, otherwise expand the main events
        const expanded = realData.sectorSpecificEvents && realData.sectorSpecificEvents.length > 0
          ? realData.sectorSpecificEvents
          : expandEventsToRegionalEntries(realData.events);
        setExpandedEvents(expanded);
        if (process.env.NODE_ENV !== "production") {
          console.log(`Loaded ${realData.events.length} event(s) from real data`);
          console.log(`   - Expanded to ${expanded.length} regional entries for filtering (with sector data)`);
        }
      }
      
      if (realData.exposureData && realData.exposureData.length > 0) {
        setExposureData(realData.exposureData);
      }
      
      if (realData.economicDamageData && realData.economicDamageData.length > 0) {
        setEconomicDamageData(realData.economicDamageData);
      }
      
      // Load separate sector and asset economic data
      if (realData.sectorEconomicData && realData.sectorEconomicData.length > 0) {
        setSectorEconomicData(realData.sectorEconomicData);
      }
      
      if (realData.assetEconomicData && realData.assetEconomicData.length > 0) {
        setAssetEconomicData(realData.assetEconomicData);
      }
      
      if (realData.assetExposureData) {
        setAssetExposureData(realData.assetExposureData);
      }
      
      if (realData.impactByAsset) {
        setImpactByAssetType(realData.impactByAsset);
      }
      
      if (realData.impactBySector) {
        setImpactBySector(realData.impactBySector);
      }
      
      if (realData.nationalSummary) {
        setNationalSummary(realData.nationalSummary);
      }
      
      if (realData.damagedBuildings) {
        setDamagedBuildings(realData.damagedBuildings);
        if (process.env.NODE_ENV !== "production") {
          console.log('Loaded damaged buildings data');
        }
        const buildingCount = realData.damagedBuildings?.features?.length || 0;
        if (buildingCount > 0) {
          // Clear existing toast timeout
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          setToastMessage(
            `Building damage data loaded: ${buildingCount.toLocaleString()} buildings analyzed. Zoom in to see individual buildings.`
          );
          setToastType('info');
          setShowToast(true);
          toastTimeoutRef.current = setTimeout(() => setShowToast(false), 5000);
        }
      }
      
      if (realData.damagedRoads) {
        setDamagedRoads(realData.damagedRoads);
        if (process.env.NODE_ENV !== "production") {
          console.log('Loaded damaged roads data');
        }
      }
      
      if (realData.regionalSummary) {
        setRegionalSummary(realData.regionalSummary);
        if (process.env.NODE_ENV !== "production") {
          console.log(`Loaded ${realData.regionalSummary.length} regional summaries`);
        }
      }
      
      if (realData.regionalSummaryBySector) {
        setRegionalSummaryBySector(realData.regionalSummaryBySector);
        if (process.env.NODE_ENV !== "production") {
          console.log(`Loaded ${realData.regionalSummaryBySector.length} regional sector records`);
        }
      }
      
      if (realData.cycloneForecast) {
        setCycloneForecast(realData.cycloneForecast);
        if (process.env.NODE_ENV !== "production") {
          console.log(`Loaded ${realData.cycloneForecast.length} cyclone forecast timesteps`);
        }
      }
    } catch (error) {
      // Check if this request is still current before showing error
      if (currentVersion !== loadRequestVersion.current) {
        if (process.env.NODE_ENV !== "production") {
          console.log('Ignoring error from stale data load');
        }
        return;
      }
      
      if (process.env.NODE_ENV !== "production") {
        console.error('Error loading real data:', error);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDataLoadError(`Failed to load data: ${errorMessage}`);
      
      // Clear existing toast timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      // Show error toast
      setToastMessage('Failed to load data. Please try again.');
      setToastType('warning');
      setToastAction({
        label: 'Retry',
        onClick: () => {
          setDataLoadError(null);
          setShowToast(false);
          loadData();
        }
      });
      setShowToast(true);
    } finally {
      // Only update loading state if this is still the current request
      if (currentVersion === loadRequestVersion.current) {
        setIsLoadingData(false);
      }
    }
  }, [selectedCountry]);

  // Load real data on mount and when selectedCountry changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Show toast notification when region is selected
  useEffect(() => {
    if (selectedRegion) {
      // Clear existing toast timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      const regionName = districts.find((d: any) => d.id === selectedRegion)?.name || selectedRegion;
      setToastMessage(`Region selected: ${regionName}`);
      setToastType("info");
      setToastAction({
        label: "View Summary",
        onClick: () => {
          setShowSummary(true);
          setShowToast(false);
        }
      });
      setShowToast(true);
    }
  }, [selectedRegion, districts]);

  useEffect(() => {
    const activePanel = showFilters ? filterPanelRef.current : showSummary ? summaryPanelRef.current : null;
    if (!activePanel) return;

    const focusableSelectors = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ];

    const getFocusable = () =>
      Array.from(activePanel.querySelectorAll<HTMLElement>(focusableSelectors.join(",")))
        .filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));

    const focusables = getFocusable();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (first) {
      first.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showFilters) setShowFilters(false);
        if (showSummary) setShowSummary(false);
        return;
      }

      if (event.key !== "Tab" || focusables.length === 0) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showFilters, showSummary]);

  const showMapOverlays = !showCountrySelector && !isLoadingData && !dataLoadError;

  return (
    <div className="flex flex-col h-screen bg-transparent overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 glass-panel border-b border-white/10 px-4 sm:px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => {
                  setShowFilters(true);
                  setShowSummary(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-800/70 text-slate-200 text-xs font-semibold uppercase tracking-wide border border-slate-700/60"
                aria-label="Open filters panel"
              >
                Filters
              </button>
              <button
                onClick={() => {
                  setShowSummary(true);
                  setShowFilters(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-800/70 text-slate-200 text-xs font-semibold uppercase tracking-wide border border-slate-700/60"
                aria-label="Open summary panel"
              >
                Summary
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                <Globe2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-slate-100 truncate">
                  Pacific Disaster Platform
                </h1>
                <p className="text-xs text-slate-400 truncate">
                  {isLoadingData ? "Loading..." : "Tropical Cyclone Lola"}
                </p>
              </div>
            </div>
          </div>
          
          {/* Actions Group - Right aligned, consistent spacing */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap lg:flex-nowrap justify-end">
            {/* Country Selector Button */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 rounded-lg border border-slate-700/50">
              <button
                onClick={() => setShowCountrySelector(!showCountrySelector)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded transition-colors text-xs"
                aria-label={selectedCountry ? `Current country: ${COUNTRIES[selectedCountry].name}. Click to change country` : "Select country"}
                aria-expanded={showCountrySelector}
                aria-haspopup="dialog"
                aria-controls="country-selector-panel"
                title="Select country"
              >
                {selectedCountry ? (
                  <>
                    <span className="text-base">{selectedCountry === 'VU' ? '🇻🇺' : selectedCountry === 'WS' ? '🇼🇸' : selectedCountry === 'TO' ? '🇹🇴' : '🇨🇰'}</span>
                    <span className="font-medium">{COUNTRIES[selectedCountry].name}</span>
                  </>
                ) : (
                  <>
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Region</span>
                  </>
                )}
              </button>
              
              <a
                href="/methodology"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded transition-colors text-xs"
                aria-label="View methodology and data documentation"
                title="Open methodology page in new tab"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Methodology</span>
              </a>
              
              <ShareLinkButton 
                mapState={{
                  center: mapInstance ? { 
                    lat: mapInstance.getCenter().lat, 
                    lng: mapInstance.getCenter().lng 
                  } : undefined,
                  zoom: mapInstance?.getZoom(),
                  country: selectedCountry,
                  region: selectedRegion,
                  hazards: filters.selectedHazards,
                  sectors: filters.selectedSectors,
                  events: filters.selectedEvents,
                  dateStart: filters.dateRange.start || undefined,
                  dateEnd: filters.dateRange.end || undefined,
                  aggregation: filters.aggregationLevel === 'national' ? undefined : filters.aggregationLevel,
                  mapStyle,
                  basemap: basemapStyle,
                  cycloneIndex: currentCycloneIndex,
                  storyMode,
                  showSummary,
                  showFilters,
                }}
                compact
              />
              
              <DataQualityIndicator compact />
              
              <ExportButtons
                events={countryEvents}
                exposureData={exposureData}
                economicDamageData={economicDamageData}
                hazards={hazards}
                sectors={sectors}
                disabled={totalEconomicDamage === 0}
              />
            </div>
          </div>
        </div>
        
        {/* Active Filters Bar - Single line with horizontal scroll */}
        <div className="mt-2 pt-2 border-t border-slate-800">
          <ActiveFilters
            filters={filters}
            hazards={hazards}
            sectors={sectors}
            onClearFilter={(type, id) => {
              setFilters((prevFilters) => {
                if (type === "all") {
                  return {
                    selectedHazards: [],
                    selectedSectors: [],
                    selectedEvents: [],
                    dateRange: { start: "", end: "" },
                    aggregationLevel: "district",
                  };
                }

                if (type === "hazard") {
                  if (!id) {
                    return {
                      ...prevFilters,
                      selectedHazards: [],
                    };
                  }
                  return {
                    ...prevFilters,
                    selectedHazards: prevFilters.selectedHazards.filter(
                      (hazardId) => hazardId !== id
                    ),
                  };
                }

                if (type === "sector") {
                  if (!id) {
                    return {
                      ...prevFilters,
                      selectedSectors: [],
                    };
                  }
                  return {
                    ...prevFilters,
                    selectedSectors: prevFilters.selectedSectors.filter(
                      (sectorId) => sectorId !== id
                    ),
                  };
                }

                if (type === "event") {
                  return {
                    ...prevFilters,
                    selectedEvents: [],
                  };
                }

                return prevFilters;
              });
            }}
            className="w-full"
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left Filter Panel */}
        {showFilters && (
          <button
            className="fixed inset-0 bg-black/50 z-[35] md:hidden"
            onClick={() => setShowFilters(false)}
            aria-label="Close filters panel"
          />
        )}
        <div
          ref={filterPanelRef}
          className={`fixed inset-y-0 left-0 z-[40] w-72 transform transition-transform duration-300 md:static md:translate-x-0 md:w-72 ${
            showFilters ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="md:hidden absolute top-3 right-3 z-[45]">
            <button
              onClick={() => setShowFilters(false)}
              className="w-8 h-8 rounded-full bg-slate-800/80 text-slate-200 border border-slate-700/60 shadow flex items-center justify-center"
              aria-label="Close filters panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FilterPanel
            hazards={hazards}
            sectors={sectors}
            events={events}
            districts={districts}
            filters={filters}
            onFilterChange={setFilters}
            showCycloneControls={showCycloneControls}
            onToggleCycloneControls={setShowCycloneControls}
            isCyclonePlaying={isCyclonePlaying}
            onToggleCyclonePlaying={setIsCyclonePlaying}
            hasCycloneData={!!cycloneForecast}
            cycloneControlsHostRef={cycloneControlsHostRef}
            accessibleDistricts={accessibleDistricts}
            storyMode={storyMode}
            onDistrictSelect={(districtId) => {
              const region = regionalSummary.find(
                (r: any) => r.Region_ID === districtId || r.Region === districtId
              );
              if (region) {
                setSelectedRegion(region.Region_ID ?? region.Region);
              }
            }}
          />
        </div>

        {/* Center Map + Bottom Tabs */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Map Area */}
          <div className="flex-1 min-h-0 relative">
            {/* Determine if panels are open or selections are active */}
            {(() => {
              const isPanelOpen = showFilters || showSummary || showMethodology || showCountrySelector;
              const hasSelection = !!selectedEvent || !!selectedRegion;

              return (
                <>
                  {/* Unified Map Controls (basemap + future controls) */}
                  {showMapOverlays && (
                    <MapControls
                      currentBasemap={basemapStyle}
                      onBasemapChange={setBasemapStyle}
                      mapStyle={mapStyle}
                      onMapStyleChange={setMapStyle}
                    />
                  )}
                  
                  {/* NEW: Unified Map Legend with data-driven breaks */}
                  {showMapOverlays && (
                    <UnifiedMapLegend
                      mode={mapStyle}
                      visible={true}
                      isPanelOpen={isPanelOpen}
                      hasSelection={hasSelection}
                      dataSource="PDIE Real Data"
                      temporalScope="Cumulative"
                      dataValues={legendDataValues}
                      isLeftPanelOpen={showFilters}
                      isRightPanelOpen={showSummary}
                      showBuildings={!!damagedBuildings}
                      showRoads={!!damagedRoads}
                      showCyclone={isCyclonePlaying || currentCycloneIndex > 0}
                      onZoomToBuildings={handleZoomToBuildings}
                      onZoomToRoads={handleZoomToRoads}
                    />
                  )}
                  
                  {/* Cyclone Animation Timestep Indicator removed to reduce clutter */}
                  
                  {/* LEGACY components now hidden to reduce clutter */}
                  {/* WindSpeedLegend removed - info now in UnifiedMapLegend */}
                  {/* MapStateIndicator removed - info now in UnifiedMapLegend */}
                </>
              );
            })()}

            <MapView
              events={countryEvents}
              hazards={hazards}
              filters={filters}
              onEventSelect={setSelectedEvent}
              selectedRegion={selectedRegion}
              onRegionSelect={setSelectedRegion}
              selectedCountry={selectedCountry}
              mapStyle={mapStyle}
              basemapStyle={basemapStyle}
              damagedBuildings={damagedBuildings}
              damagedRoads={damagedRoads}
              cycloneForecast={cycloneForecast}
              aggregationLevel={filters.aggregationLevel}
              showOverlays={showMapOverlays}
              onCycloneTimestepChange={handleCycloneTimestepChange}
              showCycloneAnimation={showCycloneControls}
              onCycloneAnimationChange={setShowCycloneControls}
              isCyclonePlaying={isCyclonePlaying}
              onCyclonePlayingChange={setIsCyclonePlaying}
              showCycloneToggle={false}
              cycloneControlsHost={cycloneControlsHost}
              isLeftPanelOpen={showFilters}
              isRightPanelOpen={showSummary}
              storyMode={storyMode}
              storyBeats={stableStoryBeats}
              currentCycloneIndex={currentCycloneIndex}
              onStoryModeChange={setStoryMode}
              onStoryIndexChange={setCurrentCycloneIndex}
              onMapReady={setMapInstance}
            />

            {/* Loading Overlay */}
            {isLoadingData && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 pointer-events-auto">
                <div className="glass-panel rounded-lg shadow-xl border border-white/10 p-8 text-center max-w-md w-full">
                  <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"/>
                  <h3 className="text-lg font-semibold text-slate-100 mb-2">
                    Loading {selectedCountry ? COUNTRIES[selectedCountry].name : 'Data'}...
                  </h3>
                  <p className="text-sm text-slate-300">
                    Fetching hazard layers and impact data from THREDDS server
                  </p>
                </div>
              </div>
            )}

            {/* Data Load Error Overlay */}
            {dataLoadError && !isLoadingData && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 pointer-events-auto">
                <div className="glass-panel rounded-lg shadow-xl border-2 border-red-500 p-8 text-center max-w-md w-full">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100 mb-2">
                    Data Loading Failed
                  </h3>
                  <p className="text-sm text-slate-300 mb-6">
                    {dataLoadError}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => {
                        setDataLoadError(null);
                        setIsLoadingData(true);
                        loadData();
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setDataLoadError(null)}
                      className="px-4 py-2 bg-slate-700/70 hover:bg-slate-600/70 text-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Country Selector Overlay */}
            {showCountrySelector && (
              <div 
                id="country-selector-panel"
                className="absolute top-4 right-4 z-[25] max-w-[calc(100vw-2rem)]"
                role="dialog"
                aria-label="Country selector"
              >
                <div className="relative">
                  <button
                    onClick={() => setShowCountrySelector(false)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                    aria-label="Close country selector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <CountrySelector
                    selectedCountry={selectedCountry}
                    onCountryChange={setSelectedCountry}
                  />
                </div>
              </div>
            )}

            {/* Selected Event Info Card */}
            {showMapOverlays && selectedEvent && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-4 max-w-[min(28rem,calc(100vw-2rem))] z-[16] pointer-events-auto">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-100">
                      {selectedEvent.name}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {selectedEvent.date}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-slate-400 hover:text-slate-200"
                    aria-label="Close event details"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Tabs */}
          <BottomTabs
            events={countryEvents}
            hazards={hazards}
            sectors={sectors}
            exposureData={exposureData}
            economicDamageData={economicDamageData}
            sectorEconomicData={sectorEconomicData}
            assetEconomicData={assetEconomicData}
            filters={filters}
            districts={districts}
            provinces={provinces}
            impactByAssetType={impactByAssetType}
            impactBySector={impactBySector || []}
            regionalSummary={regionalSummary}
            damagedBuildings={damagedBuildings}
            damagedRoads={damagedRoads}
            onZoomToAsset={handleZoomToAsset}
          />
        </div>

        {/* Right Summary Panel */}
        {showSummary && (
          <button
            className="fixed inset-0 bg-black/50 z-[35] md:hidden"
            onClick={() => setShowSummary(false)}
            aria-label="Close summary panel"
          />
        )}
        <div
          ref={summaryPanelRef}
          className={`fixed inset-y-0 right-0 z-[40] w-80 transform transition-transform duration-300 md:static md:translate-x-0 md:w-80 ${
            showSummary ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="md:hidden absolute top-3 left-3 z-[45]">
            <button
              onClick={() => setShowSummary(false)}
              className="w-8 h-8 rounded-full bg-slate-800/80 text-slate-200 border border-slate-700/60 shadow flex items-center justify-center"
              aria-label="Close summary panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <SummaryPanel
            events={countryEvents}
            hazards={hazards}
            sectors={sectors}
            filters={filters}
            districts={districts}
            provinces={provinces}
            selectedCountry={selectedCountry}
            selectedRegion={selectedRegion}
            onRegionClear={() => setSelectedRegion(null)}
            hasCycloneData={!!cycloneForecast}
            showCycloneControls={showCycloneControls}
            assetExposureData={assetExposureData}
            nationalSummary={nationalSummary || []}
            regionalSummary={regionalSummary}
            regionalSummaryBySector={regionalSummaryBySector}
            impactBySector={impactBySector || []}
          />
        </div>
      </div>

      {/* Methodology Drawer */}
      <MethodologyDrawer
        isOpen={showMethodology}
        onClose={() => setShowMethodology(false)}
      />

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          action={toastAction}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
