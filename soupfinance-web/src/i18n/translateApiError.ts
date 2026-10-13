/**
 * Added (SOUPFIN-164): render a ParsedApiError in the user's language.
 *
 * parseApiError() stays language-free (it is plain TypeScript, used outside React)
 * and records the `common` namespace keys for its copy in `parsed.i18n`. This turns
 * those keys into text in the current language of the shared i18next instance. Call
 * it during render from a component that uses useTranslation(), so the component
 * re-renders when the language changes. A message that came from the server has
 * no key and is shown as sent.
 */
import i18next from 'i18next';
import { parseApiError, type ParsedApiError } from '../api/errors';

// The keys are built at runtime, so the typed-key overloads of TFunction do not apply.
type LooseT = (key: string, options?: Record<string, unknown>) => string;

export function translateApiError(parsed: ParsedApiError): ParsedApiError {
  const keys = parsed.i18n;
  if (!keys) return parsed;
  const tr = i18next.t.bind(i18next) as unknown as LooseT;

  // Module names ("Ledger", "Accounting") have their own entries; an unknown module
  // reported by the backend keeps its name.
  const params: Record<string, string> = { ...keys.params };
  if (params.module) {
    params.module = tr(`common:apiError.modules.${params.module}`, { defaultValue: params.module });
  }

  return {
    ...parsed,
    title: tr(`common:${keys.title}`, { ...params, defaultValue: parsed.title }),
    message: keys.message ? tr(`common:${keys.message}`, { ...params, defaultValue: parsed.message }) : parsed.message,
    actionHint:
      keys.actionHint && parsed.actionHint
        ? tr(`common:${keys.actionHint}`, { ...params, defaultValue: parsed.actionHint })
        : parsed.actionHint,
  };
}

/** Translated equivalent of getApiErrorMessage(), for toasts and form banners. */
export function getTranslatedApiErrorMessage(error: unknown): string {
  return translateApiError(parseApiError(error)).message;
}
