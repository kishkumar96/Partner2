/**
 * Debug Logger Utility
 *
 * Provides structured logging for map-related warnings and errors.
 * Only logs in development mode to avoid cluttering production console.
 *
 * Categories:
 * - map-initialization: Map setup and configuration warnings
 * - map-style: Style loading and diffing warnings
 * - map-source: GeoJSON source and data warnings
 * - map-layer: Layer rendering and paint warnings
 * - performance: Performance-related warnings
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory =
  | 'map-initialization'
  | 'map-style'
  | 'map-source'
  | 'map-layer'
  | 'performance'
  | 'general';

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: Date;
  details?: any;
}

const isDevelopment = process.env.NODE_ENV === 'development';

// Store original console methods to prevent infinite recursion
const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// Store recent logs for debugging
const logHistory: LogEntry[] = [];
const MAX_LOG_HISTORY = 100;

// Recursion guard for warning handler
let isInWarningHandler = false;

/**
 * Known non-critical warnings that can be filtered
 * These are MapLibre warnings that don't indicate actual problems
 */
const KNOWN_NON_CRITICAL_PATTERNS = [
  /filesystem.*not found/i,
  /illegal path/i,
  /style diff/i,
  /setState.*not mounted/i,
  /Cannot read properties of null/i, // Common React cleanup race condition
];

/**
 * Check if a message matches known non-critical patterns
 */
function isNonCriticalWarning(message: string): boolean {
  return KNOWN_NON_CRITICAL_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Categorize a log message based on content
 */
function categorizeMessage(message: string): LogCategory {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('style') || lowerMessage.includes('stylesheet')) {
    return 'map-style';
  }
  if (lowerMessage.includes('source') || lowerMessage.includes('geojson')) {
    return 'map-source';
  }
  if (
    lowerMessage.includes('layer') ||
    lowerMessage.includes('paint') ||
    lowerMessage.includes('layout')
  ) {
    return 'map-layer';
  }
  if (
    lowerMessage.includes('performance') ||
    lowerMessage.includes('slow') ||
    lowerMessage.includes('throttle')
  ) {
    return 'performance';
  }
  if (
    lowerMessage.includes('map') ||
    lowerMessage.includes('maplibre') ||
    lowerMessage.includes('initialization')
  ) {
    return 'map-initialization';
  }

  return 'general';
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString().split('T')[1].split('.')[0];
  const levelLabel = {
    debug: 'DEBUG',
    info: 'INFO',
    warn: 'WARN',
    error: 'ERROR',
  }[entry.level];

  return `[${timestamp}] [${levelLabel}] [${entry.category}] ${entry.message}`;
}

/**
 * Core logging function
 */
function log(level: LogLevel, category: LogCategory, message: string, details?: any) {
  // Skip logging in production
  if (!isDevelopment) return;

  const entry: LogEntry = {
    level,
    category,
    message,
    timestamp: new Date(),
    details,
  };

  // Add to history
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  // Output to console
  const formattedMessage = formatLogEntry(entry);

  // Format details for better console output
  const formattedDetails =
    details && typeof details === 'object'
      ? '\n' + JSON.stringify(details, null, 2)
      : details || '';

  // Use original console methods to prevent infinite recursion
  try {
    switch (level) {
      case 'debug':
        originalConsole.debug(formattedMessage, formattedDetails);
        break;
      case 'info':
        originalConsole.info(formattedMessage, formattedDetails);
        break;
      case 'warn':
        originalConsole.warn(formattedMessage, formattedDetails);
        break;
      case 'error':
        originalConsole.error(formattedMessage, formattedDetails);
        break;
    }
  } catch (_err) {
    // Failsafe: If logging itself fails, use bare console.log
    // This should never happen, but prevents any possible crash
    try {
      originalConsole.error('[Logger Error]', message);
    } catch {
      // Absolute last resort - do nothing to prevent crash
    }
  }
}

/**
 * Public API
 */
export const debugLogger = {
  /**
   * Log debug information (verbose, development only)
   */
  debug(message: string, category: LogCategory = 'general', details?: any) {
    log('debug', category, message, details);
  },

  /**
   * Log informational messages
   */
  info(message: string, category: LogCategory = 'general', details?: any) {
    log('info', category, message, details);
  },

  /**
   * Log warnings (may indicate issues)
   */
  warn(message: string, category: LogCategory = 'general', details?: any) {
    // Check if this is a known non-critical warning
    if (isNonCriticalWarning(message)) {
      // Log at debug level instead of warn
      log('debug', category, `[Non-Critical] ${message}`, details);
    } else {
      log('warn', category, message, details);
    }
  },

  /**
   * Log errors (critical issues)
   */
  error(message: string, category: LogCategory = 'general', details?: any) {
    log('error', category, message, details);
  },

  /**
   * Create a console.warn wrapper that categorizes MapLibre warnings
   */
  createMapLibreWarningHandler(originalWarn: typeof console.warn): typeof console.warn {
    return (...args: any[]) => {
      // Prevent infinite recursion
      if (isInWarningHandler) {
        originalWarn(...args);
        return;
      }

      try {
        isInWarningHandler = true;
        const message = args.join(' ');
        const category = categorizeMessage(message);

        // Use our warning handler
        debugLogger.warn(message, category, args.length > 1 ? args.slice(1) : undefined);
      } catch (_error) {
        // Fallback to original warn if our handler fails
        originalWarn(...args);
      } finally {
        isInWarningHandler = false;
      }
    };
  },

  /**
   * Get recent log history (for debugging UI)
   */
  getHistory(): LogEntry[] {
    return [...logHistory];
  },

  /**
   * Clear log history
   */
  clearHistory() {
    logHistory.length = 0;
  },
};

export default debugLogger;
