/**
 * Added (SOUPFIN-160): Axios-shaped errors for page tests.
 *
 * Axios is mocked globally in setup.ts, so a real AxiosError never reaches a
 * component under test. `parseApiError()` duck-types on `isAxiosError`, so an
 * Error carrying that flag, a config URL and a response is enough.
 *
 * The bodies mirror what the backend really sends (see SOUPFIN-150):
 *  - a module interceptor answers `{ error: "<Name> module is not enabled for this tenant" }`
 *  - Spring Security answers a role failure with the Boot envelope `{ error: "Forbidden", ... }`
 */
export function axiosError(status: number, data: unknown, url = '/rest/unknown') {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url },
    response: { status, data },
  });
}

/** 403 from a module gate, e.g. FinanceModuleInterceptor for /bill. */
export function moduleDisabled403(module: string, url: string) {
  return axiosError(403, { error: `${module} module is not enabled for this tenant` }, url);
}

/** 403 from Spring Security: the user lacks the role. */
export function roleDenied403(url: string) {
  return axiosError(403, { timestamp: '2026-10-12T10:00:00Z', status: 403, error: 'Forbidden', path: url }, url);
}

/** 500 with an empty body. */
export function serverError500(url: string) {
  return axiosError(500, {}, url);
}
