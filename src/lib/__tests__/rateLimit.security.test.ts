import cache from '@/lib/cache';
import { incrementSecurityTelemetry } from '@/lib/authSecurity';
import { checkSlidingWindowRateLimit } from '@/lib/rateLimit';

jest.mock('@/lib/cache', () => ({
  __esModule: true,
  default: {
    isConnected: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    increment: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@/lib/authSecurity', () => ({
  incrementSecurityTelemetry: jest.fn(),
}));

describe('checkSlidingWindowRateLimit (security)', () => {
  const mockedCache = cache as jest.Mocked<typeof cache>;
  const mockedTelemetry = incrementSecurityTelemetry as jest.MockedFunction<
    typeof incrementSecurityTelemetry
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Redis strategy when cache is connected', async () => {
    mockedCache.isConnected.mockReturnValue(true);
    mockedCache.exists.mockResolvedValue(false);
    mockedCache.increment.mockResolvedValue(1);
    mockedCache.expire.mockResolvedValue(true);

    const result = await checkSlidingWindowRateLimit('country-login:VU:1.1.1.1', {
      maxAttempts: 5,
      windowMs: 60_000,
      lockoutMs: 120_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.strategy).toBe('redis');
    expect(result.remainingAttempts).toBe(4);
  });

  it('blocks with Retry-After when Redis lock key exists', async () => {
    mockedCache.isConnected.mockReturnValue(true);
    mockedCache.exists.mockResolvedValue(true);
    mockedCache.ttl.mockResolvedValue(42);

    const result = await checkSlidingWindowRateLimit('country-login:VU:1.1.1.1', {
      maxAttempts: 5,
      windowMs: 60_000,
      lockoutMs: 120_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.strategy).toBe('redis');
    expect(result.retryAfterSeconds).toBe(42);
    expect(mockedTelemetry).toHaveBeenCalled();
  });

  it('falls back to in-memory strategy when Redis is unavailable', async () => {
    mockedCache.isConnected.mockReturnValue(false);

    const key = 'country-login:WS:2.2.2.2';
    const config = { maxAttempts: 2, windowMs: 60_000, lockoutMs: 120_000 };

    const first = await checkSlidingWindowRateLimit(key, config);
    const second = await checkSlidingWindowRateLimit(key, config);
    const third = await checkSlidingWindowRateLimit(key, config);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.strategy).toBe('memory');
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
