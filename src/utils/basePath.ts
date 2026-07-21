function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export function normalizeBasePath(basePath: string | undefined | null): string {
  const trimmed = (basePath ?? '').trim();
  if (!trimmed || trimmed === '/' || trimmed.toLowerCase() === 'root') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return stripTrailingSlash(withLeadingSlash);
}

export function getConfiguredBasePath(fallback = ''): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? fallback);
}

export function prependBasePath(path: string, basePath = getConfiguredBasePath()): string {
  if (!path.startsWith('/')) {
    return path;
  }

  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  return `${basePath}${path}`;
}
