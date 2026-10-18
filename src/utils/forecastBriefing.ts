import {
  isExposedDanger,
  type ExposureArea,
  type ExposureTotals,
  type ForecastExposure,
} from './forecastExposure';

/** The framing every REF figure, export and screenshot carries. */
export const FORECAST_SIGNAL = 'Planning signal -exposure, not a damage estimate';

/** REF advisories are issued about every six hours; beyond this one may be superseded. */
const STALE_AFTER_HOURS = 12;

export interface AdvisoryAge {
  hours: number;
  /** e.g. "5 hours ago", "3 days ago" */
  label: string;
  /** Old enough that a newer advisory has probably been issued */
  stale: boolean;
}

export function advisoryAge(
  issuedAt: string | null | undefined,
  now: number = Date.now()
): AdvisoryAge | null {
  if (!issuedAt) return null;
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued)) return null;
  const hours = Math.max(0, (now - issued) / 3_600_000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const label =
    hours < 1
      ? 'less than an hour ago'
      : hours < 48
        ? plural(Math.floor(hours), 'hour')
        : hours < 24 * 60
          ? plural(Math.floor(hours / 24), 'day')
          : plural(Math.floor(hours / (24 * 30)), 'month');
  return { hours, label, stale: hours > STALE_AFTER_HOURS };
}

export interface OperationalPriorities {
  healthFacilities: number;
  schools: number;
  evacuationCentres: number;
  /** Exposed facilities that also sit in a mapped floodplain */
  facilitiesInFloodplain: number;
  populationInFloodplains: number;
  roadKm: number;
  /** The areas with the most people under forecast winds */
  topAreas: Array<{
    name: string;
    people: number;
    winds: string | null;
    evacuationCentres: number;
  }>;
}

/** What responders act on: facilities, floodplain overlap and the worst-hit areas. */
export function operationalPriorities(exposure: ForecastExposure): OperationalPriorities {
  const national: ExposureArea | null = exposure.national;
  const exposed: ExposureTotals | undefined = national?.exposed;
  return {
    healthFacilities: exposed?.healthFacilities ?? 0,
    schools: exposed?.schools ?? 0,
    evacuationCentres: exposed?.evacuationCentres ?? 0,
    facilitiesInFloodplain: exposure.facilities.filter(
      facility => facility.inFloodplain && isExposedDanger(facility.danger ?? '')
    ).length,
    populationInFloodplains: national?.populationInFloodplains ?? 0,
    roadKm: exposed?.roadKm ?? 0,
    topAreas: [...exposure.regions]
      .sort((a, b) => b.exposed.population - a.exposed.population)
      .slice(0, 3)
      .map(area => ({
        name: area.name,
        people: area.exposed.population,
        winds: area.overallWinds,
        evacuationCentres: area.exposed.evacuationCentres,
      })),
  };
}

export interface ForecastExportMeta {
  eventName?: string;
  /** Forecast track issue time */
  issuedAt?: string;
  runCompletedAt?: string;
  exportedAt?: string;
}

const CSV_COLUMNS: Array<[string, (area: ExposureArea) => number]> = [
  ['people_exposed_to_forecast_winds', area => area.exposed.population],
  ['people_in_floodplains', area => area.populationInFloodplains],
  ['buildings_in_forecast_wind_zones', area => area.exposed.buildings],
  ['building_value_potentially_exposed_usd', area => area.exposed.buildingValue],
  ['road_km_exposed', area => area.exposed.roadKm],
  ['crop_value_potentially_exposed_usd', area => area.exposed.cropValue],
  ['health_facilities_exposed', area => area.exposed.healthFacilities],
  ['schools_exposed', area => area.exposed.schools],
  ['evacuation_centres_exposed', area => area.exposed.evacuationCentres],
];

/** Keeps up to two decimals (0.4 km of road must not export as 0); missing values export as 0. */
function csvNumber(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Number(value.toFixed(2)))
    : '0';
}

/** Rows for a forecast-exposure CSV: framing and provenance first, then one row per area. */
export function forecastCsvRows(
  exposure: ForecastExposure,
  meta: ForecastExportMeta = {}
): string[][] {
  const rows: string[][] = [
    [`Rapid Exposure Forecast -${FORECAST_SIGNAL}`],
    ['event', meta.eventName ?? ''],
    ['forecast_track_issued', meta.issuedAt ?? ''],
    ['run_completed', meta.runCompletedAt ?? ''],
    ['exported', meta.exportedAt ?? ''],
    [],
    ['area', 'strongest_forecast_wind', ...CSV_COLUMNS.map(([name]) => name)],
  ];
  const areas: ExposureArea[] = [
    ...(exposure.national ? [exposure.national] : []),
    ...exposure.regions,
  ];
  for (const area of areas) {
    rows.push([
      area.name,
      area.overallWinds ?? '',
      ...CSV_COLUMNS.map(([, pick]) => csvNumber(pick(area))),
    ]);
  }
  return rows;
}
