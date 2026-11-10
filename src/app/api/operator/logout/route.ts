import { NextRequest, NextResponse } from 'next/server';
import { OPERATOR_COOKIE, operatorCookieOptions, rejectCrossSite } from '@/lib/operatorAuth';

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPERATOR_COOKIE, '', operatorCookieOptions(0));
  return response;
}
