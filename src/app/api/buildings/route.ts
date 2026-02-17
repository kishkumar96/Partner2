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

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

export async function GET(request: NextRequest) {
  let client: Client | null = null;

  try {
    const { searchParams } = new URL(request.url);

    // Parse bounding box
    const bboxStr = searchParams.get('bbox');
    if (!bboxStr) {
      return NextResponse.json({ error: 'Missing bbox parameter' }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = bboxStr.split(',').map(Number);
    if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
      return NextResponse.json(
        { error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' },
        { status: 400 }
      );
    }

    // Parse pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 5000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Parse country code (default to VU for backward compatibility)
    const country = (searchParams.get('country') || 'VU').toUpperCase();

    // Connect to database
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

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
      [country, minLng, maxLng, minLat, maxLat, limit, offset]
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
      bbox: [minLng, minLat, maxLng, maxLat],
      country: country,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Buildings API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.end();
    }
  }
}
