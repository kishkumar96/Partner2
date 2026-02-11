/**
 * Error Handling Utilities
 * 
 * World-class error handling with:
 * - Consistent error logging
 * - User-friendly error messages
 * - Error classification
 * - Retry-able error detection
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  NETWORK = 'network',
  PARSE = 'parse',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  NOT_FOUND = 'not_found',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface AppError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  originalError?: Error;
  context?: Record<string, any>;
  retryable: boolean;
  userMessage: string;
  timestamp: Date;
}

/**
 * Create a standardized error object
 */
export function createAppError(
  message: string,
  options: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    originalError?: Error;
    context?: Record<string, any>;
    retryable?: boolean;
    userMessage?: string;
  } = {}
): AppError {
  const {
    category = ErrorCategory.UNKNOWN,
    severity = ErrorSeverity.MEDIUM,
    originalError,
    context,
    retryable = false,
    userMessage,
  } = options;

  return {
    message,
    category,
    severity,
    originalError,
    context,
    retryable,
    userMessage: userMessage || getDefaultUserMessage(category),
    timestamp: new Date(),
  };
}

/**
 * Classify an error based on its type and message
 */
export function classifyError(error: Error | unknown): AppError {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return createAppError('Network request failed', {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      originalError: error as Error,
      retryable: true,
      userMessage: 'Failed to connect to server. Please check your internet connection.',
    });
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return createAppError('Request timeout', {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      originalError: error,
      retryable: true,
      userMessage: 'Request took too long. Please try again.',
    });
  }

  if (error instanceof SyntaxError) {
    return createAppError('Failed to parse data', {
      category: ErrorCategory.PARSE,
      severity: ErrorSeverity.HIGH,
      originalError: error,
      retryable: false,
      userMessage: 'Received invalid data from server.',
    });
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return createAppError(message, {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    originalError: error instanceof Error ? error : undefined,
    retryable: false,
  });
}

/**
 * Log error with appropriate severity
 */
export function logError(error: AppError): void {
  const prefix = `[${error.severity.toUpperCase()}][${error.category}]`;
  const timestamp = error.timestamp.toISOString();
  
  const logMessage = `${prefix} ${error.message}`;
  const details = {
    timestamp,
    context: error.context,
    originalError: error.originalError?.stack,
  };

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.HIGH:
      console.error(logMessage, details);
      break;
    case ErrorSeverity.MEDIUM:
      console.warn(logMessage, details);
      break;
    case ErrorSeverity.LOW:
      console.info(logMessage, details);
      break;
  }
}

/**
 * Handle error with logging and optional callback
 */
export function handleError(
  error: Error | unknown,
  onError?: (appError: AppError) => void
): AppError {
  const appError = classifyError(error);
  logError(appError);
  
  if (onError) {
    onError(appError);
  }
  
  return appError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error | AppError | unknown): boolean {
  if ('retryable' in (error as AppError)) {
    return (error as AppError).retryable;
  }

  // Network errors are typically retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Timeout errors are retryable
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // 5xx status codes are retryable
  if (error instanceof Error && /^HTTP 5\d\d/.test(error.message)) {
    return true;
  }

  return false;
}

/**
 * Get user-friendly error message
 */
function getDefaultUserMessage(category: ErrorCategory): string {
  const messages: Record<ErrorCategory, string> = {
    [ErrorCategory.NETWORK]: 'Unable to connect. Please check your internet connection.',
    [ErrorCategory.PARSE]: 'Received invalid data. Please try refreshing the page.',
    [ErrorCategory.VALIDATION]: 'Invalid input. Please check your data and try again.',
    [ErrorCategory.PERMISSION]: 'You don\'t have permission to perform this action.',
    [ErrorCategory.NOT_FOUND]: 'The requested resource could not be found.',
    [ErrorCategory.TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorCategory.UNKNOWN]: 'An unexpected error occurred. Please try again.',
  };

  return messages[category];
}

/**
 * Create a safe error wrapper for async operations
 */
export function safeAsync<T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: AppError | null }> {
  return fn()
    .then(data => ({ data, error: null }))
    .catch(error => {
      const appError = handleError(error);
      return { data: null, error: appError };
    });
}

/**
 * Error boundary handler for React components
 */
export function createErrorHandler(componentName: string) {
  return (error: Error, errorInfo: { componentStack: string }) => {
    const appError = createAppError(`Error in ${componentName}`, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      originalError: error,
      context: {
        componentName,
        componentStack: errorInfo.componentStack,
      },
      retryable: false,
      userMessage: 'Something went wrong. Please refresh the page.',
    });

    logError(appError);
  };
}

/**
 * Aggregate multiple errors
 */
export function aggregateErrors(errors: AppError[]): AppError {
  const highestSeverity = errors.reduce(
    (highest, err) =>
      getSeverityLevel(err.severity) > getSeverityLevel(highest)
        ? err.severity
        : highest,
    ErrorSeverity.LOW
  );

  const categories = [...new Set(errors.map(e => e.category))];
  const retryable = errors.every(e => e.retryable);

  return createAppError(`Multiple errors occurred (${errors.length})`, {
    category: categories.length === 1 ? categories[0] : ErrorCategory.UNKNOWN,
    severity: highestSeverity,
    context: {
      errors: errors.map(e => ({
        message: e.message,
        category: e.category,
      })),
    },
    retryable,
    userMessage: 'Multiple errors occurred. Please try again.',
  });
}

/**
 * Get numeric severity level for comparison
 */
function getSeverityLevel(severity: ErrorSeverity): number {
  const levels: Record<ErrorSeverity, number> = {
    [ErrorSeverity.LOW]: 1,
    [ErrorSeverity.MEDIUM]: 2,
    [ErrorSeverity.HIGH]: 3,
    [ErrorSeverity.CRITICAL]: 4,
  };
  return levels[severity];
}
