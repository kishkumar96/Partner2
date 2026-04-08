/**
 * API Route: Get aggregated statistics
 *
 * Query Parameters:
 *   - type: Statistics type (national|regional|sector|asset_type)
 *   - group_by: Group results by field (optional)
 *
 * Example:
 *   /api/stats?type=sector
 *   /api/stats?type=regional&group_by=region_name
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import cache, { cacheKey, CachePrefix, CacheTTL } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || 'national';
    const groupBy = searchParams.get('group_by');

    // Generate cache key
    const key = cacheKey(CachePrefix.STATS, type, groupBy || 'none');

    // Try cache
    const cached = await cache.get(key);
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }

    let result;

    switch (type) {
      case 'national':
        result = await db.query(`
          SELECT 
            SUM(total_buildings) as total_buildings,
            SUM(damaged_buildings) as damaged_buildings,
            SUM(total_loss) as total_loss,
            SUM(affected_population) as affected_population,
            ROUND(
              SUM(damaged_buildings)::numeric / NULLIF(SUM(total_buildings), 0) * 100,
              2
            ) as damage_percentage
          FROM national_summary
        `);
        break;

      case 'regional':
        const regionalGroupBy = groupBy || 'region_name';
        result = await db.query(`
          SELECT 
            ${regionalGroupBy},
            SUM(total_buildings) as total_buildings,
            SUM(damaged_buildings) as damaged_buildings,
            SUM(total_loss) as total_loss,
            SUM(affected_population) as affected_population,
            ROUND(
              SUM(damaged_buildings)::numeric / NULLIF(SUM(total_buildings), 0) * 100,
              2
            ) as damage_percentage
          FROM regional_summary
          GROUP BY ${regionalGroupBy}
          ORDER BY total_loss DESC
        `);
        break;

      case 'sector':
        result = await db.query(`
          SELECT 
            sector,
            SUM(total_assets) as total_assets,
            SUM(damaged_assets) as damaged_assets,
            SUM(total_loss) as total_loss,
            SUM(gdp_impact) as gdp_impact,
            SUM(jobs_affected) as jobs_affected,
            ROUND(
              SUM(damaged_assets)::numeric / NULLIF(SUM(total_assets), 0) * 100,
              2
            ) as damage_percentage
          FROM impact_by_sector
          GROUP BY sector
          ORDER BY total_loss DESC
        `);
        break;

      case 'asset_type':
        result = await db.query(`
          SELECT 
            asset_type,
            SUM(total_assets) as total_assets,
            SUM(damaged_assets) as damaged_assets,
            SUM(total_loss) as total_loss,
            ROUND(
              SUM(damaged_assets)::numeric / NULLIF(SUM(total_assets), 0) * 100,
              2
            ) as damage_percentage
          FROM impact_by_asset_type
          GROUP BY asset_type
          ORDER BY total_loss DESC
        `);
        break;

      case 'damage_level':
        result = await db.query(`
          SELECT 
            damage_level,
            COUNT(*) as building_count,
            SUM(total_loss) as total_loss,
            AVG(total_loss) as avg_loss
          FROM damaged_buildings
          GROUP BY damage_level
          ORDER BY 
            CASE damage_level
              WHEN 'Severe' THEN 1
              WHEN 'Major' THEN 2
              WHEN 'Moderate' THEN 3
              WHEN 'Minor' THEN 4
              ELSE 5
            END
        `);
        break;

      default:
        return NextResponse.json({ error: 'Invalid stats type' }, { status: 400 });
    }

    const response = {
      type,
      data: type === 'national' ? result.rows[0] : result.rows,
      count: result.rows.length,
    };

    // Cache result
    await cache.set(key, response, CacheTTL.LONG);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
