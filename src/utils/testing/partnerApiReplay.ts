/**
 * Serves captured partner-API responses to `fetch`, so a loader can be run against what the real API
 * answered, with no network. Requests are matched by path and query (the proxy prefix and base path are
 * ignored, and a trailing slash before the query is optional, as the server redirects either way).
 *
 * Unlike a bare `jest.fn()`, it honours abort signals the way a real `fetch` does: a request made with an
 * aborted signal rejects with an AbortError. Without that, bugs that only show when a load is cancelled
 * and restarted cannot be reproduced.
 */
export interface CapturedResponse {
  status: number;
  body: unknown;
}

export interface PartnerApiReplay {
  /** Every URL requested, in order */
  requests: string[];
  /**
   * Same-origin proxy URLs asked for with a trailing slash. Next answers those with a 308 to the slash-less
   * URL, so each costs the browser a second round trip. Counted, and charged as an extra hop in `roundTrips`.
   */
  redirects: () => number;
  /**
   * The longest chain of requests where each waited for an earlier one to finish, redirects included: the
   * number of network round trips a load needs even with unlimited parallelism. Fewer is faster on a slow
   * link, whatever the request count.
   */
  roundTrips: () => number;
  /** Requests the capture had no answer for (answered 404) */
  misses: string[];
  restore: () => void;
}

function pathOf(raw: string): string {
  try {
    const url = new URL(raw, 'http://localhost');
    return (url.pathname + url.search).replace(/^\/partner2/, '');
  } catch {
    return raw;
  }
}

export function installPartnerApiReplay(
  responses: Record<string, CapturedResponse>,
  extra: Record<string, CapturedResponse> = {}
): PartnerApiReplay {
  const table = { ...responses, ...extra };
  const requests: string[] = [];
  const misses: string[] = [];
  const g = globalThis as unknown as { fetch: unknown };
  const originalFetch = g.fetch;
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_PARTNER_API;
  process.env.NEXT_PUBLIC_ENABLE_PARTNER_API = 'true';

  let redirects = 0;
  let finishedDepth = 0;
  const macrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const isSlashedProxyUrl = (url: string) => {
    try {
      const parsed = new URL(url, 'http://localhost');
      return parsed.pathname.includes('/api/partner-proxy/') && parsed.pathname.endsWith('/');
    } catch {
      return false;
    }
  };

  const abortError = () => new DOMException('The operation was aborted.', 'AbortError');
  g.fetch = async (input: unknown, init?: { signal?: AbortSignal }) => {
    const url = String(input);
    if (init?.signal?.aborted) throw abortError();
    // A request that starts after others finished depends on them: one level deeper than the last finished
    const redirected = isSlashedProxyUrl(url);
    if (redirected) redirects += 1;
    const depth = finishedDepth + (redirected ? 2 : 1);
    // A real request takes time, and an abort can land while it is in flight
    await macrotask();
    if (redirected) await macrotask();
    if (init?.signal?.aborted) throw abortError();
    finishedDepth = Math.max(finishedDepth, depth);
    requests.push(url);
    const path = pathOf(url);
    const hit =
      table[path] ?? table[path.replace(/\/(\?|$)/, '$1')] ?? table[path.replace(/(\?|$)/, '/$1')];
    if (!hit) {
      misses.push(url);
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: async () => ({}),
        body: null,
      };
    }
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      headers: { get: () => null },
      json: async () => hit.body,
      body: null,
    };
  };

  return {
    requests,
    misses,
    redirects: () => redirects,
    roundTrips: () => finishedDepth,
    restore() {
      g.fetch = originalFetch;
      if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_PARTNER_API;
      else process.env.NEXT_PUBLIC_ENABLE_PARTNER_API = originalFlag;
    },
  };
}
