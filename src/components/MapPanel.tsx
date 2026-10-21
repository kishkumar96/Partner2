'use client';

/**
 * MapPanel - Dedicated panel for map visualization controls
 *
 * Separated from FilterPanel to maintain clear separation of concerns:
 * - FilterPanel: Controls WHAT data to analyze (filters)
 * - MapPanel: Controls HOW to visualize data (display settings)
 */

import { useEffect, useRef, useState, memo, useMemo, type ReactNode, type Ref } from 'react';
import ForecastLayersSection from '@/components/ForecastLayersSection';
import ForecastRunSelector from '@/components/ForecastRunSelector';
import type { ForecastRun } from '@/utils/forecastRuns';
import { formatUtcDateTime } from '@/utils/formatters';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';
import {
  ChevronDown,
  Loader2,
  Map as MapIcon,
  Moon,
  Globe2,
  Satellite,
  Wind,
  Waves,
  Building2,
  Construction,
  Layers,
  Clock,
  CloudRain,
  Play,
  Pause,
  BookOpen,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  LegendSettings,
  createDefaultLegendSettings,
  HAZARD_SCENARIO_PRODUCT_LABELS,
  HAZARD_SCENARIO_PRODUCT_CATEGORY,
  HAZARD_SCENARIO_CATEGORY_LABELS,
  canShowLossCurve,
  compareHazardScenarioPeriods,
  HazardScenarioCategory,
  HazardScenarioSelection,
  RealWMSLayer,
} from '@/data/realThreddsLayers';
import { COUNTRIES, type CountryCode } from '@/types/thredds';
import { CollapsibleLegendPanel } from '@/components/legend';
import { BASEMAP_STYLES } from '@/utils/basemaps';
import LossCurveSelector from '@/components/LossCurveSelector';
import type { HazardScenarioCurve } from '@/utils/realDataLoader';

const BASEMAP_OPTIONS = [
  { style: BASEMAP_STYLES.positron, name: 'Light', hint: 'Best for printing', icon: Globe2 },
  { style: BASEMAP_STYLES.voyager, name: 'Detailed', hint: 'Roads and labels', icon: MapIcon },
  { style: BASEMAP_STYLES.dark, name: 'Dark', hint: 'Low light', icon: Moon },
];

const sectionTriggerClass =
  'flex w-full items-center gap-2 bg-slate-900/60 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/70 group';

interface SectionHeaderProps {
  /** id of the collapsible body this header controls */
  controls: string;
  icon: ReactNode;
  title: string;
  /** Shown in place of the body while collapsed */
  summary?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
}

// Collapsible section header: the heading wraps the button (a heading inside
// a button is invalid and drops out of screen readers' heading navigation),
// and aria-expanded tells assistive tech whether the section is open.
function SectionHeader({ controls, icon, title, summary, expanded, onToggle }: SectionHeaderProps) {
  return (
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        className={sectionTriggerClass}
      >
        {icon}
        <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
          {title}
        </span>
        {!expanded && summary && (
          <span className="text-[10px] text-slate-400 ml-auto mr-2">{summary}</span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : 'ml-auto'}`}
        />
      </button>
    </h3>
  );
}

interface MapPanelProps {
  /** A Rapid Exposure Forecast's overlay switches, shown as their own section */
  forecastLayers?: ForecastLayerControls | null;
  /** Changes when the map's "Layers" button asks for the forecast section to open */
  forecastLayersFocusKey?: number;
  /** The storm's advisories (track issue times) to choose between, newest first */
  forecastRuns?: ForecastRun[];
  activeForecastRunId?: string | null;
  onForecastRunSelect?: (runId: string) => void;
  /** The Overlays group (cyclone, wind, inundation, damage) belongs to the post-event assessment only */
  showOverlayRows?: boolean;
  // Regional shading
  mapStyle?: 'loss' | 'wind';
  onMapStyleChange?: (style: 'loss' | 'wind') => void;
  /** Current basemap style URL (one of BASEMAP_STYLES) */
  basemapStyle?: string;
  onBasemapChange?: (style: string) => void;

  // Layer toggles
  showWindLayer?: boolean;
  // False when the active country's hazard catalog has no wind layer at all
  // (e.g. Cook Islands, inundation-only) -- surfaces an explicit in-place
  // message instead of a toggle that silently does nothing when switched on.
  windLayersAvailable?: boolean;
  showInundationLayer?: boolean;
  showBuildingsLayer?: boolean;
  showRoadsLayer?: boolean;
  showCycloneLayer?: boolean;
  onWindLayerToggle?: (visible: boolean) => void;
  onInundationLayerToggle?: (visible: boolean) => void;
  onBuildingsLayerToggle?: (visible: boolean) => void;
  onRoadsLayerToggle?: (visible: boolean) => void;
  onCycloneLayerToggle?: (visible: boolean) => void;
  hasCycloneData?: boolean;
  /** The animation plays a forecast track, so say its positions are forecast, not observed */
  cycloneIsForecast?: boolean;
  isCyclonePlaying?: boolean;
  onToggleCyclonePlaying?: (isPlaying: boolean) => void;
  cycloneControlsHostRef?: Ref<HTMLDivElement>;
  storyMode?: boolean;

  // Opacity
  layerOpacity?: number;
  onLayerOpacityChange?: (value: number) => void;

  // 3D
  is3DView?: boolean;
  on3DViewToggle?: (enabled: boolean) => void;
  extrusionMode?: 'none' | 'loss' | 'wind';
  onExtrusionModeChange?: (mode: 'none' | 'loss' | 'wind') => void;
  extrusionExaggeration?: number;
  onExtrusionExaggerationChange?: (value: number) => void;

  // Legend symbology
  legendSettings?: LegendSettings;
  onLegendSettingsChange?: (settings: LegendSettings) => void;
  countryCode?: CountryCode;

  // User preferences
  onResetUserPreferences?: () => void;

  // Loading states
  isMapDataLoading?: boolean;
  isHazardsLoading?: boolean;
  hazardZoomBlocked?: boolean;

  // Multi-scenario hazard catalog (SLR x return-period/event; currently only
  // Cook Islands). Empty when the current country has no scenario-tagged
  // layers, in which case no selector is shown.
  hazardScenarioLayers?: RealWMSLayer[];
  hazardScenarioSelection?: HazardScenarioSelection | null;
  /** Loss curve of the selected product, when it has return periods */
  hazardScenarioCurve?: HazardScenarioCurve | null;
  onHazardScenarioChange?: (selection: HazardScenarioSelection) => void;
}

// Which of "actually happened" vs "statistical estimate" a product is --
// see HAZARD_SCENARIO_PRODUCT_CATEGORY's doc comment for why this can't be
// derived from the return-period/event selector alone. Module-scope (not a
// component-body closure) so it has a stable reference for hook deps.
const productCategory = (product: string): HazardScenarioCategory =>
  HAZARD_SCENARIO_PRODUCT_CATEGORY[product] ?? 'planning';

const MapPanel = memo(function MapPanel({
  mapStyle,
  onMapStyleChange,
  basemapStyle,
  onBasemapChange,
  showWindLayer = true,
  windLayersAvailable = true,
  showInundationLayer = true,
  showBuildingsLayer = false,
  showRoadsLayer = false,
  showCycloneLayer = false,
  onWindLayerToggle,
  onInundationLayerToggle,
  onBuildingsLayerToggle,
  onRoadsLayerToggle,
  onCycloneLayerToggle,
  hasCycloneData = false,
  cycloneIsForecast = false,
  isCyclonePlaying = false,
  onToggleCyclonePlaying,
  cycloneControlsHostRef,
  storyMode = false,
  layerOpacity = 82,
  onLayerOpacityChange,
  is3DView = false,
  on3DViewToggle,
  extrusionMode = 'none',
  onExtrusionModeChange,
  extrusionExaggeration = 1,
  onExtrusionExaggerationChange,
  legendSettings,
  onLegendSettingsChange,
  countryCode,
  onResetUserPreferences,
  isMapDataLoading = false,
  isHazardsLoading = false,
  hazardZoomBlocked = false,
  hazardScenarioLayers = [],
  hazardScenarioSelection,
  hazardScenarioCurve = null,
  onHazardScenarioChange,
  forecastLayers = null,
  forecastLayersFocusKey = 0,
  forecastRuns = [],
  activeForecastRunId = null,
  onForecastRunSelect,
  showOverlayRows = true,
}: MapPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    basemap: false,
    shading: true,
    overlays: true,
    hazardScenario: true,
    forecastLayers: true,
    forecastAdvisory: true,
    legendSymbology: false,
    view3D: false,
  });
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const forecastSectionRef = useRef<HTMLDivElement>(null);

  // The map's "Layers" button: open the section and bring it into view
  useEffect(() => {
    if (!forecastLayersFocusKey) return;
    setExpandedSections(prev => ({ ...prev, forecastLayers: true }));
    forecastSectionRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [forecastLayersFocusKey]);
  const [expandedOverlayId, setExpandedOverlayId] = useState<string | null>(null);

  const toggleOverlay = (id: string) => setExpandedOverlayId(cur => (cur === id ? null : id));

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const controlsBusy = isMapDataLoading;
  const extrusionControlsDisabled = !is3DView || controlsBusy;

  const hazardScenarioProducts = useMemo(() => {
    const products = new Set<string>();
    hazardScenarioLayers.forEach(layer => {
      if (layer.hazardScenario) products.add(layer.hazardScenario.product);
    });
    return Array.from(products).sort((a, b) => {
      if (a === 'combined') return -1;
      if (b === 'combined') return 1;
      return a.localeCompare(b);
    });
  }, [hazardScenarioLayers]);

  // How many distinct named storm events each product offers, so a product
  // like "Historical Cyclones" can advertise "(17 events)" right in the
  // dropdown -- otherwise the only way to discover event browsing exists at
  // all is to already know to pick that product first and look at the
  // (differently-labeled) third field afterward.
  const hazardScenarioEventCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    hazardScenarioLayers.forEach(layer => {
      const scenario = layer.hazardScenario;
      if (!scenario || scenario.eventLabel === null) return;
      if (!counts.has(scenario.product)) counts.set(scenario.product, new Set());
      counts.get(scenario.product)!.add(scenario.eventLabel);
    });
    return new Map(Array.from(counts.entries()).map(([product, labels]) => [product, labels.size]));
  }, [hazardScenarioLayers]);

  const selectedProduct = hazardScenarioSelection?.product ?? hazardScenarioProducts[0];

  // Only worth surfacing a category toggle when the country's own catalog
  // actually spans both -- CK does today (historical/synthetic cyclones
  // alongside probabilistic combined/tc/swell); VU/TO/WS's coastal/fluvial
  // flood catalogs are planning-only, so no toggle clutters their single
  // category.
  const availableHazardCategories = useMemo(() => {
    const present = new Set(hazardScenarioProducts.map(productCategory));
    return (['observed', 'planning'] as HazardScenarioCategory[]).filter(cat => present.has(cat));
  }, [hazardScenarioProducts]);

  const [categoryOverride, setCategoryOverride] = useState<HazardScenarioCategory | null>(null);
  const activeHazardCategory =
    categoryOverride ?? productCategory(selectedProduct) ?? availableHazardCategories[0];

  const hazardScenarioProductsInCategory = useMemo(
    () =>
      hazardScenarioProducts.filter(product => productCategory(product) === activeHazardCategory),
    [hazardScenarioProducts, activeHazardCategory]
  );

  const hazardScenarioSlrOptions = useMemo(() => {
    const slrs = new Set<number>();
    hazardScenarioLayers.forEach(layer => {
      if (layer.hazardScenario?.product === selectedProduct) {
        slrs.add(layer.hazardScenario.slrScenarioM);
      }
    });
    return Array.from(slrs).sort((a, b) => a - b);
  }, [hazardScenarioLayers, selectedProduct]);

  const selectedSlr = hazardScenarioSelection?.slrScenarioM ?? hazardScenarioSlrOptions[0];

  const hazardScenarioSelectorOptions = useMemo(() => {
    const seen = new Map<string, { returnPeriodYears: number | null; eventLabel: string | null }>();
    hazardScenarioLayers.forEach(layer => {
      const scenario = layer.hazardScenario;
      if (
        !scenario ||
        scenario.product !== selectedProduct ||
        scenario.slrScenarioM !== selectedSlr
      ) {
        return;
      }
      const key = `${scenario.returnPeriodYears ?? ''}|${scenario.eventLabel ?? ''}`;
      if (!seen.has(key)) {
        seen.set(key, {
          returnPeriodYears: scenario.returnPeriodYears,
          eventLabel: scenario.eventLabel,
        });
      }
    });
    return Array.from(seen.values()).sort(compareHazardScenarioPeriods);
  }, [hazardScenarioLayers, selectedProduct, selectedSlr]);

  // Every product|slr|rp|event combination that has a map layer, so the loss
  // curve only offers points the map can actually show.
  const availableScenarioKeys = useMemo(
    () =>
      new Set(
        hazardScenarioLayers
          .filter(layer => layer.hazardScenario)
          .map(layer => {
            const sc = layer.hazardScenario!;
            return `${sc.product}|${sc.slrScenarioM}|${sc.returnPeriodYears ?? ''}|${sc.eventLabel ?? ''}`;
          })
      ),
    [hazardScenarioLayers]
  );
  const showLossCurve = canShowLossCurve(
    hazardScenarioCurve,
    hazardScenarioSelection,
    selectedProduct
  );

  const selectedSelectorKey = `${hazardScenarioSelection?.returnPeriodYears ?? ''}|${hazardScenarioSelection?.eventLabel ?? ''}`;

  const emitHazardScenario = (
    product: string,
    slrScenarioM: number,
    returnPeriodYears: number | null,
    eventLabel: string | null
  ) => {
    onHazardScenarioChange?.({ product, slrScenarioM, returnPeriodYears, eventLabel });
  };

  // Scenario to land on when the product or SLR changes. Keeps the current
  // return period / event when the new product+SLR has it, so comparing the
  // 100-yr loss at 0 m and 1 m SLR doesn't silently fall back to 10 yr;
  // otherwise the first option the return-period/event dropdown shows.
  const pickScenarioFor = (
    product: string,
    slrScenarioM: number
  ): HazardScenarioSelection | undefined => {
    const candidates = hazardScenarioLayers
      .filter(
        l =>
          l.hazardScenario?.product === product && l.hazardScenario?.slrScenarioM === slrScenarioM
      )
      .map(l => l.hazardScenario as HazardScenarioSelection);
    const current = hazardScenarioSelection;
    const same = current
      ? candidates.find(
          c =>
            c.returnPeriodYears === current.returnPeriodYears && c.eventLabel === current.eventLabel
        )
      : undefined;
    return same ?? candidates.sort(compareHazardScenarioPeriods)[0];
  };

  // Shared by the Product dropdown and the observed/planning category
  // toggle, so switching category always lands on a real, selectable
  // product+SLR pair rather than an arbitrary or stale one.
  const selectProduct = (product: string) => {
    const slrOptions = Array.from(
      new Set(
        hazardScenarioLayers
          .filter(l => l.hazardScenario?.product === product)
          .map(l => l.hazardScenario!.slrScenarioM)
      )
    ).sort((a, b) => a - b);
    // Keep the current SLR too when the new product has it
    const slr =
      hazardScenarioSelection && slrOptions.includes(hazardScenarioSelection.slrScenarioM)
        ? hazardScenarioSelection.slrScenarioM
        : slrOptions[0];
    const firstMatch = pickScenarioFor(product, slr);
    if (firstMatch) {
      emitHazardScenario(
        product,
        firstMatch.slrScenarioM,
        firstMatch.returnPeriodYears,
        firstMatch.eventLabel
      );
    }
  };

  return (
    <div className="w-full border-l border-purple-500/15 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[inset_1px_0_0_rgba(168,85,247,0.08)] flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate md:w-80">
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-purple-500/15 bg-slate-900/35">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">Map Controls</h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/15 text-purple-200 rounded border border-purple-500/30">
                <Layers className="w-2.5 h-2.5" />
                VIZ
              </span>
            </div>
            <button
              onClick={() => setShowAdvancedControls(!showAdvancedControls)}
              className={`px-2.5 py-1 text-xs font-semibold border rounded-lg transition-colors ${
                showAdvancedControls
                  ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                  : 'bg-slate-800/60 text-slate-300 border-slate-600/50 hover:bg-slate-700/60'
              }`}
              aria-label={
                showAdvancedControls ? 'Hide advanced map controls' : 'Show advanced map controls'
              }
              aria-pressed={showAdvancedControls}
            >
              {showAdvancedControls ? '← Basic' : 'Advanced →'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {showAdvancedControls
              ? 'Fine-tune map presentation'
              : 'Changes how the map looks, not the figures'}
          </p>
        </div>

        {/* Loading states */}
        {(isMapDataLoading || isHazardsLoading) && (
          <div className="mx-3 mt-3 space-y-2">
            {isMapDataLoading && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-blue-500/25 bg-blue-950/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-[11px] text-blue-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading map data...</span>
                </div>
              </div>
            )}
            {isHazardsLoading && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-[11px] text-cyan-200">
                  <Layers className="h-3.5 w-3.5" />
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading hazard layers...</span>
                </div>
              </div>
            )}
          </div>
        )}

        {hazardZoomBlocked && (
          <div className="mx-3 mt-3 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2">
            <p className="text-[11px] text-amber-200">
              Hazard layers appear only after zooming further in.
            </p>
          </div>
        )}

        {/* Map shading section */}
        {onMapStyleChange && mapStyle && (
          <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <SectionHeader
              controls="map-panel-section-shading"
              icon={
                <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" aria-hidden="true" />
              }
              title="Map Shading"
              summary={mapStyle === 'loss' ? 'Estimated damage' : 'Wind intensity'}
              expanded={expandedSections.shading}
              onToggle={() => toggleSection('shading')}
            />
            {expandedSections.shading && (
              <div
                id="map-panel-section-shading"
                className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35"
              >
                <div className="grid grid-cols-2 gap-2 mt-3" data-tour="map-style-selector">
                  <button
                    type="button"
                    aria-pressed={mapStyle === 'loss'}
                    disabled={controlsBusy}
                    onClick={() => onMapStyleChange('loss')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      mapStyle === 'loss'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    Estimated damage
                  </button>
                  <button
                    type="button"
                    aria-pressed={mapStyle === 'wind'}
                    disabled={controlsBusy}
                    onClick={() => onMapStyleChange('wind')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      mapStyle === 'wind'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    Wind intensity
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Basemap -- the only place to change it (and where the choice is saved) */}
        {onBasemapChange && basemapStyle && (
          <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <SectionHeader
              controls="map-panel-section-basemap"
              icon={
                <MapIcon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
              }
              title="Basemap"
              summary={BASEMAP_OPTIONS.find(o => o.style === basemapStyle)?.name}
              expanded={expandedSections.basemap}
              onToggle={() => toggleSection('basemap')}
            />
            {expandedSections.basemap && (
              <div
                id="map-panel-section-basemap"
                className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35"
              >
                <div className="grid grid-cols-3 gap-2 mt-3" role="group" aria-label="Basemap">
                  {BASEMAP_OPTIONS.map(option => {
                    const active = option.style === basemapStyle;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        aria-pressed={active}
                        title={option.hint}
                        onClick={() => onBasemapChange(option.style)}
                        className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50 border border-transparent'
                        }`}
                      >
                        <option.icon className="w-4 h-4" aria-hidden="true" />
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Forecast advisory: which track issue time (model run) the dashboard shows.
            Its own top-level section, above the layers it changes. */}
        {forecastRuns.length >= 2 && onForecastRunSelect && (
          <div
            className="mx-3 mt-2 rounded-xl border border-sky-500/30 bg-slate-900/45 overflow-hidden"
            data-testid="forecast-advisory-section"
          >
            <SectionHeader
              controls="map-panel-section-forecastAdvisory"
              icon={<Clock className="w-3.5 h-3.5 text-sky-300 flex-shrink-0" aria-hidden="true" />}
              title="Forecast advisory"
              summary={
                formatUtcDateTime(
                  forecastRuns.find(run => run.id === activeForecastRunId)?.issuedAt
                ) || `${forecastRuns.length} advisories`
              }
              expanded={expandedSections.forecastAdvisory}
              onToggle={() => toggleSection('forecastAdvisory')}
            />
            {expandedSections.forecastAdvisory && (
              <div
                id="map-panel-section-forecastAdvisory"
                className="space-y-2 border-t border-slate-700/40 bg-slate-900/35 px-4 pb-3 pt-2"
              >
                <p className="text-[10px] text-slate-400">
                  Each advisory is a separate model run. Choosing one changes every figure and the
                  map.
                </p>
                <ForecastRunSelector
                  runs={forecastRuns}
                  activeRunId={activeForecastRunId}
                  onSelect={onForecastRunSelect}
                  variant="plain"
                />
              </div>
            )}
          </div>
        )}

        {/* Forecast layers: a Rapid Exposure Forecast's overlays. Open while a
            forecast is the product; the map's "Layers" button reopens it. */}
        {forecastLayers && (
          <div
            ref={forecastSectionRef}
            className="mx-3 mt-2 rounded-xl border border-sky-500/30 bg-slate-900/45 overflow-hidden"
          >
            <SectionHeader
              controls="map-panel-section-forecastLayers"
              icon={
                <Layers className="w-3.5 h-3.5 text-sky-300 flex-shrink-0" aria-hidden="true" />
              }
              title="Forecast layers"
              summary={forecastLayers.summary}
              expanded={expandedSections.forecastLayers}
              onToggle={() => toggleSection('forecastLayers')}
            />
            {expandedSections.forecastLayers && (
              <ForecastLayersSection
                controls={forecastLayers}
                id="map-panel-section-forecastLayers"
              />
            )}
          </div>
        )}

        {/* Hazard scenario -a dedicated, always-visible control, not buried
            inside the Flood overlay row. Sets the SLR/return-period/event
            selection that both the map layer and the risk summary use;
            includes its own show/hide toggle (bound to the same
            its own switch (the Overlays rows are the assessment's), so the two
            stay in sync automatically) so this section is self-sufficient. */}
        {hazardScenarioProducts.length > 0 && onInundationLayerToggle && (
          <div className="mx-3 mt-2 rounded-xl border border-blue-500/30 bg-slate-900/45 overflow-hidden">
            <SectionHeader
              controls="map-panel-section-hazardScenario"
              icon={
                <Waves className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
              }
              title="Hazard Scenario"
              summary={HAZARD_SCENARIO_PRODUCT_LABELS[selectedProduct] ?? selectedProduct}
              expanded={expandedSections.hazardScenario}
              onToggle={() => toggleSection('hazardScenario')}
            />
            {expandedSections.hazardScenario && (
              <div
                id="map-panel-section-hazardScenario"
                className="px-4 pb-3 pt-2 border-t border-slate-700/40 bg-slate-900/35 space-y-2.5"
              >
                <p className="text-[10px] text-slate-400">
                  Choosing a scenario changes the loss estimate.
                </p>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                    Show on map
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">
                      {showInundationLayer ? 'On' : 'Off'}
                    </span>
                    <input
                      type="checkbox"
                      checked={showInundationLayer}
                      onChange={e => onInundationLayerToggle(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 accent-purple-400 cursor-pointer focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>
                </label>

                {availableHazardCategories.length > 1 && (
                  <div className="block">
                    <span className="block text-xs text-slate-400 mb-1">Scenario type</span>
                    <div
                      className="grid grid-cols-2 gap-1.5"
                      role="group"
                      aria-label="Scenario type"
                    >
                      {availableHazardCategories.map(category => (
                        <button
                          key={category}
                          type="button"
                          aria-pressed={activeHazardCategory === category}
                          onClick={() => {
                            setCategoryOverride(category);
                            const firstProduct = hazardScenarioProducts.find(
                              product => productCategory(product) === category
                            );
                            if (firstProduct) selectProduct(firstProduct);
                          }}
                          className={`px-2 py-1.5 rounded-lg text-xs font-semibold text-center leading-tight transition-colors border ${
                            activeHazardCategory === category
                              ? category === 'observed'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/50 border-transparent'
                          }`}
                        >
                          {HAZARD_SCENARIO_CATEGORY_LABELS[category]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 leading-snug">
                      {activeHazardCategory === 'observed'
                        ? 'A specific storm or swell event that actually happened, on record.'
                        : 'A statistical estimate of risk at a given likelihood, not a real event.'}
                    </p>
                  </div>
                )}

                <label className="block">
                  <span
                    id="hazard-scenario-product-label"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    Product
                  </span>
                  <select
                    aria-labelledby="hazard-scenario-product-label"
                    value={selectedProduct}
                    onChange={e => selectProduct(e.target.value)}
                    className="w-full text-xs bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                  >
                    {hazardScenarioProductsInCategory.map(product => {
                      const label = HAZARD_SCENARIO_PRODUCT_LABELS[product] ?? product;
                      const eventCount = hazardScenarioEventCounts.get(product) ?? 0;
                      return (
                        <option key={product} value={product}>
                          {eventCount > 1 ? `${label} (${eventCount} events)` : label}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {showLossCurve && hazardScenarioCurve && hazardScenarioSelection && (
                  <LossCurveSelector
                    curve={hazardScenarioCurve}
                    slrScenarioM={hazardScenarioSelection.slrScenarioM}
                    returnPeriodYears={hazardScenarioSelection.returnPeriodYears!}
                    isAvailable={(slr, rp) =>
                      availableScenarioKeys.has(`${selectedProduct}|${slr}|${rp}|`)
                    }
                    onSelect={(slr, rp) => emitHazardScenario(selectedProduct, slr, rp, null)}
                  />
                )}

                <div className={showLossCurve ? 'grid grid-cols-2 gap-2' : 'space-y-2.5'}>
                  <label className="block">
                    <span
                      id="hazard-scenario-slr-label"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      Sea level rise
                    </span>
                    <select
                      aria-labelledby="hazard-scenario-slr-label"
                      value={selectedSlr}
                      onChange={e => {
                        const slrScenarioM = Number(e.target.value);
                        const firstMatch = pickScenarioFor(selectedProduct, slrScenarioM);
                        if (firstMatch) {
                          emitHazardScenario(
                            selectedProduct,
                            slrScenarioM,
                            firstMatch.returnPeriodYears,
                            firstMatch.eventLabel
                          );
                        }
                      }}
                      className="w-full text-xs bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                    >
                      {hazardScenarioSlrOptions.map(slr => (
                        <option key={slr} value={slr}>
                          {slr} m
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span
                      id="hazard-scenario-period-label"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      {hazardScenarioSelectorOptions[0]?.returnPeriodYears !== null
                        ? 'Return period'
                        : 'Event'}
                    </span>
                    <select
                      aria-labelledby="hazard-scenario-period-label"
                      value={selectedSelectorKey}
                      onChange={e => {
                        const [rp, ev] = e.target.value.split('|');
                        emitHazardScenario(
                          selectedProduct,
                          selectedSlr,
                          rp ? Number(rp) : null,
                          ev || null
                        );
                      }}
                      className="w-full text-xs bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                    >
                      {hazardScenarioSelectorOptions.map(opt => {
                        const key = `${opt.returnPeriodYears ?? ''}|${opt.eventLabel ?? ''}`;
                        const label =
                          opt.returnPeriodYears !== null
                            ? `1-in-${opt.returnPeriodYears} yr`
                            : `Event ${opt.eventLabel}`;
                        return (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overlays -per-layer accordion rows */}
        {showOverlayRows &&
          (onCycloneLayerToggle ||
            onWindLayerToggle ||
            onInundationLayerToggle ||
            onBuildingsLayerToggle ||
            onRoadsLayerToggle) && (
            <div className="mx-3 mt-2 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-1">
                Overlays
              </p>

              {[
                onCycloneLayerToggle && {
                  id: 'cyclone',
                  label: 'Tropical Cyclone',
                  icon: CloudRain,
                  checked: showCycloneLayer,
                  onToggle: onCycloneLayerToggle,
                  color: 'text-violet-400',
                },
                onWindLayerToggle && {
                  id: 'wind',
                  label: 'Maximum Wind',
                  icon: Wind,
                  checked: showWindLayer,
                  onToggle: onWindLayerToggle,
                  color: 'text-cyan-400',
                  unavailableMessage: windLayersAvailable
                    ? undefined
                    : `Wind modelling unavailable for ${
                        countryCode ? (COUNTRIES[countryCode]?.name ?? countryCode) : 'this country'
                      }`,
                },
                onInundationLayerToggle && {
                  id: 'flood',
                  label: 'Maximum Inundation',
                  icon: Waves,
                  checked: showInundationLayer,
                  onToggle: onInundationLayerToggle,
                  color: 'text-blue-400',
                },
                onBuildingsLayerToggle && {
                  id: 'buildings',
                  label: 'Buildings',
                  icon: Building2,
                  checked: showBuildingsLayer,
                  onToggle: onBuildingsLayerToggle,
                  color: 'text-amber-400',
                },
                onRoadsLayerToggle && {
                  id: 'roads',
                  label: 'Roads',
                  icon: Construction,
                  checked: showRoadsLayer,
                  onToggle: onRoadsLayerToggle,
                  color: 'text-orange-400',
                },
              ]
                .filter(Boolean)
                .map(row => {
                  const {
                    id,
                    label,
                    icon: Icon,
                    checked,
                    onToggle,
                    color,
                    unavailableMessage,
                  } = row as {
                    id: string;
                    label: string;
                    icon: typeof CloudRain;
                    checked: boolean;
                    onToggle: (v: boolean) => void;
                    color: string;
                    unavailableMessage?: string;
                  };
                  const isOpen = expandedOverlayId === id;
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleOverlay(id)}
                        aria-expanded={isOpen}
                        aria-controls={`map-panel-overlay-${id}`}
                        className={`${sectionTriggerClass} pr-3`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
                        <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors flex-1">
                          {label}
                        </span>
                        <span
                          className={`text-[10px] font-semibold mr-2 ${
                            unavailableMessage
                              ? 'text-slate-500'
                              : checked
                                ? 'text-slate-300'
                                : 'text-slate-400'
                          }`}
                        >
                          {unavailableMessage ? 'N/A' : checked ? 'On' : 'Off'}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div
                          id={`map-panel-overlay-${id}`}
                          className="border-t border-slate-700/40 bg-slate-900/35 px-4 py-2.5"
                        >
                          <div className="space-y-2.5">
                            {unavailableMessage ? (
                              <p className="text-[11px] text-amber-300/90 leading-snug">
                                {unavailableMessage}. This hazard is not part of the modelled
                                catalog for this country -not a loading error.
                              </p>
                            ) : (
                              <label className="flex items-center justify-between cursor-pointer group">
                                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                                  Show layer
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    {checked ? 'On' : 'Off'}
                                  </span>
                                  {id === 'cyclone' ? (
                                    <button
                                      type="button"
                                      aria-pressed={checked}
                                      aria-label={
                                        checked ? 'Hide cyclone track' : 'Show cyclone track'
                                      }
                                      onClick={() => onToggle(!checked)}
                                      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors border focus-visible:outline-none focus-visible:ring-1 ${
                                        checked
                                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25 hover:border-blue-500/40 focus-visible:ring-blue-400'
                                          : 'bg-slate-700/30 text-slate-300 border-slate-600/40 hover:bg-slate-700/45 hover:border-slate-500/50 focus-visible:ring-slate-400'
                                      }`}
                                    >
                                      {checked ? (
                                        <Eye className="h-3.5 w-3.5" />
                                      ) : (
                                        <EyeOff className="h-3.5 w-3.5" />
                                      )}
                                      <span className="text-[10px] font-semibold">
                                        {checked ? 'Visible' : 'Hidden'}
                                      </span>
                                    </button>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={e => onToggle(e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 accent-purple-400 cursor-pointer focus:ring-1 focus:ring-purple-500/50"
                                    />
                                  )}
                                </div>
                              </label>
                            )}

                            {id === 'cyclone' && (
                              <p className="text-[10px] text-slate-400">
                                {cycloneIsForecast
                                  ? 'Plays the forecast track: positions and winds are forecast, not observed. '
                                  : ''}
                                Playback and timeline controls are in Advanced.
                              </p>
                            )}

                            {id === 'flood' && hazardScenarioProducts.length > 0 && (
                              <p className="text-[10px] text-slate-400">
                                Dataset, sea-level-rise, and return-period/event controls are in the
                                Hazard Scenario section above.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

        {showAdvancedControls && (
          <>
            <div className="mx-3 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0"></div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-purple-300/70 px-2">
                  Advanced
                </h3>
                <div className="h-px flex-1 bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0"></div>
              </div>
            </div>

            {onLayerOpacityChange && (
              <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
                <div className="px-4 py-3" data-tour="opacity-control">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                      Opacity
                    </span>
                    <span className="text-[10px] font-mono text-slate-300">{layerOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={layerOpacity}
                    onChange={e => onLayerOpacityChange(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-purple-400 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {onCycloneLayerToggle && (
              <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/35">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CloudRain className="h-3.5 w-3.5 text-violet-400" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-300">Cyclone Timeline</h3>
                        <p className="text-[10px] text-slate-400">
                          Playback and forecast progression controls
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold ${
                        showCycloneLayer ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {showCycloneLayer ? 'Track visible' : 'Track hidden'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  {storyMode ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      <BookOpen className="h-3 w-3" />
                      <span className="text-[10px] font-bold">Story mode</span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/50 bg-slate-950/35 px-2.5 py-2"
                      data-tour="story-mode-button"
                    >
                      <div
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isCyclonePlaying
                            ? 'bg-blue-500/15 text-blue-300'
                            : 'bg-slate-700/30 text-slate-400'
                        }`}
                      >
                        <div
                          className={`w-1 h-1 rounded-full ${
                            isCyclonePlaying ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        {isCyclonePlaying ? 'Playback on' : 'Playback off'}
                      </div>
                      <button
                        type="button"
                        aria-pressed={isCyclonePlaying}
                        aria-label={
                          isCyclonePlaying ? 'Pause cyclone animation' : 'Play cyclone animation'
                        }
                        onClick={() => onToggleCyclonePlaying?.(!isCyclonePlaying)}
                        disabled={!showCycloneLayer}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-colors border border-cyan-500/20 hover:border-cyan-500/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isCyclonePlaying ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {hasCycloneData ? (
                    <div
                      className={showCycloneLayer ? '' : 'opacity-50 pointer-events-none'}
                      aria-hidden={!showCycloneLayer}
                    >
                      <div
                        ref={cycloneControlsHostRef}
                        className="max-h-[calc(100vh-24rem)] overflow-y-auto space-y-2"
                        role="region"
                        aria-label="Cyclone timeline controls"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-700/40 bg-slate-800/20 p-3">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <CloudRain className="w-4 h-4 text-slate-400" />
                        <p className="text-xs font-medium text-slate-400">No cyclone data</p>
                        <p className="text-[10px] text-slate-400">
                          Select an event with track data.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Legend Symbology - World-class compositional component */}
            {onLegendSettingsChange && legendSettings && (
              <CollapsibleLegendPanel
                legendSettings={legendSettings}
                onLegendSettingsChange={onLegendSettingsChange}
                countryCode={countryCode}
                isExpanded={expandedSections.legendSymbology}
                onToggle={() => toggleSection('legendSymbology')}
              />
            )}

            {(on3DViewToggle || onExtrusionModeChange || onExtrusionExaggerationChange) && (
              <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
                <SectionHeader
                  controls="map-panel-section-view3D"
                  icon={
                    <Layers
                      className="w-3.5 h-3.5 text-purple-400 flex-shrink-0"
                      aria-hidden="true"
                    />
                  }
                  title="3D View"
                  summary={is3DView ? 'Enabled' : 'Disabled'}
                  expanded={expandedSections.view3D}
                  onToggle={() => toggleSection('view3D')}
                />
                {expandedSections.view3D && (
                  <div
                    id="map-panel-section-view3D"
                    className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35 space-y-3"
                  >
                    {on3DViewToggle && (
                      <label className="flex items-center justify-between cursor-pointer group rounded-lg px-2 py-1.5 hover:bg-slate-800/50 mt-3">
                        <span className="text-xs text-slate-300 group-hover:text-white">
                          3D Buildings
                        </span>
                        <input
                          id="map-panel-3d-buildings-toggle"
                          name="mapPanel3dBuildingsToggle"
                          type="checkbox"
                          checked={is3DView}
                          disabled={controlsBusy}
                          onChange={e => {
                            const enabled = e.target.checked;
                            on3DViewToggle(enabled);
                            if (!enabled) {
                              onExtrusionModeChange?.('none');
                            }
                          }}
                          className="h-4 w-7 appearance-none rounded-full bg-slate-700/80 border border-slate-600/80 checked:bg-purple-500/35 checked:border-purple-400/60 relative cursor-pointer transition-colors before:content-[''] before:absolute before:top-[2px] before:left-[2px] before:h-2.5 before:w-2.5 before:rounded-full before:bg-slate-200 before:transition-transform checked:before:translate-x-3"
                        />
                      </label>
                    )}

                    {onExtrusionModeChange && (
                      <div>
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Extrusion Source
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'none', label: 'None' },
                            { value: 'loss', label: 'Damage' },
                            { value: 'wind', label: 'Wind' },
                          ].map(option => (
                            <button
                              key={option.value}
                              type="button"
                              disabled={extrusionControlsDisabled}
                              aria-pressed={extrusionMode === option.value}
                              onClick={() =>
                                onExtrusionModeChange(option.value as 'none' | 'loss' | 'wind')
                              }
                              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all ${
                                extrusionMode === option.value
                                  ? 'border border-purple-500/35 bg-purple-500/12 text-purple-200'
                                  : 'border border-slate-700/60 text-slate-300 hover:bg-slate-800/40 hover:text-white'
                              } ${extrusionControlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        {!is3DView && (
                          <p className="mt-1.5 text-[10px] text-slate-400">
                            Enable 3D Buildings to choose an extrusion source.
                          </p>
                        )}
                      </div>
                    )}

                    {onExtrusionExaggerationChange && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Vertical Exaggeration
                          </span>
                          <span className="text-[10px] font-mono text-slate-300">
                            {extrusionExaggeration.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          id="extrusion-exaggeration-range"
                          name="extrusionExaggeration"
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.25}
                          value={extrusionExaggeration}
                          disabled={extrusionControlsDisabled}
                          onChange={e => onExtrusionExaggerationChange(Number(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-purple-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-400">
                          Adjusts the height of 3D buildings and impact extrusions.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {onResetUserPreferences && (
              <div className="mx-3 mb-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Reset saved preferences? The map goes back to the Light basemap.'
                      )
                    ) {
                      onResetUserPreferences();
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/15"
                >
                  Reset Preferences
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

MapPanel.displayName = 'MapPanel';

export default MapPanel;

MapPanel.displayName = 'MapPanel';
