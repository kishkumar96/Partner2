import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCountrySlugFromCode, SLUG_TO_CODE } from '@/utils/countrySlug';
import {
  getCountryAuthCookieName,
  getCountryAuthSecret,
  getCountrySlugFromCode as getSlugFromCountryCode,
  isCountryAuthMisconfigured,
  isCountryProtected,
  resolveCountryCode,
  verifyCountrySessionToken,
} from '@/lib/countryAuth';
import { validateSecurityConfigOrThrow } from '@/lib/securityConfig';
import { getTenantCountryCodeFromEnv, getTenantCountrySlugFromEnv } from '@/utils/tenantCountry';

// Slugs that represent country dashboard routes
const COUNTRY_SLUGS = Object.keys(SLUG_TO_CODE);

const COUNTRY_SCOPED_API_PATHS = new Set([
  '/api/buildings',
  '/api/roads',
  '/api/regional-summary',
  '/api/regional-summary-by-sector',
]);

validateSecurityConfigOrThrow();

async function verifySessionInMiddleware(
  request: NextRequest,
  countryCode: string,
  countrySlug: string
): Promise<boolean> {
  const probeUrl = new URL('/api/auth/verify-session', request.nextUrl.origin);
  probeUrl.searchParams.set('country', countryCode);

  try {
    const response = await fetch(probeUrl.toString(), {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
        'x-auth-probe': '1',
      },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    // Fallback keeps route access available even if probe endpoint is temporarily unavailable.
    const authCookie = request.cookies.get(getCountryAuthCookieName(countrySlug));
    return authCookie ? verifyCountrySessionToken(authCookie.value, countrySlug) : false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const tenantCountryCode = getTenantCountryCodeFromEnv();
  const tenantCountrySlug = getTenantCountrySlugFromEnv();
  const isDev = process.env.NODE_ENV === 'development';

  const withDataAssetHeaders = () => {
    const response = NextResponse.next();
    // In dev, never cache data files to avoid stale 404s while iterating.
    response.headers.set(
      'Cache-Control',
      isDev ? 'no-store' : 'public, max-age=3600, stale-while-revalidate=86400'
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Server-Timing', 'middleware;dur=0');
    return response;
  };

  if (pathname === '/') {
    if (tenantCountrySlug) {
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = `/${tenantCountrySlug}`;
      nextUrl.searchParams.delete('country');
      return NextResponse.redirect(nextUrl);
    }

    const country = searchParams.get('country');
    if (country !== null) {
      const slug = getCountrySlugFromCode(country);
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = `/${slug ?? 'vanuatu'}`;
      nextUrl.searchParams.delete('country');
      return NextResponse.redirect(nextUrl);
    }

    return NextResponse.next();
  }

  // Country auth gate: check if this is a protected country dashboard route
  const pathSegments = pathname.split('/').filter(Boolean);
  const slug = pathSegments[0];
  const isCountryRoute = COUNTRY_SLUGS.includes(slug);
  const isLoginRoute = pathSegments[1] === 'login';
  const isApiRoute = pathname.startsWith('/api/');
  const isCountryDataAsset =
    isCountryRoute &&
    pathSegments.length > 1 &&
    /\.(csv|geojson|gpkg|json)$/i.test(pathSegments[pathSegments.length - 1] ?? '');

  // Country public data files (e.g. /tonga/regional-impacts.geojson) must bypass
  // route-level auth/tenant checks so they resolve from public/{country}/.
  if (isCountryDataAsset) {
    return withDataAssetHeaders();
  }

  if (tenantCountrySlug && isCountryRoute && slug !== tenantCountrySlug) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (isCountryRoute && !isLoginRoute && !isApiRoute) {
    const countryCode = SLUG_TO_CODE[slug];
    const countrySlug = getSlugFromCountryCode(countryCode);

    if (isCountryProtected(countryCode) && isCountryAuthMisconfigured(countryCode)) {
      console.error(`[auth] middleware misconfigured country=${countryCode}`);
      return new NextResponse('Country access is misconfigured.', { status: 503 });
    }

    if (isCountryProtected(countryCode) && !getCountryAuthSecret()) {
      return new NextResponse('COUNTRY_AUTH_SECRET is not configured.', { status: 503 });
    }

    if (isCountryProtected(countryCode)) {
      const isValid = await verifySessionInMiddleware(request, countryCode, countrySlug);
      if (!isValid) {
        console.warn(`[auth] middleware denied country_route slug=${slug}`);
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = `/${slug}/login`;
        loginUrl.search = '';
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  if (isApiRoute && COUNTRY_SCOPED_API_PATHS.has(pathname)) {
    const requestedCountryCode = resolveCountryCode(searchParams.get('country'));
    if (tenantCountryCode && requestedCountryCode && requestedCountryCode !== tenantCountryCode) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const countryCode =
      tenantCountryCode ?? resolveCountryCode(searchParams.get('country') || 'VU');
    if (!countryCode) {
      return NextResponse.json({ error: 'Invalid country parameter' }, { status: 400 });
    }

    if (isCountryProtected(countryCode) && isCountryAuthMisconfigured(countryCode)) {
      console.error(`[auth] middleware misconfigured api country=${countryCode} path=${pathname}`);
      return NextResponse.json(
        { error: `Country access for ${countryCode} is misconfigured.` },
        { status: 503 }
      );
    }

    if (isCountryProtected(countryCode) && !getCountryAuthSecret()) {
      return NextResponse.json({ error: 'Server auth secret is not configured.' }, { status: 503 });
    }

    if (isCountryProtected(countryCode)) {
      const countrySlug = getSlugFromCountryCode(countryCode);
      const isValid = await verifySessionInMiddleware(request, countryCode, countrySlug);
      if (!isValid) {
        console.warn(`[auth] middleware denied api country=${countryCode} path=${pathname}`);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  if (pathname.endsWith('.geojson') || pathname.endsWith('.csv')) {
    return withDataAssetHeaders();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
