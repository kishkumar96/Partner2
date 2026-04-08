jest.mock('next/server', () => ({
  NextResponse: {
    json: (_body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
    }),
  },
}));

jest.mock('@/lib/countryAuth', () => ({
  getCountryAuthCookieName: jest.fn(() => '__Host-country_auth_vanuatu'),
  getCountrySlugFromCode: jest.fn(() => 'vanuatu'),
  isCountryAuthMisconfigured: jest.fn(() => false),
  isCountryProtected: jest.fn(() => true),
  verifyCountrySessionTokenDetailed: jest.fn(),
}));

jest.mock('@/lib/authSecurity', () => ({
  getCountrySessionVersion: jest.fn(async () => 2),
  incrementSecurityTelemetry: jest.fn(async () => undefined),
  isSessionRevoked: jest.fn(async () => false),
  recordAuthAuditEvent: jest.fn(async () => undefined),
}));

import { ensureCountryApiAccessEnhanced } from '@/lib/countryApiAuth';
import {
  verifyCountrySessionTokenDetailed,
  isCountryAuthMisconfigured,
  isCountryProtected,
} from '@/lib/countryAuth';
import { isSessionRevoked } from '@/lib/authSecurity';

describe('ensureCountryApiAccessEnhanced', () => {
  const makeRequest = (token?: string) =>
    ({
      cookies: {
        get: jest.fn(() => (token ? { value: token } : undefined)),
      },
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (isCountryProtected as jest.Mock).mockReturnValue(true);
    (isCountryAuthMisconfigured as jest.Mock).mockReturnValue(false);
    (isSessionRevoked as jest.Mock).mockResolvedValue(false);
  });

  it('denies when cookie is missing', async () => {
    const response = await ensureCountryApiAccessEnhanced(makeRequest(), 'VU', '/api/buildings');

    expect(response?.status).toBe(401);
  });

  it('denies revoked sessions even if signature is valid', async () => {
    (verifyCountrySessionTokenDetailed as jest.Mock).mockResolvedValue({
      valid: true,
      reason: 'ok',
      payload: { jti: 'abc', sv: 2 },
    });
    (isSessionRevoked as jest.Mock).mockResolvedValue(true);

    const response = await ensureCountryApiAccessEnhanced(
      makeRequest('signed.token'),
      'VU',
      '/api/buildings'
    );

    expect(response?.status).toBe(401);
  });

  it('denies stale session version tokens', async () => {
    (verifyCountrySessionTokenDetailed as jest.Mock).mockResolvedValue({
      valid: true,
      reason: 'ok',
      payload: { jti: 'abc', sv: 1 },
    });

    const response = await ensureCountryApiAccessEnhanced(
      makeRequest('signed.token'),
      'VU',
      '/api/buildings'
    );

    expect(response?.status).toBe(401);
  });

  it('returns null when token passes all checks', async () => {
    (verifyCountrySessionTokenDetailed as jest.Mock).mockResolvedValue({
      valid: true,
      reason: 'ok',
      payload: { jti: 'abc', sv: 2 },
    });

    const result = await ensureCountryApiAccessEnhanced(
      makeRequest('signed.token'),
      'VU',
      '/api/buildings'
    );

    expect(result).toBeNull();
  });

  it('returns 503 when country auth is misconfigured', async () => {
    (isCountryAuthMisconfigured as jest.Mock).mockReturnValue(true);

    const response = await ensureCountryApiAccessEnhanced(
      makeRequest('signed.token'),
      'VU',
      '/api/buildings'
    );

    expect(response?.status).toBe(503);
  });
});
