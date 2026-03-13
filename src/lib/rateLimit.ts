import cache from '@/lib/cache';
import { incrementSecurityTelemetry } from '@/lib/authSecurity';

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
  strategy: 'redis' | 'memory';
};

type Bucket = {
  attempts: number;
  windowStartMs: number;
  lockUntilMs: number;
};

const buckets = new Map<string, Bucket>();

export async function checkSlidingWindowRateLimit(
  key: string,
  {
    maxAttempts,
    windowMs,
    lockoutMs,
  }: {
    maxAttempts: number;
    windowMs: number;
    lockoutMs: number;
  }
): Promise<RateLimitResult> {
  if (cache.isConnected()) {
    const lockKey = `${key}:lock`;
    const countKey = `${key}:count`;

    const lockExists = await cache.exists(lockKey);
    if (lockExists) {
      const ttl = await cache.ttl(lockKey);
      await incrementSecurityTelemetry('rate_limited', key);
      return {
        allowed: false,
        retryAfterSeconds: ttl ?? Math.ceil(lockoutMs / 1000),
        remainingAttempts: 0,
        strategy: 'redis',
      };
    }

    const nextCount = await cache.increment(countKey, 1);
    if (nextCount === 1) {
      await cache.expire(countKey, Math.ceil(windowMs / 1000));
    }

    if (nextCount > maxAttempts) {
      await cache.set(lockKey, true, Math.ceil(lockoutMs / 1000));
      await incrementSecurityTelemetry('rate_limited', key);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(lockoutMs / 1000),
        remainingAttempts: 0,
        strategy: 'redis',
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: Math.max(0, maxAttempts - nextCount),
      strategy: 'redis',
    };
  }

  const now = Date.now();
  const existing = buckets.get(key);

  const bucket: Bucket =
    existing && now - existing.windowStartMs < windowMs
      ? existing
      : {
          attempts: 0,
          windowStartMs: now,
          lockUntilMs: 0,
        };

  if (bucket.lockUntilMs > now) {
    await incrementSecurityTelemetry('rate_limited', key);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.lockUntilMs - now) / 1000),
      remainingAttempts: 0,
      strategy: 'memory',
    };
  }

  bucket.attempts += 1;

  if (bucket.attempts > maxAttempts) {
    bucket.lockUntilMs = now + lockoutMs;
    buckets.set(key, bucket);
    await incrementSecurityTelemetry('rate_limited', key);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(lockoutMs / 1000),
      remainingAttempts: 0,
      strategy: 'memory',
    };
  }

  buckets.set(key, bucket);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, maxAttempts - bucket.attempts),
    strategy: 'memory',
  };
}
