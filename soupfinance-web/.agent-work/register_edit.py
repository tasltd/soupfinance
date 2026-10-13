import re
p='src/features/accounting/TransactionRegisterPage.tsx'
s=open(p).read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt,(old,s.count(old)); s=s.replace(old,new)
rep(""" * Changed: Now fetches transactions from API via useTransactions hook
 */
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';""",""" * Changed: Now fetches transactions from API via useTransactions hook
 * Changed (SOUPFIN-164): every visible string comes from the `accounting` namespace,
 *   and Delete, batch Delete and Reverse ask through ConfirmDialog instead of
 *   window.confirm.
 */
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';""")
rep("""import { parseApiError, getApiErrorMessage } from '../../api/errors';
import { ApiErrorState, useToast } from '../../components/feedback';""","""import { parseApiError } from '../../api/errors';
import { translateApiError, getTranslatedApiErrorMessage } from '../../i18n/translateApiError';
import { ApiErrorState, ConfirmDialog, useToast } from '../../components/feedback';""")
rep("""// Added: Default filter values""","""// Added (SOUPFIN-164): option values for the status and type filters; labels are translated
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

// Added: Default filter values""")
rep("""  const { showToast } = useToast();
""","""  const { showToast } = useToast();
  const { t } = useTranslation('accounting');

  // Added (SOUPFIN-164): confirmation modal state (replaces window.confirm)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
""")
rep("""      showToast({ variant: 'success', message: `Transaction ${tx.transactionId} posted.` });
    } catch (err) {
      console.error('[TransactionRegister] Failed to post transaction:', err);
      showToast({ variant: 'error', message: getApiErrorMessage(err) });
    }
    setOpenActionDropdown(null);
  }, [queryClient, showToast]);

  // Changed (SOUPFIN-9): Reverse transaction with toast feedback
  const handleReverse = useCallback(async (tx: UnifiedTransaction) => {
    try {""","""      showToast({ variant: 'success', message: t('transactions.toasts.posted', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to post transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err, t) });
    }
    setOpenActionDropdown(null);
  }, [queryClient, showToast, t]);

  // Changed (SOUPFIN-9): Reverse transaction with toast feedback
  // Changed (SOUPFIN-164): runs only after the user confirms in ConfirmDialog
  const performReverse = useCallback(async (tx: UnifiedTransaction) => {
    try {""")
rep("""      showToast({ variant: 'success', message: `Transaction ${tx.transactionId} reversed.` });
    } catch (err) {
      console.error('[TransactionRegister] Failed to reverse transaction:', err);
      showToast({ variant: 'error', message: getApiErrorMessage(err) });
    }
    setOpenActionDropdown(null);
  }, [queryClient, showToast]);

  // Changed (SOUPFIN-9): Delete transaction with toast feedback
  const handleDelete = useCallback(async (tx: UnifiedTransaction) => {
    if (!window.confirm(`Are you sure you want to delete transaction ${tx.transactionId}?`)) {
      setOpenActionDropdown(null);
      return;
    }

    try {""","""      showToast({ variant: 'success', message: t('transactions.toasts.reversed', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to reverse transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err, t) });
    }
  }, [queryClient, showToast, t]);

  // Changed (SOUPFIN-9): Delete transaction with toast feedback
  // Changed (SOUPFIN-164): runs only after the user confirms in ConfirmDialog
  const performDelete = useCallback(async (tx: UnifiedTransaction) => {
    try {""")
rep("""      showToast({ variant: 'success', message: `Transaction ${tx.transactionId} deleted.` });
    } catch (err) {
      console.error('[TransactionRegister] Failed to delete transaction:', err);
      showToast({ variant: 'error', message: getApiErrorMessage(err) });
    }
    setOpenActionDropdown(null);
  }, [queryClient, showToast]);""","""      showToast({ variant: 'success', message: t('transactions.toasts.deleted', { id: tx.transactionId }) });
    } catch (err) {
      console.error('[TransactionRegister] Failed to delete transaction:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err, t) });
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
  }, []);""")
rep("""      showToast({ variant: 'success', message: `${selectedTxs.length} transaction(s) posted.` });
    } catch (err) {
      console.error('[TransactionRegister] Batch post failed:', err);
      showToast({ variant: 'error', message: getApiErrorMessage(err) });
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient, showToast]);

  // Changed (SOUPFIN-9): Batch delete with summary toast
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || !transactions) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transaction(s)?`)) {
      return;
    }

    const selectedTxs""","""      showToast({ variant: 'success', message: t('transactions.toasts.batchPosted', { count: selectedTxs.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Batch post failed:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err, t) });
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

    const selectedTxs""")
rep("""      showToast({ variant: 'success', message: `${selectedTxs.length} transaction(s) deleted.` });
    } catch (err) {
      console.error('[TransactionRegister] Batch delete failed:', err);
      showToast({ variant: 'error', message: getApiErrorMessage(err) });
    }
    setSelectedIds(new Set());
  }, [selectedIds, transactions, queryClient, showToast]);""","""      showToast({ variant: 'success', message: t('transactions.toasts.batchDeleted', { count: selectedTxs.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Batch delete failed:', err);
      showToast({ variant: 'error', message: getTranslatedApiErrorMessage(err, t) });
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

  const handleCancelConfirm = useCallback(() => setPendingConfirmation(null), []);""")
rep("""      const parsed = parseApiError(error);
      showToast({
        variant: 'error',
        message: `Cannot export — ${parsed.message}`,""","""      const parsed = translateApiError(parseApiError(error), t);
      showToast({
        variant: 'error',
        message: t('transactions.toasts.exportBlocked', { reason: parsed.message }),""")
rep("""      showToast({ variant: 'warning', message: 'Nothing to export — the current view is empty.' });""","""      showToast({ variant: 'warning', message: t('transactions.toasts.exportEmpty') });""")
rep("""      showToast({ variant: 'success', message: `Exported ${rows.length} transaction(s) to CSV.` });
    } catch (err) {
      console.error('[TransactionRegister] Export failed:', err);
      showToast({ variant: 'error', message: 'Export failed. Please try again.' });
    }
  }, [filteredTransactions, isError, error, showToast]);""","""      showToast({ variant: 'success', message: t('transactions.toasts.exported', { count: rows.length }) });
    } catch (err) {
      console.error('[TransactionRegister] Export failed:', err);
      showToast({ variant: 'error', message: t('transactions.toasts.exportFailed') });
    }
  }, [filteredTransactions, isError, error, showToast, t]);""")
rep("""                Transaction Register
              </h1>
              <p className="text-subtle-text dark:text-subtle-text-dark text-base mt-1">
                View and manage all accounting transactions
              </p>""","""                {t('transactions.title')}
              </h1>
              <p className="text-subtle-text dark:text-subtle-text-dark text-base mt-1">
                {t('transactions.subtitle')}
              </p>""")
rep("""                <span className="truncate">New Journal Entry</span>""","""                <span className="truncate">{t('transactions.newJournalEntry')}</span>""")
rep("""                <span className="truncate">New Payment</span>""","""                <span className="truncate">{t('transactions.newPayment')}</span>""")
rep("""                <span className="truncate">New Receipt</span>""","""                <span className="truncate">{t('transactions.newReceipt')}</span>""")
rep("""                <span className="truncate">Export</span>""","""                <span className="truncate">{t('common:actions.export')}</span>""")
rep("""                  aria-label="Search transactions by ID, description, or amount\"""","""                  aria-label={t('transactions.searchAria')}""")
rep("""                  placeholder="Search by Transaction ID, Description, or Amount...\"""","""                  placeholder={t('transactions.searchPlaceholder')}""")
rep("""              label="From:"
              ariaLabel="Filter transactions from date\"""","""              label={t('transactions.filterBar.from')}
              ariaLabel={t('transactions.filterBar.fromAria')}
              emptyHint={t('common:dateFilter.emptyHint')}""")
rep("""              label="To:"
              ariaLabel="Filter transactions to date\"""","""              label={t('transactions.filterBar.to')}
              ariaLabel={t('transactions.filterBar.toAria')}
              emptyHint={t('common:dateFilter.emptyHint')}""")
rep("""htmlFor="register-status-filter">Status:</label>""","""htmlFor="register-status-filter">{t('transactions.filterBar.status')}</label>""")
rep("""                aria-label="Filter transactions by status\"""","""                aria-label={t('transactions.filterBar.statusAria')}""")
rep("""                <option value="ALL">All</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>""","""                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{t(`transactions.statusOptions.${status}`)}</option>
                ))}""",2)
rep("""htmlFor="register-type-filter">Type:</label>""","""htmlFor="register-type-filter">{t('transactions.filterBar.type')}</label>""")
rep("""                aria-label="Filter transactions by type\"""","""                aria-label={t('transactions.filterBar.typeAria')}""")
rep("""                <option value="ALL">All Types</option>
                <option value="JOURNAL_ENTRY">Journal Entry</option>
                <option value="PAYMENT">Payment</option>
                <option value="RECEIPT">Receipt</option>""","""                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{t(`transactions.typeOptions.${type}`)}</option>
                ))}""",2)
rep("""htmlFor="register-account-filter">Account:</label>""","""htmlFor="register-account-filter">{t('transactions.filterBar.account')}</label>""")
rep("""                aria-label="Filter transactions by account code\"""","""                aria-label={t('transactions.filterBar.accountAria')}""")
rep("""placeholder="e.g., 1010\"""","""placeholder={t('transactions.filterBar.accountPlaceholder')}""",2)
rep("""              <span className="material-symbols-outlined text-lg">filter_list_off</span>
              Clear""","""              <span className="material-symbols-outlined text-lg">filter_list_off</span>
              {t('common:actions.clear')}""")
rep("""                {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} selected""","""                {t('transactions.selected', { count: selectedIds.size })}""")
rep("""                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  Post Selected""","""                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  {t('transactions.postSelected')}""")
rep("""                  <span className="material-symbols-outlined text-lg">delete</span>
                  Delete Selected""","""                  <span className="material-symbols-outlined text-lg">delete</span>
                  {t('transactions.deleteSelected')}""")
rep("""                  data-testid="clear-selection-button"
                >
                  Cancel""","""                  data-testid="clear-selection-button"
                >
                  {t('common:actions.cancel')}""")
rep("""text-sm">Loading transactions...</p>""","""text-sm">{t('transactions.loading')}</p>""")
for key, label in [('date','Date'),('transactionId','Transaction ID'),('description','Description'),('accountNumber','Account #'),('accountName','Account Name'),('debit','Debit'),('credit','Credit'),('status','Status'),('actions','Actions')]:
    rep(f"""leading-normal">
                      {label}
                    </th>""", f"""leading-normal">
                      {{t('transactions.columns.{key}')}}
                    </th>""")
rep("""                            No transactions found
                          </h3>""","""                            {t('transactions.emptyTitle')}
                          </h3>""")
rep("""                              ? 'Try adjusting your search or filter criteria'
                              : 'Create your first transaction to get started'}""","""                              ? t('transactions.emptyFiltered')
                              : t('transactions.emptyBody')}""")
rep("""                              <span className="material-symbols-outlined text-lg">add</span>
                              Create Journal Entry""","""                              <span className="material-symbols-outlined text-lg">add</span>
                              {t('transactions.createJournalEntry')}""")
rep("""                            {tx.status}
                          </span>""","""                            {/* Changed (SOUPFIN-164): translated badge; an unknown status shows as sent */}
                            {isBadgeStatus(tx.status) ? t(`transactions.statusBadges.${tx.status}`) : tx.status}
                          </span>""")
rep("""                            data-testid={`transaction-actions-${tx.id}`}
                          >""","""                            data-testid={`transaction-actions-${tx.id}`}
                            aria-label={t('transactions.rowActions', { id: tx.transactionId })}
                          >""")
for icon, word, key in [('visibility','View','common:actions.view'),('edit','Edit','common:actions.edit'),('check_circle','Post','common:actions.post'),('undo','Reverse','common:actions.reverse'),('delete','Delete','common:actions.delete')]:
    pat = re.compile(r'(<span className="material-symbols-outlined text-lg">' + icon + r'</span>\n\s*)' + word + r'\n')
    s, n = pat.subn(lambda m: m.group(1) + "{t('" + key + "')}\n", s)
    assert n == 1, (icon, n)
open(p,'w').write(s)
print('ok')
