import { COUNTRIES, type CountryCode } from '@/types/thredds';
import { createPartnerEventId, type EventRecord } from '@/data/eventRecords';
import { hazardIdForEventType } from '@/utils/hazardIds';

export function normalizeDateValue(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function toIdList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(toIdString).filter((id): id is string => id !== null)
    : [];
}

/** Normalize one Partner API Event row (shared by the loader and /api/events). */
export function normalizePartnerEventRow(
  countryCode: CountryCode,
  row: Record<string, unknown>
): EventRecord | null {
  const country = COUNTRIES[countryCode];
  const name = firstString(row, ['event_name', 'name', 'title', 'cyclone_name', 'CycloneName']);
  const date = firstString(row, [
    'event_datetime',
    'event_date',
    'date',
    'issued_time',
    'timestamp',
  ]);
  const explicitId =
    (typeof row.id === 'number' && Number.isFinite(row.id) ? String(row.id) : '') ||
    firstString(row, ['id', 'event_id', 'eventId', 'cyclone_id', 'cycloneId']);
  const cycloneTrackId = toIdString(row.cyclone_track) ?? toIdString(row.cycloneTrack) ?? '';
  const eventType = firstString(row, ['event_type_name']);
  const dataSource = typeof row.data_source === 'string' ? row.data_source : undefined;
  // Prefer explicit backend signals. The title match is only a fallback for
  // rows that carry no data_source, and requires the spelled-out phrase so an
  // unrelated title containing "ref" is not mistaken for a forecast.
  const isForecast =
    row.is_forecast === true ||
    dataSource === 'rapid_exposure_forecast' ||
    (!dataSource && /rapid\s+(exposure|forecast)/i.test(name));

  if (!name && !explicitId) return null;

  const normalizedDate = normalizeDateValue(date);
  return {
    id: explicitId || createPartnerEventId(countryCode, name || country.name, normalizedDate),
    countryCode,
    name: name || country.name,
    date: normalizedDate,
    hazardId: hazardIdForEventType(eventType),
    eventType: eventType || undefined,
    backendEventId: explicitId || undefined,
    backendCycloneTrackId: cycloneTrackId || undefined,
    backendHazardIds: toIdList(row.hazards),
    backendRiskIds: toIdList(row.risks),
    cycloneName: firstString(row, ['cyclone_name', 'CycloneName']) || undefined,
    isForecast,
    dataSource,
    trackIssuedTime: firstString(row, ['track_issued_time']) || undefined,
    modelRunStatus: firstString(row, ['model_run_status']) || undefined,
    modelRunFinishedAt: firstString(row, ['model_run_finished_at']) || undefined,
    modelRunCreatedAt: firstString(row, ['model_run_created_at']) || undefined,
    location: { lat: country.center[1], lng: country.center[0] },
    bbox: [
      country.center[0] - 1,
      country.center[1] - 1,
      country.center[0] + 1,
      country.center[1] + 1,
    ],
    aliases: [
      ...(explicitId ? [explicitId] : []),
      ...(cycloneTrackId ? [`cyclone-track-${cycloneTrackId}`] : []),
    ],
    source: 'partner_api',
  };
}

/**
 * One record per advisory run of a forecast Event.
 *
 * The Event shows a single run, but the API lists every run of the storm
 * (`forecast_runs`) with its own outputs, so each becomes a record the
 * dashboard can switch to. The run the Event shows keeps the Event's own id,
 * so shared links to it keep working; a pending or failed run has no risks,
 * which the dashboard shows as such. Events with no runs (loaded by hand)
 * stay a single record.
 */
export function normalizePartnerEventRecords(
  countryCode: CountryCode,
  row: Record<string, unknown>
): EventRecord[] {
  const base = normalizePartnerEventRow(countryCode, row);
  if (!base) return [];
  const runs = Array.isArray(row.forecast_runs)
    ? (row.forecast_runs as Array<Record<string, unknown>>).filter(run => toIdString(run.id))
    : [];
  if (!base.isForecast || runs.length === 0) return [base];

  const keepsEventId =
    runs.find(run => run.is_current === true) ??
    runs.find(run => run.status === 'complete') ??
    runs[0];
  return runs.map(run => {
    const runId = toIdString(run.id) as string;
    const issued = typeof run.issued_time === 'string' ? run.issued_time : undefined;
    return {
      ...base,
      id: run === keepsEventId ? base.id : `${base.id}-run-${runId}`,
      forecastRunId: runId,
      date: issued ? normalizeDateValue(issued) || base.date : base.date,
      trackIssuedTime: issued ?? base.trackIssuedTime,
      // Another advisory must never borrow the Event's track: that is the shown run's, so the map
      // would draw one forecast over another advisory's figures
      backendCycloneTrackId:
        toIdString(run.cyclone_track) ??
        (run === keepsEventId ? base.backendCycloneTrackId : undefined),
      // Each advisory's own track name, not the name of the track the Event shows now
      cycloneName:
        typeof run.cyclone_name === 'string' && run.cyclone_name
          ? run.cyclone_name
          : base.cycloneName,
      backendRiskIds: toIdList(run.risks),
      modelRunStatus: typeof run.status === 'string' ? run.status : base.modelRunStatus,
      modelRunFinishedAt:
        typeof run.finished_at === 'string' ? run.finished_at : base.modelRunFinishedAt,
      modelRunError: typeof run.error === 'string' && run.error ? run.error : undefined,
    };
  });
}

/**
 * Select the country's risk_information rows that belong to `event`, using
 * the authoritative Event.risks relationship (REF files carry no event_id).
 *
 * A forecast event with no linked risks (its run hasn't published yet) gets
 * nothing: REF outputs reach an event only through Event.risks. Any other
 * event with no linked risks (a country-level scenario catalogue) gets the
 * country's unlinked rows; rows linked to any other event are excluded so one
 * event's outputs never appear under another.
 */
export function scopeRiskRowsToEvent(
  countryRiskRows: Array<Record<string, unknown>>,
  event: Pick<EventRecord, 'id' | 'backendRiskIds' | 'isForecast'>,
  allEvents: Array<Pick<EventRecord, 'id' | 'backendRiskIds'>>
): Array<Record<string, unknown>> {
  const rowId = (row: Record<string, unknown>) => toIdString(row.id);
  const linked = event.backendRiskIds ?? [];
  if (linked.length > 0) {
    const ids = new Set(linked);
    return countryRiskRows.filter(row => {
      const id = rowId(row);
      return id !== null && ids.has(id);
    });
  }
  if (event.isForecast) return [];
  const otherIds = new Set(
    allEvents.filter(other => other.id !== event.id).flatMap(other => other.backendRiskIds ?? [])
  );
  return countryRiskRows.filter(row => {
    const id = rowId(row);
    return id === null || !otherIds.has(id);
  });
}
