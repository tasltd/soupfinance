/**
 * API Error Parser
 *
 * Translates raw Axios/Fetch errors into user-friendly messages and structured metadata.
 * Eliminates the "Request failed with status code 403" UX problem where users see HTTP
 * jargon instead of actionable guidance.
 *
 * The Grails backend returns 403 when a module is disabled for a tenant (Ledger,
 * Accounting, Voucher, PaymentMethod). This module recognises those endpoints and
 * surfaces a "module not enabled" message that points at the admin instead of a stack trace.
 */
import type { AxiosError } from 'axios';

// Kind of error — drives icon + tone, lets pages branch on intent (retry vs contact admin)
export type ApiErrorKind =
  | 'module_disabled'   // 403 on a module-gated endpoint (Ledger, Voucher, etc.)
  | 'forbidden'         // 403 elsewhere — permission denied for this user/role
  | 'unauthorized'      // 401 — session expired (client.ts already redirects, but kept for completeness)
  | 'not_found'         // 404
  | 'server_error'      // 5xx
  | 'network'           // connection failure, timeout
  | 'unknown';          // fallback

export interface ParsedApiError {
  kind: ApiErrorKind;
  /** Short headline suitable for an error card heading. */
  title: string;
  /** Longer sentence suitable for a card body or toast. Never includes "Request failed with status code". */
  message: string;
  /** Optional hint about what the user should do next. */
  actionHint?: string;
  /** Raw HTTP status if available — useful for telemetry/tests. */
  status?: number;
}

// Endpoints whose backing module can be disabled per tenant. A 403 here means
// "module not enabled" rather than "you lack the role".
// Match against the request URL via `includes` (case-insensitive) so prefixed
// paths like /rest/ledgerAccount/... or /finance/voucher/... all hit.
const MODULE_GATED_PATTERNS: Array<{ pattern: RegExp; module: string }> = [
  { pattern: /\/ledgeraccount\b/i, module: 'Ledger' },
  { pattern: /\/ledgertransaction\b/i, module: 'Ledger' },
  { pattern: /\/ledgertransactiongroup\b/i, module: 'Ledger' },
  { pattern: /\/voucher\b/i, module: 'Accounting' },
  { pattern: /\/paymentmethod\b/i, module: 'Accounting' },
];

/**
 * Identify the module name for a 403 response, if the endpoint is one that
 * requires a tenant module to be enabled. Returns null when the 403 is not
 * module-gated (e.g., user simply lacks ROLE_ADMIN).
 */
function moduleForUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = MODULE_GATED_PATTERNS.find(({ pattern }) => pattern.test(url));
  return match ? match.module : null;
}

/**
 * Extract a server-provided message from a Grails error payload, if any.
 * Backend may return `{ error: "..." }`, `{ message: "..." }`, or a plain string.
 */
function extractServerMessage(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data.length > 0 && data.length < 300 ? data : null;
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'errorMessage', 'detail']) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0 && value.length < 300) return value;
    }
  }
  return null;
}

/**
 * Convert any thrown error (Axios, native Error, unknown) into a ParsedApiError
 * with a human-readable title and message.
 *
 * Tests must cover: 403 on ledger URL → module_disabled, 403 on other URL →
 * forbidden, 500 → server_error, network failure → network, unknown → unknown.
 */
export function parseApiError(error: unknown): ParsedApiError {
  // AxiosError path — preferred because we have status + url.
  // Use duck typing on `isAxiosError` so this works whether axios is the real
  // runtime or the vitest-mocked version (tests mock the axios module globally
  // which means `instanceof AxiosError` would not match real errors there).
  if (error && typeof error === 'object' && (error as Record<string, unknown>).isAxiosError === true) {
    const axErr = error as AxiosError;
    const status = axErr.response?.status;
    const url = axErr.config?.url;
    const serverMessage = extractServerMessage(axErr.response?.data);

    // No response at all → network/timeout
    if (!axErr.response) {
      return {
        kind: 'network',
        title: 'Connection problem',
        message: 'We could not reach the server. Check your internet connection and try again.',
        actionHint: 'If the problem persists, contact your administrator.',
      };
    }

    if (status === 401) {
      return {
        kind: 'unauthorized',
        title: 'Session expired',
        message: 'Your session has ended. Please sign in again to continue.',
        status,
      };
    }

    if (status === 403) {
      const moduleName = moduleForUrl(url);
      if (moduleName) {
        return {
          kind: 'module_disabled',
          title: `${moduleName} module is not available`,
          message:
            `Your account does not have access to the ${moduleName} module yet. ` +
            `This feature requires the ${moduleName} module to be enabled for your tenant.`,
          actionHint: 'Contact your administrator to enable this module for your organisation.',
          status,
        };
      }
      return {
        kind: 'forbidden',
        title: 'You do not have permission',
        message:
          serverMessage ||
          'Your account does not have permission to perform this action.',
        actionHint: 'If you believe this is a mistake, contact your administrator.',
        status,
      };
    }

    if (status === 404) {
      return {
        kind: 'not_found',
        title: 'Not found',
        message: serverMessage || 'The item you are looking for could not be found.',
        status,
      };
    }

    if (status && status >= 500) {
      return {
        kind: 'server_error',
        title: 'Server error',
        message:
          serverMessage ||
          'Something went wrong on our side. Please try again in a moment.',
        actionHint: 'If this keeps happening, contact your administrator.',
        status,
      };
    }

    // 4xx other than 401/403/404 — surface the server message if useful
    return {
      kind: 'unknown',
      title: 'Request failed',
      message: serverMessage || 'We could not complete your request.',
      actionHint: 'Please try again.',
      status,
    };
  }

  // Native Error
  if (error instanceof Error) {
    return {
      kind: 'unknown',
      title: 'Something went wrong',
      message: error.message || 'An unexpected error occurred.',
    };
  }

  // Truly unknown
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
  };
}

/**
 * Convenience for components that only need a short user-facing string
 * (e.g., toast messages). Equivalent to `parseApiError(err).message`.
 */
export function getApiErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}
