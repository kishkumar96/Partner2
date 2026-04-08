import {
  resetSecurityValidationForTests,
  validateSecurityConfigOrThrow,
} from '@/lib/securityConfig';

describe('security config validation', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    resetSecurityValidationForTests();
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('throws when protected countries are configured without auth secret', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      COUNTRY_PUBLIC_COUNTRIES: 'VU',
      COUNTRY_PASSWORD_WS: 'secret',
      COUNTRY_PASSWORD_TO: 'secret',
      COUNTRY_PASSWORD_CK: 'secret',
      REDIS_URL: 'redis://localhost:6379',
    };
    delete process.env.COUNTRY_AUTH_SECRET;

    expect(() => validateSecurityConfigOrThrow()).toThrow('COUNTRY_AUTH_SECRET');
  });

  it('throws when REDIS_URL is invalid and distributed auth is required', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      COUNTRY_PUBLIC_COUNTRIES: 'VU,WS,TO,CK',
      AUTH_REQUIRE_REDIS: 'true',
      REDIS_URL: 'http://localhost:6379',
    };

    expect(() => validateSecurityConfigOrThrow()).toThrow('REDIS_URL');
  });

  it('passes with valid production security config', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      COUNTRY_PUBLIC_COUNTRIES: 'VU',
      COUNTRY_AUTH_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      COUNTRY_PASSWORD_WS: 'secret',
      COUNTRY_PASSWORD_TO: 'secret',
      COUNTRY_PASSWORD_CK: 'secret',
      REDIS_URL: 'redis://localhost:6379',
    };

    expect(() => validateSecurityConfigOrThrow()).not.toThrow();
  });
});
