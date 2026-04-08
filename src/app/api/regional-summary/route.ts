/**
 * API Route: Get regional summary data
 *
 * Query Parameters:
 *   - country: Country code filter (e.g., 'WS' for Samoa, 'VU' for Vanuatu)
 *
 * Example:
 *   /api/regional-summary?country=WS
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
      '/api/regional-summary'
    );
    if (authResponse) return authResponse;

    const query = `
      SELECT 
        region as "Region",
        total_population as "Total_Population",
        exposed_population as "Population_Exposed_To_Any_Hazard",
        total_loss as "Total_Loss",
        total_value as "Total_Exposed_Value_To_Any_Hazard",
        damaged_buildings as "Damaged_Buildings",
        total_buildings as "Total_Buildings"
      FROM regional_impacts
      WHERE country_code = $1
      ORDER BY total_loss DESC NULLS LAST
    `;

    const result = await db.query(query, [countryCode]);

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length,
      country: countryCode,
    });
  } catch (error) {
    console.error('Error fetching regional summary:', error);
    return NextResponse.json({ error: 'Failed to fetch regional summary data' }, { status: 500 });
  }
}
