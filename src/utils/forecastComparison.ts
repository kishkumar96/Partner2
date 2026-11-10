import type { EventRecord } from '@/data/eventRecords';
import { WIND_DANGER_ORDER, type ExposureArea, type ForecastExposure } from './forecastExposure';
import { stormNameOf } from './forecastRuns';

/**
 * The advisory this one follows: same storm, issued earlier, with results.
 * Only runs that produced exposure are compared; a failed run has nothing to
 * set beside.
 */
export function previousAdvisory(
  records: EventRecord[],
  active: Pick<EventRecord, 'id' | 'countryCode' | 'cycloneName' | 'name' | 'trackIssuedTime'>
): EventRecord | null {
  const activeMs = Date.parse(active.trackIssuedTime || '');
  if (Number.isNaN(activeMs)) return null;
  const storm = stormNameOf(active).toLowerCase();
  if (!storm) return null;
  const earlier = records
    .filter(record => {
      const ms = Date.parse(record.trackIssuedTime || '');
      return (
        record.isForecast &&
        record.id !== active.id &&
        record.countryCode === active.countryCode &&
        !Number.isNaN(ms) &&
        ms < activeMs &&
        stormNameOf(record).toLowerCase() === storm &&
        (!record.modelRunStatus || record.modelRunStatus === 'complete')
      );
    })
    .sort((a, b) => Date.parse(b.trackIssuedTime!) - Date.parse(a.trackIssuedTime!));
  return earlier[0] ?? null;
}

export interface ForecastChange {
  people: number;
  buildings: number;
  buildingValue: number;
  /** Areas exposed now that were not before, and the reverse */
  newlyExposed: string[];
  noLongerExposed: string[];
  /** Areas whose strongest forecast wind band moved up or down */
  windChanges: Array<{ area: string; from: string; to: string; stronger: boolean }>;
  /** Areas whose strongest forecast wind moved by a few km/h inside the same band */
  speedChanges: Array<{ area: string; from: number; to: number }>;
  /** True when nothing above differs */
  unchanged: boolean;
}

/** A change smaller than this is forecast noise, not a change worth reporting */
const SPEED_CHANGE_KMPH = 5;

const rank = (band: string | null | undefined) =>
  band ? (WIND_DANGER_ORDER as readonly string[]).indexOf(band) : -1;

const isExposed = (area: ExposureArea) => area.exposed.population > 0 || area.exposed.buildings > 0;

/** What moved between two advisories of the same storm. */
export function compareForecasts(
  current: ForecastExposure,
  previous: ForecastExposure
): ForecastChange {
  const now = current.national?.exposed;
  const before = previous.national?.exposed;
  const people = (now?.population ?? 0) - (before?.population ?? 0);
  const buildings = (now?.buildings ?? 0) - (before?.buildings ?? 0);
  const buildingValue = (now?.buildingValue ?? 0) - (before?.buildingValue ?? 0);

  const previousByName = new Map(previous.regions.map(area => [area.name, area]));
  const currentNames = new Set(current.regions.map(area => area.name));
  const newlyExposed: string[] = [];
  const windChanges: ForecastChange['windChanges'] = [];
  const speedChanges: ForecastChange['speedChanges'] = [];
  for (const area of current.regions) {
    const was = previousByName.get(area.name);
    if (isExposed(area) && !(was && isExposed(was))) newlyExposed.push(area.name);
    if (was && isExposed(area) && isExposed(was) && area.overallWinds && was.overallWinds) {
      if (rank(area.overallWinds) !== rank(was.overallWinds)) {
        windChanges.push({
          area: area.name,
          from: was.overallWinds,
          to: area.overallWinds,
          stronger: rank(area.overallWinds) > rank(was.overallWinds),
        });
      } else if (
        typeof area.maxWindKmph === 'number' &&
        typeof was.maxWindKmph === 'number' &&
        Math.abs(area.maxWindKmph - was.maxWindKmph) >= SPEED_CHANGE_KMPH
      ) {
        speedChanges.push({
          area: area.name,
          from: Math.round(was.maxWindKmph),
          to: Math.round(area.maxWindKmph),
        });
      }
    }
  }
  const noLongerExposed = previous.regions
    .filter(
      area =>
        isExposed(area) &&
        !(
          currentNames.has(area.name) && isExposed(current.regions.find(a => a.name === area.name)!)
        )
    )
    .map(area => area.name);

  return {
    people,
    buildings,
    buildingValue,
    newlyExposed,
    noLongerExposed,
    windChanges,
    speedChanges,
    unchanged:
      people === 0 &&
      buildings === 0 &&
      buildingValue === 0 &&
      newlyExposed.length === 0 &&
      noLongerExposed.length === 0 &&
      windChanges.length === 0 &&
      speedChanges.length === 0,
  };
}
