import type { EventRecord } from '@/data/eventRecords';
import { parseForecastPointsFromGeometry } from '@/utils/cycloneAnimationLoader';
import { listForecastRuns } from '@/utils/forecastRuns';

/**
 * Where each advisory of a storm begins.
 *
 * Every advisory is its own forecast run with its own track (see forecastRuns.ts). The first
 * point of that track is where the storm was when the advisory was issued, so plotting them
 * all shows how the agency's idea of the storm moved from release to release.
 */

export interface AdvisoryOriginProperties {
  /** The dashboard's record id for this advisory (what the run picker switches to) */
  runId: string;
  storm: string;
  /** When the advisory was issued, as the API gave it */
  issuedAt: string;
  /** `issuedAt` as drawn on the map, in UTC: "18 Nov 10Z" */
  label: string;
  /** `positionTime` in the same form, or null */
  positionLabel: string | null;
  /** ISO time of the track's first point, when the track carries times */
  positionTime: string | null;
  /** Mean wind at the first point (knots), when the track carries it */
  windKt: number | null;
  /** The newest advisory of its storm */
  isLatest: boolean;
  /** The run's status (a pending or failed run still has a track) */
  status: string | null;
  /** Set by `selectAdvisoryOrigins` for the advisory on screen */
  selected?: boolean;
}

export type AdvisoryOriginCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AdvisoryOriginProperties
>;

export interface AdvisoryTrackProperties extends AdvisoryOriginProperties {
  /** 0 for the storm's newest advisory, 1 for the one before, and so on */
  age?: number;
}

export type AdvisoryTrackCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  AdvisoryTrackProperties
>;

/**
 * Everything the map shows about a storm's releases: where each advisory starts, and the whole
 * track each one forecast. Together they show how the forecast moved from one release to the next.
 */
export interface AdvisoryReleases {
  origins: AdvisoryOriginCollection;
  tracks: AdvisoryTrackCollection;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "18 Nov 10Z" for an ISO time; the input unchanged when it is not a date. */
export function formatUtcStamp(value: string | null | undefined): string {
  if (!value) return '';
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}Z`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Every Point of a track's geometry, for tracks the strict parser cannot read. */
function rawPositions(geometry: unknown): Array<[number, number]> {
  if (!isObject(geometry) || !Array.isArray(geometry.features)) return [];
  const out: Array<[number, number]> = [];
  for (const feature of geometry.features) {
    if (!isObject(feature) || !isObject(feature.geometry)) continue;
    const { type, coordinates } = feature.geometry as { type?: unknown; coordinates?: unknown };
    if (type !== 'Point' || !Array.isArray(coordinates)) continue;
    const [lon, lat] = coordinates as unknown[];
    if (typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon + lat)) {
      out.push([lon, lat]);
    }
  }
  return out;
}

/**
 * The start point and the track of each advisory, read from its own track row. Advisories whose
 * track is missing or unreadable are left out (never guessed from another run's track).
 *
 * @param trackRows the country's `cyclone_track` rows, each with its `geometry`
 * @param records the dashboard's event records, one per run
 */
export function buildAdvisoryReleases(
  trackRows: Array<Record<string, unknown>>,
  records: EventRecord[],
  countryCode: string
): AdvisoryReleases | null {
  const rowsById = new Map<string, Record<string, unknown>>();
  for (const row of trackRows) {
    if (row.id !== undefined && row.id !== null) rowsById.set(String(row.id), row);
  }
  const runs = new Map(listForecastRuns(records, countryCode).map(run => [run.id, run]));
  const origins: GeoJSON.Feature<GeoJSON.Point, AdvisoryOriginProperties>[] = [];
  const tracks: GeoJSON.Feature<GeoJSON.LineString, AdvisoryTrackProperties>[] = [];

  for (const record of records) {
    const run = runs.get(record.id);
    if (!run || !record.backendCycloneTrackId) continue;
    const row = rowsById.get(String(record.backendCycloneTrackId));
    if (!row) continue;

    const parsed = parseForecastPointsFromGeometry(row.geometry);
    const positions: Array<[number, number]> = parsed?.length
      ? parsed.map(point => [point.longitude, point.latitude])
      : rawPositions(row.geometry);
    if (positions.length === 0) continue;

    const first = parsed?.[0];
    const time =
      first?.time instanceof Date && !Number.isNaN(first.time.getTime()) ? first.time : null;
    const properties: AdvisoryOriginProperties = {
      runId: record.id,
      storm: run.storm ?? '',
      issuedAt: run.issuedAt,
      label: formatUtcStamp(run.issuedAt),
      positionLabel: time ? formatUtcStamp(time.toISOString()) : null,
      positionTime: time ? time.toISOString() : null,
      windKt: first && Number.isFinite(first.meanWind) ? first.meanWind : null,
      isLatest: run.isLatest,
      status: run.status ?? null,
    };
    origins.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: positions[0] },
      properties,
    });
    if (positions.length >= 2) {
      tracks.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: positions },
        properties: { ...properties },
      });
    }
  }

  return origins.length > 0
    ? {
        origins: { type: 'FeatureCollection', features: origins },
        tracks: { type: 'FeatureCollection', features: tracks },
      }
    : null;
}

/**
 * The releases of the storm the advisory on screen belongs to. Other storms are left out: their
 * advisories say nothing about how this forecast moved. The advisory on screen is marked
 * `selected`, and each track carries its `age` so older ones can be drawn fainter. The track of
 * the advisory on screen is left out of `tracks`: the forecast's own track layer draws it.
 *
 * Null when there is nothing to compare (a single advisory is just the track's start).
 */
export function selectAdvisoryReleases(
  releases: AdvisoryReleases | null,
  activeRunId: string | null
): AdvisoryReleases | null {
  if (!releases || !activeRunId) return null;
  const active = releases.origins.features.find(f => f.properties.runId === activeRunId);
  if (!active) return null;
  const storm = active.properties.storm.toLowerCase();
  const sameStorm = <P extends AdvisoryOriginProperties>(f: GeoJSON.Feature<GeoJSON.Geometry, P>) =>
    f.properties.storm.toLowerCase() === storm;

  const origins = releases.origins.features.filter(sameStorm);
  if (origins.length < 2) return null;
  // Newest first: age 0 is the latest advisory
  const age = new Map(
    [...origins]
      .sort((a, b) => Date.parse(b.properties.issuedAt) - Date.parse(a.properties.issuedAt))
      .map((f, index) => [f.properties.runId, index])
  );
  return {
    origins: {
      type: 'FeatureCollection',
      features: origins.map(f => ({
        ...f,
        properties: { ...f.properties, selected: f.properties.runId === activeRunId },
      })),
    },
    tracks: {
      type: 'FeatureCollection',
      features: releases.tracks.features
        .filter(sameStorm)
        .filter(f => f.properties.runId !== activeRunId)
        .map(f => ({
          ...f,
          properties: { ...f.properties, age: age.get(f.properties.runId) ?? 0 },
        })),
    },
  };
}

export interface ReleaseStep {
  runId: string;
  /** "18 Nov 10Z" */
  label: string;
  issuedAt: string;
  isLatest: boolean;
  selected: boolean;
}

/** The storm's advisories oldest first, for stepping through them. */
export function releaseSteps(releases: AdvisoryReleases | null): ReleaseStep[] {
  if (!releases) return [];
  return releases.origins.features
    .map(f => ({
      runId: f.properties.runId,
      label: f.properties.label,
      issuedAt: f.properties.issuedAt,
      isLatest: f.properties.isLatest,
      selected: f.properties.selected === true,
    }))
    .sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
}
