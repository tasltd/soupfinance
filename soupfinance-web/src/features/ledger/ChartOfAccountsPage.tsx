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
import { useQuery } from '@tanstack/react-query';
import { listLedgerAccounts } from '../../api/endpoints/ledger';
import { useFormatCurrency } from '../../stores';
import type { LedgerAccount, LedgerGroup } from '../../types';

// Added: Group configuration with colors and icons
const GROUP_CONFIG: Record<LedgerGroup, { label: string; icon: string; colorClass: string }> = {
  ASSET: { label: 'Assets', icon: 'account_balance', colorClass: 'text-info bg-info/10' },
  LIABILITY: { label: 'Liabilities', icon: 'credit_card', colorClass: 'text-danger bg-danger/10' },
  EQUITY: { label: 'Equity', icon: 'balance', colorClass: 'text-purple-600 bg-purple-100' },
  INCOME: { label: 'Income', icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  REVENUE: { label: 'Revenue', icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  EXPENSE: { label: 'Expenses', icon: 'trending_down', colorClass: 'text-warning bg-warning/10' },
};

// Added: Order for displaying groups
const GROUP_ORDER: LedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE', 'EXPENSE'];

export function ChartOfAccountsPage() {
  const formatCurrency = useFormatCurrency();

  // Added: Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<LedgerGroup>>(new Set(GROUP_ORDER));

  // Added: Fetch accounts from API
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => listLedgerAccounts(),
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
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="coa-loading">
          Loading accounts...
        </div>
      ) : error ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="coa-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load accounts</h3>
          <p className="text-subtle-text mb-4">There was an error loading your chart of accounts. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Retry
          </button>
        </div>
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
    </div>
  );
}
