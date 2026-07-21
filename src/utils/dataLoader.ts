/**
 * Unified Data Loading Utility
 *
 * World-class data fetching with:
 * - Consistent error handling
 * - Type safety
 * - Retry logic
 * - Loading state management
 * - Caching support
 */

import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';
import { resolveLocalDataAlias } from '@/data/localDataAliases';

// Get basePath from env — empty in dev, '/partner2' in production
const BASE_PATH = getConfiguredBasePath(process.env.NODE_ENV === 'production' ? '/partner2' : '');

/**
 * Add basePath to URL if needed
 */
function getFullUrl(url: string): string {
  const aliasedUrl = resolveLocalDataAlias(url);
  if (aliasedUrl) {
    const fullAliasedUrl = prependBasePath(aliasedUrl, BASE_PATH);
    console.log(`[Debug] getFullUrl remapped "${url}" to "${fullAliasedUrl}"`);
    return fullAliasedUrl;
  }

  // If URL is relative and starts with /, prepend basePath
  if (url.startsWith('/')) {
    const newUrl = prependBasePath(url, BASE_PATH);
    console.log(`[Debug] getFullUrl transforming "${url}" to "${newUrl}"`);
    return newUrl;
  }
  console.log(`[Debug] getFullUrl returning original URL: "${url}"`);
  return url;
}

/**
 * Ensure any abort reason becomes a DOMException with name 'AbortError'.
 * When abort() is called with a plain string (e.g. 'Component unmounted'),
 * fetch rejects with that string wrapped as a generic Error whose name is 'Error',
 * bypassing the lastError.name !== 'AbortError' filter.  Wrapping it here keeps
 * the filtering consistent across all callers.
 */
function toAbortReason(reason: unknown): DOMException {
  if (reason instanceof DOMException) return reason;
  return new DOMException(String(reason ?? 'Request cancelled'), 'AbortError');
}

export interface DataLoaderOptions {
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Cache the result (default: false) */
  cache?: boolean;
  /** Optional external abort signal */
  signal?: AbortSignal;
}

export interface DataLoaderResult<T> {
  data: T | null;
  error: Error | null;
  cached: boolean;
}

// Simple in-memory cache
const dataCache = new Map<string, any>();
// In-flight promise deduplication — prevents wasteful parallel fetches for the same URL
const inFlight = new Map<string, Promise<DataLoaderResult<unknown>>>();

/**
 * Generic data loader with retry logic and error handling
 * @param url - The URL to fetch from
 * @param options - Loading options
 * @returns Promise with data and error information
 */
export async function loadData<T>(
  url: string,
  options: DataLoaderOptions = {}
): Promise<DataLoaderResult<T>> {
  const { retries = 0, retryDelay = 1000, timeout = 30000, cache = false, signal } = options;

  const fullUrl = getFullUrl(url);

  // Check memory cache first
  if (cache && dataCache.has(fullUrl)) {
    return {
      data: dataCache.get(fullUrl) as T,
      error: null,
      cached: true,
    };
  }

  // Return an existing in-flight request so concurrent callers share one fetch
  if (cache && inFlight.has(fullUrl)) {
    return (await inFlight.get(fullUrl)!) as DataLoaderResult<T>;
  }

  const fetchTask = (async (): Promise<DataLoaderResult<unknown>> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeout);
        if (signal) {
          if (signal.aborted) {
            controller.abort(toAbortReason(signal.reason));
          } else {
            signal.addEventListener('abort', () => controller.abort(toAbortReason(signal.reason)), {
              once: true,
            });
          }
        }

        const response = await fetch(fullUrl, {
          signal: controller.signal,
          // Keep freshness at the HTTP layer; the utility's own in-memory cache
          // already handles dedupe/reuse within the current app session.
          cache: 'no-store',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as T;

        // Populate cache before resolving so late joiners hit cache on next call
        if (cache) {
          dataCache.set(fullUrl, data);
        }

        return {
          data,
          error: null,
          cached: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on last attempt
        if (attempt < retries) {
          await delay(retryDelay);
        }
      }
    }

    // Don't log AbortErrors as they are expected during component cleanup
    if (lastError && lastError.name !== 'AbortError') {
      console.error(`Failed to load data from ${url}:`, lastError);
    }
    return {
      data: null,
      error: lastError,
      cached: false,
    };
  })();

  if (cache) {
    inFlight.set(fullUrl, fetchTask);
    fetchTask.finally(() => inFlight.delete(fullUrl));
  }

  return (await fetchTask) as DataLoaderResult<T>;
}

/**
 * Load text data (CSV, plain text, etc.)
 * @param url - The URL to fetch from
 * @param options - Loading options
 * @returns Promise with text data
 */
export async function loadTextData(
  url: string,
  options: DataLoaderOptions = {}
): Promise<DataLoaderResult<string>> {
  const { retries = 0, retryDelay = 1000, timeout = 30000, cache = false, signal } = options;

  const fullUrl = getFullUrl(url);

  // Check memory cache first
  if (cache && dataCache.has(fullUrl)) {
    return {
      data: dataCache.get(fullUrl) as string,
      error: null,
      cached: true,
    };
  }

  // Return an existing in-flight request so concurrent callers share one fetch
  if (cache && inFlight.has(fullUrl)) {
    return (await inFlight.get(fullUrl)!) as DataLoaderResult<string>;
  }

  const fetchTask = (async (): Promise<DataLoaderResult<unknown>> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeout);
        if (signal) {
          if (signal.aborted) {
            controller.abort(toAbortReason(signal.reason));
          } else {
            signal.addEventListener('abort', () => controller.abort(toAbortReason(signal.reason)), {
              once: true,
            });
          }
        }

        const response = await fetch(fullUrl, {
          signal: controller.signal,
          // Avoid stale CSV/text responses being served from the browser cache.
          cache: 'no-store',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        if (cache) {
          dataCache.set(fullUrl, text);
        }

        return {
          data: text,
          error: null,
          cached: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          await delay(retryDelay);
        }
      }
    }

    // Don't log AbortErrors as they are expected during component cleanup
    if (lastError && lastError.name !== 'AbortError') {
      console.error(`Failed to load text data from ${url}:`, lastError);
    }
    return {
      data: null,
      error: lastError,
      cached: false,
    };
  })();

  if (cache) {
    inFlight.set(fullUrl, fetchTask);
    fetchTask.finally(() => inFlight.delete(fullUrl));
  }

  return (await fetchTask) as DataLoaderResult<string>;
}

/**
 * Load multiple resources in parallel
 * @param urls - Array of URLs to fetch
 * @param options - Loading options
 * @returns Promise with array of results
 */
export async function loadMultiple<T>(
  urls: string[],
  options: DataLoaderOptions = {}
): Promise<DataLoaderResult<T>[]> {
  const promises = urls.map(url => loadData<T>(url, options));
  return Promise.all(promises);
}

/**
 * Clear cache for a specific URL or all cache
 * @param url - Optional URL to clear (clears all if undefined)
 */
export function clearCache(url?: string): void {
  if (url) {
    dataCache.delete(url);
  } else {
    dataCache.clear();
  }
}

/**
 * Get cache size and stats
 * @returns Cache statistics
 */
export function getCacheStats(): {
  size: number;
  urls: string[];
} {
  return {
    size: dataCache.size,
    urls: Array.from(dataCache.keys()),
  };
}

/**
 * Delay helper for retry logic
 * @param ms - Milliseconds to delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Type-safe wrapper for loading JSON data
 * @param url - The URL to fetch from
 * @param options - Loading options
 * @returns Promise with typed data
 */
export async function loadJSON<T>(
  url: string,
  options: DataLoaderOptions = {}
): Promise<DataLoaderResult<T>> {
  return loadData<T>(url, options);
}

/**
 * Type-safe wrapper for loading GeoJSON data
 * @param url - The URL to fetch from
 * @param options - Loading options
 * @returns Promise with GeoJSON data
 */
export async function loadGeoJSON<T = GeoJSON.FeatureCollection>(
  url: string,
  options: DataLoaderOptions = {}
): Promise<DataLoaderResult<T>> {
  return loadData<T>(url, options);
}
