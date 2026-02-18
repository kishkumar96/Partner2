'use client';

import { useMemo, useState } from 'react';
import { DollarSign, Wind, ChevronDown, ChevronUp, Info, Droplet } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { LOSS_SEQUENTIAL_COLORS, WIND_SEQUENTIAL_COLORS } from '@/utils/colorSystem';
import { RealWMSLayer } from '@/data/realThreddsLayers';

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
}

/**
 * Compute quantile breaks from actual data values
 * @param values Array of numeric values from the dataset
 * @param numClasses Number of classes to create
 * @returns Array of break points
 */
function computeQuantileBreaks(values: number[], numClasses: number): number[] {
  if (!values || values.length === 0) return [];

  const sorted = [...values].filter(v => v != null && !isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const breaks: number[] = [];
  for (let i = 1; i < numClasses; i++) {
    const index = Math.floor((sorted.length * i) / numClasses);
    breaks.push(sorted[Math.min(index, sorted.length - 1)]);
  }

  return breaks;
}

/**
 * Format legend label based on mode and value
 */
function formatLegendLabel(value: number, nextValue: number | null, mode: 'loss' | 'wind'): string {
  if (mode === 'loss') {
    const formatVal = (v: number) => {
      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
      return `$${v.toFixed(0)}`;
    };

    if (nextValue === null) {
      return `> ${formatVal(value)}`;
    }
    return `${formatVal(value)} - ${formatVal(nextValue)}`;
  } else {
    const formatVal = (v: number) => Math.round(v);

    if (nextValue === null) {
      return `> ${formatVal(value)} km/h`;
    }
    return `${formatVal(value)}-${formatVal(nextValue)} km/h`;
  }
}

/**
 * Get color for a legend class based on index
 * Uses unified color system for consistency
 */
function getLegendColor(index: number, total: number, mode: 'loss' | 'wind'): string {
  const colorScale = mode === 'loss' ? LOSS_SEQUENTIAL_COLORS : WIND_SEQUENTIAL_COLORS;

  // Map index to color scale
  const scaleIndex = Math.floor((index / (total - 1)) * (colorScale.length - 1));
  const colorHex = colorScale[Math.min(scaleIndex, colorScale.length - 1)].color;

  // Convert hex to Tailwind class (or return as inline style)
  // For now, return as inline style for exact color matching
  return colorHex;
}

/**
 * Get severity label for a class
 */
function getSeverityLabel(index: number, total: number, mode: 'loss' | 'wind'): string {
  const ratio = index / (total - 1);

  if (mode === 'loss') {
    if (ratio < 0.2) return 'Minimal';
    if (ratio < 0.4) return 'Low';
    if (ratio < 0.6) return 'Moderate';
    if (ratio < 0.8) return 'High';
    if (ratio < 0.95) return 'Severe';
    return 'Catastrophic';
  } else {
    if (ratio < 0.14) return 'Below TS';
    if (ratio < 0.29) return 'Cat 1 / TS';
    if (ratio < 0.43) return 'Cat 2';
    if (ratio < 0.57) return 'Cat 3';
    if (ratio < 0.71) return 'Cat 3 - Severe';
    if (ratio < 0.86) return 'Cat 4';
    return 'Cat 5 - Extreme';
  }
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
}: UnifiedMapLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Compute data-driven legend breaks
  const legendClasses = useMemo(() => {
    // If we have real data, compute quantile breaks
    if (dataValues && dataValues.length > 0) {
      const numClasses = mode === 'loss' ? 6 : 7;
      const breaks = computeQuantileBreaks(dataValues, numClasses);

      if (breaks.length > 0) {
        const max = Math.max(...dataValues);

        return breaks.map((breakValue, index) => {
          const nextValue = index < breaks.length - 1 ? breaks[index + 1] : null;
          return {
            label: formatLegendLabel(breakValue, nextValue, mode),
            color: getLegendColor(index, breaks.length, mode),
            textColor: 'text-slate-900 dark:text-white',
            range: getSeverityLabel(index, breaks.length, mode),
            minValue: breakValue,
            maxValue: nextValue || max,
          };
        });
      }
    }

    // Fallback to domain-specific thresholds from unified color system
    const colorScale = mode === 'loss' ? LOSS_SEQUENTIAL_COLORS : WIND_SEQUENTIAL_COLORS;

    return colorScale.map((item, index) => {
      const nextItem = colorScale[index + 1];
      const label =
        mode === 'loss'
          ? nextItem
            ? `${formatCurrency(item.threshold)} - ${formatCurrency(nextItem.threshold)}`
            : `> ${formatCurrency(item.threshold)}`
          : nextItem
            ? `${Math.round(item.threshold)}-${Math.round(nextItem.threshold)} km/h`
            : `> ${Math.round(item.threshold)} km/h`;

      return {
        label,
        color: item.color,
        textColor: 'text-slate-900 dark:text-white',
        range: item.label,
        minValue: item.threshold,
        maxValue: nextItem ? nextItem.threshold : Infinity,
      };
    });
  }, [mode, dataValues]);

  const config = useMemo(() => {
    if (mode === 'loss') {
      return {
        title: 'Economic Loss (USD)',
        subtitle: 'Direct physical damage costs (USD, millions)',
        icon: DollarSign,
        iconColor: 'text-green-600 dark:text-green-400',
        units: 'USD',
      };
    } else {
      return {
        title: 'Peak Wind Speed (km/h)',
        subtitle: '10-minute sustained wind speed per district (km/h)',
        icon: Wind,
        iconColor: 'text-blue-600 dark:text-blue-400',
        units: 'km/h',
      };
    }
  }, [mode]);

  // Building damage legend classes (when buildings are visible)
  const buildingLegendClasses = useMemo(() => {
    if (!showBuildings) return [];

    return [
      { label: '< $10K', color: BUILDING_DAMAGE_COLORS.minimal, range: 'Minimal' },
      { label: '$10K - $50K', color: BUILDING_DAMAGE_COLORS.moderate, range: 'Moderate' },
      { label: '$50K - $100K', color: BUILDING_DAMAGE_COLORS.substantial, range: 'Substantial' },
      { label: '$100K - $500K', color: BUILDING_DAMAGE_COLORS.severe, range: 'Severe' },
      { label: '> $500K', color: BUILDING_DAMAGE_COLORS.catastrophic, range: 'Catastrophic' },
    ];
  }, [showBuildings]);

  // Road damage legend classes (when roads are visible)
  const roadLegendClasses = useMemo(() => {
    if (!showRoads) return [];

    return [
      { label: '< $1K', color: ROAD_DAMAGE_COLORS.light, range: 'Light', width: '4px' },
      { label: '$1K - $2K', color: ROAD_DAMAGE_COLORS.moderate, range: 'Moderate', width: '5px' },
      { label: '$2K - $3K', color: ROAD_DAMAGE_COLORS.heavy, range: 'Heavy', width: '7px' },
      { label: '> $3K', color: ROAD_DAMAGE_COLORS.severe, range: 'Severe', width: '9px' },
    ];
  }, [showRoads]);

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

  // Hide when not visible or when something is selected
  // This must come AFTER all hooks to comply with Rules of Hooks
  if (!visible || hasSelection) return null;

  return (
    <div
      className={`
        fixed bottom-8 z-50 
        transition-all duration-300 ease-in-out 
        pointer-events-auto
        ${isLeftPanelOpen ? 'left-[304px]' : 'left-8'}
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
            </div>

            {/* Title - simplified */}
            <div className="px-3 py-2">
              <h3 className="text-xs font-bold text-white mb-0.5">{config.title}</h3>
              <p className="text-xs text-slate-400">{config.subtitle}</p>
              {/* Show data range if available */}
              {dataRange && (
                <p className="text-xs text-slate-500 font-mono mt-1">
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
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold font-mono text-slate-200">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-500 uppercase tracking-wide">
                      {item.range}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Compact footer */}
            <div className="px-3 py-2 bg-black/10">
              <p className="text-xs text-slate-500 leading-relaxed">
                {mode === 'loss'
                  ? 'Direct physical damage costs in USD (millions)'
                  : '10-minute sustained wind speed in km/h'}
              </p>
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
                    THREDDS Hazard Layers
                  </h4>
                  <p className="text-xs text-slate-400">
                    Real-time hazard intensity from Pacific Ocean Portal
                  </p>
                </div>

                <div className="px-2 py-2 space-y-3">
                  {activeWmsLayers.map((layer, layerIndex) => {
                    const range = layer.styleConfig?.colorScaleRange?.split(',').map(Number) || [
                      0, 100,
                    ];
                    const isWind = layer.hazardType === 'wind';
                    const isFlood =
                      layer.hazardType === 'flood' || layer.hazardType === 'inundation';

                    // Parse color style (e.g., "default-scalar/seq-YlOrRd" or "default-scalar/seq-Blues")
                    const colorStyle = layer.styleConfig?.styles || '';
                    const isBlues =
                      colorStyle.includes('Blues') || (isFlood && !colorStyle.includes('YlOrRd'));
                    const isYlOrRd = colorStyle.includes('YlOrRd');

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
                            background: isBlues
                              ? 'linear-gradient(to right, #f7fbff, #deebf7, #c6dbef, #9ecae1, #6baed6, #4292c6, #2171b5, #08519c, #08306b)'
                              : isYlOrRd
                                ? 'linear-gradient(to right, #ffffcc, #ffeda0, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)'
                                : 'linear-gradient(to right, #f0f0f0, #d0d0d0, #a0a0a0, #707070, #404040)',
                          }}
                        />

                        {/* Min and max labels */}
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                          <span>
                            {range[0]}
                            {isWind ? ' km/h' : ' m'}
                          </span>
                          <span>
                            {range[1]}
                            {isWind ? ' km/h' : ' m'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mt-1">
                          {isWind ? 'Wind speed intensity' : 'Flood inundation depth'}
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
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold font-mono text-slate-200">
                          {item.label}
                        </span>
                        <span className="text-xs text-slate-500 uppercase tracking-wide">
                          {item.range}
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
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold font-mono text-slate-200">
                          {item.label}
                        </span>
                        <span className="text-xs text-slate-500 uppercase tracking-wide">
                          {item.range}
                        </span>
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
