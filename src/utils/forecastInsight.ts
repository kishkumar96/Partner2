import { advisoryAge, type AdvisoryAge } from './forecastBriefing';
import {
  isExposedDanger,
  windDangerColor,
  type ExposureArea,
  type ForecastExposure,
} from './forecastExposure';
import {
  exposedBuildings,
  exposedPeople,
  strongestWind,
  type TimelinePoint,
} from './forecastTimeline';
import { WIND_CATEGORIES, parseWindBand, windSeverity, type WindKind } from './windScale';

/**
 * A forecast in plain words, for someone who has not read the tables.
 *
 * Everything here is derived from the same exposure the detailed tables show; it adds no new
 * numbers, only wording and rounding. Rounded figures say "about": a forecast is not exact, and
 * "1.61K people" or "102.86 km" suggests a precision it does not have.
 */

/** Nothing exposed; winds only possible (inside the track's uncertainty); or winds forecast. */
export type InsightLevel = 'none' | 'possible' | 'forecast';

export interface InsightArea {
  name: string;
  /** REF's own band name, e.g. "Possible Gale Winds" */
  winds: string | null;
  kind: WindKind | null;
  possible: boolean;
  people: number;
  color: string;
}

export interface AdvisoryStatus {
  /** latest: the newest advisory; latest-aging: the newest, but hours old; older: a newer one exists */
  kind: 'latest' | 'latest-aging' | 'older';
  issuedAt: string | null;
  age: AdvisoryAge | null;
  newer: { issuedAt: string; count: number } | null;
}

export interface InsightTrend {
  points: TimelinePoint[];
  peak: TimelinePoint;
  /** The point for the advisory on screen, when it is in the list */
  current: TimelinePoint | null;
  summary: string;
}

export interface ForecastInsight {
  level: InsightLevel;
  strongest: WindKind | null;
  headline: string;
  detail: string;
  people: {
    exposed: number;
    total: number;
    percent: number | null;
    confirmed: number | null;
    possible: number | null;
    /** "about 2,600" or "37" */
    text: string;
    /** "17%" or "less than 1%" */
    percentText: string | null;
  };
  buildings: { exposed: number; text: string };
  facilities: { health: number; schools: number; evacuationCentres: number; total: number };
  /** Every exposed area, most people first */
  areas: InsightArea[];
  trackUncertaintyPeople: number;
  status: AdvisoryStatus;
  trend: InsightTrend | null;
}

/** A count for people to read: exact when small, otherwise two significant figures with "about". */
export function approximate(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n < 20) return String(n);
  let rounded: number;
  if (n < 100) rounded = Math.round(n / 5) * 5;
  else if (n < 1000) rounded = Math.round(n / 10) * 10;
  else {
    const step = 10 ** (String(n).length - 2);
    rounded = Math.round(n / step) * step;
  }
  const text = rounded.toLocaleString('en-US');
  return rounded === n ? text : `about ${text}`;
}

function percentText(percent: number | null): string | null {
  if (percent == null) return null;
  if (percent > 0 && percent < 1) return 'less than 1%';
  return `${Math.round(percent)}%`;
}

/** "Mauke", "Mauke and Mitiaro", "A, B and C", "A, B, C and 2 other areas" */
function nameList(names: string[], limit = 3, noun = 'area'): string {
  if (names.length <= limit) {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const rest = names.length - limit;
  return `${names.slice(0, limit).join(', ')} and ${rest} other ${noun}${rest === 1 ? '' : 's'}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "18 Oct 12:00 UTC" */
export function utcStamp(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return 'an earlier advisory';
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${date.getUTCDate()} ${month} ${date.toISOString().slice(11, 16)} UTC`;
}

function toInsightArea(area: ExposureArea): InsightArea {
  const band = parseWindBand(area.overallWinds);
  return {
    name: area.name,
    winds: area.overallWinds,
    kind: band?.kind ?? null,
    possible: band?.possible ?? false,
    people: area.exposed.population,
    color: windDangerColor(area.overallWinds),
  };
}

const isExposedArea = (area: ExposureArea) =>
  area.exposed.population > 0 || area.exposed.buildings > 0;

/** The sentences about where winds are forecast or possible: the two most severe groups of areas. */
function whereSentences(areas: InsightArea[]): string[] {
  const groups = new Map<string, { kind: WindKind; possible: boolean; names: string[] }>();
  for (const area of areas) {
    if (!area.kind) continue;
    const key = `${area.kind}:${area.possible}`;
    const group = groups.get(key) ?? { kind: area.kind, possible: area.possible, names: [] };
    group.names.push(area.name);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort(
    (a, b) => windSeverity(b.kind) - windSeverity(a.kind) || Number(a.possible) - Number(b.possible)
  );
  return ordered.slice(0, 2).map(group => {
    const winds = `${capitalise(WIND_CATEGORIES[group.kind].adjective)} winds`;
    const where = nameList(group.names);
    return group.possible
      ? `${winds} are possible in ${where}.`
      : `${winds} are forecast in ${where}.`;
  });
}

function trendDirection(points: TimelinePoint[]): 'rising' | 'falling' | 'steady' {
  if (points.length < 2) return 'steady';
  const last = points[points.length - 1].people;
  const before = points[points.length - 2].people;
  if (last === before) return 'steady';
  const base = Math.max(before, 1);
  const change = (last - before) / base;
  if (change > 0.1) return 'rising';
  if (change < -0.1) return 'falling';
  return 'steady';
}

function buildTrend(
  timeline: TimelinePoint[],
  issuedAt: string | null | undefined
): InsightTrend | null {
  const points = [...timeline].sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
  if (points.length < 2) return null;
  const peak = points.reduce(
    (best, point) => (point.people > best.people ? point : best),
    points[0]
  );
  if (peak.people === 0) return null; // nothing ever exposed: a flat line says nothing
  const issuedMs = issuedAt ? Date.parse(issuedAt) : NaN;
  const current = points.find(point => Date.parse(point.issuedAt) === issuedMs) ?? null;
  const direction = trendDirection(points);

  const people = (n: number) => (n === 0 ? 'no one' : `${approximate(n)} people`);
  const latest = points[points.length - 1];
  let summary: string;
  if (current && current === peak) {
    summary = `This advisory has the highest exposure so far: ${people(peak.people)}.`;
  } else {
    summary = `Exposure peaked at ${people(peak.people)} (${utcStamp(peak.issuedAt)})`;
    if (current) {
      summary +=
        approximate(current.people) === approximate(peak.people)
          ? '; this advisory is about the same'
          : `; this advisory: ${people(current.people)}`;
    }
    // Looking at an older advisory: say where things stand now, so it is not mistaken for the latest
    if (current && current !== latest) {
      summary += `; the latest advisory: ${people(latest.people)}${latest.people === 0 ? ' in forecast winds' : ''}`;
    }
    summary += '.';
    // A direction is only meaningful for the newest advisory, which is where the trend ends
    if (current === latest && direction !== 'steady') {
      summary += direction === 'falling' ? ' It has been falling.' : ' It has been rising.';
    }
  }
  return { points, peak, current, summary };
}

export interface InsightInput {
  exposure: ForecastExposure;
  countryName: string;
  /** Issue time of the advisory on screen */
  issuedAt?: string | null;
  /** Issue time of the newest advisory that has results */
  latestIssuedAt?: string | null;
  timeline?: TimelinePoint[];
  now?: number;
}

/**
 * Whether the advisory on screen is the newest, from its issue time and the newest one that has
 * results. Separate from the insight so the page can show it without building the whole summary.
 */
export function buildAdvisoryStatus({
  issuedAt = null,
  latestIssuedAt = null,
  timeline = [],
  now,
}: {
  issuedAt?: string | null;
  latestIssuedAt?: string | null;
  timeline?: TimelinePoint[];
  now?: number;
}): AdvisoryStatus {
  const issuedMs = issuedAt ? Date.parse(issuedAt) : NaN;
  const latestMs = latestIssuedAt ? Date.parse(latestIssuedAt) : NaN;
  const age = advisoryAge(issuedAt, now);
  const hasNewer = !Number.isNaN(issuedMs) && !Number.isNaN(latestMs) && latestMs > issuedMs;
  return {
    kind: hasNewer ? 'older' : age?.stale ? 'latest-aging' : 'latest',
    issuedAt,
    age,
    newer: hasNewer
      ? {
          issuedAt: latestIssuedAt as string,
          count: Math.max(
            1,
            timeline.filter(point => Date.parse(point.issuedAt) > issuedMs).length
          ),
        }
      : null,
  };
}

export function buildForecastInsight(input: InsightInput): ForecastInsight {
  const {
    exposure,
    countryName,
    issuedAt = null,
    latestIssuedAt = null,
    timeline = [],
    now,
  } = input;

  const regions = exposure.regions.filter(isExposedArea).map(toInsightArea);
  const national = exposure.national ? toInsightArea(exposure.national) : null;
  const areas = [...regions].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));

  const peopleExposed = exposedPeople(exposure);
  const buildingsExposed = exposedBuildings(exposure);
  const peopleTotal = exposure.national?.totalPopulation ?? 0;
  const percent = peopleTotal > 0 ? (peopleExposed / peopleTotal) * 100 : null;

  // Of the people exposed, how many are in areas where the winds are forecast, and where only possible
  const exposedBands = exposure.byWindDanger.filter(band => isExposedDanger(band.label));
  let confirmed: number | null = null;
  let possible: number | null = null;
  if (exposedBands.length > 0) {
    confirmed = 0;
    possible = 0;
    for (const band of exposedBands) {
      const parsed = parseWindBand(band.label);
      if (!parsed) continue;
      if (parsed.possible) possible += band.totals.population;
      else confirmed += band.totals.population;
    }
  }

  const strongest = strongestWind(exposure);
  const exposedSomething = peopleExposed > 0 || buildingsExposed > 0 || areas.length > 0;
  const anyConfirmed =
    areas.some(area => area.kind && !area.possible) ||
    Boolean(national && national.kind && !national.possible && exposedSomething);
  const level: InsightLevel = !exposedSomething ? 'none' : anyConfirmed ? 'forecast' : 'possible';

  const trackUncertaintyPeople = exposure.national?.populationInTrackUncertainty ?? 0;
  const peopleText = approximate(peopleExposed);
  const pct = percentText(percent);

  let headline: string;
  let detail: string;
  if (level === 'none') {
    headline = `No area of ${countryName} is forecast to see gale-force winds.`;
    detail =
      trackUncertaintyPeople > 0
        ? `${capitalise(approximate(trackUncertaintyPeople))} people are within the forecast track’s uncertainty: if the track shifts towards them, they could be affected.`
        : `Nothing is under winds of ${WIND_CATEGORIES.gale.minKmph} km/h or more on the forecast track.`;
  } else {
    const sentences = whereSentences(areas);
    headline =
      sentences.length > 0
        ? sentences.join(' ')
        : `Gale-force winds or stronger are forecast in ${countryName}.`;
    const people = `${capitalise(peopleText)} ${peopleExposed === 1 ? 'person' : 'people'}`;
    detail = `${people}${pct ? ` (${pct})` : ''} live in areas under these winds.`;
    if (confirmed != null && possible != null && peopleExposed > 0) {
      if (possible >= peopleExposed)
        detail += ' All of them are where the winds are only possible.';
      else if (possible > confirmed)
        detail += ` Most of them (${approximate(possible)}) are where the winds are only possible.`;
      else if (possible > 0)
        detail += ` ${capitalise(approximate(confirmed))} of them are where the winds are forecast with more certainty.`;
    }
  }

  const status = buildAdvisoryStatus({ issuedAt, latestIssuedAt, timeline, now });

  const facilitiesExposed = exposure.national?.exposed;
  const health = facilitiesExposed?.healthFacilities ?? 0;
  const schools = facilitiesExposed?.schools ?? 0;
  const evacuationCentres = facilitiesExposed?.evacuationCentres ?? 0;

  return {
    level,
    strongest,
    headline,
    detail,
    people: {
      exposed: peopleExposed,
      total: peopleTotal,
      percent,
      confirmed,
      possible,
      text: peopleText,
      percentText: pct,
    },
    buildings: { exposed: buildingsExposed, text: approximate(buildingsExposed) },
    facilities: { health, schools, evacuationCentres, total: health + schools + evacuationCentres },
    areas,
    trackUncertaintyPeople,
    status,
    trend: buildTrend(timeline, issuedAt),
  };
}
