/**
 * Environment-aware logging utility
 * Logs are only output in development mode to avoid console errors in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';
type LogArgs = unknown[];

export const logger = {
  log: (...args: LogArgs) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args: LogArgs) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  error: (...args: LogArgs) => {
    // Always log errors, but in production send to error monitoring service
    console.error(...args);
  },

  info: (...args: LogArgs) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  debug: (...args: LogArgs) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
};
