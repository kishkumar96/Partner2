/**
 * IndexedDB Cache for Large Data Files
 *
 * Provides persistent caching for large GeoJSON and CSV files
 * - Instant loading after first fetch
 * - Version-based invalidation
 * - Automatic cleanup of old data
 */

const DB_NAME = 'ClimateDataCache';
const DB_VERSION = 1;
const STORE_NAME = 'dataFiles';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedData {
  url: string;
  data: any;
  timestamp: number;
  version: string;
  size: number;
}

class DataCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB failed to open:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB cache initialized');
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('Created IndexedDB object store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get cached data if valid
   */
  async get(url: string, version: string = '1.0'): Promise<any | null> {
    try {
      await this.init();
      if (!this.db) return null;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onsuccess = () => {
          const cached = request.result as CachedData | undefined;

          if (!cached) {
            resolve(null);
            return;
          }

          // Check if cache is expired
          const age = Date.now() - cached.timestamp;
          if (age > CACHE_DURATION) {
            console.log(`Cache expired for ${url} (${Math.round(age / 1000 / 60)} minutes old)`);
            resolve(null);
            return;
          }

          // Check version
          if (cached.version !== version) {
            console.log(`Cache version mismatch for ${url}`);
            resolve(null);
            return;
          }

          console.log(`Cache hit for ${url} (${(cached.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve(cached.data);
        };

        request.onerror = () => {
          console.error('IndexedDB get error:', request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store data in cache
   */
  async set(url: string, data: any, version: string = '1.0'): Promise<void> {
    try {
      await this.init();
      if (!this.db) return;

      const size = JSON.stringify(data).length;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const cached: CachedData = {
          url,
          data,
          timestamp: Date.now(),
          version,
          size,
        };

        const request = store.put(cached);

        request.onsuccess = () => {
          console.log(`Cached ${url} (${(size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        };

        request.onerror = () => {
          console.error('IndexedDB put error:', request.error);
          resolve(); // Don't fail if caching fails
        };
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Clear old cached data
   */
  async cleanup(): Promise<void> {
    try {
      await this.init();
      if (!this.db) return;

      const cutoff = Date.now() - CACHE_DURATION;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor();

        let deletedCount = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const cached = cursor.value as CachedData;
            if (cached.timestamp < cutoff) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            if (deletedCount > 0) {
              console.log(`Cleaned up ${deletedCount} expired cache entries`);
            }
            resolve();
          }
        };

        request.onerror = () => {
          console.error('Cleanup error:', request.error);
          resolve();
        };
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      await this.init();
      if (!this.db) return;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('Cache cleared');
          resolve();
        };

        request.onerror = () => {
          console.error('Clear error:', request.error);
          resolve();
        };
      });
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

// Singleton instance
export const dataCache = new DataCache();

/**
 * Enhanced fetch with IndexedDB caching
 */
export async function fetchWithCache(
  url: string,
  options: {
    version?: string;
    forceRefresh?: boolean;
  } = {}
): Promise<any> {
  const { version = '1.0', forceRefresh = false } = options;

  // Try cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = await dataCache.get(url, version);
    if (cached) {
      return cached;
    }
  }

  // Fetch from network
  console.log(`Fetching ${url}...`);
  const startTime = performance.now();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const loadTime = performance.now() - startTime;

  console.log(`Loaded ${url} in ${loadTime.toFixed(0)}ms`);

  // Cache for next time (don't await - fire and forget)
  dataCache.set(url, data, version).catch(console.error);

  return data;
}

// Auto-cleanup on load
if (typeof window !== 'undefined') {
  dataCache.cleanup().catch(console.error);
}
