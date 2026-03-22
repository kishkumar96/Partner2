/**
 * API Route: Get damaged buildings within bounding box
 *
 * Query Parameters:
 *   - bbox: Bounding box [minLng,minLat,maxLng,maxLat]
 *   - limit: Maximum number of results (default: 1000)
 *   - offset: Pagination offset (default: 0)
 *
 * Example:
 *   /api/buildings?bbox=166.8,-15.5,167.1,-15.2&limit=500
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
    message.includes('timeout expired') ||
    message.includes('connection timeout')
  );
}

function maybeLogDbError(error: unknown): void {
  const now = Date.now();
  if (now - lastDbErrorLogAt >= DB_LOG_THROTTLE_MS) {
    lastDbErrorLogAt = now;
    console.error('Buildings API DB connectivity error:', error);
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
      return NextResponse.json(
        { error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' },
        { status: 400 }
      );
    }
    const [minLng, minLat, maxLng, maxLat] = bbox;

    // Parse pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Parse country code (default to VU for backward compatibility)
    countryCode = resolveCountryCode(searchParams.get('country') || 'VU');
    if (!countryCode) {
      return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
    }

    // If DB recently failed, short-circuit to avoid repeated timeouts and log spam.
    if (Date.now() < dbUnavailableUntil) {
      return NextResponse.json(
        {
          type: 'FeatureCollection',
          features: [],
          count: 0,
          bbox,
          country: countryCode,
          degraded: true,
          message: 'Building data temporarily unavailable',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Data-Status': 'degraded',
          },
        }
      );
    }

    const authResponse = await ensureCountryApiAccessEnhanced(
      request,
      countryCode,
      '/api/buildings'
    );
    if (authResponse) return authResponse;

    const client = new Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
      query_timeout: DB_QUERY_TIMEOUT_MS,
      statement_timeout: DB_QUERY_TIMEOUT_MS,
    });
    await client.connect();

    try {
      // Query buildings within bounding box filtered by country
      const result = await client.query(
        `SELECT 
          id,
          latitude,
          longitude,
          wind_loss,
          exposure,
          damage_ratio,
          building_type,
          occupancy,
          country_code
         FROM damaged_buildings
         WHERE country_code = $1
           AND longitude BETWEEN $2 AND $3
           AND latitude BETWEEN $4 AND $5
         ORDER BY wind_loss DESC NULLS LAST
         LIMIT $6 OFFSET $7`,
        [countryCode, minLng, maxLng, minLat, maxLat, limit, offset]
      );

      // Transform to GeoJSON
      const features = result.rows.map(row => ({
        type: 'Feature',
        id: row.id,
        geometry: {
          type: 'Point',
          coordinates: [row.longitude, row.latitude],
        },
        properties: {
          Wind_Loss: row.wind_loss,
          Exposure: row.exposure,
          Damage_Ratio: row.damage_ratio,
          Building_Type: row.building_type,
          Occupancy: row.occupancy,
        },
      }));

      const response = {
        type: 'FeatureCollection',
        features,
        count: features.length,
        bbox,
        country: countryCode,
      };

      return NextResponse.json(response);
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
          message: 'Building data temporarily unavailable',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Data-Status': 'degraded',
          },
        }
      );
    }

    console.error('Buildings API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
