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
          {option.id === 'times' && controls.shown.times && (
            <div
              role="radiogroup"
              aria-label="Time zone for the labels"
              className="ml-5 mt-1 inline-flex overflow-hidden rounded-md border border-slate-600 text-[10px]"
            >
              {(['utc', 'local'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={controls.timeZoneMode === mode}
                  onClick={() => controls.setTimeZoneMode(mode)}
                  className={`px-2 py-0.5 font-semibold ${
                    controls.timeZoneMode === mode
                      ? 'bg-sky-500/30 text-sky-100'
                      : 'text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  {mode === 'utc'
                    ? 'UTC'
                    : controls.timeZoneMode === 'local'
                      ? controls.timeZoneName
                      : 'Local time'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
