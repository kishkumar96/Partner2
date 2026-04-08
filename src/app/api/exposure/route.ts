/**
 * API Route: Get exposure clusters
 *
 * Query Parameters:
 *   - min_exposure: Minimum exposure value filter (optional)
 *   - region: Filter by region (optional)
 *   - limit: Maximum number of results (default: 1000)
 *
 * Example:
 *   /api/exposure?min_exposure=1000000
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import cache, { cacheKey, CachePrefix, CacheTTL } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const minExposure = searchParams.get('min_exposure');
    const region = searchParams.get('region');
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);

    // Generate cache key
    const key = cacheKey(
      CachePrefix.STATS,
      'exposure',
      minExposure || 'all',
      region || 'all',
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
        cluster_id,
        ST_AsGeoJSON(geom)::json as geometry,
        exposure_value,
        building_count,
        region
      FROM exposure_clusters
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (minExposure) {
      query += ` AND exposure_value >= $${paramIndex}`;
      params.push(parseFloat(minExposure));
      paramIndex++;
    }

    if (region) {
      query += ` AND region = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    query += ` ORDER BY exposure_value DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Transform to GeoJSON
    const features = result.rows.map((row: any) => ({
      type: 'Feature',
      id: row.cluster_id,
      geometry: row.geometry,
      properties: {
        cluster_id: row.cluster_id,
        exposure_value: row.exposure_value,
        building_count: row.building_count,
        region: row.region,
      },
    }));

    const response = {
      type: 'FeatureCollection',
      features,
      count: features.length,
    };

    // Cache result
    await cache.set(key, response, CacheTTL.LONG);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Exposure API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
