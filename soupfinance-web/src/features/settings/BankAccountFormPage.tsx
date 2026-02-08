/**
 * Bank Account Form Page
 * PURPOSE: Create or edit company bank accounts with ledger account linking
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { accountBankDetailsApi, banksApi } from '../../api/endpoints/settings';
import type { AccountBankDetailsFormData } from '../../types/settings';
// Changed: Import shared currency data from domainData (single source of truth)
import { DEFAULT_CURRENCIES, listCurrencies } from '../../api/endpoints/domainData';
import type { Currency as DomainCurrency } from '../../api/endpoints/domainData';
import { logger } from '../../utils/logger';
import apiClient from '../../api/client';

// Form validation schema
const bankAccountSchema = z.object({
  accountName: z.string().min(1, 'Account name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  bankId: z.string().optional(),
  bankForOtherOption: z.string().optional(),
  bankBranch: z.string().optional(),
  priority: z.enum(['PRIMARY', 'SECONDARY']),
  currency: z.string().optional(),
  ledgerAccountId: z.string().optional(),
  defaultClientDebtAccount: z.boolean().optional(),
  defaultClientEquityAccount: z.boolean().optional(),
});

type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

// Ledger Account interface for dropdown
interface LedgerAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountType?: string;
}

export default function BankAccountFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  // Changed: Load currencies from shared domainData source
  const [currencies, setCurrencies] = useState<DomainCurrency[]>(DEFAULT_CURRENCIES);
  useEffect(() => {
    listCurrencies().then(setCurrencies);
  }, []);

  // Fetch existing bank account data if editing
  const { data: existingAccount, isLoading: isLoadingAccount } = useQuery({
    queryKey: ['bankAccount', id],
    queryFn: () => accountBankDetailsApi.get(id!),
    enabled: isEdit,
  });

  // Fetch available banks
  const { data: banks } = useQuery({
    queryKey: ['banks'],
    queryFn: banksApi.list,
  });

  // Fetch ledger accounts (Bank/Cash type for linking)
  const { data: ledgerAccounts } = useQuery({
    queryKey: ['ledgerAccounts', 'bank'],
    queryFn: async (): Promise<LedgerAccount[]> => {
      // Fetch bank/cash type ledger accounts for linking
      const response = await apiClient.get<LedgerAccount[]>('/ledgerAccount/index.json?max=500');
      // Filter to bank/cash accounts or return all if type not available
      return response.data.filter(
        (acc) =>
          acc.accountNumber?.startsWith('1') || // Assets
          acc.name?.toLowerCase().includes('bank') ||
          acc.name?.toLowerCase().includes('cash')
      );
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      accountName: '',
      accountNumber: '',
      bankId: '',
      bankForOtherOption: '',
      bankBranch: '',
      priority: 'PRIMARY',
      currency: 'GHS',
      ledgerAccountId: '',
      defaultClientDebtAccount: false,
      defaultClientEquityAccount: false,
    },
  });

  const selectedBankId = watch('bankId');
  const isOtherBank = selectedBankId === 'OTHER';

  // Reset form when existing account data loads
  useEffect(() => {
    if (existingAccount) {
      reset({
        accountName: existingAccount.accountName || '',
        accountNumber: existingAccount.accountNumber || '',
        bankId: existingAccount.bank?.id || (existingAccount.bankForOtherOption ? 'OTHER' : ''),
        bankForOtherOption: existingAccount.bankForOtherOption || '',
        bankBranch: existingAccount.bankBranch || '',
        priority: existingAccount.priority || 'PRIMARY',
        currency: existingAccount.currency || 'GHS',
        ledgerAccountId: existingAccount.ledgerAccount?.id || '',
        defaultClientDebtAccount: existingAccount.defaultClientDebtAccount || false,
        defaultClientEquityAccount: existingAccount.defaultClientEquityAccount || false,
      });
    }
  }, [existingAccount, reset]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BankAccountFormValues) => {
      const formData: AccountBankDetailsFormData = {
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankId: data.bankId !== 'OTHER' ? data.bankId : undefined,
        bankForOtherOption: data.bankId === 'OTHER' ? data.bankForOtherOption : undefined,
        bankBranch: data.bankBranch,
        priority: data.priority,
        currency: data.currency,
        ledgerAccountId: data.ledgerAccountId,
        defaultClientDebtAccount: data.defaultClientDebtAccount,
        defaultClientEquityAccount: data.defaultClientEquityAccount,
      };

      if (isEdit && id) {
        logger.info('Updating bank account', { id });
        return accountBankDetailsApi.update(id, formData);
      } else {
        logger.info('Creating new bank account');
        return accountBankDetailsApi.create(formData);
      }
    },
    onSuccess: () => {
      logger.info('Bank account saved successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      navigate('/settings/bank-accounts');
    },
    onError: (error) => {
      logger.error('Failed to save bank account', error);
    },
  });

  const onSubmit = (data: BankAccountFormValues) => {
    saveMutation.mutate(data);
  };

  if (isEdit && isLoadingAccount) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-subtle-text">Loading bank account details...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            {isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
          </h2>
          <p className="text-subtle-text text-sm">
            {isEdit
              ? 'Update bank account details and linked ledger account'
              : 'Add a new company bank account'}
          </p>
        </div>
        <Link
          to="/settings/bank-accounts"
          className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to List
        </Link>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Bank Account Details */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Account Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Account Holder Name <span className="text-danger">*</span>
              </label>
              <input
                {...register('accountName')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Company name as registered with bank"
              />
              {errors.accountName && (
                <p className="text-danger text-xs mt-1">{errors.accountName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Account Number <span className="text-danger">*</span>
              </label>
              <input
                {...register('accountNumber')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Bank account number"
              />
              {errors.accountNumber && (
                <p className="text-danger text-xs mt-1">{errors.accountNumber.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Bank
              </label>
              <select
                {...register('bankId')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                <option value="">Select a bank</option>
                {banks?.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
                <option value="OTHER">Other (specify)</option>
              </select>
            </div>

            {isOtherBank && (
              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Bank Name (Other)
                </label>
                <input
                  {...register('bankForOtherOption')}
                  className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  placeholder="Enter bank name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Branch
              </label>
              <input
                {...register('bankBranch')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Branch name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Priority
              </label>
              <select
                {...register('priority')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Currency
              </label>
              <select
                {...register('currency')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                {currencies.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Account Link */}
        <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
            Ledger Account Link
          </h3>
          <p className="text-subtle-text text-sm mb-4">
            Link this bank account to a ledger account in your Chart of Accounts for automatic
            transaction recording.
          </p>

          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
              Linked Ledger Account
            </label>
            <select
              {...register('ledgerAccountId')}
              className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="">Not linked (select to link)</option>
              {ledgerAccounts?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountNumber} - {account.name}
                </option>
              ))}
            </select>
            <p className="text-subtle-text text-xs mt-1">
              Bank deposits will debit this account; withdrawals will credit it.
            </p>
          </div>
        </div>

        {/* Default Account Settings */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Default Settings
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                {...register('defaultClientDebtAccount')}
                type="checkbox"
                className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
              />
              <div>
                <span className="font-medium text-text-light dark:text-text-dark">
                  Default Client Debt Account
                </span>
                <p className="text-subtle-text text-xs">
                  Use this account for receiving client payments
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                {...register('defaultClientEquityAccount')}
                type="checkbox"
                className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
              />
              <div>
                <span className="font-medium text-text-light dark:text-text-dark">
                  Default Client Equity Account
                </span>
                <p className="text-subtle-text text-xs">
                  Use this account for client equity transactions
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Link
            to="/settings/bank-accounts"
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || saveMutation.isPending}
            className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {(isSubmitting || saveMutation.isPending) && (
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            )}
            {isEdit ? 'Update Account' : 'Add Account'}
          </button>
        </div>

        {/* Error Display */}
        {saveMutation.isError && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
            <p className="text-danger text-sm">
              Failed to save bank account. Please check the form and try again.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
