'use client';

import { useState } from 'react';
import { Globe2, Map, Satellite, Settings2, Wind, Waves, Loader2 } from 'lucide-react';

interface MapControlsProps {
  onBasemapChange: (basemap: string) => void;
  currentBasemap: string;
  mapStyle?: 'loss' | 'wind';
  onMapStyleChange?: (style: 'loss' | 'wind') => void;
  showWindLayer?: boolean;
  showInundationLayer?: boolean;
  onWindLayerToggle?: (visible: boolean) => void;
  onInundationLayerToggle?: (visible: boolean) => void;
  isLoadingLayers?: boolean;
}

const BASEMAPS = [
  {
    id: 'positron',
    name: 'Light',
    icon: Globe2,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    fallback: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    id: 'voyager',
    name: 'Detailed',
    icon: Map,
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    fallback: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'dark',
    name: 'Dark',
    icon: Satellite,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    fallback: 'https://tiles.openfreemap.org/styles/dark',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    icon: Globe2,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    fallback: null, // Already a fallback option
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
  showWindLayer = true,
  showInundationLayer = true,
  onWindLayerToggle,
  onInundationLayerToggle,
  isLoadingLayers = false,
}: MapControlsProps) {
  const [isBasemapOpen, setIsBasemapOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);

  const hasMapStyleControls = !!mapStyle && !!onMapStyleChange;
  const hasLayerToggles = !!onWindLayerToggle || !!onInundationLayerToggle;

  return (
    <div className="absolute top-4 left-4 z-[15] pointer-events-auto space-y-2">
      {/* Loading Indicator - Floating tooltip */}
      {isLoadingLayers && (
        <div className="glass-panel rounded-lg px-3 py-2 shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-xs text-cyan-300">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-medium">Loading hazard layers...</span>
          </div>
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
        <span className="text-xs text-slate-400">{isControlsOpen ? '▼' : '▶'}</span>
      </button>

      {isControlsOpen && (
        <div id="map-controls-panel" className="space-y-2">
          {/* Combined: Map Visualization Controls */}
          {(hasMapStyleControls || hasLayerToggles) && (
            <div className="glass-panel rounded-lg p-3 shadow-lg">
              {/* Regional Impact Coloring */}
              {hasMapStyleControls && (
                <>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    Color Regions By
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => onMapStyleChange?.('loss')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        mapStyle === 'loss'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      💰 Loss
                    </button>
                    <button
                      onClick={() => onMapStyleChange?.('wind')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        mapStyle === 'wind'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      🌀 Wind
                    </button>
                  </div>
                </>
              )}

              {/* Hazard Layer Toggles */}
              {hasLayerToggles && (
                <>
                  {hasMapStyleControls && (
                    <div className="border-t border-slate-700 mb-3 pt-3"></div>
                  )}
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    Show Hazard Layers
                  </div>
                  <div className="space-y-2">
                    {onWindLayerToggle && (
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          id="wind-layer-toggle"
                          name="windLayerToggle"
                          type="checkbox"
                          checked={showWindLayer}
                          onChange={e => onWindLayerToggle(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                        />
                        <Wind className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                          Wind
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
                          onChange={e => onInundationLayerToggle(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                        />
                        <Waves className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                          Flooding
                        </span>
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Collapsible: Basemap Selector */}
          <div>
            <button
              onClick={() => setIsBasemapOpen(!isBasemapOpen)}
              className="glass-panel px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white transition-all w-full"
              title="Change Basemap"
            >
              <Settings2 className="w-5 h-5" />
              <span className="flex-1 text-left">Basemap</span>
              <span className="text-xs text-slate-400">{isBasemapOpen ? '▼' : '▶'}</span>
            </button>

            {isBasemapOpen && (
              <>
                {/* Backdrop to close on click */}
                <div className="fixed inset-0 z-[14]" onClick={() => setIsBasemapOpen(false)} />

                {/* Basemap options popover */}
                <div className="absolute top-full left-0 mt-2 glass-panel rounded-lg p-3 min-w-[280px] z-[16] shadow-2xl">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    Basemap Style
                  </div>

                  <div className="space-y-1.5">
                    {BASEMAPS.map(basemap => {
                      const Icon = basemap.icon;
                      const isActive = currentBasemap === basemap.style;

                      return (
                        <button
                          key={basemap.id}
                          onClick={() => {
                            onBasemapChange(basemap.style);
                            setIsBasemapOpen(false);
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
        </div>
      )}
    </div>
  );
}
