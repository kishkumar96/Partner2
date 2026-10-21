import { DatabaseNotConfiguredError, getDatabaseUrl, isDatabaseConfigured } from '../databaseUrl';

describe('getDatabaseUrl', () => {
  it('returns the URL from the environment, trimmed', () => {
    expect(getDatabaseUrl({ DATABASE_URL: ' postgresql://user:password@host:5432/dbname ' })).toBe(
      'postgresql://user:password@host:5432/dbname'
    );
  });

  it('refuses to guess: no URL is an error, never a default credential', () => {
    expect(() => getDatabaseUrl({})).toThrow(DatabaseNotConfiguredError);
    expect(() => getDatabaseUrl({ DATABASE_URL: '' })).toThrow('DATABASE_URL is not set');
    expect(() => getDatabaseUrl({ DATABASE_URL: '   ' })).toThrow(DatabaseNotConfiguredError);
  });

  it('says whether a database is configured', () => {
    expect(isDatabaseConfigured({ DATABASE_URL: 'postgresql://user:password@host/dbname' })).toBe(
      true
    );
    expect(isDatabaseConfigured({})).toBe(false);
  });
});

describe('the connection pool', () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    jest.resetModules();
    jest.dontMock('pg');
  });

  it('is not created just by importing the module, so a build needs no database', () => {
    delete process.env.DATABASE_URL;
    const Pool = jest.fn(() => ({ on: jest.fn(), query: jest.fn(), end: jest.fn() }));
    jest.doMock('pg', () => ({ Pool }));
    expect(() => require('../db')).not.toThrow();
    expect(Pool).not.toHaveBeenCalled();
  });

  it('fails a query with a clear error when DATABASE_URL is missing, and never connects', async () => {
    delete process.env.DATABASE_URL;
    const Pool = jest.fn(() => ({ on: jest.fn(), query: jest.fn(), end: jest.fn() }));
    jest.doMock('pg', () => ({ Pool }));
    const db = require('../db').default;
    await expect(db.query('SELECT 1')).rejects.toThrow('DATABASE_URL is not set');
    expect(Pool).not.toHaveBeenCalled();
  });

  it('connects with the URL from the environment', async () => {
    process.env.DATABASE_URL = 'postgresql://user:password@host:5432/dbname';
    const query = jest.fn().mockResolvedValue({ rows: [{ one: 1 }] });
    const Pool = jest.fn(() => ({ on: jest.fn(), query, end: jest.fn() }));
    jest.doMock('pg', () => ({ Pool }));
    const db = require('../db').default;
    await db.query('SELECT 1');
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgresql://user:password@host:5432/dbname' })
    );
  });
});
