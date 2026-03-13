import { NextRequest, NextResponse } from 'next/server';
import { getCountryCodeFromSlug, resolveCountryCode } from '@/lib/countryAuth';
import { ensureCountryApiAccessEnhanced } from '@/lib/countryApiAuth';
import { validateSecurityConfigOrThrow } from '@/lib/securityConfig';
import { getTenantCountryCodeFromEnv } from '@/utils/tenantCountry';

validateSecurityConfigOrThrow();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const countryInput = searchParams.get('country');

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

  const denied = await ensureCountryApiAccessEnhanced(
    request,
    countryCode,
    '/api/auth/verify-session'
  );
  if (denied) {
    return denied;
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
