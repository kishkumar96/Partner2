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
  Table2,
  DollarSign,
  Layers,
  MapPin,
  Users,
  Download,
  Wind,
  Compass,
  Scale,
  SlidersHorizontal,
  ClipboardList,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import ActiveFilters from '@/components/ActiveFilters';
import CountryFlag from '@/components/CountryFlag';
import GuidedTour, { type GuidedTourStep } from '@/components/GuidedTour';
import TopInsightsCards from '@/components/TopInsightsCards';
import ViewStatusLine from '@/components/ViewStatusLine';
import AdvisoryStatusBanner from '@/components/AdvisoryStatusBanner';
import { buildAdvisoryStatus, utcStamp } from '@/utils/forecastInsight';
import { MULTI_HAZARD_ID } from '@/utils/hazardLossScope';
import { resolveHazard } from '@/data/vanuatuHazards';
import ToolsMenu from '@/components/ToolsMenu';
import { FORECAST_SIGNAL } from '@/utils/forecastBriefing';
import { useForecastLayers } from '@/utils/useForecastLayers';
import { useResponsePriority } from '@/utils/useResponsePriority';
import AnalysisModeSwitch, { type AnalysisMode } from '@/components/AnalysisModeSwitch';
import EventPicker from '@/components/EventPicker';
import ShareLinkButton from '@/components/ShareLinkButton';
import { District, FilterState, Event, Hazard, Province, Sector } from '@/types';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import {
  RealWMSLayer,
  createDefaultLegendSettings,
  getLayersForCountry,
  getDefaultHazardScenario,
  shouldResetHazardScenario,
  describeHazardScenario,
  HazardScenarioSelection,
  HAZARD_SCENARIO_PRODUCT_CATEGORY,
  HAZARD_SCENARIO_PRODUCT_LABELS,
  LegendSettings,
} from '@/data/realThreddsLayers';
import { COUNTRY_CONFIGS, getAggregationLabel } from '@/data/countryConfigs';
import {
  ForecastExposureSummary,
  ForecastRunStatusPanel,
  ForecastExposureTables,
} from '@/components/ForecastExposurePanels';
import ForecastLayers from '@/components/ForecastLayers';
import { featuresForRegion, forecastFocusCollection } from '@/utils/forecastExposure';
import { filtersShownFor } from '@/utils/forecastFilters';
import type { ForecastExposure } from '@/utils/forecastExposure';
import type { TimelinePoint } from '@/utils/forecastTimeline';
import ModeFilterPanel from '@/components/ModeFilterPanel';
import type { EventRecord } from '@/data/eventRecords';
import {
  assessmentGap,
  defaultForecastRecord,
  isModeEventId,
  groupForecastRuns,
  listForecastRuns,
} from '@/utils/forecastRuns';
import AssessmentPendingNotice from '@/components/AssessmentPendingNotice';
import { LoadingDataWorkspace, LoadingSummaryPanel } from '@/components/LoadingPanels';
import {
  loadAllRealData,
  loadSupplementaryRealData,
  expandEventsToRegionalEntries,
  loadDamagedBuildings,
  loadDamagedRoads,
  fetchHazardScenarioBreakdown,
  fetchHazardScenarioCurve,
  fetchHazardScenarioRiskSummary,
  type HazardScenarioBreakdown,
  type HazardScenarioCurve,
  fetchPartnerRiskInformationGeometry,
} from '@/utils/realDataLoader';
import { getFilteredData } from '@/stores/filteredDataStore';
import { detectStoryBeats } from '@/utils/cycloneStory';
import { deserializeMapState, serializeMapState, MapURLState } from '@/utils/urlState';
import { highlightPoint } from '@/utils/mapHighlight';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import { normalizeHazardIds } from '@/utils/hazardIds';
import {
  getHazardLossScope,
  scopeEconomicRecords,
  scopeRiskFeatures,
  scopeRiskRows,
} from '@/utils/hazardLossScope';
import { DEFAULT_BASEMAP_STYLE } from '@/utils/basemaps';
import {
  getInitialBasemap,
  saveBasemapPreference,
  resetBasemapPreference,
} from '@/utils/userPreferences';
import { animationStartIndex } from '@/utils/cycloneAnimationLoader';
import NewAdvisoryBanner from '@/components/NewAdvisoryBanner';
import { useNewAdvisory } from '@/utils/useNewAdvisory';

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

const CountryComparisonModal = dynamic(() => import('@/components/CountryComparisonModal'), {
  ssr: false,
});

// Which hazard each planning-scenario product belongs to, for the Hazards
// filter in planning mode ('all' = only offered when no single hazard is picked)
const SCENARIO_PRODUCT_HAZARD: Record<string, 'wind' | 'flood' | 'all'> = {
  tc: 'wind',
  historical_tcs: 'wind',
  synthetic_tcs: 'wind',
  rapid_impact_assessment: 'wind',
  swell: 'flood',
  swell_driven: 'flood',
  coastal_flood: 'flood',
  fluvial_flood: 'flood',
  combined: 'all',
};

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
  const [showCompareModal, setShowCompareModal] = useState(false);
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
  // The scenario's own "Show on map" switch. Assessment's Maximum Inundation overlay is a
  // different thing; sharing one switch let a choice in one mode silently change the other.
  const [showScenarioLayer, setShowScenarioLayer] = useState(true);
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
    useState<HazardScenarioSelection | null>(
      urlState.hazardScenarioProduct
        ? {
            product: urlState.hazardScenarioProduct,
            slrScenarioM: urlState.hazardScenarioSlr ?? 0,
            returnPeriodYears: urlState.hazardScenarioReturnPeriod ?? null,
            eventLabel: urlState.hazardScenarioEvent ?? null,
          }
        : null
    );
  // Explicit Event / Planning choice from the header (or a shared link);
  // null means the country's default (see viewMode below)
  const [viewModeChoice, setViewModeChoice] = useState<'event' | 'planning' | null>(
    urlState.viewMode ?? null
  );
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

  // A hazard choice is the user's primary intent. Keep the corresponding
  // raster visible so choosing Flood or Tropical Cyclone cannot silently
  // produce an empty map because an expert display toggle was off.
  const handleFilterChange = useCallback(
    (nextFilters: FilterState) => {
      const newlySelectedHazards = nextFilters.selectedHazards.filter(
        hazardId => !filters.selectedHazards.includes(hazardId)
      );

      if (newlySelectedHazards.some(id => id === 'tropical-cyclone' || id === 'wind')) {
        setShowWindLayer(true);
      }
      if (
        newlySelectedHazards.some(
          id =>
            id === 'flood' || id === 'inundation' || id === 'storm-surge' || id === 'fluvial-depth'
        )
      ) {
        setShowInundationLayer(true);
      }

      // The user picking events themselves takes over from the mode's event
      if (nextFilters.selectedEvents.join(',') !== filters.selectedEvents.join(',')) {
        setModeEventId(null);
      }
      setFilters(nextFilters);
    },
    [filters.selectedHazards, filters.selectedEvents]
  );

  // Phones show the side panels and the data tabs as overlays on top of the
  // map, so opening with them up hides the map entirely. Start phones on the
  // map unless the link asked for a panel explicitly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      if (urlState.showMapControls === undefined) setShowMapControls(false);
      if (urlState.showSummary === undefined) setShowSummary(false);
      setShowAnalytics(false);
    } else if (window.matchMedia('(max-width: 1279px)').matches) {
      // Below 1280px both side panels leave the map a narrow strip; keep the
      // summary figures and start with Map Controls closed
      if (urlState.showMapControls === undefined) setShowMapControls(false);
    }
    // Only on first mount: later panel toggles are the user's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Set when the active event is a Rapid Exposure Forecast (exposure, no loss)
  const [forecastExposure, setForecastExposure] = useState<ForecastExposure | null>(null);
  const [previousForecast, setPreviousForecast] = useState<{
    record: EventRecord;
    exposure: ForecastExposure;
  } | null>(null);
  const [forecastTimeline, setForecastTimeline] = useState<TimelinePoint[]>([]);
  const [forecastLayersFocusKey, setForecastLayersFocusKey] = useState(0);
  const [activeEventRecord, setActiveEventRecord] = useState<EventRecord | null>(null);
  const responsePriority = useResponsePriority(
    forecastExposure,
    regionalImpactsGeoJSON,
    activeEventRecord?.trackIssuedTime || activeEventRecord?.date,
    selectedCountry
  );
  const forecastLayerControls = useForecastLayers(
    forecastExposure,
    selectedCountry,
    responsePriority?.features ?? null
  );
  const [isLoadingDamage, setIsLoadingDamage] = useState({ buildings: false, roads: false });
  const [damageLoadError, setDamageLoadError] = useState<string | null>(null);
  const isLoadingDamageRef = useRef(isLoadingDamage);
  // Choosing Forecast or Assessment opens that mode's event. That is the mode,
  // not a filter the user applied, so it lives here and not in filters.selectedEvents:
  // the tables and summary treat a selected event as a filter and would drop the
  // regional data for event-by-event figures.
  const [modeEventId, setModeEventId] = useState<string | null>(null);
  const effectiveEventKey = modeEventId ?? filters.selectedEvents.join(',');
  const effectiveEventIds = useMemo(
    () => (modeEventId ? [modeEventId] : filters.selectedEvents),
    // keyed on the contents so an unchanged selection keeps the same identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveEventKey]
  );
  const effectiveEventIdsRef = useRef(effectiveEventIds);
  const filtersRef = useRef(filters);
  const damagedBuildingsRef = useRef<any>(null);
  const damagedRoadsRef = useRef<any>(null);
  // Partner-API risk_information row id for damaged buildings/roads, whose
  // geometry the initial load deliberately skips (defer_large_assets) --
  // loadDamageLayer fetches it by id on demand when set, instead of the
  // local-DB fallback path.
  const damagedBuildingsRowIdRef = useRef<string | null>(null);
  const damagedRoadsRowIdRef = useRef<string | null>(null);
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
  // The event whose data is on screen. events[0] is just the newest listed
  // event, which can be a different record (e.g. a forecast listed beside the
  // completed assessment the dashboard defaults to).
  const shownEventName = activeEventRecord?.name || events[0]?.name;
  const activeCycloneName = shownEventName || 'Tropical Cyclone';
  const hasNamedEvent = !!shownEventName && shownEventName !== COUNTRIES[selectedCountry]?.name;
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
          events: effectiveEventIds,
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
          hazardScenarioProduct: hazardScenarioSelection?.product,
          hazardScenarioSlr: hazardScenarioSelection?.slrScenarioM,
          hazardScenarioReturnPeriod: hazardScenarioSelection?.returnPeriodYears ?? undefined,
          hazardScenarioEvent: hazardScenarioSelection?.eventLabel ?? undefined,
          viewMode: viewModeChoice ?? undefined,
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
      effectiveEventIds,
      mapStyle,
      basemapStyle,
      currentCycloneIndex,
      storyMode,
      showFilters,
      showMapControls,
      showSummary,
      hazardScenarioSelection,
      viewModeChoice,
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
    effectiveEventIds,
    hazardScenarioSelection,
    viewModeChoice,
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

      // A camera move doesn't need the style loaded. Waiting on isStyleLoaded() and then on
      // 'load' never fires when tiles are still arriving, because 'load' already happened.
      mapInstance.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
        duration: 900,
      });
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
        // A known partner-API row id means this country's damaged
        // buildings/roads live in risk_information with their geometry
        // deliberately deferred from the initial load -- fetch that one
        // row by id instead of the local-DB fallback path, which has
        // nothing for partner-API-only countries.
        const partnerRowId =
          type === 'buildings' ? damagedBuildingsRowIdRef.current : damagedRoadsRowIdRef.current;

        const data = partnerRowId
          ? await fetchPartnerRiskInformationGeometry(
              selectedCountry,
              partnerRowId,
              controller.signal
            )
          : type === 'buildings'
            ? await loadDamagedBuildings({
                signal: controller.signal,
                countryCode: selectedCountry,
                selectedEventIds: effectiveEventIdsRef.current,
                dateRange: filtersRef.current.dateRange,
                eventRecords: fetchedEventRecordsRef.current,
              })
            : await loadDamagedRoads({
                signal: controller.signal,
                countryCode: selectedCountry,
                selectedEventIds: effectiveEventIdsRef.current,
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
    effectiveEventIdsRef.current = effectiveEventIds;
  }, [effectiveEventIds]);

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
        title: `Welcome to the ${process.env.NEXT_PUBLIC_APP_NAME || 'Tropical Cyclone Rapid Impact Assessment Tool'}`,
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
        body: 'Open Tools → Map controls to change the visual story: shading mode, visible overlays, opacity, cyclone playback, and the hazard scenario. Tools also holds metadata, country comparison and this tour.',
        selector: '[data-tour="tools-menu"]',
        category: 'Map',
        targetLabel: 'Tools menu',
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
      case '[data-tour="tools-menu"]':
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

  // Basemap choice from Map Controls; saved so the next visit starts on it
  const handleBasemapChange = useCallback((style: string) => {
    setBasemapStyle(style);
    saveBasemapPreference(style);
  }, []);

  const handleResetUserPreferences = useCallback(() => {
    resetBasemapPreference();
    setBasemapStyle(DEFAULT_BASEMAP_STYLE);
    showToastNotification('Preferences reset.', 'success');
  }, []);

  // Whether a forecast is showing (set once the view mode is known, below)
  const forecastFramingRef = useRef(false);

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
      const forecastFraming = forecastFramingRef.current;
      const headerText = forecastFraming
        ? `${COUNTRIES[selectedCountry].name} Forecast Exposure Map`
        : `${COUNTRIES[selectedCountry].name} Disaster Risk Map`;
      const contextText = forecastFraming
        ? `${FORECAST_SIGNAL} | Track issued: ${activeEventRecord?.trackIssuedTime || activeEventRecord?.date || 'unknown'}`
        : `${mapStyle.toUpperCase()} view | Hazards: ${selectedHazardNames} | Opacity: ${layerOpacity}%`;
      const attributionText =
        'Data: Pacific Disaster Impact & Exposure / THREDDS | Basemap: OpenStreetMap contributors';

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
    activeEventRecord,
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
  const [countryEventRecords, setCountryEventRecords] = useState<EventRecord[]>([]);
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

  // Selectable event ids: the events themselves (what the Events filter
  // lists) as well as their per-region entries
  const countryScopedEventIds = useMemo(
    () => [
      ...events.filter(event => event.countryCode === selectedCountry).map(event => event.id),
      ...expandedEvents
        .filter(event => event.countryCode === selectedCountry)
        .flatMap(event => [event.id, event.parentEventId].filter((id): id is string => !!id)),
    ],
    [events, expandedEvents, selectedCountry]
  );

  const countryHazardScenarioLayers = useMemo(
    () =>
      partnerHazardLayers.filter(
        layer => layer.countryCode === selectedCountry && layer.hazardScenario
      ),
    [partnerHazardLayers, selectedCountry]
  );

  // Whether the active country's own hazard catalog actually contains a wind
  // layer (true for VU/TO/WS today, false for CK -- its catalog is
  // inundation-only). Drives an explicit "not modelled" message on the Wind
  // toggle instead of a toggle that silently does nothing when switched on --
  // see CK_RISK_ANALYSIS_ASSESSMENT.md's still-open "confirm wind hazard is
  // genuinely out of scope for CK" item. Only meaningful once this
  // country's own partner-API catalog has loaded; defaults to available so
  // it never falsely claims "unavailable" while data is still in flight.
  const countryHasWindLayers = useMemo(() => {
    const countryLayers = partnerHazardLayers.filter(
      layer => layer.countryCode === selectedCountry
    );
    if (countryLayers.length === 0) return true;
    return countryLayers.some(layer => layer.hazardType === 'wind');
  }, [partnerHazardLayers, selectedCountry]);

  // Availability comes from the layer catalogue as well as named events.
  // Scenario-driven datasets (notably Cook Islands) may have no Event row,
  // but must still be discoverable through the primary hazard controls.
  const availableHazardIds = useMemo(() => {
    const layerTypes = new Set(
      getLayersForCountry(selectedCountry, partnerHazardLayers).map(layer => layer.hazardType)
    );
    const ids = new Set<string>();
    if (layerTypes.has('wind')) ids.add('tropical-cyclone');
    if (
      layerTypes.has('flood') ||
      layerTypes.has('inundation') ||
      layerTypes.has('fluvial-depth')
    ) {
      ids.add('flood');
    }
    return Array.from(ids);
  }, [partnerHazardLayers, selectedCountry]);

  // The scenario actually rendered on the map: the user's explicit pick, or
  // a deterministic default so the map always shows exactly one scenario
  // instead of every SLR x return-period/event combination at once.
  const effectiveHazardScenario = useMemo(
    () => hazardScenarioSelection ?? getDefaultHazardScenario(countryHazardScenarioLayers),
    [hazardScenarioSelection, countryHazardScenarioLayers]
  );

  // One context at a time: the dashboard shows either an event's modelled
  // impact (track, its hazard footprint, the impact analysis) or planning
  // scenarios (scenario layer, scenario figures) -- never figures from one
  // next to a map of the other. Default: the event when the country has an
  // impact analysis, otherwise planning.
  const hasEventImpact = (nationalSummary?.length ?? 0) > 0 || regionalSummary.length > 0;
  const hasPlanningScenarios = countryHazardScenarioLayers.length > 0;
  // While the country's data is still loading, neither flag is known yet:
  // keep an explicit choice and default to event, so the map doesn't load
  // one set of layers and then switch to the other.
  const viewMode: 'event' | 'planning' =
    viewModeChoice === 'planning' && (hasPlanningScenarios || isLoadingData)
      ? 'planning'
      : viewModeChoice === 'event' || isLoadingData || hasEventImpact || !hasPlanningScenarios
        ? 'event'
        : 'planning';
  const isPlanningMode = viewMode === 'planning';
  forecastFramingRef.current = !isPlanningMode && !!forecastExposure;

  // In planning mode the Hazards filter picks which scenario products are
  // offered (cyclone vs flood-type); with nothing or both selected, all are.
  // Falls back to every product when the country has none of that type.
  // The catalogue's dated, real events (e.g. the Cook Islands' historical
  // cyclones and swell events). They are browsed with the scenario selector,
  // so Observed mode offers a shortcut to them.
  const historicalScenarioLayers = useMemo(
    () =>
      countryHazardScenarioLayers.filter(
        layer => HAZARD_SCENARIO_PRODUCT_CATEGORY[layer.hazardScenario!.product] === 'observed'
      ),
    [countryHazardScenarioLayers]
  );

  // Which kind of scenario is selected: a dated, observed event (History) or a
  // probabilistic planning figure (Scenarios). Each mode offers only its own.
  const scenarioCategory =
    (effectiveHazardScenario &&
      HAZARD_SCENARIO_PRODUCT_CATEGORY[effectiveHazardScenario.product]) ||
    'planning';

  const planningScenarioLayers = useMemo(() => {
    const inCategory = countryHazardScenarioLayers.filter(
      layer =>
        (HAZARD_SCENARIO_PRODUCT_CATEGORY[layer.hazardScenario!.product] ?? 'planning') ===
        scenarioCategory
    );
    const pool = inCategory.length > 0 ? inCategory : countryHazardScenarioLayers;
    const scope = getHazardLossScope(filters.selectedHazards);
    if (scope === 'all') return pool;
    const matching = pool.filter(
      layer => SCENARIO_PRODUCT_HAZARD[layer.hazardScenario!.product] === scope
    );
    return matching.length > 0 ? matching : pool;
  }, [countryHazardScenarioLayers, filters.selectedHazards, scenarioCategory]);

  useEffect(() => {
    if (!isPlanningMode) return;
    if (shouldResetHazardScenario(planningScenarioLayers, effectiveHazardScenario)) {
      setHazardScenarioSelection(getDefaultHazardScenario(planningScenarioLayers));
    }
  }, [isPlanningMode, effectiveHazardScenario, planningScenarioLayers]);

  // ---- Analysis mode: the one first decision (see AnalysisModeSwitch) ----
  const scenarioLayersByCategory = useMemo(
    () => ({
      planning: countryHazardScenarioLayers.filter(
        layer =>
          (HAZARD_SCENARIO_PRODUCT_CATEGORY[layer.hazardScenario!.product] ?? 'planning') ===
          'planning'
      ),
      observed: historicalScenarioLayers,
    }),
    [countryHazardScenarioLayers, historicalScenarioLayers]
  );
  const newestRecord = (records: EventRecord[]) =>
    [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const forecastRecord = useMemo(
    () =>
      defaultForecastRecord(
        countryEventRecords.filter(
          record => record.countryCode === selectedCountry && record.isForecast
        )
      ),
    [countryEventRecords, selectedCountry]
  );
  const forecastRuns = useMemo(
    () => listForecastRuns(countryEventRecords, selectedCountry),
    [countryEventRecords, selectedCountry]
  );
  // Choosing an advisory changes the map and every figure, so a notice that this is not the newest
  // one belongs to the page, not to one panel
  const advisoryStatus = useMemo(
    () =>
      !isPlanningMode && forecastExposure
        ? buildAdvisoryStatus({
            issuedAt: activeEventRecord?.trackIssuedTime,
            latestIssuedAt: forecastRecord?.trackIssuedTime,
            timeline: forecastTimeline,
          })
        : null,
    [isPlanningMode, forecastExposure, activeEventRecord, forecastRecord, forecastTimeline]
  );
  const assessmentRecord = useMemo(
    () =>
      newestRecord(
        countryEventRecords.filter(
          record => record.countryCode === selectedCountry && !record.isForecast
        )
      ),
    [countryEventRecords, selectedCountry]
  );
  const availableAnalysisModes = useMemo(() => {
    const modes: AnalysisMode[] = [];
    if (forecastRecord) modes.push('forecast');
    if (assessmentRecord || hasEventImpact) modes.push('assessment');
    if (scenarioLayersByCategory.planning.length > 0) modes.push('scenarios');
    if (scenarioLayersByCategory.observed.length > 0) modes.push('history');
    return modes;
  }, [forecastRecord, assessmentRecord, hasEventImpact, scenarioLayersByCategory]);
  // The modes keep their place while a load replaces the data: the last known set, or all four
  // before the first load says which this country has
  const lastAnalysisModesRef = useRef<AnalysisMode[]>([
    'forecast',
    'assessment',
    'scenarios',
    'history',
  ]);
  if (!isLoadingData && availableAnalysisModes.length > 0) {
    lastAnalysisModesRef.current = availableAnalysisModes;
  }
  const shownAnalysisModes =
    !isLoadingData && availableAnalysisModes.length > 0
      ? availableAnalysisModes
      : lastAnalysisModesRef.current;
  const analysisMode: AnalysisMode = isPlanningMode
    ? scenarioCategory === 'observed'
      ? 'history'
      : 'scenarios'
    : activeEventRecord?.isForecast || forecastExposure
      ? 'forecast'
      : 'assessment';

  const assessmentGapInfo = useMemo(
    () =>
      assessmentGap(
        forecastRecord,
        activeEventRecord?.isForecast ? assessmentRecord : activeEventRecord
      ),
    [forecastRecord, assessmentRecord, activeEventRecord]
  );

  // Frame the forecast when one opens: the country's default view can be well
  // away from the storm, which reads as "no storm on the map". A shared link
  // that names a view keeps it, and a run is framed once so panning is never undone.
  const framedForecastRef = useRef<string | null>(null);
  const respectUrlViewRef = useRef(Boolean(urlState.center && urlState.zoom));
  useEffect(() => {
    if (!forecastExposure || isPlanningMode || !mapInstance) return;
    const focus = forecastFocusCollection(forecastExposure, regionalImpactsGeoJSON);
    const key = activeEventRecord?.id ?? '';
    if (!focus || framedForecastRef.current === key) return;
    framedForecastRef.current = key;
    if (respectUrlViewRef.current) {
      respectUrlViewRef.current = false;
      return;
    }
    zoomToData(focus);
  }, [
    forecastExposure,
    isPlanningMode,
    mapInstance,
    activeEventRecord?.id,
    regionalImpactsGeoJSON,
    zoomToData,
  ]);

  // Every other mode is about the islands themselves: back to the country's own view when one
  // is chosen. Coming from Forecast the map would otherwise stay on the storm, where scenario
  // layers are too small to draw and the map opens blank.
  const lastFramedModeRef = useRef<AnalysisMode | null>(null);
  useEffect(() => {
    // The first load settles the mode; that is not a choice, and a shared link's view stays
    if (lastFramedModeRef.current === null) {
      if (!isLoadingData) lastFramedModeRef.current = analysisMode;
      return;
    }
    if (lastFramedModeRef.current === analysisMode) return;
    lastFramedModeRef.current = analysisMode;
    if (analysisMode === 'forecast') {
      // Frame the storm again when Forecast is chosen again
      framedForecastRef.current = null;
      return;
    }
    const country = COUNTRIES[selectedCountry];
    if (!mapInstance || !country) return;
    mapInstance.flyTo({ center: country.center, zoom: country.zoom, duration: 900 });
  }, [analysisMode, isLoadingData, mapInstance, selectedCountry]);

  // Choosing an area moves the map to it, so the click visibly does something
  const zoomedRegionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedRegion) {
      zoomedRegionRef.current = null;
      return;
    }
    if (!forecastExposure || isPlanningMode || zoomedRegionRef.current === selectedRegion) return;
    const area = featuresForRegion(regionalImpactsGeoJSON, selectedRegion);
    if (!area) return;
    zoomedRegionRef.current = selectedRegion;
    zoomToData(area);
  }, [selectedRegion, forecastExposure, isPlanningMode, regionalImpactsGeoJSON, zoomToData]);

  // Choosing Forecast or Assessment names that mode's event. That is the mode,
  // not a filter the user applied, so it is kept out of the Active filters bar
  // (whose "Clear all" would otherwise silently switch the mode).
  const eventSelectionIsMode =
    filters.selectedEvents.length === 1 &&
    isModeEventId(filters.selectedEvents[0], forecastRuns, assessmentRecord?.id) &&
    !!forecastRecord;
  const barFilters = filtersShownFor(
    analysisMode,
    eventSelectionIsMode ? { ...filters, selectedEvents: [] } : filters
  );
  // The filter chips sit behind the Context toggle, so the toggle says when some are active
  const activeFilterCount =
    barFilters.selectedHazards.length +
    barFilters.selectedSectors.length +
    barFilters.selectedEvents.length +
    (barFilters.dateRange.start || barFilters.dateRange.end ? 1 : 0);

  // A link such as ?events=12 names a mode's event. Once the records are known and the
  // country has both kinds, treat it as the mode, not as a filter.
  useEffect(() => {
    if (eventSelectionIsMode && modeEventId === null) {
      setModeEventId(filters.selectedEvents[0]);
      setFilters(prev => ({ ...prev, selectedEvents: [] }));
    }
  }, [eventSelectionIsMode, modeEventId, filters.selectedEvents]);

  // The overlays (cyclone track, hazard rasters, damaged buildings and roads) are the
  // post-event assessment's. Forecast has its own layers; Scenarios its own scenario layer.
  // Their switches keep their values, so coming back to Assessment finds them as left.
  const isAssessmentMode = analysisMode === 'assessment';
  // The cyclone animation plays the track as forecast or as it happened, so it belongs to
  // both event modes; Scenarios and History have no storm to play.
  // Until the first load returns there is no event, so the mode is a guess (it reads as Assessment).
  // Showing that guess flashed "No Impact Data Available" before the real view replaced it.
  const modeUnresolved = isLoadingData && !activeEventRecord && !isPlanningMode;
  const canAnimateCyclone =
    !modeUnresolved && (analysisMode === 'assessment' || analysisMode === 'forecast');

  // An advisory issued while the page is open: offered, never forced
  const { advisory: newAdvisory, dismiss: dismissNewAdvisory } = useNewAdvisory({
    countryCode: selectedCountry,
    known: countryEventRecords,
    enabled: !isLoadingData && !modeUnresolved,
  });

  const windLayerOn = showWindLayer && isAssessmentMode;
  const inundationLayerOn = isAssessmentMode
    ? showInundationLayer
    : isPlanningMode
      ? showScenarioLayer
      : false;

  // A user's scenario pick is remembered per kind, so switching away and back
  // restores it rather than replacing it with a default.
  const lastScenarioByCategory = useRef<
    Partial<Record<'planning' | 'observed', HazardScenarioSelection>>
  >({});
  useEffect(() => {
    if (isPlanningMode && effectiveHazardScenario) {
      lastScenarioByCategory.current[scenarioCategory as 'planning' | 'observed'] =
        effectiveHazardScenario;
    }
  }, [isPlanningMode, effectiveHazardScenario, scenarioCategory]);

  const handleAnalysisModeChange = useCallback(
    (mode: AnalysisMode) => {
      if (mode === 'forecast' || mode === 'assessment') {
        setViewModeChoice('event');
        const target = mode === 'forecast' ? forecastRecord : assessmentRecord;
        // Name the event only when the country has more than one kind to tell
        // apart; otherwise the default already shows the right one. This is the
        // mode, not a filter, so it is kept out of filters.selectedEvents.
        setModeEventId(target && forecastRecord ? target.id : null);
        // An event selection that was only ever a mode's event (e.g. arrived in a
        // link) is not the user's filter: drop it so it can't leak into the tables.
        const isModeEvent = (id: string) => isModeEventId(id, forecastRuns, assessmentRecord?.id);
        setFilters(prev =>
          prev.selectedEvents.length > 0 && prev.selectedEvents.every(isModeEvent)
            ? { ...prev, selectedEvents: [] }
            : prev
        );
        return;
      }
      const category = mode === 'history' ? 'observed' : 'planning';
      setViewModeChoice('planning');
      setHazardScenarioSelection(
        lastScenarioByCategory.current[category] ??
          getDefaultHazardScenario(scenarioLayersByCategory[category])
      );
    },
    [forecastRecord, forecastRuns, assessmentRecord, scenarioLayersByCategory]
  );

  // The header's event picker: forecast storms with their advisories, then observed events
  const stormGroups = useMemo(() => groupForecastRuns(forecastRuns), [forecastRuns]);
  const observedEventOptions = useMemo(
    () =>
      countryEventRecords
        .filter(record => record.countryCode === selectedCountry && !record.isForecast)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(record => ({ id: record.id, name: record.name, date: record.date })),
    [countryEventRecords, selectedCountry]
  );
  const eventPickerHasChoices = stormGroups.length + observedEventOptions.length > 0;
  const eventPickerLabel = (() => {
    const name = hasNamedEvent ? activeCycloneName : 'Choose an event';
    if (analysisMode === 'forecast' && activeEventRecord?.trackIssuedTime) {
      return `${name} · issued ${utcStamp(activeEventRecord.trackIssuedTime)}`;
    }
    const year = activeEventRecord?.date?.slice(0, 4);
    return year ? `${name} · ${year}` : name;
  })();
  // Choosing an event or advisory is choosing its mode too, as the mode tabs do
  const handlePickEvent = useCallback(
    (id: string) => {
      setViewModeChoice('event');
      setModeEventId(id);
      const isModeEvent = (eventId: string) =>
        isModeEventId(eventId, forecastRuns, assessmentRecord?.id);
      setFilters(prev =>
        prev.selectedEvents.length > 0 && prev.selectedEvents.every(isModeEvent)
          ? { ...prev, selectedEvents: [] }
          : prev
      );
    },
    [forecastRuns, assessmentRecord]
  );

  // The header's "Active event context" and the Metadata chip both used to
  // read activeCycloneName unconditionally -- for a country like Cook
  // Islands with no real Event record, that's just the generic "Tropical
  // Cyclone" fallback, completely disconnected from whichever historical/
  // synthetic/swell event is actually selected in the Hazard Scenario
  // section. When the active scenario is itself a real, dated/named
  // observed event (not a statistical planning figure), prefer showing
  // that -- it's more specific and it's what the map and risk figures
  // actually reflect.
  const activeEventContextLabel = useMemo(() => {
    if (
      effectiveHazardScenario &&
      HAZARD_SCENARIO_PRODUCT_CATEGORY[effectiveHazardScenario.product] === 'observed' &&
      effectiveHazardScenario.eventLabel
    ) {
      const productLabel =
        HAZARD_SCENARIO_PRODUCT_LABELS[effectiveHazardScenario.product] ??
        effectiveHazardScenario.product;
      return `${productLabel} -${effectiveHazardScenario.eventLabel}`;
    }
    return activeCycloneName;
  }, [effectiveHazardScenario, activeCycloneName]);

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

  // The same scenario's loss by sector and by asset type, for the bottom
  // panel's economic damage tabs. Keyed on the risk_scenario row id, so it
  // follows the selector exactly as the summary totals above do.
  const [hazardScenarioBreakdown, setHazardScenarioBreakdown] =
    useState<HazardScenarioBreakdown | null>(null);
  const hazardScenarioRiskSummaryId =
    typeof hazardScenarioRiskSummary?.id === 'number' ? hazardScenarioRiskSummary.id : null;

  useEffect(() => {
    if (hazardScenarioRiskSummaryId === null) {
      setHazardScenarioBreakdown(null);
      return;
    }
    const controller = new AbortController();
    fetchHazardScenarioBreakdown(selectedCountry, hazardScenarioRiskSummaryId, controller.signal)
      .then(breakdown => {
        if (!controller.signal.aborted) {
          setHazardScenarioBreakdown(breakdown);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHazardScenarioBreakdown(null);
        }
      });

    return () => controller.abort();
  }, [selectedCountry, hazardScenarioRiskSummaryId]);

  // The selected product's whole loss curve (every return period x SLR, plus
  // annual average loss) for the Hazard Scenario section's curve selector.
  // Keyed on the product's risk_information parent, so it's fetched once per
  // product rather than on every return period / SLR change. Event-based
  // products have no curve.
  const [hazardScenarioCurve, setHazardScenarioCurve] = useState<HazardScenarioCurve | null>(null);
  const hazardScenarioCurveSourceId =
    effectiveHazardScenario?.returnPeriodYears != null &&
    typeof hazardScenarioRiskSummary?.risk_information === 'number'
      ? hazardScenarioRiskSummary.risk_information
      : null;

  useEffect(() => {
    if (hazardScenarioCurveSourceId === null) {
      setHazardScenarioCurve(null);
      return;
    }
    const controller = new AbortController();
    fetchHazardScenarioCurve(selectedCountry, hazardScenarioCurveSourceId, controller.signal)
      .then(curve => {
        if (!controller.signal.aborted) {
          setHazardScenarioCurve(curve);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHazardScenarioCurve(null);
        }
      });

    return () => controller.abort();
  }, [selectedCountry, hazardScenarioCurveSourceId]);

  // The Hazards filter scopes risk figures to one hazard's share (wind or
  // flooding) instead of dropping rows: every risk row carries per-hazard
  // loss and exposure columns. Scoping here, once, means the summary,
  // tables, map shading and exports all follow. See utils/hazardLossScope.
  const hazardLossScope = getHazardLossScope(filters.selectedHazards);
  const scopedRisk = useMemo(() => {
    const national = scopeRiskRows(nationalSummary, hazardLossScope);
    const regional = scopeRiskRows(regionalSummary, hazardLossScope);
    const regionalBySector = scopeRiskRows(regionalSummaryBySector, hazardLossScope);
    const bySector = scopeRiskRows(impactBySector, hazardLossScope);
    const byAsset = scopeRiskRows(impactByAssetType, hazardLossScope);
    const regionalImpacts = scopeRiskFeatures(regionalImpactsGeoJSON, hazardLossScope);
    return {
      nationalSummary: national.rows,
      regionalSummary: regional.rows,
      regionalSummaryBySector: regionalBySector.rows,
      impactBySector: bySector.rows,
      impactByAssetType: byAsset.rows,
      regionalImpactsGeoJSON: regionalImpacts.collection ?? null,
      sectorEconomicData: scopeEconomicRecords(sectorEconomicData, hazardLossScope),
      assetEconomicData: scopeEconomicRecords(assetEconomicData, hazardLossScope),
      // False when some dataset has no per-hazard columns, so its figures
      // are still all hazards
      complete:
        national.complete &&
        regional.complete &&
        regionalBySector.complete &&
        bySector.complete &&
        byAsset.complete &&
        regionalImpacts.complete,
      mayDoubleCount: national.mayDoubleCount || regional.mayDoubleCount,
    };
  }, [
    hazardLossScope,
    nationalSummary,
    regionalSummary,
    regionalSummaryBySector,
    impactBySector,
    impactByAssetType,
    regionalImpactsGeoJSON,
    sectorEconomicData,
    assetEconomicData,
  ]);

  // Filter hazards and sectors based on what data we actually have
  const hazards = useMemo(() => {
    // allHazards from COUNTRY_CONFIGS holds the hazards with WMS data
    // (tropical-cyclone and flood). Events of other types (earthquake,
    // volcanic, ...) add their own hazard so they can be filtered to.
    const known = new Set(allHazards.map(hazard => hazard.id));
    const extra: typeof allHazards = [];
    events.forEach(event => {
      const id = event.hazardId;
      if (!id || id === MULTI_HAZARD_ID || known.has(id)) return;
      known.add(id);
      extra.push(resolveHazard(id));
    });
    return extra.length > 0 ? [...allHazards, ...extra] : allHazards;
  }, [allHazards, events]);

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
    // A forecast advisory is a mode's event, so a link to an older run keeps its id
    const validEventIds = new Set([...countryScopedEventIds, ...forecastRuns.map(run => run.id)]);
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
      // Before events load there's nothing to check against; keep the
      // selection (e.g. from a shared link) instead of clearing it
      const nextEvents =
        validEventIds.size === 0
          ? prevFilters.selectedEvents
          : prevFilters.selectedEvents.filter(eventId => validEventIds.has(eventId));

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
  }, [hazards, sectors, countryScopedEventIds, forecastRuns, resolvedDistricts, resolvedProvinces]);

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
        economicDamageData: scopeEconomicRecords(economicDamageData, hazardLossScope),
        filters,
        districts: resolvedDistricts,
        provinces: resolvedProvinces,
      }),
    [
      countryEvents,
      exposureData,
      economicDamageData,
      hazardLossScope,
      filters,
      resolvedDistricts,
      resolvedProvinces,
    ]
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
        : [
            windLayerOn,
            inundationLayerOn,
            showBuildingsLayer && isAssessmentMode,
            showRoadsLayer && isAssessmentMode,
          ].filter(Boolean).length;

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
    windLayerOn,
    inundationLayerOn,
    isAssessmentMode,
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
        selectedEventIds: effectiveEventIds,
        dateRange: filters.dateRange,
      });

      // Check if this request is still current (not superseded by a newer request)
      if (currentVersion !== loadRequestVersion.current) {
        console.log('Ignoring stale data load response');
        return;
      }

      if (realData.fetchedEventRecords && realData.fetchedEventRecords.length > 0) {
        fetchedEventRecordsRef.current = realData.fetchedEventRecords;
        setCountryEventRecords(realData.fetchedEventRecords);
      }

      damagedBuildingsRowIdRef.current = realData.damagedBuildingsRowId ?? null;
      damagedRoadsRowIdRef.current = realData.damagedRoadsRowId ?? null;

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
        setDevDataSourceLabel(
          `Track: ${trackSource} | Event: ${eventSource} | Risk: ${riskSource} | Hazards: ${hazardSource}`
        );
      } else {
        setDevDataSourceLabel(
          'Track: Local Files | Event: Local Files | Risk: Local Files | Hazards: Static Config'
        );
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
      setForecastExposure(realData.forecastExposure ?? null);
      setPreviousForecast(realData.previousForecast ?? null);
      setForecastTimeline(realData.forecastTimeline ?? []);
      setActiveEventRecord(realData.activeEventRecord ?? null);

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
        const nearestIndex = animationStartIndex(
          realData.cycloneForecast,
          COUNTRIES[selectedCountry].center,
          !!(realData.forecastExposure || realData.activeEventRecord?.isForecast)
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
        selectedEventIds: effectiveEventIds,
        dateRange: filters.dateRange,
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
  }, [selectedCountry, effectiveEventIds, filters.dateRange]);

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
        // A menu open over the panel closes on this key first (it marks it handled); one
        // press closes one thing
        if (event.defaultPrevented) return;
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
    (windLayerOn || inundationLayerOn) && mapZoom !== null && mapZoom < hazardMinZoom;

  return (
    <div className="flex flex-col h-screen bg-transparent overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 glass-panel border-b border-white/10 px-4 py-2.5 sm:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:flex-nowrap md:items-center md:gap-x-3">
          <div className="flex min-w-0 flex-col gap-2 md:order-1 md:flex-1">
            {/* Three to a row: in one scrolling row, six chips needed 600px of a 390px phone and Data was cut off */}
            <div className="grid grid-cols-3 gap-1.5 md:hidden">
              <button
                onClick={() => {
                  openMapPanel();
                  setShowSummary(false);
                }}
                className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
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
                className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  showFilters
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                }`}
                aria-label="Open filters panel"
                aria-pressed={showFilters}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
              </button>
              <button
                onClick={openSummaryPanel}
                className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
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
              <button
                onClick={() => {
                  // The data tabs overlay the map on phones; close the side panels
                  setShowAnalytics(current => !current);
                  setShowSummary(false);
                  setShowMapControls(false);
                  setShowFilters(false);
                }}
                className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  showAnalytics
                    ? 'bg-blue-500/20 text-blue-200 border-blue-500/40 shadow-sm'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/90'
                }`}
                aria-label={showAnalytics ? 'Hide data tables' : 'Show data tables'}
                aria-pressed={showAnalytics}
              >
                <Table2 className="w-3.5 h-3.5" />
                Data
              </button>
              {canAnimateCyclone && !!cycloneForecast && (
                <button
                  onClick={() => {
                    openFilterPanel('cyclone');
                    setShowSummary(false);
                  }}
                  className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
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
              <button
                type="button"
                onClick={() => setShowMetadata(current => !current)}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  showMetadata
                    ? 'border-slate-500/60 bg-slate-700/70 text-slate-100'
                    : 'border-slate-700/60 bg-slate-800/70 text-slate-300 hover:bg-slate-800/90'
                }`}
                aria-expanded={showMetadata}
                aria-controls="dashboard-metadata"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showMetadata ? 'rotate-180' : ''}`}
                />
                Context
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>
            <div
              className="flex min-w-0 items-center gap-3 px-1 sm:gap-4"
              data-tour="dashboard-hero"
            >
              {/* CountryFlag sizes itself with `size`; a width class here is overridden by its inline style */}
              <div className="flex shrink-0 items-center overflow-hidden rounded-md shadow-md ring-1 ring-white/20">
                <CountryFlag
                  countryCode={selectedCountry}
                  aria-label={COUNTRIES[selectedCountry].name}
                  title={COUNTRIES[selectedCountry].name}
                  size="2.75rem"
                  className="block"
                />
              </div>
              <div className="min-w-0">
                {/* The product name is the small line, the country the big one:
                    the full "<Country> Tropical Cyclone Rapid Impact
                    Assessment Tool" wrapped to five lines and took a third of
                    the screen from the map. Still one heading for screen
                    readers; the page title keeps the full name. The small line
                    uses the dashboard's own name (as on the login page and in
                    reports), not "Rapid Impact Assessment": it sits above the
                    mode switch and read as the name of the Assessment mode. */}
                <h1 className="min-w-0">
                  <span className="sr-only">Pacific Disaster Impact &amp; Exposure</span>{' '}
                  <span className="block text-xl font-semibold leading-tight tracking-tight text-white">
                    {COUNTRIES[selectedCountry].name}
                  </span>
                </h1>
                {/* What is shown (storm, advisory, scenario), under the name: the flag's height leaves
                    room for it, so it needs no row of its own */}
                {isLoadingData ? (
                  <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                    {`Loading ${COUNTRIES[selectedCountry].name} operational view...`}
                  </p>
                ) : !isPlanningMode && eventPickerHasChoices ? (
                  // Forecast and Post Disaster: the line is the event picker itself
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <EventPicker
                      label={eventPickerLabel}
                      stormGroups={stormGroups}
                      observedEvents={observedEventOptions}
                      activeId={activeEventRecord?.id ?? null}
                      onPick={handlePickEvent}
                    />
                    {(advisoryStatus?.kind === 'older' ||
                      advisoryStatus?.kind === 'latest-aging') && (
                      <AdvisoryStatusBanner
                        variant="pill"
                        status={advisoryStatus}
                        onSwitchToLatest={
                          forecastRecord ? () => setModeEventId(forecastRecord.id) : undefined
                        }
                      />
                    )}
                  </div>
                ) : (
                  <ViewStatusLine
                    className="mt-0.5"
                    mode={viewMode}
                    onChangeScenario={() => {
                      openMapPanel();
                      setShowSummary(false);
                    }}
                    isForecast={!!forecastExposure}
                    issuedAt={activeEventRecord?.trackIssuedTime}
                    eventName={hasNamedEvent ? activeCycloneName : undefined}
                    scenarioParts={
                      effectiveHazardScenario
                        ? describeHazardScenario(effectiveHazardScenario)
                        : undefined
                    }
                    aggregationLabel={
                      analysisMode === 'forecast' ? undefined : currentAggregationLabel
                    }
                    sectorNames={barFilters.selectedSectors.map(
                      id => sectors.find(sector => sector.id === id)?.name ?? id
                    )}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Export actions sit right of the title. From 1720px everything fits one line, with
              the mode tabs and panel buttons between them; below that, those take a second line. */}
          <div className="min-w-0 md:order-3 md:flex-shrink-0">
            <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
              <div
                className="flex min-w-max items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-900/35 p-1"
                data-tour="export-controls"
              >
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
                    hazardScenarioProduct: hazardScenarioSelection?.product,
                    hazardScenarioSlr: hazardScenarioSelection?.slrScenarioM,
                    hazardScenarioReturnPeriod:
                      hazardScenarioSelection?.returnPeriodYears ?? undefined,
                    hazardScenarioEvent: hazardScenarioSelection?.eventLabel ?? undefined,
                    viewMode: viewModeChoice ?? undefined,
                  }}
                  compact
                  className="min-h-10 rounded-lg border-slate-600/60 bg-slate-700/35 px-3 py-1.5 hover:bg-slate-700/55"
                />

                <ExportButtons
                  layout="menu"
                  extraActions={[
                    {
                      id: 'map-png',
                      label: 'Map image (PNG)',
                      hint: 'The current map view',
                      icon: Download,
                      busy: isDownloadingMap,
                      onClick: () => void handleDownloadMap(),
                      ariaLabel: 'Download map as PNG',
                      title: 'Download current map view as PNG image',
                    },
                  ]}
                  events={exportEvents}
                  exposureData={exportExposureData}
                  economicDamageData={exportEconomicDamageData}
                  hazards={hazards}
                  sectors={sectors}
                  disabled={isExportDisabled && !(forecastExposure && !isPlanningMode)}
                  countryName={COUNTRIES[selectedCountry].name}
                  fullCountryName={COUNTRIES[selectedCountry].fullName}
                  countryCode={selectedCountry}
                  cycloneEventName={exportEvents[0]?.name || countryEvents[0]?.name}
                  impactBySector={scopedRisk.impactBySector}
                  nationalSummary={scopedRisk.nationalSummary}
                  mapInstance={mapInstance}
                  hazardScenario={
                    isPlanningMode && inundationLayerOn ? effectiveHazardScenario : null
                  }
                  forecastExposure={!isPlanningMode ? forecastExposure : null}
                  forecastBrief={
                    !isPlanningMode && forecastExposure
                      ? {
                          countryName: COUNTRIES[selectedCountry].name,
                          eventName: activeEventRecord?.name ?? 'Forecast',
                          issuedAt: activeEventRecord?.trackIssuedTime || activeEventRecord?.date,
                          runCompletedAt: activeEventRecord?.modelRunFinishedAt,
                          modelRunStatus: activeEventRecord?.modelRunStatus,
                          layerSummary: forecastLayerControls?.summary ?? 'none',
                          activeLayers: forecastLayerControls
                            ? forecastLayerControls.options
                                .filter(option => forecastLayerControls.shown[option.id])
                                .map(option => option.id)
                            : [],
                          areaLabel: countryUi.focusAreaPlural.toLowerCase(),
                          regionLabel: countryUi.broaderAreaPlural.toLowerCase(),
                          priority: responsePriority
                            ? {
                                results: responsePriority.results,
                                counts: responsePriority.counts,
                                isCustom: responsePriority.isCustom,
                                staleAfterHours: responsePriority.thresholds.staleAfterHours,
                                ageHours: responsePriority.ageHours,
                              }
                            : null,
                        }
                      : undefined
                  }
                  forecastMeta={{
                    eventName: activeEventRecord?.name,
                    issuedAt: activeEventRecord?.trackIssuedTime || activeEventRecord?.date,
                    runCompletedAt: activeEventRecord?.modelRunFinishedAt,
                  }}
                />

                <ToolsMenu
                  items={[
                    {
                      id: 'map',
                      label: 'Map controls',
                      hint: 'Basemap, shading, overlays and hazard scenario',
                      icon: <MapIcon className="h-4 w-4" />,
                      pressed: showMapControls,
                      onSelect: () => {
                        openMapPanel();
                        setShowSummary(false);
                      },
                    },
                    {
                      id: 'metadata',
                      label: showMetadata ? 'Hide context' : 'Show context',
                      hint: 'Current scenario, filters, data source and reference date',
                      icon: <ChevronDown className="h-4 w-4" />,
                      pressed: showMetadata,
                      onSelect: () => setShowMetadata(current => !current),
                    },
                    {
                      id: 'compare',
                      label: 'Compare countries',
                      icon: <Scale className="h-4 w-4" />,
                      onSelect: () => setShowCompareModal(true),
                    },
                    {
                      id: 'country',
                      label: 'Change country',
                      hint: selectedCountry ? `Now: ${COUNTRIES[selectedCountry].name}` : undefined,
                      icon: <MapPin className="h-4 w-4" />,
                      hidden: !allowCountrySwitch,
                      onSelect: () => setShowCountrySelector(true),
                    },
                    {
                      id: 'tour',
                      label: 'Guided tour',
                      icon: <Compass className="h-4 w-4" />,
                      onSelect: startTour,
                    },
                    {
                      id: 'logout',
                      label: 'Log out',
                      icon: <LogOut className="h-4 w-4" />,
                      hidden: !showLogout,
                      onSelect: () => void handleLogout(),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 md:order-2 md:flex-shrink-0 md:gap-x-3">
            {/* Always shown, disabled while loading: hiding it moved the buttons under the cursor */}
            <AnalysisModeSwitch
              available={shownAnalysisModes}
              active={analysisMode}
              onChange={handleAnalysisModeChange}
              disabled={isLoadingData}
            />
            <div className="hidden min-w-0 md:flex">
              <div className="flex min-w-0 items-center gap-1 rounded-xl border border-slate-700/40 bg-slate-900/35 p-1">
                <button
                  onClick={() => openFilterPanel('filters')}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    showFilters && filterPanelTab === 'filters'
                      ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
                      : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                  }`}
                  aria-pressed={showFilters && filterPanelTab === 'filters'}
                  aria-label={showFilters ? 'Filters panel open' : 'Open data filters'}
                  data-tour="filter-panel-toggle"
                  title="Filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Filters</span>
                </button>
                <button
                  onClick={() => setShowAnalytics(current => !current)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    showAnalytics
                      ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
                      : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                  }`}
                  aria-pressed={showAnalytics}
                  aria-label={showAnalytics ? 'Hide data workspace' : 'Show data workspace'}
                  data-tour="data-workspace-toggle"
                  title="Data tables"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Data</span>
                </button>
                <button
                  onClick={() => setShowSummary(current => !current)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    showSummary
                      ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
                      : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                  }`}
                  aria-pressed={showSummary}
                  aria-label={showSummary ? 'Hide impact summary' : 'Show impact summary'}
                  data-tour="summary-panel-toggle"
                  title="Impact summary"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Impact</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMetadata(current => !current)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    showMetadata
                      ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
                      : 'border border-transparent bg-slate-700/30 text-slate-300 hover:border-slate-600/60 hover:bg-slate-700/50'
                  }`}
                  aria-expanded={showMetadata}
                  aria-controls="dashboard-metadata"
                  aria-label={`Context${activeFilterCount > 0 ? `, ${activeFilterCount} filters` : ''}`}
                  title="Context: country, event, filters and sources"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showMetadata ? 'rotate-180' : ''}`}
                  />
                  <span className="hidden 2xl:inline">Context</span>
                  {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          id="dashboard-metadata"
          className={`grid transition-all duration-300 ease-out ${
            showMetadata ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
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
                {/* A planning scenario is no storm: it names the scenario, not the last event */}
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  {analysisMode === 'scenarios' && effectiveHazardScenario
                    ? `Scenario: ${describeHazardScenario(effectiveHazardScenario).join(' · ')}`
                    : `Event: ${activeEventContextLabel}`}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Hazards: {metadataHazardSummary}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Resolution: {currentAggregationLabel}
                </span>
                <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                  Source: {devDataSourceLabel || 'Pacific Disaster Impact & Exposure local dataset'}
                </span>
                {analysisMode !== 'scenarios' && (
                  <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1">
                    Reference date: {activeContextDate}
                  </span>
                )}
              </div>
              {(barFilters.selectedHazards.length > 0 ||
                barFilters.selectedSectors.length > 0 ||
                barFilters.selectedEvents.length > 0 ||
                !!barFilters.dateRange.start ||
                !!barFilters.dateRange.end) && (
                <div className="mt-1 border-t border-slate-800/60 pt-1.5">
                  <ActiveFilters
                    filters={barFilters}
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
                          return {
                            ...prevFilters,
                            selectedHazards: id
                              ? prevFilters.selectedHazards.filter(hazardId => hazardId !== id)
                              : [],
                          };
                        }
                        if (type === 'sector') {
                          return {
                            ...prevFilters,
                            selectedSectors: id
                              ? prevFilters.selectedSectors.filter(sectorId => sectorId !== id)
                              : [],
                          };
                        }
                        if (type === 'event') {
                          return { ...prevFilters, selectedEvents: [] };
                        }
                        return prevFilters;
                      });
                    }}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {!showAnalytics && !showSummary && (
          <TopInsightsCards insights={headlineMetrics} className="mt-2" />
        )}
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
          className={`fixed inset-y-0 flex flex-col left-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out shadow-2xl
            ${showFilters ? 'translate-x-0' : '-translate-x-full'} 
            md:static md:transform-none md:shadow-none ${showFilters ? 'md:w-80' : 'md:w-0 md:overflow-hidden'}`}
        >
          {/* On phones the close button has its own bar: floating over the panel it covered the title */}
          <div className="flex flex-shrink-0 justify-end bg-slate-900/95 px-3 pt-3 pb-1 md:hidden">
            <button
              onClick={() => setShowFilters(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close filters panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ModeFilterPanel
              analysisMode={analysisMode}
              forecastSetup={{
                runs: forecastRuns,
                activeRunId: activeEventRecord?.id ?? null,
                onRunSelect: setModeEventId,
                onOpenLayers: () => {
                  openMapPanel();
                  setShowSummary(false);
                  setForecastLayersFocusKey(key => key + 1);
                },
              }}
            >
              <FilterPanel
                viewMode={viewMode}
                hazards={hazards}
                sectors={sectors}
                // Advisories are chosen in the header's event picker, not listed here as events
                events={events.filter(event => !event.isForecast)}
                districts={resolvedDistricts}
                countryCode={selectedCountry}
                filters={filters}
                onFilterChange={handleFilterChange}
                availableHazardIds={availableHazardIds}
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
            </ModeFilterPanel>
          </div>
        </div>

        {/* Map Controls Panel */}
        <div
          ref={mapPanelRef}
          data-tour="map-panel"
          className={`fixed inset-y-0 flex flex-col left-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out shadow-2xl
            ${showMapControls ? 'translate-x-0' : '-translate-x-full'} 
            md:static md:transform-none md:shadow-none ${showMapControls ? 'md:w-80' : 'md:w-0 md:overflow-hidden'}`}
        >
          {/* On phones the close button has its own bar: floating over the panel it covered the title */}
          <div className="flex flex-shrink-0 justify-end bg-slate-900/95 px-3 pt-3 pb-1 md:hidden">
            <button
              onClick={() => setShowMapControls(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close map controls panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <MapPanel
              forecastRuns={!isPlanningMode && activeEventRecord?.isForecast ? forecastRuns : []}
              activeForecastRunId={activeEventRecord?.id ?? null}
              onForecastRunSelect={setModeEventId}
              forecastLayers={!isPlanningMode ? forecastLayerControls : null}
              forecastLayersFocusKey={forecastLayersFocusKey}
              mapStyle={mapStyle}
              // A forecast is shaded by wind band; there's no damage to choose
              onMapStyleChange={
                modeUnresolved || (!isPlanningMode && forecastExposure) ? undefined : setMapStyle
              }
              is3DView={is3DView}
              on3DViewToggle={setIs3DView}
              extrusionMode={extrusionMode}
              onExtrusionModeChange={setExtrusionMode}
              extrusionExaggeration={extrusionExaggeration}
              onExtrusionExaggerationChange={setExtrusionExaggeration}
              // Forecast mode gets only the cyclone row (the animation); the other overlays
              // belong to the post-event assessment
              showOverlayRows={canAnimateCyclone}
              showWindLayer={showWindLayer}
              showInundationLayer={isPlanningMode ? showScenarioLayer : showInundationLayer}
              windLayersAvailable={countryHasWindLayers}
              onWindLayerToggle={isAssessmentMode ? setShowWindLayer : undefined}
              onInundationLayerToggle={
                isPlanningMode
                  ? setShowScenarioLayer
                  : isAssessmentMode
                    ? setShowInundationLayer
                    : undefined
              }
              showBuildingsLayer={showBuildingsLayer}
              showRoadsLayer={showRoadsLayer}
              onBuildingsLayerToggle={isAssessmentMode ? handleBuildingsLayerToggle : undefined}
              onRoadsLayerToggle={isAssessmentMode ? handleRoadsLayerToggle : undefined}
              showCycloneLayer={showCycloneControls}
              onCycloneLayerToggle={
                isAssessmentMode || (canAnimateCyclone && !!cycloneForecast)
                  ? handleCycloneVisibilityChange
                  : undefined
              }
              hasCycloneData={!!cycloneForecast}
              cycloneIsForecast={!isPlanningMode && !isAssessmentMode}
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
              hazardZoomBlocked={hazardZoomBlocked && !modeUnresolved}
              onResetUserPreferences={handleResetUserPreferences}
              basemapStyle={basemapStyle}
              onBasemapChange={handleBasemapChange}
              hazardScenarioLayers={isPlanningMode ? planningScenarioLayers : []}
              hazardScenarioSelection={effectiveHazardScenario}
              hazardScenarioCurve={hazardScenarioCurve}
              onHazardScenarioChange={setHazardScenarioSelection}
            />
          </div>
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
                  {/* The $ loss legend doesn't apply to a forecast, which has its own legend */}
                  {showMapOverlays && !(forecastExposure && !isPlanningMode) && (
                    <UnifiedMapLegend
                      mode={mapStyle}
                      visible={true}
                      hasSelection={hasSelection}
                      dataSource="Pacific Disaster Impact & Exposure data"
                      temporalScope="Cumulative"
                      dataValues={legendDataValues}
                      showBuildings={showBuildingsLayer && isAssessmentMode && !!damagedBuildings}
                      showRoads={showRoadsLayer && isAssessmentMode && !!damagedRoads}
                      showCyclone={showCycloneControls && canAnimateCyclone && !!cycloneForecast}
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
              dataReady={!isLoadingData}
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
              showWindLayer={windLayerOn}
              showInundationLayer={inundationLayerOn}
              onLayersLoadingChange={setIsLoadingLayers}
              onActiveWmsLayersChange={setActiveWmsLayers}
              partnerHazardLayers={partnerHazardLayers}
              hazardLayerMode={viewMode}
              hazardScenarioSelection={isPlanningMode ? effectiveHazardScenario : null}
              showImpactShading={!isPlanningMode}
              forecastDanger={!isPlanningMode && !!forecastExposure}
              layerOpacity={layerOpacity}
              legendSettings={legendSettings}
              damagedBuildings={showBuildingsLayer && isAssessmentMode ? damagedBuildings : null}
              damagedRoads={showRoadsLayer && isAssessmentMode ? damagedRoads : null}
              regionalImpactsData={scopedRisk.regionalImpactsGeoJSON}
              regionalSummaryData={scopedRisk.regionalSummary}
              // REF's input track is rendered by ForecastLayers, exactly as
              // saved with the run, rather than falling back to the general
              // cyclone-track record.
              cycloneTrackData={isPlanningMode || forecastExposure ? null : cycloneTrackData}
              cycloneForecast={isPlanningMode ? null : cycloneForecast}
              aggregationLevel={filters.aggregationLevel}
              showOverlays={showMapOverlays}
              onCycloneTimestepChange={handleCycloneTimestepChange}
              showCycloneAnimation={showCycloneControls && canAnimateCyclone}
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

            {!isPlanningMode && forecastExposure && forecastLayerControls && (
              <ForecastLayers
                map={mapInstance}
                controls={forecastLayerControls}
                // The animation draws the same track; two copies would only thicken the line
                hiddenOverlays={
                  showCycloneControls && canAnimateCyclone && cycloneForecast ? ['track'] : []
                }
                onOpenControls={() => {
                  openMapPanel();
                  setShowSummary(false);
                  setForecastLayersFocusKey(key => key + 1);
                }}
              />
            )}

            {newAdvisory && (
              <NewAdvisoryBanner
                advisory={newAdvisory}
                onShow={() => {
                  handleAnalysisModeChange('forecast');
                  setModeEventId(newAdvisory.id);
                }}
                onDismiss={dismissNewAdvisory}
              />
            )}

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

          {showAnalytics && !isPlanningMode && forecastExposure && (
            <ForecastExposureTables
              exposure={forecastExposure}
              areaLabel={countryUi.broaderAreaSingular}
              selectedRegion={selectedRegion}
              onRegionSelect={region =>
                setSelectedRegion(current => (current === region ? null : region))
              }
            />
          )}
          {showAnalytics && modeUnresolved && <LoadingDataWorkspace />}
          {showAnalytics && !modeUnresolved && (isPlanningMode || !forecastExposure) && (
            <BottomTabs
              events={countryEvents}
              hazards={hazards}
              sectors={sectors}
              exposureData={exposureData}
              economicDamageData={economicDamageData}
              sectorEconomicData={scopedRisk.sectorEconomicData}
              assetEconomicData={scopedRisk.assetEconomicData}
              filters={filters}
              districts={resolvedDistricts}
              provinces={resolvedProvinces}
              selectedRegion={selectedRegion}
              impactByAssetType={scopedRisk.impactByAssetType}
              impactBySector={scopedRisk.impactBySector}
              regionalSummary={scopedRisk.regionalSummary}
              regionalSummaryBySector={scopedRisk.regionalSummaryBySector}
              regionalImpacts={scopedRisk.regionalImpactsGeoJSON}
              hazardLossScope={hazardLossScope}
              hazardLossScopeComplete={scopedRisk.complete}
              damagedBuildings={damagedBuildings}
              damagedRoads={damagedRoads}
              onZoomToAsset={handleZoomToAsset}
              onRequestDamageData={handleRequestDamageData}
              countryCode={selectedCountry}
              hazardScenario={isPlanningMode ? effectiveHazardScenario : null}
              scenarioRiskSummary={isPlanningMode ? hazardScenarioRiskSummary : null}
              scenarioBreakdown={isPlanningMode ? hazardScenarioBreakdown : null}
              viewMode={viewMode}
            />
          )}
        </div>

        {/* Right Summary Panel */}
        <div
          ref={summaryPanelRef}
          className={`fixed inset-y-0 flex flex-col right-0 z-[40] w-full max-w-[min(24rem,100vw)] transform transition-transform duration-300 ease-out bg-transparent shadow-2xl
            md:static md:inset-auto md:h-full md:flex-shrink-0 md:shadow-none
            ${
              showSummary
                ? 'translate-x-0 md:w-80 md:opacity-100'
                : 'translate-x-full pointer-events-none md:w-0 md:translate-x-0 md:overflow-hidden md:opacity-0'
            }`}
        >
          {/* On phones the close button has its own bar: floating over the panel it covered the title */}
          <div className="flex flex-shrink-0 justify-end bg-slate-900/95 px-3 pt-3 pb-1 md:hidden">
            <button
              onClick={() => setShowSummary(false)}
              className="w-9 h-9 rounded-full bg-slate-800/95 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center hover:bg-slate-700/95 transition-colors"
              aria-label="Close summary panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {modeUnresolved ? (
              <LoadingSummaryPanel countryName={COUNTRIES[selectedCountry].name} />
            ) : !isPlanningMode && forecastExposure ? (
              <ForecastExposureSummary
                exposure={forecastExposure}
                event={activeEventRecord}
                areaFeatures={regionalImpactsGeoJSON}
                selectedRegion={selectedRegion}
                onRegionClear={() => setSelectedRegion(null)}
                priority={responsePriority}
                countryName={COUNTRIES[selectedCountry].name}
                areaLabel={countryUi.focusAreaPlural.toLowerCase()}
                previous={previousForecast}
                summary={{
                  timeline: forecastTimeline,
                  latestIssuedAt: forecastRecord?.trackIssuedTime ?? null,
                  statusShownAbove: true,
                  onSwitchToLatest: forecastRecord
                    ? () => setModeEventId(forecastRecord.id)
                    : undefined,
                  onSelectAdvisory: setModeEventId,
                }}
              />
            ) : !isPlanningMode && activeEventRecord?.isForecast && !isLoadingData ? (
              <ForecastRunStatusPanel event={activeEventRecord} />
            ) : (
              <SummaryPanel
                notice={
                  analysisMode === 'assessment' && assessmentGapInfo ? (
                    <AssessmentPendingNotice
                      forecastStorm={assessmentGapInfo.forecastStorm}
                      assessmentName={assessmentGapInfo.assessmentName}
                      onShowForecast={() => handleAnalysisModeChange('forecast')}
                    />
                  ) : undefined
                }
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
                nationalSummary={scopedRisk.nationalSummary}
                regionalSummary={scopedRisk.regionalSummary}
                regionalSummaryBySector={scopedRisk.regionalSummaryBySector}
                impactBySector={scopedRisk.impactBySector}
                hazardLossScope={hazardLossScope}
                hazardLossScopeComplete={scopedRisk.complete}
                hazardLossMayDoubleCount={scopedRisk.mayDoubleCount}
                scenarioRiskSummary={isPlanningMode ? hazardScenarioRiskSummary : null}
                hazardScenarioMapActive={false}
                viewMode={viewMode}
                hazardScenario={effectiveHazardScenario}
                eventName={hasEventImpact ? activeCycloneName : undefined}
              />
            )}
          </div>
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

      <CountryComparisonModal open={showCompareModal} onClose={() => setShowCompareModal(false)} />

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
