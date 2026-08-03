/**
 * AddEntityButton Component
 *
 * Added (SOUPFIN-30 #15): A small "+" affordance rendered beside an entity
 * dropdown (vendor, client, ...) so a user who realises mid-form that the
 * record they need does not exist can create it without abandoning the form.
 *
 * The create page is opened in a NEW TAB rather than via client-side
 * navigation: navigating away from a half-filled invoice/bill would discard
 * every entered line item. When the user comes back to this tab we invalidate
 * the dropdown's query so the freshly created record appears in the list —
 * React Query's default `refetchOnWindowFocus` is not enough here because the
 * app sets a 5-minute `staleTime`, which would otherwise serve the stale list.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

export interface AddEntityButtonProps {
  /** Route of the entity's create page, e.g. "/vendors/new" */
  to: string;
  /** Accessible label, e.g. "Add new vendor" */
  label: string;
  /** Query key of the dropdown list to refresh once the user returns */
  queryKey: QueryKey;
  /** data-testid for E2E targeting */
  testId?: string;
  /** Disable while the parent form is read-only/submitting */
  disabled?: boolean;
}

export function AddEntityButton({
  to,
  label,
  queryKey,
  testId,
  disabled = false,
}: AddEntityButtonProps) {
  const queryClient = useQueryClient();
  // Only refresh after the user has actually opened the create page.
  const awaitingReturn = useRef(false);

  useEffect(() => {
    const handleFocus = () => {
      if (!awaitingReturn.current) return;
      awaitingReturn.current = false;
      queryClient.invalidateQueries({ queryKey });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // queryKey is an array literal at most call sites; serialise it so the
    // effect is not re-registered on every render.
  }, [queryClient, JSON.stringify(queryKey)]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = () => {
    awaitingReturn.current = true;
    window.open(to, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex shrink-0 items-center justify-center size-12 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      data-testid={testId}
    >
      <span className="material-symbols-outlined text-xl">add</span>
    </button>
  );
}
