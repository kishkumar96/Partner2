import { NextRequest, NextResponse } from 'next/server';
import { getAuthAuditEvents, getSecurityTelemetrySnapshot } from '@/lib/authSecurity';
import { validateSecurityConfigOrThrow } from '@/lib/securityConfig';

validateSecurityConfigOrThrow();

function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.COUNTRY_AUTH_AUDIT_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }

  const providedToken = request.headers.get('x-auth-audit-token')?.trim();
  return !!providedToken && providedToken === expectedToken;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get('limit') || '100', 10);
  const countryCode = searchParams.get('country') || undefined;
  const type = searchParams.get('type') as
    | 'login_success'
    | 'login_failed'
    | 'login_rate_limited'
    | 'logout'
    | 'session_denied'
    | 'session_allowed'
    | undefined;
  const bucket = searchParams.get('bucket') || new Date().toISOString().slice(0, 10);

  const [events, telemetry] = await Promise.all([
    getAuthAuditEvents({
      limit: Number.isFinite(limit) ? limit : 100,
      countryCode,
      type,
    }),
    getSecurityTelemetrySnapshot(bucket),
  ]);

  return NextResponse.json(
    {
      bucket,
      events,
      telemetry,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
