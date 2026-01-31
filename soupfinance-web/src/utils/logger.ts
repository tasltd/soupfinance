/**
 * SoupFinance Logger Utility
 *
 * All logs are prefixed with [SOUPFINANCE] for easy identification
 * in backend logs when multiple client apps connect to the same backend.
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('Failed to fetch data', error);
 *   logger.api('GET', '/invoice/index.json', 200, 150);
 */

const APP_NAME = 'SOUPFINANCE';

/**
 * Get styled prefix for console output
 */
function getPrefix(): string {
  return `[${APP_NAME}]`;
}

/**
 * Logger with application identification
 */
export const logger = {
  /**
   * Log debug message (only in development)
   */
  debug: (message: string, data?: unknown): void => {
    if (import.meta.env.DEV) {
      if (data !== undefined) {
        console.debug(`${getPrefix()} ${message}`, data);
      } else {
        console.debug(`${getPrefix()} ${message}`);
      }
      return;
    }
  },

  /**
   * Log info message
   */
  info: (message: string, data?: unknown): void => {
    if (data !== undefined) {
      console.log(`${getPrefix()} ${message}`, data);
    } else {
      console.log(`${getPrefix()} ${message}`);
    }
  },

  /**
   * Log warning message
   */
  warn: (message: string, data?: unknown): void => {
    if (data !== undefined) {
      console.warn(`${getPrefix()} ${message}`, data);
    } else {
      console.warn(`${getPrefix()} ${message}`);
    }
  },

  /**
   * Log error message
   */
  error: (message: string, error?: unknown): void => {
    if (error !== undefined) {
      console.error(`${getPrefix()} ${message}`, error);
    } else {
      console.error(`${getPrefix()} ${message}`);
    }
  },

  /**
   * Log API request/response
   * @param method HTTP method (GET, POST, PUT, DELETE)
   * @param url Request URL
   * @param status Response status code (optional)
   * @param duration Request duration in ms (optional)
   */
  api: (method: string, url: string, status?: number, duration?: number): void => {
    const statusStr = status ? ` → ${status}` : '';
    const durationStr = duration ? ` (${duration}ms)` : '';
    const emoji = status
      ? status >= 200 && status < 300
        ? '✓'
        : status >= 400
          ? '✗'
          : '→'
      : '→';

    console.log(`${getPrefix()} ${emoji} ${method.toUpperCase()} ${url}${statusStr}${durationStr}`);
  },

  /**
   * Log authentication events
   */
  auth: (event: 'login' | 'logout' | 'token_refresh' | 'session_expired', username?: string): void => {
    const messages: Record<string, string> = {
      login: `User logged in${username ? `: ${username}` : ''}`,
      logout: `User logged out${username ? `: ${username}` : ''}`,
      token_refresh: 'Token refreshed',
      session_expired: 'Session expired - redirecting to login',
    };
    console.log(`${getPrefix()} 🔐 ${messages[event]}`);
  },

  /**
   * Log navigation events
   */
  nav: (from: string, to: string): void => {
    if (import.meta.env.DEV) {
      console.log(`${getPrefix()} 🧭 Navigate: ${from} → ${to}`);
    }
  },

  /**
   * Create a child logger with additional context
   */
  child: (context: string) => ({
    debug: (message: string, data?: unknown) => logger.debug(`[${context}] ${message}`, data),
    info: (message: string, data?: unknown) => logger.info(`[${context}] ${message}`, data),
    warn: (message: string, data?: unknown) => logger.warn(`[${context}] ${message}`, data),
    error: (message: string, error?: unknown) => logger.error(`[${context}] ${message}`, error),
  }),
};

export default logger;
