'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { utcStamp, type AdvisoryStatus } from '@/utils/forecastInsight';

/**
 * Whether the forecast on screen is the newest, said where it cannot be missed.
 *
 * An old advisory looks exactly like a current one, and a person acting on it may not know a newer
 * one exists. So the newer-advisory case is a banner with one button to the latest, not a line of
 * small grey text. It stays in view (no dismiss) but is kept light so the forecast stays the focus.
 */
export default function AdvisoryStatusBanner({
  status,
  onSwitchToLatest,
  variant = 'card',
}: {
  status: AdvisoryStatus;
  onSwitchToLatest?: () => void;
  /** 'bar' is one slim line for under the page header; 'card' is for inside a panel */
  variant?: 'card' | 'bar';
}) {
  const issued = status.issuedAt ? utcStamp(status.issuedAt) : null;
  const age = status.age?.label;

  if (status.kind === 'older' && status.newer) {
    const { count } = status.newer;
    if (variant === 'bar') {
      return (
        <div
          role="status"
          data-testid="advisory-banner"
          data-state="older"
          data-variant="bar"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-amber-50"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold">This is not the latest forecast. </span>
            <span className="text-amber-100/85">
              {issued ? `Issued ${issued}${age ? ` (${age})` : ''}; ` : ''}
              {count === 1 ? 'a newer one has' : `${count} newer ones have`} been issued, the latest
              is {utcStamp(status.newer.issuedAt)}.
            </span>
          </p>
          {onSwitchToLatest && (
            <button
              type="button"
              onClick={onSwitchToLatest}
              className="min-h-[44px] flex-shrink-0 rounded-md border border-amber-400/70 px-3 py-1.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Switch to the latest advisory
            </button>
          )}
        </div>
      );
    }
    return (
      <div
        role="status"
        data-testid="advisory-banner"
        data-state="older"
        className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-50"
      >
        <p className="flex items-start gap-2 text-sm font-semibold">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <span>This is not the latest forecast</span>
        </p>
        <p className="mt-0.5 pl-6 text-sm leading-snug text-amber-100/80">
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
            className="ml-6 mt-1 min-h-[44px] rounded-md border border-amber-400/70 px-3 py-1.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
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
