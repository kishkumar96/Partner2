'use client';

import { Globe2, Map, Moon } from 'lucide-react';
import { BASEMAP_STYLES } from '@/utils/basemaps';

interface BasemapSwitcherProps {
  onBasemapChange: (basemap: string) => void;
  currentBasemap: string;
}

const BASEMAPS = [
  {
    id: 'positron',
    name: 'Light',
    icon: Globe2,
    style: BASEMAP_STYLES.positron,
  },
  {
    id: 'voyager',
    name: 'Detailed',
    icon: Map,
    style: BASEMAP_STYLES.voyager,
  },
  {
    id: 'dark',
    name: 'Dark',
    icon: Moon,
    style: BASEMAP_STYLES.dark,
  },
];

export function BasemapSwitcher({ onBasemapChange, currentBasemap }: BasemapSwitcherProps) {
  const isActive = (basemapStyle: string) => currentBasemap === basemapStyle;

  return (
    <div className="absolute top-3 left-3 md:top-4 md:left-4 z-[45] flex gap-2 bg-slate-900/82 backdrop-blur-md rounded-xl p-2 border border-slate-700/80 shadow-xl max-w-[calc(100%-1.5rem)] overflow-x-auto pointer-events-auto">
      {BASEMAPS.map(basemap => (
        <button
          key={basemap.id}
          onClick={() => onBasemapChange(basemap.style)}
          className={`px-3 py-2 rounded-lg transition-all text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap ${
            isActive(basemap.style)
              ? 'bg-neon-cyan/30 text-neon-cyan border border-neon-cyan/50'
              : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/50'
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
