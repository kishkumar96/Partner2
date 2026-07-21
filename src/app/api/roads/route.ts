/**
 * API Route: Get damaged roads within bounding box
 *
 * Query Parameters:
 *   - bbox: Bounding box [minLng,minLat,maxLng,maxLat]
 *   - limit: Maximum number of results (default: 1000)
 *
 * Example:
 *   /api/roads?bbox=166.8,-15.5,167.1,-15.2&limit=100
 */

import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import { resolveCountryCode } from '@/lib/countryAuth';
import { ensureCountryApiAccessEnhanced } from '@/lib/countryApiAuth';
import type { CountryCode } from '@/types/thredds';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

const DB_CONNECT_TIMEOUT_MS = 500;
const DB_QUERY_TIMEOUT_MS = 5000;
const DB_FAILURE_COOLDOWN_MS = 30_000;
const DB_LOG_THROTTLE_MS = 10_000;

let dbUnavailableUntil = 0;
let lastDbErrorLogAt = 0;

interface RoadRow {
  id: number | string;
  road_name: string | null;
  damage: number | null;
  road_type: string | null;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
}

function isDbConnectivityError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException | { code?: string; message?: string };
  const code = err?.code;
  const message = (err?.message || '').toLowerCase();
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNRESET' ||
    // pg can surface timeout without an errno code
    message.includes('timeout expired') ||
    message.includes('connection timeout')
  );
}

function maybeLogDbError(error: unknown): void {
  const now = Date.now();
  if (now - lastDbErrorLogAt >= DB_LOG_THROTTLE_MS) {
    lastDbErrorLogAt = now;
    console.error('Roads API DB connectivity error:', error);
  }
}

export async function GET(request: NextRequest) {
  let bbox: [number, number, number, number] | null = null;
  let countryCode: CountryCode | null = null;

  try {
    const { searchParams } = new URL(request.url);

    // Parse bounding box
    const bboxStr = searchParams.get('bbox');
    if (!bboxStr) {
      return NextResponse.json({ error: 'Missing bbox parameter' }, { status: 400 });
    }

    bbox = bboxStr.split(',').map(Number) as [number, number, number, number];
    if (bbox.length !== 4 || bbox.some(isNaN)) {
      return NextResponse.json({ error: 'Invalid bbox format' }, { status: 400 });
    }

    const eventId = searchParams.get('event_id');
    const dateStart = searchParams.get('date_start');
    const dateEnd = searchParams.get('date_end');
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);

    // Parse country code (default to VU for backward compatibility)
    countryCode = resolveCountryCode(searchParams.get('country') || 'VU');
    if (!countryCode) {
      return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
    }

    const effectiveBbox = bbox;
    const [minLng, minLat, maxLng, maxLat] = effectiveBbox;

    // If DB recently failed, short-circuit to avoid repeated timeouts and log spam.
    if (Date.now() < dbUnavailableUntil) {
      return NextResponse.json(
        {
          type: 'FeatureCollection',
          features: [],
          count: 0,
          bbox: effectiveBbox,
          country: countryCode,
          degraded: true,
          message: 'Road data temporarily unavailable',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Data-Status': 'degraded',
          },
        }
      );
    }

    const authResponse = await ensureCountryApiAccessEnhanced(request, countryCode, '/api/roads');
    if (authResponse) return authResponse;

    // Connect to database
    const client = new Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
      query_timeout: DB_QUERY_TIMEOUT_MS,
      statement_timeout: DB_QUERY_TIMEOUT_MS,
    });
    await client.connect();

    try {
      // Query roads within bounding box filtered by country
      const result = await client.query(
        `SELECT 
           id, road_name, damage, road_type,
           start_lat, start_lon, end_lat, end_lon, country_code
         FROM damaged_roads
         WHERE country_code = $1
           AND (
             (start_lat BETWEEN $2 AND $3 AND start_lon BETWEEN $4 AND $5)
             OR
             (end_lat BETWEEN $2 AND $3 AND end_lon BETWEEN $4 AND $5)
           )
         ORDER BY damage DESC NULLS LAST
         LIMIT $6`,
        [countryCode, minLat, maxLat, minLng, maxLng, limit]
      );

      // Transform to GeoJSON LineString features
      const features = result.rows.map((row: RoadRow) => ({
        type: 'Feature',
        id: row.id,
        geometry: {
          type: 'LineString',
          coordinates: [
            [row.start_lon, row.start_lat],
            [row.end_lon, row.end_lat],
          ],
        },
        properties: {
          road_name: row.road_name,
          Total_Loss: Number(row.damage) || 0,
          road_type: row.road_type,
          region: 'Vanuatu', // Default region for table display
        },
      }));

      return NextResponse.json({
        type: 'FeatureCollection',
        features,
        count: features.length,
        bbox: effectiveBbox,
        country: countryCode,
        event_id: eventId ?? undefined,
        date_start: dateStart ?? undefined,
        date_end: dateEnd ?? undefined,
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    if (isDbConnectivityError(error)) {
      dbUnavailableUntil = Date.now() + DB_FAILURE_COOLDOWN_MS;
      maybeLogDbError(error);

      return NextResponse.json(
        {
          type: 'FeatureCollection',
          features: [],
          count: 0,
          bbox: bbox ?? undefined,
          country: countryCode ?? undefined,
          degraded: true,
          message: 'Road data temporarily unavailable',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Data-Status': 'degraded',
          },
        }
      );
    }

    console.error('Roads API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
