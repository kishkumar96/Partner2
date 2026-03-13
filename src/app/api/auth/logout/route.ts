import { NextRequest, NextResponse } from 'next/server';
import {
  decodeCountrySessionToken,
  getCountryAuthCookieName,
  getCountryCodeFromSlug,
  getCountrySlugFromCode,
  isSameOriginMutation,
  resolveCountryCode,
} from '@/lib/countryAuth';
import {
  incrementSecurityTelemetry,
  recordAuthAuditEvent,
  revokeSessionJti,
  rotateCountrySessionVersion,
} from '@/lib/authSecurity';
import { validateSecurityConfigOrThrow } from '@/lib/securityConfig';
import { getTenantCountryCodeFromEnv } from '@/utils/tenantCountry';

validateSecurityConfigOrThrow();

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { country?: string };
    const countryInput = body.country;
    if (!countryInput) {
      return NextResponse.json({ error: 'Missing country' }, { status: 400 });
    }

    const countryCode = resolveCountryCode(countryInput) ?? getCountryCodeFromSlug(countryInput);
    if (!countryCode) {
      return NextResponse.json({ error: 'Unknown country' }, { status: 400 });
    }
    const tenantCountryCode = getTenantCountryCodeFromEnv();
    if (tenantCountryCode && countryCode !== tenantCountryCode) {
      return NextResponse.json({ error: 'Unknown country' }, { status: 404 });
    }

    const countrySlug = getCountrySlugFromCode(countryCode);
    const cookieName = getCountryAuthCookieName(countrySlug);
    const existingToken = request.cookies.get(cookieName)?.value;
    const tokenPayload = existingToken ? decodeCountrySessionToken(existingToken) : null;

    if (tokenPayload?.jti && tokenPayload.exp) {
      await revokeSessionJti(tokenPayload.jti, tokenPayload.exp);
    }

    if (process.env.COUNTRY_AUTH_ROTATE_ON_LOGOUT === 'true') {
      await rotateCountrySessionVersion(countrySlug);
    }

    await incrementSecurityTelemetry('logout', countryCode);
    await recordAuthAuditEvent({
      type: 'logout',
      countryCode,
      countrySlug,
      requestPath: '/api/auth/logout',
      jti: tokenPayload?.jti,
    });

    console.info(`[auth] logout country=${countryCode}`);
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
