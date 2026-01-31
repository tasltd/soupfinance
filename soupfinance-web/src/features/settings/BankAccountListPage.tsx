/**
 * Bank Account List Page
 * PURPOSE: Display and manage company bank accounts linked to ledger accounts
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountBankDetailsApi } from '../../api/endpoints/settings';
import type { AccountBankDetails } from '../../types/settings';
import { logger } from '../../utils/logger';

interface DeleteState {
  isOpen: boolean;
  accountId: string | null;
  accountName: string | null;
}

export default function BankAccountListPage() {
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    accountId: null,
    accountName: null,
  });

  const { data: bankAccounts, isLoading, error } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => {
      logger.info('Fetching bank accounts');
      return accountBankDetailsApi.list({ max: 100, sort: 'accountName', order: 'asc' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      logger.info('Deleting bank account', { id });
      return accountBankDetailsApi.delete(id);
    },
    onSuccess: () => {
      logger.info('Bank account deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setDeleteState({ isOpen: false, accountId: null, accountName: null });
    },
    onError: (error) => {
      logger.error('Failed to delete bank account', error);
    },
  });

  const handleDeleteClick = (accountId: string, accountName: string) => {
    setDeleteState({ isOpen: true, accountId, accountName });
  };

  const handleConfirmDelete = () => {
    if (deleteState.accountId) {
      deleteMutation.mutate(deleteState.accountId);
    }
  };

  const handleCancelDelete = () => {
    setDeleteState({ isOpen: false, accountId: null, accountName: null });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="bank-account-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            Bank Accounts
          </h2>
          <p className="text-subtle-text text-sm">
            Manage company bank accounts and their ledger account links
          </p>
        </div>
        <Link
          to="/settings/bank-accounts/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add Bank Account
        </Link>
      </div>

      {/* Bank Accounts Grid */}
      {isLoading ? (
        <div className="p-8 text-center text-subtle-text">Loading bank accounts...</div>
      ) : error ? (
        <div className="p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
            Failed to load bank accounts
          </h3>
          <p className="text-subtle-text mb-4">There was an error loading your bank accounts.</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['bankAccounts'] })}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Retry
          </button>
        </div>
      ) : bankAccounts?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bankAccounts.map((account) => (
            <BankAccountCard
              key={account.id}
              account={account}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
            account_balance
          </span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
            No bank accounts yet
          </h3>
          <p className="text-subtle-text mb-4">
            Add your first bank account to manage finances.
          </p>
          <Link
            to="/settings/bank-accounts/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Add Bank Account
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteState.isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Delete Bank Account</p>
              <button
                onClick={handleCancelDelete}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-2xl text-subtle-text">close</span>
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 size-12 rounded-full bg-danger/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-danger">warning</span>
                </div>
                <div>
                  <p className="text-text-light dark:text-text-dark">
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{deleteState.accountName}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This will remove the bank account from your records. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                onClick={handleCancelDelete}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bank Account Card Component
function BankAccountCard({
  account,
  onDelete,
}: {
  account: AccountBankDetails;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 size-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl text-primary">account_balance</span>
          </div>
          <div>
            <h3 className="font-bold text-text-light dark:text-text-dark">
              {account.accountName}
            </h3>
            <p className="text-subtle-text text-sm">{account.accountNumber}</p>
          </div>
        </div>
        {account.priority === 'PRIMARY' && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
            Primary
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-subtle-text">Bank:</span>
          <span className="text-text-light dark:text-text-dark">
            {account.bank?.name || account.bankForOtherOption || '-'}
          </span>
        </div>
        {account.bankBranch && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-subtle-text">Branch:</span>
            <span className="text-text-light dark:text-text-dark">{account.bankBranch}</span>
          </div>
        )}
        {account.ledgerAccount && (
          <div className="flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-primary text-sm">link</span>
            <span className="text-subtle-text">Linked to:</span>
            <span className="text-primary font-medium">
              {account.ledgerAccount.accountNumber} - {account.ledgerAccount.name}
            </span>
          </div>
        )}
        {account.currency && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-subtle-text">Currency:</span>
            <span className="text-text-light dark:text-text-dark">{account.currency}</span>
          </div>
        )}
      </div>

      {/* Feature Badges */}
      {(account.defaultClientDebtAccount || account.defaultClientEquityAccount) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {account.defaultClientDebtAccount && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              Client Debt Default
            </span>
          )}
          {account.defaultClientEquityAccount && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              Client Equity Default
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark flex justify-end gap-2">
        <Link
          to={`/settings/bank-accounts/${account.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">edit</span>
          Edit
        </Link>
        <button
          onClick={() => onDelete(account.id, account.accountName)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">delete</span>
          Delete
        </button>
      </div>
    </div>
  );
}
