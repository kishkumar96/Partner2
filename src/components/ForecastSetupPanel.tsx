'use client';

import { Clock, Layers } from 'lucide-react';
import ForecastRunSelector from './ForecastRunSelector';
import type { ForecastRun } from '@/utils/forecastRuns';

interface ForecastSetupPanelProps {
  runs: ForecastRun[];
  activeRunId?: string | null;
  onRunSelect: (runId: string) => void;
  /** Opens the map panel on the forecast layers */
  onOpenLayers?: () => void;
}

/**
 * The left panel in Forecast mode.
 *
 * A forecast is one model run, so the observed-event filters (hazard, sector, area level, date)
 * don't apply to it: its summary and tables read the run's exposure directly, and the event and
 * date controls would swap the selected advisory and reload the data. What a forecaster does
 * choose is the advisory, and which of its overlays are drawn.
 */
export default function ForecastSetupPanel({
  runs,
  activeRunId = null,
  onRunSelect,
  onOpenLayers,
}: ForecastSetupPanelProps) {
  return (
    <div
      className="w-full border-r border-sky-500/15 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate md:w-80"
      data-testid="forecast-setup-panel"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
        <div className="px-4 py-3 border-b border-sky-500/15 bg-slate-900/35">
          <h2 aria-label="Forecast setup" className="text-sm font-bold text-white tracking-tight">
            Forecast setup
          </h2>
          <p className="mt-1 text-[10px] text-slate-400">
            A forecast is one model run. Hazard, sector, area-level and date filters apply to
            observed events and scenarios, so they are not shown here.
          </p>
        </div>

        <div className="mx-3 mt-3 rounded-xl border border-sky-500/30 bg-slate-900/45 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-sky-300 flex-shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-200">Forecast advisory</h3>
          </div>
          <div className="space-y-2 border-t border-slate-700/40 bg-slate-900/35 px-4 pb-3 pt-2">
            {runs.length > 0 ? (
              <>
                <p className="text-[10px] text-slate-400">
                  Each advisory is a separate model run. Choosing one changes every figure and the
                  map.
                </p>
                <ForecastRunSelector
                  runs={runs}
                  activeRunId={activeRunId}
                  onSelect={onRunSelect}
                  variant="plain"
                />
              </>
            ) : (
              <p className="text-[11px] text-slate-400" data-testid="forecast-no-advisories">
                No forecast advisories are available for this country yet.
              </p>
            )}
          </div>
        </div>

        {onOpenLayers && (
          <div className="mx-3 mt-2 mb-3">
            <button
              type="button"
              onClick={onOpenLayers}
              className="flex w-full items-center gap-2 rounded-xl border border-sky-500/30 bg-slate-900/45 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800/60"
            >
              <Layers className="w-3.5 h-3.5 text-sky-300 flex-shrink-0" aria-hidden="true" />
              Forecast layers
              <span className="ml-auto text-[10px] font-normal text-slate-400">
                track, wind swaths, distance
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
