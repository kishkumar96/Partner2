import type { EventRecord } from '@/data/eventRecords';

export interface ForecastRun {
  id: string;
  cycloneName?: string;
  /** The storm's own name ("Wati"), so advisories of one storm can be grouped */
  storm?: string;
  issuedAt: string;
  status?: string;
  error?: string;
  /** The newest advisory of its storm */
  isLatest: boolean;
}

const issuedOf = (record: EventRecord) => record.trackIssuedTime || record.date || '';

/**
 * The forecast runs for a country, newest issue time first. Each run is its own
 * Event (one per track issued by the RSMC), so this is what a forecaster picks
 * between when a new advisory arrives. Runs of a different storm are still
 * listed; `cycloneName` lets the UI tell them apart.
 */
export function listForecastRuns(records: EventRecord[], countryCode: string): ForecastRun[] {
  const runs = records
    .filter(record => record.isForecast && record.countryCode === countryCode)
    .map(record => ({ record, issued: issuedOf(record) }))
    .sort((a, b) => {
      const ta = Date.parse(a.issued);
      const tb = Date.parse(b.issued);
      if (Number.isNaN(ta) || Number.isNaN(tb)) return b.issued.localeCompare(a.issued);
      return tb - ta;
    });
  const seenStorms = new Set<string>();
  return runs.map(({ record, issued }) => {
    const storm = stormNameOf(record);
    const isLatest = !seenStorms.has(storm.toLowerCase());
    seenStorms.add(storm.toLowerCase());
    return {
      id: record.id,
      cycloneName: record.cycloneName,
      storm,
      issuedAt: issued,
      status: record.modelRunStatus,
      error: record.modelRunError,
      isLatest,
    };
  });
}

const issuedMs = (record: EventRecord) => {
  const ms = Date.parse(issuedOf(record));
  return Number.isNaN(ms) ? -Infinity : ms;
};

/**
 * The forecast to open by default: the newest advisory whose run produced
 * results. A newer run that is still pending or failed never replaces a good
 * one, so someone opening the dashboard lands on usable figures (the run
 * picker still lists the newer one and says what happened to it).
 */
export function defaultForecastRecord(records: EventRecord[]): EventRecord | undefined {
  const newestFirst = [...records].sort((a, b) => issuedMs(b) - issuedMs(a));
  const usable = newestFirst.find(
    record => !record.modelRunStatus || record.modelRunStatus === 'complete'
  );
  return usable ?? newestFirst[0];
}

/**
 * Whether an event id names a mode's event (any forecast advisory, or the
 * assessment) rather than a filter the user applied. A shared link to an older
 * advisory carries that run's id in `events`, so every run counts.
 */
export function isModeEventId(
  id: string,
  runs: Pick<ForecastRun, 'id'>[],
  assessmentId?: string | null
): boolean {
  return id === assessmentId || runs.some(run => run.id === id);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The storm's own name from an SPC track name such as "2026101718_Wati". */
export function stormNameOf(record: Pick<EventRecord, 'cycloneName' | 'name'>): string {
  return (record.cycloneName || record.name || '').replace(/^\d{8,12}_/, '').trim();
}

/**
 * Whether the post-event assessment on screen is for an older storm than the
 * forecast: the forecast is for a storm that has no assessment yet. Without
 * saying so, Assessment silently shows an old cyclone beside a live forecast.
 */
export function assessmentGap(
  forecast: EventRecord | null | undefined,
  assessment: EventRecord | null | undefined
): { forecastStorm: string; assessmentName: string } | null {
  if (!forecast || !assessment || assessment.isForecast) return null;
  const storm = stormNameOf(forecast);
  if (!storm) return null;
  const assessmentText = [assessment.name, assessment.cycloneName, ...(assessment.aliases ?? [])]
    .join(' ')
    .toLowerCase();
  if (assessmentText.includes(storm.toLowerCase())) return null;
  const forecastMs = Date.parse(forecast.date || '');
  const assessmentMs = Date.parse(assessment.date || '');
  if (Number.isNaN(forecastMs) || Number.isNaN(assessmentMs)) return null;
  // A storm's assessment follows within weeks; a gap of over a month is a different storm
  if (forecastMs - assessmentMs < 30 * DAY_MS) return null;
  return { forecastStorm: storm, assessmentName: assessment.name };
}

/** A storm with an advisory this recent is still active; older ones are past storms */
export const STORM_ACTIVE_WITHIN_HOURS = 72;

export interface StormGroup {
  storm: string;
  /** Newest advisory first */
  runs: ForecastRun[];
  newestIssuedAt: string;
  active: boolean;
}

const runStorm = (run: ForecastRun) =>
  run.storm ?? stormNameOf({ cycloneName: run.cycloneName, name: '' });

/**
 * The advisories grouped by storm: active storms first (newest advisory first),
 * then past storms. One storm with 20 advisories and a second storm running at
 * the same time stay two lists instead of one interleaved list of 24.
 */
export function groupForecastRuns(runs: ForecastRun[], now: number = Date.now()): StormGroup[] {
  const byStorm = new Map<string, ForecastRun[]>();
  for (const run of runs) {
    const key = runStorm(run).toLowerCase();
    byStorm.set(key, [...(byStorm.get(key) ?? []), run]);
  }
  const ms = (iso: string) => {
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? -Infinity : parsed;
  };
  const groups = Array.from(byStorm.values()).map(group => {
    const sorted = [...group].sort((a, b) => ms(b.issuedAt) - ms(a.issuedAt));
    const newest = ms(sorted[0].issuedAt);
    return {
      storm: runStorm(sorted[0]),
      runs: sorted,
      newestIssuedAt: sorted[0].issuedAt,
      active: Number.isFinite(newest) && now - newest <= STORM_ACTIVE_WITHIN_HOURS * 3_600_000,
    };
  });
  return groups.sort(
    (a, b) => Number(b.active) - Number(a.active) || ms(b.newestIssuedAt) - ms(a.newestIssuedAt)
  );
}

/** The advisory to open when a storm is chosen: its newest one that has results. */
export function newestUsableRun(group: StormGroup): ForecastRun {
  return group.runs.find(run => !run.status || run.status === 'complete') ?? group.runs[0];
}
