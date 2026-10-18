import type { EventRecord } from '@/data/eventRecords';
import { stormNameOf } from '@/utils/forecastRuns';

const issuedMs = (record: EventRecord) => {
  const ms = Date.parse(record.trackIssuedTime || '');
  return Number.isNaN(ms) ? -Infinity : ms;
};

const stormKey = (record: EventRecord) => stormNameOf(record).toLowerCase();

/**
 * The advisory issued since the page last loaded, if any. Compared storm by
 * storm: an advisory is new when it is later than the newest already known for
 * its own storm, or when its storm wasn't known at all (a second storm has
 * appeared, even if its first advisory is older than another storm's latest).
 * Runs without results are ignored, as there is nothing to show for them yet.
 */
export function findNewerAdvisory(
  known: EventRecord[],
  fresh: EventRecord[],
  countryCode: string
): EventRecord | null {
  const forecasts = (records: EventRecord[]) =>
    records.filter(record => record.isForecast && record.countryCode === countryCode);
  const knownNewestByStorm = new Map<string, number>();
  for (const record of forecasts(known)) {
    const key = stormKey(record);
    knownNewestByStorm.set(
      key,
      Math.max(knownNewestByStorm.get(key) ?? -Infinity, issuedMs(record))
    );
  }
  const newer = forecasts(fresh)
    .filter(
      record =>
        Number.isFinite(issuedMs(record)) &&
        (!record.modelRunStatus || record.modelRunStatus === 'complete')
    )
    .filter(record => issuedMs(record) > (knownNewestByStorm.get(stormKey(record)) ?? -Infinity));
  if (newer.length === 0) return null;
  return newer.reduce((best, record) => (issuedMs(record) > issuedMs(best) ? record : best));
}
