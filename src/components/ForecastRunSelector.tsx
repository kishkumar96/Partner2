'use client';

import { useState } from 'react';
import {
  NO_STORM_FILTER,
  STORM_FILTER_MIN_STORMS,
  filterStormGroups,
  isFiltering,
  type StormFilter,
  type StormStatusFilter,
} from '@/utils/forecastRunFilters';
import {
  groupForecastRuns,
  newestUsableRun,
  type ForecastRun,
  type StormGroup,
} from '@/utils/forecastRuns';

/** Advisories shown before "Show all": a long storm has dozens, the newest few are what matter */
const VISIBLE_ADVISORIES = 6;
/** A list only a little longer than this is shown whole: a button to reveal one or two rows is worse than the rows */
const COLLAPSE_AFTER = VISIBLE_ADVISORIES + 2;

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

const STATUS_OPTIONS: Array<{ id: StormStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
];

const FIELD_CLASS =
  'min-h-[44px] w-full rounded-md border border-slate-600/60 bg-slate-900/60 px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';

/**
 * Find a storm among many: by name, by whether it is still active, by when it was issued, and
 * whether to show advisories that have no results. Changing a filter only changes what is listed;
 * the storm and advisory on screen stay listed, so a filter never swaps the forecast.
 */
function StormFilters({
  filter,
  onChange,
  showSearch,
  showResultsToggle,
  shown,
  total,
}: {
  filter: StormFilter;
  onChange: (filter: StormFilter) => void;
  showSearch: boolean;
  showResultsToggle: boolean;
  shown: number;
  total: number;
}) {
  const set = (changes: Partial<StormFilter>) => onChange({ ...filter, ...changes });
  return (
    <div className="space-y-2" data-testid="storm-filters">
      {showSearch && (
        <>
          <input
            type="search"
            value={filter.query}
            onChange={event => set({ query: event.target.value })}
            placeholder="Search storms"
            aria-label="Search storms"
            className={FIELD_CLASS}
          />
          <div role="group" aria-label="Storm status" className="flex gap-1.5">
            {STATUS_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter.status === option.id}
                onClick={() => set({ status: option.id })}
                className={`min-h-[44px] flex-1 rounded-md border px-2 text-xs transition-colors ${
                  filter.status === option.id
                    ? 'border-sky-400/60 bg-sky-500/20 text-sky-50'
                    : 'border-slate-600/60 text-slate-300 hover:border-sky-500/40'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">
              Issued from
              <input
                type="date"
                value={filter.from}
                max={filter.to || undefined}
                onChange={event => set({ from: event.target.value })}
                aria-label="Issued from"
                className={`mt-0.5 ${FIELD_CLASS}`}
              />
            </label>
            <label className="text-[11px] text-slate-400">
              Issued to
              <input
                type="date"
                value={filter.to}
                min={filter.from || undefined}
                onChange={event => set({ to: event.target.value })}
                aria-label="Issued to"
                className={`mt-0.5 ${FIELD_CLASS}`}
              />
            </label>
          </div>
        </>
      )}
      {showResultsToggle && (
        <label className="flex min-h-[44px] items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={filter.resultsOnly}
            onChange={event => set({ resultsOnly: event.target.checked })}
            className="h-4 w-4 rounded border-slate-500"
          />
          Only advisories with results
        </label>
      )}
      {isFiltering(filter) && (
        <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400" role="status">
          <span data-testid="storm-filter-count">
            Showing {shown} of {total} {total === 1 ? 'storm' : 'storms'}
          </span>
          <button
            type="button"
            onClick={() => onChange(NO_STORM_FILTER)}
            className="min-h-[44px] text-sky-300 underline hover:text-sky-200"
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
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
  const [filter, setFilter] = useState<StormFilter>(NO_STORM_FILTER);
  if (runs.length < 2) return null;

  const allGroups = groupForecastRuns(runs, now);
  const selectedAll =
    allGroups.find(group => group.runs.some(run => run.id === activeRunId)) ?? allGroups[0];
  // What is on screen stays listed, so a filter can never swap the forecast being looked at
  const groups = filterStormGroups(allGroups, filter, {
    storm: selectedAll.storm,
    runId: activeRunId,
  });
  const selected = groups.find(group => group.storm === selectedAll.storm) ?? selectedAll;
  const active = groups.filter(group => group.active);
  const past = groups.filter(group => !group.active);
  const showSearch = allGroups.length >= STORM_FILTER_MIN_STORMS;
  const showResultsToggle = runs.some(run => run.status && run.status !== 'complete');
  const choose = (group: StormGroup) => {
    setShowAll(false);
    onSelect(newestUsableRun(group).id);
  };

  const collapsed = selected.runs.length > COLLAPSE_AFTER && !showAll;
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

      {(showSearch || showResultsToggle) && (
        <StormFilters
          filter={filter}
          onChange={next => {
            setShowAll(false);
            setFilter(next);
          }}
          showSearch={showSearch}
          showResultsToggle={showResultsToggle}
          shown={groups.length}
          total={allGroups.length}
        />
      )}

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

      {selected.runs.length > COLLAPSE_AFTER && (
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
