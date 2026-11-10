import { advisoryAge } from './forecastBriefing';
import {
  WIND_DANGER_ORDER,
  isExposedDanger,
  type ExposureArea,
  type ForecastExposure,
} from './forecastExposure';
import type { PriorityLevel, PriorityResult } from './responsePriority';

/**
 * The content of the Rapid Exposure Forecast operational brief (a two-page
 * A4 PDF): what it says, already formatted, so the template only lays it out
 * and the wording can be tested. It says "not recorded" for anything the data
 * does not carry rather than leaving a gap or implying certainty.
 */

export interface ForecastBriefInput {
  exposure: ForecastExposure;
  countryName: string;
  eventName: string;
  /** Forecast-track issue time (ISO) */
  issuedAt?: string;
  runCompletedAt?: string;
  /** The run's status as the API reports it, e.g. "complete", "superseded" */
  modelRunStatus?: string;
  /** What the map shows, e.g. "Wind swaths · Facilities" */
  layerSummary: string;
  priority: {
    results: PriorityResult[];
    counts: Record<PriorityLevel, number>;
    isCustom: boolean;
    staleAfterHours: number;
    ageHours: number | null;
  } | null;
  areaLabel: string;
  /** What the run's coarser exposure table is by, e.g. "provinces" */
  regionLabel: string;
  generatedAt: Date;
  dashboardUrl?: string;
}

export interface BriefFreshness {
  kind: 'superseded' | 'old' | 'unknown' | 'latest-known';
  text: string;
}

export interface ForecastBriefModel {
  kicker: string;
  heading: string;
  timesLine: string;
  freshness: BriefFreshness;
  mapCaption: string;
  /** Printed directly under the map and in each page footer */
  disclaimer: string;
  headline: Array<{ label: string; value: string }>;
  priorities: {
    show: boolean;
    heading: string;
    preliminary: string;
    rows: Array<{ level: PriorityLevel; text: string }>;
    overflow: string | null;
    /** The Red areas page 1 had no room for, with their people exposed, for page 2 */
    otherRed: { heading: string; text: string } | null;
    summary: string;
    unverified: string | null;
    thresholds: string;
  };
  operationalNote: string;
  areaTable: { title: string; headers: string[]; rows: string[][] };
  windTable: { title: string; headers: string[]; rows: string[][] };
  context: string[];
  dashboardUrl: string | null;
}

const NOT_RECORDED = 'not recorded';

const int = (n: number) => Math.round(n).toLocaleString('en-US');

function compactUsd(n: number): string {
  if (n >= 1e9) return `US$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `US$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `US$${(n / 1e3).toFixed(0)}K`;
  return `US$${int(n)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "08 Apr 2026 12:00 UTC" (date only when the time is unknown) */
export function formatUtc(value: string | Date | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return dateOnly
    ? day
    : `${day} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

const shortName = (name: string) => name.replace(/^Tropical Cyclone\s+/i, 'TC ').trim();

const shortWind = (winds: string | null) => (winds ?? '–').replace(/ Winds$/, '');

const LEVEL_LABEL: Record<PriorityLevel, string> = {
  red: 'RED',
  amber: 'AMBER',
  green: 'GREEN',
  grey: 'GREY',
};

function freshnessOf(input: ForecastBriefInput): BriefFreshness {
  const status = (input.modelRunStatus ?? '').toLowerCase();
  const age = advisoryAge(input.issuedAt, input.generatedAt.getTime());
  if (status === 'superseded') {
    return {
      kind: 'superseded',
      text: 'SUPERSEDED: a newer advisory exists. Do not act on this brief.',
    };
  }
  if (!age) {
    return {
      kind: 'unknown',
      text: 'ADVISORY TIME NOT RECORDED: confirm this is the latest advisory.',
    };
  }
  if (age.stale) {
    return {
      kind: 'old',
      text: `ADVISORY ISSUED ${age.label.toUpperCase()}: a newer advisory may be available; check before acting.`,
    };
  }
  return {
    kind: 'latest-known',
    text: `Latest advisory known to this dashboard, issued ${age.label}.`,
  };
}

function areaRow(area: ExposureArea): string[] {
  return [
    area.name,
    shortWind(area.overallWinds),
    int(area.exposed.population),
    int(area.exposed.buildings),
    int(area.exposed.healthFacilities),
    int(area.populationInFloodplains),
  ];
}

export function buildForecastBrief(input: ForecastBriefInput): ForecastBriefModel {
  const { exposure } = input;
  const national = exposure.national;
  const issued = formatUtc(input.issuedAt);
  const generated = formatUtc(input.generatedAt) ?? '';
  const totals = national?.exposed;

  const priorityRows = (() => {
    if (!input.priority) return [] as Array<{ level: PriorityLevel; text: string }>;
    const byUnderlying = (level: PriorityLevel) =>
      input.priority!.results.filter(r => r.underlyingLevel === level);
    const describe = (r: PriorityResult) =>
      `${r.name}: ${int(r.metrics.people)} people · ${int(r.metrics.healthFacilities)} health · ${int(r.metrics.evacuationCentres)} evacuation centres · ${shortWind(
        r.metrics.windBand >= 0 ? (WIND_DANGER_ORDER[r.metrics.windBand] ?? null) : null
      )}`;
    const rows: Array<{ level: PriorityLevel; text: string }> = [];
    byUnderlying('red')
      .slice(0, 5)
      .forEach(r => rows.push({ level: 'red', text: describe(r) }));
    const amber = byUnderlying('amber');
    if (amber.length > 0) {
      rows.push({
        level: 'amber',
        text: `${amber.length} ${amber.length === 1 ? 'area' : 'areas'} to prepare: ${amber
          .slice(0, 3)
          .map(r => r.name)
          .join(', ')}${amber.length > 3 ? ' and others' : ''}`,
      });
    }
    const green = byUnderlying('green');
    if (green.length > 0) {
      rows.push({
        level: 'green',
        text: `${green.length} ${green.length === 1 ? 'area' : 'areas'}: monitor advisories`,
      });
    }
    return rows;
  })();

  const redCount = input.priority?.results.filter(r => r.underlyingLevel === 'red').length ?? 0;
  const stale =
    !!input.priority &&
    (input.priority.ageHours === null || input.priority.ageHours > input.priority.staleAfterHours);

  const areas = [...exposure.regions].sort((a, b) => b.exposed.population - a.exposed.population);
  const exposedBands = exposure.byWindDanger.filter(band => isExposedDanger(band.label));

  const trackSource =
    exposure.layers.cycloneTrackSource === 'run'
      ? 'Rapid Exposure Forecast input track (the exact track used for this run)'
      : exposure.layers.cycloneTrackSource === 'event'
        ? 'Forecast track linked to this event (the run kept no copy of its own)'
        : 'No forecast track available';

  return {
    kicker: 'RAPID EXPOSURE FORECAST · OPERATIONAL BRIEF',
    heading: `${shortName(input.eventName)} · ${input.countryName}`,
    timesLine: `${issued ? `Track issued: ${issued}` : 'Track issue time not recorded'} · Generated: ${generated}`,
    freshness: freshnessOf(input),
    mapCaption: `Forecast wind exposure. Map shows: ${input.layerSummary}. Track: ${trackSource}.`,
    disclaimer:
      'Exposure forecast, not a damage estimate. Exposure is not a probability of damage or casualty.',
    headline: [
      { label: 'People exposed', value: int(totals?.population ?? 0) },
      { label: 'Buildings in forecast wind zones', value: int(totals?.buildings ?? 0) },
      {
        label: 'Building value potentially exposed',
        value: compactUsd(totals?.buildingValue ?? 0),
      },
      { label: 'Health facilities', value: int(totals?.healthFacilities ?? 0) },
      { label: 'Schools', value: int(totals?.schools ?? 0) },
      { label: 'Evacuation centres', value: int(totals?.evacuationCentres ?? 0) },
    ],
    priorities: {
      show: !!input.priority && priorityRows.length > 0,
      heading: 'RESPONSE PRIORITIES',
      preliminary:
        'Operational priority -preliminary. Supports decisions; does not declare an emergency.',
      rows: priorityRows,
      overflow:
        redCount > 5
          ? `${redCount - 5} more Red ${redCount - 5 === 1 ? 'area' : 'areas'} listed on page 2`
          : null,
      otherRed:
        redCount > 5
          ? {
              heading: `OTHER RED AREAS (${redCount - 5})`,
              text: input
                .priority!.results.filter(r => r.underlyingLevel === 'red')
                .slice(5)
                .map(r => `${r.name} (${int(r.metrics.people)} people)`)
                .join(' · '),
            }
          : null,
      summary: input.priority
        ? `By ${input.areaLabel}: ${redCount} Red · ${
            input.priority.results.filter(r => r.underlyingLevel === 'amber').length
          } Amber · ${input.priority.results.filter(r => r.underlyingLevel === 'green').length} Green`
        : '',
      unverified: stale
        ? 'Advisory too old to act on: these are the rules’ reading, shown for reference (priorities unverified).'
        : null,
      thresholds: input.priority?.isCustom
        ? `Thresholds: custom for ${input.countryName}`
        : `Thresholds: starting defaults (not reviewed for ${input.countryName})`,
    },
    operationalNote: 'Verify local contacts, shelters and routes before deployment.',
    areaTable: {
      title: `EXPOSURE BY ${input.regionLabel.toUpperCase().replace(/S$/, '')}`,
      headers: ['Area', 'Strongest wind', 'People', 'Buildings', 'Health', 'In floodplain'],
      rows: areas.map(areaRow),
    },
    windTable: {
      title: 'PEOPLE EXPOSED BY FORECAST WIND',
      headers: ['Forecast wind', 'People', 'Buildings'],
      rows: exposedBands.map(band => [
        shortWind(band.label),
        int(band.totals.population),
        int(band.totals.buildings),
      ]),
    },
    context: [
      'Source: Rapid Exposure Forecast',
      `Forecast-track issue time: ${issued ?? NOT_RECORDED}`,
      `Run completed: ${formatUtc(input.runCompletedAt) ?? NOT_RECORDED}`,
      `Model run / version: ${NOT_RECORDED}`,
      `Exposure dataset date: ${NOT_RECORDED}`,
      `Forecast track: ${trackSource}`,
      'Forecasts change; use the latest advisory. Small differences between advisories can be forecast movement, not real change.',
      'Exposure is not a probability of damage or casualty. Floodplain overlap marks where flooding is possible, not that it will occur.',
      'Population, buildings, facilities and evacuation centres come from static datasets and may be out of date.',
    ],
    dashboardUrl: input.dashboardUrl ?? null,
  };
}

/** What the dashboard supplies about the forecast it is showing (the rest is derived) */
export type ForecastBriefContext = Omit<
  ForecastBriefInput,
  'exposure' | 'generatedAt' | 'dashboardUrl'
> & {
  /** Overlay ids switched on in the map, so the printed legend matches it */
  activeLayers: string[];
};
