/**
 * ModuleDisabledBanner — inline banner shown on form pages when their
 * dependent module (Ledger, Accounting) is not enabled for the tenant.
 *
 * Used by JournalEntry and Voucher forms: the form itself still renders so
 * the user can see the layout, but the banner explains why account dropdowns
 * are empty and points at the admin instead of letting them submit a form
 * that will fail with 403.
 */
import { parseApiError } from '../../api/errors';

interface ModuleDisabledBannerProps {
  /** Error from useLedgerAccounts() or similar dependency query. */
  error: unknown;
  /** Optional extra context — e.g., "Account selection is unavailable." */
  context?: string;
  testId?: string;
}

export function ModuleDisabledBanner({
  error,
  context,
  testId,
}: ModuleDisabledBannerProps) {
  const parsed = parseApiError(error);

  // Only render for module_disabled — other errors are surfaced inside
  // the field components themselves to avoid double-messaging.
  if (parsed.kind !== 'module_disabled') return null;

  return (
    <div
      className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3"
      data-testid={testId ?? 'module-disabled-banner'}
      role="alert"
    >
      <span className="material-symbols-outlined text-warning text-2xl flex-shrink-0">
        lock
      </span>
      <div className="flex-1 text-sm">
        <p className="font-bold text-text-light dark:text-text-dark">
          {parsed.title}
        </p>
        <p className="text-subtle-text mt-1">{parsed.message}</p>
        {context && <p className="text-subtle-text mt-1">{context}</p>}
        {parsed.actionHint && (
          <p className="text-xs text-subtle-text/80 mt-2">{parsed.actionHint}</p>
        )}
      </div>
    </div>
  );
}
