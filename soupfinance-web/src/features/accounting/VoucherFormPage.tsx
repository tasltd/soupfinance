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
import { useNavigate, useSearchParams, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { createVoucher, getVoucher, updateVoucher, ledgerGroupMatches } from '../../api/endpoints/ledger';
// Added (SOUPFIN-154): prefill the form when opening an existing voucher
import { voucherToFormValues } from './voucherFormValues';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
// Added (SOUPFIN-162): real party lists behind the vendor, client and staff fields
import { listVendors } from '../../api/endpoints/vendors';
import { listClients, resolveAccountServicesId, getClientDisplayName } from '../../api/endpoints/clients';
import { agentApi } from '../../api/endpoints/settings';
import { AddEntityButton } from '../../components/forms/AddEntityButton';
// Added (SOUPFIN-9): module-disabled banner + user-friendly submit errors
import { ModuleDisabledBanner } from '../../components/feedback';
import { getApiErrorMessage, getPeriodLockError } from '../../api/errors';
import type { CreateVoucherRequest, VoucherType, VoucherTo } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Zod schema for voucher form validation
// Changed: Renamed voucherDate→transactionDate, description→notes to match backend domain
// Note: Zod 4 uses 'message' instead of 'required_error' for enum validation
const voucherFormSchema = z.object({
  voucherType: z.enum(['PAYMENT', 'RECEIPT', 'DEPOSIT'], {
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
  cashAccountId: z.string().min(1, 'Bank/Cash account is required'),
  expenseAccountId: z.string().optional(),
  incomeAccountId: z.string().optional(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
}).refine(
  // Added (SOUPFIN-162): the backend rejects a VENDOR voucher with no vendor
  // and a CLIENT voucher with no client account, so say so before saving.
  (data) => data.voucherTo !== 'VENDOR' || !!data.vendorId,
  { message: 'Select a vendor', path: ['vendorId'] }
).refine(
  (data) => data.voucherTo !== 'CLIENT' || !!data.clientId,
  { message: 'Select a client', path: ['clientId'] }
).refine(
  (data) => data.voucherTo !== 'STAFF' || !!data.staffId,
  { message: 'Select a staff member', path: ['staffId'] }
).refine(
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

  // Added (SOUPFIN-162): the vendor, client and staff fields used to be free
  // text that was posted as the FK id, so a typed name reached the backend as
  // vendor.id. They now choose from these lists. The query keys match the ones
  // the "+" buttons refresh when the user returns from the create page.
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => listVendors({ max: 100 }),
  });
  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients-for-voucher'],
    queryFn: () => listClients({ max: 100 }),
  });
  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['agents-for-voucher'],
    queryFn: () => agentApi.list({ max: 100 }),
  });

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
    reset,
    setError,
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
      cashAccountId: '',
      expenseAccountId: '',
      incomeAccountId: '',
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
  const isPaymentType = watchedVoucherType === 'PAYMENT';
  const isReceiptType = watchedVoucherType === 'RECEIPT' || watchedVoucherType === 'DEPOSIT';

  // Added: Dynamic page title based on voucher type
  // Changed (SOUPFIN-154): an existing voucher is titled by its type, with
  // "Edit" in front when it is open for editing.
  const pageTitle = useMemo(() => {
    if (isExisting) {
      const typeLabel = VOUCHER_TYPE_OPTIONS.find((o) => o.value === watchedVoucherType)?.label ?? 'Voucher';
      return isReadOnly ? typeLabel : `Edit ${typeLabel}`;
    }
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
  }, [watchedVoucherType, isExisting, isReadOnly]);

  // Added: Dynamic subtitle based on voucher type
  const pageSubtitle = useMemo(() => {
    if (isExisting) {
      const number = existingVoucher?.voucherNumber;
      const status = existingVoucher?.status;
      return [number, status].filter(Boolean).join(' · ') || 'Voucher details';
    }
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
  }, [watchedVoucherType, isExisting, existingVoucher]);

  // Changed: Filter accounts by ledger group for bank/cash selection (ASSET accounts)
  const cashAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => ledgerGroupMatches(account.ledgerGroup, 'ASSET'))
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Changed: Filter accounts by ledger group for expense selection
  const expenseAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => ledgerGroupMatches(account.ledgerGroup, 'EXPENSE'))
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Changed: Filter accounts by ledger group for income selection.
  // Fix (SOUPFIN-30 #8): ledgerGroupMatches treats INCOME and REVENUE as
  // equivalent — the backend derives the group from the account category's
  // serialised string, which may end in "< REVENUE" rather than "< INCOME".
  // Filtering on INCOME alone left the receipt voucher's income dropdown empty.
  const incomeAccountOptions: SelectOption[] = useMemo(() =>
    (accounts || [])
      .filter((account) => ledgerGroupMatches(account.ledgerGroup, 'INCOME'))
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      })),
    [accounts]
  );

  // Added: Payment method options from backend domain records
  const paymentMethodOptions: SelectOption[] = useMemo(() =>
    (paymentMethods || []).map((pm) => ({
      value: pm.id,
      label: pm.name,
    })),
    [paymentMethods]
  );

  // Added (SOUPFIN-162): party dropdown options
  const vendorOptions: SelectOption[] = useMemo(() =>
    (vendors || []).map((v) => ({ value: v.id, label: v.name || v.id })),
    [vendors]
  );

  const staffOptions: SelectOption[] = useMemo(() =>
    (staff || []).map((a) => ({
      value: a.id,
      label: `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.id,
    })),
    [staff]
  );

  // A saved CLIENT voucher stores the client's AccountServices id, not the
  // Client id. Find the client that owns it so the dropdown shows that client.
  // When the list does not carry the nested accountServices, keep the stored
  // account as its own option so editing does not silently drop the party.
  const watchedClientId = watch('clientId');
  const clientIds = useMemo(() => new Set((clients || []).map((c) => c.id)), [clients]);
  useEffect(() => {
    if (!clients || !watchedClientId || clientIds.has(watchedClientId)) return;
    const owner = clients.find((c) =>
      c.portfolioList?.some((p) => p.accountServices?.id === watchedClientId)
    );
    if (owner) setValue('clientId', owner.id);
  }, [clients, clientIds, watchedClientId, setValue]);

  const existingAccountServices = (existingVoucher as { accountServices?: { id?: string; serialised?: string } } | undefined)
    ?.accountServices;
  const clientOptions: SelectOption[] = useMemo(() => {
    const options = (clients || []).map((c) => ({ value: c.id, label: getClientDisplayName(c) }));
    if (watchedClientId && !clientIds.has(watchedClientId) && existingAccountServices?.id === watchedClientId) {
      options.unshift({
        value: watchedClientId,
        label: existingAccountServices.serialised || 'Current client account',
      });
    }
    return options;
  }, [clients, clientIds, watchedClientId, existingAccountServices]);

  // Added: Clear conditional fields when voucher type changes
  // Changed (SOUPFIN-154): run from the user's click rather than an effect, so
  // filling the form from a loaded voucher does not wipe its accounts.
  const handleVoucherTypeChange = useCallback((nextType: VoucherType) => {
    if (nextType === 'PAYMENT') {
      setValue('incomeAccountId', '');
    } else {
      setValue('expenseAccountId', '');
    }
  }, [setValue]);

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
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Added (SOUPFIN-162): Voucher.accountServices is the client FK on the
      // backend. Resolve it from the chosen client; a stored account (edit of an
      // existing voucher) is used as is.
      let accountServicesId: string | undefined;
      if (data.voucherTo === 'CLIENT' && data.clientId) {
        const client = (clients || []).find((c) => c.id === data.clientId);
        accountServicesId = client ? await resolveAccountServicesId(client) : data.clientId;
        if (!accountServicesId) {
          setError('clientId', {
            type: 'manual',
            message: 'This client has no account to pay into or receive from. Open the client and add one.',
          }, { shouldFocus: true });
          return;
        }
      }

      // Changed: Transform form data to API request format with correct backend field names
      const request: CreateVoucherRequest = {
        voucherType: data.voucherType as VoucherType,
        voucherTo: data.voucherTo as VoucherTo,
        transactionDate: data.transactionDate,
        amount: data.amount,
        notes: data.notes,
        reference: data.reference,
        beneficiaryName: data.beneficiaryName,
        // Changed (SOUPFIN-162): only the party the voucher is to/from is sent
        accountServicesId,
        vendorId: data.voucherTo === 'VENDOR' ? data.vendorId || undefined : undefined,
        staffId: data.voucherTo === 'STAFF' ? data.staffId || undefined : undefined,
        cashAccountId: data.cashAccountId,
        expenseAccountId: data.expenseAccountId || undefined,
        incomeAccountId: data.incomeAccountId || undefined,
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

      // Changed (SOUPFIN-154): vouchers are listed in the Transaction Register;
      // /accounting/vouchers used to render a fresh blank form here.
      navigate('/accounting/transactions');
    } catch (error) {
      // Added (SOUPFIN-158): a date in a closed period belongs on the date field
      const lock = getPeriodLockError(error);
      if (lock) {
        setError('transactionDate', { type: 'server', message: lock.message }, { shouldFocus: true });
        return;
      }
      // Changed (SOUPFIN-9): use parseApiError so 403 ("module disabled")
      // shows a useful message instead of raw axios "Request failed..." text.
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [navigate, isExisting, voucherId, setError, clients]);

  // Added: Wrapper for save draft action - explicitly typed for TypeScript
  const handleSaveDraft = handleSubmit(onSubmit);

  // Added: Wrapper for approve and post action
  // Note: Currently same as save draft - future enhancement will add post workflow
  const handleApproveAndPost = handleSubmit(onSubmit);

  // Fix (SOUPFIN-30 #16): display amounts in the tenant's configured currency
  // instead of a hardcoded USD, matching the MoneyInput prefix above.
  const formatCurrency = useFormatCurrency();

  // Added: Get dynamic label for beneficiary/payer based on voucher type
  const beneficiaryLabel = isPaymentType ? 'Beneficiary' : 'Payer';

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
          context="Bank/Cash, Expense, and Income account dropdowns are unavailable until the module is enabled."
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
            {/* Changed (SOUPFIN-162): selects backed by the client, vendor and
                staff lists, each with a "+" that opens the create page in a new
                tab and refreshes the list on return. They were free-text
                inputs whose text was posted as the FK id. */}
            {watchedVoucherTo === 'CLIENT' && (
              <div className="flex items-start gap-2">
                <Select
                  label={isPaymentType ? 'Client (Beneficiary)' : 'Client (Payer)'}
                  required
                  options={clientOptions}
                  placeholder={clientsLoading ? 'Loading clients' : 'Select client...'}
                  {...register('clientId')}
                  error={errors.clientId?.message}
                  helperText={!clientsLoading && clientOptions.length === 0 ? 'No clients yet. Use + to add one.' : undefined}
                  containerClassName="flex-1 min-w-0"
                  data-testid="voucher-client-select"
                />
                <div className="pt-7">
                  <AddEntityButton
                    to="/clients/new"
                    label="Add new client"
                    queryKey={['clients-for-voucher']}
                    testId="voucher-add-client-button"
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            )}
            {watchedVoucherTo === 'VENDOR' && (
              <div className="flex items-start gap-2">
                <Select
                  label={isPaymentType ? 'Vendor (Beneficiary)' : 'Vendor (Payer)'}
                  required
                  options={vendorOptions}
                  placeholder={vendorsLoading ? 'Loading vendors' : 'Select vendor...'}
                  {...register('vendorId')}
                  error={errors.vendorId?.message}
                  helperText={!vendorsLoading && vendorOptions.length === 0 ? 'No vendors yet. Use + to add one.' : undefined}
                  containerClassName="flex-1 min-w-0"
                  data-testid="voucher-vendor-select"
                />
                <div className="pt-7">
                  <AddEntityButton
                    to="/vendors/new"
                    label="Add new vendor"
                    queryKey={['vendors']}
                    testId="voucher-add-vendor-button"
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            )}
            {watchedVoucherTo === 'STAFF' && (
              <div className="flex items-start gap-2">
                <Select
                  label={isPaymentType ? 'Staff Member (Beneficiary)' : 'Staff Member (Payer)'}
                  required
                  options={staffOptions}
                  placeholder={staffLoading ? 'Loading staff' : 'Select staff member...'}
                  {...register('staffId')}
                  error={errors.staffId?.message}
                  helperText={!staffLoading && staffOptions.length === 0 ? 'No staff members yet. Use + to add one.' : undefined}
                  containerClassName="flex-1 min-w-0"
                  data-testid="voucher-staff-select"
                />
                <div className="pt-7">
                  <AddEntityButton
                    to="/settings/users/new"
                    label="Add new staff member"
                    queryKey={['agents-for-voucher']}
                    testId="voucher-add-staff-button"
                    disabled={isReadOnly}
                  />
                </div>
              </div>
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
      </fieldset>
    </div>
  );
}
