jest.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    type: 'next' | 'redirect' | 'json' | 'response';
    location?: string;
    headers: { set: jest.Mock };

    constructor(_body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.type = 'response';
      this.headers = { set: jest.fn() };
    }

    static next() {
      return {
        status: 200,
        type: 'next' as const,
        headers: { set: jest.fn() },
      };
    }

    static redirect(url: URL) {
      return {
        status: 307,
        type: 'redirect' as const,
        location: url.toString(),
        headers: { set: jest.fn() },
      };
    }

    static json(_body: unknown, init?: { status?: number }) {
      return {
        status: init?.status ?? 200,
        type: 'json' as const,
        headers: { set: jest.fn() },
      };
    }
  }

  return { NextResponse: MockNextResponse };
});

jest.mock('@/lib/securityConfig', () => ({
  validateSecurityConfigOrThrow: jest.fn(),
}));

jest.mock('@/utils/tenantCountry', () => ({
  getTenantCountryCodeFromEnv: jest.fn(),
  getTenantCountrySlugFromEnv: jest.fn(),
}));

jest.mock('@/lib/countryAuth', () => ({
  getCountryAuthCookieName: jest.fn(() => '__Host-country_auth_vanuatu'),
  getCountryAuthSecret: jest.fn(() => 'abcdefghijklmnopqrstuvwxyz123456'),
  getCountrySlugFromCode: jest.fn((code: string) =>
    code === 'VU' ? 'vanuatu' : code === 'WS' ? 'samoa' : 'tonga'
  ),
  isCountryAuthMisconfigured: jest.fn(() => false),
  isCountryProtected: jest.fn((code: string) => code === 'VU'),
  resolveCountryCode: jest.fn((value: string | null) => {
    if (!value) return null;
    const normalized = value.toUpperCase();
    if (normalized === 'VU') return 'VU';
    if (normalized === 'WS') return 'WS';
    return null;
  }),
  verifyCountrySessionToken: jest.fn(async () => true),
}));

import { proxy as middleware } from '@/proxy';
import { getTenantCountrySlugFromEnv } from '@/utils/tenantCountry';

describe('middleware auth parity', () => {
  const originalFetch = global.fetch;
  type MockMiddlewareResponse = {
    status: number;
    type?: 'next' | 'redirect' | 'json' | 'response';
    location?: string;
  };

  const makeRequest = (url: string, cookieValue?: string) => {
    const parsed = new URL(url);
    return {
      nextUrl: {
        pathname: parsed.pathname,
        searchParams: parsed.searchParams,
        origin: parsed.origin,
        clone: () => new URL(parsed.toString()),
      },
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'cookie') {
            return cookieValue || '';
          }
          return null;
        },
      },
      cookies: {
        get: () => (cookieValue ? { value: cookieValue } : undefined),
      },
    } as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantCountrySlugFromEnv as jest.Mock).mockReturnValue(null);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('redirects protected country routes to login when probe check fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as any;

    const response = (await middleware(
      makeRequest('http://localhost:3002/vanuatu')
    )) as unknown as MockMiddlewareResponse;

    expect(response.status).toBe(307);
    expect(response.location).toContain('/vanuatu/login');
  });

  it('allows protected route when probe check succeeds', async () => {
    global.fetch = jest.fn(async () => ({ ok: true })) as any;

    const response = (await middleware(
      makeRequest('http://localhost:3002/vanuatu')
    )) as unknown as MockMiddlewareResponse;

    expect(response.status).toBe(200);
    expect(response.type).toBe('next');
  });

  it('blocks scoped protected api with 401 when probe fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as any;

    const response = (await middleware(
      makeRequest('http://localhost:3002/api/buildings?country=VU')
    )) as unknown as MockMiddlewareResponse;

    expect(response.status).toBe(401);
    expect(response.type).toBe('json');
  });

  it('returns 404 for tenant-country route mismatch', async () => {
    (getTenantCountrySlugFromEnv as jest.Mock).mockReturnValue('samoa');
    global.fetch = jest.fn(async () => ({ ok: true })) as any;

    const response = (await middleware(
      makeRequest('http://localhost:3002/vanuatu')
    )) as unknown as MockMiddlewareResponse;

    expect(response.status).toBe(404);
  });
});
