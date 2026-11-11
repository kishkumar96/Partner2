import { NextRequest, NextResponse } from 'next/server';
import { partnerTargetPath } from '@/utils/partnerProxyPath';

const PARTNER_API_BASE = process.env.PARTNER_API_BASE_URL ?? 'http://localhost:8000';

/** List endpoints our own API has and the shared API does not: missing means no rows */
const OPTIONAL_LIST_ENDPOINTS = [
  'partner_api/v1/risk_scenario_breakdown',
  'partner_api/v1/risk_scenario',
];

const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
]);
const THREDDS_BASE = process.env.THREDDS_BASE_URL ?? 'https://gemthreddshpc.spc.int';

// WMS responses are immutable for a given request -cache 5 minutes in the browser / CDN.
const WMS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60';
// API data: kept two minutes in the viewer's own browser (private: some countries need a
// login, so no shared cache), then served while it refreshes. A new advisory shows within
// minutes; a reload or mode switch no longer waits on the network.
const PARTNER_DATA_CACHE_CONTROL = 'private, max-age=120, stale-while-revalidate=600';
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

async function proxyRequest(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const rawTargetPath = path.join('/');
  const targetPath = partnerTargetPath(rawTargetPath);

  // THREDDS WMS lives on a different host from the partner API
  const targetBase = targetPath.startsWith('thredds/') ? THREDDS_BASE : PARTNER_API_BASE;

  const url = new URL(request.url);
  const targetUrl = `${targetBase}/${targetPath}${url.search}`;
  const isThreddsRequest = targetPath.startsWith('thredds/');
  const requestType = getQueryParamCaseInsensitive(url.searchParams, 'REQUEST')?.toUpperCase();
  const isGetMapRequest = requestType === 'GETMAP';
  // Partner API data endpoints (risk_information, event, etc.) can be large/slow on pagination.
  const isPartnerDataRequest = targetPath.startsWith('partner_api/');

  // Forward only the headers the upstream needs. Passing on everything sent our host name in
  // X-Forwarded-Host, which the shared API (pacific-disaster-api.spc.int) answers with 400 Bad
  // Request, and sent the browser's cookies, our login session included, to another server.
  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(key.toLowerCase())) forwardHeaders.set(key, value);
  }
  // Ask the upstream for an uncompressed body. This route re-streams the
  // response with content-encoding/length stripped; a gzip-encoded upstream
  // body came back truncated, and Next already compresses the browser leg.
  forwardHeaders.set('Accept-Encoding', 'identity');
  if (isPartnerDataRequest) {
    // Django's dev server (manage.py runserver) drops keep-alive connections
    // inconsistently under concurrent load, causing intermittent instant
    // ECONNRESETs when a pooled connection gets reused. Forcing a fresh
    // connection per request avoids that at the cost of one extra TCP
    // handshake -negligible for a local/dev-only backend.
    forwardHeaders.set('Connection', 'close');
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

  // The shared API has no scenario tables. For these two list endpoints "no rows" is the true
  // answer, and the dashboard then reads the published copy; answering 404 only put three red
  // errors in every visitor's console. Any other path keeps its real status.
  if (
    upstream &&
    upstream.status === 404 &&
    request.method === 'GET' &&
    OPTIONAL_LIST_ENDPOINTS.some(prefix => targetPath.startsWith(prefix))
  ) {
    return NextResponse.json(
      { count: 0, next: null, previous: null, results: [] },
      { status: 200, headers: { 'X-Partner-Endpoint-Missing': 'true' } }
    );
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
  // Which server answered: the browser only sees this proxy, so its Network tab cannot show it
  try {
    responseHeaders.set('X-Partner-Upstream', new URL(targetBase).host);
  } catch {
    // an unparsable base is reported by the fetch itself
  }
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
  // The body is re-streamed without a length, so pass the upstream's on: a caller can then
  // decline a large body it already has (the same upload stored twice) before downloading it.
  const upstreamLength = upstream.headers.get('content-length');
  if (upstreamLength) responseHeaders.set('X-Upstream-Content-Length', upstreamLength);

  // Add browser/CDN caching for WMS tile requests (GET only, successful responses)
  if (request.method === 'GET' && upstream.status === 200 && isThreddsRequest) {
    responseHeaders.set('Cache-Control', WMS_CACHE_CONTROL);
  }
  if (request.method === 'GET' && upstream.status === 200 && isPartnerDataRequest) {
    responseHeaders.set('Cache-Control', PARTNER_DATA_CACHE_CONTROL);
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
