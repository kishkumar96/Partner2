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

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse bounding box
    const bboxStr = searchParams.get('bbox');
    if (!bboxStr) {
      return NextResponse.json({ error: 'Missing bbox parameter' }, { status: 400 });
    }

    const bbox = bboxStr.split(',').map(Number) as [number, number, number, number];
    if (bbox.length !== 4 || bbox.some(isNaN)) {
      return NextResponse.json({ error: 'Invalid bbox format' }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = bbox;
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);

    // Parse country code (default to VU for backward compatibility)
    const country = (searchParams.get('country') || 'VU').toUpperCase();

    // Connect to database
    const client = new Client({ connectionString: DATABASE_URL });
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
        [country, minLat, maxLat, minLng, maxLng, limit]
      );

      // Transform to GeoJSON LineString features
      const features = result.rows.map((row: any) => ({
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
        bbox,
        country: country,
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error('Roads API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
