/**
 * Ledger Account Form Page (Create/Edit)
 * PURPOSE: Add a ledger account to the chart of accounts, or edit one
 *
 * Added (SOUPFIN-149): routes /ledger/accounts/new and /ledger/accounts/:id/edit.
 * Fields mirror soupbroker.finance.LedgerAccount: number (shown as "Code"),
 * name, ledgerAccountCategory, parentAccount, currency, cashFlow, description.
 *
 * Save uses the CSRF flow in createLedgerAccount (POST needs a token from
 * create.json); update is a PUT and needs none.
 *
 * System accounts and accounts with editable=false are shown read-only, even
 * when the edit URL is opened directly.
 */
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLedgerAccount,
  createLedgerAccount,
  updateLedgerAccount,
  listLedgerAccounts,
  listLedgerAccountCategories,
  canEditLedgerAccount,
} from '../../api/endpoints/ledger';
import { DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
import { getApiErrorMessage } from '../../api/errors';
import { Input, Select, Textarea, Checkbox } from '../../components/forms';
import { ApiErrorState } from '../../components/feedback';
import { useCurrencyConfig } from '../../stores';
import type { LedgerGroup } from '../../types';
import { ledgerAccountSchema, toLedgerAccountPayload, type LedgerAccountFormData } from './ledgerAccountForm';
import { HelpLink } from '../../components/help';

const GROUP_LABELS: Record<LedgerGroup, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  INCOME: 'Income',
  REVENUE: 'Revenue',
  EXPENSE: 'Expense',
};

export function LedgerAccountFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const tenantCurrency = useCurrencyConfig().code;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LedgerAccountFormData>({
    resolver: zodResolver(ledgerAccountSchema),
    defaultValues: {
      number: '',
      name: '',
      ledgerAccountCategoryId: '',
      parentAccountId: '',
      currency: tenantCurrency || 'GHS',
      cashFlow: false,
      description: '',
    },
  });

  const { data: account, isLoading: isLoadingAccount, error: accountError, refetch } = useQuery({
    queryKey: ['ledger-account', id],
    queryFn: () => getLedgerAccount(id!),
    enabled: isEdit,
  });

  const { data: categories = [], isLoading: isLoadingCategories, error: categoriesError } = useQuery({
    queryKey: ['ledger-account-categories'],
    queryFn: listLedgerAccountCategories,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-accounts', 'all'],
    queryFn: () => listLedgerAccounts({ max: 1000 }),
  });

  useEffect(() => {
    if (account) {
      reset({
        number: account.number || '',
        name: account.name || '',
        ledgerAccountCategoryId: account.ledgerAccountCategory?.id || '',
        parentAccountId: account.parentAccount?.id || '',
        currency: account.currency || tenantCurrency || 'GHS',
        cashFlow: account.cashFlow === true,
        description: account.description || '',
      });
    }
  }, [account, reset, tenantCurrency]);

  const readOnly = isEdit && !!account && !canEditLedgerAccount(account);

  const categoryOptions = useMemo(
    () =>
      [...categories]
        .sort((a, b) => (a.ledgerGroup || '').localeCompare(b.ledgerGroup || '') || a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.id,
          label: c.ledgerGroup ? `${c.name} (${GROUP_LABELS[c.ledgerGroup] ?? c.ledgerGroup})` : c.name,
        })),
    [categories]
  );

  // A parent must sit in the same group as the account; never the account itself.
  const selectedCategoryId = useWatch({ control, name: 'ledgerAccountCategoryId' });
  const selectedGroup = categories.find((c) => c.id === selectedCategoryId)?.ledgerGroup;
  const parentOptions = useMemo(
    () => [
      // Select's placeholder option is disabled, so "no parent" needs a real option to clear it.
      { value: '', label: 'None (top level)' },
      ...accounts
        .filter((a) => a.id !== id && (!selectedGroup || a.ledgerGroup === selectedGroup))
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
        .map((a) => ({ value: a.id, label: a.code ? `${a.code} - ${a.name}` : a.name })),
    ],
    [accounts, id, selectedGroup]
  );

  const accountCurrency = account?.currency;
  const currencyOptions = useMemo(() => {
    const options = DEFAULT_CURRENCIES.map((c) => ({ value: c.code, label: c.label }));
    // Keep an unlisted currency the account already has.
    if (accountCurrency && !options.some((o) => o.value === accountCurrency)) {
      options.unshift({ value: accountCurrency, label: accountCurrency });
    }
    return options;
  }, [accountCurrency]);

  const createMutation = useMutation({
    mutationFn: (data: LedgerAccountFormData) => createLedgerAccount(toLedgerAccountPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
      navigate('/ledger/accounts');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: LedgerAccountFormData) => updateLedgerAccount(id!, toLedgerAccountPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-account', id] });
      navigate('/ledger/accounts');
    },
  });

  const onSubmit = (data: LedgerAccountFormData) => {
    if (readOnly) return;
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  if (isEdit && isLoadingAccount) {
    return (
      <div className="flex flex-col gap-6" data-testid="ledger-account-form-page">
        <div className="flex items-center justify-center p-12 text-subtle-text" data-testid="ledger-account-form-loading">
          Loading account...
        </div>
      </div>
    );
  }

  if (isEdit && accountError) {
    return (
      <div className="flex flex-col gap-6" data-testid="ledger-account-form-page">
        <ApiErrorState error={accountError} onRetry={() => refetch()} testId="ledger-account-form-load-error" />
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error || updateMutation.error;
  const saveDisabled = readOnly || isSaving || isSubmitting;

  return (
    <div className="flex flex-col gap-6" data-testid="ledger-account-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="ledger-account-form-heading"
          >
            {isEdit ? 'Edit Account' : 'New Account'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update this ledger account' : 'Add an account to your chart of accounts'}
          </p>
          <HelpLink section="chart-of-accounts" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <Link
            to="/ledger/accounts"
            className="h-10 px-4 inline-flex items-center rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="ledger-account-form-cancel"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={saveDisabled}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="ledger-account-form-save"
          >
            {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>

      {readOnly && (
        <div
          className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-warning flex items-start gap-3"
          data-testid="ledger-account-form-readonly"
        >
          <span className="material-symbols-outlined text-xl">lock</span>
          <div>
            <p className="font-medium">This account can't be edited</p>
            <p className="text-sm opacity-80">
              {account?.systemAccount
                ? 'It is a system account that the ledger relies on.'
                : 'Editing is turned off for this account.'}
            </p>
          </div>
        </div>
      )}

      {mutationError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-3"
          data-testid="ledger-account-form-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          <div>
            <p className="font-medium">Couldn't save the account</p>
            <p className="text-sm opacity-80">{getApiErrorMessage(mutationError)}</p>
          </div>
        </div>
      )}

      {categoriesError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-3"
          data-testid="ledger-account-form-categories-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          <div>
            <p className="font-medium">Couldn't load account categories</p>
            <p className="text-sm opacity-80">{getApiErrorMessage(categoriesError)}</p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark"
        data-testid="ledger-account-form"
      >
        <fieldset disabled={readOnly} className="contents">
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">Account Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Code"
                placeholder="e.g. 1010"
                helperText="Optional. Must be unique."
                error={errors.number?.message}
                {...register('number')}
                data-testid="ledger-account-form-code"
              />
              <Input
                label="Account Name"
                placeholder="e.g. Petty Cash"
                required
                error={errors.name?.message}
                {...register('name')}
                data-testid="ledger-account-form-name"
              />
              <Select
                label="Category"
                required
                placeholder={isLoadingCategories ? 'Loading categories...' : 'Choose a category'}
                options={categoryOptions}
                error={errors.ledgerAccountCategoryId?.message}
                helperText="Sets whether this is an asset, liability, equity, income or expense account."
                {...register('ledgerAccountCategoryId')}
                data-testid="ledger-account-form-category"
              />
              <Select
                label="Parent Account"
                options={parentOptions}
                error={errors.parentAccountId?.message}
                helperText="Optional. The balance rolls up into the parent."
                {...register('parentAccountId')}
                data-testid="ledger-account-form-parent"
              />
              <Select
                label="Currency"
                required
                options={currencyOptions}
                error={errors.currency?.message}
                {...register('currency')}
                data-testid="ledger-account-form-currency"
              />
              <div className="flex items-center md:pt-7">
                <Checkbox
                  label="Show in the cash flow statement"
                  {...register('cashFlow')}
                  data-testid="ledger-account-form-cash-flow"
                />
              </div>
            </div>
          </div>
          <div className="p-6">
            <Textarea
              label="Description"
              placeholder="What is this account used for?"
              rows={3}
              error={errors.description?.message}
              {...register('description')}
              data-testid="ledger-account-form-description"
            />
          </div>
        </fieldset>
      </form>
    </div>
  );
}
