'use client';

import { RefreshCw, X } from 'lucide-react';
import type { EventRecord } from '@/data/eventRecords';
import { formatUtcDateTime } from '@/utils/formatters';
import { stormNameOf } from '@/utils/forecastRuns';

/** Says a newer advisory has been issued, and lets the person switch to it when ready. */
export default function NewAdvisoryBanner({
  advisory,
  onShow,
  onDismiss,
}: {
  advisory: EventRecord;
  onShow: () => void;
  onDismiss: () => void;
}) {
  const storm = stormNameOf(advisory);
  return (
    <div
      role="status"
      data-testid="new-advisory-banner"
      className="absolute left-1/2 top-2 z-[30] flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-400/50 bg-slate-900/95 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur"
    >
      <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" aria-hidden="true" />
      <span>
        <strong>New advisory{storm ? ` for TC ${storm}` : ''}</strong> issued{' '}
        {formatUtcDateTime(advisory.trackIssuedTime)}
      </span>
      <button
        type="button"
        onClick={onShow}
        className="shrink-0 whitespace-nowrap rounded-md border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-50 hover:bg-amber-500/30"
      >
        Show it
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss new advisory notice"
        className="shrink-0 rounded p-0.5 text-amber-200 hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
