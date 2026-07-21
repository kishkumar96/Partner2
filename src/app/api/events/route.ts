import { NextRequest, NextResponse } from 'next/server';
import { COUNTRIES, type CountryCode } from '@/types/thredds';
import { createPartnerEventId, type EventRecord } from '@/data/eventRecords';
import {
  isPartnerApiCountryEnabled,
  isPartnerApiEnabled,
  mapCountryPartnerApis,
} from '@/services/partnerApiService';

function resolveCountryCode(value: string | null): CountryCode | null {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized === 'VU' || normalized === 'WS' || normalized === 'TO' || normalized === 'CK'
    ? normalized
    : null;
}

function toArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object'
    );
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as any).results)) {
    return (payload as any).results.filter(
      (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object'
    );
  }

  return [];
}

async function fetchPartnerCollection(url: string): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (Array.isArray(payload)) {
      return toArrayPayload(payload);
    }

    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
      return toArrayPayload(payload);
    }

    const results = [...toArrayPayload((payload as any).results)];
    let nextUrl = typeof (payload as any).next === 'string' ? (payload as any).next : null;
    let safetyCounter = 0;

    while (nextUrl && safetyCounter < 20) {
      safetyCounter += 1;
      const nextResponse = await fetch(nextUrl, { cache: 'no-store' });
      if (!nextResponse.ok) {
        break;
      }
      const nextPayload = await nextResponse.json();
      results.push(...toArrayPayload(nextPayload));
      nextUrl =
        nextPayload &&
        typeof nextPayload === 'object' &&
        typeof (nextPayload as any).next === 'string'
          ? (nextPayload as any).next
          : null;
    }

    return results;
  } catch {
    return [];
  }
}

function normalizeDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizePartnerEventRow(
  countryCode: CountryCode,
  row: Record<string, unknown>
): EventRecord | null {
  const country = COUNTRIES[countryCode];
  const name =
    (typeof row.event_name === 'string' && row.event_name.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.title === 'string' && row.title.trim()) ||
    (typeof row.cyclone_name === 'string' && row.cyclone_name.trim()) ||
    '';
  const explicitId =
    (typeof row.id === 'number' && Number.isFinite(row.id) ? String(row.id) : '') ||
    (typeof row.id === 'string' && row.id.trim()) ||
    (typeof row.event_id === 'string' && row.event_id.trim()) ||
    (typeof row.eventId === 'string' && row.eventId.trim()) ||
    (typeof row.cyclone_id === 'string' && row.cyclone_id.trim()) ||
    '';
  const cycloneTrackId =
    (typeof row.cyclone_track === 'number' && Number.isFinite(row.cyclone_track)
      ? String(row.cyclone_track)
      : '') ||
    (typeof row.cyclone_track === 'string' && row.cyclone_track.trim()) ||
    '';
  const backendHazardIds = Array.isArray(row.hazards)
    ? row.hazards
        .map(value =>
          typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : typeof value === 'string' && value.trim()
              ? value.trim()
              : null
        )
        .filter((value): value is string => value !== null)
    : [];
  const backendRiskIds = Array.isArray(row.risks)
    ? row.risks
        .map(value =>
          typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : typeof value === 'string' && value.trim()
              ? value.trim()
              : null
        )
        .filter((value): value is string => value !== null)
    : [];
  const date = normalizeDate(
    (typeof row.event_datetime === 'string' && row.event_datetime.trim()) ||
      (typeof row.event_date === 'string' && row.event_date.trim()) ||
      (typeof row.date === 'string' && row.date.trim()) ||
      (typeof row.issued_time === 'string' && row.issued_time.trim()) ||
      (typeof row.timestamp === 'string' && row.timestamp.trim()) ||
      ''
  );

  if (!name && !explicitId) {
    return null;
  }

  return {
    id: explicitId || createPartnerEventId(countryCode, name || country.name, date),
    countryCode,
    name: name || country.name,
    date,
    hazardId: 'tropical-cyclone',
    backendEventId: explicitId || undefined,
    backendCycloneTrackId: cycloneTrackId || undefined,
    backendHazardIds,
    backendRiskIds,
    location: { lat: country.center[1], lng: country.center[0] },
    bbox: [
      country.center[0] - 1,
      country.center[1] - 1,
      country.center[0] + 1,
      country.center[1] + 1,
    ],
    source: 'partner_api',
  };
}

async function fetchPartnerEvents(countryCode: CountryCode): Promise<EventRecord[]> {
  if (!isPartnerApiEnabled() || !isPartnerApiCountryEnabled(countryCode)) {
    return [];
  }

  try {
    const mapping = await mapCountryPartnerApis(countryCode);
    if (!mapping.scopedUrls) {
      return [];
    }

    const rows = await fetchPartnerCollection(mapping.scopedUrls.event);
    return rows
      .filter(row => {
        const rowCountryId =
          typeof row.country === 'number'
            ? row.country
            : typeof row.country === 'string'
              ? Number(row.country)
              : null;
        return rowCountryId === mapping.countryId;
      })
      .map(row => normalizePartnerEventRow(countryCode, row))
      .filter((record): record is EventRecord => record !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const countryCode = resolveCountryCode(new URL(request.url).searchParams.get('country'));
  if (!countryCode) {
    return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
  }

  const partnerEvents = await fetchPartnerEvents(countryCode);
  const usePartnerOnly = isPartnerApiEnabled() && isPartnerApiCountryEnabled(countryCode);

  return NextResponse.json({
    country: countryCode,
    events: usePartnerOnly ? partnerEvents : [],
    source: usePartnerOnly ? 'partner_api' : 'local',
  });
}
