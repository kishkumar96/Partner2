import { NextRequest, NextResponse } from 'next/server';

const PARTNER_API_BASE = process.env.PARTNER_API_BASE_URL ?? 'http://localhost:8000';
const THREDDS_BASE = process.env.THREDDS_BASE_URL ?? 'https://gemthreddshpc.spc.int';

// WMS responses are immutable for a given request — cache 5 minutes in the browser / CDN.
const WMS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60';
const DEFAULT_UPSTREAM_TIMEOUT_MS = 20000;
const DEFAULT_PARTNER_DATA_TIMEOUT_MS = 60000;
const DEFAULT_THREDDS_WMS_TIMEOUT_MS = 30000;
const WMS_MAX_ATTEMPTS = 3;

type RouteContext = { params: Promise<{ path: string[] }> };

function getQueryParamCaseInsensitive(searchParams: URLSearchParams, key: string): string | null {
  const targetKey = key.toLowerCase();
  for (const [paramKey, value] of searchParams.entries()) {
    if (paramKey.toLowerCase() === targetKey) {
      return value;
    }
  }
  return null;
}

function backoffMsForAttempt(attempt: number): number {
  // Keep retries quick while still giving the upstream a small recovery window.
  return 250 * attempt;
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

async function proxyRequest(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const rawTargetPath = path.join('/');
  const targetPath = rawTargetPath.startsWith('partner_api/')
    ? ensureTrailingSlash(rawTargetPath)
    : rawTargetPath;

  // THREDDS WMS lives on a different host from the partner API
  const targetBase = targetPath.startsWith('thredds/') ? THREDDS_BASE : PARTNER_API_BASE;

  const url = new URL(request.url);
  const targetUrl = `${targetBase}/${targetPath}${url.search}`;
  const isThreddsRequest = targetPath.startsWith('thredds/');
  const requestType = getQueryParamCaseInsensitive(url.searchParams, 'REQUEST')?.toUpperCase();
  const isGetMapRequest = requestType === 'GETMAP';
  // Partner API data endpoints (risk_information, event, etc.) can be large/slow on pagination.
  const isPartnerDataRequest = targetPath.startsWith('partner_api/');

  // Forward a safe subset of request headers, omitting host which would confuse the upstream.
  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'transfer-encoding') {
      continue;
    }
    forwardHeaders.set(key, value);
  }

  let body: BodyInit | null = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  const getTimeoutMs = (attempt: number): number => {
    if (isThreddsRequest && isGetMapRequest) {
      // Large ncWMS GetMap requests can take significantly longer than generic API calls.
      const base = Number(process.env.THREDDS_WMS_TIMEOUT_MS) || DEFAULT_THREDDS_WMS_TIMEOUT_MS;
      return base + attempt * 5000;
    }

    if (isPartnerDataRequest) {
      return Number(process.env.PARTNER_DATA_TIMEOUT_MS) || DEFAULT_PARTNER_DATA_TIMEOUT_MS;
    }

    return Number(process.env.PARTNER_PROXY_TIMEOUT_MS) || DEFAULT_UPSTREAM_TIMEOUT_MS;
  };

  const fetchUpstream = (attempt: number) =>
    fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(getTimeoutMs(attempt)),
      // @ts-expect-error Node 18+ fetch supports duplex for streaming
      duplex: body ? 'half' : undefined,
    });

  const logProxyFailure = (message: string, error?: unknown) => {
    console.error('[partner-proxy]', message, {
      method: request.method,
      targetUrl,
      targetBase,
      targetPath,
      search: url.search,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
  };

  const canRetryWms = isThreddsRequest && isGetMapRequest;
  const maxAttempts = canRetryWms ? WMS_MAX_ATTEMPTS : 1;
  let upstream: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      upstream = await fetchUpstream(attempt);

      const isUpstream5xx = upstream.status >= 500 && upstream.status <= 599;
      const shouldRetry = canRetryWms && isUpstream5xx && attempt < maxAttempts - 1;
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, backoffMsForAttempt(attempt + 1)));
        continue;
      }

      break;
    } catch (err) {
      lastError = err;
      const isTimeout =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

      // Retry transient THREDDS transport errors before returning 5xx.
      if (canRetryWms && attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, backoffMsForAttempt(attempt + 1)));
        continue;
      }

      logProxyFailure(isTimeout ? 'Upstream request timed out' : 'Upstream request failed', err);

      return NextResponse.json(
        { error: isTimeout ? 'Partner API timed out' : 'Partner API unreachable' },
        { status: isTimeout ? 504 : 502 }
      );
    }
  }

  if (!upstream) {
    const isTimeout =
      lastError instanceof Error &&
      (lastError.name === 'TimeoutError' || lastError.name === 'AbortError');
    logProxyFailure(
      isTimeout ? 'No upstream response after timeout' : 'No upstream response',
      lastError
    );
    return NextResponse.json(
      { error: isTimeout ? 'Partner API timed out' : 'Partner API unreachable' },
      { status: isTimeout ? 504 : 502 }
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'transfer-encoding' ||
      lower === 'connection' ||
      lower === 'content-encoding' ||
      lower === 'content-length'
    ) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  // Add browser/CDN caching for WMS tile requests (GET only, successful responses)
  if (request.method === 'GET' && upstream.status === 200 && isThreddsRequest) {
    responseHeaders.set('Cache-Control', WMS_CACHE_CONTROL);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
