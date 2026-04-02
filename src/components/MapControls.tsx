'use client';

import { useState } from 'react';
import {
  Settings2,
  ChevronDown,
  Wind,
  Waves,
  Loader2,
  Download,
  Layers,
  Building2,
  Construction,
  Database,
  CloudRain,
} from 'lucide-react';

interface MapControlsProps {
  layout?: 'overlay' | 'panel';
  onBasemapChange: (basemap: string) => void;
  currentBasemap: string;
  mapStyle?: 'loss' | 'wind';
  onMapStyleChange?: (style: 'loss' | 'wind') => void;
  is3DView?: boolean;
  on3DViewToggle?: (enabled: boolean) => void;
  extrusionMode?: 'none' | 'loss' | 'wind';
  onExtrusionModeChange?: (mode: 'none' | 'loss' | 'wind') => void;
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  onWindLayerToggle?: (visible: boolean) => void;
  onInundationLayerToggle?: (visible: boolean) => void;
  showBuildingsLayer?: boolean;
  showRoadsLayer?: boolean;
  onBuildingsLayerToggle?: (visible: boolean) => void;
  onRoadsLayerToggle?: (visible: boolean) => void;
  showCycloneLayer?: boolean;
  onCycloneLayerToggle?: (visible: boolean) => void;
  isMapDataLoading?: boolean;
  mapDataLoadingLabel?: string;
  isHazardsLoading?: boolean;
  hazardsLoadingLabel?: string;
  isLoadingLayers?: boolean;
  loadingLabel?: string;
  hazardZoomBlocked?: boolean;
  hazardMinZoom?: number;
  currentZoom?: number;
  /** 0–100 global opacity for hazard layers */
  layerOpacity?: number;
  onLayerOpacityChange?: (value: number) => void;
  /** Callback to download the current map view as a PNG */
  onDownloadMap?: () => void;
  isDownloadingMap?: boolean;
}

/**
 * Unified Map Controls - layer/style tooling only.
 * Basemap selection is handled by the dedicated on-map BasemapSwitcher.
 */
export function MapControls({
  layout = 'overlay',
  mapStyle,
  onMapStyleChange,
  is3DView = false,
  on3DViewToggle,
  extrusionMode = 'none',
  onExtrusionModeChange,
  showWindLayer = true,
  showInundationLayer = true,
  onWindLayerToggle,
  onInundationLayerToggle,
  showBuildingsLayer = false,
  showRoadsLayer = false,
  onBuildingsLayerToggle,
  onRoadsLayerToggle,
  showCycloneLayer = false,
  onCycloneLayerToggle,
  isMapDataLoading = false,
  mapDataLoadingLabel = 'Loading map/data...',
  isHazardsLoading = false,
  hazardsLoadingLabel = 'Loading hazard layers...',
  isLoadingLayers = false,
  loadingLabel = 'Loading map layers...',
  hazardZoomBlocked = false,
  hazardMinZoom = 5,
  currentZoom,
  layerOpacity = 82,
  onLayerOpacityChange,
  onDownloadMap,
  isDownloadingMap = false,
}: MapControlsProps) {
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [expandedOverlayId, setExpandedOverlayId] = useState<string | null>(null);

  const hasMapStyleControls = !!mapStyle && !!onMapStyleChange;
  const has3DControls = !!on3DViewToggle;
  const hasLayerToggles =
    !!onWindLayerToggle || !!onInundationLayerToggle || !!onCycloneLayerToggle;
  const hasDamageLayerToggles = !!onBuildingsLayerToggle || !!onRoadsLayerToggle;
  const controlsBusy = isMapDataLoading || isHazardsLoading || isLoadingLayers;
  const extrusionControlsDisabled = controlsBusy || !is3DView;

  const overlaySections = [
    onCycloneLayerToggle
      ? {
          id: 'cyclone',
          title: 'Tropical Cyclone',
          description: 'Forecast track and cone visibility.',
          icon: CloudRain,
          checked: showCycloneLayer,
          onToggle: onCycloneLayerToggle,
          inputId: 'cyclone-layer-toggle',
          inputName: 'cycloneLayerToggle',
          colorClass: 'text-violet-300',
          ringClass: 'focus:ring-violet-500/50',
          checkboxClass: 'text-violet-500',
        }
      : null,
    onWindLayerToggle
      ? {
          id: 'wind',
          title: 'Maximum Wind',
          description: 'Maximum wind hazard intensity overlay.',
          icon: Wind,
          checked: showWindLayer,
          onToggle: onWindLayerToggle,
          inputId: 'wind-layer-toggle',
          inputName: 'windLayerToggle',
          colorClass: 'text-cyan-300',
          ringClass: 'focus:ring-cyan-500/50',
          checkboxClass: 'text-cyan-500',
        }
      : null,
    onInundationLayerToggle
      ? {
          id: 'flood',
          title: 'Maximum Inundation',
          description: 'Maximum flood and inundation coverage.',
          icon: Waves,
          checked: showInundationLayer,
          onToggle: onInundationLayerToggle,
          inputId: 'inundation-layer-toggle',
          inputName: 'inundationLayerToggle',
          colorClass: 'text-blue-300',
          ringClass: 'focus:ring-blue-500/50',
          checkboxClass: 'text-blue-500',
        }
      : null,
    onBuildingsLayerToggle
      ? {
          id: 'buildings',
          title: 'Damaged Buildings',
          description: 'Building damage footprints.',
          icon: Building2,
          checked: showBuildingsLayer,
          onToggle: onBuildingsLayerToggle,
          inputId: 'buildings-layer-toggle',
          inputName: 'buildingsLayerToggle',
          colorClass: 'text-amber-300',
          ringClass: 'focus:ring-amber-500/50',
          checkboxClass: 'text-amber-500',
        }
      : null,
    onRoadsLayerToggle
      ? {
          id: 'roads',
          title: 'Damaged Roads',
          description: 'Road disruption and damage traces.',
          icon: Construction,
          checked: showRoadsLayer,
          onToggle: onRoadsLayerToggle,
          inputId: 'roads-layer-toggle',
          inputName: 'roadsLayerToggle',
          colorClass: 'text-orange-300',
          ringClass: 'focus:ring-orange-500/50',
          checkboxClass: 'text-orange-500',
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    title: string;
    description: string;
    icon: typeof CloudRain;
    checked: boolean;
    onToggle: (visible: boolean) => void;
    inputId: string;
    inputName: string;
    colorClass: string;
    ringClass: string;
    checkboxClass: string;
  }>;

  const rootContainerClass =
    layout === 'panel'
      ? 'w-full pointer-events-auto flex flex-col gap-2 overflow-x-hidden'
      : 'absolute top-4 left-4 z-[15] pointer-events-auto w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100%-1rem)] flex flex-col gap-2 overflow-x-hidden';

  return (
    <div className={rootContainerClass}>
      {/* Loading Indicators */}
      {isMapDataLoading && (
        <div
          role="status"
          aria-live="polite"
          className="glass-panel rounded-lg px-3 py-2 shadow-lg animate-pulse border border-blue-500/30 bg-blue-900/20"
        >
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <Database className="w-3 h-3" />
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-medium">Map/Data: {mapDataLoadingLabel}</span>
          </div>
        </div>
      )}

      {(isHazardsLoading || isLoadingLayers) && (
        <div
          role="status"
          aria-live="polite"
          className="glass-panel rounded-lg px-3 py-2 shadow-lg animate-pulse border border-cyan-500/30 bg-cyan-900/20"
        >
          <div className="flex items-center gap-2 text-xs text-cyan-300">
            <Layers className="w-3 h-3" />
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-medium">
              Hazards: {isHazardsLoading ? hazardsLoadingLabel : loadingLabel}
            </span>
          </div>
        </div>
      )}

      {hazardZoomBlocked && (
        <div className="glass-panel rounded-lg px-3 py-2 shadow-lg border border-amber-500/30">
          <p className="text-[11px] text-amber-200">
            Hazard layers load at zoom {hazardMinZoom}+.
            {typeof currentZoom === 'number' ? ` Current: ${currentZoom.toFixed(1)}` : ''}
          </p>
        </div>
      )}

      {hasMapStyleControls && (
        <div className="glass-panel rounded-lg p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Quick Controls
            </span>
            <span className="text-[10px] text-slate-400">High-frequency actions</span>
          </div>

          {hasMapStyleControls && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={controlsBusy}
                aria-pressed={mapStyle === 'loss'}
                aria-label="Shade map by estimated damage"
                onClick={() => onMapStyleChange?.('loss')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mapStyle === 'loss'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                Estimated damage
              </button>
              <button
                type="button"
                disabled={controlsBusy}
                aria-pressed={mapStyle === 'wind'}
                aria-label="Shade map by wind intensity"
                onClick={() => onMapStyleChange?.('wind')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mapStyle === 'wind'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                Wind intensity
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-2">
            Regional shading is independent from overlays and filter selections.
          </p>
        </div>
      )}

      <button
        onClick={() => {
          setIsControlsOpen(current => !current);
        }}
        aria-label="Map Controls"
        className="glass-panel px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold text-slate-200 hover:text-white transition-all"
        title={isControlsOpen ? 'Hide advanced map tools' : 'Show advanced map tools'}
        aria-expanded={isControlsOpen}
        aria-controls="map-controls-panel"
      >
        <Settings2 className="w-4 h-4" />
        <span className="flex-1 text-left">Map Tools</span>
        <span className="text-[10px] font-semibold text-slate-300">
          {isControlsOpen ? 'On' : 'Off'}
        </span>
        <span className="text-xs text-slate-400">{isControlsOpen ? '▼' : '▶'}</span>
      </button>

      {isControlsOpen && (
        <>
          <div
            id="map-controls-panel"
            className="space-y-2 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 pb-1"
          >
            {/* Core map controls grouped by intent */}
            {(has3DControls ||
              hasLayerToggles ||
              hasDamageLayerToggles ||
              !!onLayerOpacityChange ||
              !!onDownloadMap) && (
              <div className="glass-panel rounded-lg p-3 shadow-lg">
                {has3DControls && (
                  <>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      3D Geometry
                    </div>
                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                        Enable 3D Buildings
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {is3DView ? 'On' : 'Off'}
                        </span>
                        <input
                          id="view-3d-toggle"
                          name="view3dToggle"
                          type="checkbox"
                          checked={is3DView}
                          disabled={controlsBusy}
                          onChange={e => {
                            const enabled = e.target.checked;
                            on3DViewToggle?.(enabled);
                            if (!enabled) {
                              onExtrusionModeChange?.('none');
                            }
                          }}
                          className="h-5 w-9 appearance-none rounded-full bg-slate-700/80 border border-slate-600/80 checked:bg-cyan-500/35 checked:border-cyan-400/60 relative cursor-pointer transition-colors before:content-[''] before:absolute before:top-[2px] before:left-[2px] before:h-3 before:w-3 before:rounded-full before:bg-slate-200 before:transition-transform checked:before:translate-x-4 focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Enable 3D Buildings"
                        />
                      </div>
                    </label>

                    {onExtrusionModeChange && (
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[11px] text-slate-400">Extrusion Source</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            disabled={extrusionControlsDisabled}
                            aria-pressed={extrusionMode === 'none'}
                            aria-label="No extrusion"
                            onClick={() => onExtrusionModeChange('none')}
                            className={`px-2 py-1.5 rounded text-[11px] font-semibold transition-all ${
                              extrusionMode === 'none'
                                ? 'bg-slate-600/40 text-slate-100 border border-slate-400/40'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                            } ${extrusionControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            None
                          </button>
                          <button
                            type="button"
                            disabled={extrusionControlsDisabled}
                            aria-pressed={extrusionMode === 'loss'}
                            aria-label="Economic Da extrusion"
                            onClick={() => onExtrusionModeChange('loss')}
                            className={`px-2 py-1.5 rounded text-[11px] font-semibold transition-all ${
                              extrusionMode === 'loss'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                            } ${extrusionControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Economic Damage
                          </button>
                          <button
                            type="button"
                            disabled={extrusionControlsDisabled}
                            aria-pressed={extrusionMode === 'wind'}
                            aria-label="Wind extrusion"
                            onClick={() => onExtrusionModeChange('wind')}
                            className={`px-2 py-1.5 rounded text-[11px] font-semibold transition-all ${
                              extrusionMode === 'wind'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                            } ${extrusionControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Wind
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Overlays */}
                {(hasLayerToggles || hasDamageLayerToggles) && (
                  <>
                    {has3DControls && <div className="border-t border-slate-700 mb-3 pt-3"></div>}
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      Map Overlays
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Overlay visibility only. Open a layer when you need its details.
                    </p>
                    <div className="space-y-2">
                      {overlaySections.map(section => {
                        const Icon = section.icon;
                        const isExpanded = expandedOverlayId === section.id;

                        return (
                          <div
                            key={section.id}
                            className="rounded-lg border border-slate-700/80 bg-slate-900/35 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOverlayId(current =>
                                  current === section.id ? null : section.id
                                )
                              }
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/60 transition-colors"
                              aria-expanded={isExpanded}
                              aria-controls={`${section.id}-overlay-panel`}
                            >
                              <Icon className={`w-4 h-4 ${section.colorClass}`} />
                              <span className="text-sm text-slate-200 flex-1">{section.title}</span>
                              <span className="text-[10px] font-semibold text-slate-400">
                                {section.checked ? 'Visible' : 'Hidden'}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

                            {isExpanded && (
                              <div
                                id={`${section.id}-overlay-panel`}
                                className="border-t border-slate-700/70 px-3 py-3 space-y-2"
                              >
                                <p className="text-[11px] text-slate-400">{section.description}</p>
                                <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                    Show layer
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-slate-400">
                                      {section.checked ? 'On' : 'Off'}
                                    </span>
                                    <input
                                      id={section.inputId}
                                      name={section.inputName}
                                      type="checkbox"
                                      checked={section.checked}
                                      disabled={controlsBusy}
                                      onChange={e => section.onToggle(e.target.checked)}
                                      aria-label={section.title}
                                      className={`w-4 h-4 rounded border-slate-600 bg-slate-800 ${section.checkboxClass} focus:ring-2 ${section.ringClass} cursor-pointer`}
                                    />
                                  </div>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Layer Opacity */}
                {onLayerOpacityChange && (
                  <>
                    <div className="border-t border-slate-700 my-3" />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          <Layers className="w-3.5 h-3.5" />
                          Layer Opacity
                        </div>
                        <span className="text-xs font-mono text-slate-300">{layerOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={layerOpacity}
                        disabled={controlsBusy}
                        onChange={e => onLayerOpacityChange(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-blue-400 cursor-pointer"
                        aria-label={`Layer opacity, ${layerOpacity} percent`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={layerOpacity}
                      />
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>Hidden</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {onDownloadMap && (
            <div className="glass-panel rounded-lg p-3 shadow-lg">
              <button
                onClick={onDownloadMap}
                disabled={isDownloadingMap || controlsBusy}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-400/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-xs font-semibold"
                title={
                  isDownloadingMap ? 'Preparing map export...' : 'Download current map view as PNG'
                }
                aria-busy={isDownloadingMap}
              >
                {isDownloadingMap ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Preparing export...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Download Map (PNG)
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
