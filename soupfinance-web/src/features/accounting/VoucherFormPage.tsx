/**
 * Voucher Form Page
 * Form for creating and editing vouchers.
 * Reference: soupfinance-designs/payment-entry-form/, design-system.md
 *
 * Voucher Types (Changed SOUPFIN-157, rules in ./voucherTypes.ts):
 * - PAYMENT: Money paid out (Debit: Expense account, Credit: Bank/Cash account)
 * - RECEIPT: Money received (Debit: Bank/Cash account, Credit: Income account)
 * - CONTRA: Transfer between own accounts (Debit and Credit: Bank/Cash accounts)
 * - JOURNAL: Non-cash adjustment (Debit and Credit: any account)
 *
 * Changed: Now fetches ledger accounts from API via useLedgerAccounts hook
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { format } from 'date-fns';
import { Input } from '../../components/forms/Input';
import { Select, type SelectOption } from '../../components/forms/Select';
import { DatePicker } from '../../components/forms/DatePicker';
import { Textarea } from '../../components/forms/Textarea';
import { Radio, type RadioOption } from '../../components/forms/Radio';
// Added (SOUPFIN-30 #16): currency-aware amount input that rejects letters
import { MoneyInput } from '../../components/forms/MoneyInput';
// Added (SOUPFIN-30 #16): tenant-currency formatter for displayed amounts.
import { useFormatCurrency } from '../../stores';
import { createVoucher, getVoucher, updateVoucher } from '../../api/endpoints/ledger';
// Added (SOUPFIN-154): prefill the form when opening an existing voucher
import { voucherToFormValues } from './voucherFormValues';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
// Added (SOUPFIN-9): module-disabled banner + user-friendly submit errors
import { ModuleDisabledBanner } from '../../components/feedback';
import { getApiErrorMessage } from '../../api/errors';
import type { CreateVoucherRequest, VoucherType, VoucherTo } from '../../types';
// Added (SOUPFIN-157): per-type account rules
import {
  VOUCHER_TYPES,
  VOUCHER_TYPE_RULES,
  normalizeVoucherType,
  filterAccountsForSide,
  isAccountAllowed,
} from './voucherTypes';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Zod schema for voucher form validation
// Changed: Renamed voucherDate→transactionDate, description→notes to match backend domain
// Note: Zod 4 uses 'message' instead of 'required_error' for enum validation
const voucherFormSchema = z.object({
  // Changed (SOUPFIN-157): four voucher types; DEPOSIT is gone
  voucherType: z.enum(['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'], {
    message: 'Voucher type is required',
  }),
  transactionDate: z.string().min(1, 'Date is required'),
  reference: z.string().optional(),
  notes: z.string().min(1, 'Description is required'),
  paymentMethod: z.string().optional(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  voucherTo: z.enum(['CLIENT', 'VENDOR', 'STAFF', 'OTHER'], {
    message: 'Beneficiary/Payer type is required',
  }),
  beneficiaryName: z.string().optional(),
  clientId: z.string().optional(),
  vendorId: z.string().optional(),
  staffId: z.string().optional(),
  // Changed (SOUPFIN-157): the two sides of the entry, named as the backend
  // names them, replace the role-based cash/expense/income accounts
  debitAccountId: z.string().min(1, 'Debit account is required'),
  creditAccountId: z.string().min(1, 'Credit account is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
}).refine(
  (data) => !data.debitAccountId || data.debitAccountId !== data.creditAccountId,
  { message: 'Debit and credit accounts must be different', path: ['creditAccountId'] }
);

// Added: Type inference from schema
type VoucherFormData = z.infer<typeof voucherFormSchema>;

// Changed (SOUPFIN-157): one tab per voucher type, labelled from the rules
const VOUCHER_TYPE_OPTIONS: RadioOption[] = VOUCHER_TYPES.map((type) => ({
  value: type,
  label: VOUCHER_TYPE_RULES[type].label,
}));

// Added (SOUPFIN-157): dropdown option for a ledger account
const toOption = (account: { id: string; code: string; name: string }): SelectOption => ({
  value: account.id,
  label: `${account.code} - ${account.name}`,
});

// Added (SOUPFIN-157): subtitle shown under a new voucher's title
const VOUCHER_SUBTITLES: Record<VoucherType, string> = {
  PAYMENT: 'Record a payment made to a beneficiary',
  RECEIPT: 'Record money received from a payer',
  CONTRA: 'Move money between your own bank and cash accounts',
  JOURNAL: 'Record a non-cash adjustment between any two accounts',
};

// Added: Beneficiary/Payer type options
const BENEFICIARY_TYPE_OPTIONS: RadioOption[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * VoucherFormPage - Form for creating payment, receipt, contra and journal vouchers
 * Features:
 * - Dynamic form based on voucher type
 * - Beneficiary/payer type selection with conditional fields
 * - Account selection filtered by ledger group
 * - Save as draft or approve & post
 */
export function VoucherFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Added (SOUPFIN-154): /accounting/vouchers/:id shows a voucher read-only and
  // /accounting/vouchers/:id/edit edits it. Before this the :id was ignored and
  // both rendered a blank PAYMENT create form.
  const { id: voucherId } = useParams<{ id: string }>();
  const isExisting = !!voucherId && voucherId !== 'new';
  const isEditRoute = location.pathname.endsWith('/edit');

  const {
    data: existingVoucher,
    isLoading: isLoadingVoucher,
    error: voucherLoadError,
  } = useQuery({
    queryKey: ['voucher', voucherId],
    queryFn: () => getVoucher(voucherId!),
    enabled: isExisting,
  });

  // A posted, cancelled or reversed voucher opens read-only even on the /edit
  // URL. This matches the register, which offers Edit for every other status.
  const lockedStatus = ['POSTED', 'CANCELLED', 'REVERSED'].includes(
    String(existingVoucher?.status ?? '').toUpperCase()
  );
  const canEditVoucher = !lockedStatus;
  const isReadOnly = isExisting && (!isEditRoute || !canEditVoucher);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Changed (SOUPFIN-9): expose the accounts query error so we can render a
  // ModuleDisabledBanner when the Accounting/Ledger module is not enabled.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: accounts, isLoading: _accountsLoading, error: accountsError } = useLedgerAccounts();

  // Added: Fetch payment methods from backend (domain class, not enum)
  const { data: paymentMethods } = usePaymentMethods();

  // Changed: Get initial voucher type from URL path or query param
  // Supports both /accounting/voucher/payment and /accounting/voucher?type=payment
  // Changed (SOUPFIN-157): recognise all four types, and read a legacy
  // /voucher/deposit link as a receipt
  const getInitialVoucherType = (): VoucherType => {
    // First check URL path (e.g., /accounting/voucher/payment)
    const pathParts = location.pathname.split('/');
    const fromPath = normalizeVoucherType(pathParts[pathParts.length - 1]);
    if (fromPath) return fromPath;
    // Fallback to query param (e.g., ?type=payment)
    return normalizeVoucherType(searchParams.get('type')) ?? 'PAYMENT';
  };
  const initialVoucherType = getInitialVoucherType();

  // Changed: Set default voucherTo based on voucher type
  // PAYMENT vouchers are typically paid TO vendors, RECEIPT vouchers received
  // FROM clients; CONTRA and JOURNAL have no outside party by default
  const initialVoucherTo: VoucherTo = VOUCHER_TYPE_RULES[initialVoucherType].defaultVoucherTo;

  // Added: Initialize form with react-hook-form and Zod validation
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<VoucherFormData>({
    resolver: standardSchemaResolver(voucherFormSchema),
    defaultValues: {
      voucherType: initialVoucherType,
      transactionDate: format(new Date(), 'yyyy-MM-dd'),
      reference: '',
      notes: '',
      paymentMethod: '',
      currency: '',
      exchangeRate: undefined,
      voucherTo: initialVoucherTo,
      beneficiaryName: '',
      clientId: '',
      vendorId: '',
      staffId: '',
      debitAccountId: '',
      creditAccountId: '',
      amount: 0,
    },
  });

  // Added (SOUPFIN-154): fill the form once the existing voucher arrives
  useEffect(() => {
    if (existingVoucher) {
      reset(voucherToFormValues(existingVoucher));
    }
  }, [existingVoucher, reset]);

  // Added: Watch voucher type and beneficiary type for conditional rendering
  const watchedVoucherType = watch('voucherType');
  const watchedVoucherTo = watch('voucherTo');

  // Added: Determine if this is a payment (money out) or receipt (money in) type
  // Changed (SOUPFIN-157): the type's rules drive labels, filters and sections
  const typeRule = VOUCHER_TYPE_RULES[watchedVoucherType] ?? VOUCHER_TYPE_RULES.PAYMENT;
  const isPaymentType = watchedVoucherType === 'PAYMENT';

  // Added: Dynamic page title based on voucher type
  // Changed (SOUPFIN-154): an existing voucher is titled by its type, with
  // "Edit" in front when it is open for editing.
  const pageTitle = useMemo(() => {
    if (isExisting) {
      return isReadOnly ? typeRule.label : `Edit ${typeRule.label}`;
    }
    return `New ${typeRule.label}`;
  }, [typeRule, isExisting, isReadOnly]);

  // Added: Dynamic subtitle based on voucher type
  const pageSubtitle = useMemo(() => {
    if (isExisting) {
      const number = existingVoucher?.voucherNumber;
      const status = existingVoucher?.status;
      return [number, status].filter(Boolean).join(' · ') || 'Voucher details';
    }
    return VOUCHER_SUBTITLES[watchedVoucherType] ?? 'Create a financial voucher';
  }, [watchedVoucherType, isExisting, existingVoucher]);

  // Changed (SOUPFIN-157): one dropdown per side of the entry, each filtered
  // to the ledger groups the voucher type allows on that side (CONTRA:
  // ASSET to ASSET, JOURNAL: any to any). See voucherTypes.ts.
  const debitAccountOptions: SelectOption[] = useMemo(
    () => filterAccountsForSide(accounts, watchedVoucherType, 'debit').map(toOption),
    [accounts, watchedVoucherType]
  );
  const creditAccountOptions: SelectOption[] = useMemo(
    () => filterAccountsForSide(accounts, watchedVoucherType, 'credit').map(toOption),
    [accounts, watchedVoucherType]
  );

  // Added: Payment method options from backend domain records
  const paymentMethodOptions: SelectOption[] = useMemo(() =>
    (paymentMethods || []).map((pm) => ({
      value: pm.id,
      label: pm.name,
    })),
    [paymentMethods]
  );

  // Added: Clear conditional fields when voucher type changes
  // Changed (SOUPFIN-154): run from the user's click rather than an effect, so
  // filling the form from a loaded voucher does not wipe its accounts.
  // Changed (SOUPFIN-157): a new type allows different accounts on each side,
  // so clear both and reset the party to the type's default.
  const handleVoucherTypeChange = useCallback((nextType: VoucherType) => {
    if (nextType === watchedVoucherType) return;
    setValue('debitAccountId', '');
    setValue('creditAccountId', '');
    setValue('voucherTo', VOUCHER_TYPE_RULES[nextType].defaultVoucherTo);
    setValue('clientId', '');
    setValue('vendorId', '');
    setValue('staffId', '');
  }, [setValue, watchedVoucherType]);

  // Added: Clear party-specific fields when beneficiary type changes
  // Changed (SOUPFIN-154): from the user's change only, for the same reason.
  const handleVoucherToChange = useCallback((nextTo: string) => {
    setValue('clientId', '');
    setValue('vendorId', '');
    setValue('staffId', '');
    if (nextTo === 'OTHER') {
      setValue('beneficiaryName', '');
    }
  }, [setValue]);

  // Added: Form submission handler
  const onSubmit = useCallback(async (data: VoucherFormData) => {
    // Added (SOUPFIN-157): the dropdowns only offer allowed accounts, but an
    // opened voucher can carry one from before the rules; refuse it here
    // rather than let the backend reject the save.
    const rule = VOUCHER_TYPE_RULES[data.voucherType];
    const byId = new Map((accounts || []).map((a) => [a.id, a]));
    let sidesValid = true;
    (['debit', 'credit'] as const).forEach((side) => {
      const account = byId.get(side === 'debit' ? data.debitAccountId : data.creditAccountId);
      if (account && !isAccountAllowed(account, data.voucherType, side)) {
        sidesValid = false;
        setError(side === 'debit' ? 'debitAccountId' : 'creditAccountId', {
          message: `${rule.label} cannot use ${account.code} - ${account.name} as its ${rule[side].label}`,
        });
      }
    });
    if (!sidesValid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Changed: Transform form data to API request format with correct backend field names
      const request: CreateVoucherRequest = {
        voucherType: data.voucherType as VoucherType,
        // A contra is between the tenant's own accounts, so it has no party
        voucherTo: (rule.hasBeneficiary ? data.voucherTo : 'OTHER') as VoucherTo,
        transactionDate: data.transactionDate,
        amount: data.amount,
        notes: data.notes,
        reference: data.reference,
        beneficiaryName: rule.hasBeneficiary ? data.beneficiaryName : undefined,
        clientId: (rule.hasBeneficiary && data.clientId) || undefined,
        vendorId: (rule.hasBeneficiary && data.vendorId) || undefined,
        staffId: (rule.hasBeneficiary && data.staffId) || undefined,
        // Changed (SOUPFIN-157): the entry's two sides
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        // Changed: Send paymentMethod as FK ID (domain class, not string)
        ...(data.paymentMethod && { paymentMethodId: data.paymentMethod }),
        ...(data.currency && { currency: data.currency }),
        ...(data.exchangeRate && { exchangeRate: data.exchangeRate }),
      };

      // Changed (SOUPFIN-154): update the voucher being edited, create otherwise
      if (isExisting && voucherId) {
        await updateVoucher(voucherId, request);
      } else {
        await createVoucher(request);
      }

      // Fix (SOUPFIN-157): the register caches its list for two minutes, so
      // without this a voucher saved from it did not appear on return.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      if (isExisting && voucherId) {
        await queryClient.invalidateQueries({ queryKey: ['voucher', voucherId] });
      }

      // Changed (SOUPFIN-154): vouchers are listed in the Transaction Register;
      // /accounting/vouchers used to render a fresh blank form here.
      navigate('/accounting/transactions');
    } catch (error) {
      // Changed (SOUPFIN-9): use parseApiError so 403 ("module disabled")
      // shows a useful message instead of raw axios "Request failed..." text.
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [navigate, isExisting, voucherId, accounts, setError, queryClient]);

  // Added: Wrapper for save draft action - explicitly typed for TypeScript
  const handleSaveDraft = handleSubmit(onSubmit);

  // Added: Wrapper for approve and post action
  // Note: Currently same as save draft - future enhancement will add post workflow
  const handleApproveAndPost = handleSubmit(onSubmit);

  // Fix (SOUPFIN-30 #16): display amounts in the tenant's configured currency
  // instead of a hardcoded USD, matching the MoneyInput prefix above.
  const formatCurrency = useFormatCurrency();

  // Added: Get dynamic label for beneficiary/payer based on voucher type
  // Changed (SOUPFIN-157): a journal voucher's party is neither payee nor payer
  const beneficiaryLabel = isPaymentType ? 'Beneficiary' : watchedVoucherType === 'RECEIPT' ? 'Payer' : 'Party';

  // Added (SOUPFIN-157): how the amount moves, for the preview card
  const amountFlow = {
    PAYMENT: { label: 'Money Out', icon: 'arrow_upward', tone: 'danger' },
    RECEIPT: { label: 'Money In', icon: 'arrow_downward', tone: 'success' },
    CONTRA: { label: 'Transfer', icon: 'swap_horiz', tone: 'info' },
    JOURNAL: { label: 'Adjustment', icon: 'edit_note', tone: 'warning' },
  }[watchedVoucherType] ?? { label: 'Money Out', icon: 'arrow_upward', tone: 'danger' };
  // Literal class names so Tailwind generates them
  const toneClasses = {
    danger: { card: 'bg-danger/5 border-danger/20', text: 'text-danger' },
    success: { card: 'bg-success/5 border-success/20', text: 'text-success' },
    info: { card: 'bg-info/5 border-info/20', text: 'text-info' },
    warning: { card: 'bg-warning/5 border-warning/20', text: 'text-warning' },
  }[amountFlow.tone as 'danger' | 'success' | 'info' | 'warning'];

  // Added (SOUPFIN-157): label of the account chosen on one side of the entry
  const debitAccountLabel = debitAccountOptions.find((o) => o.value === watch('debitAccountId'))?.label
    || typeRule.debit.label;
  const creditAccountLabel = creditAccountOptions.find((o) => o.value === watch('creditAccountId'))?.label
    || typeRule.credit.label;

  // Added (SOUPFIN-154): loading state while an existing voucher is fetched
  if (isExisting && isLoadingVoucher) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="voucher-form-page">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="text-subtle-text">Loading voucher</p>
      </div>
    );
  }

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
          <HelpLink section="vouchers" className="mt-1 self-start" />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/accounting/transactions')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="voucher-form-cancel-button"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {/* Added (SOUPFIN-154): an editable voucher shown read-only offers Edit */}
          {isReadOnly && canEditVoucher && (
            <Link
              to={`/accounting/vouchers/${voucherId}/edit`}
              className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 flex items-center gap-2"
              data-testid="voucher-form-edit-button"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              Edit
            </Link>
          )}
          {!isReadOnly && (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="voucher-form-save-draft-button"
          >
            {isExisting ? 'Save Changes' : 'Save Draft'}
          </button>
          )}
          {/* Changed (SOUPFIN-154): posting an existing voucher is a register
              action, so the edit form only saves */}
          {!isReadOnly && !isExisting && (
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
          )}
        </div>
      </div>

      {/* Added (SOUPFIN-154): the voucher could not be loaded */}
      {isExisting && voucherLoadError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2"
          data-testid="voucher-form-load-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          {`This voucher could not be loaded. ${getApiErrorMessage(voucherLoadError)}`}
        </div>
      )}

      {/* Added (SOUPFIN-154): explain why a voucher on the /edit URL is locked */}
      {isExisting && isEditRoute && existingVoucher && !canEditVoucher && (
        <div
          className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-sm text-text-light dark:text-text-dark flex items-center gap-2"
          data-testid="voucher-form-readonly-banner"
        >
          <span className="material-symbols-outlined text-xl text-primary">lock</span>
          {`This voucher is ${existingVoucher.status?.toLowerCase()}, so it can no longer be edited.`}
        </div>
      )}

      {/* Added (SOUPFIN-9): module-disabled banner. Renders only when the
          accounts query failed with 403 on a Ledger/Voucher endpoint so the
          user knows why the Bank/Cash, Expense, and Income dropdowns are
          empty and submitting will not work. */}
      {accountsError && (
        <ModuleDisabledBanner
          error={accountsError}
          context="The debit and credit account dropdowns are unavailable until the module is enabled."
          testId="voucher-form-module-disabled"
        />
      )}

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

      {/* Changed (SOUPFIN-154): one fieldset so a read-only voucher disables
          every input, select and type tab at once */}
      <fieldset
        disabled={isReadOnly || (isExisting && !existingVoucher)}
        className="flex flex-col gap-6 min-w-0 border-0 p-0 m-0"
        data-testid="voucher-form-fields"
      >
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
                    onClick={() => {
                      handleVoucherTypeChange(option.value as VoucherType);
                      field.onChange(option.value);
                    }}
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
                        {VOUCHER_TYPE_RULES[option.value as VoucherType].icon}
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
            {/* Changed: voucherDate → transactionDate to match backend */}
            <DatePicker
              label="Transaction Date"
              required
              {...register('transactionDate')}
              error={errors.transactionDate?.message}
              data-testid="voucher-date-input"
            />
            <Input
              label="Reference Number"
              placeholder="e.g., PV-2024-001"
              {...register('reference')}
              error={errors.reference?.message}
              data-testid="voucher-reference-input"
            />
            {/* Changed: Payment method dropdown from backend domain records (not hardcoded enum) */}
            <Select
              label="Payment Method"
              options={paymentMethodOptions}
              placeholder="Select method..."
              {...register('paymentMethod')}
              error={errors.paymentMethod?.message}
              data-testid="voucher-payment-method-select"
            />
          </div>
          <div className="mt-6">
            {/* Changed: description → notes to match backend */}
            <Textarea
              label="Notes"
              required
              placeholder="Describe the purpose of this voucher..."
              rows={2}
              {...register('notes')}
              error={errors.notes?.message}
              data-testid="voucher-notes-input"
            />
          </div>
        </div>
      </div>

      {/* Beneficiary/Payer Section
          Changed (SOUPFIN-157): hidden for a contra, which moves money between
          the tenant's own accounts and has no outside party */}
      {typeRule.hasBeneficiary && (
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
                  onChange={(e) => {
                    handleVoucherToChange(e.target.value);
                    field.onChange(e);
                  }}
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
                label={`Client (${beneficiaryLabel})`}
                placeholder="Search or enter client name..."
                {...register('clientId')}
                error={errors.clientId?.message}
                helperText="Start typing to search existing clients"
                data-testid="voucher-client-input"
              />
            )}
            {watchedVoucherTo === 'VENDOR' && (
              <Input
                label={`Vendor (${beneficiaryLabel})`}
                placeholder="Search or enter vendor name..."
                {...register('vendorId')}
                error={errors.vendorId?.message}
                helperText="Start typing to search existing vendors"
                data-testid="voucher-vendor-input"
              />
            )}
            {watchedVoucherTo === 'STAFF' && (
              <Input
                label={`Staff Member (${beneficiaryLabel})`}
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
      )}

      {/* Account Selection Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="voucher-accounts-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Account Selection</h2>
        </div>
        <div className="p-6">
          {/* Changed (SOUPFIN-157): one selector per side of the entry, labelled
              and filtered by the voucher type's rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Select
              label={typeRule.debit.label}
              required
              options={debitAccountOptions}
              placeholder="Select account..."
              {...register('debitAccountId')}
              error={errors.debitAccountId?.message}
              helperText={`Debit · ${typeRule.debit.helperText}`}
              data-testid="voucher-debit-account-select"
            />
            <Select
              label={typeRule.credit.label}
              required
              options={creditAccountOptions}
              placeholder="Select account..."
              {...register('creditAccountId')}
              error={errors.creditAccountId?.message}
              helperText={`Credit · ${typeRule.credit.helperText}`}
              data-testid="voucher-credit-account-select"
            />
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
            {/* Amount input.
                Fix (SOUPFIN-30 #16): MoneyInput shows the tenant's configured
                currency symbol rather than a hardcoded "$", and rejects the
                letter/sign keys a bare <input type="number"> accepts. */}
            <MoneyInput
              label="Amount"
              required
              placeholder="0.00"
              inputClassName="text-lg font-bold"
              error={errors.amount?.message}
              {...register('amount', { valueAsNumber: true })}
              data-testid="voucher-amount-input"
            />

            {/* Added: Amount preview card
                Changed (SOUPFIN-157): tone and wording follow the voucher type */}
            <div className="flex items-center">
              <div
                className={`flex-1 p-4 rounded-lg border ${toneClasses.card}`}
                data-testid="voucher-amount-preview"
              >
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined text-2xl ${toneClasses.text}`}>
                    {amountFlow.icon}
                  </span>
                  <div>
                    <p className="text-sm text-subtle-text font-medium">
                      {amountFlow.label}
                    </p>
                    <p className={`text-xl font-bold ${toneClasses.text}`}>
                      {formatCurrency(watch('amount') || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Added: Currency and exchange rate fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Currency</label>
              <select
                {...register('currency')}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                data-testid="voucher-currency-select"
              >
                <option value="">Default (Account Currency)</option>
                {DEFAULT_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.label}
                  </option>
                ))}
              </select>
            </div>
            {watch('currency') && (
              <Input
                label="Exchange Rate"
                type="number"
                step="0.0001"
                placeholder="1.0000"
                {...register('exchangeRate', { valueAsNumber: true })}
                error={errors.exchangeRate?.message}
                helperText="Rate to convert to base currency"
                data-testid="voucher-exchange-rate-input"
              />
            )}
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
                  {/* Changed (SOUPFIN-157): every voucher type debits one
                      account and credits the other */}
                  <tr className="border-t border-border-light dark:border-border-dark" data-testid="voucher-preview-debit-row">
                    <td className="px-4 py-2 text-text-light dark:text-text-dark">{debitAccountLabel}</td>
                    <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(watch('amount') || 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-subtle-text">-</td>
                  </tr>
                  <tr className="border-t border-border-light dark:border-border-dark" data-testid="voucher-preview-credit-row">
                    <td className="px-4 py-2 text-text-light dark:text-text-dark">{creditAccountLabel}</td>
                    <td className="px-4 py-2 text-right text-subtle-text">-</td>
                    <td className="px-4 py-2 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(watch('amount') || 0)}
                    </td>
                  </tr>
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
      </fieldset>
    </div>
  );
}
