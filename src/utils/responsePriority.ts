import { WIND_DANGER_ORDER, type ExposureArea } from './forecastExposure';

/**
 * "Operational priority -preliminary": a transparent, rule-based reading of a
 * Rapid Exposure Forecast that says where to act first. It supports human
 * decisions; it does not declare an emergency. The rules are editable and kept
 * per country (see priorityStorage), because what counts as "many people" or
 * "a lot of facilities" differs between countries and between area sizes.
 */

export type PriorityLevel = 'red' | 'amber' | 'green' | 'grey';

export type PriorityMetric =
  | 'windBand'
  | 'people'
  | 'peopleInFloodplains'
  | 'peopleInTrackUncertainty'
  | 'healthFacilities'
  | 'schools'
  | 'evacuationCentres';

export interface PriorityCondition {
  metric: PriorityMetric;
  /** Met when the area's value is at least this. For windBand, the index in WIND_DANGER_ORDER. */
  min: number;
}

/** A rule is met when ALL its conditions are; a level applies when ANY of its rules is. */
export interface PriorityRule {
  id: string;
  label: string;
  enabled: boolean;
  conditions: PriorityCondition[];
}

export interface PriorityThresholds {
  version: 1;
  red: PriorityRule[];
  amber: PriorityRule[];
  /** An advisory older than this is shown as unknown (grey) rather than acted on */
  staleAfterHours: number;
}

export const METRIC_LABELS: Record<PriorityMetric, string> = {
  windBand: 'Forecast wind at least',
  people: 'People exposed ≥',
  peopleInFloodplains: 'People in floodplains ≥',
  peopleInTrackUncertainty: 'People in track uncertainty ≥',
  healthFacilities: 'Health facilities exposed ≥',
  schools: 'Schools exposed ≥',
  evacuationCentres: 'Evacuation centres exposed ≥',
};

export const METRICS = Object.keys(METRIC_LABELS) as PriorityMetric[];

const rank = (band: (typeof WIND_DANGER_ORDER)[number]) => WIND_DANGER_ORDER.indexOf(band);

/**
 * Starting points only: each country should review and set its own. Red is tied to
 * hurricane-force winds so it stays a short "act now" list (on the Vanuatu sample
 * run, 15 of 66 districts); storm-force exposure is Amber.
 */
export function defaultThresholds(): PriorityThresholds {
  return {
    version: 1,
    red: [
      {
        id: 'red-hurricane-people',
        label: 'Hurricane winds with many people exposed',
        enabled: true,
        conditions: [
          { metric: 'windBand', min: rank('Hurricane Winds') },
          { metric: 'people', min: 1000 },
        ],
      },
      {
        id: 'red-facilities',
        label: 'Hurricane winds with exposed health facilities',
        enabled: true,
        conditions: [
          { metric: 'windBand', min: rank('Hurricane Winds') },
          { metric: 'healthFacilities', min: 1 },
        ],
      },
      {
        id: 'red-floodplain',
        label: 'Hurricane winds with people in floodplains',
        enabled: true,
        conditions: [
          { metric: 'windBand', min: rank('Hurricane Winds') },
          { metric: 'peopleInFloodplains', min: 1000 },
        ],
      },
    ],
    amber: [
      {
        id: 'amber-gale',
        label: 'Gale winds or stronger',
        enabled: true,
        conditions: [
          { metric: 'windBand', min: rank('Gale Winds') },
          { metric: 'people', min: 1 },
        ],
      },
      {
        id: 'amber-uncertainty',
        label: 'Track uncertainty reaches many people',
        enabled: true,
        conditions: [{ metric: 'peopleInTrackUncertainty', min: 500 }],
      },
    ],
    staleAfterHours: 24,
  };
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

function sanitizeRules(raw: unknown, fallback: PriorityRule[]): PriorityRule[] {
  if (!Array.isArray(raw)) return fallback;
  const rules: PriorityRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rule = item as Partial<PriorityRule>;
    const conditions = (Array.isArray(rule.conditions) ? rule.conditions : [])
      .filter(
        (c): c is PriorityCondition =>
          !!c && METRICS.includes((c as PriorityCondition).metric) && typeof c.min === 'number'
      )
      .map(c => ({ metric: c.metric, min: finite(c.min, 0) }));
    if (typeof rule.id !== 'string' || typeof rule.label !== 'string' || conditions.length === 0) {
      continue;
    }
    rules.push({ id: rule.id, label: rule.label, enabled: rule.enabled !== false, conditions });
  }
  return rules.length > 0 ? rules : fallback;
}

/** Whatever was stored, made safe: bad or missing parts fall back to the defaults. */
export function sanitizeThresholds(raw: unknown): PriorityThresholds {
  const defaults = defaultThresholds();
  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Partial<PriorityThresholds>;
  return {
    version: 1,
    red: sanitizeRules(value.red, defaults.red),
    amber: sanitizeRules(value.amber, defaults.amber),
    staleAfterHours: finite(value.staleAfterHours, defaults.staleAfterHours),
  };
}

export type PriorityMetrics = Record<PriorityMetric, number>;

export function areaMetrics(area: ExposureArea): PriorityMetrics {
  const band = area.overallWinds ? WIND_DANGER_ORDER.indexOf(area.overallWinds as never) : -1;
  return {
    windBand: Math.max(0, band),
    people: area.exposed.population,
    peopleInFloodplains: area.populationInFloodplains,
    peopleInTrackUncertainty: area.populationInTrackUncertainty,
    healthFacilities: area.exposed.healthFacilities,
    schools: area.exposed.schools,
    evacuationCentres: area.exposed.evacuationCentres,
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "Hurricane Winds or stronger (forecast: Hurricane Winds)", "≥ 1,000 people exposed (2,775)" */
export function describeCondition(condition: PriorityCondition, metrics: PriorityMetrics): string {
  if (condition.metric === 'windBand') {
    const needed = WIND_DANGER_ORDER[condition.min] ?? 'Not exposed';
    const actual = WIND_DANGER_ORDER[metrics.windBand] ?? 'Not exposed';
    return `${needed} or stronger (forecast: ${actual})`;
  }
  const label = METRIC_LABELS[condition.metric].replace(/ ≥$/, '').toLowerCase();
  return `${label} ≥ ${fmt(condition.min)} (${fmt(metrics[condition.metric])})`;
}

function matchedRules(rules: PriorityRule[], metrics: PriorityMetrics): PriorityRule[] {
  return rules.filter(
    rule => rule.enabled && rule.conditions.every(c => metrics[c.metric] >= c.min)
  );
}

export interface PriorityResult {
  name: string;
  /** What is shown: grey when the advisory is stale or its age is unknown */
  level: PriorityLevel;
  /** What the rules say regardless of staleness */
  underlyingLevel: Exclude<PriorityLevel, 'grey'>;
  /** Why, in plain words: each matched rule with the actual numbers */
  reasons: string[];
  metrics: PriorityMetrics;
}

export function evaluateArea(
  name: string,
  metrics: PriorityMetrics,
  thresholds: PriorityThresholds,
  advisoryAgeHours: number | null
): PriorityResult {
  const red = matchedRules(thresholds.red, metrics);
  const amber = matchedRules(thresholds.amber, metrics);
  const underlyingLevel = red.length > 0 ? 'red' : amber.length > 0 ? 'amber' : 'green';
  const matched = red.length > 0 ? red : amber;
  const reasons =
    matched.length > 0
      ? matched.map(
          rule =>
            `${rule.label}: ${rule.conditions.map(c => describeCondition(c, metrics)).join(' and ')}`
        )
      : ['No Red or Amber rule is met'];
  const stale = advisoryAgeHours === null || advisoryAgeHours > thresholds.staleAfterHours;
  return { name, level: stale ? 'grey' : underlyingLevel, underlyingLevel, reasons, metrics };
}

const ORDER: Record<PriorityLevel, number> = { red: 0, amber: 1, green: 2, grey: 3 };

/** Every area with its priority, worst first (and by people exposed within a level). */
export function prioritise(
  areas: Array<{ name: string; area: ExposureArea }>,
  thresholds: PriorityThresholds,
  advisoryAgeHours: number | null
): PriorityResult[] {
  return areas
    .map(({ name, area }) => evaluateArea(name, areaMetrics(area), thresholds, advisoryAgeHours))
    .sort((a, b) => {
      const byLevel = ORDER[a.underlyingLevel] - ORDER[b.underlyingLevel];
      return byLevel !== 0 ? byLevel : b.metrics.people - a.metrics.people;
    });
}

export function countByLevel(results: PriorityResult[]): Record<PriorityLevel, number> {
  const counts: Record<PriorityLevel, number> = { red: 0, amber: 0, green: 0, grey: 0 };
  for (const result of results) counts[result.level === 'grey' ? 'grey' : result.level] += 1;
  return counts;
}
