import { COUNTRIES, type CountryCode } from '@/types/thredds';
import { createPartnerEventId, type EventKind, type EventRecord } from '@/data/eventRecords';
import { hazardIdForEventType } from '@/utils/hazardIds';
import { MULTI_HAZARD_ID } from '@/utils/hazardLossScope';

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

export function toIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function toIdList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(toIdString).filter((id): id is string => id !== null)
    : [];
}

/**
 * What an event type's name says about the event. The shared API names its types
 * "Tropical Cyclone - REF" (rapid exposure forecast), "Tropical Cyclone - PDIE"
 * (post-event assessment) and "Scenario" (planning scenarios); `event/` carries only
 * the type's id.
 */
export function eventTypeKind(typeName: string): EventKind | null {
  if (/\bREF\b|rapid\s+exposure/i.test(typeName)) return 'forecast';
  if (/\bPDIE\b|\bPDNA\b|post[-\s]?event|observed/i.test(typeName)) return 'observed';
  if (/scenario/i.test(typeName)) return 'scenario';
  return null;
}

/** Hazard part of a type name: "Tropical Cyclone - REF" is "Tropical Cyclone". */
function hazardOfEventType(typeName: string): string {
  return typeName.replace(/\s*[-–]\s*(REF|PDIE|PDNA)\s*$/i, '').trim();
}

/** Adds `event_type_name` to event rows that carry only the type's id. */
export function annotateEventTypeNames(
  eventRows: Array<Record<string, unknown>>,
  typeRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const names = new Map<string, string>();
  for (const type of typeRows) {
    const id = toIdString(type.id);
    const name = typeof type.event_name === 'string' ? type.event_name : '';
    if (id && name) names.set(id, name);
  }
  if (names.size === 0) return eventRows;
  return eventRows.map(row => {
    if (typeof row.event_type_name === 'string' && row.event_type_name) return row;
    const name = names.get(toIdString(row.event_type) ?? '');
    return name ? { ...row, event_type_name: name } : row;
  });
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
  const eventTypeName = firstString(row, ['event_type_name']);
  const typeKind = eventTypeKind(eventTypeName);
  const eventType = hazardOfEventType(eventTypeName);
  const singleRun = toIdString(row.model_run);
  const modelRunIds = [...toIdList(row.model_runs), ...(singleRun ? [singleRun] : [])];
  const dataSource = typeof row.data_source === 'string' ? row.data_source : undefined;
  // An explicit flag wins, then the event type's name, then the guesses below. The
  // title match requires the spelled-out phrase so an unrelated title containing
  // "ref" is not mistaken for a forecast.
  const declaredForecast =
    typeof row.is_forecast === 'boolean'
      ? row.is_forecast
      : typeKind !== null
        ? typeKind === 'forecast'
        : null;
  const isForecast =
    declaredForecast ??
    // The API lists a model run on an Event only for RiskScape (REF) outputs, and
    // does not flag is_forecast itself.
    ((modelRunIds.length > 0 && !dataSource) ||
      dataSource === 'rapid_exposure_forecast' ||
      (!dataSource && /rapid\s+(exposure|forecast)/i.test(name)));

  if (!name && !explicitId) return null;

  const normalizedDate = normalizeDateValue(date);
  return {
    id: explicitId || createPartnerEventId(countryCode, name || country.name, normalizedDate),
    countryCode,
    name: name || country.name,
    date: normalizedDate,
    // A planning scenario spans several hazards; its type names none.
    hazardId: typeKind === 'scenario' ? MULTI_HAZARD_ID : hazardIdForEventType(eventType),
    eventType: eventType || undefined,
    eventKind: typeKind ?? (isForecast ? 'forecast' : undefined),
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
/**
 * An Event row with no title, no date and nothing of its own (no risks, no runs): a placeholder.
 * Our API has six for the Cook Islands, all on Meena's track, which listed as blank duplicates.
 */
export function isPlaceholderEventRow(row: Record<string, unknown>): boolean {
  return (
    !firstString(row, ['title', 'event_name', 'name']) &&
    !firstString(row, ['event_datetime', 'event_date', 'date']) &&
    toIdList(row.risks).length === 0 &&
    toIdList(row.model_runs).length === 0 &&
    toIdString(row.model_run) === null &&
    !(Array.isArray(row.forecast_runs) && row.forecast_runs.length > 0)
  );
}

export function normalizePartnerEventRecords(
  countryCode: CountryCode,
  row: Record<string, unknown>
): EventRecord[] {
  if (isPlaceholderEventRow(row)) return [];
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

/** Requests in flight at once when reading rows one by one (a storm can have 70 risk rows). */
export const PARTNER_BY_ID_CONCURRENCY = 6;

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Row = Record<string, unknown>;

/**
 * A country's Event rows ready for normalizePartnerEventRecords, from either API. On the
 * shared API, whose Events list only model run ids, each run is read
 * (`model_run/{id}/`, public) and its rows and track written onto the Event; a run's track
 * missing from `trackRows` is read by id when `trackUrl` is given (most Wati tracks are
 * filed under Fiji). Every row gets its event type's name, which there only `event_type/`
 * has. Returns the rows and the tracks, extra ones included.
 */
export async function prepareEventRows(
  eventRows: Row[],
  trackRows: Row[],
  loadTypeRows: () => Promise<Row[]>,
  readDetail: (url: string) => Promise<Row | null>,
  urls: { modelRun: string; cycloneTrack?: string }
): Promise<{ eventRows: Row[]; trackRows: Row[]; runOnly: boolean }> {
  const runOnly = eventRows.length > 0 && eventRows.every(isRunOnlyEventRow);
  // Our API names the type on the event and has no event_type/ list, so ask only when needed
  const typesNeeded = eventRows.some(row => !firstString(row, ['event_type_name']));
  const typeRowsPromise = typesNeeded ? loadTypeRows() : Promise.resolve([]);
  if (!runOnly) {
    return {
      eventRows: annotateEventTypeNames(eventRows, await typeRowsPromise),
      trackRows,
      runOnly,
    };
  }
  const runIds = [...new Set(eventRows.flatMap(row => toIdList(row.model_runs)))];
  const runs = await mapWithConcurrency(runIds, PARTNER_BY_ID_CONCURRENCY, id =>
    readDetail(`${urls.modelRun}${id}/`)
  );
  const runsById = new Map<string, Row>();
  runs.forEach((run, index) => {
    if (run) runsById.set(runIds[index], run);
  });
  const known = new Set(trackRows.map(row => toIdString(row.id)));
  const missingTrackIds = urls.cycloneTrack
    ? [
        ...new Set(
          [...runsById.values()]
            .map(run => toIdString(run.tc_track))
            .filter((id): id is string => id !== null && !known.has(id))
        ),
      ]
    : [];
  const extraTracks = await mapWithConcurrency(missingTrackIds, PARTNER_BY_ID_CONCURRENCY, id =>
    readDetail(`${urls.cycloneTrack}${id}/`)
  );
  const allTracks = [...trackRows, ...extraTracks.filter((row): row is Row => !!row)];
  return {
    eventRows: annotateEventTypeNames(
      eventRows.map(row => attachModelRunDetails(row, runsById, allTracks)),
      await typeRowsPromise
    ),
    trackRows: allTracks,
    runOnly,
  };
}

/** A shared-API Event row: it lists its model run ids and nothing else of its data. */
export function isRunOnlyEventRow(row: Record<string, unknown>): boolean {
  return !('risks' in row) && Array.isArray(row.model_runs);
}

/**
 * The shared API's Event lists only its model run ids; each run (`model_run/{id}/`) names
 * its risk rows and track. Writes them onto the Event row in the shape our API serves —
 * `risks` and `cyclone_track` of the newest run, and `forecast_runs` when there are
 * several — so both APIs go through normalizePartnerEventRecords the same way.
 */
export function attachModelRunDetails(
  eventRow: Record<string, unknown>,
  runsById: Map<string, Record<string, unknown>>,
  trackRows: Array<Record<string, unknown>>
): Record<string, unknown> {
  const runs = toIdList(eventRow.model_runs)
    .map(id => runsById.get(id))
    .filter((run): run is Record<string, unknown> => !!run)
    .sort(
      (a, b) =>
        String(b.model_run_time ?? '').localeCompare(String(a.model_run_time ?? '')) ||
        Number(b.id) - Number(a.id)
    );
  if (runs.length === 0) return eventRow;
  const [current] = runs;
  const storm = stormOfEvent({ name: String(eventRow.title ?? '') });
  const trackName = (id: string | null) =>
    trackRows.find(track => id !== null && toIdString(track.id) === id)?.cyclone_name;
  return {
    ...eventRow,
    risks: toIdList(current.risks),
    cyclone_track: current.tc_track ?? null,
    forecast_runs:
      runs.length > 1
        ? runs.map(run => {
            const issued = typeof run.model_run_time === 'string' ? run.model_run_time : '';
            const stamp = issued.slice(0, 13).replace(/[-T]/g, '');
            return {
              id: run.id,
              cyclone_track: run.tc_track ?? null,
              // Named like the storm's tracks ("2026101906_Wati") so the run picker groups them
              cyclone_name:
                trackName(toIdString(run.tc_track)) || (stamp ? `${stamp}_${storm}` : undefined),
              issued_time: issued || undefined,
              status: run.model_run_completed === false ? 'pending' : 'complete',
              risks: toIdList(run.risks),
              is_current: run === current,
            };
          })
        : undefined,
  };
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
