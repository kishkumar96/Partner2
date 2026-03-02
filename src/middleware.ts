import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCountrySlugFromCode } from '@/utils/countrySlug';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/') {
    const country = searchParams.get('country');
    const slug = country !== null ? getCountrySlugFromCode(country) : null;

    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = `/${slug ?? 'vanuatu'}`;
    nextUrl.searchParams.delete('country');
    return NextResponse.redirect(nextUrl);
  }

  if (pathname.endsWith('.geojson') || pathname.endsWith('.csv')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
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
