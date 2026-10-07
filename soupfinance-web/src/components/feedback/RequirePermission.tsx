/**
 * RequirePermission (SOUPFIN-102)
 *
 * Route/section guard: renders its children only when the signed-in user's role
 * allows `action` on `area`, and a "You do not have permission" card otherwise.
 *
 * It covers the user who reaches a page by typing its URL or following an old
 * link — the buttons that lead there are already hidden by usePermission(). The
 * card reads "permission", never "module not enabled": the module is fine, the
 * role is what stops them, and the fix is a different person's job.
 *
 * The API is still the authority. This only saves the user from filling in a
 * form whose save is guaranteed to come back 403.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import type { PermissionAction, PermissionArea } from '../../permissions/catalog';

interface RequirePermissionProps {
  area: PermissionArea;
  action: PermissionAction;
  children: ReactNode;
}

export function ForbiddenState({ testId = 'permission-forbidden' }: { testId?: string }) {
  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
      data-testid={testId}
      data-error-kind="forbidden"
      role="alert"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">
        lock
      </span>
      <h3
        className="text-lg font-bold text-text-light dark:text-text-dark mb-2"
        data-testid={`${testId}-title`}
      >
        You do not have permission
      </h3>
      <p className="text-subtle-text mb-2 max-w-md mx-auto" data-testid={`${testId}-message`}>
        Your role does not allow you to open this page.
      </p>
      <p className="text-xs text-subtle-text/80 mb-4 max-w-md mx-auto">
        If you need access, ask your administrator to change your role.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-lg">arrow_back</span>
        Back to Dashboard
      </Link>
    </div>
  );
}

export function RequirePermission({ area, action, children }: RequirePermissionProps) {
  const allowed = usePermission(area, action);
  return allowed ? <>{children}</> : <ForbiddenState />;
}
