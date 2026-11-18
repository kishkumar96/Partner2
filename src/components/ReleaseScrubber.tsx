'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import type { ReleaseStep } from '@/utils/advisoryReleases';

/** How long the slider rests before the dashboard switches advisory, so a drag across several
 * releases loads one of them, not each */
const COMMIT_DELAY_MS = 350;

/**
 * Steps through a storm's advisories, oldest to newest. Moving it switches the dashboard to that
 * advisory (the map, the figures and the URL follow), so it is the same action as the run picker,
 * done by scrubbing. The label updates as you drag; the switch waits until you pause.
 */
export default function ReleaseScrubber({
  steps,
  onSelect,
}: {
  steps: ReleaseStep[];
  onSelect?: (runId: string) => void;
}) {
  const selectedIndex = Math.max(
    0,
    steps.findIndex(step => step.selected)
  );
  // While dragging, the slider leads and the dashboard catches up
  // Remembers which advisory was on screen when the drag began: once the dashboard moves (to the
  // dragged-to advisory, or because another control changed it) the draft is stale and ignored
  const [draft, setDraft] = useState<{ base: number; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDraft = draft && draft.base === selectedIndex ? draft : null;
  const shownIndex = activeDraft?.index ?? selectedIndex;
  const shown = steps[shownIndex];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const goTo = (index: number, immediate = false) => {
    const next = Math.min(steps.length - 1, Math.max(0, index));
    setDraft({ base: selectedIndex, index: next });
    if (timer.current) clearTimeout(timer.current);
    if (next === selectedIndex) return;
    const commit = () => onSelect?.(steps[next].runId);
    if (immediate) commit();
    else timer.current = setTimeout(commit, COMMIT_DELAY_MS);
  };

  if (!shown) return null;
  const pending = activeDraft !== null && activeDraft.index !== selectedIndex;

  return (
    <div
      role="group"
      aria-label="Advisory release"
      className="absolute left-1/2 top-2 z-[5] flex max-w-[calc(100%-12rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/90 px-2.5 py-1.5 text-[11px] text-slate-100 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        onClick={() => goTo(shownIndex - 1, true)}
        disabled={shownIndex === 0}
        aria-label="Previous advisory"
        className="rounded p-0.5 hover:bg-slate-700/60 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={shownIndex}
        onChange={event => goTo(Number(event.target.value))}
        aria-label="Advisory"
        aria-valuetext={`${shown.label}, advisory ${shownIndex + 1} of ${steps.length}${
          shown.isLatest ? ', the latest' : ''
        }`}
        className="h-1 w-28 cursor-pointer accent-amber-400 sm:w-40"
      />
      <button
        type="button"
        onClick={() => goTo(shownIndex + 1, true)}
        disabled={shownIndex === steps.length - 1}
        aria-label="Next advisory"
        className="rounded p-0.5 hover:bg-slate-700/60 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-[7.5rem] whitespace-nowrap tabular-nums" aria-live="polite">
        <span className="font-semibold">{shown.label}</span>
        <span className="ml-1 text-slate-400">
          {shownIndex + 1}/{steps.length}
          {shown.isLatest ? ' · latest' : ''}
          {pending ? ' …' : ''}
        </span>
      </span>
      {!steps[steps.length - 1].selected && (
        <button
          type="button"
          onClick={() => goTo(steps.length - 1, true)}
          aria-label="Jump to the latest advisory"
          title="Jump to the latest advisory"
          className="rounded p-0.5 text-sky-300 hover:bg-slate-700/60"
        >
          <SkipForward className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
