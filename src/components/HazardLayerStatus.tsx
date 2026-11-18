'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import type { HazardLayerIssue } from '@/components/RealDataLayers';

/**
 * What the hazard layer is doing, on the map itself. A flood scenario is read from the hazard store in the
 * browser and takes seconds; until it arrives the map is bare, and a failed read only reached the console. So a
 * visitor could not tell "still drawing" from "nothing to draw" from "could not be read" (QA H5: "the map shows
 * bare Rarotonga each time"). This says which, and offers a retry for the last.
 */
export default function HazardLayerStatus({
  loading,
  issue,
  onRetry,
}: {
  /** A hazard layer is wanted and still being read */
  loading: boolean;
  issue: HazardLayerIssue | null;
  onRetry: () => void;
}) {
  if (issue) {
    return (
      <div
        role="alert"
        data-testid="hazard-layer-issue"
        className="pointer-events-auto absolute left-1/2 top-2 z-[6] flex max-w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-lg border border-amber-400/50 bg-slate-900/95 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">This flood scenario could not be drawn.</p>
          <p className="mt-0.5 text-amber-100/90">
            The depths for it could not be read from the hazard store. That is a loading problem,
            not a finding that nothing floods. The rest of the map is unaffected.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 rounded border border-amber-300/60 px-2 py-0.5 font-semibold hover:bg-amber-500/10"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div
        role="status"
        data-testid="hazard-layer-loading"
        className="pointer-events-none absolute left-1/2 top-2 z-[6] flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-600/70 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" aria-hidden="true" />
        Drawing flood depths… this can take several seconds
      </div>
    );
  }
  return null;
}
