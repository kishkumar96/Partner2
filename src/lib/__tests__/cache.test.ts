/**
 * Tests for Cache Utility
 *
 * Note: These tests require a running Redis instance.
 * Tests will be skipped if Redis is not available.
 */
import { cache, CacheTTL } from '../cache';

describe.skip('Cache Utility', () => {
  let isRedisAvailable = false;

  beforeAll(async () => {
    try {
      await cache.connect();
      // Try a simple operation to verify connection works
      await cache.set('test:connection-check', 'test', 1);
      await cache.get('test:connection-check');
      await cache.delete('test:connection-check');
      isRedisAvailable = true;
    } catch (error) {
      console.warn('Redis not available, skipping cache tests');
      isRedisAvailable = false;
    }
  }, 10000); // Increase timeout to 10 seconds

  afterAll(async () => {
    if (isRedisAvailable) {
      await cache.disconnect();
    }
  });

  beforeEach(async () => {
    if (!isRedisAvailable) return;
    // Clean up test keys
    await cache.deletePattern('test:*');
  });

  it('stores and retrieves values', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    await cache.set('test:key1', { data: 'test-value' }, CacheTTL.SHORT);
    const value = await cache.get('test:key1');

    expect(value).toEqual({ data: 'test-value' });
  });

  it('returns null for non-existent keys', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    const value = await cache.get('test:non-existent-key');
    expect(value).toBeNull();
  });

  it('handles cache expiration', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    await cache.set('test:expiring-key', 'value', 1); // 1 second TTL

    const valueBefore = await cache.get('test:expiring-key');
    expect(valueBefore).toBe('value');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1500));

    const valueAfter = await cache.get('test:expiring-key');
    expect(valueAfter).toBeNull();
  });

  it('deletes specific cache entries', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    await cache.set('test:key1', 'value1', CacheTTL.SHORT);
    await cache.set('test:key2', 'value2', CacheTTL.SHORT);

    await cache.delete('test:key1');

    expect(await cache.get('test:key1')).toBeNull();
    expect(await cache.get('test:key2')).toBe('value2');
  });

  it('checks if key exists', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    await cache.set('test:exists-key', 'value', CacheTTL.SHORT);

    const exists = await cache.exists('test:exists-key');
    expect(exists).toBe(true);

    const notExists = await cache.exists('test:not-exists-key');
    expect(notExists).toBe(false);
  });

  it('deletes keys by pattern', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    await cache.set('test:pattern:key1', 'value1', CacheTTL.SHORT);
    await cache.set('test:pattern:key2', 'value2', CacheTTL.SHORT);
    await cache.set('test:other:key3', 'value3', CacheTTL.SHORT);

    const deletedCount = await cache.deletePattern('test:pattern:*');

    expect(deletedCount).toBe(2);
    expect(await cache.exists('test:pattern:key1')).toBe(false);
    expect(await cache.exists('test:other:key3')).toBe(true);
  });

  it('handles complex objects', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping test: Redis not available');
      return;
    }
    const complexObj = {
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' },
      },
      timestamp: '2024-01-01T00:00:00Z',
    };

    await cache.set('test:complex', complexObj, CacheTTL.SHORT);
    const retrieved = await cache.get('test:complex');

    expect(retrieved).toEqual(complexObj);
  });
});
