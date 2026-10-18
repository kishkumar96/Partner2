/**
 * WMS Tile Cache Implementation
 *
 * Caches WMS tiles in memory and IndexedDB for fast retrieval
 */

interface TileCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  maxAge: number; // milliseconds
}

class WMSTileCache {
  private memoryCache: Map<string, TileCacheEntry>;
  private dbName: string;
  private storeName: string;
  private maxMemoryEntries: number;
  private db: IDBDatabase | null;

  constructor(dbName = 'wms-tile-cache', storeName = 'tiles', maxMemoryEntries = 100) {
    this.memoryCache = new Map();
    this.dbName = dbName;
    this.storeName = storeName;
    this.maxMemoryEntries = maxMemoryEntries;
    this.db = null;
    this.initIndexedDB();
  }

  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private getCacheKey(url: string): string {
    // Normalize URL for consistent caching
    return new URL(url).href;
  }

  /**
   * Check if cached tile is still valid
   */
  private isValid(entry: TileCacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.maxAge;
  }

  /**
   * Get tile from memory or IndexedDB
   */
  async get(url: string): Promise<Blob | null> {
    const key = this.getCacheKey(url);

    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && this.isValid(memEntry)) {
      console.log('[WMS Cache] Memory hit:', key);
      return memEntry.blob;
    }

    // Check IndexedDB
    if (!this.db) await this.initIndexedDB();

    try {
      const entry = await this.getFromDB(key);
      if (entry && this.isValid(entry)) {
        console.log('[WMS Cache] IndexedDB hit:', key);
        // Promote to memory cache
        this.setMemoryCache(key, entry);
        return entry.blob;
      }
    } catch (error) {
      console.error('[WMS Cache] IndexedDB read error:', error);
    }

    console.log('[WMS Cache] Miss:', key);
    return null;
  }

  /**
   * Store tile in cache
   */
  async set(url: string, blob: Blob, maxAge = 3600000): Promise<void> {
    const key = this.getCacheKey(url);
    const entry: TileCacheEntry = {
      url,
      blob,
      timestamp: Date.now(),
      maxAge,
    };

    // Store in memory
    this.setMemoryCache(key, entry);

    // Store in IndexedDB
    try {
      await this.setInDB(key, entry);
    } catch (error) {
      console.error('[WMS Cache] IndexedDB write error:', error);
    }
  }

  private setMemoryCache(key: string, entry: TileCacheEntry): void {
    // Implement LRU eviction
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const firstKey = this.memoryCache.keys().next().value;
      if (typeof firstKey === 'string') {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(key, entry);
  }

  private getFromDB(key: string): Promise<TileCacheEntry | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private setInDB(key: string, entry: TileCacheEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cached tiles
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (!this.db) await this.initIndexedDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[WMS Cache] Cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove expired entries
   */
  async prune(): Promise<void> {
    if (!this.db) await this.initIndexedDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry: TileCacheEntry = cursor.value;
          if (!this.isValid(entry)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ memoryEntries: number; dbEntries: number }> {
    const memoryEntries = this.memoryCache.size;

    if (!this.db) await this.initIndexedDB();

    return new Promise(resolve => {
      if (!this.db) {
        resolve({ memoryEntries, dbEntries: 0 });
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => {
        resolve({
          memoryEntries,
          dbEntries: request.result,
        });
      };

      request.onerror = () => {
        resolve({ memoryEntries, dbEntries: 0 });
      };
    });
  }
}

// Singleton instance
export const wmsTileCache = new WMSTileCache();

/**
 * Fetch WMS tile with caching
 */
export async function fetchWMSTile(
  url: string,
  maxAge = 3600000 // 1 hour default
): Promise<Blob> {
  // Try cache first
  const cached = await wmsTileCache.get(url);
  if (cached) {
    return cached;
  }

  // Fetch from server
  console.log('[WMS] Fetching tile:', url);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`WMS tile fetch failed: ${response.statusText}`);
  }

  const blob = await response.blob();

  // Cache the result
  await wmsTileCache.set(url, blob, maxAge);

  return blob;
}

/**
 * Prefetch tiles for a region (optional optimization)
 */
export async function prefetchWMSTiles(urls: string[]): Promise<void> {
  const fetchPromises = urls.map(url =>
    fetchWMSTile(url).catch(error => {
      console.error('[WMS] Prefetch failed for', url, error);
    })
  );

  await Promise.all(fetchPromises);
}
