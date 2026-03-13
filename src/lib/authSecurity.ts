import cache, { CacheTTL } from '@/lib/cache';

type AuthAuditEventType =
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  | 'logout'
  | 'session_denied'
  | 'session_allowed';

interface AuthAuditEvent {
  type: AuthAuditEventType;
  countryCode?: string;
  countrySlug?: string;
  ipMasked?: string;
  reason?: string;
  requestPath?: string;
  jti?: string;
  ts: string;
}

interface TelemetrySnapshot {
  metric: string;
  dimension: string;
  bucket: string;
  value: number;
}

const MEMORY_REVOKED = new Map<string, number>();
const MEMORY_SESSION_VERSION = new Map<string, number>();

const AUDIT_LIST_KEY = 'auth:audit:events';
const SESSION_VERSION_PREFIX = 'auth:session-version';
const REVOKED_PREFIX = 'auth:revoked-jti';
const TELEMETRY_PREFIX = 'auth:telemetry';

function toDayBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function revokedKey(jti: string): string {
  return `${REVOKED_PREFIX}:${jti}`;
}

function sessionVersionKey(countrySlug: string): string {
  return `${SESSION_VERSION_PREFIX}:${countrySlug.toLowerCase()}`;
}

function telemetryKey(metric: string, dimension: string, bucket: string): string {
  return `${TELEMETRY_PREFIX}:${metric}:${dimension}:${bucket}`;
}

function pruneRevokedMemory(): void {
  const now = nowUnixSeconds();
  for (const [jti, expiresAt] of MEMORY_REVOKED.entries()) {
    if (expiresAt <= now) {
      MEMORY_REVOKED.delete(jti);
    }
  }
}

export async function getCountrySessionVersion(countrySlug: string): Promise<number> {
  const key = sessionVersionKey(countrySlug);

  if (cache.isConnected()) {
    const value = await cache.get<number>(key);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
      return value;
    }

    await cache.set(key, 1);
    return 1;
  }

  const fallback = MEMORY_SESSION_VERSION.get(key);
  if (!fallback || fallback < 1) {
    MEMORY_SESSION_VERSION.set(key, 1);
    return 1;
  }
  return fallback;
}

export async function rotateCountrySessionVersion(countrySlug: string): Promise<number> {
  const key = sessionVersionKey(countrySlug);

  if (cache.isConnected()) {
    const existing = await cache.get<number>(key);
    if (existing === null) {
      await cache.set(key, 1);
    }
    const next = await cache.increment(key, 1);
    return next > 0 ? next : 1;
  }

  const current = MEMORY_SESSION_VERSION.get(key) ?? 1;
  const next = current + 1;
  MEMORY_SESSION_VERSION.set(key, next);
  return next;
}

export async function revokeSessionJti(jti: string, expiresAtUnix: number): Promise<void> {
  const ttl = Math.max(60, expiresAtUnix - nowUnixSeconds());
  const key = revokedKey(jti);

  if (cache.isConnected()) {
    await cache.set(key, true, ttl);
    return;
  }

  MEMORY_REVOKED.set(jti, nowUnixSeconds() + ttl);
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  if (!jti) {
    return false;
  }

  if (cache.isConnected()) {
    return cache.exists(revokedKey(jti));
  }

  pruneRevokedMemory();
  return MEMORY_REVOKED.has(jti);
}

export async function incrementSecurityTelemetry(
  metric: string,
  dimension: string,
  ttlSeconds: number = CacheTTL.DAY * 7
): Promise<void> {
  const bucket = toDayBucket();
  const key = telemetryKey(metric, dimension, bucket);

  if (cache.isConnected()) {
    const next = await cache.increment(key, 1);
    if (next === 1) {
      await cache.expire(key, ttlSeconds);
    }
  }
}

export async function recordAuthAuditEvent(event: Omit<AuthAuditEvent, 'ts'>): Promise<void> {
  const payload: AuthAuditEvent = {
    ...event,
    ts: new Date().toISOString(),
  };

  if (cache.isConnected()) {
    await cache.listPushHead(AUDIT_LIST_KEY, payload, 5000);
  }
}

export async function getAuthAuditEvents(options?: {
  limit?: number;
  countryCode?: string;
  type?: AuthAuditEventType;
}): Promise<AuthAuditEvent[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  if (!cache.isConnected()) {
    return [];
  }

  const raw = await cache.listRange<AuthAuditEvent>(AUDIT_LIST_KEY, 0, Math.max(limit * 3, 200));
  const filtered = raw.filter(event => {
    if (options?.countryCode && event.countryCode !== options.countryCode) {
      return false;
    }
    if (options?.type && event.type !== options.type) {
      return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
}

export async function getSecurityTelemetrySnapshot(bucket: string): Promise<TelemetrySnapshot[]> {
  if (!cache.isConnected()) {
    return [];
  }

  const keys = await cache.keys(`${TELEMETRY_PREFIX}:*:*:${bucket}`);
  if (keys.length === 0) {
    return [];
  }

  const results = await Promise.all(
    keys.map(async key => {
      const value = await cache.get<number>(key);
      const [, , metric, ...rest] = key.split(':');
      const parsedBucket = rest[rest.length - 1] || bucket;
      const dimension = rest.slice(0, -1).join(':');
      return {
        metric,
        dimension,
        bucket: parsedBucket,
        value: typeof value === 'number' ? value : 0,
      } as TelemetrySnapshot;
    })
  );

  return results.sort((a, b) => b.value - a.value);
}
