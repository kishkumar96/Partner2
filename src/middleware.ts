import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for optimizing data file delivery
 * - Adds aggressive caching headers for static data
 * - Enables compression hints
 * - Adds performance headers
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle data file requests
  if (pathname.endsWith('.geojson') || pathname.endsWith('.csv')) {
    const response = NextResponse.next();

    // Aggressive caching for data files (1 hour, revalidate in background for 24 hours)
    response.headers.set(
      'Cache-Control',
      'public, max-age=3600, stale-while-revalidate=86400'
    );

    // Enable compression
    response.headers.set('Content-Encoding', 'gzip');
    
    // CORS for data access
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // Performance hints
    response.headers.set('X-Content-Type-Options', 'nosniff');
    
    // Timing headers to help debug performance
    response.headers.set('Server-Timing', `middleware;dur=0`);

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
