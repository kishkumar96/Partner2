"use client";

interface BasemapSwitcherProps {
  onBasemapChange: (basemap: string) => void;
  currentBasemap: string;
}

import { Globe2, Map, Satellite } from "lucide-react";

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

export function BasemapSwitcher({
  onBasemapChange,
  currentBasemap,
}: BasemapSwitcherProps) {
  return (
    <div className="absolute top-4 left-4 z-[15] flex gap-2 bg-slate-900/80 backdrop-blur-sm rounded-lg p-2 border border-slate-700 max-w-[calc(100vw-5rem)] overflow-x-auto pointer-events-auto">
      {BASEMAPS.map((basemap) => (
        <button
          key={basemap.id}
          onClick={() => onBasemapChange(basemap.style)}
          className={`px-3 py-2 rounded transition-all text-sm font-medium flex items-center gap-1 ${
            currentBasemap === basemap.style
              ? "bg-neon-cyan/30 text-neon-cyan border border-neon-cyan/50"
              : "text-slate-300 hover:text-slate-100 hover:bg-slate-800/50"
          }`}
          title={basemap.name}
        >
          <basemap.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{basemap.name}</span>
        </button>
      ))}
    </div>
  );
}
