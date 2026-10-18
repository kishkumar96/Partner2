'use client';

import { Loader2 } from 'lucide-react';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';

/**
 * The switches for a forecast's map overlays, shown inside Map Controls.
 * They change what is drawn, not the analysis.
 */
export default function ForecastLayersSection({
  controls,
  id,
}: {
  controls: ForecastLayerControls;
  id: string;
}) {
  return (
    <div id={id} className="space-y-2 border-t border-slate-700/40 bg-slate-900/35 px-4 pb-3 pt-2">
      <p className="text-[10px] text-slate-400">Adds map detail; the figures don’t change.</p>
      {controls.options.map(option => (
        <div key={option.id}>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={controls.shown[option.id]}
              onChange={() => controls.toggle(option.id)}
              className="accent-sky-400"
            />
            <span>{option.label}</span>
            {option.id === 'floodplain' && controls.floodplainState === 'loading' && (
              <Loader2 className="h-3 w-3 animate-spin text-sky-300" aria-hidden="true" />
            )}
          </label>
          {option.note && <p className="ml-5 text-[10px] text-slate-400">{option.note}</p>}
        </div>
      ))}
    </div>
  );
}
