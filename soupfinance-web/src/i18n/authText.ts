/**
 * Added (SOUPFIN-185): translate an `auth` namespace key from code that runs
 * outside React (api/errors.ts, api/auth.ts, api/endpoints/registration.ts).
 *
 * It reads the shared i18next singleton instead of importing ../i18n, so an
 * error module never initialises i18n as a side effect. Until the app has
 * initialised it (some unit tests never do), the English fallback is returned
 * unchanged, which keeps those callers' output identical to before.
 */
import i18next from 'i18next';

type Translate = (key: string, options: Record<string, unknown>) => string;

export function authText(
  key: string,
  fallback: string,
  values: Record<string, unknown> = {},
): string {
  if (!i18next.isInitialized) return fallback;
  return (i18next.t as unknown as Translate)(`auth:${key}`, { ...values, defaultValue: fallback });
}
