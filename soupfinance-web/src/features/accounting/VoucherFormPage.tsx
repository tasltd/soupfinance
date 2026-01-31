/**
 * Voucher Form Page
 * Form for creating payment vouchers (money out) and receipt vouchers (money in)
 * Reference: soupfinance-designs/payment-entry-form/, design-system.md
 *
 * Voucher Types:
 * - PAYMENT: Money paid out (Debit: Expense account, Credit: Bank/Cash account)
 * - RECEIPT: Money received (Debit: Bank/Cash account, Credit: Income account)
 * - DEPOSIT: Same as RECEIPT but different label
 *
 * Changed: Now fetches ledger accounts from API via useLedgerAccounts hook
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { format } from 'date-fns';
import { Input } from '../../components/forms/Input';
import { Select, type SelectOption } from '../../components/forms/Select';
import { DatePicker } from '../../components/forms/DatePicker';
import { Textarea } from '../../components/forms/Textarea';
import { Radio, type RadioOption } from '../../components/forms/Radio';
import { createVoucher } from '../../api/endpoints/ledger';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import type { CreateVoucherRequest, VoucherType, VoucherTo } from '../../types';

// Added: Zod schema for voucher form validation
// Note: Zod 4 uses 'message' instead of 'required_error' for enum validation
const voucherFormSchema = z.object({
  voucherType: z.enum(['PAYMENT', 'RECEIPT', 'DEPOSIT'], {
    message: 'Voucher type is required',
  }),
  voucherDate: z.string().min(1, 'Date is required'),
  reference: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  voucherTo: z.enum(['CLIENT', 'VENDOR', 'STAFF', 'OTHER'], {
    message: 'Beneficiary/Payer type is required',
  }),
  beneficiaryName: z.string().optional(),
  clientId: z.string().optional(),
  vendorId: z.string().optional(),
  staffId: z.string().optional(),
  cashAccountId: z.string().min(1, 'Bank/Cash account is required'),
  expenseAccountId: z.string().optional(),
  incomeAccountId: z.string().optional(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
}).refine(
  // Added: Validate expense account required for payment vouchers
  (data) => {
    if (data.voucherType === 'PAYMENT') {
      return data.expenseAccountId && data.expenseAccountId.length > 0;
    }
    return true;
  },
  { message: 'Expense account is required for payment vouchers', path: ['expenseAccountId'] }
).refine(
  // Added: Validate income account required for receipt/deposit vouchers
  (data) => {
    if (data.voucherType === 'RECEIPT' || data.voucherType === 'DEPOSIT') {
      return data.incomeAccountId && data.incomeAccountId.length > 0;
    }
    return true;
  },
  { message: 'Income account is required for receipt vouchers', path: ['incomeAccountId'] }
);

// Added: Type inference from schema
type VoucherFormData = z.infer<typeof voucherFormSchema>;

// Added: Voucher type options for tab selection
const VOUCHER_TYPE_OPTIONS: RadioOption[] = [
  { value: 'PAYMENT', label: 'Payment Voucher' },
  { value: 'RECEIPT', label: 'Receipt Voucher' },
  { value: 'DEPOSIT', label: 'Deposit Voucher' },
];

// Added: Beneficiary/Payer type options
const BENEFICIARY_TYPE_OPTIONS: RadioOption[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * VoucherFormPage - Form for creating payment/receipt/deposit vouchers
 * Features:
 * - Dynamic form based on voucher type (payment vs receipt)
 * - Beneficiary/payer type selection with conditional fields
 * - Account selection filtered by ledger group
 * - Save as draft or approve & post
 */
export function VoucherFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Changed: Fetch accounts from API via useLedgerAccounts hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: accounts, isLoading: _accountsLoading } = useLedgerAccounts();

  // Changed: Get initial voucher type from URL path or query param
  // Supports both /accounting/voucher/payment and /accounting/voucher?type=payment
  const getInitialVoucherType = (): VoucherType => {
    // First check URL path (e.g., /accounting/voucher/payment)
    const pathParts = location.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1]?.toUpperCase();
    if (['PAYMENT', 'RECEIPT', 'DEPOSIT'].includes(lastPart)) {
      return lastPart as VoucherType;
    }
    // Fallback to query param (e.g., ?type=payment)
    const typeParam = searchParams.get('type')?.toUpperCase();
    if (typeParam && ['PAYMENT', 'RECEIPT', 'DEPOSIT'].includes(typeParam)) {
      return typeParam as VoucherType;
    }
    return 'PAYMENT';
  };
  const initialVoucherType = getInitialVoucherType();

  // Changed: Set default voucherTo based on voucher type
  // PAYMENT vouchers are typically paid TO vendors
  // RECEIPT/DEPOSIT vouchers are typically received FROM clients
  const initialVoucherTo: VoucherTo = initialVoucherType === 'PAYMENT' ? 'VENDOR' : 'CLIENT';

  // Added: Initialize form with react-hook-form and Zod validation
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VoucherFormData>({
    resolver: standardSchemaResolver(voucherFormSchema),
    defaultValues: {
      voucherType: initialVoucherType,
      voucherDate: format(new Date(), 'yyyy-MM-dd'),
      reference: '',
      description: '',
      voucherTo: initialVoucherTo,
      beneficiaryName: '',
      clientId: '',
      vendorId: '',
      staffId: '',
      cashAccountId: '',
      expenseAccountId: '',
      incomeAccountId: '',
      amount: 0,
    },
  });

  // Added: Watch voucher type and beneficiary type for conditional rendering
  const watchedVoucherType = watch('voucherType');
  const watchedVoucherTo = watch('voucherTo');

  // Added: Determine if this is a payment (money out) or receipt (money in) type
  const isPaymentType = watchedVoucherType === 'PAYMENT';
  const isReceiptType = watchedVoucherType === 'RECEIPT' || watchedVoucherType === 'DEPOSIT';

  // Added: Dynamic page title based on voucher type
  const pageTitle = useMemo(() => {
    switch (watchedVoucherType) {
      case 'PAYMENT':
        return 'New Payment Voucher';
      case 'RECEIPT':
        return 'New Receipt Voucher';
      case 'DEPOSIT':
        return 'New Deposit Voucher';
      default:
        return 'New Voucher';
    }
  }, [watchedVoucherType]);

  // Added: Dynamic subtitle based on voucher type
  const pageSubtitle = useMemo(() => {
    switch (watchedVoucherType) {
      case 'PAYMENT':
        return 'Record a payment made to a beneficiary';
      case 'RECEIPT':
        return 'Record money received from a payer';
      case 'DEPOSIT':
        return 'Record a deposit into an account';
      default:
        return 'Create a financial voucher';
    }
  }, [watchedVoucherType]);

  // Changed: Filter accounts by ledger group for bank/cash selection (ASSET accounts)
  const cashAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => account.ledgerGroup === 'ASSET')
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Changed: Filter accounts by ledger group for expense selection
  const expenseAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => account.ledgerGroup === 'EXPENSE')
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Changed: Filter accounts by ledger group for income selection
  const incomeAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => account.ledgerGroup === 'INCOME')
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Added: Clear conditional fields when voucher type changes
  /* eslint-disable-next-line -- Clearing form fields on type change is required */
  useEffect(() => {
    if (isPaymentType) {
      setValue('incomeAccountId', '');
    } else {
      setValue('expenseAccountId', '');
    }
  }, [isPaymentType, setValue]);

  // Added: Clear party-specific fields when beneficiary type changes
  /* eslint-disable-next-line -- Clearing form fields on type change is required */
  useEffect(() => {
    setValue('clientId', '');
    setValue('vendorId', '');
    setValue('staffId', '');
    if (watchedVoucherTo === 'OTHER') {
      setValue('beneficiaryName', '');
    }
  }, [watchedVoucherTo, setValue]);

  // Added: Form submission handler
  const onSubmit = useCallback(async (data: VoucherFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Added: Transform form data to API request format
      const request: CreateVoucherRequest = {
        voucherType: data.voucherType as VoucherType,
        voucherTo: data.voucherTo as VoucherTo,
        voucherDate: data.voucherDate,
        amount: data.amount,
        description: data.description,
        reference: data.reference,
        beneficiaryName: data.beneficiaryName,
        clientId: data.clientId || undefined,
        vendorId: data.vendorId || undefined,
        staffId: data.staffId || undefined,
        cashAccountId: data.cashAccountId,
        expenseAccountId: data.expenseAccountId || undefined,
        incomeAccountId: data.incomeAccountId || undefined,
      };

      await createVoucher(request);

      // Added: Navigate back to vouchers list after successful save
      navigate('/accounting/vouchers');
    } catch (error) {
      // Added: Display error message from API or generic fallback
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to save voucher. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [navigate]);

  // Added: Wrapper for save draft action - explicitly typed for TypeScript
  const handleSaveDraft = handleSubmit(onSubmit);

  // Added: Wrapper for approve and post action
  // Note: Currently same as save draft - future enhancement will add post workflow
  const handleApproveAndPost = handleSubmit(onSubmit);

  // Added: Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Added: Get dynamic label for beneficiary/payer based on voucher type
  const beneficiaryLabel = isPaymentType ? 'Beneficiary' : 'Payer';

  return (
    <div className="flex flex-col gap-6" data-testid="voucher-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="voucher-form-heading"
          >
            {pageTitle}
          </h1>
          <p className="text-subtle-text">
            {pageSubtitle}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/accounting/vouchers')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="voucher-form-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="voucher-form-save-draft-button"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={handleApproveAndPost}
            disabled={isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            data-testid="voucher-form-approve-post-button"
          >
            {isSubmitting && (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            )}
            Approve & Post
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2"
          data-testid="voucher-form-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          {submitError}
        </div>
      )}

      {/* Voucher Type Selection */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-type-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Voucher Type</h2>
        </div>
        <div className="p-6">
          {/* Added: Tab-style voucher type selector */}
          <Controller
            name="voucherType"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2" data-testid="voucher-type-tabs">
                {VOUCHER_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(option.value)}
                    className={`
                      h-12 px-6 rounded-lg text-sm font-bold transition-colors
                      ${field.value === option.value
                        ? 'bg-primary text-white'
                        : 'bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark hover:bg-primary/10'
                      }
                    `}
                    data-testid={`voucher-type-${option.value.toLowerCase()}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">
                        {option.value === 'PAYMENT' ? 'payments' : option.value === 'RECEIPT' ? 'receipt_long' : 'account_balance'}
                      </span>
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          />
          {errors.voucherType && (
            <p className="text-sm text-danger mt-2">{errors.voucherType.message}</p>
          )}
        </div>
      </div>

      {/* Voucher Details Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-details-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Voucher Details</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <DatePicker
              label="Voucher Date"
              required
              {...register('voucherDate')}
              error={errors.voucherDate?.message}
              data-testid="voucher-date-input"
            />
            <Input
              label="Reference Number"
              placeholder="e.g., PV-2024-001"
              {...register('reference')}
              error={errors.reference?.message}
              data-testid="voucher-reference-input"
            />
            <div className="md:col-span-1">
              {/* Added: Spacer for layout alignment */}
            </div>
          </div>
          <div className="mt-6">
            <Textarea
              label="Description"
              required
              placeholder="Describe the purpose of this voucher..."
              rows={2}
              {...register('description')}
              error={errors.description?.message}
              data-testid="voucher-description-input"
            />
          </div>
        </div>
      </div>

      {/* Beneficiary/Payer Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-beneficiary-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">
            {beneficiaryLabel} Information
          </h2>
        </div>
        <div className="p-6">
          {/* Added: Beneficiary/Payer type selector */}
          <div className="mb-6">
            <Controller
              name="voucherTo"
              control={control}
              render={({ field }) => (
                <Radio
                  name="voucherTo"
                  label={`${beneficiaryLabel} Type`}
                  options={BENEFICIARY_TYPE_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.voucherTo?.message}
                  containerClassName="flex-row flex-wrap gap-4"
                />
              )}
            />
          </div>

          {/* Added: Conditional fields based on beneficiary/payer type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {watchedVoucherTo === 'CLIENT' && (
              <Input
                label={isPaymentType ? 'Client (Beneficiary)' : 'Client (Payer)'}
                placeholder="Search or enter client name..."
                {...register('clientId')}
                error={errors.clientId?.message}
                helperText="Start typing to search existing clients"
                data-testid="voucher-client-input"
              />
            )}
            {watchedVoucherTo === 'VENDOR' && (
              <Input
                label={isPaymentType ? 'Vendor (Beneficiary)' : 'Vendor (Payer)'}
                placeholder="Search or enter vendor name..."
                {...register('vendorId')}
                error={errors.vendorId?.message}
                helperText="Start typing to search existing vendors"
                data-testid="voucher-vendor-input"
              />
            )}
            {watchedVoucherTo === 'STAFF' && (
              <Input
                label={isPaymentType ? 'Staff Member (Beneficiary)' : 'Staff Member (Payer)'}
                placeholder="Search or enter staff name..."
                {...register('staffId')}
                error={errors.staffId?.message}
                helperText="Start typing to search staff members"
                data-testid="voucher-staff-input"
              />
            )}
            {watchedVoucherTo === 'OTHER' && (
              <Input
                label={`${beneficiaryLabel} Name`}
                placeholder={`Enter ${beneficiaryLabel.toLowerCase()} name...`}
                {...register('beneficiaryName')}
                error={errors.beneficiaryName?.message}
                data-testid="voucher-beneficiary-name-input"
              />
            )}
          </div>
        </div>
      </div>

      {/* Account Selection Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-accounts-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Account Selection</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Added: Bank/Cash account selector (required for all types) */}
            <Select
              label="Bank/Cash Account"
              required
              options={cashAccountOptions}
              placeholder="Select account..."
              {...register('cashAccountId')}
              error={errors.cashAccountId?.message}
              helperText="Account used for payment or receipt"
              data-testid="voucher-cash-account-select"
            />

            {/* Added: Expense account selector (only for payment vouchers) */}
            {isPaymentType && (
              <Select
                label="Expense Account"
                required
                options={expenseAccountOptions}
                placeholder="Select expense account..."
                {...register('expenseAccountId')}
                error={errors.expenseAccountId?.message}
                helperText="Account to debit for this expense"
                data-testid="voucher-expense-account-select"
              />
            )}

            {/* Added: Income account selector (only for receipt/deposit vouchers) */}
            {isReceiptType && (
              <Select
                label="Income Account"
                required
                options={incomeAccountOptions}
                placeholder="Select income account..."
                {...register('incomeAccountId')}
                error={errors.incomeAccountId?.message}
                helperText="Account to credit for this income"
                data-testid="voucher-income-account-select"
              />
            )}
          </div>
        </div>
      </div>

      {/* Amount Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-amount-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Amount</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Added: Amount input with currency prefix */}
            <div className="flex flex-col">
              <label className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">
                Amount <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-subtle-text text-base font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('amount', { valueAsNumber: true })}
                  className={`
                    w-full h-12 pl-8 pr-4 rounded-lg border text-right text-lg font-bold
                    ${errors.amount
                      ? 'border-danger focus:border-danger focus:ring-danger/20'
                      : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                    }
                    bg-surface-light dark:bg-surface-dark
                    text-text-light dark:text-text-dark
                    focus:outline-none focus:ring-2
                  `}
                  data-testid="voucher-amount-input"
                />
              </div>
              {errors.amount && (
                <span className="text-sm text-danger mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">error</span>
                  {errors.amount.message}
                </span>
              )}
            </div>

            {/* Added: Amount preview card */}
            <div className="flex items-center">
              <div
                className={`
                  flex-1 p-4 rounded-lg border
                  ${isPaymentType
                    ? 'bg-danger/5 border-danger/20'
                    : 'bg-success/5 border-success/20'
                  }
                `}
                data-testid="voucher-amount-preview"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-2xl ${
                      isPaymentType ? 'text-danger' : 'text-success'
                    }`}
                  >
                    {isPaymentType ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  <div>
                    <p className="text-sm text-subtle-text font-medium">
                      {isPaymentType ? 'Money Out' : 'Money In'}
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        isPaymentType ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {formatCurrency(watch('amount') || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Summary Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-summary-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Transaction Summary</h2>
        </div>
        <div className="p-6">
          <div className="rounded-lg bg-background-light dark:bg-background-dark p-4">
            <p className="text-sm text-subtle-text mb-2">Journal Entry Preview:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="voucher-journal-preview">
                <thead className="text-xs text-subtle-text uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Account</th>
                    <th className="px-4 py-2 text-right font-semibold">Debit</th>
                    <th className="px-4 py-2 text-right font-semibold">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {isPaymentType ? (
                    <>
                      {/* Added: Payment voucher - Debit expense, Credit bank */}
                      <tr className="border-t border-border-light dark:border-border-dark">
                        <td className="px-4 py-2 text-text-light dark:text-text-dark">
                          {watch('expenseAccountId')
                            ? expenseAccountOptions.find(o => o.value === watch('expenseAccountId'))?.label || 'Expense Account'
                            : 'Expense Account'
                          }
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                          {formatCurrency(watch('amount') || 0)}
                        </td>
                        <td className="px-4 py-2 text-right text-subtle-text">-</td>
                      </tr>
                      <tr className="border-t border-border-light dark:border-border-dark">
                        <td className="px-4 py-2 text-text-light dark:text-text-dark">
                          {watch('cashAccountId')
                            ? cashAccountOptions.find(o => o.value === watch('cashAccountId'))?.label || 'Bank/Cash Account'
                            : 'Bank/Cash Account'
                          }
                        </td>
                        <td className="px-4 py-2 text-right text-subtle-text">-</td>
                        <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                          {formatCurrency(watch('amount') || 0)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <>
                      {/* Added: Receipt voucher - Debit bank, Credit income */}
                      <tr className="border-t border-border-light dark:border-border-dark">
                        <td className="px-4 py-2 text-text-light dark:text-text-dark">
                          {watch('cashAccountId')
                            ? cashAccountOptions.find(o => o.value === watch('cashAccountId'))?.label || 'Bank/Cash Account'
                            : 'Bank/Cash Account'
                          }
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                          {formatCurrency(watch('amount') || 0)}
                        </td>
                        <td className="px-4 py-2 text-right text-subtle-text">-</td>
                      </tr>
                      <tr className="border-t border-border-light dark:border-border-dark">
                        <td className="px-4 py-2 text-text-light dark:text-text-dark">
                          {watch('incomeAccountId')
                            ? incomeAccountOptions.find(o => o.value === watch('incomeAccountId'))?.label || 'Income Account'
                            : 'Income Account'
                          }
                        </td>
                        <td className="px-4 py-2 text-right text-subtle-text">-</td>
                        <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                          {formatCurrency(watch('amount') || 0)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
                <tfoot className="border-t-2 border-border-light dark:border-border-dark font-bold">
                  <tr>
                    <td className="px-4 py-2 text-text-light dark:text-text-dark">Total</td>
                    <td className="px-4 py-2 text-right text-text-light dark:text-text-dark">
                      {formatCurrency(watch('amount') || 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-text-light dark:text-text-dark">
                      {formatCurrency(watch('amount') || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
