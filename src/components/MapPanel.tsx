'use client';

/**
 * MapPanel - Dedicated panel for map visualization controls
 *
 * Separated from FilterPanel to maintain clear separation of concerns:
 * - FilterPanel: Controls WHAT data to analyze (filters)
 * - MapPanel: Controls HOW to visualize data (display settings)
 */

import { useState, memo, useMemo, type Ref } from 'react';
import {
  ChevronDown,
  Loader2,
  Map as MapIcon,
  Satellite,
  Wind,
  Waves,
  Building2,
  Construction,
  Layers,
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
  HazardScenarioSelection,
  RealWMSLayer,
} from '@/data/realThreddsLayers';
import type { CountryCode } from '@/types/thredds';
import { CollapsibleLegendPanel } from '@/components/legend';

interface MapPanelProps {
  // Regional shading
  mapStyle?: 'loss' | 'wind';
  onMapStyleChange?: (style: 'loss' | 'wind') => void;

  // Layer toggles
  showWindLayer?: boolean;
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
  onHazardScenarioChange?: (selection: HazardScenarioSelection) => void;
}

const MapPanel = memo(function MapPanel({
  mapStyle,
  onMapStyleChange,
  showWindLayer = true,
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
  onHazardScenarioChange,
}: MapPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    basemap: true,
    shading: true,
    overlays: true,
    legendSymbology: false,
    view3D: false,
  });
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
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
    return Array.from(seen.values()).sort((a, b) => {
      if (a.returnPeriodYears !== null && b.returnPeriodYears !== null) {
        return a.returnPeriodYears - b.returnPeriodYears;
      }
      if (a.returnPeriodYears !== null) return -1;
      if (b.returnPeriodYears !== null) return 1;
      return (a.eventLabel ?? '').localeCompare(b.eventLabel ?? '');
    });
  }, [hazardScenarioLayers, selectedProduct, selectedSlr]);

  const selectedSelectorKey = `${hazardScenarioSelection?.returnPeriodYears ?? ''}|${hazardScenarioSelection?.eventLabel ?? ''}`;

  const emitHazardScenario = (
    product: string,
    slrScenarioM: number,
    returnPeriodYears: number | null,
    eventLabel: string | null
  ) => {
    onHazardScenarioChange?.({ product, slrScenarioM, returnPeriodYears, eventLabel });
  };

  // Deterministic (lowest return period, else first event alphabetically)
  // pick for a product+SLR pair, used when switching product/SLR resets the
  // return-period/event choice — so it always lands on the same option the
  // return-period/event dropdown itself would show first, not an arbitrary
  // one from row-insertion order.
  const pickDefaultScenarioFor = (
    product: string,
    slrScenarioM: number
  ): HazardScenarioSelection | undefined => {
    const candidates = hazardScenarioLayers
      .filter(
        l =>
          l.hazardScenario?.product === product && l.hazardScenario?.slrScenarioM === slrScenarioM
      )
      .map(l => l.hazardScenario as HazardScenarioSelection);
    return candidates.sort((a, b) => {
      if (a.returnPeriodYears !== null && b.returnPeriodYears !== null) {
        return a.returnPeriodYears - b.returnPeriodYears;
      }
      if (a.returnPeriodYears !== null) return -1;
      if (b.returnPeriodYears !== null) return 1;
      return (a.eventLabel ?? '').localeCompare(b.eventLabel ?? '');
    })[0];
  };

  const sectionTriggerClass =
    'flex w-full items-center gap-2 bg-slate-900/60 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/70 group';

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
              : 'Control how the map displays data'}
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
            <button
              type="button"
              onClick={() => toggleSection('shading')}
              className={sectionTriggerClass}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                Map Shading
              </h3>
              {!expandedSections.shading && (
                <span className="text-[10px] text-slate-400 ml-auto mr-2">
                  {mapStyle === 'loss' ? 'Estimated damage' : 'Wind intensity'}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.shading ? 'rotate-180' : ''} ${!expandedSections.shading ? 'ml-auto' : ''}`}
              />
            </button>
            {expandedSections.shading && (
              <div className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35">
                <div className="grid grid-cols-2 gap-2 mt-3" data-tour="map-style-selector">
                  <button
                    type="button"
                    aria-pressed={mapStyle === 'loss'}
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

        {/* Overlays — per-layer accordion rows */}
        {(onCycloneLayerToggle ||
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
                } = row as {
                  id: string;
                  label: string;
                  icon: typeof CloudRain;
                  checked: boolean;
                  onToggle: (v: boolean) => void;
                  color: string;
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
                          checked ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {checked ? 'On' : 'Off'}
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
                                  aria-label={checked ? 'Hide cyclone track' : 'Show cyclone track'}
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

                          {id === 'cyclone' && (
                            <p className="text-[10px] text-slate-400">
                              Playback and timeline controls are in Advanced.
                            </p>
                          )}

                          {id === 'flood' && hazardScenarioProducts.length > 0 && (
                            <div className="pt-2 mt-2 border-t border-slate-700/40 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Hazard scenario
                              </p>

                              <label className="block">
                                <span className="block text-[10px] text-slate-400 mb-1">
                                  Product
                                </span>
                                <select
                                  value={selectedProduct}
                                  onChange={e => {
                                    const product = e.target.value;
                                    const slrOptions = Array.from(
                                      new Set(
                                        hazardScenarioLayers
                                          .filter(l => l.hazardScenario?.product === product)
                                          .map(l => l.hazardScenario!.slrScenarioM)
                                      )
                                    ).sort((a, b) => a - b);
                                    const firstMatch = pickDefaultScenarioFor(
                                      product,
                                      slrOptions[0]
                                    );
                                    if (firstMatch) {
                                      emitHazardScenario(
                                        product,
                                        firstMatch.slrScenarioM,
                                        firstMatch.returnPeriodYears,
                                        firstMatch.eventLabel
                                      );
                                    }
                                  }}
                                  className="w-full text-[11px] bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                                >
                                  {hazardScenarioProducts.map(product => {
                                    const label =
                                      HAZARD_SCENARIO_PRODUCT_LABELS[product] ?? product;
                                    const eventCount = hazardScenarioEventCounts.get(product) ?? 0;
                                    return (
                                      <option key={product} value={product}>
                                        {eventCount > 1 ? `${label} (${eventCount} events)` : label}
                                      </option>
                                    );
                                  })}
                                </select>
                              </label>

                              <label className="block">
                                <span className="block text-[10px] text-slate-400 mb-1">
                                  Sea level rise
                                </span>
                                <select
                                  value={selectedSlr}
                                  onChange={e => {
                                    const slrScenarioM = Number(e.target.value);
                                    const firstMatch = pickDefaultScenarioFor(
                                      selectedProduct,
                                      slrScenarioM
                                    );
                                    if (firstMatch) {
                                      emitHazardScenario(
                                        selectedProduct,
                                        slrScenarioM,
                                        firstMatch.returnPeriodYears,
                                        firstMatch.eventLabel
                                      );
                                    }
                                  }}
                                  className="w-full text-[11px] bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                                >
                                  {hazardScenarioSlrOptions.map(slr => (
                                    <option key={slr} value={slr}>
                                      {slr} m
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="block">
                                <span className="block text-[10px] text-slate-400 mb-1">
                                  {hazardScenarioSelectorOptions[0]?.returnPeriodYears !== null
                                    ? 'Return period'
                                    : 'Event'}
                                </span>
                                <select
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
                                  className="w-full text-[11px] bg-slate-800 border border-slate-600/50 rounded-lg px-2 py-1.5 text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                                >
                                  {hazardScenarioSelectorOptions.map(opt => {
                                    const key = `${opt.returnPeriodYears ?? ''}|${opt.eventLabel ?? ''}`;
                                    const label =
                                      opt.returnPeriodYears !== null
                                        ? `${opt.returnPeriodYears} yr return period`
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
                <button
                  type="button"
                  onClick={() => toggleSection('view3D')}
                  className={sectionTriggerClass}
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                    3D View
                  </h3>
                  {!expandedSections.view3D && (
                    <span className="text-[10px] text-slate-400 ml-auto mr-2">
                      {is3DView ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.view3D ? 'rotate-180' : ''} ${!expandedSections.view3D ? 'ml-auto' : ''}`}
                  />
                </button>
                {expandedSections.view3D && (
                  <div className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35 space-y-3">
                    {on3DViewToggle && (
                      <label className="flex items-center justify-between cursor-pointer group rounded-lg px-2 py-1.5 hover:bg-slate-800/50 mt-3">
                        <span className="text-xs text-slate-300 group-hover:text-white">
                          3D Buildings
                        </span>
                        <input
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
                        'Reset all saved preferences? You will see the basemap selection dialog again on next visit.'
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
