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

// Get basePath from Next.js config
const BASE_PATH = '/partner2';

/**
 * Add basePath to URL if needed
 */
function getFullUrl(url: string): string {
  // If URL is relative and starts with /, prepend basePath
  if (url.startsWith('/') && !url.startsWith(BASE_PATH)) {
    return `${BASE_PATH}${url}`;
  }
  return url;
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

  // Check cache first
  if (cache && dataCache.has(fullUrl)) {
    return {
      data: dataCache.get(fullUrl) as T,
      error: null,
      cached: true,
    };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeout);
      if (signal) {
        if (signal.aborted) {
          controller.abort(signal.reason || new Error('Request cancelled'));
        } else {
          signal.addEventListener(
            'abort',
            () => {
              controller.abort(signal.reason || new Error('Request cancelled'));
            },
            { once: true }
          );
        }
      }

      const response = await fetch(fullUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T;

      // Cache if requested
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

  // Check cache first
  if (cache && dataCache.has(fullUrl)) {
    return {
      data: dataCache.get(fullUrl) as string,
      error: null,
      cached: true,
    };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeout);
      if (signal) {
        if (signal.aborted) {
          controller.abort(signal.reason || new Error('Request cancelled'));
        } else {
          signal.addEventListener(
            'abort',
            () => {
              controller.abort(signal.reason || new Error('Request cancelled'));
            },
            { once: true }
          );
        }
      }

      const response = await fetch(fullUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Cache if requested
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
