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
  const singleRun = toIdString(row.model_run);
  const modelRunIds = [...toIdList(row.model_runs), ...(singleRun ? [singleRun] : [])];
  const dataSource = typeof row.data_source === 'string' ? row.data_source : undefined;
  // Prefer explicit backend signals. The title match is only a fallback for
  // rows that carry no data_source, and requires the spelled-out phrase so an
  // unrelated title containing "ref" is not mistaken for a forecast.
  const isForecast =
    row.is_forecast === true ||
    // The API lists a model run on an Event only for RiskScape (REF) outputs, and
    // does not flag is_forecast itself.
    (modelRunIds.length > 0 && row.is_forecast === undefined && !dataSource) ||
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
    backendModelRunIds: modelRunIds.length > 0 ? modelRunIds : undefined,
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
      backendCycloneTrackId: toIdString(run.cyclone_track) ?? base.backendCycloneTrackId,
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

/** A risk row's ModelRun id, as a string. */
export function riskRowModelRunId(row: Record<string, unknown>): string | null {
  return toIdString(row.model_run);
}

/**
 * The API links an Event to its outputs through ModelRun (`Event.model_runs` and
 * `RiskInformation.model_run`), with no `Event.risks` list. Turn that into
 * `backendRiskIds` so the rest of the dashboard scopes rows the same way for both shapes.
 * An event that already lists its risks keeps them.
 */
export function linkEventRisksFromModelRuns(
  events: EventRecord[],
  riskRows: Array<Record<string, unknown>>
): EventRecord[] {
  return events.map(event => {
    const runs = event.backendModelRunIds ?? [];
    if (runs.length === 0 || (event.backendRiskIds?.length ?? 0) > 0) return event;
    const wanted = new Set(runs);
    const ids = riskRows
      .filter(row => {
        const run = riskRowModelRunId(row);
        return run !== null && wanted.has(run);
      })
      .map(row => toIdString(row.id))
      .filter((id): id is string => id !== null);
    return ids.length > 0 ? { ...event, backendRiskIds: ids } : event;
  });
}

const ADVISORY_STAMP = /\b(\d{10})\b/;

/** "2026101906" (YYYYMMDDHH, UTC) as an ISO time. */
function advisoryStampToIso(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:00:00Z`;
}

/** The advisory time a run's risk titles carry ("TC Wati 2026101906 - wind swaths"). */
function advisoryStampOf(rows: Array<Record<string, unknown>>): string | null {
  for (const row of rows) {
    const found = ADVISORY_STAMP.exec(String(row.title ?? ''))?.[1];
    if (found) return found;
  }
  return null;
}

/**
 * One record per advisory when the API lists several model runs on an Event but not the
 * `forecast_runs` that normalizePartnerEventRecords reads (the ModelRun endpoint needs a
 * login). A run is told apart by its risk rows (`model_run`), its advisory time by the
 * stamp in their titles, and its track by that stamp. The newest advisory keeps the
 * Event's id, so shared links to it keep working. A run with no risk rows, or no stamp,
 * cannot be placed in time and is left out; with fewer than two usable runs the Event is
 * returned as it was.
 */
export function expandEventModelRuns(
  events: EventRecord[],
  riskRows: Array<Record<string, unknown>>,
  trackRows: Array<Record<string, unknown>>
): EventRecord[] {
  return events.flatMap(event => {
    const runIds = event.backendModelRunIds ?? [];
    if (!event.isForecast || event.forecastRunId || runIds.length < 2) return [event];
    const runs = runIds
      .map(runId => {
        const rows = riskRows.filter(row => riskRowModelRunId(row) === runId);
        const stamp = advisoryStampOf(rows);
        return stamp ? { runId, rows, stamp } : null;
      })
      .filter((run): run is NonNullable<typeof run> => run !== null);
    if (runs.length < 2) return [event];
    runs.sort((a, b) => b.stamp.localeCompare(a.stamp) || Number(b.runId) - Number(a.runId));
    const storm = stormOfEvent(event);
    return runs.map((run, index) => {
      const issued = advisoryStampToIso(run.stamp);
      const trackId = inferEventTrackId(
        { ...event, backendCycloneTrackId: undefined, backendModelRunIds: [run.runId] },
        trackRows,
        run.rows
      );
      return {
        ...event,
        id: index === 0 ? event.id : `${event.id}-run-${run.runId}`,
        forecastRunId: run.runId,
        cycloneName: `${run.stamp}_${storm}`,
        date: normalizeDateValue(issued) || event.date,
        trackIssuedTime: issued,
        backendModelRunIds: [run.runId],
        backendRiskIds: run.rows.map(row => toIdString(row.id)).filter((id): id is string => !!id),
        backendCycloneTrackId: trackId ?? undefined,
        modelRunStatus: 'complete',
      };
    });
  });
}

function stormOfEvent(event: Pick<EventRecord, 'name' | 'cycloneName'>): string {
  const named = (event.cycloneName || event.name.replace(/^(tropical\s+)?(cyclone|tc)\s+/i, ''))
    .replace(/^\d{8,12}_/, '')
    .trim();
  return named;
}

/**
 * Pick the cyclone track for an Event that does not name one (the ModelRun that
 * knows its track needs a login). Same storm by name; the advisory time that its
 * risk titles carry ("TC Wati 2026101912 - ...") wins, else the latest issued.
 */
export function inferEventTrackId(
  event: Pick<EventRecord, 'name' | 'cycloneName' | 'backendCycloneTrackId' | 'backendModelRunIds'>,
  trackRows: Array<Record<string, unknown>>,
  eventRiskRows: Array<Record<string, unknown>>
): string | null {
  if (event.backendCycloneTrackId) return event.backendCycloneTrackId;
  if ((event.backendModelRunIds?.length ?? 0) === 0) return null;
  const storm = stormOfEvent(event).toLowerCase();
  if (!storm) return null;
  const sameStorm = trackRows.filter(row =>
    String(row.cyclone_name ?? '')
      .toLowerCase()
      .includes(storm)
  );
  const stamp = eventRiskRows
    .map(row => /\b(\d{10})\b/.exec(String(row.title ?? ''))?.[1])
    .find((value): value is string => !!value);
  const exact = stamp
    ? sameStorm.filter(row => String(row.cyclone_name ?? '').startsWith(stamp))
    : [];
  const latest = (rows: Array<Record<string, unknown>>) =>
    [...rows].sort(
      (a, b) =>
        Date.parse(String(b.issued_time ?? '')) - Date.parse(String(a.issued_time ?? '')) ||
        Number(b.id) - Number(a.id)
    )[0];
  // Two tracks can carry one stamp (a re-ingest with a wrong issue time); the one issued at
  // the stamp's own time is the advisory itself.
  const issuedAtStamp = stamp
    ? exact.filter(
        row => Date.parse(String(row.issued_time ?? '')) === Date.parse(advisoryStampToIso(stamp))
      )
    : [];
  const pick = latest(
    issuedAtStamp.length > 0 ? issuedAtStamp : exact.length > 0 ? exact : sameStorm
  );
  return pick ? toIdString(pick.id) : null;
}
