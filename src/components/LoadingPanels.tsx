'use client';

import { Loader2 } from 'lucide-react';

/**
 * Neutral placeholders for the first load, before the dashboard knows whether
 * it is showing a forecast, an assessment or a scenario. Without them the page
 * drew the Assessment layout ("No Impact Data Available", "CSV data not
 * loaded") for a few seconds and then swapped it for the real one.
 */

const PANEL_CLASSES =
  'w-full max-w-full h-full min-h-0 glass-panel border-l border-white/10 flex flex-col flex-shrink-0 overflow-hidden z-50 md:w-80 md:max-w-[min(320px,calc(100vw-40px))]';

export function LoadingSummaryPanel({ countryName }: { countryName: string }) {
  return (
    <div className={PANEL_CLASSES} data-testid="loading-summary-panel">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-300" aria-hidden="true" />
        <p role="status" className="text-sm font-medium text-slate-200">
          Loading {countryName}…
        </p>
        <p className="text-xs text-slate-400">Fetching the latest results.</p>
      </div>
    </div>
  );
}

export function LoadingDataWorkspace() {
  return (
    <div
      className="h-[clamp(10rem,35vh,20rem)] glass-panel border-t border-white/10 flex items-center justify-center min-h-0"
      data-testid="loading-data-workspace"
    >
      <p role="status" className="flex items-center gap-2 text-xs text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-sky-300" aria-hidden="true" />
        Loading data…
      </p>
    </div>
  );
}
