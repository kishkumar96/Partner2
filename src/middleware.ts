import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import type { CountryCode } from '@/types/thredds';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/') {
    const country = searchParams.get('country') as CountryCode | null;
    const slug = country ? CODE_TO_SLUG[country] : 'vanuatu';

    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = `/${slug}`;
    nextUrl.searchParams.delete('country');
    return NextResponse.redirect(nextUrl);
  }

  if (pathname.endsWith('.geojson') || pathname.endsWith('.csv')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    response.headers.set('Content-Encoding', 'gzip');
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Server-Timing', 'middleware;dur=0');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
