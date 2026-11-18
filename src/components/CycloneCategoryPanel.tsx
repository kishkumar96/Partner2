'use client';

import { useEffect, useRef } from 'react';
import type { CycloneForecastPoint } from '@/utils/cycloneAnimationLoader';
import { getCategoryColor, getCategoryLabel } from '@/theme/cycloneScale';
import {
  CATEGORY_THRESHOLDS,
  cycloneScaleLabel,
  formatCycloneMetric,
  formatCycloneTime,
  type CycloneScale,
} from '@/utils/cycloneCategory';

export function CycloneCategoryBadge({ point }: { point: CycloneForecastPoint }) {
  const provenance =
    point.classification?.provenance ?? (point.category == null ? 'unknown' : 'reported');
  return (
    <div className="min-w-0 space-y-1 text-sm text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md border px-2 py-1 font-semibold"
          style={{ borderColor: getCategoryColor(point.category) }}
        >
          {getCategoryLabel(point.category)}
        </span>
        <span className="capitalize text-slate-300">{provenance}</span>
        {point.phase && <span className="capitalize">{point.phase}</span>}
      </div>
      <p>{formatCycloneTime(point.time)}</p>
      <p className="text-xs text-slate-300">{cycloneScaleLabel(point.classification?.scale)}</p>
      {point.status && <p className="text-xs text-slate-300">Status: {point.status}</p>}
      {point.source && <p className="break-words text-xs text-slate-300">Source: {point.source}</p>}
    </div>
  );
}

export function CycloneCategoryTimeline({
  points,
  currentIndex,
  onSelect,
  beats = [],
}: {
  points: CycloneForecastPoint[];
  currentIndex: number;
  onSelect: (index: number) => void;
  beats?: Array<{ index: number; title: string; id: string }>;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const index = Math.max(0, Math.min(currentIndex, points.length - 1));
  useEffect(() => {
    const container = strip.current;
    const active = container?.children[index] as HTMLElement | undefined;
    if (!container || !active) return;
    if (
      active.offsetLeft < container.scrollLeft ||
      active.offsetLeft + active.offsetWidth > container.scrollLeft + container.clientWidth
    ) {
      container.scrollTo?.({
        left: Math.max(0, active.offsetLeft - container.clientWidth / 2),
        behavior: 'instant',
      });
    }
  }, [index]);
  if (!points.length) return null;
  const point = points[index];
  return (
    <section
      aria-label="Cyclone category timeline"
      className="my-3 min-w-0 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-sm"
    >
      <p className="mb-2 font-medium text-slate-100">Category over time</p>
      <div ref={strip} className="relative flex gap-1 overflow-x-auto pb-2">
        {points.map((item, i) => (
          <button
            key={`${item.timeString}-${i}`}
            type="button"
            aria-label={`${getCategoryLabel(item.category)}, ${formatCycloneTime(item.time)}${item.phase ? `, ${item.phase}` : ''}, ${item.classification?.provenance ?? (item.category == null ? 'unknown' : 'reported')}`}
            aria-pressed={i === index}
            onClick={() => onSelect(i)}
            className={`min-h-11 min-w-11 shrink-0 rounded-md border-2 px-2 text-center text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${i === index ? 'border-white bg-slate-700' : 'border-transparent bg-slate-800'}`}
          >
            <span
              className="mx-auto mb-1 block h-1 w-6 rounded"
              style={{ backgroundColor: getCategoryColor(item.category) }}
            />
            <span className="block font-semibold">
              {item.category == null ? '?' : item.category}
            </span>
            <span className="block text-xs">
              {item.time.toLocaleTimeString('en-GB', {
                timeZone: 'UTC',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </button>
        ))}
      </div>
      {beats.length > 0 && (
        <div className="flex gap-1 overflow-x-auto" aria-label="Story moments">
          {beats.map(beat => (
            <button
              key={beat.id}
              type="button"
              className="min-h-11 shrink-0 rounded border border-slate-600 px-3 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300"
              onClick={() => onSelect(beat.index)}
              aria-label={`Story beat: ${beat.title}`}
            >
              {beat.title}
            </button>
          ))}
        </div>
      )}
      <input
        id="cyclone-timeline-scrubber"
        name="timelineScrubber"
        type="range"
        min={0}
        max={Math.max(0, points.length - 1)}
        value={index}
        disabled={points.length === 1}
        step={1}
        aria-label="Select cyclone timestep"
        aria-valuetext={`${getCategoryLabel(point.category)}, ${formatCycloneTime(point.time)}`}
        onChange={event => onSelect(Number(event.target.value))}
        className="min-h-11 w-full accent-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300"
      />
      <p className="text-xs text-slate-300">
        Sustained wind: {formatCycloneMetric(point.meanWind, 'kt')}
      </p>
    </section>
  );
}

export function CycloneCategoryLegend({ scale }: { scale?: CycloneScale }) {
  const thresholds = scale ? CATEGORY_THRESHOLDS[scale] : null;
  return (
    <section
      aria-label="Cyclone category legend"
      className="mb-3 border-b border-slate-700 pb-3 text-sm text-slate-100"
    >
      <p className="font-semibold">Cyclone categories</p>
      <p className="mb-2 text-xs text-slate-300">{cycloneScaleLabel(scale)}</p>
      {[1, 2, 3, 4, 5, null].map(category => (
        <div key={category ?? 'unknown'} className="mb-1 flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: getCategoryColor(category) }}
          />
          <span>
            {getCategoryLabel(category)}
            {thresholds && category != null
              ? ` · ${thresholds[category - 1]}${category < 5 ? `–<${thresholds[category]}` : '+'} kt`
              : ''}
          </span>
        </div>
      ))}
      <p className="mt-2 text-xs text-slate-300">
        Track: dashed = forecast; solid = observed or unspecified.
      </p>
      <p className="mt-2 text-xs text-slate-300">
        Category describes maximum storm intensity. Local wind, rain and coastal impacts can differ.
      </p>
    </section>
  );
}
