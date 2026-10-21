import type { CountryCode } from '@/types/thredds';
import { COUNTRIES } from '@/types/thredds';
import { getStaticEvents, getStaticLayerCatalog, listCountryCodes } from '@/config/registry';

export interface EventRecord {
  id: string;
  countryCode: CountryCode;
  name: string;
  date: string;
  hazardId: string;
  backendEventId?: string;
  backendCycloneTrackId?: string;
  backendHazardIds?: string[];
  backendRiskIds?: string[];
  /** Event type name from the Partner API, e.g. "Tropical Cyclone", "Earthquake" */
  eventType?: string;
  /** Storm name from the Event's cyclone track (the event title can carry extra wording). */
  cycloneName?: string;
  /** Metadata supplied by the Partner API for operational forecast events. */
  isForecast?: boolean;
  dataSource?: string;
  trackIssuedTime?: string;
  modelRunStatus?: string;
  modelRunFinishedAt?: string;
  modelRunCreatedAt?: string;
  /** Why a run failed or was superseded, as recorded by the middleware. */
  modelRunError?: string;
  /** Set when this record is one advisory's run of a storm's Event. */
  forecastRunId?: string;
  location: {
    lat: number;
    lng: number;
  };
  bbox: [number, number, number, number];
  trackFile?: string;
  forecastFile?: string;
  hazardLayerIds?: string[];
  source: 'local' | 'partner_api';
  isDefault?: boolean;
  aliases?: string[];
}

// The approved fallback events live in config/events/<country>.json. A country's layers point at their
// event through `eventId`, so an event's layers are found from there, not copied by hand into the event.
const LOCAL_EVENT_RECORDS = Object.fromEntries(
  listCountryCodes().map(countryCode => {
    const layers = getStaticLayerCatalog(countryCode)?.layers ?? [];
    const records: EventRecord[] = getStaticEvents(countryCode).map(event => ({
      ...event,
      countryCode,
      hazardLayerIds: layers.filter(layer => layer.eventId === event.id).map(layer => layer.id),
      source: 'local',
    }));
    return [countryCode, records];
  })
) as Record<CountryCode, EventRecord[]>;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeEventLabel(value: string): string {
  return normalizeText(value)
    .replace(/\b(tropical|cyclone|storm|event|tc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function getLocalEventRecords(countryCode: CountryCode): EventRecord[] {
  return [...(LOCAL_EVENT_RECORDS[countryCode] ?? [])];
}

export function getDefaultEventRecord(countryCode: CountryCode): EventRecord {
  const records = getLocalEventRecords(countryCode);
  const fallback = records.find(record => record.isDefault) ?? records[0];

  if (fallback) {
    return fallback;
  }

  const country = COUNTRIES[countryCode];
  return {
    id: `${countryCode.toLowerCase()}-default-event`,
    countryCode,
    name: `${country.name} Tropical Cyclone`,
    date: '',
    hazardId: 'tropical-cyclone',
    location: { lat: country.center[1], lng: country.center[0] },
    bbox: [
      country.center[0] - 1,
      country.center[1] - 1,
      country.center[0] + 1,
      country.center[1] + 1,
    ],
    source: 'local',
    isDefault: true,
  };
}

export function getEventRecordById(eventId: string): EventRecord | null {
  const normalizedId = normalizeText(eventId);
  for (const countryCode of Object.keys(LOCAL_EVENT_RECORDS) as CountryCode[]) {
    const match = LOCAL_EVENT_RECORDS[countryCode].find(record => {
      if (record.id === eventId) {
        return true;
      }

      return [record.id, ...(record.aliases ?? [])].some(
        alias => normalizeText(alias) === normalizedId
      );
    });
    if (match) {
      return match;
    }
  }
  return null;
}

export function resolveEventRecords(
  countryCode: CountryCode,
  records: EventRecord[] | null | undefined
): EventRecord[] {
  const normalized = (records ?? []).filter(record => record.countryCode === countryCode);
  return normalized.length > 0 ? normalized : getLocalEventRecords(countryCode);
}

export function filterEventRecordsBySelection(
  records: EventRecord[],
  selectedEventIds: string[] = [],
  dateRange?: { start?: string; end?: string }
): EventRecord[] {
  const start = dateRange?.start?.trim() || '';
  const end = dateRange?.end?.trim() || '';

  return records.filter(record => {
    if (selectedEventIds.length > 0 && !selectedEventIds.includes(record.id)) {
      return false;
    }
    if (start && record.date && record.date < start) {
      return false;
    }
    if (end && record.date && record.date > end) {
      return false;
    }
    return true;
  });
}

export function resolveActiveEventRecord(
  countryCode: CountryCode,
  records: EventRecord[] | null | undefined,
  selectedEventIds: string[] = [],
  dateRange?: { start?: string; end?: string }
): EventRecord {
  const availableRecords = resolveEventRecords(countryCode, records);
  const filteredRecords = filterEventRecordsBySelection(
    availableRecords,
    selectedEventIds,
    dateRange
  );
  // With nothing chosen, a run that is pending, failed or superseded never
  // becomes the default while a usable one exists; an explicit pick still wins.
  const usable = (record: EventRecord) =>
    !record.modelRunStatus || record.modelRunStatus === 'complete';
  let pool = filteredRecords.length > 0 ? filteredRecords : availableRecords;
  if (selectedEventIds.length === 0 && pool.some(usable)) pool = pool.filter(usable);
  const issuedMs = (record: EventRecord) => {
    const ms = Date.parse(record.trackIssuedTime || '');
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  const ranked = [...pool].sort((left, right) => {
    // Newer storms remain the default. When forecasts and assessments share
    // a calendar day, however, prefer the completed post-event assessment.
    const dateOrder = (right.date || '').localeCompare(left.date || '');
    if (dateOrder !== 0) return dateOrder;
    const kindOrder = Number(Boolean(left.isForecast)) - Number(Boolean(right.isForecast));
    if (kindOrder !== 0) return kindOrder;
    // Advisories of one storm can share a day: the latest issue time leads
    return issuedMs(right) - issuedMs(left);
  });
  return ranked[0] ?? getDefaultEventRecord(countryCode);
}

export function mergeEventRecords(countryCode: CountryCode, records: EventRecord[]): EventRecord[] {
  const localRecords = getLocalEventRecords(countryCode);
  const merged = new Map<string, EventRecord>();

  localRecords.forEach(record => {
    merged.set(record.id, record);
  });

  records.forEach(record => {
    const existing = merged.get(record.id);
    merged.set(record.id, {
      ...(existing ?? getDefaultEventRecord(countryCode)),
      ...record,
      countryCode,
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftDate = left.date || '';
    const rightDate = right.date || '';
    const dateOrder = rightDate.localeCompare(leftDate);
    return dateOrder || Number(Boolean(left.isForecast)) - Number(Boolean(right.isForecast));
  });
}

export function createPartnerEventId(countryCode: CountryCode, name: string, date: string): string {
  const year = date ? date.slice(0, 4) : 'event';
  return `${slugify(`${countryCode} ${name}`)}-${year}`;
}

export function findMatchingLocalEventRecord(
  countryCode: CountryCode,
  candidate: { id?: string; name?: string }
): EventRecord | null {
  const records = getLocalEventRecords(countryCode);
  const normalizedId = candidate.id ? normalizeText(candidate.id) : '';
  const normalizedName = candidate.name ? normalizeText(candidate.name) : '';
  const normalizedEventName = candidate.name ? normalizeEventLabel(candidate.name) : '';

  return (
    records.find(record => {
      const nameMatch =
        normalizedName &&
        [record.name, ...(record.aliases ?? [])].some(
          alias => normalizeText(alias) === normalizedName
        );
      const fuzzyNameMatch =
        normalizedEventName &&
        [record.name, ...(record.aliases ?? [])].some(alias => {
          const normalizedAlias = normalizeEventLabel(alias);
          return (
            normalizedAlias === normalizedEventName ||
            normalizedAlias.includes(normalizedEventName) ||
            normalizedEventName.includes(normalizedAlias)
          );
        });
      const idMatch =
        normalizedId &&
        [record.id, ...(record.aliases ?? [])].some(alias => normalizeText(alias) === normalizedId);
      return nameMatch || fuzzyNameMatch || idMatch;
    }) ?? null
  );
}
