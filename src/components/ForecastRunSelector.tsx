'use client';

import { useState } from 'react';
import {
  groupForecastRuns,
  newestUsableRun,
  type ForecastRun,
  type StormGroup,
} from '@/utils/forecastRuns';

/** Advisories shown before "Show all": a long storm has dozens, the newest few are what matter */
const VISIBLE_ADVISORIES = 6;

function formatIssued(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || 'Unknown time';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function StormChip({
  group,
  selected,
  onChoose,
}: {
  group: StormGroup;
  selected: boolean;
  onChoose: (group: StormGroup) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onChoose(group)}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        selected
          ? 'border-sky-400/60 bg-sky-500/20 text-sky-50'
          : 'border-slate-600/60 text-slate-300 hover:border-sky-500/40'
      }`}
    >
      {group.storm} · {group.runs.length}
    </button>
  );
}

/**
 * Choose which storm and which advisory (track issue time) the forecast shows.
 * With one storm this is just its advisories; with several, a storm is picked
 * first so one storm's twenty advisories don't bury another's.
 */
export default function ForecastRunSelector({
  runs,
  activeRunId,
  onSelect,
  variant = 'card',
  now,
}: {
  runs: ForecastRun[];
  activeRunId?: string | null;
  onSelect: (runId: string) => void;
  /** 'plain' drops the card and visible title, for use inside a titled section */
  variant?: 'card' | 'plain';
  /** Clock for "active storm", injectable for tests */
  now?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (runs.length < 2) return null;

  const groups = groupForecastRuns(runs, now);
  const selected =
    groups.find(group => group.runs.some(run => run.id === activeRunId)) ?? groups[0];
  const active = groups.filter(group => group.active);
  const past = groups.filter(group => !group.active);
  const choose = (group: StormGroup) => {
    setShowAll(false);
    onSelect(newestUsableRun(group).id);
  };

  const collapsed = selected.runs.length > VISIBLE_ADVISORIES && !showAll;
  const visible = collapsed
    ? [
        ...selected.runs.slice(0, VISIBLE_ADVISORIES),
        // The chosen advisory stays on show even when it is an old one
        ...selected.runs.slice(VISIBLE_ADVISORIES).filter(run => run.id === activeRunId),
      ]
    : selected.runs;

  const plain = variant === 'plain';
  return (
    <div
      className={
        plain ? 'space-y-2' : 'space-y-2 rounded-lg border border-slate-700/60 bg-slate-800/60 p-3'
      }
      data-testid="forecast-run-selector"
    >
      <p
        id="forecast-run-label"
        className={plain ? 'sr-only' : 'text-xs font-semibold text-slate-100'}
      >
        Track issue time
      </p>

      {groups.length > 1 && (
        <div className="space-y-1.5" data-testid="storm-selector">
          {active.length > 1 && (
            <p className="text-[11px] text-amber-200" data-testid="active-storms">
              {active.length} active storms: {active.map(group => group.storm).join(', ')}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Storm">
            {active.map(group => (
              <StormChip
                key={group.storm}
                group={group}
                selected={group === selected}
                onChoose={choose}
              />
            ))}
          </div>
          {past.length > 0 && (
            <details open={!selected.active} className="text-[11px] text-slate-400">
              <summary className="cursor-pointer">Past storms ({past.length})</summary>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {past.map(group => (
                  <StormChip
                    key={group.storm}
                    group={group}
                    selected={group === selected}
                    onChoose={choose}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <ul aria-labelledby="forecast-run-label" className="space-y-1">
        {visible.map(run => {
          const isActive = run.id === activeRunId;
          return (
            <li key={run.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(run.id)}
                className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                  isActive
                    ? 'border-sky-400/60 bg-sky-500/20 text-sky-50'
                    : 'border-slate-700/60 text-slate-300 hover:border-sky-500/40'
                }`}
              >
                <span className="font-medium">{formatIssued(run.issuedAt)}</span>
                {run.isLatest && <span className="ml-2 text-sky-300">Latest</span>}
                {run.status && run.status !== 'complete' && (
                  <span className="ml-2 text-amber-300">{run.status}</span>
                )}
                {run.cycloneName && <span className="block text-slate-400">{run.cycloneName}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {selected.runs.length > VISIBLE_ADVISORIES && (
        <button
          type="button"
          onClick={() => setShowAll(open => !open)}
          className="text-[11px] text-sky-300 underline hover:text-sky-200"
        >
          {showAll ? 'Show fewer advisories' : `Show all ${selected.runs.length} advisories`}
        </button>
      )}
    </div>
  );
}
