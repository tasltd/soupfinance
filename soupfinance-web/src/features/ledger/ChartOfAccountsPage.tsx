/**
 * Chart of Accounts Page
 * Lists all ledger accounts grouped by type
 *
 * Added: Full API integration with listLedgerAccounts endpoint
 * Added: Grouping by ledger group (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listLedgerAccounts,
  ledgerAccountHasTransactions,
  deleteLedgerAccount,
  deactivateLedgerAccount,
  canEditLedgerAccount,
  canDeleteLedgerAccount,
} from '../../api/endpoints/ledger';
import { getApiErrorMessage } from '../../api/errors';
import { useFormatCurrency } from '../../stores';
import { ApiErrorState } from '../../components/feedback';
import type { LedgerAccount, LedgerGroup } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Group configuration with colors and icons
const GROUP_CONFIG: Record<LedgerGroup, { label: string; icon: string; colorClass: string }> = {
  ASSET: { label: 'Assets', icon: 'account_balance', colorClass: 'text-info bg-info/10' },
  LIABILITY: { label: 'Liabilities', icon: 'credit_card', colorClass: 'text-danger bg-danger/10' },
  EQUITY: { label: 'Equity', icon: 'balance', colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30' },
  INCOME: { label: 'Income', icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  REVENUE: { label: 'Revenue', icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  EXPENSE: { label: 'Expenses', icon: 'trending_down', colorClass: 'text-warning bg-warning/10' },
};

// Added: Order for displaying groups
const GROUP_ORDER: LedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE', 'EXPENSE'];

/**
 * Added (SOUPFIN-149): state of the remove-account dialog.
 * - checking: asking the backend whether the account has transactions
 * - delete: no transactions, a hard delete is safe
 * - deactivate: has transactions (or the check failed), archive instead
 */
type RemoveMode = 'checking' | 'delete' | 'deactivate';
interface RemoveState {
  account: LedgerAccount;
  mode: RemoveMode;
  checkError?: string;
  actionError?: string;
  pending?: boolean;
}

export function ChartOfAccountsPage() {
  const formatCurrency = useFormatCurrency();
  const queryClient = useQueryClient();

  // Added (SOUPFIN-149): remove (delete / deactivate) flow
  const [removing, setRemoving] = useState<RemoveState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startRemove = async (account: LedgerAccount) => {
    setNotice(null);
    setRemoving({ account, mode: 'checking' });
    try {
      const hasTransactions = await ledgerAccountHasTransactions(account.id);
      setRemoving((prev) =>
        prev?.account.id === account.id ? { account, mode: hasTransactions ? 'deactivate' : 'delete' } : prev
      );
    } catch (err) {
      // Without proof the account is unused, only offer the reversible option.
      setRemoving((prev) =>
        prev?.account.id === account.id
          ? { account, mode: 'deactivate', checkError: getApiErrorMessage(err) }
          : prev
      );
    }
  };

  const confirmRemove = async () => {
    if (!removing || removing.mode === 'checking') return;
    const { account, mode } = removing;
    setRemoving({ ...removing, pending: true, actionError: undefined });
    try {
      if (mode === 'delete') {
        await deleteLedgerAccount(account.id);
        setNotice(`${account.name} was deleted.`);
      } else {
        await deactivateLedgerAccount(account.id);
        setNotice(`${account.name} was deactivated. Its transactions are kept.`);
      }
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
    } catch (err) {
      setRemoving({ ...removing, pending: false, actionError: getApiErrorMessage(err) });
    }
  };

  // Added: Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<LedgerGroup>>(new Set(GROUP_ORDER));

  // Added: Fetch accounts from API
  // NOTE: do not retry on 403 (module-disabled is permanent until admin enables it)
  const { data: accounts, isLoading, error, refetch } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => listLedgerAccounts(),
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });

  // Added: Group accounts by ledgerGroup
  // Changed: Use Partial type for groupedAccounts to handle potentially missing groups
  const groupedAccounts: Partial<Record<LedgerGroup, LedgerAccount[]>> = accounts?.reduce((acc, account) => {
    const group = account.ledgerGroup;
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(account);
    return acc;
  }, {} as Record<LedgerGroup, LedgerAccount[]>) ?? {};

  // Added: Toggle group expansion
  const toggleGroup = (group: LedgerGroup) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="chart-of-accounts-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="coa-heading">
            Chart of Accounts
          </h1>
          <p className="text-subtle-text">Manage your ledger accounts</p>
          <HelpLink section="chart-of-accounts" className="mt-1 self-start" />
        </div>
        {/* Added (SOUPFIN-149): create a ledger account */}
        <Link
          to="/ledger/accounts/new"
          className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="coa-new-account"
        >
          <span className="material-symbols-outlined text-xl">add</span>
          New Account
        </Link>
      </div>

      {notice && (
        <div
          className="p-4 rounded-lg bg-success/10 border border-success/30 text-success flex items-start gap-3"
          role="status"
          data-testid="coa-notice"
        >
          <span className="material-symbols-outlined text-xl">check_circle</span>
          <p className="font-medium flex-1">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="material-symbols-outlined text-xl"
            aria-label="Dismiss"
          >
            close
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="coa-loading">
          Loading accounts...
        </div>
      ) : error ? (
        <ApiErrorState
          error={error}
          onRetry={() => refetch()}
          testId="coa-error"
        />
      ) : !accounts || accounts.length === 0 ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="coa-empty">
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">account_tree</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No accounts found</h3>
          <p className="text-subtle-text">Your chart of accounts is empty.</p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="coa-groups">
          {GROUP_ORDER.map(group => {
            const groupAccounts = groupedAccounts[group];
            if (!groupAccounts || groupAccounts.length === 0) return null;

            const config = GROUP_CONFIG[group];
            const isExpanded = expandedGroups.has(group);

            return (
              <div
                key={group}
                className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
                data-testid={`coa-group-${group.toLowerCase()}`}
              >
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-primary/5 transition-colors"
                  data-testid={`coa-group-toggle-${group.toLowerCase()}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`material-symbols-outlined p-2 rounded-lg ${config.colorClass}`}>
                      {config.icon}
                    </span>
                    <div className="text-left">
                      <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{config.label}</h2>
                      <p className="text-sm text-subtle-text">{groupAccounts.length} account{groupAccounts.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-subtle-text transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                {/* Group Accounts */}
                {isExpanded && (
                  <div className="border-t border-border-light dark:border-border-dark">
                    <table className="w-full text-sm" data-testid={`coa-table-${group.toLowerCase()}`}>
                      {/* Changed: Added currency and parent account columns */}
                      <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                        <tr>
                          <th className="px-6 py-3 text-left">Code</th>
                          <th className="px-6 py-3 text-left">Name</th>
                          <th className="px-6 py-3 text-left">Currency</th>
                          <th className="px-6 py-3 text-right">Balance</th>
                          <th className="px-6 py-3 text-center">Status</th>
                          <th className="px-6 py-3 text-right">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupAccounts
                          .sort((a, b) => a.code.localeCompare(b.code))
                          .map(account => (
                            <tr
                              key={account.id}
                              className="border-b border-border-light dark:border-border-dark last:border-b-0 hover:bg-primary/5"
                              data-testid={`coa-account-${account.id}`}
                            >
                              <td className="px-6 py-4 font-mono text-text-light dark:text-text-dark">{account.code}</td>
                              <td className="px-6 py-4 text-text-light dark:text-text-dark">
                                <div>
                                  {account.name}
                                  {/* Added: Show parent account if exists */}
                                  {account.parentAccount?.name && (
                                    <span className="text-xs text-subtle-text ml-1">
                                      (under {account.parentAccount.name})
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Added: Currency column */}
                              <td className="px-6 py-4 text-subtle-text font-mono text-xs">
                                {account.currency || '-'}
                              </td>
                              <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                                {formatCurrency(account.balance)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${account.isActive ? 'bg-success/10 text-success' : 'bg-subtle-text/10 text-subtle-text'}`}>
                                  {account.isActive ? 'Active' : 'Inactive'}
                                </span>
                                {account.systemAccount === true && (
                                  <span
                                    className="ml-2 px-2.5 py-0.5 text-xs font-medium rounded-full bg-info/10 text-info"
                                    data-testid={`coa-system-${account.id}`}
                                  >
                                    System
                                  </span>
                                )}
                              </td>
                              {/* Added (SOUPFIN-149): actions respect systemAccount/editable/deletable */}
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                {canEditLedgerAccount(account) && (
                                  <Link
                                    to={`/ledger/accounts/${account.id}/edit`}
                                    className="inline-flex p-2 rounded-full text-subtle-text hover:bg-primary/10 hover:text-primary"
                                    aria-label={`Edit ${account.name}`}
                                    title="Edit"
                                    data-testid={`coa-edit-${account.id}`}
                                  >
                                    <span className="material-symbols-outlined text-xl" aria-hidden="true">edit</span>
                                  </Link>
                                )}
                                {canDeleteLedgerAccount(account) && (
                                  <button
                                    onClick={() => startRemove(account)}
                                    className="inline-flex p-2 rounded-full text-subtle-text hover:bg-danger/10 hover:text-danger"
                                    aria-label={`Delete ${account.name}`}
                                    title="Delete"
                                    data-testid={`coa-delete-${account.id}`}
                                  >
                                    <span className="material-symbols-outlined text-xl" aria-hidden="true">delete</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Added (SOUPFIN-149): delete / deactivate confirmation */}
      {removing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coa-remove-title"
            className="relative w-full max-w-sm rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden p-6"
            data-testid="coa-remove-dialog"
          >
            <div className="flex flex-col items-center text-center">
              <div className="size-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-danger text-2xl">
                  {removing.mode === 'deactivate' ? 'block' : 'delete'}
                </span>
              </div>
              {removing.mode === 'checking' ? (
                <>
                  <h3 id="coa-remove-title" className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                    Checking {removing.account.name}
                  </h3>
                  <p className="text-subtle-text mb-6" data-testid="coa-remove-checking">
                    Looking for transactions on this account...
                  </p>
                </>
              ) : removing.mode === 'delete' ? (
                <>
                  <h3 id="coa-remove-title" className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                    Delete {removing.account.name}?
                  </h3>
                  <p className="text-subtle-text mb-6" data-testid="coa-remove-message">
                    This account has no transactions. Deleting it removes it for good.
                  </p>
                </>
              ) : (
                <>
                  <h3 id="coa-remove-title" className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                    Deactivate {removing.account.name}?
                  </h3>
                  <p className="text-subtle-text mb-6" data-testid="coa-remove-message">
                    {removing.checkError
                      ? `We couldn't check this account for transactions (${removing.checkError}), so it can only be deactivated.`
                      : "This account has transactions, so it can't be deleted."}{' '}
                    Deactivating hides it from your accounts and keeps its history.
                  </p>
                </>
              )}
              {removing.actionError && (
                <p className="text-sm text-danger mb-4" role="alert" data-testid="coa-remove-error">
                  {removing.actionError}
                </p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setRemoving(null)}
                  disabled={removing.pending}
                  className="flex-1 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 disabled:opacity-50"
                  data-testid="coa-remove-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemove}
                  disabled={removing.mode === 'checking' || removing.pending}
                  className="flex-1 h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                  data-testid="coa-remove-confirm"
                >
                  {removing.pending
                    ? removing.mode === 'delete' ? 'Deleting...' : 'Deactivating...'
                    : removing.mode === 'deactivate' ? 'Deactivate' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
