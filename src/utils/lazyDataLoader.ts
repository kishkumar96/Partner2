/**
 * Lazy Data Loader with Progressive Loading
 *
 * Optimizes large dataset loading by:
 * - Loading only essential data first
 * - Deferring heavy data until needed
 * - Supporting viewport-based loading for maps
 * - Providing loading progress feedback
 */

import { fetchWithCache } from './dataCache';

export interface LoadOptions {
  priority?: 'critical' | 'high' | 'low';
  defer?: boolean;
  useCache?: boolean;
  onProgress?: (loaded: number, total: number) => void;
}

export interface DataManifest {
  critical: string[];
  high: string[];
  low: string[];
}

/**
 * Data loading manifest - defines what to load when
 */
export const DATA_MANIFEST: DataManifest = {
  // Load immediately - small, essential files
  critical: [
    '/cyclone-track.geojson',
    '/national-summary.csv',
    '/impact-by-sector.csv',
    '/impact-by-asset-type.csv',
  ],

  // Load after critical - medium-sized files
  high: [
    '/regional-summary.csv',
    '/regional-summary-by-sector.csv',
    '/cyclone-lola-forecast.csv',
    '/exposure-by-cluster.geojson',
  ],

  // Load on demand - large files
  low: [
    '/regional-impacts-by-sector.geojson',
    '/regional-impacts.geojson',
    '/damaged-roads.geojson',
  ],
};

/**
 * Special handling for massive files - only load when explicitly requested
 * These are loaded in chunks or with special optimization
 */
export const DEFERRED_LARGE_FILES = [
  '/damaged-buildings.geojson', // 35MB - load only for specific zoom levels
];

class LazyDataLoader {
  private loadedFiles = new Map<string, any>();
  private loadingPromises = new Map<string, Promise<any>>();

  /**
   * Load data with specified priority
   */
  async load(url: string, options: LoadOptions = {}): Promise<any> {
    const { priority = 'high', defer = false, useCache = true, onProgress } = options;

    // Return cached if already loaded
    if (this.loadedFiles.has(url)) {
      return this.loadedFiles.get(url);
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url);
    }

    // Defer low priority loads
    if (defer && priority === 'low') {
      return this.deferLoad(url, options);
    }

    // Start loading
    const loadPromise = this.fetchData(url, useCache, onProgress);
    this.loadingPromises.set(url, loadPromise);

    try {
      const data = await loadPromise;
      this.loadedFiles.set(url, data);
      this.loadingPromises.delete(url);
      return data;
    } catch (error) {
      this.loadingPromises.delete(url);
      throw error;
    }
  }

  /**
   * Load all files in a priority group
   */
  async loadGroup(
    priority: 'critical' | 'high' | 'low',
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Record<string, any>> {
    const files = DATA_MANIFEST[priority];
    const results: Record<string, any> = {};

    let loaded = 0;
    const total = files.length;

    for (const file of files) {
      try {
        results[file] = await this.load(file, { priority, useCache: true });
        loaded++;
        onProgress?.(loaded, total);
      } catch (error) {
        console.error(`Failed to load ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * Progressive loading strategy - load in order of priority
   */
  async loadProgressive(
    onProgress?: (stage: string, loaded: number, total: number) => void
  ): Promise<{
    critical: Record<string, any>;
    high: Record<string, any>;
    low: Record<string, any>;
  }> {
    console.log('Starting progressive data load...');

    // Phase 1: Critical data (load immediately)
    onProgress?.('critical', 0, DATA_MANIFEST.critical.length);
    const critical = await this.loadGroup('critical', (loaded, total) => {
      onProgress?.('critical', loaded, total);
    });
    console.log(`Critical data loaded (${DATA_MANIFEST.critical.length} files)`);

    // Phase 2: High priority (load next)
    setTimeout(async () => {
      onProgress?.('high', 0, DATA_MANIFEST.high.length);
      await this.loadGroup('high', (loaded, total) => {
        onProgress?.('high', loaded, total);
      });
      console.log(`High priority data loaded (${DATA_MANIFEST.high.length} files)`);
    }, 100);

    // Phase 3: Low priority (defer)
    setTimeout(async () => {
      onProgress?.('low', 0, DATA_MANIFEST.low.length);
      await this.loadGroup('low', (loaded, total) => {
        onProgress?.('low', loaded, total);
      });
      console.log(`Low priority data loaded (${DATA_MANIFEST.low.length} files)`);
    }, 500);

    return {
      critical,
      high: {},
      low: {},
    };
  }

  /**
   * Load large files only when explicitly needed
   * Example: damaged-buildings.geojson only when zoomed in
   */
  async loadLargeFileOnDemand(
    url: string,
    condition: () => boolean,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<any> {
    if (!condition()) {
      console.log(`Skipping large file ${url} - condition not met`);
      return null;
    }

    console.log(`Loading large file ${url}...`);
    return this.load(url, { priority: 'low', useCache: true, onProgress });
  }

  /**
   * Defer loading until idle time
   */
  private deferLoad(url: string, options: LoadOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(
          async () => {
            try {
              const data = await this.load(url, { ...options, defer: false });
              resolve(data);
            } catch (error) {
              reject(error);
            }
          },
          { timeout: 2000 }
        );
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(async () => {
          try {
            const data = await this.load(url, { ...options, defer: false });
            resolve(data);
          } catch (error) {
            reject(error);
          }
        }, 1000);
      }
    });
  }

  /**
   * Fetch data with progress tracking
   */
  private async fetchData(
    url: string,
    useCache: boolean,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<any> {
    if (useCache) {
      return fetchWithCache(url);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Stream response for progress tracking
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!total || !response.body) {
      return response.json();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }

    const blob = new Blob(chunks as BlobPart[]);
    const text = await blob.text();
    return JSON.parse(text);
  }

  /**
   * Clear loaded data to free memory
   */
  clear(url?: string): void {
    if (url) {
      this.loadedFiles.delete(url);
      console.log(`Cleared ${url} from memory`);
    } else {
      this.loadedFiles.clear();
      console.log('Cleared all loaded data from memory');
    }
  }

  /**
   * Get loading statistics
   */
  getStats(): {
    loaded: number;
    loading: number;
    totalSize: number;
  } {
    const totalSize = Array.from(this.loadedFiles.values()).reduce((sum, data) => {
      return sum + JSON.stringify(data).length;
    }, 0);

    return {
      loaded: this.loadedFiles.size,
      loading: this.loadingPromises.size,
      totalSize,
    };
  }
}

// Singleton instance
export const lazyLoader = new LazyDataLoader();
