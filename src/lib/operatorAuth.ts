import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginMutation } from '@/lib/countryAuth';

/**
 * Operator (superuser) session for the /operator page: a Partner API token
 * for a Django superuser, kept in an httpOnly cookie so it never reaches
 * browser JavaScript. One operator login covers every country, separate from
 * the per-country dashboard logins. The middleware enforces superuser access
 * on every operator endpoint; this layer only carries the token.
 */

export const OPERATOR_COOKIE = 'partner2_operator';
const SESSION_SECONDS = 8 * 60 * 60;
const PARTNER_API_BASE = (process.env.PARTNER_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  ''
);

export function partnerApiUrl(path: string): string {
  return `${PARTNER_API_BASE}/partner_api/${path}`;
}

export function operatorCookieOptions(maxAge = SESSION_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

export function getOperatorToken(request: NextRequest): string | null {
  return request.cookies.get(OPERATOR_COOKIE)?.value || null;
}

export function jsonError(detail: string, status: number): NextResponse {
  return NextResponse.json({ detail }, { status });
}

/**
 * Rejects cross-site mutations (the cookie is SameSite=strict too). Compares
 * the Origin (or Referer) host with the Host the browser addressed, rather
 * than the server's own URL, which differs behind Docker port mapping or a
 * reverse proxy.
 */
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const addressedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  let sourceHost: string | null = null;
  try {
    sourceHost = source ? new URL(source).host : null;
  } catch {
    sourceHost = null;
  }
  if (sourceHost && addressedHost && sourceHost === addressedHost) return null;
  // Fall back to the stricter check used by the country login
  return isSameOriginMutation(request) ? null : jsonError('Cross-site request rejected.', 403);
}

export async function operatorFetch(token: string, path: string, init: RequestInit = {}) {
  return fetch(partnerApiUrl(path), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Token ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });
}

/**
 * Forwards an operator request to the Partner API and relays its JSON reply.
 * A 401 from the API (token revoked) also ends the session.
 */
export async function relayOperatorRequest(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
): Promise<NextResponse> {
  const token = getOperatorToken(request);
  if (!token) return jsonError('Sign in as an operator first.', 401);

  let upstream: Response;
  try {
    upstream = await operatorFetch(token, path, init);
  } catch {
    return jsonError("The Partner API didn't respond. Try again shortly.", 502);
  }
  const body = await upstream
    .json()
    .catch(() => ({ detail: `Partner API error ${upstream.status}` }));
  const response = NextResponse.json(body, { status: upstream.status });
  if (upstream.status === 401) {
    response.cookies.set(OPERATOR_COOKIE, '', operatorCookieOptions(0));
  }
  return response;
}
