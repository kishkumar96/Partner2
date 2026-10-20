import type { EventRecord } from '@/data/eventRecords';
import { WIND_DANGER_ORDER, isExposedDanger, type ForecastExposure } from './forecastExposure';
import { stormNameOf } from './forecastRuns';
import { parseWindBand, type WindKind } from './windScale';

/** One advisory of a storm, reduced to what a trend needs. */
export interface TimelinePoint {
  /** The advisory's record id, so a point can be matched to the one on screen */
  id: string;
  issuedAt: string;
  /** People under gale-force winds or stronger, confirmed or possible */
  people: number;
  buildings: number;
  /** The strongest wind kind reaching any area, or null when none does */
  strongest: WindKind | null;
}

/**
 * REF's name for the strongest wind band reaching any area ("Gale Winds"), or null when none does.
 *
 * The national row's own band is not safe to use for this: in real output it can say "Possible Gale
 * Winds" while areas under it have confirmed "Gale Winds", so the areas and bands are compared too.
 */
export function strongestBandLabel(exposure: ForecastExposure): string | null {
  const rank = (label: string | null | undefined) =>
    label ? (WIND_DANGER_ORDER as readonly string[]).indexOf(label) : -1;
  let best: string | null = null;
  const consider = (label: string | null | undefined) => {
    if (label && parseWindBand(label) && rank(label) > rank(best)) best = label;
  };
  consider(exposure.national?.overallWinds);
  exposure.regions.forEach(area => consider(area.overallWinds));
  exposure.byWindDanger.forEach(band => {
    if (isExposedDanger(band.label) && band.totals.population > 0) consider(band.label);
  });
  return best;
}

/** The strongest wind kind among a forecast's exposed areas (national row included). */
export function strongestWind(exposure: ForecastExposure): WindKind | null {
  return parseWindBand(strongestBandLabel(exposure))?.kind ?? null;
}

/** People under forecast winds: the national row, else the sum of its areas. */
export function exposedPeople(exposure: ForecastExposure): number {
  if (exposure.national) return exposure.national.exposed.population;
  return exposure.regions.reduce((sum, area) => sum + area.exposed.population, 0);
}

export function exposedBuildings(exposure: ForecastExposure): number {
  if (exposure.national) return exposure.national.exposed.buildings;
  return exposure.regions.reduce((sum, area) => sum + area.exposed.buildings, 0);
}

/**
 * Every advisory of the active storm that has results, oldest first.
 *
 * Only runs that produced exposure are included: a pending or failed run has nothing to plot, and
 * putting a zero there would read as "no exposure".
 */
export function buildForecastTimeline(
  records: EventRecord[],
  active: Pick<EventRecord, 'countryCode' | 'cycloneName' | 'name'>,
  exposureFor: (record: EventRecord) => ForecastExposure | null
): TimelinePoint[] {
  const storm = stormNameOf(active).toLowerCase();
  if (!storm) return [];
  const points: TimelinePoint[] = [];
  for (const record of records) {
    if (!record.isForecast || record.countryCode !== active.countryCode) continue;
    if (stormNameOf(record).toLowerCase() !== storm) continue;
    if (record.modelRunStatus && record.modelRunStatus !== 'complete') continue;
    const issuedAt = record.trackIssuedTime;
    if (!issuedAt || Number.isNaN(Date.parse(issuedAt))) continue;
    const exposure = exposureFor(record);
    if (!exposure) continue;
    points.push({
      id: record.id,
      issuedAt,
      people: exposedPeople(exposure),
      buildings: exposedBuildings(exposure),
      strongest: strongestWind(exposure),
    });
  }
  return points.sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
}
