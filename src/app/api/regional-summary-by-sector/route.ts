/**
 * API Route: Get regional summary by sector data
 *
 * Query Parameters:
 *   - country: Country code filter (e.g., 'WS' for Samoa, 'VU' for Vanuatu)
 *
 * Example:
 *   /api/regional-summary-by-sector?country=WS
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { resolveCountryCode } from '@/lib/countryAuth';
import { ensureCountryApiAccessEnhanced } from '@/lib/countryApiAuth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = resolveCountryCode(searchParams.get('country') || 'VU');
    if (!countryCode) {
      return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
    }

    const authResponse = await ensureCountryApiAccessEnhanced(
      request,
      countryCode,
      '/api/regional-summary-by-sector'
    );
    if (authResponse) return authResponse;

    const query = `
      SELECT 
        region as "Region",
        sector as "Sector",
        total_loss as "Total_Loss",
        damaged_buildings as "Number_Exposed_Buildings",
        building_loss + road_loss + infrastructure_loss + crop_loss as "Total_Wind_Loss",
        exposed_population as "Population_Exposed"
      FROM impact_by_sector
      WHERE country_code = $1
      ORDER BY region, total_loss DESC NULLS LAST
    `;

    const result = await db.query(query, [countryCode]);

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length,
      country: countryCode,
    });
  } catch (error) {
    console.error('Error fetching regional summary by sector:', error);
    return NextResponse.json(
      { error: 'Failed to fetch regional summary by sector data' },
      { status: 500 }
    );
  }
}
