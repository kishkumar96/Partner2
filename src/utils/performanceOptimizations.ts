/**
 * Performance Optimization Utilities
 *
 * Helper functions to prevent forced reflows and optimize critical rendering path.
 */

/**
 * Batch DOM measurements to prevent forced layout/reflow
 * Read all layout properties first, then make all DOM updates
 */
export function batchDOMOperations<T>(
  reads: Array<() => any>,
  writes: Array<(measurements: any[]) => void>
): void {
  // Phase 1: Read all measurements (causes single reflow)
  const measurements = reads.map(read => read());

  // Phase 2: Apply all changes (no additional reflows)
  writes.forEach(write => write(measurements));
}

/**
 * Debounce function for resize handlers to prevent excessive reflows
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Use requestAnimationFrame to batch visual updates
 */
export function scheduleVisualUpdate(callback: () => void): void {
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    requestAnimationFrame(callback);
  } else {
    callback();
  }
}

/**
 * Lazy component loader with optional timeout to improve perceived performance
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  preloadDelay?: number
) {
  const LazyComponent = React.lazy(factory);

  // Optional: preload after a delay
  if (preloadDelay && typeof window !== 'undefined') {
    setTimeout(() => factory(), preloadDelay);
  }

  return LazyComponent;
}

/**
 * Check if element is in viewport (for lazy loading)
 */
export function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Prevent layout thrashing by caching layout reads
 */
class LayoutCache {
  private cache = new Map<string, { value: any; timestamp: number }>();
  private ttl: number;

  constructor(ttl: number = 100) {
    this.ttl = ttl;
  }

  get(key: string, reader: () => any): any {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && now - cached.timestamp < this.ttl) {
      return cached.value;
    }

    const value = reader();
    this.cache.set(key, { value, timestamp: now });
    return value;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const layoutCache = new LayoutCache();

import React from 'react';
