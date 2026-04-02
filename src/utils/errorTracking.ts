/**
 * Error Tracking Utility
 * Centralized error logging and tracking (Sentry integration ready)
 */

const isErrorTrackingEnabled =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_ERROR_TRACKING === 'true';

// Error severity levels
export enum ErrorSeverity {
  Fatal = 'fatal',
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
  Debug = 'debug',
}

// Error context type
export type ErrorContext = {
  user?: {
    id?: string;
    email?: string;
    [key: string]: unknown;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: ErrorSeverity;
};

type ErrorBoundaryInfo = {
  componentStack: string;
};

type SentryCaptureContext = {
  level?: ErrorSeverity;
};

type SentryBreadcrumb = {
  category: string;
  message: string;
  level: ErrorSeverity;
};

interface SentryClient {
  setUser(user: NonNullable<ErrorContext['user']>): void;
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, unknown>): void;
  captureException(error: Error, context?: SentryCaptureContext): void;
  captureMessage(message: string, level: ErrorSeverity): void;
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void;
}

/**
 * Initialize error tracking service (e.g., Sentry)
 */
export const initErrorTracking = () => {
  if (!isErrorTrackingEnabled) return;

  const sentryDSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (sentryDSN && typeof window !== 'undefined') {
    // Dynamically import and initialize Sentry
    import('@sentry/nextjs')
      .then(Sentry => {
        Sentry.init({
          dsn: sentryDSN,
          environment: process.env.NODE_ENV,
          tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

          // Performance monitoring - updated for Sentry v8+
          integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ],

          // Session Replay
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,

          // Filter out noise
          beforeSend(event, hint) {
            // Don't send console errors in development
            if (process.env.NODE_ENV === 'development') {
              return null;
            }

            // Filter out specific errors
            const error = hint.originalException;
            if (error && typeof error === 'object' && 'message' in error) {
              const message = (error as Error).message;

              // Ignore certain errors
              if (
                message.includes('ResizeObserver loop') ||
                message.includes('Non-Error promise rejection')
              ) {
                return null;
              }
            }

            return event;
          },
        });
      })
      .catch(err => {
        console.error('Failed to initialize Sentry:', err);
      });
  }
};

/**
 * Log error to tracking service
 */
export const logError = (error: Error, context?: ErrorContext) => {
  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', error, context);
  }

  if (!isErrorTrackingEnabled) return;

  // Send to Sentry
  if (typeof window !== 'undefined' && window.Sentry) {
    const sentry = window.Sentry;
    const { user, tags, extra, level } = context || {};

    if (user) {
      sentry.setUser(user);
    }

    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        sentry.setTag(key, value);
      });
    }

    if (extra) {
      sentry.setContext('additional', extra);
    }

    sentry.captureException(error, {
      level: level || ErrorSeverity.Error,
    });
  }
};

/**
 * Log message to tracking service
 */
export const logMessage = (
  message: string,
  level: ErrorSeverity = ErrorSeverity.Info,
  context?: ErrorContext
) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${level}]:`, message, context);
  }

  if (!isErrorTrackingEnabled) return;

  if (typeof window !== 'undefined' && window.Sentry) {
    const sentry = window.Sentry;
    const { user, tags, extra } = context || {};

    if (user) {
      sentry.setUser(user);
    }

    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        sentry.setTag(key, value);
      });
    }

    if (extra) {
      sentry.setContext('additional', extra);
    }

    sentry.captureMessage(message, level);
  }
};

/**
 * Track performance metrics
 */
export const trackPerformance = (metric: string, value: number, unit: string = 'ms') => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Performance [${metric}]:`, value, unit);
  }

  if (!isErrorTrackingEnabled) return;

  if (typeof window !== 'undefined' && window.Sentry) {
    const sentry = window.Sentry;
    sentry.addBreadcrumb({
      category: 'performance',
      message: `${metric}: ${value}${unit}`,
      level: ErrorSeverity.Info,
    });
  }
};

/**
 * Create error boundary handler
 */
export const createErrorHandler = (componentName: string) => {
  return (error: Error, errorInfo: ErrorBoundaryInfo) => {
    logError(error, {
      tags: {
        component: componentName,
        errorBoundary: 'true',
      },
      extra: {
        componentStack: errorInfo.componentStack,
      },
      level: ErrorSeverity.Error,
    });
  };
};

// Extend Window interface
declare global {
  interface Window {
    Sentry?: SentryClient;
  }
}

const errorTracking = {
  init: initErrorTracking,
  logError,
  logMessage,
  trackPerformance,
  createErrorHandler,
};

export default errorTracking;
