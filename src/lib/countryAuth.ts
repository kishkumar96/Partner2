import type { NextRequest } from 'next/server';
import { CODE_TO_SLUG, SLUG_TO_CODE } from '@/utils/countrySlug';
import { CountryCode } from '@/types/thredds';

const SESSION_SUBJECT = 'country-access';
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface CountrySessionPayload {
  sub: string;
  country: string;
  iat: number;
  exp: number;
  jti: string;
  ver: number;
  sv: number;
}

function normalizeCountryCode(input: string): CountryCode | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (SLUG_TO_CODE[normalized]) {
    return SLUG_TO_CODE[normalized];
  }

  const upper = input.trim().toUpperCase() as CountryCode;
  if (CODE_TO_SLUG[upper]) {
    return upper;
  }

  return null;
}

function getPublicCountries(): Set<CountryCode> {
  const raw = process.env.COUNTRY_PUBLIC_COUNTRIES || '';
  // Public-by-default policy: countries become protected only when this variable is explicitly set.
  if (!raw.trim()) {
    return new Set<CountryCode>(Object.keys(CODE_TO_SLUG) as CountryCode[]);
  }
  const values = raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const result = new Set<CountryCode>();
  values.forEach(value => {
    const code = normalizeCountryCode(value);
    if (code) {
      result.add(code);
    }
  });

  return result;
}

function getSessionVersion(): number {
  const raw = process.env.COUNTRY_AUTH_SESSION_VERSION;
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeTextAsBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeTextFromBase64Url(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSHA256(message: string, secret: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

export function getCountryPassword(countryCode: CountryCode): string | undefined {
  return process.env[`COUNTRY_PASSWORD_${countryCode}`];
}

export function getCountrySlugFromCode(countryCode: CountryCode): string {
  return CODE_TO_SLUG[countryCode];
}

export function getCountryCodeFromSlug(slug: string): CountryCode | null {
  return SLUG_TO_CODE[slug.toLowerCase()] ?? null;
}

export function isCountryPublic(countryCode: CountryCode): boolean {
  return getPublicCountries().has(countryCode);
}

export function isCountryProtected(countryCode: CountryCode): boolean {
  return !isCountryPublic(countryCode);
}

export function isCountryAuthMisconfigured(countryCode: CountryCode): boolean {
  return isCountryProtected(countryCode) && !getCountryPassword(countryCode);
}

export function getCountryAuthSecret(): string | null {
  const secret = process.env.COUNTRY_AUTH_SECRET?.trim();
  return secret ? secret : null;
}

export function getCountryAuthCookieName(countrySlug: string): string {
  return `__Host-country_auth_${countrySlug.toLowerCase()}`;
}

export function getCountryAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
    priority: 'high' as const,
  };
}

export async function constantTimeStringEquals(a: string, b: string): Promise<boolean> {
  return timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

export async function createCountrySessionToken(
  countrySlug: string,
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  sessionVersion: number = 1
): Promise<string> {
  const secret = getCountryAuthSecret();
  if (!secret) {
    throw new Error('COUNTRY_AUTH_SECRET is not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: CountrySessionPayload = {
    sub: SESSION_SUBJECT,
    country: countrySlug.toLowerCase(),
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
    ver: getSessionVersion(),
    sv: sessionVersion,
  };

  const encodedPayload = encodeTextAsBase64Url(JSON.stringify(payload));
  const signature = await hmacSHA256(encodedPayload, secret);
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export function decodeCountrySessionToken(token: string): CountrySessionPayload | null {
  const [payloadPart] = token.split('.');
  if (!payloadPart) {
    return null;
  }

  try {
    return JSON.parse(decodeTextFromBase64Url(payloadPart)) as CountrySessionPayload;
  } catch {
    return null;
  }
}

export async function verifyCountrySessionTokenDetailed(
  token: string,
  expectedCountrySlug: string
): Promise<{ valid: boolean; reason: string; payload?: CountrySessionPayload }> {
  const secret = getCountryAuthSecret();
  if (!secret) return { valid: false, reason: 'missing-secret' };

  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return { valid: false, reason: 'malformed-token' };
  }

  let payload: CountrySessionPayload;
  try {
    payload = JSON.parse(decodeTextFromBase64Url(payloadPart)) as CountrySessionPayload;
  } catch {
    return { valid: false, reason: 'invalid-payload' };
  }

  if (
    payload.sub !== SESSION_SUBJECT ||
    payload.country !== expectedCountrySlug.toLowerCase() ||
    !Number.isFinite(payload.exp) ||
    payload.ver !== getSessionVersion() ||
    !Number.isFinite(payload.sv)
  ) {
    return { valid: false, reason: 'invalid-claims' };
  }

  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    return { valid: false, reason: 'expired' };
  }

  const expectedSignature = await hmacSHA256(payloadPart, secret);
  const receivedSignature = base64UrlToBytes(signaturePart);
  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return { valid: false, reason: 'bad-signature' };
  }

  return { valid: true, reason: 'ok', payload };
}

export async function verifyCountrySessionToken(
  token: string,
  expectedCountrySlug: string
): Promise<boolean> {
  const result = await verifyCountrySessionTokenDetailed(token, expectedCountrySlug);
  return result.valid;
}

export function resolveCountryCode(input: string | null | undefined): CountryCode | null {
  if (!input) return null;
  return normalizeCountryCode(input);
}

export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const expectedOrigin = request.nextUrl.origin;

  if (origin) {
    return origin === expectedOrigin;
  }
  if (referer) {
    return referer.startsWith(expectedOrigin);
  }

  return false;
}
