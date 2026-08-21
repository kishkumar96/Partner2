'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  X,
  Map as MapIcon,
  AlertCircle,
  ChevronDown,
  LogOut,
  BarChart3,
  DollarSign,
  Layers,
  MapPin,
  Users,
  Download,
  Loader2,
  Wind,
  Compass,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import ActiveFilters from '@/components/ActiveFilters';
import CountryFlag from '@/components/CountryFlag';
import GuidedTour, { type GuidedTourStep } from '@/components/GuidedTour';
import TopInsightsCards from '@/components/TopInsightsCards';
import ShareLinkButton from '@/components/ShareLinkButton';
import { District, FilterState, Event, Hazard, Province, Sector } from '@/types';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import {
  RealWMSLayer,
  createDefaultLegendSettings,
  getDefaultHazardScenario,
  HazardScenarioSelection,
  LegendSettings,
} from '@/data/realThreddsLayers';
import { COUNTRY_CONFIGS, getAggregationLabel, getCountryAppName } from '@/data/countryConfigs';
import {
  loadAllRealData,
  loadSupplementaryRealData,
  expandEventsToRegionalEntries,
  loadDamagedBuildings,
  loadDamagedRoads,
  fetchHazardScenarioRiskSummary,
} from '@/utils/realDataLoader';
import { getFilteredData } from '@/stores/filteredDataStore';
import { detectStoryBeats } from '@/utils/cycloneStory';
import { deserializeMapState, serializeMapState, MapURLState } from '@/utils/urlState';
import { highlightPoint } from '@/utils/mapHighlight';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import { normalizeHazardIds } from '@/utils/hazardIds';
import {
  hasBasemapPreference,
  getInitialBasemap,
  saveBasemapPreference,
  resetBasemapPreference,
} from '@/utils/userPreferences';

function haveSameItems(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

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
const MapView = dynamic(() => import('@/components/MapView'), {
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

const FilterPanel = dynamic(() => import('@/components/FilterPanel'), {
  loading: () => <PanelLoader />,
});

const MapPanel = dynamic(() => import('@/components/MapPanel'), {
  loading: () => <PanelLoader />,
});

const SummaryPanel = dynamic(() => import('@/components/SummaryPanel'), {
  loading: () => <PanelLoader />,
});

const BottomTabs = dynamic(() => import('@/components/BottomTabs'), {
  loading: () => <PanelLoader />,
});

const ExportButtons = dynamic(() => import('@/components/ExportButtons'), {
  loading: () => <div className="w-24 h-8 animate-pulse bg-slate-700/50 rounded" />,
});

const CountrySelector = dynamic(() => import('@/components/CountrySelector'), {
  loading: () => <PanelLoader />,
});

const UnifiedMapLegend = dynamic(() => import('@/components/UnifiedMapLegend'), {
  ssr: false,
  loading: () => null,
});

const Toast = dynamic(() => import('@/components/Toast'), {
  ssr: false,
  loading: () => null,
});

const BasemapPreferenceModal = dynamic(() => import('@/components/BasemapPreferenceModal'), {
  ssr: false,
  loading: () => null,
});

interface DashboardViewProps {
  countryCode: CountryCode;
  allowCountrySwitch?: boolean;
  showLogout?: boolean;
}

interface TourUiSnapshot {
  showFilters: boolean;
  showMapControls: boolean;
  showSummary: boolean;
  showAnalytics: boolean;
  filterPanelTab: 'filters' | 'cyclone';
}

type DashboardDataSourceMode = 'local' | 'partner' | 'mixed';

export default function DashboardView({
  countryCode,
  allowCountrySwitch = true,
  showLogout = true,
}: DashboardViewProps) {
  // Next.js router for URL state management
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasLoadedFromUrl = useRef(false);
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastReplacedUrlRef = useRef<string>('');

  // Restore URL state synchronously to prevent flash of unfiltered data
  const urlState = deserializeMapState(searchParams);
  const normalizedUrlHazards = normalizeHazardIds(urlState.hazards || []);

  const [filters, setFilters] = useState<FilterState>({
    selectedHazards: normalizedUrlHazards,
    selectedSectors: urlState.sectors || [],
    selectedEvents: urlState.events || [],
    dateRange: {
      start: urlState.dateStart || '',
      end: urlState.dateEnd || '',
    },
    aggregationLevel: urlState.aggregation || 'district',
  });

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const selectedCountry: CountryCode = countryCode;
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [mapStyle, setMapStyle] = useState<'loss' | 'wind'>(urlState.mapStyle || 'loss');
  const [is3DView, setIs3DView] = useState(false);
  const [extrusionMode, setExtrusionMode] = useState<'none' | 'loss' | 'wind'>('none');
  const [extrusionExaggeration, setExtrusionExaggeration] = useState(1);
  const [basemapStyle, setBasemapStyle] = useState(() => getInitialBasemap(urlState.basemap));
  const [showBasemapPreferenceModal, setShowBasemapPreferenceModal] = useState(false);
  const initialHazards = new Set(normalizedUrlHazards);
  const [showWindLayer, setShowWindLayer] = useState(
    initialHazards.has('tropical-cyclone') || initialHazards.has('wind')
  );
  const [showInundationLayer, setShowInundationLayer] = useState(
    initialHazards.size === 0 ||
      initialHazards.has('flood') ||
      initialHazards.has('inundation') ||
      initialHazards.has('storm-surge')
  );
  const [showBuildingsLayer, setShowBuildingsLayer] = useState(false);
  const [showRoadsLayer, setShowRoadsLayer] = useState(false);
  const [layerOpacity, setLayerOpacity] = useState(82);
  const [activeWmsLayers, setActiveWmsLayers] = useState<RealWMSLayer[]>([]);
  const [partnerHazardLayers, setPartnerHazardLayers] = useState<RealWMSLayer[]>([]);
  // Explicit user pick of one scenario out of a multi-scenario hazard catalog
  // (SLR x return-period/event, currently only Cook Islands). null = no
  // override yet, so getLayersForCountry falls back to a deterministic
  // default rather than rendering every scenario combination at once.
  const [hazardScenarioSelection, setHazardScenarioSelection] =
    useState<HazardScenarioSelection | null>(null);
  const initialShowMapControls = urlState.showMapControls ?? true;
  const [showFilters, setShowFilters] = useState(
    initialShowMapControls ? false : (urlState.showFilters ?? false)
  );
  const [showMapControls, setShowMapControls] = useState(initialShowMapControls);
  const [showSummary, setShowSummary] = useState(urlState.showSummary ?? true);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [legendSettings, setLegendSettings] = useState<LegendSettings>(() =>
    createDefaultLegendSettings(countryCode)
  );
  const [showMetadata, setShowMetadata] = useState(false);
  const [filterPanelTab, setFilterPanelTab] = useState<'filters' | 'cyclone'>('filters');
  const [showCycloneControls, setShowCycloneControls] = useState(false);
  const [isCyclonePlaying, setIsCyclonePlaying] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const tourUiSnapshotRef = useRef<TourUiSnapshot | null>(null);

  const [storyMode, setStoryMode] = useState(urlState.storyMode || false);
  const [currentCycloneIndex, setCurrentCycloneIndex] = useState(
    urlState.cycloneIndex !== undefined ? urlState.cycloneIndex : 0
  );
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);
  const [devDataSourceLabel, setDevDataSourceLabel] = useState<string>('');
  const [dataSourceMode, setDataSourceMode] = useState<DashboardDataSourceMode>('local');
  const [dataSourceSummary, setDataSourceSummary] = useState<string>(
    'Track: Local | Event: Local | Risk: Local | Hazards: Static'
  );
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'warning'>('info');
  const [toastAction, setToastAction] = useState<
    { label: string; onClick: () => void } | undefined
  >(undefined);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const [cycloneControlsHost, setCycloneControlsHost] = useState<HTMLDivElement | null>(null);
  const cycloneControlsHostRef = useCallback((node: HTMLDivElement | null) => {
    setCycloneControlsHost(node);
  }, []);

  // Layers loading state
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const dataSourceBadgeClassName =
    dataSourceMode === 'partner'
      ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200'
      : dataSourceMode === 'mixed'
        ? 'border-amber-500/35 bg-amber-500/12 text-amber-200'
        : 'border-sky-500/35 bg-sky-500/12 text-sky-200';
  const dataSourceBadgeLabel = `Source: ${dataSourceSummary}`;

  const openFilterPanel = useCallback((tab: 'filters' | 'cyclone' = 'filters') => {
    setShowFilters(true);
    setShowMapControls(false);
    setFilterPanelTab(tab);
  }, []);

  const openMapPanel = useCallback(() => {
    setShowMapControls(true);
    setShowFilters(false);
    setShowAnalytics(false);
  }, []);

  // Show basemap preference modal on first visit (if no preference saved and no URL state)
  useEffect(() => {
    if (!hasBasemapPreference() && !urlState.basemap) {
      setShowBasemapPreferenceModal(true);
    }
  }, [urlState.basemap]);

  // Sync legend settings when country changes
  useEffect(() => {
    setLegendSettings(createDefaultLegendSettings(countryCode));
  }, [countryCode]);

  const openSummaryPanel = useCallback(() => {
    setShowSummary(true);
    setShowFilters(false);
    setShowMapControls(false);
    setShowAnalytics(false);
  }, []);

  const restoreTourUiState = useCallback(() => {
    const snapshot = tourUiSnapshotRef.current;
    if (!snapshot) return;

    setShowFilters(snapshot.showFilters);
    setShowMapControls(snapshot.showMapControls);
    setShowSummary(snapshot.showSummary);
    setShowAnalytics(snapshot.showAnalytics);
    setFilterPanelTab(snapshot.filterPanelTab);
    tourUiSnapshotRef.current = null;
  }, []);

  const closeTour = useCallback(() => {
    setIsTourOpen(false);
    restoreTourUiState();
  }, [restoreTourUiState]);

  const finishTour = useCallback(() => {
    setIsTourOpen(false);
    restoreTourUiState();
    setToastMessage('Guided tour completed. You can restart it anytime from the Tour button.');
    setToastType('success');
    setToastAction(undefined);
    setShowToast(true);
  }, [restoreTourUiState]);

  const startTour = useCallback(() => {
    tourUiSnapshotRef.current = {
      showFilters,
      showMapControls,
      showSummary,
      showAnalytics,
      filterPanelTab,
    };
    setTourStepIndex(0);
    setIsTourOpen(true);
  }, [showFilters, showMapControls, showSummary, showAnalytics, filterPanelTab]);

  const {
    hazards: allHazards,
    sectors: allSectors,
    provinces,
    districts,
    ui: countryUi,
  } = COUNTRY_CONFIGS[selectedCountry];

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
  const [regionalImpactsGeoJSON, setRegionalImpactsGeoJSON] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [isLoadingDamage, setIsLoadingDamage] = useState({ buildings: false, roads: false });
  const [damageLoadError, setDamageLoadError] = useState<string | null>(null);
  const isLoadingDamageRef = useRef(isLoadingDamage);
  const filtersRef = useRef(filters);
  const damagedBuildingsRef = useRef<any>(null);
  const damagedRoadsRef = useRef<any>(null);
  const damageAutoLoadRequestedRef = useRef<{ buildings: boolean; roads: boolean }>({
    buildings: false,
    roads: false,
  });
  const [regionalSummary, setRegionalSummary] = useState<any[]>([]);
  const [regionalSummaryBySector, setRegionalSummaryBySector] = useState<any[]>([]);
  const [cycloneTrackData, setCycloneTrackData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [cycloneForecast, setCycloneForecast] = useState<any>(null);
  const derivedRegions = useMemo(() => {
    if (regionalSummary.length === 0) {
      return [];
    }

    const regionMap = new Map<string, { id: string; name: string }>();
    regionalSummary.forEach((row: any) => {
      const rawId = row?.Region_ID ?? row?.['Region.ID'] ?? row?.Region;
      const rawName = row?.Region ?? row?.region_name ?? rawId;
      if (!rawId || !rawName) {
        return;
      }

      const id = String(rawId).trim();
      const name = String(rawName).trim();
      if (!id || !name || regionMap.has(id)) {
        return;
      }

      regionMap.set(id, { id, name });
    });

    return Array.from(regionMap.values());
  }, [regionalSummary]);
  const resolvedDistricts = useMemo(
    () =>
      districts.length > 0
        ? districts
        : derivedRegions.map(region => ({
            id: region.id,
            name: region.name,
            provinceId: region.id,
          })),
    [derivedRegions, districts]
  );
  const resolvedProvinces = useMemo(
    () =>
      provinces.length > 0
        ? provinces
        : derivedRegions.map(region => ({
            id: region.id,
            name: region.name,
          })),
    [derivedRegions, provinces]
  );
  const activeCycloneName = events[0]?.name || 'Tropical Cyclone';
  const platformName = getCountryAppName(selectedCountry);
  const storyBeats = useMemo(
    () => (cycloneForecast ? detectStoryBeats(cycloneForecast, selectedCountry) : []),
    [cycloneForecast, selectedCountry]
  );

  // Memoized data values for legend (performance optimization)
  const legendDataValues = useMemo(() => {
    return regionalSummary
      .map((r: any) => {
        if (mapStyle === 'loss') {
          return parseFloat(r.Total_Loss) || 0;
        } else {
          return parseFloat(r.Max_Wind_Gusts) || 0;
        }
      })
      .filter((v: number) => Number.isFinite(v) && v >= 0);
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
   * Handle map center/zoom restoration after map is ready
   * (Other URL state is now restored synchronously during initialization)
   */
  const [hasRestoredMapView, setHasRestoredMapView] = useState(false);

  useEffect(() => {
    if (!mapInstance || hasRestoredMapView) {
      return;
    }

    // Restore map view if present in URL
    if (urlState.center && urlState.zoom) {
      mapInstance.jumpTo({
        center: [urlState.center.lng, urlState.center.lat],
        zoom: urlState.zoom,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('📍 Restored map view from URL');
      }
    }

    setHasRestoredMapView(true);
    hasLoadedFromUrl.current = true;
  }, [mapInstance, hasRestoredMapView, urlState.center, urlState.zoom]);

  /**
   * Update URL when map state changes (debounced to avoid spam)
   */
  const updateUrl = useCallback(
    (state: Partial<MapURLState>) => {
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
          region: selectedRegion,
          hazards: filters.selectedHazards,
          sectors: filters.selectedSectors,
          events: filters.selectedEvents,
          dateStart: filters.dateRange.start || undefined,
          dateEnd: filters.dateRange.end || undefined,
          aggregation:
            filters.aggregationLevel === 'national' ? undefined : filters.aggregationLevel,
          mapStyle,
          basemap: basemapStyle,
          cycloneIndex: currentCycloneIndex,
          storyMode,
          showFilters,
          showMapControls,
          showSummary,
          // Merge with any partial updates
          ...state,
        };

        const params = serializeMapState(fullState);
        const newUrl = `${pathname}?${params.toString()}`;
        const currentUrl = `${window.location.pathname}${window.location.search}`;

        // Skip redundant replaces; these can trigger unnecessary route work and log spam.
        if (newUrl === currentUrl || newUrl === lastReplacedUrlRef.current) {
          return;
        }

        lastReplacedUrlRef.current = newUrl;

        // Use replace to avoid cluttering browser history
        router.replace(newUrl, { scroll: false });
      }, 300);
    },
    [
      mapInstance,
      selectedRegion,
      filters,
      mapStyle,
      basemapStyle,
      currentCycloneIndex,
      storyMode,
      showFilters,
      showMapControls,
      showSummary,
      pathname,
      router,
    ]
  );

  // Update URL when key state changes
  useEffect(() => {
    if (!hasLoadedFromUrl.current) return; // Don't update URL during initial load
    updateUrl({});
  }, [
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

  // Cleanup in-flight data requests on unmount
  useEffect(() => {
    return () => {
      dataLoadAbortRef.current?.abort('Component unmounted');
      supplementaryLoadAbortRef.current?.abort('Component unmounted');
      damageLoadAbortRef.current.buildings?.abort('Component unmounted');
      damageLoadAbortRef.current.roads?.abort('Component unmounted');
    };
  }, []);

  const getGeoJsonBounds = useCallback(
    (data: GeoJSON.FeatureCollection): maplibregl.LngLatBoundsLike | null => {
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
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          updateBounds(coords[0], coords[1]);
          return;
        }
        coords.forEach(walkCoords);
      };

      const walkGeometry = (geometry: GeoJSON.Geometry) => {
        if (geometry.type === 'GeometryCollection') {
          geometry.geometries.forEach(walkGeometry);
          return;
        }
        walkCoords((geometry as GeoJSON.Geometry & { coordinates: any }).coordinates);
      };

      data.features.forEach(feature => {
        if (!feature.geometry) return;
        walkGeometry(feature.geometry as GeoJSON.Geometry);
      });

      if (
        !Number.isFinite(minLng) ||
        !Number.isFinite(minLat) ||
        !Number.isFinite(maxLng) ||
        !Number.isFinite(maxLat)
      ) {
        return null;
      }

      return [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as maplibregl.LngLatBoundsLike;
    },
    []
  );

  const zoomToData = useCallback(
    (data?: GeoJSON.FeatureCollection | null) => {
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
        mapInstance.once('load', fit);
      }
    },
    [mapInstance, getGeoJsonBounds]
  );

  const loadDamageLayer = useCallback(
    async (type: 'buildings' | 'roads') => {
      if (isLoadingDamageRef.current[type]) return null;
      if (type === 'buildings' && damagedBuildingsRef.current) return damagedBuildingsRef.current;
      if (type === 'roads' && damagedRoadsRef.current) return damagedRoadsRef.current;
      setIsLoadingDamage(prev => (prev[type] ? prev : { ...prev, [type]: true }));
      setDamageLoadError(null);

      const controller = new AbortController();
      if (damageLoadAbortRef.current[type]) {
        damageLoadAbortRef.current[type]?.abort('New damage data load requested');
      }
      damageLoadAbortRef.current[type] = controller;

      try {
        const data =
          type === 'buildings'
            ? await loadDamagedBuildings({
                signal: controller.signal,
                countryCode: selectedCountry,
                selectedEventIds: filtersRef.current.selectedEvents,
                dateRange: filtersRef.current.dateRange,
                eventRecords: fetchedEventRecordsRef.current,
              })
            : await loadDamagedRoads({
                signal: controller.signal,
                countryCode: selectedCountry,
                selectedEventIds: filtersRef.current.selectedEvents,
                dateRange: filtersRef.current.dateRange,
                eventRecords: fetchedEventRecordsRef.current,
              });

        if (controller.signal.aborted) return null;

        if (type === 'buildings') {
          setDamagedBuildings(data);
        } else {
          setDamagedRoads(data);
        }

        return data;
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          setDamageLoadError(`Failed to load ${type} data: ${message}`);
        }
        return null;
      } finally {
        if (damageLoadAbortRef.current[type] === controller) {
          damageLoadAbortRef.current[type] = null;
        }
        setIsLoadingDamage(prev => (prev[type] ? { ...prev, [type]: false } : prev));
      }
    },
    [selectedCountry]
  );

  const handleRequestDamageData = useCallback(
    (type: 'buildings' | 'roads') => {
      void loadDamageLayer(type);
    },
    [loadDamageLayer]
  );

  useEffect(() => {
    isLoadingDamageRef.current = isLoadingDamage;
  }, [isLoadingDamage]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    damagedBuildingsRef.current = damagedBuildings;
  }, [damagedBuildings]);

  useEffect(() => {
    damagedRoadsRef.current = damagedRoads;
  }, [damagedRoads]);

  const handleZoomToBuildings = useCallback(() => {
    const zoom = async () => {
      const data = damagedBuildings ?? (await loadDamageLayer('buildings'));
      if (!data || !data.features || data.features.length === 0) {
        console.warn('No building data available to zoom to');
        return;
      }
      zoomToData(data);
      // URL will be updated by map moveend event
    };
    void zoom();
  }, [zoomToData, damagedBuildings, loadDamageLayer]);

  const handleBuildingsLayerToggle = useCallback(
    (visible: boolean) => {
      setShowBuildingsLayer(visible);
      if (visible && !damagedBuildings) {
        void loadDamageLayer('buildings');
      }
    },
    [damagedBuildings, loadDamageLayer]
  );

  const handleZoomToRoads = useCallback(() => {
    const zoom = async () => {
      const data = damagedRoads ?? (await loadDamageLayer('roads'));
      if (!data || !data.features || data.features.length === 0) {
        console.warn('No road data available to zoom to');
        return;
      }
      zoomToData(data);
      // URL will be updated by map moveend event
    };
    void zoom();
  }, [zoomToData, damagedRoads, loadDamageLayer]);

  const handleRoadsLayerToggle = useCallback(
    (visible: boolean) => {
      setShowRoadsLayer(visible);
      if (visible && !damagedRoads) {
        void loadDamageLayer('roads');
      }
    },
    [damagedRoads, loadDamageLayer]
  );

  // Ensure visible damage layers have data loaded, including initial page load.
  useEffect(() => {
    if (
      showBuildingsLayer &&
      !damagedBuildings &&
      !isLoadingDamage.buildings &&
      !damageAutoLoadRequestedRef.current.buildings
    ) {
      damageAutoLoadRequestedRef.current.buildings = true;
      void loadDamageLayer('buildings');
    }
  }, [showBuildingsLayer, damagedBuildings, isLoadingDamage.buildings, loadDamageLayer]);

  useEffect(() => {
    if (
      showRoadsLayer &&
      !damagedRoads &&
      !isLoadingDamage.roads &&
      !damageAutoLoadRequestedRef.current.roads
    ) {
      damageAutoLoadRequestedRef.current.roads = true;
      void loadDamageLayer('roads');
    }
  }, [showRoadsLayer, damagedRoads, isLoadingDamage.roads, loadDamageLayer]);

  /**
   * Zoom to specific asset coordinates (for table row clicks)
   */
  const handleZoomToAsset = useCallback(
    (coordinates: [number, number], zoom: number = 16) => {
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

        // Add pulsing highlight animation after the flyTo animation completes
        setTimeout(() => {
          if (mapInstance.isStyleLoaded()) {
            highlightPoint(mapInstance, coordinates, {
              duration: 3000, // 3 seconds
              pulseCount: 4, // 4 pulses
              color: '#fbbf24', // Amber color
              maxRadius: 60, // Larger radius for visibility
            });
          }
        }, 1200); // Wait for flyTo animation to complete
      };

      if (mapInstance.isStyleLoaded()) {
        flyTo();
      } else {
        mapInstance.once('load', flyTo);
      }
    },
    [mapInstance]
  );

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

  // Keep current zoom available for UI hints (e.g., WMS zoom threshold).
  useEffect(() => {
    if (!mapInstance) return;

    const updateZoom = () => {
      setMapZoom(mapInstance.getZoom());
    };

    updateZoom();
    mapInstance.on('zoomend', updateZoom);

    return () => {
      mapInstance.off('zoomend', updateZoom);
    };
  }, [mapInstance]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToastNotification = useCallback(
    (
      message: string,
      type: 'success' | 'info' | 'warning' = 'info',
      action?: { label: string; onClick: () => void }
    ) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToastMessage(message);
      setToastType(type);
      setToastAction(action);
      setShowToast(true);
    },
    []
  );

  const tourSteps = useMemo<GuidedTourStep[]>(() => {
    const baseSteps: GuidedTourStep[] = [
      {
        title: 'Welcome to the Risk Intelligence Dashboard',
        body: 'This overview bar gives you the current country context, the active dashboard lens, and the fastest path into the rest of the workflow.',
        selector: '[data-tour="dashboard-hero"]',
        category: 'Overview',
        targetLabel: 'Dashboard header',
        placement: 'bottom',
        tips: [
          'Click the country name to switch between Pacific Island nations',
          'The event timestamp shows when disaster data was captured',
        ],
      },
      {
        title: 'Filter Your Data',
        body: 'Use filters to narrow the analysis by event, hazard, sector, date range, and geography before you inspect the map or export a report.',
        selector: '[data-tour="filter-primary-controls"]',
        category: 'Inputs',
        targetLabel: 'Filter controls',
        placement: 'right',
        tips: [
          'Start by selecting an event to see available disasters',
          'Combine hazard and sector filters for targeted analysis',
          'The map updates automatically as you apply filters',
        ],
      },
      {
        title: 'Control the Map View',
        body: 'Map controls change the visual story: shading mode, visible overlays, opacity, cyclone playback, and other presentation settings live here.',
        selector: '[data-tour="map-panel-toggle"]',
        category: 'Map',
        targetLabel: 'Map controls',
        placement: 'bottom',
        tips: [
          'Switch between Loss (damage) and Wind (intensity) visualization modes',
          'Adjust layer opacity to see through overlays to the basemap',
          'Toggle individual layers on/off to focus on specific data',
        ],
        keyboardShortcut: 'M',
      },
    ];

    // Add map visualization mode step (if map controls available)
    baseSteps.push({
      title: 'Map Visualization Modes',
      body: 'Switch between Loss mode (showing damage patterns) and Wind mode (showing wind speed intensity). Each mode reveals different aspects of disaster impacts.',
      selector: '[data-tour="map-style-selector"]',
      category: 'Map',
      targetLabel: 'Visualization mode',
      placement: 'right',
      tips: [
        'Loss mode: Best for seeing damaged buildings and infrastructure',
        'Wind mode: Displays wind speed shading from THREDDS server data',
      ],
    });

    // Add layer opacity step
    baseSteps.push({
      title: 'Adjust Layer Transparency',
      body: 'Control the opacity of overlay layers to balance visibility between disaster data and the underlying basemap.',
      selector: '[data-tour="opacity-control"]',
      category: 'Map',
      targetLabel: 'Layer opacity',
      placement: 'right',
      tips: [
        'Lower opacity helps see street names and basemap features',
        'Higher opacity emphasizes the disaster impact visualization',
      ],
    });

    baseSteps.push({
      title: 'Dive into the Data',
      body: 'The workspace holds detailed tables and charts where you move from visual scanning into actual evidence.',
      selector: '[data-tour="data-workspace-panel"]',
      category: 'Analysis',
      targetLabel: 'Data workspace',
      placement: 'top',
      tips: [
        'Regional Impacts: District-level summaries with sortable columns',
        'Buildings & Roads: Asset-level damage with coordinates',
        'Analytics: Comparison charts across regions and sectors',
      ],
    });

    // Conditionally add asset damage steps if data is available
    if (damagedBuildings || damagedRoads) {
      baseSteps.push({
        title: 'Inspect Asset-Level Damage',
        body: 'View individual damaged buildings and road segments with severity ratings, precise coordinates, and damage classifications.',
        selector: '[data-tour="asset-tabs"]',
        category: 'Analysis',
        targetLabel: 'Asset inspection',
        placement: 'top',
        tips: [
          'Click any row to zoom the map to that asset location',
          'Use search and sort to find specific damage patterns',
          'Export filtered results for detailed field assessments',
        ],
      });
    }

    baseSteps.push({
      title: 'Get the Big Picture',
      body: 'The summary panel condenses the current selection into headline metrics, insights, and supporting charts for rapid briefing.',
      selector: '[data-tour="summary-panel"]',
      category: 'Summary',
      targetLabel: 'Summary panel',
      placement: 'left',
      tips: [
        'Headline numbers update instantly as you filter data',
        'Charts show impact distribution across regions and sectors',
        'Perfect for creating executive summaries',
      ],
    });

    // Conditionally add cyclone animation step if forecast data exists
    if (cycloneForecast && cycloneForecast.length > 0) {
      baseSteps.push({
        title: 'Cyclone Track Animation',
        body: 'Watch the cyclone evolution over time with animated wind swaths, intensity changes, and forecast prediction cone.',
        selector: '[data-tour="story-mode-button"]',
        category: 'Map',
        targetLabel: 'Animation controls',
        placement: 'right',
        tips: [
          'Play/pause to control the animation timeline',
          'Click any timestep to jump to that moment',
          "Wind glow effects show the storm's intensity visually",
        ],
        keyboardShortcut: 'Space',
      });
    }

    baseSteps.push({
      title: 'Share & Export Your Findings',
      body: 'When the view is ready, export the map, preview the PDF report, or download the structured data. This is the handoff point for reporting.',
      selector: '[data-tour="export-controls"]',
      category: 'Output',
      targetLabel: 'Export controls',
      placement: 'bottom',
      tips: [
        'Map Export: High-res PNG with current filters applied',
        'PDF Preview: Full report with maps, charts, and tables',
        'Data Export: CSV/Excel for further analysis in other tools',
      ],
      keyboardShortcut: 'E',
    });

    return baseSteps;
  }, [cycloneForecast, damagedBuildings, damagedRoads]);

  useEffect(() => {
    if (!isTourOpen) return;

    const currentStep = tourSteps[tourStepIndex];
    if (!currentStep) return;

    switch (currentStep.selector) {
      case '[data-tour="dashboard-hero"]':
        setShowFilters(false);
        setShowMapControls(false);
        setShowSummary(false);
        break;
      case '[data-tour="filter-primary-controls"]':
        openFilterPanel('filters');
        setShowSummary(false);
        break;
      case '[data-tour="map-panel-toggle"]':
        openMapPanel();
        setShowSummary(false);
        break;
      case '[data-tour="map-style-selector"]':
        // Keep map panel open to show the visualization mode selector
        openMapPanel();
        setShowSummary(false);
        break;
      case '[data-tour="opacity-control"]':
        // Keep map panel open to show opacity slider
        openMapPanel();
        setShowSummary(false);
        break;
      case '[data-tour="summary-panel"]':
        openSummaryPanel();
        break;
      case '[data-tour="data-workspace-panel"]':
        setShowAnalytics(true);
        setShowFilters(false);
        setShowMapControls(false);
        setShowSummary(false);
        break;
      case '[data-tour="asset-tabs"]':
        // Ensure analytics workspace is open and visible
        setShowAnalytics(true);
        setShowFilters(false);
        setShowMapControls(false);
        setShowSummary(false);
        break;
      case '[data-tour="story-mode-button"]':
        // Keep cyclone controls visible if available
        if (cycloneForecast && cycloneForecast.length > 0) {
          openMapPanel();
          setShowCycloneControls(true);
        }
        setShowSummary(false);
        break;
      case '[data-tour="export-controls"]':
        setShowFilters(false);
        setShowMapControls(false);
        setShowSummary(false);
        break;
      default:
        break;
    }
  }, [
    isTourOpen,
    tourStepIndex,
    tourSteps,
    openFilterPanel,
    openMapPanel,
    openSummaryPanel,
    cycloneForecast,
  ]);

  const encodeCanvasToBlob = useCallback(async (canvas: HTMLCanvasElement): Promise<Blob> => {
    if (typeof canvas.toBlob === 'function') {
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (blob) {
        return blob;
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const [header, encoded] = dataUrl.split(',');
    if (!header || !encoded) {
      throw new Error('Canvas export fallback failed.');
    }
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] || 'image/png';
    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }, []);

  const waitForMapIdle = useCallback((map: maplibregl.Map, timeoutMs: number): Promise<boolean> => {
    return new Promise(resolve => {
      let settled = false;

      const finish = (isIdle: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        map.off('idle', onIdle);
        resolve(isIdle);
      };

      const onIdle = () => finish(true);
      const timeoutId = window.setTimeout(() => finish(false), timeoutMs);

      map.on('idle', onIdle);

      if (map.loaded()) {
        window.setTimeout(() => {
          if (map.loaded()) {
            finish(true);
          }
        }, 350);
      }
    });
  }, []);

  // Basemap preference modal handlers
  const handleBasemapSelect = useCallback((style: string) => {
    setBasemapStyle(style);
    saveBasemapPreference(style);
    setShowBasemapPreferenceModal(false);
  }, []);

  const handleBasemapSkip = useCallback(() => {
    // Save that preference has been set (even if skipped) to avoid showing modal again
    saveBasemapPreference(basemapStyle);
    setShowBasemapPreferenceModal(false);
  }, [basemapStyle]);

  const handleResetUserPreferences = useCallback(() => {
    resetBasemapPreference();
    showToastNotification(
      'Preferences reset. Reload the page to see the basemap selection dialog again.',
      'success'
    );
  }, []);

  const handleDownloadMap = useCallback(async () => {
    if (!mapInstance || isDownloadingMap) {
      return;
    }

    setIsDownloadingMap(true);
    showToastNotification('Preparing high-fidelity map export...', 'info');

    let exportMap: maplibregl.Map | null = null;
    let exportContainer: HTMLDivElement | null = null;

    try {
      const sourceContainer = mapInstance.getContainer();
      const exportWidth = Math.max(sourceContainer.clientWidth, 640);
      const exportHeight = Math.max(sourceContainer.clientHeight, 480);

      const styleSnapshot = JSON.parse(JSON.stringify(mapInstance.getStyle()));
      const center = mapInstance.getCenter();
      const zoom = mapInstance.getZoom();
      const bearing = mapInstance.getBearing();
      const pitch = mapInstance.getPitch();

      exportContainer = document.createElement('div');
      exportContainer.setAttribute('aria-hidden', 'true');
      exportContainer.style.position = 'fixed';
      exportContainer.style.left = '-10000px';
      exportContainer.style.top = '0';
      exportContainer.style.width = `${exportWidth}px`;
      exportContainer.style.height = `${exportHeight}px`;
      exportContainer.style.opacity = '0';
      exportContainer.style.pointerEvents = 'none';
      document.body.appendChild(exportContainer);

      exportMap = new maplibregl.Map({
        container: exportContainer,
        style: styleSnapshot,
        center: [center.lng, center.lat],
        zoom,
        bearing,
        pitch,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        maxTileCacheSize: 50,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });

      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error('Timed out while initializing export map.'));
        }, 15000);

        exportMap!.once('load', () => {
          window.clearTimeout(timeoutId);
          resolve();
        });
      });

      exportMap.resize();
      const reachedIdle = await waitForMapIdle(exportMap, 12000);

      const exportedCanvas = exportMap.getCanvas();
      const footerHeight = Math.max(64, Math.round(exportedCanvas.height * 0.1));
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = exportedCanvas.width;
      compositeCanvas.height = exportedCanvas.height + footerHeight;

      const context = compositeCanvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to create export image context.');
      }

      context.drawImage(exportedCanvas, 0, 0);
      context.fillStyle = 'rgba(15, 23, 42, 0.95)';
      context.fillRect(0, exportedCanvas.height, compositeCanvas.width, footerHeight);

      const selectedHazardNames =
        filters.selectedHazards.length > 0
          ? filters.selectedHazards
              .map(id => allHazards.find((hazard: any) => hazard.id === id)?.name || id)
              .join(', ')
          : 'All';
      const exportedAt = new Date();
      const timestampText = exportedAt.toLocaleString();
      const headerText = `${COUNTRIES[selectedCountry].name} Disaster Risk Map`;
      const contextText = `${mapStyle.toUpperCase()} view | Hazards: ${selectedHazardNames} | Opacity: ${layerOpacity}%`;
      const attributionText = 'Data: PDIE/THREDDS | Basemap: OpenStreetMap contributors';

      const leftX = Math.max(16, Math.round(compositeCanvas.width * 0.015));
      const bottomY = exportedCanvas.height + footerHeight;
      context.fillStyle = '#f8fafc';
      context.font = `600 ${Math.max(14, Math.round(footerHeight * 0.24))}px system-ui, -apple-system, sans-serif`;
      context.fillText(headerText, leftX, bottomY - Math.round(footerHeight * 0.62));
      context.font = `400 ${Math.max(12, Math.round(footerHeight * 0.2))}px system-ui, -apple-system, sans-serif`;
      context.fillStyle = '#cbd5e1';
      context.fillText(contextText, leftX, bottomY - Math.round(footerHeight * 0.34));
      context.fillStyle = '#94a3b8';
      context.fillText(
        `Exported: ${timestampText}`,
        leftX,
        bottomY - Math.round(footerHeight * 0.12)
      );
      context.textAlign = 'right';
      context.fillText(
        attributionText,
        compositeCanvas.width - leftX,
        bottomY - Math.round(footerHeight * 0.12)
      );
      context.textAlign = 'left';

      const blob = await encodeCanvasToBlob(compositeCanvas);
      const fileDate = new Intl.DateTimeFormat('en-CA').format(exportedAt);
      const filename = `pdie-map-${selectedCountry.toLowerCase()}-${fileDate}.png`;

      const navigatorWithMsSave = navigator as Navigator & {
        msSaveOrOpenBlob?: (blobData: Blob, defaultName?: string) => boolean;
      };
      if (typeof navigatorWithMsSave.msSaveOrOpenBlob === 'function') {
        navigatorWithMsSave.msSaveOrOpenBlob(blob, filename);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      if (!reachedIdle) {
        showToastNotification(
          'Map downloaded, but some remote layers were still loading. Re-export for a fully complete frame.',
          'warning'
        );
      } else {
        showToastNotification(`Map downloaded successfully: ${filename}`, 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToastNotification(`Map export failed: ${message}`, 'warning', {
        label: 'Retry',
        onClick: () => {
          setShowToast(false);
          void handleDownloadMap();
        },
      });
    } finally {
      if (exportMap) {
        exportMap.remove();
      }
      if (exportContainer && exportContainer.parentNode) {
        exportContainer.parentNode.removeChild(exportContainer);
      }
      setIsDownloadingMap(false);
    }
  }, [
    mapInstance,
    isDownloadingMap,
    showToastNotification,
    waitForMapIdle,
    filters.selectedHazards,
    allHazards,
    selectedCountry,
    mapStyle,
    layerOpacity,
    encodeCanvasToBlob,
  ]);

  const handleLogout = useCallback(async () => {
    try {
      const countrySlug = CODE_TO_SLUG[selectedCountry];
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: countrySlug }),
      });
      window.location.href = `/${countrySlug}/login`;
    } catch (_error) {
      showToastNotification('Logout failed. Please try again.', 'warning');
    }
  }, [selectedCountry, showToastNotification]);

  const accessibleDistricts = useMemo(
    () =>
      regionalSummary.map((r: any) => ({
        id: r.Region_ID || r.Region,
        name: r.Region || 'Unknown',
        population: parseFloat(r.Total_Population) || 0,
        economicDamageUSD: parseFloat(r.Total_Loss) || 0,
        buildingCount: parseFloat(r.Total_Buildings) || 0,
        primaryHazard: 'Tropical Cyclone',
      })),
    [regionalSummary]
  );
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Track load request version to cancel stale data loads
  const loadRequestVersion = useRef(0);
  const dataLoadAbortRef = useRef<AbortController | null>(null);
  const supplementaryLoadAbortRef = useRef<AbortController | null>(null);
  const fetchedEventRecordsRef = useRef<import('@/data/eventRecords').EventRecord[]>([]);
  const damageLoadAbortRef = useRef<{
    buildings: AbortController | null;
    roads: AbortController | null;
  }>({
    buildings: null,
    roads: null,
  });

  // Filter events by selected country and region
  // Use expandedEvents for filtering (contains regional-level entries)
  const countryEvents = useMemo(() => {
    let filtered = expandedEvents;

    // Filter by country
    filtered = filtered.filter(e => e.countryCode === selectedCountry);

    // Filter by region/district if one is selected
    if (selectedRegion) {
      filtered = filtered.filter(e => {
        const regionIds = [
          e.districtId,
          e.provinceId,
          e.regionalImpacts?.[0]?.regionId,
          e.regionalImpacts?.[0]?.regionName,
        ]
          .filter(Boolean)
          .map(value => String(value).trim());
        return regionIds.includes(selectedRegion);
      });
    }

    return filtered;
  }, [expandedEvents, selectedCountry, selectedRegion]);

  const countryScopedEventIds = useMemo(
    () =>
      expandedEvents.filter(event => event.countryCode === selectedCountry).map(event => event.id),
    [expandedEvents, selectedCountry]
  );

  const countryHazardScenarioLayers = useMemo(
    () =>
      partnerHazardLayers.filter(
        layer => layer.countryCode === selectedCountry && layer.hazardScenario
      ),
    [partnerHazardLayers, selectedCountry]
  );

  // The scenario actually rendered on the map: the user's explicit pick, or
  // a deterministic default so the map always shows exactly one scenario
  // instead of every SLR x return-period/event combination at once.
  const effectiveHazardScenario = useMemo(
    () => hazardScenarioSelection ?? getDefaultHazardScenario(countryHazardScenarioLayers),
    [hazardScenarioSelection, countryHazardScenarioLayers]
  );

  // National-level loss/exposure totals for the scenario currently shown on
  // the map, so the risk summary panel matches the selected SLR x
  // return-period/event instead of one fixed, scenario-independent figure.
  // Only populated where RiskScenario data has actually been ingested
  // (currently CK only) -- null elsewhere, falling back to the existing
  // static totals.
  const [hazardScenarioRiskSummary, setHazardScenarioRiskSummary] = useState<Record<
    string,
    unknown
  > | null>(null);

  useEffect(() => {
    if (!effectiveHazardScenario) {
      setHazardScenarioRiskSummary(null);
      return;
    }

    const controller = new AbortController();
    fetchHazardScenarioRiskSummary(selectedCountry, effectiveHazardScenario, controller.signal)
      .then(summary => {
        if (!controller.signal.aborted) {
          setHazardScenarioRiskSummary(summary);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHazardScenarioRiskSummary(null);
        }
      });

    return () => controller.abort();
  }, [selectedCountry, effectiveHazardScenario]);

  // Filter hazards and sectors based on what data we actually have
  const hazards = useMemo(() => {
    // allHazards from COUNTRY_CONFIGS already contains only the hazards with WMS data
    // (tropical-cyclone and flood) for all countries that have THREDDS layers.
    return allHazards;
  }, [allHazards]);

  const sectors = useMemo(() => {
    // Dynamically extract sectors that exist in the actual loaded data for this country
    const sectorIds = new Set<string>();

    // Get sectors from exposure data
    exposureData.forEach(item => {
      if (item.sectorId) sectorIds.add(item.sectorId);
    });

    // Get sectors from economic damage data
    economicDamageData.forEach(item => {
      if (item.sectorId) sectorIds.add(item.sectorId);
    });

    // Get sectors from events
    countryEvents.forEach(event => {
      if (event.sectorId) sectorIds.add(event.sectorId);
    });

    // Filter allSectors to only include sectors that exist in the data
    // If no data loaded yet, show all sectors
    if (sectorIds.size === 0) {
      return allSectors;
    }

    return allSectors.filter(sector => sectorIds.has(sector.id));
  }, [allSectors, exposureData, economicDamageData, countryEvents]);

  useEffect(() => {
    const validHazardIds = new Set(hazards.map(hazard => hazard.id));
    const validSectorIds = new Set(sectors.map(sector => sector.id));
    const validEventIds = new Set(countryScopedEventIds);
    const validRegionIds = new Set([
      ...resolvedDistricts.map((district: any) => district.id),
      ...resolvedDistricts.map((district: any) => district.name),
      ...resolvedProvinces.map((province: any) => province.id),
      ...resolvedProvinces.map((province: any) => province.name),
    ]);

    setFilters(prevFilters => {
      const nextHazards = prevFilters.selectedHazards.filter(hazardId =>
        validHazardIds.has(hazardId)
      );
      const nextSectors = prevFilters.selectedSectors.filter(sectorId =>
        validSectorIds.has(sectorId)
      );
      const nextEvents = prevFilters.selectedEvents.filter(eventId => validEventIds.has(eventId));

      if (
        haveSameItems(nextHazards, prevFilters.selectedHazards) &&
        haveSameItems(nextSectors, prevFilters.selectedSectors) &&
        haveSameItems(nextEvents, prevFilters.selectedEvents)
      ) {
        return prevFilters;
      }

      return {
        ...prevFilters,
        selectedHazards: nextHazards,
        selectedSectors: nextSectors,
        selectedEvents: nextEvents,
      };
    });

    setSelectedRegion(prevRegion => {
      if (!prevRegion || validRegionIds.has(prevRegion)) {
        return prevRegion;
      }
      return null;
    });
  }, [hazards, sectors, countryScopedEventIds, resolvedDistricts, resolvedProvinces]);

  // Keep exports aligned with the active filter pipeline used in analytics panels.
  const {
    filteredEvents: filteredDashboardEvents,
    filteredExposureData: baseExportExposureData,
    filteredEconomicDamageData: exportEconomicDamageData,
    aggregatedEventData,
  } = useMemo(
    () =>
      getFilteredData({
        events: countryEvents,
        exposureData,
        economicDamageData,
        filters,
        districts: resolvedDistricts,
        provinces: resolvedProvinces,
      }),
    [countryEvents, exposureData, economicDamageData, filters, resolvedDistricts, resolvedProvinces]
  );

  const exportEvents = filteredDashboardEvents;

  const exportExposureData = useMemo(() => {
    if (!selectedRegion) {
      return baseExportExposureData;
    }

    const selectedDistrict = resolvedDistricts.find(
      (district: any) => district.id === selectedRegion || district.name === selectedRegion
    );
    const selectedProvince = resolvedProvinces.find(
      (province: any) => province.id === selectedRegion || province.name === selectedRegion
    );
    const selectedRegionName = selectedDistrict?.name || selectedProvince?.name || selectedRegion;
    const normalizedSelectedIds = new Set([
      selectedRegion.toLowerCase(),
      selectedRegionName.toLowerCase(),
    ]);

    return baseExportExposureData.filter((row: any) => {
      const rawRegion = row.region;
      if (!rawRegion) {
        return false;
      }
      const normalizedRegion = String(rawRegion).trim().toLowerCase();
      return normalizedSelectedIds.has(normalizedRegion);
    });
  }, [baseExportExposureData, selectedRegion, resolvedDistricts, resolvedProvinces]);

  const isExportDisabled = useMemo(() => {
    const hasFilteredEvents = exportEvents.some(e => (e.totalEconomicDamage || 0) > 0);
    return (
      !hasFilteredEvents && exportExposureData.length === 0 && exportEconomicDamageData.length === 0
    );
  }, [exportEvents, exportExposureData, exportEconomicDamageData]);

  const currentAggregationLabel = useMemo(
    () => getAggregationLabel(selectedCountry, filters.aggregationLevel),
    [selectedCountry, filters.aggregationLevel]
  );

  const metadataHazardSummary = useMemo(() => {
    if (filters.selectedHazards.length === 0) {
      return activeWmsLayers.length > 0 ? `${activeWmsLayers.length} active layers` : 'All hazards';
    }

    return filters.selectedHazards
      .map(hazardId => hazards.find(hazard => hazard.id === hazardId)?.name || hazardId)
      .join(', ');
  }, [filters.selectedHazards, hazards, activeWmsLayers.length]);

  const activeContextDate = useMemo(() => {
    const eventDate = events[0]?.date;
    if (!eventDate) return 'Not available';

    const parsed = new Date(eventDate);
    return Number.isNaN(parsed.getTime())
      ? eventDate
      : parsed.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
  }, [events, selectedCountry]);

  const headlineMetrics = useMemo(() => {
    const selectedRows = selectedRegion
      ? regionalSummary.filter((row: any) => {
          return [row?.Region_ID, row?.['Region.ID'], row?.Region]
            .filter(Boolean)
            .map((value: unknown) => String(value).trim())
            .includes(selectedRegion);
        })
      : regionalSummary;

    const csvPopulationTotal = selectedRows.reduce(
      (sum: number, row: any) => sum + (Number(row.Population_Exposed_To_Any_Hazard) || 0),
      0
    );
    const csvLossTotal = selectedRows.reduce(
      (sum: number, row: any) => sum + (Number(row.Total_Loss) || 0),
      0
    );
    const topCsvRegion = [...selectedRows].sort(
      (left: any, right: any) => (Number(right.Total_Loss) || 0) - (Number(left.Total_Loss) || 0)
    )[0];

    const topAggregatedArea = [...aggregatedEventData].sort(
      (left, right) => (right.totalEconomicDamage || 0) - (left.totalEconomicDamage || 0)
    )[0];

    const exposedPopulation =
      csvPopulationTotal > 0
        ? csvPopulationTotal
        : aggregatedEventData.reduce(
            (sum, row) => sum + (Number(row.totalAffectedPopulation) || 0),
            0
          );
    const estimatedLoss =
      csvLossTotal > 0
        ? csvLossTotal
        : aggregatedEventData.reduce((sum, row) => sum + (Number(row.totalEconomicDamage) || 0), 0);
    const topAreaName =
      topCsvRegion?.Region ||
      topAggregatedArea?.name ||
      `No ${countryUi.broaderAreaSingular.toLowerCase()} selected`;
    const activeLayersCount =
      filters.selectedHazards.length > 0
        ? filters.selectedHazards.length
        : [showWindLayer, showInundationLayer, showBuildingsLayer, showRoadsLayer].filter(Boolean)
            .length;

    return [
      {
        id: 'headline-population',
        label: 'Exposed population',
        value: exposedPopulation,
        subtitle: `${COUNTRIES[selectedCountry].name} current view`,
        icon: Users,
        color: 'border-cyan-500/40 text-slate-100',
      },
      {
        id: 'headline-loss',
        label: 'Estimated loss',
        value: estimatedLoss > 0 ? `$${Math.round(estimatedLoss).toLocaleString()}` : '$0',
        subtitle: 'Modeled direct impact',
        icon: DollarSign,
        color: 'border-rose-500/40 text-slate-100',
      },
      {
        id: 'headline-top-area',
        label: `Highest impact ${countryUi.broaderAreaSingular.toLowerCase()}`,
        value: topAreaName,
        subtitle: selectedRegion ? 'Focused selection' : 'Top loss concentration',
        icon: MapPin,
        color: 'border-amber-500/40 text-slate-100',
        onClick: topAreaName && topAggregatedArea ? () => setShowSummary(true) : undefined,
      },
      {
        id: 'headline-layers',
        label: 'Active hazard context',
        value: activeLayersCount,
        subtitle: `${currentAggregationLabel} resolution`,
        icon: Layers,
        color: 'border-emerald-500/40 text-slate-100',
      },
    ];
  }, [
    selectedRegion,
    regionalSummary,
    aggregatedEventData,
    countryUi.broaderAreaSingular,
    selectedCountry,
    filters.selectedHazards.length,
    showWindLayer,
    showInundationLayer,
    showBuildingsLayer,
    showRoadsLayer,
    currentAggregationLabel,
  ]);

  // Load real data function
  const handleCycloneTimestepChange = useCallback(
    (_timestep: any | null, index: number) => {
      // Bounds validation
      if (index < 0 || index >= (cycloneForecast?.length ?? 0)) return;
      // Use functional setState to access current value without dependency
      setCurrentCycloneIndex(prevIndex => {
        if (index === prevIndex) return prevIndex;
        if (process.env.NODE_ENV !== 'production') {
          console.log('Cyclone timestep changed to:', index);
        }
        return index;
      });
    },
    [cycloneForecast]
  );

  const handleCycloneVisibilityChange = useCallback((visible: boolean) => {
    setShowCycloneControls(visible);
    if (!visible) {
      setIsCyclonePlaying(false);
    }
  }, []);

  // Story mode side effects: pause playback and show controls on entry
  useEffect(() => {
    if (storyMode && isCyclonePlaying) {
      setIsCyclonePlaying(false);
    }
  }, [storyMode, isCyclonePlaying]);

  // Stabilized loadData with useCallback to prevent stale closures
  const loadData = useCallback(async () => {
    // Increment version to invalidate any in-flight requests
    const currentVersion = ++loadRequestVersion.current;

    if (dataLoadAbortRef.current) {
      dataLoadAbortRef.current.abort('New data load requested');
    }
    if (supplementaryLoadAbortRef.current) {
      supplementaryLoadAbortRef.current.abort('New supplementary data load requested');
    }
    const controller = new AbortController();
    dataLoadAbortRef.current = controller;

    setIsLoadingData(true);
    setDataLoadError(null);
    setDamagedBuildings(null);
    setDamagedRoads(null);
    setExposureData([]);
    setEconomicDamageData([]);
    setSectorEconomicData([]);
    setAssetEconomicData([]);
    setAssetExposureData(null);
    setImpactByAssetType([]);
    setImpactBySector(undefined);
    setNationalSummary(undefined);
    setRegionalSummary([]);
    setRegionalSummaryBySector([]);
    setCycloneTrackData(null);
    setCycloneForecast(null);
    setExpandedEvents([]);
    setEvents([]);
    setPartnerHazardLayers([]);
    damageAutoLoadRequestedRef.current = { buildings: false, roads: false };
    try {
      const realData = await loadAllRealData({
        signal: controller.signal,
        includeDamagedAssets: true,
        includeSupplementaryData: true,
        countryCode: selectedCountry,
        selectedEventIds: filters.selectedEvents,
        dateRange: filters.dateRange,
      });

      // Check if this request is still current (not superseded by a newer request)
      if (currentVersion !== loadRequestVersion.current) {
        console.log('Ignoring stale data load response');
        return;
      }

      if (realData.fetchedEventRecords && realData.fetchedEventRecords.length > 0) {
        fetchedEventRecordsRef.current = realData.fetchedEventRecords;
      }

      if (realData.events && realData.events.length > 0) {
        setEvents(realData.events);
        // Use sector-specific events for filtering if available, otherwise expand the main events
        const expanded =
          realData.sectorSpecificEvents && realData.sectorSpecificEvents.length > 0
            ? realData.sectorSpecificEvents
            : expandEventsToRegionalEntries(realData.events);
        setExpandedEvents(expanded);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Loaded ${realData.events.length} event(s) from real data`);
          console.log(
            `   - Expanded to ${expanded.length} regional entries for filtering (with sector data)`
          );
        }
      }

      if (realData.dataSourceInfo) {
        const trackSource =
          realData.dataSourceInfo.cycloneTrackSource === 'partner_api'
            ? 'Partner API'
            : 'Local Files';
        const eventSource =
          realData.dataSourceInfo.eventMetadataSource === 'partner_api'
            ? 'Partner API'
            : 'Local Files';
        const riskSource =
          realData.dataSourceInfo.riskDataSource === 'partner_api' ? 'Partner API' : 'Local Files';
        const hazardSource =
          realData.dataSourceInfo.hazardLayerSource === 'partner_api'
            ? 'Partner API'
            : 'Static Config';
        const sourceKinds = new Set([
          realData.dataSourceInfo.cycloneTrackSource,
          realData.dataSourceInfo.eventMetadataSource,
          realData.dataSourceInfo.riskDataSource ?? 'local_files',
          realData.dataSourceInfo.hazardLayerSource === 'partner_api'
            ? 'partner_api'
            : 'local_files',
        ]);
        setDataSourceMode(
          sourceKinds.size === 1 ? (sourceKinds.has('partner_api') ? 'partner' : 'local') : 'mixed'
        );
        setDevDataSourceLabel(
          `Track: ${trackSource} | Event: ${eventSource} | Risk: ${riskSource} | Hazards: ${hazardSource}`
        );
        setDataSourceSummary(
          `Track: ${realData.dataSourceInfo.cycloneTrackSource === 'partner_api' ? 'API' : 'Local'} | Event: ${realData.dataSourceInfo.eventMetadataSource === 'partner_api' ? 'API' : 'Local'} | Risk: ${realData.dataSourceInfo.riskDataSource === 'partner_api' ? 'API' : 'Local'} | Hazards: ${realData.dataSourceInfo.hazardLayerSource === 'partner_api' ? 'API' : 'Static'}`
        );
      } else {
        setDataSourceMode('local');
        setDevDataSourceLabel(
          'Track: Local Files | Event: Local Files | Risk: Local Files | Hazards: Static Config'
        );
        setDataSourceSummary('Track: Local | Event: Local | Risk: Local | Hazards: Static');
      }

      setPartnerHazardLayers(realData.partnerHazardLayers || []);
      // Drop the user's scenario pick if it no longer exists in the freshly
      // loaded layer set (e.g. switching away from a multi-scenario country)
      // so the selector falls back to a valid default instead of pointing at
      // a scenario that will never render.
      setHazardScenarioSelection(prev => {
        if (!prev) return prev;
        const layers = realData.partnerHazardLayers || [];
        const stillValid = layers.some(
          layer =>
            layer.hazardScenario &&
            layer.hazardScenario.product === prev.product &&
            layer.hazardScenario.slrScenarioM === prev.slrScenarioM &&
            layer.hazardScenario.returnPeriodYears === prev.returnPeriodYears &&
            layer.hazardScenario.eventLabel === prev.eventLabel
        );
        return stillValid ? prev : null;
      });

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

      if (realData.regionalSummary) {
        setRegionalSummary(realData.regionalSummary);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Loaded ${realData.regionalSummary.length} regional summaries`);
        }
      }

      setRegionalImpactsGeoJSON(realData.regionalImpacts ?? null);

      if (realData.regionalSummaryBySector) {
        setRegionalSummaryBySector(realData.regionalSummaryBySector);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Loaded ${realData.regionalSummaryBySector.length} regional sector records`);
        }
      }

      if (realData.cycloneTrack) {
        setCycloneTrackData(realData.cycloneTrack);
      }

      if (realData.damagedRoads) {
        setDamagedRoads(realData.damagedRoads);
      }

      if (realData.damagedBuildings) {
        setDamagedBuildings(realData.damagedBuildings);
      }

      if (realData.cycloneForecast) {
        setCycloneForecast(realData.cycloneForecast);

        // Start playback at the timestep nearest the selected country's center.
        // This avoids an "empty/broken" feel for tracks that begin far off-screen
        // (e.g., TC Harold starts west of Tonga before approaching the islands).
        const [countryLng, countryLat] = COUNTRIES[selectedCountry].center;
        const nearestIndex = realData.cycloneForecast.reduce(
          (bestIndex: number, point: any, index: number, arr: any[]) => {
            const dx = (point.longitude ?? 0) - countryLng;
            const dy = (point.latitude ?? 0) - countryLat;
            const distSq = dx * dx + dy * dy;

            const bestPoint = arr[bestIndex];
            const bestDx = (bestPoint?.longitude ?? 0) - countryLng;
            const bestDy = (bestPoint?.latitude ?? 0) - countryLat;
            const bestDistSq = bestDx * bestDx + bestDy * bestDy;

            return distSq < bestDistSq ? index : bestIndex;
          },
          0
        );
        setCurrentCycloneIndex(nearestIndex);

        if (process.env.NODE_ENV !== 'production') {
          console.log(`Loaded ${realData.cycloneForecast.length} cyclone forecast timesteps`);
        }
      }

      // Load supplementary analytics data in the background.
      const supplementaryController = new AbortController();
      supplementaryLoadAbortRef.current = supplementaryController;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DashboardView] Starting supplementary load for ${selectedCountry}`);
      }
      void loadSupplementaryRealData({
        signal: supplementaryController.signal,
        countryCode: selectedCountry,
        regionalSummary: (realData.regionalSummary || []) as Array<Record<string, unknown>>,
      })
        .then(supplementary => {
          if (
            supplementaryController.signal.aborted ||
            currentVersion !== loadRequestVersion.current
          ) {
            return;
          }

          if (process.env.NODE_ENV !== 'production') {
            console.log(`[DashboardView] Supplementary load complete for ${selectedCountry}`, {
              sectorEconomicData: supplementary.sectorEconomicData?.length || 0,
              assetEconomicData: supplementary.assetEconomicData?.length || 0,
            });
          }

          if (supplementary.nationalSummary) setNationalSummary(supplementary.nationalSummary);
          if (supplementary.impactByAsset) setImpactByAssetType(supplementary.impactByAsset);
          if (supplementary.impactBySector) setImpactBySector(supplementary.impactBySector);
          if (supplementary.regionalSummaryBySector) {
            setRegionalSummaryBySector(supplementary.regionalSummaryBySector);
          }
          if (supplementary.exposureData) setExposureData(supplementary.exposureData);
          if (supplementary.economicDamageData) {
            setEconomicDamageData(supplementary.economicDamageData);
          }
          if (supplementary.sectorEconomicData) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `[DashboardView] Setting sectorEconomicData: ${supplementary.sectorEconomicData.length} rows`
              );
            }
            setSectorEconomicData(supplementary.sectorEconomicData);
          }
          if (supplementary.assetEconomicData) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `[DashboardView] Setting assetEconomicData: ${supplementary.assetEconomicData.length} rows`
              );
            }
            setAssetEconomicData(supplementary.assetEconomicData);
          }
          if (supplementary.assetExposureData)
            setAssetExposureData(supplementary.assetExposureData);
          if (supplementary.sectorSpecificEvents && supplementary.sectorSpecificEvents.length > 0) {
            setExpandedEvents(supplementary.sectorSpecificEvents);
          }
        })
        .catch(error => {
          if (supplementaryController.signal.aborted) {
            return;
          }
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[DashboardView] Supplementary data loading failed:', error);
          }
        })
        .finally(() => {
          if (supplementaryLoadAbortRef.current === supplementaryController) {
            supplementaryLoadAbortRef.current = null;
          }
        });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      // Check if this request is still current before showing error
      if (currentVersion !== loadRequestVersion.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Ignoring error from stale data load');
        }
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
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
        },
      });
      setShowToast(true);
    } finally {
      // Only update loading state if this is still the current request
      if (currentVersion === loadRequestVersion.current) {
        setIsLoadingData(false);
      }
      if (dataLoadAbortRef.current === controller) {
        dataLoadAbortRef.current = null;
      }
    }
  }, [selectedCountry, filters.selectedEvents, filters.dateRange]);

  // Load real data on mount and when country/event temporal context changes
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
      const regionName =
        resolvedDistricts.find(
          (district: any) => district.id === selectedRegion || district.name === selectedRegion
        )?.name || selectedRegion;
      setToastMessage(`Region selected: ${regionName}`);
      setToastType('info');
      setToastAction({
        label: 'View Summary',
        onClick: () => {
          setShowSummary(true);
          setShowToast(false);
        },
      });
      setShowToast(true);
    }
  }, [selectedRegion, resolvedDistricts]);

  useEffect(() => {
    if (!damageLoadError) return;
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(damageLoadError);
    setToastType('warning');
    setShowToast(true);
    toastTimeoutRef.current = setTimeout(() => setShowToast(false), 5000);
  }, [damageLoadError]);

  useEffect(() => {
    const activePanel = showFilters
      ? filterPanelRef.current
      : showMapControls
        ? mapPanelRef.current
        : showSummary
          ? summaryPanelRef.current
          : null;
    if (!activePanel) return;

    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      "[tabindex]:not([tabindex='-1'])",
    ];

    const getFocusable = () =>
      Array.from(activePanel.querySelectorAll<HTMLElement>(focusableSelectors.join(','))).filter(
        el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden')
      );

    const focusables = getFocusable();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (first) {
      first.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showFilters) setShowFilters(false);
        if (showMapControls) setShowMapControls(false);
        if (showSummary) setShowSummary(false);
        return;
      }

      if (event.key !== 'Tab' || focusables.length === 0) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showFilters, showMapControls, showSummary]);

  const showMapOverlays =
    (!allowCountrySwitch || !showCountrySelector) && !isLoadingData && !dataLoadError;

  const isDamageLoading = isLoadingDamage.buildings || isLoadingDamage.roads;
  const isMapDataLoading = isLoadingData || isDamageLoading || isDownloadingMap;
  const mapDataLoadingLabel = isDownloadingMap
    ? 'Preparing map export...'
    : isLoadingData
      ? `Loading ${COUNTRIES[selectedCountry].name} data...`
      : isDamageLoading
        ? 'Loading damaged assets...'
        : 'Loading map/data...';
  const isHazardsLoading = isLoadingLayers;
  const hazardsLoadingLabel = 'Loading hazard layers...';
  const hazardMinZoom = 6;
  const hazardZoomBlocked =
    (showWindLayer || showInundationLayer) && mapZoom !== null && mapZoom < hazardMinZoom;

  return (
    <div className="flex flex-col h-screen bg-transparent overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 glass-panel border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(320px,1.05fr)_minmax(460px,0.95fr)_auto] xl:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 md:hidden">
              <button
                onClick={() => {
                  openMapPanel();
                  setShowSummary(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  showMapControls
                    ? 'bg-purple-500/20 text-purple-200 border-purple-500/40 shadow-sm'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                }`}
                aria-label="Open map controls panel"
                aria-pressed={showMapControls}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Map
              </button>
              <button
                onClick={() => {
                  openFilterPanel('filters');
                  setShowSummary(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  showFilters
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                }`}
                aria-label="Open filters panel"
                aria-pressed={showFilters}
              >
                <Layers className="w-3.5 h-3.5" />
                Filters
              </button>
              <button
                onClick={openSummaryPanel}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  showSummary
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                }`}
                aria-label="Open summary panel"
                aria-pressed={showSummary}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Summary
              </button>
              {!!cycloneForecast && (
                <button
                  onClick={() => {
                    openFilterPanel('cyclone');
                    setShowSummary(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                    showFilters && filterPanelTab === 'cyclone'
                      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                  }`}
                  aria-label="Open cyclone timeline"
                  aria-pressed={showFilters && filterPanelTab === 'cyclone'}
                >
                  <Wind className="w-3.5 h-3.5" />
                  Cyclone
                </button>
              )}
            </div>
            <div
              className="flex min-w-0 items-start gap-3 px-1 py-1 sm:gap-4"
              data-tour="dashboard-hero"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/55">
                <CountryFlag
                  countryCode={selectedCountry}
                  aria-label={COUNTRIES[selectedCountry].name}
                  title={COUNTRIES[selectedCountry].name}
                  className="h-6 w-8 rounded-[4px]"
                />
              </div>
              <div className="min-w-0">
                <h1 className="max-w-[24ch] text-[1.3rem] font-semibold leading-[1.06] tracking-tight text-white sm:max-w-none sm:text-[1.75rem]">
                  {platformName}
                </h1>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  {isLoadingData
                    ? `Loading ${COUNTRIES[selectedCountry].name} operational view...`
                    : `Active event context: ${activeCycloneName}`}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden min-w-0 md:flex xl:justify-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-700/40 bg-slate-900/35 p-2 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.9)]">
              <button
                onClick={openMapPanel}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  showMapControls
                    ? 'border border-purple-500/35 bg-purple-500/15 text-purple-200'
                    : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                }`}
                aria-pressed={showMapControls}
                aria-label={showMapControls ? 'Map controls panel open' : 'Open map controls'}
                data-tour="map-panel-toggle"
              >
                <MapIcon className="h-4 w-4" />
                <span>Map</span>
              </button>
              <button
                onClick={() => openFilterPanel('filters')}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  showFilters && filterPanelTab === 'filters'
                    ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
                    : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                }`}
                aria-pressed={showFilters && filterPanelTab === 'filters'}
                aria-label={showFilters ? 'Filters panel open' : 'Open data filters'}
                data-tour="filter-panel-toggle"
              >
                <Layers className="h-4 w-4" />
                <span>Filters</span>
              </button>
              <button
                onClick={() => setShowAnalytics(current => !current)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  showAnalytics
                    ? 'border border-blue-500/35 bg-blue-500/15 text-blue-200'
                    : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                }`}
                aria-pressed={showAnalytics}
                aria-label={showAnalytics ? 'Hide data workspace' : 'Show data workspace'}
                data-tour="data-workspace-toggle"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Data</span>
              </button>
              <button
                onClick={() => setShowSummary(current => !current)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  showSummary
                    ? 'border border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
                    : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                }`}
                aria-pressed={showSummary}
                aria-label={showSummary ? 'Hide impact summary' : 'Show impact summary'}
                data-tour="summary-panel-toggle"
              >
                <Layers className="h-4 w-4" />
                <span>Summary</span>
              </button>
            </div>
          </div>

          <div className="min-w-0 xl:justify-self-end">
            <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
              <div
                className="flex min-w-max items-center gap-2 rounded-2xl border border-slate-700/40 bg-slate-900/35 p-2 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.9)]"
                data-tour="export-controls"
              >
                <button
                  onClick={() => setShowMetadata(current => !current)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-500/45 hover:bg-cyan-500/15 sm:min-h-12 sm:text-sm"
                  aria-expanded={showMetadata}
                  aria-controls="dashboard-metadata"
                  aria-label={showMetadata ? 'Hide metadata' : 'Show metadata'}
                >
                  <span>Metadata</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-300 ${
                      showMetadata ? 'rotate-0' : 'rotate-180'
                    }`}
                  />
                </button>

                {allowCountrySwitch ? (
                  <button
                    onClick={() => setShowCountrySelector(!showCountrySelector)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-700/35 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/55 sm:min-h-12 sm:text-sm"
                    aria-label={
                      selectedCountry
                        ? `Current country: ${COUNTRIES[selectedCountry].name}. Click to change country`
                        : 'Select country'
                    }
                    aria-expanded={showCountrySelector}
                    aria-haspopup="dialog"
                    aria-controls="country-selector-panel"
                    title="Select country"
                  >
                    {selectedCountry ? (
                      <>
                        <CountryFlag
                          countryCode={selectedCountry}
                          aria-label={COUNTRIES[selectedCountry].name}
                          title={COUNTRIES[selectedCountry].name}
                          className="h-4 w-4"
                        />
                        <span className="font-medium max-[420px]:hidden">
                          {COUNTRIES[selectedCountry].name}
                        </span>
                      </>
                    ) : (
                      <>
                        <MapIcon className="h-4 w-4" />
                        <span>Region</span>
                      </>
                    )}
                  </button>
                ) : selectedCountry ? (
                  <div
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-700/40 px-3 py-2 text-xs text-slate-300 sm:min-h-12 sm:text-sm"
                    aria-label={`Country: ${COUNTRIES[selectedCountry].name}`}
                  >
                    <CountryFlag
                      countryCode={selectedCountry}
                      aria-label={COUNTRIES[selectedCountry].name}
                      title={COUNTRIES[selectedCountry].name}
                      className="h-4 w-4"
                    />
                    <span className="font-medium max-[420px]:hidden">
                      {COUNTRIES[selectedCountry].name}
                    </span>
                  </div>
                ) : null}

                <div
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium sm:min-h-12 sm:text-sm ${dataSourceBadgeClassName}`}
                  aria-label={dataSourceBadgeLabel}
                  title={devDataSourceLabel || dataSourceBadgeLabel}
                >
                  <Layers className="h-4 w-4" />
                  <span>{dataSourceBadgeLabel}</span>
                </div>

                <button
                  onClick={startTour}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-700/35 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/55 sm:min-h-12 sm:text-sm"
                  aria-label="Start guided tour"
                  title="Start Guided Tour"
                >
                  <Compass className="h-4 w-4" />
                  <span className="font-medium">Tour</span>
                </button>

                {showLogout && (
                  <button
                    onClick={() => void handleLogout()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-700/30 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/50 sm:min-h-12 sm:text-sm"
                    aria-label="Log out of country dashboard"
                    title="Log out"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                )}

                <ShareLinkButton
                  path={`/${CODE_TO_SLUG[selectedCountry]}`}
                  mapState={{
                    center: mapInstance
                      ? {
                          lat: mapInstance.getCenter().lat,
                          lng: mapInstance.getCenter().lng,
                        }
                      : undefined,
                    zoom: mapInstance?.getZoom(),
                    region: selectedRegion,
                    hazards: filters.selectedHazards,
                    sectors: filters.selectedSectors,
                    events: filters.selectedEvents,
                    dateStart: filters.dateRange.start || undefined,
                    dateEnd: filters.dateRange.end || undefined,
                    aggregation:
                      filters.aggregationLevel === 'national'
                        ? undefined
                        : filters.aggregationLevel,
                    mapStyle,
                    basemap: basemapStyle,
                    cycloneIndex: currentCycloneIndex,
                    storyMode,
                    showSummary,
                    showFilters,
                  }}
                  compact
                  className="min-h-11 rounded-xl border-slate-600/60 bg-slate-700/35 px-3 py-2 hover:bg-slate-700/55 sm:min-h-12"
                />

                <button
                  onClick={() => void handleDownloadMap()}
                  disabled={isDownloadingMap}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:text-sm"
                  aria-label="Download map as PNG"
                  title="Download current map view as PNG image"
                >
                  {isDownloadingMap ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Map PNG</span>
                    </>
                  )}
                </button>

                <ExportButtons
                  events={exportEvents}
                  exposureData={exportExposureData}
                  economicDamageData={exportEconomicDamageData}
                  hazards={hazards}
                  sectors={sectors}
                  disabled={isExportDisabled}
                  countryName={COUNTRIES[selectedCountry].name}
                  fullCountryName={COUNTRIES[selectedCountry].fullName}
                  countryCode={selectedCountry}
                  cycloneEventName={exportEvents[0]?.name || countryEvents[0]?.name}
                  impactBySector={impactBySector}
                  nationalSummary={nationalSummary}
                  mapInstance={mapInstance}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          id="dashboard-metadata"
          className={`mt-3 grid transition-all duration-300 ease-out ${
            showMetadata ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div
              className={`rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-2.5 transition-all duration-300 ${
                showMetadata ? 'translate-y-0' : '-translate-y-1'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 font-semibold text-blue-100">
                  Country: {COUNTRIES[selectedCountry].name}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Event: {activeCycloneName}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Hazards: {metadataHazardSummary}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Resolution: {currentAggregationLabel}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Source: {devDataSourceLabel || 'PDIE local dataset'}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Reference date: {activeContextDate}
                </span>
                <span className="text-slate-400">
                  Map first. Open summary, data, or cyclone tools when needed.
                </span>
              </div>
            </div>
          </div>
        </div>

        {!showAnalytics && !showSummary && (
          <TopInsightsCards insights={headlineMetrics} className="mt-2" />
        )}

        {/* Active Filters Bar - Single line with horizontal scroll */}
        <div className="mt-1 pt-1.5 border-t border-slate-800/60">
          <ActiveFilters
            filters={filters}
            hazards={hazards}
            sectors={sectors}
            onClearFilter={(type, id) => {
              setFilters(prevFilters => {
                if (type === 'all') {
                  return {
                    selectedHazards: [],
                    selectedSectors: [],
                    selectedEvents: [],
                    dateRange: { start: '', end: '' },
                    aggregationLevel: 'district',
                  };
                }

                if (type === 'hazard') {
                  if (!id) {
                    return {
                      ...prevFilters,
                      selectedHazards: [],
                    };
                  }
                  return {
                    ...prevFilters,
                    selectedHazards: prevFilters.selectedHazards.filter(
                      hazardId => hazardId !== id
                    ),
                  };
                }

                if (type === 'sector') {
                  if (!id) {
                    return {
                      ...prevFilters,
                      selectedSectors: [],
                    };
                  }
                  return {
                    ...prevFilters,
                    selectedSectors: prevFilters.selectedSectors.filter(
                      sectorId => sectorId !== id
                    ),
                  };
                }

                if (type === 'event') {
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
        {/* Mobile Unified Backdrop - closes any open panel */}
        {(showFilters || showMapControls || showSummary) && (
          <button
            className="fixed inset-0 bg-black/50 z-[35] md:hidden backdrop-blur-[2px]"
            onClick={() => {
              setShowFilters(false);
              setShowMapControls(false);
              setShowSummary(false);
            }}
            aria-label="Close panel"
          />
        )}
        <div
          ref={filterPanelRef}
          data-tour="filter-panel"
          className={`fixed inset-y-0 left-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out shadow-2xl
            ${showFilters ? 'translate-x-0' : '-translate-x-full'} 
            md:static md:transform-none md:shadow-none ${showFilters ? 'md:w-80' : 'md:w-0 md:overflow-hidden'}`}
        >
          <div className="md:hidden absolute top-4 right-4 z-[45]">
            <button
              onClick={() => setShowFilters(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close filters panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FilterPanel
            hazards={hazards}
            sectors={sectors}
            events={events}
            districts={resolvedDistricts}
            countryCode={selectedCountry}
            filters={filters}
            onFilterChange={setFilters}
            exposureData={exposureData}
            economicDamageData={economicDamageData}
            accessibleDistricts={accessibleDistricts}
            onDistrictSelect={districtId => {
              const region = regionalSummary.find(
                (r: any) => r.Region_ID === districtId || r.Region === districtId
              );
              if (region) {
                setSelectedRegion(region.Region_ID ?? region.Region);
              }
            }}
          />
        </div>

        {/* Map Controls Panel */}
        <div
          ref={mapPanelRef}
          data-tour="map-panel"
          className={`fixed inset-y-0 left-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out shadow-2xl
            ${showMapControls ? 'translate-x-0' : '-translate-x-full'} 
            md:static md:transform-none md:shadow-none ${showMapControls ? 'md:w-80' : 'md:w-0 md:overflow-hidden'}`}
        >
          <div className="md:hidden absolute top-4 right-4 z-[45]">
            <button
              onClick={() => setShowMapControls(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close map controls panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <MapPanel
            mapStyle={mapStyle}
            onMapStyleChange={setMapStyle}
            is3DView={is3DView}
            on3DViewToggle={setIs3DView}
            extrusionMode={extrusionMode}
            onExtrusionModeChange={setExtrusionMode}
            extrusionExaggeration={extrusionExaggeration}
            onExtrusionExaggerationChange={setExtrusionExaggeration}
            showWindLayer={showWindLayer}
            showInundationLayer={showInundationLayer}
            onWindLayerToggle={setShowWindLayer}
            onInundationLayerToggle={setShowInundationLayer}
            showBuildingsLayer={showBuildingsLayer}
            showRoadsLayer={showRoadsLayer}
            onBuildingsLayerToggle={handleBuildingsLayerToggle}
            onRoadsLayerToggle={handleRoadsLayerToggle}
            showCycloneLayer={showCycloneControls}
            onCycloneLayerToggle={handleCycloneVisibilityChange}
            hasCycloneData={!!cycloneForecast}
            isCyclonePlaying={isCyclonePlaying}
            onToggleCyclonePlaying={setIsCyclonePlaying}
            cycloneControlsHostRef={cycloneControlsHostRef}
            storyMode={storyMode}
            layerOpacity={layerOpacity}
            onLayerOpacityChange={setLayerOpacity}
            legendSettings={legendSettings}
            onLegendSettingsChange={setLegendSettings}
            countryCode={selectedCountry}
            isMapDataLoading={isMapDataLoading}
            isHazardsLoading={isHazardsLoading}
            hazardZoomBlocked={hazardZoomBlocked}
            onResetUserPreferences={handleResetUserPreferences}
            hazardScenarioLayers={countryHazardScenarioLayers}
            hazardScenarioSelection={effectiveHazardScenario}
            onHazardScenarioChange={setHazardScenarioSelection}
          />
        </div>

        {/* Center Map + Bottom Tabs */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Map Area */}
          <div className="flex-1 min-h-0 relative">
            {/* Determine if panels are open or selections are active */}
            {(() => {
              const hasSelection = !!selectedEvent || !!selectedRegion;

              return (
                <>
                  {showMapOverlays && (
                    <UnifiedMapLegend
                      mode={mapStyle}
                      visible={true}
                      hasSelection={hasSelection}
                      dataSource="PDIE Real Data"
                      temporalScope="Cumulative"
                      dataValues={legendDataValues}
                      isLeftPanelOpen={showFilters}
                      showBuildings={showBuildingsLayer && !!damagedBuildings}
                      showRoads={showRoadsLayer && !!damagedRoads}
                      showCyclone={showCycloneControls && !!cycloneForecast}
                      onZoomToBuildings={handleZoomToBuildings}
                      onZoomToRoads={handleZoomToRoads}
                      activeWmsLayers={activeWmsLayers}
                      countryCode={selectedCountry}
                      legendSettings={legendSettings}
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
              is3DView={is3DView}
              extrusionMode={extrusionMode}
              extrusionExaggeration={extrusionExaggeration}
              showWindLayer={showWindLayer}
              showInundationLayer={showInundationLayer}
              onLayersLoadingChange={setIsLoadingLayers}
              onActiveWmsLayersChange={setActiveWmsLayers}
              partnerHazardLayers={partnerHazardLayers}
              hazardScenarioSelection={effectiveHazardScenario}
              layerOpacity={layerOpacity}
              legendSettings={legendSettings}
              damagedBuildings={showBuildingsLayer ? damagedBuildings : null}
              damagedRoads={showRoadsLayer ? damagedRoads : null}
              regionalImpactsData={regionalImpactsGeoJSON}
              regionalSummaryData={regionalSummary}
              cycloneTrackData={cycloneTrackData}
              cycloneForecast={cycloneForecast}
              aggregationLevel={filters.aggregationLevel}
              showOverlays={showMapOverlays}
              onCycloneTimestepChange={handleCycloneTimestepChange}
              showCycloneAnimation={showCycloneControls}
              onCycloneAnimationChange={handleCycloneVisibilityChange}
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
                  <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-100 mb-2">
                    Loading {COUNTRIES[selectedCountry].name}...
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
                  <h3 className="text-lg font-semibold text-slate-100 mb-2">Data Loading Failed</h3>
                  <p className="text-sm text-slate-300 mb-6">{dataLoadError}</p>
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
            {allowCountrySwitch && showCountrySelector && (
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
                    onCountryChange={newCountry => {
                      const params = new URLSearchParams(searchParams.toString());
                      const query = params.toString();
                      router.push(`/${CODE_TO_SLUG[newCountry]}${query ? `?${query}` : ''}`);
                      setShowCountrySelector(false);
                      setSelectedRegion(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Selected Event Info Card */}
            {showMapOverlays && selectedEvent && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-4 max-w-[min(28rem,calc(100vw-2rem))] z-[16] pointer-events-auto">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-100">{selectedEvent.name}</h3>
                    <p className="text-sm text-slate-400 mt-1">{selectedEvent.date}</p>
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

          {showAnalytics && (
            <BottomTabs
              events={countryEvents}
              hazards={hazards}
              sectors={sectors}
              exposureData={exposureData}
              economicDamageData={economicDamageData}
              sectorEconomicData={sectorEconomicData}
              assetEconomicData={assetEconomicData}
              filters={filters}
              districts={resolvedDistricts}
              provinces={resolvedProvinces}
              selectedRegion={selectedRegion}
              impactByAssetType={impactByAssetType}
              impactBySector={impactBySector || []}
              regionalSummary={regionalSummary}
              regionalSummaryBySector={regionalSummaryBySector}
              damagedBuildings={damagedBuildings}
              damagedRoads={damagedRoads}
              onZoomToAsset={handleZoomToAsset}
              onRequestDamageData={handleRequestDamageData}
              countryCode={selectedCountry}
            />
          )}
        </div>

        {/* Right Summary Panel */}
        <div
          ref={summaryPanelRef}
          className={`fixed inset-y-0 right-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out bg-transparent shadow-2xl
            md:static md:inset-auto md:h-full md:flex-shrink-0 md:shadow-none
            ${
              showSummary
                ? 'translate-x-0 md:w-80 md:opacity-100'
                : 'translate-x-full pointer-events-none md:w-0 md:translate-x-0 md:overflow-hidden md:opacity-0'
            }`}
        >
          <div className="md:hidden absolute top-4 left-4 z-[45]">
            <button
              onClick={() => setShowSummary(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close summary panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <SummaryPanel
            events={countryEvents}
            filters={filters}
            districts={resolvedDistricts}
            provinces={resolvedProvinces}
            sectors={sectors}
            hazards={hazards}
            selectedCountry={selectedCountry}
            selectedRegion={selectedRegion}
            onRegionClear={() => setSelectedRegion(null)}
            assetExposureData={assetExposureData}
            nationalSummary={nationalSummary || []}
            regionalSummary={regionalSummary}
            regionalSummaryBySector={regionalSummaryBySector}
            impactBySector={impactBySector || []}
            scenarioRiskSummary={hazardScenarioRiskSummary}
          />
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          action={toastAction}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* Basemap Preference Modal - First Visit */}
      {showBasemapPreferenceModal && BasemapPreferenceModal && (
        <BasemapPreferenceModal onSelect={handleBasemapSelect} onSkip={handleBasemapSkip} />
      )}

      <GuidedTour
        open={isTourOpen}
        steps={tourSteps}
        currentStep={tourStepIndex}
        onPrev={() => setTourStepIndex(index => Math.max(0, index - 1))}
        onNext={() => setTourStepIndex(index => Math.min(tourSteps.length - 1, index + 1))}
        onStepSelect={setTourStepIndex}
        onClose={closeTour}
        onFinish={finishTour}
      />
    </div>
  );
}
