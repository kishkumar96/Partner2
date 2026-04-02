/**
 * Optimized Data Loader - Ultra-Fast Version
 *
 * Combines all performance optimizations:
 * - IndexedDB caching for instant subsequent loads
 * - Web Worker parsing for large files
 * - Progressive/lazy loading
 * - Streaming for huge files
 */

import { dataCache } from './dataCache';
import { dataParserWorker } from './dataParserClient';
import { lazyLoader } from './lazyDataLoader';

export interface FastLoadOptions {
  useCache?: boolean;
  useWorker?: boolean;
  priority?: 'critical' | 'high' | 'low';
  defer?: boolean;
  filter?: Record<string, unknown>;
  onProgress?: (progress: number) => void;
}

type GeoJSONFeatureWithProperties = {
  properties?: Record<string, unknown>;
};

type GeoJSONCollectionWithFeatures = {
  features?: GeoJSONFeatureWithProperties[];
  [key: string]: unknown;
};

/**
 * Ultra-fast GeoJSON loader with all optimizations
 */
export async function loadGeoJSONFast(
  url: string,
  options: FastLoadOptions = {}
): Promise<unknown> {
  const {
    useCache = true,
    useWorker = true,
    priority = 'high',
    defer = false,
    filter,
    onProgress,
  } = options;

  const startTime = performance.now();

  try {
    // Use lazy loader for automatic prioritization
    if (defer) {
      return await lazyLoader.load(url, { priority, defer, onProgress });
    }

    // Try cache first (IndexedDB)
    if (useCache) {
      const cached = await dataCache.get(url);
      if (cached) {
        const loadTime = performance.now() - startTime;
        console.log(`${url} loaded from cache in ${loadTime.toFixed(0)}ms`);
        return cached;
      }
    }

    // Fetch from network
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const fetchTime = performance.now() - startTime;
    console.log(`${url} fetched in ${fetchTime.toFixed(0)}ms`);

    // Parse with worker for large files (>1MB)
    let data;
    if (useWorker && text.length > 1024 * 1024) {
      data = await dataParserWorker.parseGeoJSON(text, { filter, onProgress });
      const totalTime = performance.now() - startTime;
      console.log(`${url} parsed with worker in ${totalTime.toFixed(0)}ms`);
    } else {
      // Small files: parse on main thread
      data = JSON.parse(text);

      // Apply filter if needed
      const collection = data as GeoJSONCollectionWithFeatures;
      if (filter && collection.features) {
        collection.features = collection.features.filter(feature => {
          const properties = feature.properties || {};
          for (const key in filter) {
            if (properties[key] !== filter[key]) return false;
          }
          return true;
        });
      }

      const totalTime = performance.now() - startTime;
      console.log(`${url} loaded in ${totalTime.toFixed(0)}ms`);
    }

    // Cache for next time (fire and forget)
    if (useCache) {
      dataCache.set(url, data).catch(console.error);
    }

    return data;
  } catch (error) {
    console.error(`Failed to load ${url}:`, error);
    throw error;
  }
}

/**
 * Load CSV with caching
 */
export async function loadCSVFast(url: string, options: FastLoadOptions = {}): Promise<string> {
  const { useCache = true, priority = 'high', defer = false } = options;

  try {
    // Use lazy loader if deferred
    if (defer) {
      const deferredData = await lazyLoader.load(url, { priority, defer });
      if (typeof deferredData !== 'string') {
        throw new Error(`Expected CSV text from lazy loader for ${url}`);
      }
      return deferredData;
    }

    // Try cache first
    if (useCache) {
      const cached = await dataCache.get(url);
      if (typeof cached === 'string') {
        console.log(`${url} loaded from cache`);
        return cached;
      }
    }

    // Fetch from network
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    console.log(`${url} loaded`);

    // Cache
    if (useCache) {
      dataCache.set(url, text).catch(console.error);
    }

    return text;
  } catch (error) {
    console.error(`Failed to load ${url}:`, error);
    throw error;
  }
}

/**
 * Load large file only when condition is met
 * Example: damaged-buildings only when map is zoomed in
 */
export async function loadConditional(
  url: string,
  condition: () => boolean,
  options: FastLoadOptions = {}
): Promise<unknown | null> {
  if (!condition()) {
    console.log(`Skipping ${url} - condition not met`);
    return null;
  }

  console.log(`Condition met for ${url} - loading...`);
  return loadGeoJSONFast(url, options);
}

/**
 * Preload file in the background (fire and forget)
 */
export function preload(url: string, options: FastLoadOptions = {}): void {
  // Don't await - let it load in background
  loadGeoJSONFast(url, { ...options, defer: true }).catch(error => {
    console.warn(`Background preload failed for ${url}:`, error);
  });
}

/**
 * Clear all caches (useful for forcing refresh)
 */
export async function clearAllCaches(): Promise<void> {
  await dataCache.clear();
  lazyLoader.clear();
  console.log('All caches cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    lazy: lazyLoader.getStats(),
  };
}
