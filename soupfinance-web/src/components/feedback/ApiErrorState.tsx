/**
 * ApiErrorState — reusable error card for failed API queries
 *
 * Renders the structured ParsedApiError from `src/api/errors.ts` so every
 * page shows the same shape: icon → title → message → optional action hint
 * → optional retry button. No raw "Request failed with status code 403"
 * leaks to users, ever.
 *
 * The `module_disabled` variant (SOUPFIN-9) intentionally hides the Retry
 * button — retrying will not change the backend tenant configuration.
 */
import { parseApiError, type ApiErrorKind } from '../../api/errors';

interface ApiErrorStateProps {
  /** The error caught from a useQuery, mutation, or thrown elsewhere. */
  error: unknown;
  /** Optional retry callback — when omitted, no retry button is shown. */
  onRetry?: () => void;
  /** data-testid for E2E selectors. */
  testId?: string;
}

// Icon per error kind — keeps the page consistent with our design system.
const ICON_BY_KIND: Record<ApiErrorKind, string> = {
  module_disabled: 'lock',
  forbidden: 'lock',
  unauthorized: 'logout',
  not_found: 'search_off',
  server_error: 'cloud_off',
  network: 'wifi_off',
  unknown: 'error',
};

export function ApiErrorState({ error, onRetry, testId }: ApiErrorStateProps) {
  const parsed = parseApiError(error);
  const icon = ICON_BY_KIND[parsed.kind];

  // module_disabled cannot be fixed by retry — surface the action hint instead.
  const showRetry = !!onRetry && parsed.kind !== 'module_disabled';

  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
      data-testid={testId ?? 'api-error-state'}
      data-error-kind={parsed.kind}
    >
      <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">
        {icon}
      </span>
      <h3
        className="text-lg font-bold text-text-light dark:text-text-dark mb-2"
        data-testid={testId ? `${testId}-title` : 'api-error-title'}
      >
        {parsed.title}
      </h3>
      <p
        className="text-subtle-text mb-2 max-w-md mx-auto"
        data-testid={testId ? `${testId}-message` : 'api-error-message'}
      >
        {parsed.message}
      </p>
      {parsed.actionHint && (
        <p
          className="text-xs text-subtle-text/80 mb-4 max-w-md mx-auto"
          data-testid={testId ? `${testId}-hint` : 'api-error-hint'}
        >
          {parsed.actionHint}
        </p>
      )}
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid={testId ? `${testId}-retry` : 'api-error-retry'}
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Retry
        </button>
      )}
    </div>
  );
}
