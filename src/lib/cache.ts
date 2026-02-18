/**
 * Redis Cache Client
 * Provides caching utilities for database queries and API responses
 */

import { createClient, RedisClientType } from 'redis';

// Redis connection URL from environment
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis_secure_2026@localhost:6379';

// Cache TTL (Time To Live) settings
export const CacheTTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
};

class RedisCache {
  private client: RedisClientType | null = null;
  private connected: boolean = false;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.client = createClient({
        url: REDIS_URL,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('Redis: Max reconnection attempts reached');
              return new Error('Max reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err: Error) => {
        console.error('Redis client error:', err);
      });

      this.client.on('connect', () => {
        console.log('✓ Redis connected');
      });

      this.client.on('reconnecting', () => {
        console.log('⟳ Redis reconnecting...');
      });

      await this.client.connect();
      this.connected = true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);

      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      console.error(`Redis delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set cached value
   * If key doesn't exist, execute callback and cache result
   */
  async getOrSet<T = any>(
    key: string,
    callback: () => Promise<T>,
    ttl: number = CacheTTL.MEDIUM
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute callback to get fresh data
    const value = await callback();

    // Cache the result
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Increment counter
   */
  async increment(key: string, by: number = 1): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      return await this.client.incrBy(key, by);
    } catch (error) {
      console.error(`Redis increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      console.error(`Redis expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    connected: boolean;
  }> {
    if (!this.connected || !this.client) {
      return { keys: 0, memory: '0', connected: false };
    }

    try {
      const keys = await this.client.dbSize();
      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memory = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        keys,
        memory,
        connected: true,
      };
    } catch (error) {
      console.error('Redis stats error:', error);
      return { keys: 0, memory: '0', connected: false };
    }
  }

  /**
   * Flush all cache
   */
  async flush(): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.flushDb();
      console.log('✓ Redis cache flushed');
      return true;
    } catch (error) {
      console.error('Redis flush error:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.connected && this.client) {
      await this.client.quit();
      this.connected = false;
      console.log('✓ Redis disconnected');
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Create singleton instance
const cache = new RedisCache();

// Initialize connection on module load (in Node.js environment only)
if (typeof window === 'undefined') {
  cache.connect().catch(console.error);
}

// Export singleton instance
export default cache;

// Export class and TTL constants
export { RedisCache, cache };

/**
 * Utility function to generate cache key
 */
export function cacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Cache key prefixes for organization
 */
export const CachePrefix = {
  BUILDINGS: 'buildings',
  ROADS: 'roads',
  REGIONS: 'regions',
  SECTORS: 'sectors',
  STATS: 'stats',
  TILES: 'tiles',
};
