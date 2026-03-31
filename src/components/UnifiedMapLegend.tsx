'use client';

import { useMemo, useState } from 'react';
import { DollarSign, Wind, ChevronDown, ChevronUp, Info, Droplet } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { WIND_SEQUENTIAL_COLORS, getLossSequentialColors } from '@/utils/colorSystem';
import { RealWMSLayer } from '@/data/realThreddsLayers';
import { CountryCode } from '@/types/thredds';

import { BUILDING_DAMAGE_COLORS, ROAD_DAMAGE_COLORS } from '@/theme/colors';

interface UnifiedMapLegendProps {
  mode: 'loss' | 'wind';
  visible?: boolean;
  hasSelection?: boolean;
  dataSource?: string;
  temporalScope?: string;
  // Data-driven legend breaks
  dataValues?: number[];
  // Sidebar state for responsive positioning
  isLeftPanelOpen?: boolean;
  // Active layers visibility
  showBuildings?: boolean;
  showRoads?: boolean;
  showCyclone?: boolean;
  onZoomToBuildings?: () => void;
  onZoomToRoads?: () => void;
  // Active THREDDS WMS layers
  activeWmsLayers?: RealWMSLayer[];
  countryCode?: CountryCode | null;
}

function getWmsLegendGradient(styleName: string, hazardType: string): string {
  const normalizedStyle = styleName.toLowerCase();
  const isFloodLike =
    hazardType === 'flood' || hazardType === 'inundation' || hazardType === 'fluvial-depth';

  if (normalizedStyle.includes('x-sst')) {
    // Approximate ncWMS x-Sst ramp used by the rendered WMS layers.
    return 'linear-gradient(to right, #fff7bc, #fee391, #fec44f, #fe9929, #ec7014, #cc4c02, #993404, #662506)';
  }

  if (normalizedStyle.includes('blues') || (isFloodLike && !normalizedStyle.includes('ylorrd'))) {
    return 'linear-gradient(to right, #f7fbff, #deebf7, #c6dbef, #9ecae1, #6baed6, #4292c6, #2171b5, #08519c, #08306b)';
  }

  if (normalizedStyle.includes('ylorrd')) {
    return 'linear-gradient(to right, #ffffcc, #ffeda0, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)';
  }

  return 'linear-gradient(to right, #f0f0f0, #d0d0d0, #a0a0a0, #707070, #404040)';
}

function getWmsLegendUnits(hazardType: string): string {
  if (hazardType === 'wind') {
    return 'm/s';
  }
  return 'm';
}

function formatWmsStyleName(styleName: string): string {
  if (!styleName) {
    return 'default';
  }

  const trimmed = styleName.trim();
  if (!trimmed) {
    return 'default';
  }

  return trimmed.split('/').pop() || trimmed;
}

function formatContinuousRangeLabel(
  value: number,
  nextValue: number | null,
  mode: 'loss' | 'wind'
): string {
  if (mode === 'loss') {
    const current = formatCurrency(value);
    if (nextValue === null) {
      return `>= ${current}`;
    }
    return `${current} - ${formatCurrency(nextValue)}`;
  }

  const current = Math.round(value);
  if (nextValue === null) {
    return `>= ${current} km/h`;
  }
  return `${current}-${Math.round(nextValue)} km/h`;
}

export default function UnifiedMapLegend({
  mode,
  visible = true,
  hasSelection = false,
  dataSource = 'Real Data',
  temporalScope = 'Event Total',
  dataValues = [],
  isLeftPanelOpen = false,
  showBuildings = false,
  showRoads = false,
  showCyclone = false,
  onZoomToBuildings,
  onZoomToRoads,
  activeWmsLayers = [],
  countryCode = null,
}: UnifiedMapLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActiveWmsLayers = activeWmsLayers.length > 0;

  // Legend classes mirror the exact static thresholds used by map paint expressions.
  const legendClasses = useMemo(() => {
    const colorScale = (
      mode === 'loss' ? getLossSequentialColors(countryCode) : WIND_SEQUENTIAL_COLORS
    ).map(item => ({
      threshold: item.threshold,
      color: item.color,
    }));

    return colorScale.map((item, index) => {
      const nextItem = colorScale[index + 1];

      return {
        label: formatContinuousRangeLabel(item.threshold, nextItem?.threshold ?? null, mode),
        color: item.color,
        textColor: 'text-slate-900 dark:text-white',
        minValue: item.threshold,
        maxValue: nextItem ? nextItem.threshold : Infinity,
      };
    });
  }, [mode, countryCode]);

  const config = useMemo(() => {
    if (mode === 'loss') {
      return {
        title: hasActiveWmsLayers ? 'Regional Economic Damage (USD)' : 'Economic Damage (USD)',
        subtitle: hasActiveWmsLayers
          ? 'Regional damage overlay; historical hazard rasters are listed separately below'
          : 'Direct physical damage costs (USD)',
        icon: DollarSign,
        iconColor: 'text-green-600 dark:text-green-400',
        units: 'USD',
        footer: hasActiveWmsLayers
          ? 'Regional damage overlay in USD. Historical hazard rasters below use separate metadata, units, and palettes.'
          : 'Direct physical damage costs in USD',
        rangeLabel: 'Regional range',
      };
    } else {
      return {
        title: hasActiveWmsLayers ? 'Regional Wind Overlay (km/h)' : 'Peak Wind Speed (km/h)',
        subtitle: hasActiveWmsLayers
          ? 'Regional wind overlay in km/h; historical hazard rasters are listed separately below'
          : '10-minute sustained wind speed per district (km/h)',
        icon: Wind,
        iconColor: 'text-blue-600 dark:text-blue-400',
        units: 'km/h',
        footer: hasActiveWmsLayers
          ? 'Regional wind overlay in km/h. Historical hazard rasters below use separate metadata, units, and palettes.'
          : '10-minute sustained wind speed in km/h',
        rangeLabel: 'Regional range',
      };
    }
  }, [mode, hasActiveWmsLayers]);

  // Building damage legend classes (when buildings are visible)
  const buildingLegendClasses = useMemo(() => {
    if (!showBuildings) return [];

    return [
      { label: '< $10K', color: BUILDING_DAMAGE_COLORS.minimal },
      { label: '$10K - $50K', color: BUILDING_DAMAGE_COLORS.moderate },
      { label: '$50K - $100K', color: BUILDING_DAMAGE_COLORS.substantial },
      { label: '$100K - $500K', color: BUILDING_DAMAGE_COLORS.severe },
      { label: '> $500K', color: BUILDING_DAMAGE_COLORS.catastrophic },
    ];
  }, [showBuildings]);

  // Road damage legend classes (when roads are visible)
  const roadLegendClasses = useMemo(() => {
    if (!showRoads) return [];

    return [
      { label: '< $1K', color: ROAD_DAMAGE_COLORS.light, width: '4px' },
      { label: '$1K - $2K', color: ROAD_DAMAGE_COLORS.moderate, width: '5px' },
      { label: '$2K - $3K', color: ROAD_DAMAGE_COLORS.heavy, width: '7px' },
      { label: '> $3K', color: ROAD_DAMAGE_COLORS.severe, width: '9px' },
    ];
  }, [showRoads]);

  // Cyclone swath legend classes (when cyclone layer is visible)
  const cycloneSwathLegendClasses = useMemo(() => {
    if (!showCyclone) return [];

    return [
      {
        label: 'Hurricane Swath',
        description: 'Maximum hurricane-force footprint',
        color: 'rgba(244, 63, 94, 0.67)',
        borderColor: 'rgb(244, 63, 94)',
      },
      {
        label: 'Storm Swath',
        description: 'Maximum storm-force footprint',
        color: 'rgba(250, 204, 21, 0.47)',
        borderColor: 'rgb(250, 204, 21)',
      },
      {
        label: 'Gale Swath',
        description: 'Maximum gale-force footprint',
        color: 'rgba(56, 189, 248, 0.34)',
        borderColor: 'rgb(56, 189, 248)',
      },
    ];
  }, [showCyclone]);

  const IconComponent = config.icon;

  // Find min and max from data
  const dataRange = useMemo(() => {
    if (!dataValues || dataValues.length === 0) return null;
    const validValues = dataValues.filter(v => v != null && !isNaN(v));
    if (validValues.length === 0) return null;

    return {
      min: Math.min(...validValues),
      max: Math.max(...validValues),
    };
  }, [dataValues]);

  // Smart positioning strategy:
  // - Desktop: Position dynamically based on sidebar states
  // - Mobile: Bottom-left with compact design
  // - Avoid overlap with cyclone controls (bottom-right)
  // - Higher z-index for proper stacking
  // - Responsive width that adapts to available space

  const getResponsiveStyles = () => {
    return {
      width: isExpanded
        ? 'clamp(280px, calc(100vw - 2rem), 340px)' // Responsive width: min 280px, max 340px, adapts with 2rem margin
        : '56px',
      maxHeight: 'calc(100vh - 180px)', // Prevent vertical overflow
    };
  };

  // Hide only when globally disabled.
  // This must come AFTER all hooks to comply with Rules of Hooks
  if (!visible) return null;

  return (
    <div
      className={`
        fixed bottom-8 z-50 
        transition-all duration-300 ease-in-out 
        pointer-events-auto
        ${isLeftPanelOpen ? 'left-[336px]' : 'left-8'}
        max-md:left-4 max-md:bottom-20
        ${isExpanded ? 'max-md:w-[calc(100vw-2rem)]' : ''}
      `}
      style={getResponsiveStyles()}
      role="region"
      aria-label="Map legend"
    >
      {/* Simplified glass panel - less borders, cleaner look */}
      <div className="glass-panel rounded-lg shadow-xl overflow-hidden border border-white/10 backdrop-blur-md">
        {/* Compact toggle button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="
            w-full px-3 py-2.5 flex items-center justify-between 
            hover:bg-white/5 transition-all duration-200
            focus:outline-none focus:ring-1 focus:ring-blue-500/50
            group
          "
          aria-label={isExpanded ? 'Collapse legend' : 'Expand legend'}
          aria-expanded={isExpanded}
          title={isExpanded ? 'Click to minimize' : 'Click to view legend'}
        >
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-white/5 group-hover:bg-white/10 transition-all">
              <IconComponent className={`w-3.5 h-3.5 ${config.iconColor}`} aria-hidden="true" />
            </div>
            {isExpanded && (
              <span className="text-xs font-bold text-white uppercase tracking-wider">Legend</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDown
              className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors"
              aria-hidden="true"
            />
          ) : (
            <ChevronUp
              className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors"
              aria-hidden="true"
            />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div>
            {/* Consolidated header - no borders */}
            <div className="px-3 py-2 bg-black/10 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-3 h-3 text-blue-400" aria-hidden="true" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Map Display
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <span className="text-slate-500">Source:</span>
                  <span className="font-medium text-slate-200 ml-1">{dataSource}</span>
                </div>
                <div>
                  <span className="text-slate-500">Scope:</span>
                  <span className="font-medium text-slate-200 ml-1">{temporalScope}</span>
                </div>
              </div>
              {hasSelection && (
                <p className="text-xs text-amber-300">
                  Selection active: legend remains visible for overlay reference.
                </p>
              )}
            </div>

            {/* Title - simplified */}
            <div className="px-3 py-2">
              <h3 className="text-xs font-bold text-white mb-0.5">{config.title}</h3>
              <p className="text-xs text-slate-400">{config.subtitle}</p>
              {/* Show data range if available */}
              {dataRange && (
                <p className="text-xs text-slate-500 font-mono mt-1">
                  <span className="font-sans mr-1">{config.rangeLabel}:</span>
                  {mode === 'loss'
                    ? formatCurrency(dataRange.min)
                    : `${Math.round(dataRange.min)} km/h`}
                  {' → '}
                  {mode === 'loss'
                    ? formatCurrency(dataRange.max)
                    : `${Math.round(dataRange.max)} km/h`}
                </p>
              )}
            </div>

            {/* Legend Items - cleaner spacing */}
            <div className="px-2 py-2 space-y-1 max-h-[min(280px,calc(100vh-300px))] overflow-y-auto custom-scrollbar">
              {legendClasses.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                  role="listitem"
                >
                  {/* Simplified color swatch */}
                  <div
                    className="w-6 h-4 rounded flex-shrink-0"
                    style={{
                      backgroundColor:
                        typeof item.color === 'string' && item.color.startsWith('#')
                          ? item.color
                          : undefined,
                    }}
                  />

                  {/* Compact labels */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold font-mono text-slate-200">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Compact footer */}
            <div className="px-3 py-2 bg-black/10">
              <p className="text-xs text-slate-500 leading-relaxed">{config.footer}</p>
              {dataValues && dataValues.length > 0 && (
                <p className="text-xs text-blue-400 mt-1">✓ {dataValues.length} data points</p>
              )}
            </div>

            {/* THREDDS WMS Hazard Layers (when active) */}
            {activeWmsLayers && activeWmsLayers.length > 0 && (
              <>
                <div className="px-3 py-2 border-t border-white/10">
                  <h4 className="text-xs font-bold text-purple-400 mb-0.5 flex items-center gap-1.5">
                    <Droplet className="w-3 h-3" />
                    Historical Hazard Rasters
                  </h4>
                  <p className="text-xs text-slate-400">
                    Event-specific THREDDS rasters from Pacific Ocean Portal
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ranges and units come from layer metadata. Palette bars are visual previews of
                    the server style, not exact sampled legends.
                  </p>
                </div>

                <div className="px-2 py-2 space-y-3">
                  {activeWmsLayers.map((layer, layerIndex) => {
                    const parsedRange =
                      layer.styleConfig?.colorScaleRange
                        ?.split(',')
                        .map(v => Number(v.trim()))
                        .filter(v => Number.isFinite(v)) ?? [];
                    const hasValidRange = parsedRange.length === 2;
                    const rangeMin = hasValidRange ? parsedRange[0] : null;
                    const rangeMax = hasValidRange ? parsedRange[1] : null;
                    const isWind = layer.hazardType === 'wind';
                    const isFlood =
                      layer.hazardType === 'flood' ||
                      layer.hazardType === 'inundation' ||
                      layer.hazardType === 'fluvial-depth';
                    const colorStyle = layer.styleConfig?.styles || '';
                    const styleLabel = formatWmsStyleName(colorStyle);
                    const gradient = getWmsLegendGradient(colorStyle, layer.hazardType);
                    const units = getWmsLegendUnits(layer.hazardType);

                    return (
                      <div key={layerIndex} className="bg-black/20 rounded-lg p-2">
                        <div className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                          {isWind && <Wind className="w-3 h-3 text-yellow-400" />}
                          {isFlood && <Droplet className="w-3 h-3 text-blue-400" />}
                          {layer.name}
                        </div>

                        {/* Color gradient bar */}
                        <div
                          className="h-4 rounded overflow-hidden mb-2"
                          style={{
                            background: gradient,
                          }}
                        />

                        {/* Min and max labels */}
                        {hasValidRange ? (
                          <div className="flex justify-between text-xs text-slate-400 font-mono">
                            <span>
                              {rangeMin} {units}
                            </span>
                            <span>
                              {rangeMax} {units}
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 font-mono">
                            Range unavailable in WMS metadata
                          </div>
                        )}

                        <p className="text-xs text-slate-500 mt-1">
                          {isWind
                            ? `Wind speed intensity (${units})`
                            : `Flood inundation depth (${units})`}
                        </p>
                        <p className="text-xs text-slate-500">
                          Palette: {styleLabel}
                          {layer.styleConfig?.numColorBands
                            ? ` · ${layer.styleConfig.numColorBands} bands`
                            : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Buildings layer legend (when visible) */}
            {showBuildings && buildingLegendClasses.length > 0 && (
              <>
                <div className="px-3 py-2 border-t border-white/10">
                  <h4 className="text-xs font-bold text-amber-400 mb-0.5 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    Damaged Buildings
                  </h4>
                  <p className="text-xs text-slate-400">
                    Individual building damage (zoom to view)
                  </p>
                  {onZoomToBuildings && (
                    <button
                      type="button"
                      onClick={onZoomToBuildings}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/20"
                      aria-label="Zoom to damaged buildings"
                    >
                      Zoom to buildings
                    </button>
                  )}
                </div>

                <div className="px-2 py-2 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {buildingLegendClasses.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold font-mono text-slate-200">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Roads layer legend (when visible) */}
            {showRoads && roadLegendClasses.length > 0 && (
              <>
                <div className="px-3 py-2 border-t border-white/10">
                  <h4 className="text-xs font-bold text-orange-400 mb-0.5 flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-orange-400" />
                    Damaged Roads
                  </h4>
                  <p className="text-xs text-slate-400">
                    Road network damage (line thickness = severity)
                  </p>
                  {onZoomToRoads && (
                    <button
                      type="button"
                      onClick={onZoomToRoads}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-orange-400/40 bg-orange-400/10 px-2.5 py-1 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-400/20"
                      aria-label="Zoom to damaged roads"
                    >
                      Zoom to roads
                    </button>
                  )}
                </div>

                <div className="px-2 py-2 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {roadLegendClasses.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="flex-shrink-0"
                        style={{
                          width: '24px',
                          height: item.width,
                          backgroundColor: item.color,
                          borderRadius: '2px',
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold font-mono text-slate-200">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Cyclone swath legend (when visible) */}
            {showCyclone && cycloneSwathLegendClasses.length > 0 && (
              <>
                <div className="px-3 py-2 border-t border-white/10">
                  <h4 className="text-xs font-bold text-blue-400 mb-0.5 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    Cyclone Swath Envelope
                  </h4>
                  <p className="text-xs text-slate-400">
                    Maximum forecast wind footprints by force band
                  </p>
                </div>

                <div className="px-2 py-2 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {cycloneSwathLegendClasses.map(item => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-4 h-4 rounded border flex-shrink-0"
                        style={{
                          backgroundColor: item.color,
                          borderColor: item.borderColor,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200">{item.label}</div>
                        <div className="text-xs text-slate-500">{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Active layers indicator */}
            {(showBuildings || showRoads || showCyclone) && (
              <div className="px-3 py-2 border-t border-white/10 bg-black/5">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  Active layers:
                  {showBuildings && <span className="text-amber-400 font-medium">Buildings</span>}
                  {showRoads && <span className="text-orange-400 font-medium">Roads</span>}
                  {showCyclone && <span className="text-blue-400 font-medium">Cyclone</span>}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
