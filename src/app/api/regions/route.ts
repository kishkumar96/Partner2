/**
 * API Route: Get regional impacts
 *
 * Query Parameters:
 *   - region_id: Filter by specific region (optional)
 *   - min_damage_ratio: Minimum damage ratio filter (optional)
 *
 * Example:
 *   /api/regions?min_damage_ratio=0.3
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import cache, { cacheKey, CachePrefix, CacheTTL } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const regionId = searchParams.get('region_id');
    const minDamageRatio = searchParams.get('min_damage_ratio');

    // Generate cache key
    const key = cacheKey(CachePrefix.REGIONS, regionId || 'all', minDamageRatio || 'all');

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
        region_id,
        region_name,
        ST_AsGeoJSON(geom)::json as geometry,
        total_buildings,
        damaged_buildings,
        damage_ratio,
        total_loss,
        affected_population,
        sector_count,
        sectoral_loss_total
      FROM regional_summary_geo
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (regionId) {
      query += ` AND region_id = $${paramIndex}`;
      params.push(regionId);
      paramIndex++;
    }

    if (minDamageRatio) {
      query += ` AND damage_ratio >= $${paramIndex}`;
      params.push(parseFloat(minDamageRatio));
      paramIndex++;
    }

    query += ` ORDER BY total_loss DESC`;

    const result = await db.query(query, params);

    // Transform to GeoJSON
    const features = result.rows.map((row: any) => ({
      type: 'Feature',
      id: row.region_id,
      geometry: row.geometry,
      properties: {
        region_id: row.region_id,
        region_name: row.region_name,
        total_buildings: row.total_buildings,
        damaged_buildings: row.damaged_buildings,
        damage_ratio: row.damage_ratio,
        total_loss: row.total_loss,
        affected_population: row.affected_population,
        sector_count: row.sector_count,
        sectoral_loss_total: row.sectoral_loss_total,
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
    console.error('Regions API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
