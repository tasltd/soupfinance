/**
 * Chart of Accounts Page
 * Lists all ledger accounts grouped by type
 *
 * Added: Full API integration with listLedgerAccounts endpoint
 * Added: Grouping by ledger group (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 * Fix (SOUPFIN-142): fetch every page of accounts (the backend default is 10),
 *   show accounts with no derivable group under "Uncategorised" instead of
 *   rendering nothing, and give the empty state a way forward.
 * Added (SOUPFIN-147): the empty state's call to action opens the template picker
 *   (coaTemplate/index + applyTemplate), and a banner reports what was added.
 * Changed (SOUPFIN-164): every visible string comes from the `ledger` namespace.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listAllLedgerAccounts } from '../../api/endpoints/ledger';
import { useFormatCurrency } from '../../stores';
import { ApiErrorState } from '../../components/feedback';
import type { LedgerAccount, LedgerGroup } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import { logger } from '../../utils/logger';
import { CoaTemplatePicker } from './CoaTemplatePicker';

// Added: Group configuration with colors and icons
// Changed (SOUPFIN-164): labels moved to ledger:chartOfAccounts.groups
const GROUP_CONFIG: Record<LedgerGroup, { icon: string; colorClass: string }> = {
  ASSET: { icon: 'account_balance', colorClass: 'text-info bg-info/10' },
  LIABILITY: { icon: 'credit_card', colorClass: 'text-danger bg-danger/10' },
  EQUITY: { icon: 'balance', colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30' },
  INCOME: { icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  REVENUE: { icon: 'trending_up', colorClass: 'text-success bg-success/10' },
  EXPENSE: { icon: 'trending_down', colorClass: 'text-warning bg-warning/10' },
};

// Added: Order for displaying groups
const GROUP_ORDER: LedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE', 'EXPENSE'];

// Added (SOUPFIN-142): bucket for accounts whose group cannot be derived from
// their category (shallow FK, unknown group token). Rendered last.
const UNCATEGORISED = 'UNCATEGORISED' as const;
type DisplayGroup = LedgerGroup | typeof UNCATEGORISED;
const DISPLAY_ORDER: DisplayGroup[] = [...GROUP_ORDER, UNCATEGORISED];
const DISPLAY_CONFIG: Record<DisplayGroup, { icon: string; colorClass: string; hasNote?: boolean }> = {
  ...GROUP_CONFIG,
  UNCATEGORISED: {
    icon: 'help',
    colorClass: 'text-subtle-text bg-subtle-text/10',
    hasNote: true,
  },
};

export function ChartOfAccountsPage() {
  const formatCurrency = useFormatCurrency();
  const { t } = useTranslation(['ledger', 'common']);

  // Added (SOUPFIN-147): template picker and the result of the last apply
  const [pickerOpen, setPickerOpen] = useState(false);
  const [applied, setApplied] = useState<{ count: number; template: string } | null>(null);

  // Added: Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<DisplayGroup>>(new Set(DISPLAY_ORDER));

  // Added: Fetch accounts from API
  // NOTE: do not retry on 403 (module-disabled is permanent until admin enables it)
  const { data: accounts, isLoading, error, refetch } = useQuery({
    queryKey: ['ledger-accounts'],
    // Fix (SOUPFIN-142): listLedgerAccounts() returned only the backend's default 10 rows
    queryFn: () => listAllLedgerAccounts(),
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });

  // Added: Group accounts by ledgerGroup
  // Fix (SOUPFIN-142): an account whose group is missing or not in GROUP_ORDER used to
  // be dropped silently — when that was every account the page rendered blank.
  const groupedAccounts = useMemo(() => {
    const groups: Partial<Record<DisplayGroup, LedgerAccount[]>> = {};
    const unknown: LedgerAccount[] = [];
    for (const account of accounts ?? []) {
      const group: DisplayGroup = GROUP_ORDER.includes(account.ledgerGroup) ? account.ledgerGroup : UNCATEGORISED;
      if (group === UNCATEGORISED) unknown.push(account);
      (groups[group] ??= []).push(account);
    }
    if (unknown.length > 0) {
      logger.warn('Chart of accounts: no ledger group for some accounts', unknown.map((a) => ({
        id: a.id,
        name: a.name,
        category: (a.ledgerAccountCategory as { serialised?: string } | undefined)?.serialised,
      })));
    }
    return groups;
  }, [accounts]);

  // Added: Toggle group expansion
  const toggleGroup = (group: DisplayGroup) => {
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
            {t('chartOfAccounts.title')}
          </h1>
          <p className="text-subtle-text">{t('chartOfAccounts.subtitle')}</p>
          <HelpLink section="chart-of-accounts" className="mt-1 self-start" />
        </div>
      </div>

      {/* Added (SOUPFIN-147): confirmation after a template was applied */}
      {applied && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
          data-testid="coa-setup-success"
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">check_circle</span>
            {t('chartOfAccounts.setup.applied', { count: applied.count, template: applied.template })}
          </span>
          <button
            type="button"
            onClick={() => setApplied(null)}
            aria-label={t('chartOfAccounts.setup.close')}
            className="flex size-7 items-center justify-center rounded-full hover:bg-success/20"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="coa-loading">
          {t('chartOfAccounts.loading')}
        </div>
      ) : error ? (
        <ApiErrorState
          error={error}
          onRetry={() => refetch()}
          testId="coa-error"
        />
      ) : !accounts || accounts.length === 0 ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="coa-empty">
          <span className="material-symbols-outlined text-6xl text-primary/70 mb-4" aria-hidden="true">account_tree</span>
          {/* Changed (SOUPFIN-147): "Your chart of accounts is empty" becomes a set-up call to action */}
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('chartOfAccounts.setup.ctaTitle')}</h3>
          <p className="text-subtle-text max-w-xl mx-auto" data-testid="coa-empty-hint">
            {t('chartOfAccounts.setup.ctaBody')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90"
              data-testid="coa-setup-cta"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">auto_awesome</span>
              {t('chartOfAccounts.setup.ctaButton')}
            </button>
            {/* Added (SOUPFIN-142): a chart may arrive from sign-up or an administrator */}
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-[#f5f1f0] dark:bg-white/10 text-text-light dark:text-text-dark text-sm font-bold hover:bg-gray-200 dark:hover:bg-white/20"
              data-testid="coa-empty-refresh"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
              {t('chartOfAccounts.setup.refresh')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="coa-groups">
          {DISPLAY_ORDER.map(group => {
            const groupAccounts = groupedAccounts[group];
            if (!groupAccounts || groupAccounts.length === 0) return null;

            const config = DISPLAY_CONFIG[group];
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
                      <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t(`chartOfAccounts.groups.${group}`)}</h2>
                      <p className="text-sm text-subtle-text">{t('chartOfAccounts.setup.accountCount', { count: groupAccounts.length })}</p>
                      {config.hasNote && (
                        <p className="text-xs text-subtle-text" data-testid={`coa-group-note-${group.toLowerCase()}`}>{t('chartOfAccounts.uncategorisedNote')}</p>
                      )}
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
                          <th className="px-6 py-3 text-left">{t('chartOfAccounts.columns.code')}</th>
                          <th className="px-6 py-3 text-left">{t('chartOfAccounts.columns.name')}</th>
                          <th className="px-6 py-3 text-left">{t('chartOfAccounts.columns.currency')}</th>
                          <th className="px-6 py-3 text-right">{t('chartOfAccounts.columns.balance')}</th>
                          <th className="px-6 py-3 text-center">{t('chartOfAccounts.columns.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupAccounts
                          .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))
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
                                      {t('chartOfAccounts.underParent', { parent: account.parentAccount.name })}
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
                                  {account.isActive ? t('common:status.active') : t('common:status.inactive')}
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

      {pickerOpen && (
        <CoaTemplatePicker
          onClose={() => setPickerOpen(false)}
          onApplied={(result, templateName) => {
            setPickerOpen(false);
            setApplied({ count: result.summary.created, template: templateName });
          }}
        />
      )}
    </div>
  );
}
