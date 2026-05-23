/**
 * API error extraction utility
 *
 * Backend (Grails) can return errors in several shapes:
 *   1. JSON body { message: "..." }
 *   2. JSON body { errors: [{ message: "..." , field: "..." }, ...] }
 *   3. JSON body { error: "..." }
 *   4. Plain string (HTML 500 page → first non-tag line)
 *   5. Axios network error → use error.message
 *
 * This utility normalizes them into a single user-facing string plus an
 * optional field-by-field map for inline form errors.
 */
import axios from 'axios';

export interface NormalizedApiError {
  /** Single human-readable message to display in a banner/toast. */
  message: string;
  /** HTTP status code if available (e.g. 403, 422, 500). */
  status?: number;
  /** Per-field errors keyed by field name (for inline form errors). */
  fieldErrors?: Record<string, string>;
  /** True if the failure is a network/timeout error (not a server response). */
  isNetwork: boolean;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

/**
 * Extract a normalized error from a thrown value (typically AxiosError).
 *
 * Always returns a NormalizedApiError — never throws. Safe to call with `unknown`.
 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  // Axios error?
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as unknown;
    const fieldErrors: Record<string, string> = {};

    let message: string | undefined;

    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;

      // Shape 1: { message: "..." } or { error: "..." }
      message = pickString(record.message) ?? pickString(record.error);

      // Shape 2: { errors: [{ message, field }, ...] }
      const errors = record.errors;
      if (Array.isArray(errors)) {
        const messages: string[] = [];
        for (const entry of errors) {
          if (!entry || typeof entry !== 'object') continue;
          const e = entry as Record<string, unknown>;
          const fieldName = pickString(e.field) ?? pickString(e.property);
          const fieldMessage =
            pickString(e.message) ?? pickString(e.defaultMessage) ?? pickString(e.error);
          if (fieldName && fieldMessage) {
            fieldErrors[fieldName] = fieldMessage;
          }
          if (fieldMessage) messages.push(fieldMessage);
        }
        if (!message && messages.length > 0) {
          message = messages.join('; ');
        }
      }

      // Grails-style nested 'errors.errors'
      if (!message && record.errors && typeof record.errors === 'object') {
        const inner = (record.errors as Record<string, unknown>).errors;
        if (Array.isArray(inner)) {
          const collected = inner
            .map((e) => (e && typeof e === 'object' ? pickString((e as Record<string, unknown>).message) : undefined))
            .filter((s): s is string => Boolean(s));
          if (collected.length > 0) message = collected.join('; ');
        }
      }
    } else if (typeof data === 'string') {
      // Plain text or HTML body — take first useful line, strip tags
      const stripped = data.replace(/<[^>]+>/g, '').trim();
      if (stripped) message = stripped.split('\n')[0]?.trim();
    }

    // Status-specific fallbacks
    if (!message) {
      if (status === 401) message = 'Your session has expired. Please sign in again.';
      else if (status === 403) message = 'You do not have permission to do this.';
      else if (status === 404) message = 'The resource was not found.';
      else if (status === 409) message = 'A conflict occurred — the record may have changed.';
      else if (status === 422) message = 'Some of the values are invalid.';
      else if (status && status >= 500) {
        message = 'The server is having trouble processing this request. Please try again.';
      }
    }

    return {
      message: message ?? error.message ?? FALLBACK_MESSAGE,
      status,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      isNetwork: !error.response,
    };
  }

  // Plain Error or string
  if (error instanceof Error) {
    return { message: error.message || FALLBACK_MESSAGE, isNetwork: false };
  }
  if (typeof error === 'string' && error.trim()) {
    return { message: error.trim(), isNetwork: false };
  }
  return { message: FALLBACK_MESSAGE, isNetwork: false };
}

/**
 * Convenience helper — extract just the user-facing message.
 */
export function getApiErrorMessage(error: unknown, fallback = FALLBACK_MESSAGE): string {
  const normalized = normalizeApiError(error);
  return normalized.message || fallback;
}
