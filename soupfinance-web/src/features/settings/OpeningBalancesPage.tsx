/**
 * Added (SOUPFIN-158): Settings > Financial Years > Opening balances.
 *
 * For a business moving from another system: type each account's balance as of
 * a date, debit or credit, and post them in one go. The grid must balance before
 * it can be posted. The backend (plans/soupfin-158-period-end-backend.md §5)
 * posts the grid as one balanced entry. Opening Balance Equity (seeded by
 * SOUPFIN-143) takes up whatever the old books do not explain: "Put the
 * difference in Opening Balance Equity" fills that row.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listAllLedgerAccounts } from '../../api/endpoints/ledger';
import { listFinancialYears, postOpeningBalances } from '../../api/endpoints/financialYears';
import { getApiErrorMessage, getPeriodLockError } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { useCurrencyConfig } from '../../stores';
import { formatAmountWithConfig } from '../../stores/accountStore';
import { formatDisplayDate, getTodayIsoDate } from '../../utils/date';
import type { LedgerAccount, LedgerGroup } from '../../types';
import type { OpeningBalancesResponse } from '../../types/financialYear';
import { dayBefore } from './financialYearDates';
import {
  balancingAmounts,
  canSubmitGrid,
  gridTotals,
  rowError,
  toOpeningBalanceLines,
  type GridAmounts,
} from './openingBalanceGrid';

const GROUP_ORDER: Array<{ groups: LedgerGroup[]; label: string }> = [
  { groups: ['ASSET'], label: 'Assets' },
  { groups: ['LIABILITY'], label: 'Liabilities' },
  { groups: ['EQUITY'], label: 'Equity' },
  { groups: ['INCOME', 'REVENUE'], label: 'Income' },
  { groups: ['EXPENSE'], label: 'Expenses' },
];

const OPENING_BALANCE_EQUITY = /opening\s+balance\s+equity/i;

const amountClass =
  'w-full h-10 rounded-lg border bg-white dark:bg-background-dark px-3 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50';

export default function OpeningBalancesPage() {
  const currency = useCurrencyConfig();
  const money = (amount: number) => formatAmountWithConfig(amount, currency);

  const accountsQuery = useQuery({ queryKey: ['ledger-accounts', 'all'], queryFn: listAllLedgerAccounts });
  // The years only suggest a default date, so a failure here leaves today in
  // place instead of blocking the wizard; the Financial Years page shows it.
  const yearsQuery = useQuery({ queryKey: ['financialYears'], queryFn: listFinancialYears });

  const suggestedDate = useMemo(() => {
    const years = yearsQuery.data ?? [];
    if (years.length === 0) return getTodayIsoDate();
    const earliest = years.reduce((min, year) => (year.fromDate < min ? year.fromDate : min), years[0].fromDate);
    return dayBefore(earliest);
  }, [yearsQuery.data]);

  const [asOfDraft, setAsOfDraft] = useState<string | null>(null);
  const asOfDate = asOfDraft ?? suggestedDate;
  const [rows, setRows] = useState<Record<string, GridAmounts>>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<OpeningBalancesResponse | null>(null);

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const totals = gridTotals(rows);
  const canSubmit = canSubmitGrid(totals, asOfDate);
  const obeAccount = accounts.find((account) => OPENING_BALANCE_EQUITY.test(account.name));

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map(({ groups, label }) => ({
        label,
        accounts: accounts.filter((account) => groups.includes(account.ledgerGroup)),
      })).filter((group) => group.accounts.length > 0),
    [accounts]
  );

  const submitMutation = useMutation({
    mutationFn: () => postOpeningBalances({ asOfDate, lines: toOpeningBalanceLines(rows) }),
    onSuccess: (data) => setResult(data),
    onError: (error) => {
      const lock = getPeriodLockError(error);
      if (lock) {
        setDateError(lock.message);
        return;
      }
      setSubmitError(getApiErrorMessage(error));
    },
  });

  const setCell = (accountId: string, side: keyof GridAmounts, value: string) => {
    setResult(null);
    setSubmitError(null);
    setRows((prev) => {
      const current = prev[accountId] ?? { debit: '', credit: '' };
      return { ...prev, [accountId]: { ...current, [side]: value } };
    });
  };

  const handleBalance = () => {
    if (!obeAccount) return;
    setRows((prev) => ({ ...prev, [obeAccount.id]: balancingAmounts(prev, obeAccount.id) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setDateError(null);
    submitMutation.mutate();
  };

  const renderRow = (account: LedgerAccount) => {
    const amounts = rows[account.id];
    const error = rowError(amounts);
    return (
      <tr key={account.id} className="border-b border-border-light dark:border-border-dark" data-testid={`opening-balance-row-${account.id}`}>
        <td className="px-4 py-2 text-subtle-text whitespace-nowrap">{account.code || account.number}</td>
        <td className="px-4 py-2 text-text-light dark:text-text-dark">
          {account.name}
          {error && (
            <p className="text-xs text-danger mt-1" role="alert" data-testid={`opening-balance-row-error-${account.id}`}>{error}</p>
          )}
        </td>
        {(['debit', 'credit'] as const).map((side) => (
          <td key={side} className="px-4 py-2 w-40">
            <input
              inputMode="decimal"
              aria-label={`${account.name} ${side}`}
              value={amounts?.[side] ?? ''}
              onChange={(e) => setCell(account.id, side, e.target.value)}
              placeholder="0.00"
              className={`${amountClass} ${error ? 'border-danger' : 'border-border-light dark:border-border-dark'}`}
              data-testid={`opening-balance-${side}-${account.id}`}
            />
          </td>
        ))}
      </tr>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="opening-balances-page" noValidate>
      <div className="flex flex-col gap-1">
        <Link to="/settings/financial-years" className="text-sm text-primary font-medium flex items-center gap-1 w-fit" data-testid="opening-balances-back">
          <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span>
          Financial Years
        </Link>
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Opening balances</h2>
        <p className="text-subtle-text text-sm">
          Moving from another system? Enter each account's balance from your old books as of one date. Debits must equal
          credits before you can post them.
        </p>
      </div>

      <section className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-2">
        <label className="flex flex-col gap-1 w-56">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">Balances as of</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDraft(e.target.value);
              setDateError(null);
              setResult(null);
            }}
            className={`h-11 rounded-lg border bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 ${dateError ? 'border-danger' : 'border-border-light dark:border-border-dark'}`}
            aria-invalid={!!dateError}
            data-testid="opening-balances-date-input"
          />
        </label>
        {dateError ? (
          <p className="text-sm text-danger" role="alert" data-testid="opening-balances-date-error">{dateError}</p>
        ) : (
          <p className="text-xs text-subtle-text">Usually the last day before your first financial year in SoupFinance.</p>
        )}
      </section>

      {result && (
        <div
          className="flex flex-wrap items-center gap-2 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm"
          role="status"
          data-testid="opening-balances-success"
        >
          <span aria-hidden="true" className="material-symbols-outlined">check_circle</span>
          Posted {result.lineCount} opening {result.lineCount === 1 ? 'balance' : 'balances'} as of {formatDisplayDate(result.asOfDate)}.
          <Link to="/reports/trial-balance" className="font-bold underline" data-testid="opening-balances-trial-balance-link">
            Check them on the Trial Balance
          </Link>
        </div>
      )}
      {submitError && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          role="alert"
          data-testid="opening-balances-error"
        >
          <span aria-hidden="true" className="material-symbols-outlined">error</span>
          {submitError}
        </div>
      )}

      <section className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        {accountsQuery.isLoading ? (
          <p className="p-8 text-center text-subtle-text" data-testid="opening-balances-loading">Loading your chart of accounts...</p>
        ) : accountsQuery.error ? (
          <div className="p-6">
            <ApiErrorState error={accountsQuery.error} onRetry={() => accountsQuery.refetch()} testId="opening-balances-accounts-error" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-2" data-testid="opening-balances-no-accounts">
            <p className="font-bold text-text-light dark:text-text-dark">Your chart of accounts is empty</p>
            <Link to="/ledger" className="text-sm text-primary font-bold">Set up the chart of accounts first</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" data-testid="opening-balances-grid">
              <thead className="text-xs text-subtle-text uppercase bg-[#f5f1f0] dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              {grouped.map((group) => (
                <tbody key={group.label}>
                  <tr className="bg-gray-50 dark:bg-white/5">
                    <th colSpan={4} scope="colgroup" className="px-4 py-2 font-bold text-text-light dark:text-text-dark">{group.label}</th>
                  </tr>
                  {group.accounts.map(renderRow)}
                </tbody>
              ))}
              <tfoot>
                <tr className="font-bold text-text-light dark:text-text-dark">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right" data-testid="opening-balances-total-debit">{money(totals.totalDebit)}</td>
                  <td className="px-4 py-3 text-right" data-testid="opening-balances-total-credit">{money(totals.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p
          className={`flex items-center gap-2 text-sm font-bold ${totals.balanced ? 'text-green-700 dark:text-green-400' : 'text-danger'}`}
          data-testid="opening-balances-balance-status"
          data-balanced={totals.balanced}
        >
          <span aria-hidden="true" className="material-symbols-outlined">{totals.balanced ? 'check_circle' : 'error'}</span>
          {totals.balanced
            ? totals.lineCount > 0 ? 'Debits equal credits.' : 'Enter at least one balance.'
            : `Out of balance by ${money(Math.abs(totals.difference))}.`}
        </p>
        <div className="flex flex-wrap gap-3">
          {obeAccount && !totals.balanced && (
            <button
              type="button"
              onClick={handleBalance}
              className="h-10 px-4 rounded-lg bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20"
              data-testid="opening-balances-plug-button"
            >
              Put the difference in {obeAccount.name}
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit || submitMutation.isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="opening-balances-submit"
          >
            {submitMutation.isPending ? 'Posting...' : 'Post opening balances'}
          </button>
        </div>
      </div>
    </form>
  );
}
