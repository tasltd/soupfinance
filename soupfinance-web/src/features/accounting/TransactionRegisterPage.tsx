/**
 * Transaction Register Page
 * Unified list view of all accounting transactions (journal entries, payment vouchers, receipt vouchers)
 * Reference: soupfinance-designs/general-ledger-entries/, design-system.md
 *
 * Changed: Now fetches transactions from API via useTransactions hook
 * Changed (SOUPFIN-164): every visible string comes from the `accounting` namespace,
 *   and Delete, batch Delete and Reverse ask through ConfirmDialog instead of
 *   window.confirm.
 */
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
// Added: Import useTransactions hook for API data fetching
import { useTransactions, type UnifiedTransaction } from '../../hooks/useTransactions';
// Added: API imports for transaction actions
// Changed: Removed unused imports (postLedgerTransaction, reverseLedgerTransaction, deleteLedgerTransaction)
// These single-transaction methods are not used - we use group/voucher actions instead
import {
  postTransactionGroup,
  reverseTransactionGroup,
  deleteTransactionGroup,
  postVoucher,
  cancelVoucher,
  deleteVoucher,
} from '../../api/endpoints/ledger';
import { useQueryClient } from '@tanstack/react-query';
// Added (SOUPFIN-9): parse 403/network errors into user-friendly messages
import { parseApiError } from '../../api/errors';
import { translateApiError, getTranslatedApiErrorMessage } from '../../i18n/translateApiError';
import { ApiErrorState, ConfirmDialog, useToast } from '../../components/feedback';
// SOUPFIN-20: route the raw date filter inputs through the same sanitiser the
// shared DatePicker uses (SOUPFIN-19) so a null/sentinel/malformed value never
// renders as the confusing "0/0/0" placeholder the user reported.
import { getTodayIsoDate, sanitizeDateInputValue } from '../../utils/date';
// Fix (SOUPFIN-33 #1/#6): labelled date filter (id/name + <label htmlFor> + empty hint).
import { DateFilterField } from '../../components/forms';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// =============================================================================
// Added: Type definitions for filtering
// =============================================================================

// Added: Transaction type for filtering (maps to source entity type)
type TransactionType = 'JOURNAL_ENTRY' | 'PAYMENT' | 'RECEIPT' | 'ALL';

// Added: Status filter options
type TransactionStatus = 'ALL' | 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED';

// Added: Filter state interface
interface FilterState {
  startDate: string;
  endDate: string;
  status: TransactionStatus;
  type: TransactionType;
  accountId: string;
  minAmount: string;
  maxAmount: string;
}

// Added (SOUPFIN-164): option values for the status and type filters; labels are translated
const STATUS_OPTIONS = ['ALL', 'DRAFT', 'PENDING', 'POSTED', 'REVERSED'] as const;
const TYPE_OPTIONS = ['ALL', 'JOURNAL_ENTRY', 'PAYMENT', 'RECEIPT'] as const;
type BadgeStatus = Exclude<(typeof STATUS_OPTIONS)[number], 'ALL'>;
const isBadgeStatus = (status: string): status is BadgeStatus =>
  (STATUS_OPTIONS as readonly string[]).includes(status) && status !== 'ALL';

// Added (SOUPFIN-164): the action waiting for the user to confirm it
type PendingConfirmation =
  | { kind: 'delete'; tx: UnifiedTransaction }
  | { kind: 'reverse'; tx: UnifiedTransaction }
  | { kind: 'batchDelete'; count: number };

// Added: Default filter values
const defaultFilters: FilterState = {
  startDate: '',
  endDate: '',
  status: 'ALL',
  type: 'ALL',
  accountId: '',
  minAmount: '',
  maxAmount: '',
};

// NOTE: Mock transactions moved to useTransactions hook - data now fetched from API

// =============================================================================
// Added: Component
// =============================================================================

/**
 * TransactionRegisterPage - Unified list view of all accounting transactions
 * Features:
 * - Combined view of journal entries, payment vouchers, and receipt vouchers
 * - Advanced filtering by date, status, type, and account
 * - Batch selection with bulk post/delete actions
 * - Individual transaction actions (view, edit, post, reverse, delete)
 *
 * Changed: Now fetches data from API via useTransactions hook
 */
export function TransactionRegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Added (SOUPFIN-9): toast for action feedback (Post/Reverse/Delete/Export)
  const { showToast } = useToast();
  const { t } = useTranslation(['accounting', 'common']);

  // Added (SOUPFIN-164): confirmation modal state (replaces window.confirm)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Added: Fetch transactions from API
  const { data: transactions, isLoading, isError, error, refetch } = useTransactions();

  // Added: State for selected transaction IDs (for batch actions)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Added: Search query state
  const [searchQuery, setSearchQuery] = useState('');

  // Added: Filter state
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Added: Filter panel visibility state (for future mobile toggle)
  // const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  // Added: Action dropdown state - tracks which row's dropdown is open
  const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null);

  // Added: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Changed: Filter and search transactions from API data
  const filteredTransactions = useMemo(() => {
    // Added: Return empty array if no data loaded yet
    if (!transactions) return [];

    return transactions.filter((tx) => {
      // Search filter - matches transaction ID, description, account name/code
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          tx.transactionId.toLowerCase().includes(query) ||
          tx.description.toLowerCase().includes(query) ||
          tx.accountCode.toLowerCase().includes(query) ||
          tx.accountName.toLowerCase().includes(query) ||
          tx.debitAmount.toString().includes(query) ||
          tx.creditAmount.toString().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'ALL' && tx.status !== filters.status) {
        return false;
      }

      // Type filter
      if (filters.type !== 'ALL' && tx.type !== filters.type) {
        return false;
      }

      // Date range filter
      if (filters.startDate && tx.date < filters.startDate) {
        return false;
      }
      if (filters.endDate && tx.date > filters.endDate) {
        return false;
      }

      // Account filter
      if (filters.accountId && tx.accountCode !== filters.accountId) {
        return false;
      }

      // Amount range filter (checks both debit and credit)
      const minAmount = filters.minAmount ? parseFloat(filters.minAmount) : null;
      const maxAmount = filters.maxAmount ? parseFloat(filters.maxAmount) : null;
      const txAmount = tx.debitAmount > 0 ? tx.debitAmount : tx.creditAmount;
      if (minAmount !== null && txAmount < minAmount) {
        return false;
      }
      if (maxAmount !== null && txAmount > maxAmount) {
        return false;
      }

      return true;
    });
  }, [transactions, searchQuery, filters]);

  // Added: Paginated transactions
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(startIndex, startIndex + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Added: Total pages calculation
  const totalPages = Math.ceil(filteredTransactions.length / pageSize);

  // Added: Check if all visible transactions are selected
  const allSelected = useMemo(() => {
    if (paginatedTransactions.length === 0) return false;
    return paginatedTransactions.every((tx) => selectedIds.has(tx.id));
  }, [paginatedTransactions, selectedIds]);

  // Added: Toggle all selection handler
  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      // Deselect all visible
      const newSelected = new Set(selectedIds);
      paginatedTransactions.forEach((tx) => newSelected.delete(tx.id));
      setSelectedIds(newSelected);
    } else {
      // Select all visible
      const newSelected = new Set(selectedIds);
      paginatedTransactions.forEach((tx) => newSelected.add(tx.id));
      setSelectedIds(newSelected);
    }
  }, [allSelected, paginatedTransactions, selectedIds]);

  // Added: Toggle single selection handler
  const handleToggleSelection = useCallback((id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }, [selectedIds]);

  // Added: Clear filters handler
  const handleClearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  // Added: Apply filter change handler
  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  // Added: Close dropdown when clicking outside
  const handleCloseDropdown = useCallback(() => {
    setOpenActionDropdown(null);
  }, []);

  // Added: Handle action dropdown toggle
  const handleToggleActionDropdown = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenActionDropdown((prev) => (prev === id ? null : id));
  }, []);

  // Added: Navigation handlers
  const handleNewJournalEntry = useCallback(() => {
    navigate('/accounting/journal-entry');
  }, [navigate]);

  const handleNewPayment = useCallback(() => {
    navigate('/accounting/voucher/payment');
  }, [navigate]);

  const handleNewReceipt = useCallback(() => {
    navigate('/accounting/voucher/receipt');
  }, [navigate]);

  // Added: Row action handlers
  const handleView = useCallback((tx: UnifiedTransaction) => {
    // Navigate based on type
    if (tx.type === 'JOURNAL_ENTRY') {
      navigate(`/accounting/journal-entry/${tx.sourceId}`);
    } else {
      // Fix (SOUPFIN-154): /accounting/voucher/:id was never routed
      navigate(`/accounting/vouchers/${tx.sourceId}`);
    }
    setOpenActionDropdown(null);
  }, [navigate]);

  const handleEdit = useCallback((tx: UnifiedTransaction) => {
    if (tx.type === 'JOURNAL_ENTRY') {
      navigate(`/accounting/journal-entry/${tx.sourceId}/edit`);
    } else {
      navigate(`/accounting/vouchers/${tx.sourceId}/edit`);
    }
    setOpenActionDropdown(null);
  }, [navigate]);

  // Changed (SOUPFIN-9): Post transaction with toast feedback on success/failure
  const handlePost = useCallback(async (tx: UnifiedTransaction) => {
    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await postTransactionGroup(tx.sourceId);
      } else {
        await postVoucher(tx.sourceId);
      }
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showToast({ variant: 'success', message: t('transactions.toasts.posted', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to post transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err) });
    }
    setOpenActionDropdown(null);
  }, [queryClient, showToast, t]);

  // Changed (SOUPFIN-9): Reverse transaction with toast feedback
  // Changed (SOUPFIN-164): runs only after the user confirms in ConfirmDialog
  const performReverse = useCallback(async (tx: UnifiedTransaction) => {
    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await reverseTransactionGroup(tx.sourceId);
      } else {
        await cancelVoucher(tx.sourceId);
      }
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showToast({ variant: 'success', message: t('transactions.toasts.reversed', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to reverse transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err) });
    }
  }, [queryClient, showToast, t]);

  // Changed (SOUPFIN-9): Delete transaction with toast feedback
  // Changed (SOUPFIN-164): runs only after the user confirms in ConfirmDialog
  const performDelete = useCallback(async (tx: UnifiedTransaction) => {
    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await deleteTransactionGroup(tx.sourceId);
      } else {
        await deleteVoucher(tx.sourceId);
      }
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showToast({ variant: 'success', message: t('transactions.toasts.deleted', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to delete transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err) });
    }
  }, [queryClient, showToast, t]);

  // Added (SOUPFIN-164): row actions open the confirmation modal
  const handleReverse = useCallback((tx: UnifiedTransaction) => {
    setOpenActionDropdown(null);
    setPendingConfirmation({ kind: 'reverse', tx });
  }, []);

  const handleDelete = useCallback((tx: UnifiedTransaction) => {
    setOpenActionDropdown(null);
    setPendingConfirmation({ kind: 'delete', tx });
  }, []);

  // Changed (SOUPFIN-9): Batch post with summary toast
  const handleBatchPost = useCallback(async () => {
    if (selectedIds.size === 0 || !transactions) return;

    const selectedTxs = transactions.filter(tx => selectedIds.has(tx.id));

    try {
      await Promise.all(
        selectedTxs.map(tx => {
          if (tx.type === 'JOURNAL_ENTRY') {
            return postTransactionGroup(tx.sourceId);
          } else {
            return postVoucher(tx.sourceId);
          }
        })
      );
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showToast({ variant: 'success', message: t('transactions.toasts.batchPosted', { count: selectedTxs.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Batch post failed:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err) });
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient, showToast, t]);

  // Changed (SOUPFIN-9): Batch delete with summary toast
  // Changed (SOUPFIN-164): asks through ConfirmDialog, then performBatchDelete runs
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0 || !transactions) return;
    setPendingConfirmation({ kind: 'batchDelete', count: selectedIds.size });
  }, [selectedIds, transactions]);

  const performBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || !transactions) return;

    const selectedTxs = transactions.filter(tx => selectedIds.has(tx.id));

    try {
      await Promise.all(
        selectedTxs.map(tx => {
          if (tx.type === 'JOURNAL_ENTRY') {
            return deleteTransactionGroup(tx.sourceId);
          } else {
            return deleteVoucher(tx.sourceId);
          }
        })
      );
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showToast({ variant: 'success', message: t('transactions.toasts.batchDeleted', { count: selectedTxs.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Batch delete failed:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err) });
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient, showToast, t]);

  // Added (SOUPFIN-164): the confirmed action runs, then the modal closes
  const handleConfirm = useCallback(async () => {
    if (!pendingConfirmation) return;
    setIsConfirming(true);
    try {
      if (pendingConfirmation.kind === 'delete') await performDelete(pendingConfirmation.tx);
      else if (pendingConfirmation.kind === 'reverse') await performReverse(pendingConfirmation.tx);
      else await performBatchDelete();
    } finally {
      setIsConfirming(false);
      setPendingConfirmation(null);
    }
  }, [pendingConfirmation, performDelete, performReverse, performBatchDelete]);

  const handleCancelConfirm = useCallback(() => setPendingConfirmation(null), []);

  // Changed (SOUPFIN-9): Export now gives explicit feedback instead of silent console.log.
  // If the transactions query failed (e.g. 403 Accounting module disabled), the
  // error toast tells the user why nothing was exported.
  // Otherwise we generate a CSV from the in-memory data and trigger a download.
  const handleExport = useCallback(() => {
    if (isError) {
      const parsed = translateApiError(parseApiError(error));
      showToast({
        variant: 'error',
        message: t('transactions.toasts.exportBlocked', { reason: parsed.message }),
        duration: 7000,
      });
      return;
    }
    const rows = filteredTransactions;
    if (!rows || rows.length === 0) {
      showToast({ variant: 'warning', message: t('transactions.toasts.exportEmpty') });
      return;
    }
    try {
      const header = ['Date', 'Transaction ID', 'Description', 'Account #', 'Account Name', 'Debit', 'Credit', 'Status', 'Type'];
      const csvRows = rows.map(tx => [
        tx.date,
        tx.transactionId,
        // Escape commas and quotes per RFC 4180
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        tx.accountCode,
        `"${(tx.accountName || '').replace(/"/g, '""')}"`,
        tx.debitAmount.toFixed(2),
        tx.creditAmount.toFixed(2),
        tx.status,
        tx.type,
      ]);
      const csv = [header.join(','), ...csvRows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      // Fix (SOUPFIN-64): stamp the filename with the user's own calendar day.
      // `toISOString().slice(0, 10)` is UTC today, so east of UTC the export
      // was named after yesterday for part of every day.
      link.download = `transactions-${getTodayIsoDate()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast({ variant: 'success', message: t('transactions.toasts.exported', { count: rows.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Export failed:', err);
      showToast({ variant: 'error', message: t('transactions.toasts.exportFailed') });
    }
  }, [filteredTransactions, isError, error, showToast, t]);

  // Added: Status badge color helper
  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'DRAFT':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      case 'PENDING':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
      case 'POSTED':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'REVERSED':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
    }
  };

  // Added: Transaction type label helper (for future use in type column)
  // const getTypeLabel = (type: string): string => {
  //   switch (type) {
  //     case 'JOURNAL_ENTRY':
  //       return 'Journal Entry';
  //     case 'PAYMENT':
  //       return 'Payment';
  //     case 'RECEIPT':
  //       return 'Receipt';
  //     default:
  //       return type;
  //   }
  // };

  // Added: Format currency helper
  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="flex h-full grow" data-testid="transaction-register-page">
      {/* Main Content Area */}
      <div className="flex-1 p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          {/* Added: Page Header with action buttons */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1
                className="text-text-light dark:text-text-dark text-3xl lg:text-4xl font-black leading-tight tracking-[-0.033em]"
                data-testid="transaction-register-heading"
              >
                {t('transactions.title')}
              </h1>
              <p className="text-subtle-text dark:text-subtle-text-dark text-base mt-1">
                {t('transactions.subtitle')}
              </p>
              <HelpLink section="transaction-register" className="mt-1 self-start" />
            </div>
            <div className="flex flex-1 gap-3 flex-wrap justify-start sm:justify-end">
              {/* Added: New Journal Entry button */}
              <button
                type="button"
                onClick={handleNewJournalEntry}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-primary/90"
                data-testid="new-journal-entry-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">add</span>
                <span className="truncate">{t('transactions.newJournalEntry')}</span>
              </button>
              {/* Added: New Payment button */}
              <button
                type="button"
                onClick={handleNewPayment}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-background-light dark:bg-surface-dark text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-200 dark:hover:bg-gray-700"
                data-testid="new-payment-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">payments</span>
                <span className="truncate">{t('transactions.newPayment')}</span>
              </button>
              {/* Added: New Receipt button */}
              <button
                type="button"
                onClick={handleNewReceipt}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-background-light dark:bg-surface-dark text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-200 dark:hover:bg-gray-700"
                data-testid="new-receipt-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">receipt</span>
                <span className="truncate">{t('transactions.newReceipt')}</span>
              </button>
              {/* Added: Export button */}
              <button
                type="button"
                onClick={handleExport}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-transparent text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-100 dark:hover:bg-gray-800 border border-border-light dark:border-border-dark"
                data-testid="export-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">download</span>
                <span className="truncate">{t('common:actions.export')}</span>
              </button>
            </div>
          </div>

          {/* Added: Search Bar */}
          <div className="w-full">
            <label className="flex flex-col min-w-40 h-12 w-full">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                <div className="text-subtle-text dark:text-subtle-text-dark flex border-none bg-surface-light dark:bg-surface-dark items-center justify-center pl-4 rounded-l-lg border-r-0 border border-border-light dark:border-border-dark">
                  <span className="material-symbols-outlined">search</span>
                </div>
                {/* Fix (SOUPFIN-33 #6): id/name + aria-label — the wrapping <label> has
                    no text, so the field had no accessible name. */}
                <input
                  type="search"
                  id="transaction-search"
                  name="transaction-search"
                  aria-label={t('transactions.searchAria')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-text-light dark:text-text-dark focus:outline-0 focus:ring-1 focus:ring-primary border-none bg-surface-light dark:bg-surface-dark h-full placeholder:text-subtle-text dark:placeholder:text-subtle-text-dark px-4 pl-2 text-base font-normal leading-normal border border-l-0 border-border-light dark:border-border-dark"
                  placeholder={t('transactions.searchPlaceholder')}
                  data-testid="transaction-search-input"
                />
              </div>
            </label>
          </div>

          {/* Added: Inline Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-surface-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
            {/* Date Range */}
            {/* Fix (SOUPFIN-33 #1/#6): the sibling <label> had no htmlFor and the input no
                id, leaving the empty native picker unnamed (reported as "0/0/0"). */}
            <DateFilterField
              label={t('transactions.filterBar.from')}
              ariaLabel={t('transactions.filterBar.fromAria')}
              emptyHint={t('common:dateFilter.emptyHint')}
              id="register-start-date"
              value={filters.startDate}
              onChange={(v) => handleFilterChange('startDate', v)}
              containerClassName="flex items-center gap-2"
              labelClassName="text-sm font-medium text-text-light dark:text-subtle-text-dark"
              className="form-input h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
              data-testid="filter-start-date"
            />
            <DateFilterField
              label={t('transactions.filterBar.to')}
              ariaLabel={t('transactions.filterBar.toAria')}
              emptyHint={t('common:dateFilter.emptyHint')}
              id="register-end-date"
              value={filters.endDate}
              onChange={(v) => handleFilterChange('endDate', v)}
              containerClassName="flex items-center gap-2"
              labelClassName="text-sm font-medium text-text-light dark:text-subtle-text-dark"
              className="form-input h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
              data-testid="filter-end-date"
            />

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark" htmlFor="register-status-filter">{t('transactions.filterBar.status')}</label>
              <select
                id="register-status-filter"
                name="register-status-filter"
                aria-label={t('transactions.filterBar.statusAria')}
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="form-select h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-status"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{t(`transactions.statusOptions.${status}`)}</option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark" htmlFor="register-type-filter">{t('transactions.filterBar.type')}</label>
              <select
                id="register-type-filter"
                name="register-type-filter"
                aria-label={t('transactions.filterBar.typeAria')}
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="form-select h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-type"
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{t(`transactions.typeOptions.${type}`)}</option>
                ))}
              </select>
            </div>

            {/* Account Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark" htmlFor="register-account-filter">{t('transactions.filterBar.account')}</label>
              <input
                type="text"
                id="register-account-filter"
                name="register-account-filter"
                aria-label={t('transactions.filterBar.accountAria')}
                value={filters.accountId}
                onChange={(e) => handleFilterChange('accountId', e.target.value)}
                placeholder={t('transactions.filterBar.accountPlaceholder')}
                className="form-input h-9 w-24 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-account"
              />
            </div>

            {/* Clear Filters Button */}
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-subtle-text dark:text-subtle-text-dark hover:text-primary hover:bg-primary/10 text-sm font-medium"
              data-testid="clear-filters-button"
            >
              <span className="material-symbols-outlined text-lg">filter_list_off</span>
              {t('common:actions.clear')}
            </button>
          </div>

          {/* Added: Batch Action Bar (shown when items selected) */}
          {selectedIds.size > 0 && (
            <div
              className="flex items-center justify-between p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/30"
              data-testid="batch-action-bar"
            >
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                {t('transactions.selected', { count: selectedIds.size })}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBatchPost}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90"
                  data-testid="batch-post-button"
                >
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  {t('transactions.postSelected')}
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600"
                  data-testid="batch-delete-button"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                  {t('transactions.deleteSelected')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-transparent text-text-light dark:text-text-dark text-sm font-bold hover:bg-black/10"
                  data-testid="clear-selection-button"
                >
                  {t('common:actions.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Added: Loading State */}
          {isLoading && (
            <div className="w-full" data-testid="transaction-loading">
              <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">
                  progress_activity
                </span>
                <p className="text-subtle-text dark:text-subtle-text-dark text-sm">{t('transactions.loading')}</p>
              </div>
            </div>
          )}

          {/* Changed (SOUPFIN-9): Error State uses ApiErrorState so 403s on
              voucher/ledger endpoints render a "module not enabled" message
              instead of the raw axios "Request failed with status code 403". */}
          {isError && !isLoading && (
            <div className="w-full">
              <ApiErrorState
                error={error}
                onRetry={() => refetch()}
                testId="transaction-error"
              />
            </div>
          )}

          {/* Added: Data Table - Only show when not loading and no error */}
          {!isLoading && !isError && (
          <div className="w-full" data-testid="transaction-table-container">
            <div className="flex overflow-hidden rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark">
              <table className="w-full" data-testid="transaction-table">
                <thead className="bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark">
                  <tr>
                    {/* Added: Checkbox column */}
                    <th className="px-4 py-3 w-12 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleToggleAll}
                        className="h-5 w-5 rounded border-border-light dark:border-border-dark border-2 bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0 focus:border-border-light dark:focus:border-border-dark"
                        data-testid="select-all-checkbox"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.date')}
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.transactionId')}
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.description')}
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.accountNumber')}
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.accountName')}
                    </th>
                    <th className="px-4 py-3 text-right text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.debit')}
                    </th>
                    <th className="px-4 py-3 text-right text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.credit')}
                    </th>
                    <th className="px-4 py-3 text-center text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.status')}
                    </th>
                    <th className="px-4 py-3 text-center text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      {t('transactions.columns.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light dark:divide-border-dark">
                  {paginatedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <span className="material-symbols-outlined text-5xl text-subtle-text/50 mb-3">
                            compare_arrows
                          </span>
                          <h3
                            className="text-lg font-bold text-text-light dark:text-text-dark mb-1"
                            data-testid="empty-state-heading"
                          >
                            {t('transactions.emptyTitle')}
                          </h3>
                          <p className="text-subtle-text dark:text-subtle-text-dark text-sm mb-4">
                            {searchQuery || filters.status !== 'ALL' || filters.type !== 'ALL'
                              ? t('transactions.emptyFiltered')
                              : t('transactions.emptyBody')}
                          </p>
                          {!searchQuery && filters.status === 'ALL' && filters.type === 'ALL' && (
                            <button
                              type="button"
                              onClick={handleNewJournalEntry}
                              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
                              data-testid="empty-state-cta"
                            >
                              <span className="material-symbols-outlined text-lg">add</span>
                              {t('transactions.createJournalEntry')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-primary/5 dark:hover:bg-primary/10"
                        data-testid={`transaction-row-${tx.id}`}
                      >
                        {/* Added: Row checkbox */}
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => handleToggleSelection(tx.id)}
                            className="h-5 w-5 rounded border-border-light dark:border-border-dark border-2 bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0 focus:border-border-light dark:focus:border-border-dark"
                            data-testid={`transaction-checkbox-${tx.id}`}
                          />
                        </td>
                        {/* Added: Date column */}
                        <td className="px-4 py-2 text-subtle-text dark:text-subtle-text-dark text-sm font-normal leading-normal">
                          {tx.date}
                        </td>
                        {/* Added: Transaction ID column */}
                        <td className="px-4 py-2 text-sm font-normal leading-normal">
                          <button
                            type="button"
                            onClick={() => handleView(tx)}
                            className="text-primary hover:underline font-medium"
                            data-testid={`transaction-link-${tx.id}`}
                          >
                            {tx.transactionId}
                          </button>
                        </td>
                        {/* Added: Description column */}
                        <td
                          className="px-4 py-2 text-text-light dark:text-text-dark text-sm font-normal leading-normal max-w-xs truncate"
                          title={tx.description}
                        >
                          {tx.description}
                        </td>
                        {/* Added: Account code column */}
                        <td className="px-4 py-2 text-subtle-text dark:text-subtle-text-dark text-sm font-normal leading-normal">
                          {tx.accountCode}
                        </td>
                        {/* Added: Account name column */}
                        <td className="px-4 py-2 text-subtle-text dark:text-subtle-text-dark text-sm font-normal leading-normal">
                          {tx.accountName}
                        </td>
                        {/* Added: Debit amount column */}
                        <td className="px-4 py-2 text-subtle-text dark:text-subtle-text-dark text-sm font-normal leading-normal text-right">
                          {tx.debitAmount > 0 ? formatCurrency(tx.debitAmount) : '—'}
                        </td>
                        {/* Added: Credit amount column */}
                        <td className="px-4 py-2 text-subtle-text dark:text-subtle-text-dark text-sm font-normal leading-normal text-right">
                          {tx.creditAmount > 0 ? formatCurrency(tx.creditAmount) : '—'}
                        </td>
                        {/* Added: Status badge column */}
                        <td className="px-4 py-2 w-28 text-sm font-normal leading-normal text-center">
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(tx.status)}`}
                            data-testid={`transaction-status-${tx.id}`}
                          >
                            {/* Changed (SOUPFIN-164): translated badge; an unknown status shows as sent */}
                            {isBadgeStatus(tx.status) ? t(`transactions.statusBadges.${tx.status}`) : tx.status}
                          </span>
                        </td>
                        {/* Added: Actions dropdown column */}
                        <td className="px-4 py-2 text-center relative">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionDropdown(tx.id, e)}
                            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                            data-testid={`transaction-actions-${tx.id}`}
                            aria-label={t('transactions.rowActions', { id: tx.transactionId })}
                          >
                            <span className="material-symbols-outlined text-subtle-text dark:text-subtle-text-dark">
                              more_vert
                            </span>
                          </button>
                          {/* Added: Actions dropdown menu */}
                          {openActionDropdown === tx.id && (
                            <>
                              {/* Backdrop to close dropdown */}
                              <div
                                className="fixed inset-0 z-10"
                                onClick={handleCloseDropdown}
                              />
                              <div
                                className="absolute right-0 mt-1 w-40 rounded-lg bg-surface-light dark:bg-surface-dark shadow-lg border border-border-light dark:border-border-dark z-20"
                                data-testid={`transaction-dropdown-${tx.id}`}
                              >
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleView(tx)}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-800"
                                  >
                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                    {t('common:actions.view')}
                                  </button>
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">edit</span>
                                      {t('common:actions.edit')}
                                    </button>
                                  )}
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handlePost(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">check_circle</span>
                                      {t('common:actions.post')}
                                    </button>
                                  )}
                                  {tx.status === 'POSTED' && (
                                    <button
                                      type="button"
                                      onClick={() => handleReverse(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">undo</span>
                                      {t('common:actions.reverse')}
                                    </button>
                                  )}
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">delete</span>
                                      {t('common:actions.delete')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Added: Pagination Controls */}
          {filteredTransactions.length > 0 && (
            <nav
              aria-label={t('transactions.paginationAria')}
              className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 sm:px-0 pt-4"
              data-testid="pagination"
            >
              <div className="hidden sm:block">
                <p className="text-sm text-gray-700 dark:text-gray-400">
                  {/* Changed (SOUPFIN-164): one translated sentence, numbers still in bold */}
                  <Trans
                    t={t}
                    i18nKey="transactions.paginationSummary"
                    values={{
                      from: (currentPage - 1) * pageSize + 1,
                      to: Math.min(currentPage * pageSize, filteredTransactions.length),
                      total: filteredTransactions.length,
                    }}
                    components={{ b: <span className="font-medium" /> }}
                  />
                </p>
              </div>
              <div className="flex flex-1 justify-between sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="pagination-prev"
                >
                  {t('common:pagination.previous')}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="pagination-next"
                >
                  {t('common:pagination.next')}
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>

      {/* Added: Advanced Filters Side Panel (visible on xl screens) */}
      <aside
        className="w-96 min-h-screen bg-surface-light dark:bg-background-dark p-6 border-l border-border-light dark:border-border-dark hidden xl:block"
        data-testid="advanced-filters-panel"
      >
        <div className="flex flex-col gap-6">
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">{t('transactions.panel.title')}</h2>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {/* Date Range */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-date-range-start"
              >
                {t('transactions.panel.dateRange')}
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  type="date"
                  id="panel-date-range-start"
                  aria-label={t('transactions.filterBar.fromAria')}
                  value={sanitizeDateInputValue(filters.startDate)}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-surface-dark"
                  data-testid="panel-filter-start-date"
                />
                <input
                  type="date"
                  id="panel-date-range-end"
                  aria-label={t('transactions.filterBar.toAria')}
                  value={sanitizeDateInputValue(filters.endDate)}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-surface-dark"
                  data-testid="panel-filter-end-date"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-status-filter"
              >
                {t('transactions.panel.status')}
              </label>
              <select
                id="panel-status-filter"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark py-2 pl-3 pr-10 text-base focus:border-primary focus:outline-none focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-background-dark"
                data-testid="panel-filter-status"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{t(`transactions.statusOptions.${status}`)}</option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-type-filter"
              >
                {t('transactions.panel.type')}
              </label>
              <select
                id="panel-type-filter"
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark py-2 pl-3 pr-10 text-base focus:border-primary focus:outline-none focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-background-dark"
                data-testid="panel-filter-type"
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{t(`transactions.typeOptions.${type}`)}</option>
                ))}
              </select>
            </div>

            {/* Account Number */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-account-number"
              >
                {t('transactions.panel.accountNumber')}
              </label>
              <input
                type="text"
                id="panel-account-number"
                value={filters.accountId}
                onChange={(e) => handleFilterChange('accountId', e.target.value)}
                placeholder={t('transactions.filterBar.accountPlaceholder')}
                className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark"
                data-testid="panel-filter-account"
              />
            </div>

            {/* Amount Range */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="panel-amount-min"
                >
                  {t('transactions.filters.minAmount')}
                </label>
                <input
                  type="number"
                  id="panel-amount-min"
                  value={filters.minAmount}
                  onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark"
                  data-testid="panel-filter-min-amount"
                />
              </div>
              <div className="flex-1">
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="panel-amount-max"
                >
                  {t('transactions.filters.maxAmount')}
                </label>
                <input
                  type="number"
                  id="panel-amount-max"
                  value={filters.maxAmount}
                  onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                  placeholder="1000.00"
                  className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark"
                  data-testid="panel-filter-max-amount"
                />
              </div>
            </div>

            {/* Filter Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-transparent text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-100 dark:hover:bg-gray-800"
                data-testid="panel-clear-button"
              >
                <span className="truncate">{t('common:actions.clear')}</span>
              </button>
              <button
                type="button"
                className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-primary/90"
                data-testid="panel-apply-button"
              >
                <span className="truncate">{t('common:actions.apply')}</span>
              </button>
            </div>
          </form>

          <hr className="border-gray-200 dark:border-gray-800 my-4" />

          {/* Added: Reporting Quick Links */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-text-light dark:text-text-dark">{t('transactions.panel.reporting')}</h2>
            <div className="space-y-3">
              <Link
                to="/reports/trial-balance"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">summarize</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  {t('transactions.panel.trialBalance')}
                </span>
              </Link>
              <Link
                to="/reports/journal"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">
                  account_balance_wallet
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">{t('transactions.panel.journalReport')}</span>
              </Link>
              <Link
                to="/reports/pnl"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">monitoring</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  {t('transactions.panel.profitAndLoss')}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* Added (SOUPFIN-164): confirmation for Delete, batch Delete and Reverse */}
      <ConfirmDialog
        open={pendingConfirmation !== null}
        tone={pendingConfirmation?.kind === 'reverse' ? 'warning' : 'danger'}
        icon={pendingConfirmation?.kind === 'reverse' ? 'undo' : 'delete'}
        title={
          pendingConfirmation?.kind === 'reverse'
            ? t('transactions.confirm.reverseTitle', { id: pendingConfirmation.tx.transactionId })
            : pendingConfirmation?.kind === 'delete'
              ? t('transactions.confirm.deleteTitle', { id: pendingConfirmation.tx.transactionId })
              : t('transactions.confirm.batchDeleteTitle', { count: pendingConfirmation?.count ?? 0 })
        }
        message={
          pendingConfirmation?.kind === 'reverse'
            ? t('transactions.confirm.reverseMessage')
            : pendingConfirmation?.kind === 'delete'
              ? t('transactions.confirm.deleteMessage')
              : t('transactions.confirm.batchDeleteMessage', { count: pendingConfirmation?.count ?? 0 })
        }
        confirmLabel={
          pendingConfirmation?.kind === 'reverse' ? t('common:actions.reverse') : t('common:actions.delete')
        }
        isPending={isConfirming}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        testId="transaction-confirm-dialog"
      />
    </div>
  );
}
