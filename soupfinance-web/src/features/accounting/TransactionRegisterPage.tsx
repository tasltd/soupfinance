/**
 * Transaction Register Page
 * Unified list view of all accounting transactions (journal entries, payment vouchers, receipt vouchers)
 * Reference: soupfinance-designs/general-ledger-entries/, design-system.md
 *
 * Changed: Now fetches transactions from API via useTransactions hook
 */
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      navigate(`/accounting/voucher/${tx.sourceId}`);
    }
    setOpenActionDropdown(null);
  }, [navigate]);

  const handleEdit = useCallback((tx: UnifiedTransaction) => {
    if (tx.type === 'JOURNAL_ENTRY') {
      navigate(`/accounting/journal-entry/${tx.sourceId}/edit`);
    } else {
      navigate(`/accounting/voucher/${tx.sourceId}/edit`);
    }
    setOpenActionDropdown(null);
  }, [navigate]);

  // Changed: Post transaction - now calls API based on transaction type
  const handlePost = useCallback(async (tx: UnifiedTransaction) => {
    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await postTransactionGroup(tx.sourceId);
      } else {
        await postVoucher(tx.sourceId);
      }
      // Added: Invalidate query to refresh data
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      console.error('[TransactionRegister] Failed to post transaction:', err);
      // TODO: Show error toast notification
    }
    setOpenActionDropdown(null);
  }, [queryClient]);

  // Changed: Reverse transaction - now calls API based on transaction type
  const handleReverse = useCallback(async (tx: UnifiedTransaction) => {
    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await reverseTransactionGroup(tx.sourceId);
      } else {
        await cancelVoucher(tx.sourceId);
      }
      // Added: Invalidate query to refresh data
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      console.error('[TransactionRegister] Failed to reverse transaction:', err);
      // TODO: Show error toast notification
    }
    setOpenActionDropdown(null);
  }, [queryClient]);

  // Changed: Delete transaction - now calls API based on transaction type
  const handleDelete = useCallback(async (tx: UnifiedTransaction) => {
    // Added: Confirm before deleting
    if (!window.confirm(`Are you sure you want to delete transaction ${tx.transactionId}?`)) {
      setOpenActionDropdown(null);
      return;
    }

    try {
      if (tx.type === 'JOURNAL_ENTRY') {
        await deleteTransactionGroup(tx.sourceId);
      } else {
        await deleteVoucher(tx.sourceId);
      }
      // Added: Invalidate query to refresh data
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      console.error('[TransactionRegister] Failed to delete transaction:', err);
      // TODO: Show error toast notification
    }
    setOpenActionDropdown(null);
  }, [queryClient]);

  // Changed: Batch post - now calls API for each selected transaction
  const handleBatchPost = useCallback(async () => {
    if (selectedIds.size === 0 || !transactions) return;

    const selectedTxs = transactions.filter(tx => selectedIds.has(tx.id));

    try {
      // Added: Post all selected transactions
      await Promise.all(
        selectedTxs.map(tx => {
          if (tx.type === 'JOURNAL_ENTRY') {
            return postTransactionGroup(tx.sourceId);
          } else {
            return postVoucher(tx.sourceId);
          }
        })
      );
      // Added: Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      console.error('[TransactionRegister] Batch post failed:', err);
      // TODO: Show error toast
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient]);

  // Changed: Batch delete - now calls API for each selected transaction
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || !transactions) return;

    // Added: Confirm before batch delete
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transaction(s)?`)) {
      return;
    }

    const selectedTxs = transactions.filter(tx => selectedIds.has(tx.id));

    try {
      // Added: Delete all selected transactions
      await Promise.all(
        selectedTxs.map(tx => {
          if (tx.type === 'JOURNAL_ENTRY') {
            return deleteTransactionGroup(tx.sourceId);
          } else {
            return deleteVoucher(tx.sourceId);
          }
        })
      );
      // Added: Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      console.error('[TransactionRegister] Batch delete failed:', err);
      // TODO: Show error toast
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient]);

  // Added: Export handler
  const handleExport = useCallback(() => {
    console.log('Exporting transactions...');
  }, []);

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
                Transaction Register
              </h1>
              <p className="text-subtle-text dark:text-subtle-text-dark text-base mt-1">
                View and manage all accounting transactions
              </p>
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
                <span className="truncate">New Journal Entry</span>
              </button>
              {/* Added: New Payment button */}
              <button
                type="button"
                onClick={handleNewPayment}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-background-light dark:bg-surface-dark text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-200 dark:hover:bg-gray-700"
                data-testid="new-payment-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">payments</span>
                <span className="truncate">New Payment</span>
              </button>
              {/* Added: New Receipt button */}
              <button
                type="button"
                onClick={handleNewReceipt}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-background-light dark:bg-surface-dark text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-200 dark:hover:bg-gray-700"
                data-testid="new-receipt-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">receipt</span>
                <span className="truncate">New Receipt</span>
              </button>
              {/* Added: Export button */}
              <button
                type="button"
                onClick={handleExport}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-transparent text-text-light dark:text-text-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-100 dark:hover:bg-gray-800 border border-border-light dark:border-border-dark"
                data-testid="export-button"
              >
                <span className="material-symbols-outlined text-lg mr-2">download</span>
                <span className="truncate">Export</span>
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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-text-light dark:text-text-dark focus:outline-0 focus:ring-1 focus:ring-primary border-none bg-surface-light dark:bg-surface-dark h-full placeholder:text-subtle-text dark:placeholder:text-subtle-text-dark px-4 pl-2 text-base font-normal leading-normal border border-l-0 border-border-light dark:border-border-dark"
                  placeholder="Search by Transaction ID, Description, or Amount..."
                  data-testid="transaction-search-input"
                />
              </div>
            </label>
          </div>

          {/* Added: Inline Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-surface-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark">From:</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="form-input h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-start-date"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark">To:</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="form-input h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-end-date"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark">Status:</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="form-select h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-status"
              >
                <option value="ALL">All</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark">Type:</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="form-select h-9 px-3 rounded-lg border border-border-light dark:border-border-dark bg-transparent dark:bg-surface-dark text-sm dark:text-text-dark"
                data-testid="filter-type"
              >
                <option value="ALL">All Types</option>
                <option value="JOURNAL_ENTRY">Journal Entry</option>
                <option value="PAYMENT">Payment</option>
                <option value="RECEIPT">Receipt</option>
              </select>
            </div>

            {/* Account Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-light dark:text-subtle-text-dark">Account:</label>
              <input
                type="text"
                value={filters.accountId}
                onChange={(e) => handleFilterChange('accountId', e.target.value)}
                placeholder="e.g., 1010"
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
              Clear
            </button>
          </div>

          {/* Added: Batch Action Bar (shown when items selected) */}
          {selectedIds.size > 0 && (
            <div
              className="flex items-center justify-between p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/30"
              data-testid="batch-action-bar"
            >
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBatchPost}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90"
                  data-testid="batch-post-button"
                >
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  Post Selected
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600"
                  data-testid="batch-delete-button"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                  Delete Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-transparent text-text-light dark:text-text-dark text-sm font-bold hover:bg-black/10"
                  data-testid="clear-selection-button"
                >
                  Cancel
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
                <p className="text-subtle-text dark:text-subtle-text-dark text-sm">Loading transactions...</p>
              </div>
            </div>
          )}

          {/* Added: Error State */}
          {isError && !isLoading && (
            <div className="w-full" data-testid="transaction-error">
              <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                <span className="material-symbols-outlined text-5xl text-red-500 mb-3">
                  error_outline
                </span>
                <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-1">
                  Failed to load transactions
                </h3>
                <p className="text-red-600 dark:text-red-400 text-sm mb-4">
                  {error instanceof Error ? error.message : 'An unexpected error occurred'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
                  data-testid="retry-button"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                  Retry
                </button>
              </div>
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
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Transaction ID
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Account #
                    </th>
                    <th className="px-4 py-3 text-left text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Account Name
                    </th>
                    <th className="px-4 py-3 text-right text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Debit
                    </th>
                    <th className="px-4 py-3 text-right text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Credit
                    </th>
                    <th className="px-4 py-3 text-center text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-text-light dark:text-subtle-text-dark text-sm font-medium leading-normal">
                      Actions
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
                            No transactions found
                          </h3>
                          <p className="text-subtle-text dark:text-subtle-text-dark text-sm mb-4">
                            {searchQuery || filters.status !== 'ALL' || filters.type !== 'ALL'
                              ? 'Try adjusting your search or filter criteria'
                              : 'Create your first transaction to get started'}
                          </p>
                          {!searchQuery && filters.status === 'ALL' && filters.type === 'ALL' && (
                            <button
                              type="button"
                              onClick={handleNewJournalEntry}
                              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
                              data-testid="empty-state-cta"
                            >
                              <span className="material-symbols-outlined text-lg">add</span>
                              Create Journal Entry
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
                            {tx.status}
                          </span>
                        </td>
                        {/* Added: Actions dropdown column */}
                        <td className="px-4 py-2 text-center relative">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionDropdown(tx.id, e)}
                            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                            data-testid={`transaction-actions-${tx.id}`}
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
                                    View
                                  </button>
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">edit</span>
                                      Edit
                                    </button>
                                  )}
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handlePost(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">check_circle</span>
                                      Post
                                    </button>
                                  )}
                                  {tx.status === 'POSTED' && (
                                    <button
                                      type="button"
                                      onClick={() => handleReverse(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">undo</span>
                                      Reverse
                                    </button>
                                  )}
                                  {(tx.status === 'DRAFT' || tx.status === 'PENDING') && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(tx)}
                                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <span className="material-symbols-outlined text-lg">delete</span>
                                      Delete
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
              aria-label="Pagination"
              className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 sm:px-0 pt-4"
              data-testid="pagination"
            >
              <div className="hidden sm:block">
                <p className="text-sm text-gray-700 dark:text-gray-400">
                  Showing{' '}
                  <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, filteredTransactions.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{filteredTransactions.length}</span>{' '}
                  results
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
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="pagination-next"
                >
                  Next
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
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Advanced Filters</h2>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {/* Date Range */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-date-range-start"
              >
                Date Range
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  type="date"
                  id="panel-date-range-start"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="block w-full rounded-md border-border-light dark:border-border-dark shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-surface-dark"
                  data-testid="panel-filter-start-date"
                />
                <input
                  type="date"
                  id="panel-date-range-end"
                  value={filters.endDate}
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
                Status
              </label>
              <select
                id="panel-status-filter"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark py-2 pl-3 pr-10 text-base focus:border-primary focus:outline-none focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-background-dark"
                data-testid="panel-filter-status"
              >
                <option value="ALL">All</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-type-filter"
              >
                Transaction Type
              </label>
              <select
                id="panel-type-filter"
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="mt-1 block w-full rounded-md border-border-light dark:border-border-dark py-2 pl-3 pr-10 text-base focus:border-primary focus:outline-none focus:ring-primary sm:text-sm bg-transparent dark:text-text-dark dark:bg-background-dark"
                data-testid="panel-filter-type"
              >
                <option value="ALL">All Types</option>
                <option value="JOURNAL_ENTRY">Journal Entry</option>
                <option value="PAYMENT">Payment</option>
                <option value="RECEIPT">Receipt</option>
              </select>
            </div>

            {/* Account Number */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                htmlFor="panel-account-number"
              >
                Account Number
              </label>
              <input
                type="text"
                id="panel-account-number"
                value={filters.accountId}
                onChange={(e) => handleFilterChange('accountId', e.target.value)}
                placeholder="e.g., 1010"
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
                  Min Amount
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
                  Max Amount
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
                <span className="truncate">Clear</span>
              </button>
              <button
                type="button"
                className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-primary/90"
                data-testid="panel-apply-button"
              >
                <span className="truncate">Apply</span>
              </button>
            </div>
          </form>

          <hr className="border-gray-200 dark:border-gray-800 my-4" />

          {/* Added: Reporting Quick Links */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Reporting</h2>
            <div className="space-y-3">
              <Link
                to="/reports/trial-balance"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">summarize</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Generate Trial Balance
                </span>
              </Link>
              <Link
                to="/reports/journal"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">
                  account_balance_wallet
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">Journal Report</span>
              </Link>
              <Link
                to="/reports/pnl"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
              >
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">monitoring</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Profit &amp; Loss Statement
                </span>
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
