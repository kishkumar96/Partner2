/**
 * Analytics Module
 * Centralized analytics tracking for the application
 */

// Types
export type AnalyticsEvent = {
  action: string;
  category: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
};

// Check if analytics is enabled
const isAnalyticsEnabled =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

/**
 * Initialize analytics (Google Analytics, Plausible, etc.)
 */
export const initAnalytics = () => {
  if (!isAnalyticsEnabled) return;

  // Google Analytics
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (gaId && typeof window !== 'undefined') {
    // Load GA script
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    script.async = true;
    document.head.appendChild(script);

    // Initialize GA
    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) {
      window.dataLayer.push(args);
    }
    gtag('js', new Date());
    gtag('config', gaId, {
      page_path: window.location.pathname,
      send_page_view: true,
    });
  }

  // Plausible Analytics (privacy-friendly alternative)
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (plausibleDomain && typeof window !== 'undefined') {
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', plausibleDomain);
    script.src = 'https://plausible.io/js/plausible.js';
    document.head.appendChild(script);
  }
};

/**
 * Track page view
 */
export const trackPageView = (url: string) => {
  if (!isAnalyticsEnabled) return;

  // Google Analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, {
      page_path: url,
    });
  }

  // Plausible
  if (typeof window !== 'undefined' && window.plausible) {
    window.plausible('pageview', { props: { path: url } });
  }
};

/**
 * Track custom event
 */
export const trackEvent = ({ action, category, label, value, metadata }: AnalyticsEvent) => {
  if (!isAnalyticsEnabled) return;

  // Google Analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
      ...metadata,
    });
  }

  // Plausible
  if (typeof window !== 'undefined' && window.plausible) {
    window.plausible(action, {
      props: {
        category,
        label,
        value,
        ...metadata,
      },
    });
  }

  // Console log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics Event:', {
      action,
      category,
      label,
      value,
      metadata,
    });
  }
};

/**
 * Track specific user interactions
 */
export const analytics = {
  // Map interactions
  mapInteraction: (action: string, details?: any) => {
    trackEvent({
      action,
      category: 'Map',
      label: 'User Interaction',
      metadata: details,
    });
  },

  // Filter usage
  filterApplied: (filterType: string, value: string) => {
    trackEvent({
      action: 'filter_applied',
      category: 'Filters',
      label: filterType,
      metadata: { value },
    });
  },

  // Data export
  dataExport: (format: string, dataType: string) => {
    trackEvent({
      action: 'data_export',
      category: 'Export',
      label: format,
      metadata: { dataType },
    });
  },

  // View change
  viewChanged: (viewType: string) => {
    trackEvent({
      action: 'view_changed',
      category: 'Navigation',
      label: viewType,
    });
  },

  // Search
  search: (query: string, resultsCount: number) => {
    trackEvent({
      action: 'search',
      category: 'Search',
      label: query,
      value: resultsCount,
    });
  },

  // Error tracking
  error: (errorType: string, errorMessage: string) => {
    trackEvent({
      action: 'error',
      category: 'Error',
      label: errorType,
      metadata: { message: errorMessage },
    });
  },

  // Performance
  performance: (metric: string, value: number) => {
    trackEvent({
      action: 'performance',
      category: 'Performance',
      label: metric,
      value: Math.round(value),
    });
  },
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
    plausible: (event: string, options?: any) => void;
  }
}

export default analytics;
