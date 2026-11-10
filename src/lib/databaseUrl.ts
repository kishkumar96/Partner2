/**
 * The database connection string, from the environment only.
 *
 * There is deliberately no fallback: a literal password in source ends up in git history
 * and in every image built from it. Without DATABASE_URL, callers get a clear error to
 * handle (the API routes answer "degraded", health reports "not configured") and nothing
 * silently connects with a default credential.
 */

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not set');
    this.name = 'DatabaseNotConfiguredError';
  }
}

export function getDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();
  return url;
}

export function isDatabaseConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}
