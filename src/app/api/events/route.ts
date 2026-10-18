import { NextRequest, NextResponse } from 'next/server';
import type { CountryCode } from '@/types/thredds';
import type { EventRecord } from '@/data/eventRecords';
import { normalizePartnerEventRecords } from '@/utils/partnerEvents';
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

const FETCH_TIMEOUT_MS = 10_000;

async function fetchPartnerCollection(url: string): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
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
      const nextResponse = await fetch(nextUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
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
      .flatMap(row => normalizePartnerEventRecords(countryCode, row));
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
