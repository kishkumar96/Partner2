/**
 * A guard, not a unit test: no real-looking database or Redis password, and no secret-like
 * default value, may be committed. A literal in source stays in git history and in every
 * image built from it, so a removed password is also a rotated one.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  'out',
  'build',
  'dist',
  '.husky',
]);
const SKIP_FILES = new Set(['package-lock.json', 'noHardcodedCredentials.test.ts']);
const SCANNED =
  /\.(ts|tsx|js|mjs|cjs|py|yml|yaml|tf|md|sh|json|env|example)$|Jenkinsfile$|Dockerfile$/;

// A password that is obviously a stand-in
const PLACEHOLDER =
  /^(password|passwd|pass|user|secret|changeme|xxx+|\*+|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|%s|\{[^}]*\})$/i;

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(path.join(dir, entry.name));
    } else if (SCANNED.test(entry.name) && !SKIP_FILES.has(entry.name)) {
      const full = path.join(dir, entry.name);
      if (fs.statSync(full).size < 2_000_000) yield full;
    }
  }
}

const URL_WITH_PASSWORD =
  /\b(?:postgres(?:ql)?|redis|mysql|mongodb(?:\+srv)?):\/\/[^\s:/@'"`]*:([^\s@'"`]+)@/g;
// ${NAME:-literal} where NAME is a password / secret / token / key
const SECRET_DEFAULT = /\$\{[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY)[A-Z0-9_]*:-([^}]+)\}/g;

function findings(): string[] {
  const found: string[] = [];
  for (const file of files(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    for (const match of text.matchAll(URL_WITH_PASSWORD)) {
      if (!PLACEHOLDER.test(match[1]))
        found.push(`${rel}: a connection string with a password (${match[0].slice(0, 40)}…)`);
    }
    for (const match of text.matchAll(SECRET_DEFAULT)) {
      if (!PLACEHOLDER.test(match[1]))
        found.push(`${rel}: a secret-like default value (${match[0].slice(0, 60)})`);
    }
  }
  return found;
}

describe('committed credentials', () => {
  it('has none: no real-looking database or Redis password, and no secret-like default', () => {
    expect(findings()).toEqual([]);
  });

  it('would notice one (the patterns work)', () => {
    const sample = [
      "const url = 'postgresql://app:Sup3rSecret@db:5432/x';",
      'REDIS_URL=redis://:hunter2hunter@cache:6379',
      'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD_STAGING:-staging_secure_2026}',
    ].join('\n');
    const urls = [...sample.matchAll(URL_WITH_PASSWORD)].map(m => m[1]);
    const defaults = [...sample.matchAll(SECRET_DEFAULT)].map(m => m[1]);
    expect(urls.filter(p => !PLACEHOLDER.test(p))).toEqual(['Sup3rSecret', 'hunter2hunter']);
    expect(defaults).toEqual(['staging_secure_2026']);
  });

  it('allows the obvious placeholders documentation uses', () => {
    const sample = [
      'postgresql://user:password@localhost:5432/db',
      'postgresql://postgres:<your-password>@localhost:5432/db',
      'postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/x',
    ].join('\n');
    const urls = [...sample.matchAll(URL_WITH_PASSWORD)].map(m => m[1]);
    expect(urls.filter(p => !PLACEHOLDER.test(p))).toEqual([]);
  });
});
