'use client';

/**
 * MapPanel - Dedicated panel for map visualization controls
 *
 * Separated from FilterPanel to maintain clear separation of concerns:
 * - FilterPanel: Controls WHAT data to analyze (filters)
 * - MapPanel: Controls HOW to visualize data (display settings)
 */

import { useState } from 'react';
import {
  ChevronDown,
  Loader2,
  Map as MapIcon,
  Globe2,
  Satellite,
  Wind,
  Waves,
  Building2,
  Construction,
  Layers,
} from 'lucide-react';

const BASEMAP_OPTIONS = [
  {
    id: 'positron',
    name: 'Light',
    icon: Globe2,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  {
    id: 'voyager',
    name: 'Detailed',
    icon: MapIcon,
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  },
  {
    id: 'dark',
    name: 'Dark',
    icon: Satellite,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    icon: Globe2,
    style: 'https://tiles.openfreemap.org/styles/liberty',
  },
] as const;

interface MapPanelProps {
  // Basemap
  currentBasemap?: string;
  onBasemapChange?: (basemap: string) => void;

  // Regional shading
  mapStyle?: 'loss' | 'wind';
  onMapStyleChange?: (style: 'loss' | 'wind') => void;

  // Layer toggles
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  showBuildingsLayer?: boolean;
  showRoadsLayer?: boolean;
  onWindLayerToggle?: (visible: boolean) => void;
  onInundationLayerToggle?: (visible: boolean) => void;
  onBuildingsLayerToggle?: (visible: boolean) => void;
  onRoadsLayerToggle?: (visible: boolean) => void;

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

  // User preferences
  onResetUserPreferences?: () => void;

  // Loading states
  isMapDataLoading?: boolean;
  isHazardsLoading?: boolean;
  hazardZoomBlocked?: boolean;
}

export default function MapPanel({
  currentBasemap,
  onBasemapChange,
  mapStyle,
  onMapStyleChange,
  showWindLayer = true,
  showInundationLayer = true,
  showBuildingsLayer = false,
  showRoadsLayer = false,
  onWindLayerToggle,
  onInundationLayerToggle,
  onBuildingsLayerToggle,
  onRoadsLayerToggle,
  layerOpacity = 82,
  onLayerOpacityChange,
  is3DView = false,
  on3DViewToggle,
  extrusionMode = 'none',
  onExtrusionModeChange,
  extrusionExaggeration = 1,
  onExtrusionExaggerationChange,
  onResetUserPreferences,
  isMapDataLoading = false,
  isHazardsLoading = false,
  hazardZoomBlocked = false,
}: MapPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    basemap: true,
    shading: true,
    overlays: true,
    view3D: false,
  });
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const controlsBusy = isMapDataLoading;
  const extrusionControlsDisabled = !is3DView || controlsBusy;

  const sectionTriggerClass =
    'flex w-full items-center gap-2 bg-slate-900/60 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/70 group';

  return (
    <div className="w-80 border-l border-purple-500/15 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[inset_1px_0_0_rgba(168,85,247,0.08)] flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate">
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

        {/* Basemap Section */}
        {onBasemapChange && (
          <div className="mx-3 mt-3 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('basemap')}
              className={sectionTriggerClass}
            >
              <Globe2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                Basemap
              </h3>
              {!expandedSections.basemap && (
                <span className="text-[10px] text-slate-500 ml-auto mr-2">
                  {BASEMAP_OPTIONS.find(opt => opt.style === currentBasemap)?.name || 'Light'}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.basemap ? 'rotate-180' : ''} ${!expandedSections.basemap ? 'ml-auto' : ''}`}
              />
            </button>
            {expandedSections.basemap && (
              <div className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35">
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {BASEMAP_OPTIONS.map(option => {
                    const Icon = option.icon;
                    const isActive = currentBasemap === option.style;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={controlsBusy}
                        aria-pressed={isActive}
                        onClick={() => onBasemapChange(option.style)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                          isActive
                            ? 'border-purple-500/40 bg-purple-500/12 text-purple-200'
                            : 'border-slate-700/60 text-slate-300 hover:bg-slate-800/40 hover:text-white'
                        } ${controlsBusy ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{option.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Color By Section */}
        {onMapStyleChange && mapStyle && (
          <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('shading')}
              className={sectionTriggerClass}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                Color By
              </h3>
              {!expandedSections.shading && (
                <span className="text-[10px] text-slate-500 ml-auto mr-2">
                  {mapStyle === 'loss' ? 'Damage' : 'Wind'}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.shading ? 'rotate-180' : ''} ${!expandedSections.shading ? 'ml-auto' : ''}`}
              />
            </button>
            {expandedSections.shading && (
              <div className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35">
                <div className="grid grid-cols-2 gap-2 mt-3">
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
                    Damage
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
                    Wind
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overlays Section */}
        {(onWindLayerToggle ||
          onInundationLayerToggle ||
          onBuildingsLayerToggle ||
          onRoadsLayerToggle) && (
          <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('overlays')}
              className={sectionTriggerClass}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                Overlays
              </h3>
              {!expandedSections.overlays && (
                <span className="text-[10px] text-slate-500 ml-auto mr-2">
                  {
                    [showWindLayer, showInundationLayer, showBuildingsLayer, showRoadsLayer].filter(
                      Boolean
                    ).length
                  }{' '}
                  active
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.overlays ? 'rotate-180' : ''} ${!expandedSections.overlays ? 'ml-auto' : ''}`}
              />
            </button>
            {expandedSections.overlays && (
              <div className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35">
                <div className="space-y-1.5 mt-3">
                  {onWindLayerToggle && (
                    <label className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={showWindLayer}
                        onChange={e => onWindLayerToggle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                      />
                      <Wind className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs text-slate-300 group-hover:text-white flex-1">
                        Wind
                      </span>
                    </label>
                  )}
                  {onInundationLayerToggle && (
                    <label className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={showInundationLayer}
                        onChange={e => onInundationLayerToggle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-1 focus:ring-blue-500/50"
                      />
                      <Waves className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs text-slate-300 group-hover:text-white flex-1">
                        Flood
                      </span>
                    </label>
                  )}
                  {onBuildingsLayerToggle && (
                    <label className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={showBuildingsLayer}
                        onChange={e => onBuildingsLayerToggle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-1 focus:ring-amber-500/50"
                      />
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-slate-300 group-hover:text-white flex-1">
                        Buildings
                      </span>
                    </label>
                  )}
                  {onRoadsLayerToggle && (
                    <label className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={showRoadsLayer}
                        onChange={e => onRoadsLayerToggle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-1 focus:ring-orange-500/50"
                      />
                      <Construction className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs text-slate-300 group-hover:text-white flex-1">
                        Roads
                      </span>
                    </label>
                  )}
                </div>
              </div>
            )}
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
                <div className="px-4 py-3">
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
                    <span className="text-[10px] text-slate-500 ml-auto mr-2">
                      {is3DView ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.view3D ? 'rotate-180' : ''} ${!expandedSections.view3D ? 'ml-auto' : ''}`}
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
                          <p className="mt-1.5 text-[10px] text-slate-500">
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
                        <p className="mt-1.5 text-[10px] text-slate-500">
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
}
