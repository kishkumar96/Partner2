import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CountryCode } from '@/types/thredds';
import {
  getCountryAuthCookieName,
  getCountrySlugFromCode,
  isCountryAuthMisconfigured,
  isCountryProtected,
  verifyCountrySessionTokenDetailed,
} from '@/lib/countryAuth';
import {
  getCountrySessionVersion,
  incrementSecurityTelemetry,
  isSessionRevoked,
  recordAuthAuditEvent,
} from '@/lib/authSecurity';

async function deny(
  countryCode: CountryCode,
  countrySlug: string,
  reason: string,
  requestPath?: string,
  jti?: string
): Promise<NextResponse> {
  await incrementSecurityTelemetry('session_denied', `${countryCode}:${reason}`);
  await recordAuthAuditEvent({
    type: 'session_denied',
    countryCode,
    countrySlug,
    reason,
    requestPath,
    jti,
  });

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function ensureCountryApiAccessEnhanced(
  request: NextRequest,
  countryCode: CountryCode,
  requestPath?: string
): Promise<NextResponse | null> {
  if (!isCountryProtected(countryCode)) {
    return null;
  }

  if (isCountryAuthMisconfigured(countryCode)) {
    return NextResponse.json(
      { error: `Country access for ${countryCode} is misconfigured.` },
      { status: 503 }
    );
  }

  const countrySlug = getCountrySlugFromCode(countryCode);
  const cookieName = getCountryAuthCookieName(countrySlug);
  const token = request.cookies.get(cookieName)?.value;
  if (!token) {
    return deny(countryCode, countrySlug, 'missing-cookie', requestPath);
  }

  const verified = await verifyCountrySessionTokenDetailed(token, countrySlug);
  if (!verified.valid || !verified.payload) {
    return deny(countryCode, countrySlug, verified.reason, requestPath);
  }

  const { jti, sv } = verified.payload;
  if (await isSessionRevoked(jti)) {
    return deny(countryCode, countrySlug, 'revoked', requestPath, jti);
  }

  const currentSessionVersion = await getCountrySessionVersion(countrySlug);
  if (sv < currentSessionVersion) {
    return deny(countryCode, countrySlug, 'stale-session-version', requestPath, jti);
  }

  await recordAuthAuditEvent({
    type: 'session_allowed',
    countryCode,
    countrySlug,
    requestPath,
    jti,
  });

  return null;
}

export async function verifyCountrySessionFromRequest(
  request: NextRequest,
  countryCode: CountryCode,
  requestPath?: string
): Promise<{ valid: boolean; reason: string }> {
  const result = await ensureCountryApiAccessEnhanced(request, countryCode, requestPath);
  if (result) {
    return { valid: false, reason: 'unauthorized' };
  }
  return { valid: true, reason: 'ok' };
}
