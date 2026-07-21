import type { CountryCode } from '@/types/thredds';
import { COUNTRIES } from '@/types/thredds';

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

const LOCAL_EVENT_RECORDS: Record<CountryCode, EventRecord[]> = {
  VU: [
    {
      id: 'tc-lola-2024',
      countryCode: 'VU',
      name: 'Tropical Cyclone Lola',
      date: '2024-01-30',
      hazardId: 'tropical-cyclone',
      location: { lat: -17.7333, lng: 168.3167 },
      bbox: [165, -21, 170, -13],
      trackFile: 'cyclone-track.geojson',
      hazardLayerIds: ['vu-tc-lola-wind', 'vu-tc-lola-inundation', 'vu-tc-lola-flood-depth'],
      source: 'local',
      isDefault: true,
      aliases: ['lola', 'tropical cyclone lola'],
    },
  ],
  WS: [
    {
      id: 'tc-gita-samoa-2018',
      countryCode: 'WS',
      name: 'Tropical Cyclone Gita',
      date: '2018-02-09',
      hazardId: 'tropical-cyclone',
      location: { lat: -13.759, lng: -172.1046 },
      bbox: [-173, -15, -171, -13],
      trackFile: 'cyclone-track.geojson',
      hazardLayerIds: ['ws-tc-gita-wind', 'ws-tc-gita-flood'],
      source: 'local',
      isDefault: true,
      aliases: ['gita', 'tropical cyclone gita'],
    },
  ],
  TO: [
    {
      id: 'tc-harold-tonga-2020',
      countryCode: 'TO',
      name: 'Tropical Cyclone Harold',
      date: '2020-04-09',
      hazardId: 'tropical-cyclone',
      location: { lat: -21.179, lng: -175.198 },
      bbox: [-177, -23, -173, -18],
      trackFile: 'cyclone-track.geojson',
      hazardLayerIds: ['to-tc-harold-wind', 'to-tc-harold-flood'],
      source: 'local',
      isDefault: true,
      aliases: ['harold', 'tropical cyclone harold'],
    },
  ],
  CK: [
    {
      id: 'tc-ck-event',
      countryCode: 'CK',
      name: 'Tropical Cyclone Event',
      date: '2024-01-01',
      hazardId: 'tropical-cyclone',
      location: { lat: -21.2367, lng: -159.7777 },
      bbox: [-161, -23, -157, -18],
      trackFile: 'cyclone-track.geojson',
      hazardLayerIds: ['ck-tc-meena-wind', 'ck-tc-meena-flood'],
      source: 'local',
      isDefault: true,
      aliases: ['cook islands tropical cyclone'],
    },
  ],
};

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
  return filteredRecords[0] ?? availableRecords[0] ?? getDefaultEventRecord(countryCode);
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
    return rightDate.localeCompare(leftDate);
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
