import { NextRequest, NextResponse } from 'next/server';
import {
  OPERATOR_COOKIE,
  jsonError,
  operatorCookieOptions,
  operatorFetch,
  partnerApiUrl,
  rejectCrossSite,
} from '@/lib/operatorAuth';
import { checkSlidingWindowRateLimit } from '@/lib/rateLimit';

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Operator sign-in: a Partner API superuser's username and password. */
export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  const limit = await checkSlidingWindowRateLimit(`operator-login:${clientIp(request)}`, {
    maxAttempts: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
    lockoutMs: LOCKOUT_MS,
  });
  if (!limit.allowed) {
    return jsonError(
      `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      429
    );
  }

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  if (!body?.username || !body?.password) {
    return jsonError('Enter a username and password.', 400);
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(partnerApiUrl('api-token-auth/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: body.username, password: body.password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return jsonError("The Partner API didn't respond. Try again shortly.", 502);
  }
  if (!tokenResponse.ok) {
    return jsonError('Wrong username or password.', 401);
  }
  const { token } = (await tokenResponse.json()) as { token: string };

  const me = await operatorFetch(token, 'v1/operator/me/');
  const user = (await me.json().catch(() => null)) as {
    username: string;
    is_superuser: boolean;
  } | null;
  if (!me.ok || !user?.is_superuser) {
    return jsonError('This account is not a superuser, so it cannot submit cyclone tracks.', 403);
  }

  const response = NextResponse.json({ username: user.username });
  response.cookies.set(OPERATOR_COOKIE, token, operatorCookieOptions());
  return response;
}
