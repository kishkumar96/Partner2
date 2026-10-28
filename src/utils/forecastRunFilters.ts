import type { StormGroup } from './forecastRuns';

export type StormStatusFilter = 'all' | 'active' | 'past';

export interface StormFilter {
  status: StormStatusFilter;
  /** Part of a storm's name, any case */
  query: string;
  /** "YYYY-MM-DD" (UTC), from a date input; empty for no limit */
  from: string;
  to: string;
  /** Hide advisories whose run is pending or failed */
  resultsOnly: boolean;
}

export const NO_STORM_FILTER: StormFilter = {
  status: 'all',
  query: '',
  from: '',
  to: '',
  resultsOnly: false,
};

/** Below this many storms the list is short enough that filtering only adds controls */
export const STORM_FILTER_MIN_STORMS = 4;

export function isFiltering(filter: StormFilter): boolean {
  return (
    filter.status !== 'all' ||
    filter.query.trim() !== '' ||
    filter.from !== '' ||
    filter.to !== '' ||
    filter.resultsOnly
  );
}

/** What the caller is looking at: it stays in the list whatever the filter says */
export interface StormFilterKeep {
  storm?: string | null;
  runId?: string | null;
}

const DAY_END_MS = 24 * 60 * 60 * 1000 - 1;

function dayStartMs(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

const hasResults = (status?: string) => !status || status === 'complete';

/**
 * The storms that match the filter, with advisories narrowed by "results only".
 *
 * Filtering only changes what is listed. The storm and advisory on screen are always kept, so a
 * filter can never swap the forecast being looked at; only choosing an advisory does that.
 */
export function filterStormGroups(
  groups: StormGroup[],
  filter: StormFilter,
  keep: StormFilterKeep = {}
): StormGroup[] {
  const query = filter.query.trim().toLowerCase();
  const fromMs = dayStartMs(filter.from);
  const toStart = dayStartMs(filter.to);
  const toMs = toStart === null ? null : toStart + DAY_END_MS;
  const keepStorm = keep.storm?.toLowerCase() ?? null;

  const result: StormGroup[] = [];
  for (const group of groups) {
    const isKept = keepStorm !== null && group.storm.toLowerCase() === keepStorm;

    const matches =
      (filter.status === 'all' || (filter.status === 'active') === group.active) &&
      (query === '' ||
        group.storm.toLowerCase().includes(query) ||
        group.runs.some(run => run.cycloneName?.toLowerCase().includes(query))) &&
      (fromMs === null && toMs === null
        ? true
        : group.runs.some(run => {
            const issued = Date.parse(run.issuedAt);
            if (Number.isNaN(issued)) return false;
            return (fromMs === null || issued >= fromMs) && (toMs === null || issued <= toMs);
          }));
    if (!matches && !isKept) continue;

    const runs = filter.resultsOnly
      ? group.runs.filter(run => hasResults(run.status) || run.id === keep.runId)
      : group.runs;
    if (runs.length === 0) continue;
    result.push(runs === group.runs ? group : { ...group, runs, newestIssuedAt: runs[0].issuedAt });
  }
  return result;
}
