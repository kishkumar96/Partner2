'use client';

import { approximate, utcStamp } from '@/utils/forecastInsight';
import type { TimelinePoint } from '@/utils/forecastTimeline';

/**
 * People under forecast winds, advisory by advisory.
 *
 * Plain HTML bars rather than a chart library: nothing to load, readable at any width, and each bar
 * is a real button, so a person can step through the advisories from here with a finger or a key.
 * The height is scaled to the biggest advisory, and a zero keeps a thin stub so it reads as "none",
 * not "missing".
 */
export default function ForecastTrendChart({
  points,
  currentId,
  onSelect,
}: {
  points: TimelinePoint[];
  currentId?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map(point => point.people), 1);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure data-testid="forecast-trend">
      <div
        role="group"
        aria-label="People under forecast winds, by advisory. Select a bar to open that advisory."
        className="flex h-16 items-end gap-1"
      >
        {points.map(point => {
          const current = point.id === currentId;
          const label = `${utcStamp(point.issuedAt)}: ${
            point.people === 0 ? 'no one' : `${approximate(point.people)} people`
          } under forecast winds${current ? ' (shown now)' : ''}`;
          const height =
            point.people === 0 ? 3 : Math.max(8, Math.round((point.people / max) * 100));
          return (
            <button
              key={point.id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={current}
              disabled={!onSelect || current}
              onClick={() => onSelect?.(point.id)}
              className="group flex h-full min-w-[8px] flex-1 items-end rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default"
            >
              <span
                className={`block w-full rounded-t-sm transition-colors ${
                  current
                    ? 'bg-sky-400'
                    : 'bg-slate-500 group-hover:bg-slate-400 group-disabled:group-hover:bg-slate-500'
                }`}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{utcStamp(first.issuedAt)}</span>
        <span>{utcStamp(last.issuedAt)}</span>
      </figcaption>
    </figure>
  );
}
