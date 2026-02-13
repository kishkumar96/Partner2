/**
 * Performance Monitoring Utility
 * Track Web Vitals and custom performance metrics
 */

import { analytics } from './analytics';
import { trackPerformance } from './errorTracking';

// Web Vitals metric types
export type Metric = {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
};

/**
 * Report Web Vitals to analytics
 */
export const reportWebVitals = (metric: Metric) => {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Web Vital:', {
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
    });
  }

  // Send to analytics
  analytics.performance(metric.name, metric.value);
  
  // Send to error tracking
  trackPerformance(metric.name, metric.value);

  // You can also send to your own backend
  // sendToAnalytics(metric);
};

/**
 * Measure component render time
 */
export const measureRenderTime = (componentName: string, startTime: number) => {
  const endTime = performance.now();
  const duration = endTime - startTime;

  if (process.env.NODE_ENV === 'development') {
    console.log(`${componentName} rendered in ${duration.toFixed(2)}ms`);
  }

  // Track if render is slow (> 100ms)
  if (duration > 100) {
    analytics.performance(`${componentName}_slow_render`, duration);
  }

  return duration;
};

/**
 * Measure data loading time
 */
export const measureDataLoad = async <T>(
  operation: string,
  loadFn: () => Promise<T>
): Promise<T> => {
  const startTime = performance.now();
  
  try {
    const result = await loadFn();
    const duration = performance.now() - startTime;

    if (process.env.NODE_ENV === 'development') {
      console.log(`${operation} loaded in ${duration.toFixed(2)}ms`);
    }

    analytics.performance(`data_load_${operation}`, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    analytics.error(`${operation}_load_failed`, String(error));
    throw error;
  }
};

/**
 * Track API call performance
 */
export const trackAPICall = async <T>(
  endpoint: string,
  fetchFn: () => Promise<T>
): Promise<T> => {
  const startTime = performance.now();
  
  try {
    const result = await fetchFn();
    const duration = performance.now() - startTime;

    analytics.performance(`api_${endpoint}`, duration);
    
    // Alert if API is slow
    if (duration > 3000) {
      console.warn(`Slow API call: ${endpoint} took ${duration.toFixed(2)}ms`);
    }

    return result;
  } catch (error) {
    analytics.error(`api_${endpoint}_failed`, String(error));
    throw error;
  }
};

/**
 * Monitor memory usage
 */
export const monitorMemory = () => {
  if (typeof window === 'undefined' || !('performance' in window)) {
    return;
  }

  // Check if Performance Memory API is available
  const performance = window.performance as any;
  if (performance.memory) {
    const memoryInfo = {
      usedJSHeapSize: performance.memory.usedJSHeapSize / 1048576, // MB
      totalJSHeapSize: performance.memory.totalJSHeapSize / 1048576, // MB
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit / 1048576, // MB
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('Memory Usage:', {
        used: `${memoryInfo.usedJSHeapSize.toFixed(2)} MB`,
        total: `${memoryInfo.totalJSHeapSize.toFixed(2)} MB`,
        limit: `${memoryInfo.jsHeapSizeLimit.toFixed(2)} MB`,
      });
    }

    // Alert if memory usage is high (> 80% of limit)
    const usagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
    if (usagePercent > 80) {
      console.warn(`High memory usage: ${usagePercent.toFixed(2)}%`);
      analytics.performance('memory_high', usagePercent);
    }

    return memoryInfo;
  }
};

/**
 * Track long tasks (> 50ms)
 */
export const observeLongTasks = () => {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          console.warn(
            `Long task detected: ${entry.duration.toFixed(2)}ms`,
            entry
          );
          analytics.performance('long_task', entry.duration);
        }
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
  } catch (e) {
    // PerformanceObserver may not be fully supported
    console.warn('Long task observer not available');
  }
};

/**
 * Track page load performance
 */
export const trackPageLoad = () => {
  if (typeof window === 'undefined' || !('performance' in window)) {
    return;
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      const perfData = window.performance.timing;
      const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
      const connectTime = perfData.responseEnd - perfData.requestStart;
      const renderTime = perfData.domComplete - perfData.domLoading;

      if (process.env.NODE_ENV === 'development') {
        console.log('Page Load Metrics:', {
          pageLoad: `${pageLoadTime}ms`,
          connection: `${connectTime}ms`,
          render: `${renderTime}ms`,
        });
      }

      analytics.performance('page_load_time', pageLoadTime);
      analytics.performance('connection_time', connectTime);
      analytics.performance('render_time', renderTime);
    }, 0);
  });
};

/**
 * Initialize performance monitoring
 */
export const initPerformanceMonitoring = () => {
  if (typeof window === 'undefined') return;

  // Track page load
  trackPageLoad();

  // Observe long tasks
  observeLongTasks();

  // Monitor memory periodically (every 30 seconds)
  setInterval(() => {
    monitorMemory();
  }, 30000);

  // Report Web Vitals (requires web-vitals package)
  if (process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true') {
    import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB, onINP }) => {
      onCLS(reportWebVitals);
      onFID(reportWebVitals);
      onFCP(reportWebVitals);
      onLCP(reportWebVitals);
      onTTFB(reportWebVitals);
      onINP(reportWebVitals);
    }).catch(() => {
      console.warn('web-vitals package not available');
    });
  }
};

export default {
  reportWebVitals,
  measureRenderTime,
  measureDataLoad,
  trackAPICall,
  monitorMemory,
  initPerformanceMonitoring,
};
