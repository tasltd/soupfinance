/**
 * Added (SOUPFIN-163): Account Ledger page (/ledger/accounts/:id).
 * Reference: soupfinance-designs/general-ledger-entries/, gl-transactions-base-page/
 *
 * One account's transactions for a period, oldest first, with the opening
 * balance, the balance after every line and the closing balance.
 *
 * - Opening balance: the account's debit and credit totals from the start of
 *   the books to the day before "From" (/ledgerAccount/balance), signed on the
 *   account's normal side. No "From" date means the whole history, opening 0.
 * - Lines: every transaction in the period, fetched a server page at a time.
 *   The running balance needs every earlier line, so the period is loaded in
 *   full and the table pages on the client.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getLedgerAccount, getAccountPeriodTotals, listAllLedgerTransactions } from '../../api/endpoints/ledger';
import { useFormatCurrency } from '../../stores';
import { ApiErrorState } from '../../components/feedback';
import { DateFilterField } from '../../components/forms';
import { HelpLink } from '../../components/help';
import { getTodayIsoDate } from '../../utils/date';
import type { LedgerAccount } from '../../types';
import { buildAccountLedger, dayBefore, normalSide, signedBalance } from '../../utils/ledgerBalance';

// Accounting opening date far enough back to include every posting.
const BOOKS_START = '1900-01-01';
export const ACCOUNT_LEDGER_PAGE_SIZE = 50;

const numberFormat = new Intl.NumberFormat('en-US');

/** First day of the current year in the user's calendar. */
function startOfYear(): string {
  return `${getTodayIsoDate().slice(0, 4)}-01-01`;
}

const noRetryOnAuth = (failureCount: number, err: unknown) => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403 || status === 401 || status === 404) return false;
  return failureCount < 2;
};

export function AccountLedgerPage() {
  const { id = '' } = useParams<{ id: string }>();
  const formatCurrency = useFormatCurrency();

  const [startDate, setStartDate] = useState(startOfYear);
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const accountQuery = useQuery({
    queryKey: ['ledger-account', id],
    queryFn: () => getLedgerAccount(id),
    enabled: !!id,
    retry: noRetryOnAuth,
  });

  const openingQuery = useQuery({
    queryKey: ['ledger-account-opening', id, startDate],
    queryFn: () => getAccountPeriodTotals(id, BOOKS_START, dayBefore(startDate)),
    enabled: !!id && !!startDate,
    retry: noRetryOnAuth,
  });

  const linesQuery = useQuery({
    queryKey: ['ledger-account-lines', id, startDate, endDate],
    queryFn: () => listAllLedgerTransactions({
      accountId: id,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sort: 'transactionDate',
      order: 'asc',
    }),
    enabled: !!id,
    retry: noRetryOnAuth,
  });

  const account = accountQuery.data;
  const side = normalSide(account as { ledgerGroup?: LedgerAccount['ledgerGroup']; ledgerState?: string | null } | undefined);
  const opening = startDate && openingQuery.data
    ? signedBalance(openingQuery.data.debit, openingQuery.data.credit, side)
    : 0;

  const ledger = useMemo(
    () => buildAccountLedger(opening, linesQuery.data?.rows ?? [], side),
    [opening, linesQuery.data, side]
  );

  const isLoading = accountQuery.isLoading || linesQuery.isLoading || (!!startDate && openingQuery.isLoading);
  const error = accountQuery.error || linesQuery.error || openingQuery.error;

  const pageCount = Math.max(1, Math.ceil(ledger.lines.length / ACCOUNT_LEDGER_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * ACCOUNT_LEDGER_PAGE_SIZE;
  const pageLines = ledger.lines.slice(pageStart, pageStart + ACCOUNT_LEDGER_PAGE_SIZE);
  // Balance brought forward into this page: the opening on page 1, else the
  // balance after the last line of the previous page.
  const broughtForward = pageStart === 0 ? ledger.opening : ledger.lines[pageStart - 1].balance;

  const title = account ? [account.code, account.name].filter(Boolean).join(' · ') : 'Account ledger';
  const periodLabel = startDate
    ? `${startDate} to ${endDate || 'today'}`
    : `All dates to ${endDate || 'today'}`;

  return (
    <div className="flex flex-col gap-6" data-testid="account-ledger-page">
      {/* Breadcrumbs */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link to="/ledger/accounts" className="text-subtle-text font-medium hover:text-primary" data-testid="account-ledger-back">
          Chart of Accounts
        </Link>
        <span className="text-subtle-text">/</span>
        <span className="text-text-light dark:text-text-dark font-medium">{account?.name || 'Account'}</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="account-ledger-heading">
            {title}
          </h1>
          <p className="text-subtle-text">
            Account ledger · {side === 'DEBIT' ? 'debit-balance account' : 'credit-balance account'}
            {account?.currency ? ` · ${account.currency}` : ''}
          </p>
          <HelpLink section="ledger-transactions" className="mt-1 self-start" />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4" data-testid="account-ledger-filters">
        <div className="flex flex-wrap gap-4 items-end">
          <DateFilterField
            label="From"
            ariaLabel="Ledger from date"
            id="account-ledger-start-date"
            value={startDate}
            onChange={(v) => { setStartDate(v); setPage(1); }}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="account-ledger-start-date"
          />
          <DateFilterField
            label="To"
            ariaLabel="Ledger to date"
            id="account-ledger-end-date"
            value={endDate}
            onChange={(v) => { setEndDate(v); setPage(1); }}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="account-ledger-end-date"
          />
          <p className="text-sm text-subtle-text pb-2" data-testid="account-ledger-period">{periodLabel}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-subtle-text" data-testid="account-ledger-loading">
          Loading ledger
        </div>
      ) : error ? (
        <ApiErrorState
          error={error}
          onRetry={() => { accountQuery.refetch(); openingQuery.refetch(); linesQuery.refetch(); }}
          testId="account-ledger-error"
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="account-ledger-summary">
            {[
              { label: 'Opening balance', value: ledger.opening, testId: 'account-ledger-opening' },
              { label: 'Total debits', value: ledger.totalDebit, testId: 'account-ledger-total-debit' },
              { label: 'Total credits', value: ledger.totalCredit, testId: 'account-ledger-total-credit' },
              { label: 'Closing balance', value: ledger.closing, testId: 'account-ledger-closing' },
            ].map((card) => (
              <div
                key={card.testId}
                className="flex flex-col gap-1 rounded-xl p-4 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark"
              >
                <p className="text-sm text-subtle-text font-medium">{card.label}</p>
                <p className="text-xl font-bold text-text-light dark:text-text-dark" data-testid={card.testId}>
                  {formatCurrency(card.value)}
                </p>
              </div>
            ))}
          </div>

          {linesQuery.data?.truncated && (
            <p className="text-sm text-warning" data-testid="account-ledger-truncated">
              This period has more than {numberFormat.format(ledger.lines.length)} transactions. Narrow the dates to see them all.
            </p>
          )}

          {/* Ledger table */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="account-ledger-table">
                <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                  <tr>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Reference</th>
                    <th className="px-6 py-3 text-left">Description</th>
                    <th className="px-6 py-3 text-right">Debit</th>
                    <th className="px-6 py-3 text-right">Credit</th>
                    <th className="px-6 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border-light dark:border-border-dark bg-background-light/60 dark:bg-background-dark/60 font-medium" data-testid="account-ledger-brought-forward">
                    <td className="px-6 py-3 text-subtle-text" colSpan={5}>
                      {pageStart === 0 ? 'Opening balance' : 'Balance brought forward'}
                    </td>
                    <td className="px-6 py-3 text-right text-text-light dark:text-text-dark">{formatCurrency(broughtForward)}</td>
                  </tr>
                  {pageLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-subtle-text" data-testid="account-ledger-empty">
                        No transactions on this account in this period.
                      </td>
                    </tr>
                  ) : (
                    pageLines.map((line) => (
                      <tr
                        key={line.transaction.id}
                        className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                        data-testid={`account-ledger-row-${line.transaction.id}`}
                      >
                        <td className="px-6 py-3 whitespace-nowrap text-text-light dark:text-text-dark">
                          {line.transaction.transactionDate?.slice(0, 10)}
                        </td>
                        <td className="px-6 py-3 font-mono text-primary">{line.transaction.transactionNumber || '-'}</td>
                        <td className="px-6 py-3 max-w-xs truncate text-text-light dark:text-text-dark">{line.transaction.description || '-'}</td>
                        <td className="px-6 py-3 text-right text-text-light dark:text-text-dark">{line.debit ? formatCurrency(line.debit) : '-'}</td>
                        <td className="px-6 py-3 text-right text-info">{line.credit ? formatCurrency(line.credit) : '-'}</td>
                        <td className="px-6 py-3 text-right font-medium text-text-light dark:text-text-dark" data-testid={`account-ledger-balance-${line.transaction.id}`}>
                          {formatCurrency(line.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {ledger.lines.length > ACCOUNT_LEDGER_PAGE_SIZE && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4" data-testid="account-ledger-pagination">
              <p className="text-sm text-subtle-text">
                Rows {numberFormat.format(pageStart + 1)}–{numberFormat.format(pageStart + pageLines.length)} of {numberFormat.format(ledger.lines.length)}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-light dark:text-text-dark">Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark text-sm text-text-light dark:text-text-dark hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="account-ledger-prev"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark text-sm text-text-light dark:text-text-dark hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="account-ledger-next"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
