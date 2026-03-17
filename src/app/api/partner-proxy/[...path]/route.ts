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

    // Uncomment for debugging: console.log(`[Partner Proxy] Proxying: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Climate-Dashboard/1.0',
      },
      // 10 second timeout (API on private network, fail fast if unreachable)
      signal: AbortSignal.timeout(10000),
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
    // Connection failures and timeouts are expected when API is on private network
    const isTimeout = error instanceof Error && (
      error.name === 'TimeoutError' || 
      error.message.includes('Connect Timeout') ||
      (error as any).code === 'UND_ERR_CONNECT_TIMEOUT'
    );
    
    const isConnectionError = error instanceof Error && (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    );
    
    // Suppress verbose logging for expected network failures
    if (isTimeout || isConnectionError) {
      // Silent - these are expected when Partner API is unreachable
    } else {
      console.error('[Partner Proxy] Unexpected error:', error);
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown proxy error',
        details: (isTimeout || isConnectionError)
          ? 'Partner API not accessible from this network' 
          : 'Failed to fetch data from Partner API'
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
