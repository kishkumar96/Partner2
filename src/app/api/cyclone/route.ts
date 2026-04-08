/**
 * API Route: Get cyclone track and forecast
 *
 * Query Parameters:
 *   - cyclone_id: Filter by cyclone ID (optional)
 *   - include_forecast: Include forecast points (default: true)
 *   - limit: Maximum number of points (default: 1000)
 *
 * Example:
 *   /api/cyclone
 *   /api/cyclone?include_forecast=false
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import cache, { cacheKey, CacheTTL } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const cycloneId = searchParams.get('cyclone_id');
    const includeForecast = searchParams.get('include_forecast') !== 'false';
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);

    // Generate cache key
    const key = cacheKey(
      'cyclone',
      cycloneId || 'all',
      includeForecast ? 'with-forecast' : 'no-forecast',
      limit
    );

    // Try cache
    const cached = await cache.get(key);
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }

    // Build query
    let query = `
      SELECT 
        cyclone_id,
        cyclone_name,
        latitude,
        longitude,
        timestamp,
        wind_speed,
        pressure,
        category,
        forecast
      FROM cyclone_track
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (cycloneId) {
      query += ` AND cyclone_id = $${paramIndex}`;
      params.push(cycloneId);
      paramIndex++;
    }

    if (!includeForecast) {
      query += ` AND forecast = FALSE`;
    }

    query += ` ORDER BY timestamp ASC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Transform to GeoJSON
    const features = result.rows.map((row: any) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.longitude, row.latitude],
      },
      properties: {
        cyclone_id: row.cyclone_id,
        cyclone_name: row.cyclone_name,
        timestamp: row.timestamp,
        wind_speed: row.wind_speed,
        pressure: row.pressure,
        category: row.category,
        forecast: row.forecast,
      },
    }));

    // Separate into historical and forecast
    const historical = features.filter(f => !f.properties.forecast);
    const forecast = features.filter(f => f.properties.forecast);

    const response = {
      type: 'FeatureCollection',
      features,
      historical: {
        type: 'FeatureCollection',
        features: historical,
        count: historical.length,
      },
      forecast: includeForecast
        ? {
            type: 'FeatureCollection',
            features: forecast,
            count: forecast.length,
          }
        : undefined,
      count: features.length,
    };

    // Cache result (shorter TTL since cyclone data may update)
    await cache.set(key, response, CacheTTL.SHORT);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Cyclone API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
