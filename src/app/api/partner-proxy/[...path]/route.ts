import { NextRequest, NextResponse } from 'next/server';

const PARTNER_API_BASE = 'https://opmthredds.gem.spc.int/partner_api/v1';

/**
 * Next.js API proxy to bypass CORS restrictions for Partner API requests.
 * 
 * This route proxies all requests to the Partner API, adding appropriate headers
 * and handling errors gracefully.
 * 
 * Usage: /api/partner-proxy/country/ -> https://opmthredds.gem.spc.int/partner_api/v1/country/
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Next.js 15+ requires awaiting params
    const { path: pathArray } = await params;
    const path = pathArray.join('/');
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${PARTNER_API_BASE}/${path}${searchParams ? `?${searchParams}` : ''}`;

    console.log(`[Partner Proxy] Proxying: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Climate-Dashboard/1.0',
      },
      // 30 second timeout
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[Partner Proxy] Error ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: `Partner API returned ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return with CORS headers enabled
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[Partner Proxy] Request failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown proxy error',
        details: 'Failed to fetch data from Partner API'
      },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  // Handle preflight CORS requests
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
