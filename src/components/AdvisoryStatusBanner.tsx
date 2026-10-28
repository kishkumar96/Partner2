'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { utcStamp, type AdvisoryStatus } from '@/utils/forecastInsight';

/**
 * Whether the forecast on screen is the newest, said where it cannot be missed.
 *
 * An old advisory looks exactly like a current one, and a person acting on it may not know a newer
 * one exists. So the newer-advisory case is a banner with one button to the latest, not a line of
 * small grey text.
 */
export default function AdvisoryStatusBanner({
  status,
  onSwitchToLatest,
}: {
  status: AdvisoryStatus;
  onSwitchToLatest?: () => void;
}) {
  const issued = status.issuedAt ? utcStamp(status.issuedAt) : null;
  const age = status.age?.label;

  if (status.kind === 'older' && status.newer) {
    const { count } = status.newer;
    return (
      <div
        role="status"
        data-testid="advisory-banner"
        data-state="older"
        className="rounded-xl border border-amber-400/50 bg-amber-500/15 p-3 text-amber-50"
      >
        <p className="flex items-start gap-2 text-sm font-semibold">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <span>This is not the latest forecast</span>
        </p>
        <p className="mt-1 text-sm leading-snug text-amber-100/90">
          {issued
            ? `You are looking at the advisory issued ${issued}${age ? ` (${age})` : ''}. `
            : ''}
          {count === 1 ? 'A newer one has' : `${count} newer ones have`} been issued; the latest is{' '}
          {utcStamp(status.newer.issuedAt)}.
        </p>
        {onSwitchToLatest && (
          <button
            type="button"
            onClick={onSwitchToLatest}
            className="mt-2 min-h-[44px] w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            Switch to the latest advisory
          </button>
        )}
      </div>
    );
  }

  if (status.kind === 'latest-aging') {
    return (
      <div
        role="status"
        data-testid="advisory-banner"
        data-state="aging"
        className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm leading-snug text-amber-100"
      >
        <p className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden="true" />
          <span>
            Latest advisory we have, but it was issued {issued}
            {age ? ` (${age})` : ''}. Check for a newer forecast before acting on it.
          </span>
        </p>
      </div>
    );
  }

  return (
    <p
      role="status"
      data-testid="advisory-banner"
      data-state="latest"
      className="flex items-start gap-2 text-sm text-slate-300"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden="true" />
      <span>
        Latest advisory{issued ? ` · issued ${issued}` : ''}
        {age ? ` (${age})` : ''}
      </span>
    </p>
  );
}
