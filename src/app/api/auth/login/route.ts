import { NextRequest, NextResponse } from 'next/server';
import {
  constantTimeStringEquals,
  createCountrySessionToken,
  getCountryAuthCookieName,
  getCountryAuthCookieOptions,
  getCountryAuthSecret,
  getCountryCodeFromSlug,
  getCountryPassword,
  getCountrySlugFromCode,
  isCountryAuthMisconfigured,
  isCountryProtected,
  isSameOriginMutation,
  resolveCountryCode,
} from '@/lib/countryAuth';
import { checkSlidingWindowRateLimit } from '@/lib/rateLimit';
import {
  getCountrySessionVersion,
  incrementSecurityTelemetry,
  recordAuthAuditEvent,
} from '@/lib/authSecurity';
import { validateSecurityConfigOrThrow } from '@/lib/securityConfig';
import { getTenantCountryCodeFromEnv } from '@/utils/tenantCountry';

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 30 * 60 * 1000;

validateSecurityConfigOrThrow();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts[0]}:${parts[1]}:x:x`;
  }
  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
    }

    const { country, password } = (await request.json()) as {
      country?: string;
      password?: string;
    };

    if (!country) {
      return NextResponse.json({ error: 'Missing country' }, { status: 400 });
    }

    const countryCode = resolveCountryCode(country) ?? getCountryCodeFromSlug(country);
    if (!countryCode) {
      return NextResponse.json({ error: 'Unknown country' }, { status: 400 });
    }
    const tenantCountryCode = getTenantCountryCodeFromEnv();
    if (tenantCountryCode && countryCode !== tenantCountryCode) {
      return NextResponse.json({ error: 'Unknown country' }, { status: 404 });
    }

    const clientIp = getClientIp(request);
    const countrySlug = getCountrySlugFromCode(countryCode);
    const isProtected = isCountryProtected(countryCode);
    const authSecret = getCountryAuthSecret();

    if (isProtected && !authSecret) {
      return NextResponse.json({ error: 'Server auth secret is not configured.' }, { status: 503 });
    }

    if (isProtected && isCountryAuthMisconfigured(countryCode)) {
      return NextResponse.json(
        { error: `Country access for ${countryCode} is misconfigured.` },
        { status: 503 }
      );
    }

    if (!isProtected) {
      return NextResponse.json(
        { ok: true, public: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!password) {
      return NextResponse.json({ error: 'Missing country or password' }, { status: 400 });
    }

    const rateLimitKey = `country-login:${countryCode}:${clientIp}`;
    const rateLimit = await checkSlidingWindowRateLimit(rateLimitKey, {
      maxAttempts: MAX_LOGIN_ATTEMPTS,
      windowMs: LOGIN_WINDOW_MS,
      lockoutMs: LOGIN_LOCKOUT_MS,
    });
    if (!rateLimit.allowed) {
      await recordAuthAuditEvent({
        type: 'login_rate_limited',
        countryCode,
        countrySlug,
        ipMasked: maskIp(clientIp),
        reason: `retry_after_${rateLimit.retryAfterSeconds}`,
        requestPath: '/api/auth/login',
      });
      console.warn(
        `[auth] login rate limited country=${countryCode} ip=${maskIp(clientIp)} retry=${rateLimit.retryAfterSeconds}s strategy=${rateLimit.strategy}`
      );
      return NextResponse.json(
        {
          error: `Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const expected = getCountryPassword(countryCode);
    if (!expected) {
      return NextResponse.json(
        { error: `Country access for ${countryCode} is misconfigured.` },
        { status: 503 }
      );
    }

    const isValidPassword = await constantTimeStringEquals(password, expected);
    if (!isValidPassword) {
      await incrementSecurityTelemetry('login_failed', countryCode);
      await recordAuthAuditEvent({
        type: 'login_failed',
        countryCode,
        countrySlug,
        ipMasked: maskIp(clientIp),
        reason: 'invalid-password',
        requestPath: '/api/auth/login',
      });
      console.warn(`[auth] login failed country=${countryCode} ip=${maskIp(clientIp)}`);
      return NextResponse.json(
        { error: 'Invalid access code' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const sessionVersion = await getCountrySessionVersion(countrySlug);
    const token = await createCountrySessionToken(countrySlug, undefined, sessionVersion);
    await incrementSecurityTelemetry('login_success', countryCode);
    await recordAuthAuditEvent({
      type: 'login_success',
      countryCode,
      countrySlug,
      ipMasked: maskIp(clientIp),
      requestPath: '/api/auth/login',
    });
    console.info(`[auth] login success country=${countryCode} ip=${maskIp(clientIp)}`);
    const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    res.cookies.set(getCountryAuthCookieName(countrySlug), token, getCountryAuthCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
