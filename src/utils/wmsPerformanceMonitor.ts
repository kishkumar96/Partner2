/**
 * WMS Performance Monitoring
 *
 * Tracks tile load times, cache hit rates, and provides analytics
 */

interface WMSMetric {
  url: string;
  timestamp: number;
  loadTime: number;
  cached: boolean;
  zoom: number;
  bbox?: string;
}

class WMSPerformanceMonitor {
  private metrics: WMSMetric[];
  private maxMetrics: number;
  private onMetricCallbacks: Array<(metric: WMSMetric) => void>;

  constructor(maxMetrics = 1000) {
    this.metrics = [];
    this.maxMetrics = maxMetrics;
    this.onMetricCallbacks = [];
  }

  /**
   * Record a tile load event
   */
  recordTileLoad(
    url: string,
    loadTime: number,
    cached: boolean,
    zoom?: number,
    bbox?: string
  ): void {
    const metric: WMSMetric = {
      url,
      timestamp: Date.now(),
      loadTime,
      cached,
      zoom: zoom ?? this.extractZoomFromUrl(url),
      bbox: bbox ?? this.extractBBoxFromUrl(url),
    };

    // Add to metrics
    this.metrics.push(metric);

    // Trim if exceeds max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Notify callbacks
    this.onMetricCallbacks.forEach(callback => callback(metric));

    // Log slow tiles
    if (loadTime > 2000) {
      console.warn('[WMS] Slow tile detected:', {
        url: this.truncateUrl(url),
        loadTime: `${loadTime.toFixed(0)}ms`,
        cached,
        zoom: metric.zoom,
      });
    }
  }

  /**
   * Subscribe to metric events
   */
  onMetric(callback: (metric: WMSMetric) => void): () => void {
    this.onMetricCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onMetricCallbacks.indexOf(callback);
      if (index > -1) {
        this.onMetricCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalTiles: number;
    cachedTiles: number;
    cacheHitRate: number;
    avgLoadTime: number;
    avgCachedTime: number;
    avgUncachedTime: number;
    p50LoadTime: number;
    p95LoadTime: number;
    p99LoadTime: number;
    slowTiles: number;
    byZoom: Record<number, { count: number; avgTime: number }>;
  } {
    if (this.metrics.length === 0) {
      return {
        totalTiles: 0,
        cachedTiles: 0,
        cacheHitRate: 0,
        avgLoadTime: 0,
        avgCachedTime: 0,
        avgUncachedTime: 0,
        p50LoadTime: 0,
        p95LoadTime: 0,
        p99LoadTime: 0,
        slowTiles: 0,
        byZoom: {},
      };
    }

    const total = this.metrics.length;
    const cached = this.metrics.filter(m => m.cached).length;
    const cacheHitRate = (cached / total) * 100;

    const loadTimes = this.metrics.map(m => m.loadTime).sort((a, b) => a - b);
    const cachedTimes = this.metrics.filter(m => m.cached).map(m => m.loadTime);
    const uncachedTimes = this.metrics.filter(m => !m.cached).map(m => m.loadTime);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[index];
    };

    // Group by zoom level
    const byZoom: Record<number, { count: number; avgTime: number }> = {};
    this.metrics.forEach(m => {
      if (!byZoom[m.zoom]) {
        byZoom[m.zoom] = { count: 0, avgTime: 0 };
      }
      byZoom[m.zoom].count++;
    });

    Object.keys(byZoom).forEach(zoom => {
      const zoomNum = parseInt(zoom);
      const zoomMetrics = this.metrics.filter(m => m.zoom === zoomNum);
      byZoom[zoomNum].avgTime = avg(zoomMetrics.map(m => m.loadTime));
    });

    return {
      totalTiles: total,
      cachedTiles: cached,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgLoadTime: Math.round(avg(loadTimes)),
      avgCachedTime: Math.round(avg(cachedTimes)),
      avgUncachedTime: Math.round(avg(uncachedTimes)),
      p50LoadTime: Math.round(percentile(loadTimes, 50)),
      p95LoadTime: Math.round(percentile(loadTimes, 95)),
      p99LoadTime: Math.round(percentile(loadTimes, 99)),
      slowTiles: this.metrics.filter(m => m.loadTime > 2000).length,
      byZoom,
    };
  }

  /**
   * Get recent metrics (last N)
   */
  getRecentMetrics(count = 10): WMSMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics as CSV
   */
  exportCSV(): string {
    const headers = ['timestamp', 'url', 'loadTime', 'cached', 'zoom', 'bbox'];
    const rows = this.metrics.map(m => [
      new Date(m.timestamp).toISOString(),
      this.truncateUrl(m.url),
      m.loadTime,
      m.cached,
      m.zoom,
      m.bbox || '',
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Log performance summary to console
   */
  logSummary(): void {
    const stats = this.getStats();

    console.group('[WMS Performance Summary]');
    console.log(`Total tiles loaded: ${stats.totalTiles}`);
    console.log(`Cache hit rate: ${stats.cacheHitRate.toFixed(1)}%`);
    console.log(`Average load time: ${stats.avgLoadTime}ms`);
    console.log(`  - Cached: ${stats.avgCachedTime}ms`);
    console.log(`  - Uncached: ${stats.avgUncachedTime}ms`);
    console.log(`Load time percentiles:`);
    console.log(`  - P50: ${stats.p50LoadTime}ms`);
    console.log(`  - P95: ${stats.p95LoadTime}ms`);
    console.log(`  - P99: ${stats.p99LoadTime}ms`);
    console.log(`Slow tiles (>2s): ${stats.slowTiles}`);
    console.log('By zoom level:', stats.byZoom);
    console.groupEnd();
  }

  private extractZoomFromUrl(url: string): number {
    // Try to extract from tile URL pattern
    const match = url.match(/\/(\d+)\/\d+\/\d+/);
    return match ? parseInt(match[1]) : 0;
  }

  private extractBBoxFromUrl(url: string): string {
    const match = url.match(/BBOX=([^&]+)/);
    return match ? match[1] : '';
  }

  private truncateUrl(url: string): string {
    return url.length > 100 ? url.substring(0, 97) + '...' : url;
  }
}

// Singleton instance
export const wmsPerformanceMonitor = new WMSPerformanceMonitor();

/**
 * Wrapper for fetchWMSTile with performance monitoring
 */
export async function fetchWMSTileWithMonitoring(
  url: string,
  fetchFn: () => Promise<Blob>,
  cached: boolean = false,
  zoom?: number
): Promise<Blob> {
  const startTime = performance.now();

  try {
    const blob = await fetchFn();
    const loadTime = performance.now() - startTime;

    wmsPerformanceMonitor.recordTileLoad(url, loadTime, cached, zoom);

    return blob;
  } catch (error) {
    const loadTime = performance.now() - startTime;
    wmsPerformanceMonitor.recordTileLoad(url, loadTime, cached, zoom);
    throw error;
  }
}

/**
 * React hook for WMS performance stats
 */
export function useWMSPerformanceStats(refreshInterval = 5000) {
  const [stats, setStats] = React.useState(wmsPerformanceMonitor.getStats());

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats(wmsPerformanceMonitor.getStats());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  return stats;
}

// Auto-log summary every 30 seconds in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const stats = wmsPerformanceMonitor.getStats();
    if (stats.totalTiles > 0) {
      wmsPerformanceMonitor.logSummary();
    }
  }, 30000);
}

import React from 'react';
