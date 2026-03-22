'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Globe2,
  Map,
  Satellite,
  Settings2,
  Wind,
  Waves,
  Loader2,
  Download,
  Layers,
  Building2,
  Construction,
  Database,
} from 'lucide-react';

interface MapControlsProps {
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

const BASEMAPS = [
  {
    id: 'positron',
    name: 'Light',
    icon: Globe2,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  {
    id: 'voyager',
    name: 'Detailed',
    icon: Map,
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
];

export { BASEMAPS };

/**
 * Unified Map Controls - Combines basemap switcher with layer controls
 * Now with prominent layer toggles that are always visible
 */
export function MapControls({
  onBasemapChange,
  currentBasemap,
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
  const [isBasemapOpen, setIsBasemapOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(true);
  const basemapTriggerRef = useRef<HTMLButtonElement | null>(null);
  const basemapOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const hasMapStyleControls = !!mapStyle && !!onMapStyleChange;
  const has3DControls = !!on3DViewToggle;
  const hasLayerToggles = !!onWindLayerToggle || !!onInundationLayerToggle;
  const hasDamageLayerToggles = !!onBuildingsLayerToggle || !!onRoadsLayerToggle;
  const controlsBusy = isMapDataLoading || isHazardsLoading || isLoadingLayers;
  const extrusionControlsDisabled = controlsBusy || !is3DView;

  const closeBasemapMenu = (restoreFocus = false) => {
    setIsBasemapOpen(false);
    if (restoreFocus) {
      setTimeout(() => basemapTriggerRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (!isBasemapOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBasemapMenu(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBasemapOpen]);

  useEffect(() => {
    if (!isBasemapOpen) return;
    requestAnimationFrame(() => {
      const selectedIndex = BASEMAPS.findIndex(b => b.style === currentBasemap);
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
      basemapOptionRefs.current[targetIndex]?.focus();
    });
  }, [isBasemapOpen, currentBasemap]);

  const focusBasemapIndex = (index: number) => {
    const count = BASEMAPS.length;
    if (!count) return;
    const wrappedIndex = (index + count) % count;
    basemapOptionRefs.current[wrappedIndex]?.focus();
  };

  return (
    <div className="absolute top-4 left-4 z-[15] pointer-events-auto w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-1rem)] flex flex-col gap-2">
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

      <button
        onClick={() => {
          const next = !isControlsOpen;
          setIsControlsOpen(next);
          if (!next) setIsBasemapOpen(false);
        }}
        className="glass-panel px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold text-slate-200 hover:text-white transition-all"
        title={isControlsOpen ? 'Hide map controls' : 'Show map controls'}
        aria-expanded={isControlsOpen}
        aria-controls="map-controls-panel"
      >
        <Settings2 className="w-4 h-4" />
        <span className="flex-1 text-left">Map Controls</span>
        <span className="text-[10px] font-semibold text-slate-300">
          {isControlsOpen ? 'On' : 'Off'}
        </span>
        <span className="text-xs text-slate-400">{isControlsOpen ? '▼' : '▶'}</span>
      </button>

      {isControlsOpen && (
        <>
          <div
            id="map-controls-panel"
            className="space-y-2 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-1"
          >
            {/* Core map controls grouped by intent */}
            {(hasMapStyleControls ||
              has3DControls ||
              hasLayerToggles ||
              hasDamageLayerToggles ||
              !!onLayerOpacityChange ||
              !!onDownloadMap) && (
              <div className="glass-panel rounded-lg p-3 shadow-lg">
                {/* View Mode */}
                {hasMapStyleControls && (
                  <>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      Regional Colors
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        disabled={controlsBusy}
                        aria-pressed={mapStyle === 'loss'}
                        aria-label="Economic Loss Coloring"
                        onClick={() => onMapStyleChange?.('loss')}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                          mapStyle === 'loss'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        Economic Loss
                      </button>
                      <button
                        type="button"
                        disabled={controlsBusy}
                        aria-pressed={mapStyle === 'wind'}
                        aria-label="Wind Exposure Coloring"
                        onClick={() => onMapStyleChange?.('wind')}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                          mapStyle === 'wind'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        Wind Exposure
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Affects region coloring only. Does not toggle hazard layers.
                    </p>
                  </>
                )}

                {has3DControls && (
                  <>
                    <div className="border-t border-slate-700 mb-3 pt-3"></div>
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
                        <div className="text-[11px] text-slate-500">Extrusion Source</div>
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
                            aria-label="Economic loss extrusion"
                            onClick={() => onExtrusionModeChange('loss')}
                            className={`px-2 py-1.5 rounded text-[11px] font-semibold transition-all ${
                              extrusionMode === 'loss'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                            } ${extrusionControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Economic Loss
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
                    {hasMapStyleControls && (
                      <div className="border-t border-slate-700 mb-3 pt-3"></div>
                    )}
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      Hazard Layers
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Layer visibility only. Independent from regional color mode.
                    </p>
                    <div className="space-y-2">
                      {onWindLayerToggle && (
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            id="wind-layer-toggle"
                            name="windLayerToggle"
                            type="checkbox"
                            checked={showWindLayer}
                            disabled={controlsBusy}
                            onChange={e => onWindLayerToggle(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                          />
                          <Wind className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                            Wind Layer
                          </span>
                          <span className="ml-auto text-[10px] font-semibold text-slate-300">
                            {showWindLayer ? 'Visible' : 'Hidden'}
                          </span>
                        </label>
                      )}
                      {onInundationLayerToggle && (
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            id="inundation-layer-toggle"
                            name="inundationLayerToggle"
                            type="checkbox"
                            checked={showInundationLayer}
                            disabled={controlsBusy}
                            onChange={e => onInundationLayerToggle(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                          />
                          <Waves className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                            Flood Layer
                          </span>
                          <span className="ml-auto text-[10px] font-semibold text-slate-300">
                            {showInundationLayer ? 'Visible' : 'Hidden'}
                          </span>
                        </label>
                      )}
                      {onBuildingsLayerToggle && (
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            id="buildings-layer-toggle"
                            name="buildingsLayerToggle"
                            type="checkbox"
                            checked={showBuildingsLayer}
                            disabled={controlsBusy}
                            onChange={e => onBuildingsLayerToggle(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
                          />
                          <Building2 className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                            Damaged Buildings
                          </span>
                          <span className="ml-auto text-[10px] font-semibold text-slate-300">
                            {showBuildingsLayer ? 'Visible' : 'Hidden'}
                          </span>
                        </label>
                      )}
                      {onRoadsLayerToggle && (
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            id="roads-layer-toggle"
                            name="roadsLayerToggle"
                            type="checkbox"
                            checked={showRoadsLayer}
                            disabled={controlsBusy}
                            onChange={e => onRoadsLayerToggle(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
                          />
                          <Construction className="w-4 h-4 text-orange-400" />
                          <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                            Damaged Roads
                          </span>
                          <span className="ml-auto text-[10px] font-semibold text-slate-300">
                            {showRoadsLayer ? 'Visible' : 'Hidden'}
                          </span>
                        </label>
                      )}
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

          {/* Collapsible: Basemap Selector - outside overflow container to prevent popup clipping */}
          <div className="relative">
            <button
              ref={basemapTriggerRef}
              onClick={() => setIsBasemapOpen(!isBasemapOpen)}
              disabled={controlsBusy}
              className="glass-panel px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white transition-all w-full"
              title="Change basemap"
              aria-expanded={isBasemapOpen}
              aria-controls="basemap-panel"
              aria-haspopup="menu"
            >
              <Settings2 className="w-5 h-5" />
              <span className="flex-1 text-left">Basemap</span>
              <span className="text-xs text-slate-400">{isBasemapOpen ? '▼' : '▶'}</span>
            </button>

            {isBasemapOpen && (
              <>
                {/* Backdrop to close on click */}
                <button
                  type="button"
                  className="fixed inset-0 z-[14]"
                  onClick={() => closeBasemapMenu(true)}
                  aria-label="Close basemap menu"
                />

                {/* Basemap options popover */}
                <div
                  id="basemap-panel"
                  role="menu"
                  aria-label="Basemap options"
                  onKeyDown={event => {
                    const activeIndex = basemapOptionRefs.current.findIndex(
                      item => item === document.activeElement
                    );

                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusBasemapIndex(activeIndex + 1);
                      return;
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      focusBasemapIndex(activeIndex - 1);
                      return;
                    }

                    if (event.key === 'Home') {
                      event.preventDefault();
                      focusBasemapIndex(0);
                      return;
                    }

                    if (event.key === 'End') {
                      event.preventDefault();
                      focusBasemapIndex(BASEMAPS.length - 1);
                    }
                  }}
                  className="absolute bottom-full left-0 mb-2 glass-panel rounded-lg p-3 w-[min(90vw,320px)] max-w-[320px] z-[16] shadow-2xl"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    Basemap
                  </div>

                  <div className="space-y-1.5">
                    {BASEMAPS.map((basemap, idx) => {
                      const Icon = basemap.icon;
                      const isActive = currentBasemap === basemap.style;

                      return (
                        <button
                          key={basemap.id}
                          ref={el => {
                            basemapOptionRefs.current[idx] = el;
                          }}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => {
                            onBasemapChange(basemap.style);
                            closeBasemapMenu(true);
                          }}
                          className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                          }`}
                        >
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-left">{basemap.name}</span>
                          {isActive && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
