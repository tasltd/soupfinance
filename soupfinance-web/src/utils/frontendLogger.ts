/**
 * Frontend Logger Service for SoupFinance
 *
 * Intercepts console.log/warn/error/debug/info and forwards them to the backend
 * for unified logging in Tomcat catalina.out via Logback.
 *
 * Production Mode: Only sends ERROR level logs to backend
 * Development Mode: Sends ALL log levels to backend
 *
 * Also captures:
 * - Unhandled JS errors (window.onerror)
 * - Unhandled promise rejections
 * - React Error Boundary errors
 *
 * Backend Endpoint: POST /rest/frontendLog/batch.json
 * Backend logs appear with [FRONTEND] tag in Tomcat logs
 */

const APP_NAME = 'SOUPFINANCE';
const API_BASE_URL = import.meta.env.VITE_API_URL || '/rest';
const IS_PRODUCTION = import.meta.env.PROD;

export interface FrontendLogEntry {
  level: 'log' | 'warn' | 'error' | 'debug' | 'info';
  message: string;
  timestamp: string;
  url: string;
  userAgent: string;
  stack?: string;
  data?: Record<string, unknown>;
  app: string;
}

class FrontendLoggerService {
  private logBuffer: FrontendLogEntry[] = [];
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL = 2000; // 2 seconds
  private flushTimer: number | null = null;
  private initialized = false;
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    info: typeof console.info;
  };

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
      info: console.info.bind(console),
    };
  }

  /**
   * Check if a log level should be sent to the backend
   * Production: only errors
   * Development: all levels
   */
  private shouldSendToBackend(level: FrontendLogEntry['level']): boolean {
    if (!IS_PRODUCTION) {
      // Development: send all logs
      return true;
    }
    // Production: only send errors
    return level === 'error';
  }

  /**
   * Initialize the logger - intercept console methods and setup error handlers
   * Call this once in App.tsx on mount
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Intercept console methods
    console.log = (...args: unknown[]) => this.interceptLog('log', args);
    console.warn = (...args: unknown[]) => this.interceptLog('warn', args);
    console.error = (...args: unknown[]) => this.interceptLog('error', args);
    console.debug = (...args: unknown[]) => this.interceptLog('debug', args);
    console.info = (...args: unknown[]) => this.interceptLog('info', args);

    // Setup periodic flush
    this.flushTimer = window.setInterval(() => this.flush(), this.FLUSH_INTERVAL);

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush(true));

    // Capture unhandled JS errors (always captured, even in production)
    window.addEventListener('error', (event: ErrorEvent) => {
      this.addLogEntry({
        level: 'error',
        message: `[${APP_NAME}] Unhandled Error: ${event.message}`,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        stack: event.error?.stack,
        data: { filename: event.filename, lineno: event.lineno, colno: event.colno },
        app: APP_NAME,
      });
    });

    // Capture unhandled promise rejections (always captured, even in production)
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.addLogEntry({
        level: 'error',
        message: `[${APP_NAME}] Unhandled Promise Rejection: ${event.reason}`,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        stack: event.reason?.stack,
        data: { reason: String(event.reason) },
        app: APP_NAME,
      });
    });

    const mode = IS_PRODUCTION ? 'PRODUCTION (errors only)' : 'DEVELOPMENT (all logs)';
    this.originalConsole.log(`[${APP_NAME}] FrontendLogger initialized in ${mode} mode`);
  }

  private interceptLog(level: FrontendLogEntry['level'], args: unknown[]): void {
    // Always call original console method first (shows in browser console)
    this.originalConsole[level](...args);

    // Don't log our own flush messages to avoid infinite loop
    const firstArg = args[0];
    if (typeof firstArg === 'string' && firstArg.includes('FrontendLogger')) return;

    // Check if this log level should be sent to backend
    if (!this.shouldSendToBackend(level)) return;

    // Create log entry
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    this.addLogEntry({
      level,
      message: `[${APP_NAME}] ${message}`,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      stack: level === 'error' ? new Error().stack : undefined,
      app: APP_NAME,
    });
  }

  private addLogEntry(entry: FrontendLogEntry): void {
    this.logBuffer.push(entry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Send buffered logs to backend
   * @param sync Use synchronous request (for beforeunload)
   */
  flush(sync = false): void {
    if (this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    const endpoint = `${API_BASE_URL}/frontendLog/batch.json`;

    if (sync) {
      // Use synchronous XHR for beforeunload
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint, false); // false = synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ logs: logsToSend }));
      } catch {
        // Silent fail on unload
      }
    } else {
      // Use fetch for normal operation
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: logsToSend }),
      }).catch(() => {
        // Put logs back in buffer on failure
        this.logBuffer = [...logsToSend, ...this.logBuffer];
        this.originalConsole.warn(`[${APP_NAME}] FrontendLogger: Failed to send logs to backend`);
      });
    }
  }

  /**
   * Manually log an error to backend (always sent, regardless of mode)
   * Use this for React Error Boundary errors and critical errors
   */
  logError(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.addLogEntry({
      level: 'error',
      message: `[${APP_NAME}] ${message}`,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      stack: error?.stack,
      data,
      app: APP_NAME,
    });
    // Flush immediately for errors
    this.flush();
  }

  /**
   * Log React Error Boundary errors
   * Called from ErrorBoundary componentDidCatch
   */
  logReactError(error: Error, errorInfo: { componentStack: string }): void {
    this.addLogEntry({
      level: 'error',
      message: `[${APP_NAME}] React Error Boundary: ${error.message}`,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      stack: error.stack,
      data: { componentStack: errorInfo.componentStack },
      app: APP_NAME,
    });
    // Flush immediately for errors
    this.flush();
  }

  /**
   * Cleanup - restore original console methods
   */
  destroy(): void {
    if (!this.initialized) return;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining logs
    this.flush();

    // Restore original console
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;

    this.initialized = false;
  }
}

// Singleton instance
export const frontendLogger = new FrontendLoggerService();

export default frontendLogger;
