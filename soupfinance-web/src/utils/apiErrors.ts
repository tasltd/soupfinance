/**
 * API error inspection helpers.
 *
 * Specifically supports detection of 403 responses that mean "the tenant does
 * not have this module enabled" (vs. an authenticated user lacking a role on
 * an otherwise-enabled endpoint). The backend currently uses the same 403
 * status for both, so we treat 403 on read endpoints as a module-disabled
 * signal so the UI can offer a useful fallback instead of a generic error.
 */
export function getStatus(error: unknown): number | undefined {
  // Duck-type rather than `instanceof AxiosError` so this works in both real
  // network errors and the globally-mocked-axios environment used in unit tests.
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response && typeof response.status === 'number') return response.status;
  }
  return undefined;
}

export function isForbiddenError(error: unknown): boolean {
  return getStatus(error) === 403;
}

/**
 * 403 on a read endpoint indicates the Finance module is not enabled for the
 * current tenant. This is distinct from auth failures (401), which are handled
 * by the client interceptor (redirect to login).
 */
export function isModuleDisabledError(error: unknown): boolean {
  return isForbiddenError(error);
}
