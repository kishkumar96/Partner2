"use client";

import { useState } from "react";
import { Globe2, Map, Satellite, Settings2 } from "lucide-react";

interface MapControlsProps {
  onBasemapChange: (basemap: string) => void;
  currentBasemap: string;
  mapStyle?: "loss" | "wind";
  onMapStyleChange?: (style: "loss" | "wind") => void;
}

const BASEMAPS = [
  {
    id: "positron",
    name: "Light",
    icon: Globe2,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  {
    id: "voyager",
    name: "Detailed",
    icon: Map,
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  },
  {
    id: "dark",
    name: "Dark",
    icon: Satellite,
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
];

/**
 * Unified Map Controls - Combines basemap switcher with future controls
 * Reduces overlay clutter and collision risk on small screens
 */
export function MapControls({
  onBasemapChange,
  currentBasemap,
  mapStyle,
  onMapStyleChange,
}: MapControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasMapStyleControls = !!mapStyle && !!onMapStyleChange;

  return (
    <div className="absolute top-4 left-4 z-[15] pointer-events-auto">
      {/* Compact trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-panel px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white transition-all"
        title="Map Tools"
      >
        <Settings2 className="w-5 h-5" />
        <span className="hidden sm:inline">Map Tools</span>
      </button>

      {/* Expanded controls panel */}
      {isOpen && (
        <>
          {/* Backdrop to close on click */}
          <div 
            className="fixed inset-0 z-[14]" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Controls popover */}
          <div className="absolute top-full left-0 mt-2 glass-panel rounded-lg p-3 min-w-[280px] z-[16] shadow-2xl">
            {hasMapStyleControls && (
              <div className="mb-3 pb-3 border-b border-slate-700">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Risk Layer
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onMapStyleChange?.("loss")}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      mapStyle === "loss"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                    }`}
                  >
                    Economic Loss
                  </button>
                  <button
                    onClick={() => onMapStyleChange?.("wind")}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      mapStyle === "wind"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                    }`}
                  >
                    Wind Speed
                  </button>
                </div>
              </div>
            )}
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Basemap Style
            </div>
            
            <div className="space-y-1.5">
              {BASEMAPS.map((basemap) => {
                const Icon = basemap.icon;
                const isActive = currentBasemap === basemap.style;
                
                return (
                  <button
                    key={basemap.id}
                    onClick={() => {
                      onBasemapChange(basemap.style);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{basemap.name}</span>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Placeholder for future controls */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="text-xs text-slate-500 italic">
                More controls coming soon
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
