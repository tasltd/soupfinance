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
import {
  createVoucher,
  getVoucher,
  updateVoucher,
  ledgerGroupMatches,
  // Added (SOUPFIN-156): lifecycle actions and the bank/cash account balance
  approveVoucher,
  postVoucher,
  rejectVoucher,
  deleteVoucher,
  getAccountBalance,
} from '../../api/endpoints/ledger';
// Added (SOUPFIN-154): prefill the form when opening an existing voucher
import { voucherToFormValues } from './voucherFormValues';
// Added (SOUPFIN-156): one lifecycle status and the status -> actions matrix
import {
  voucherLifecycleStatus,
  voucherActions,
  VOUCHER_STATUS_LABELS,
  type VoucherAction,
  type VoucherLifecycleStatus,
} from './voucherLifecycle';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
// Added (SOUPFIN-9): module-disabled banner + user-friendly submit errors
import { ModuleDisabledBanner } from '../../components/feedback';
import { getApiErrorMessage } from '../../api/errors';
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

// Added (SOUPFIN-156): status badge colours, per design-system status badges
const STATUS_BADGE_CLASSES: Record<VoucherLifecycleStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  POSTED: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
};

// Added (SOUPFIN-156): the lifecycle buttons, in the order they show. Edit is
// a link and is rendered separately; voucherActions() decides which appear.
const LIFECYCLE_BUTTONS: Array<{
  action: VoucherAction;
  label: string;
  icon: string;
  testId: string;
  className: string;
}> = [
  { action: 'approve', label: 'Approve', icon: 'task_alt', testId: 'approve',
    className: 'bg-primary/20 text-primary hover:bg-primary/30' },
  { action: 'approveAndPost', label: 'Approve & Post', icon: 'done_all', testId: 'approve-post',
    className: 'bg-primary text-white hover:bg-primary/90' },
  { action: 'post', label: 'Post to Ledger', icon: 'check_circle', testId: 'post',
    className: 'bg-primary text-white hover:bg-primary/90' },
  { action: 'reject', label: 'Reject', icon: 'cancel', testId: 'reject',
    className: 'border border-danger text-danger hover:bg-danger/10' },
  { action: 'delete', label: 'Delete', icon: 'delete', testId: 'delete',
    className: 'border border-danger text-danger hover:bg-danger/10' },
];

// Added (SOUPFIN-156): wording for the confirmation dialog of each action
const CONFIRM_COPY: Partial<Record<VoucherAction, { title: string; body: (label: string) => string; confirm: string; danger: boolean }>> = {
  approveAndPost: {
    title: 'Approve and post this voucher?',
    body: (label) => `${label} will be approved and posted to the ledger. A posted voucher cannot be edited, rejected or reversed.`,
    confirm: 'Approve & Post',
    danger: false,
  },
  post: {
    title: 'Post this voucher to the ledger?',
    body: (label) => `${label} will be posted to the ledger. A posted voucher cannot be edited, rejected or reversed.`,
    confirm: 'Post to Ledger',
    danger: false,
  },
  reject: {
    title: 'Reject this voucher?',
    body: (label) => `${label} will be marked rejected and can no longer be posted.`,
    confirm: 'Reject',
    danger: true,
  },
  delete: {
    title: 'Delete this voucher?',
    body: (label) => `${label} will be deleted. This cannot be undone.`,
    confirm: 'Delete',
    danger: true,
  },
};

/**
 * Added (SOUPFIN-156): confirmation dialog for an irreversible voucher action.
 * Layout follows soupfinance-designs/modal-delete-confirmation/.
 */
function ConfirmActionDialog({
  action,
  voucherLabel,
  onCancel,
  onConfirm,
}: {
  action: VoucherAction;
  voucherLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = CONFIRM_COPY[action];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  if (!copy) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" data-testid="voucher-confirm-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voucher-confirm-title"
        className="relative w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden"
        data-testid="voucher-confirm-dialog"
      >
        <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
          <p id="voucher-confirm-title" className="text-xl font-bold text-text-light dark:text-text-dark">
            {copy.title}
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-text-light dark:text-text-dark"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>
        <div className="p-6">
          <p className="text-text-light dark:text-text-dark">{copy.body(voucherLabel)}</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg ring-1 ring-border-light dark:ring-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/5"
            data-testid="voucher-confirm-cancel"
          >
            Keep voucher as is
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`h-10 px-4 rounded-lg text-white font-bold text-sm ${copy.danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'}`}
            data-testid="voucher-confirm-submit"
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Added (SOUPFIN-156): approval timeline, following
 * soupfinance-designs/invoice-approval-workflow/. Created -> Approved -> Posted,
 * with Rejected in place of Approved when the voucher was rejected.
 */
type StepState = 'done' | 'current' | 'todo' | 'failed';

function VoucherTimeline({ status, createdAt }: { status: VoucherLifecycleStatus; createdAt?: string }) {
  const stopped = status === 'REJECTED' || status === 'CANCELLED';
  const approved = status === 'APPROVED' || status === 'POSTED';
  const steps: Array<{ key: string; title: string; detail: string; state: StepState }> = [
    {
      key: 'created',
      title: 'Created',
      detail: createdAt ? `Recorded on ${createdAt.slice(0, 10)}` : 'Recorded',
      state: 'done',
    },
    stopped
      ? { key: 'approval', title: VOUCHER_STATUS_LABELS[status], detail: 'Will not be posted to the ledger', state: 'failed' }
      : {
          key: 'approval',
          title: 'Approved',
          detail: approved ? 'Approved for posting' : 'Waiting for approval',
          state: approved ? 'done' : 'current',
        },
    {
      key: 'posted',
      title: 'Posted to Ledger',
      detail: status === 'POSTED' ? 'Entries are in the general ledger' : stopped ? 'Not posted' : 'Not posted yet',
      state: status === 'POSTED' ? 'done' : status === 'APPROVED' ? 'current' : 'todo',
    },
  ];
  const icon: Record<StepState, { name: string; className: string }> = {
    done: { name: 'task_alt', className: 'text-green-500' },
    current: { name: 'hourglass_top', className: 'text-orange-500 animate-pulse' },
    todo: { name: 'radio_button_unchecked', className: 'text-gray-400' },
    failed: { name: 'cancel', className: 'text-danger' },
  };
  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid="voucher-timeline"
    >
      <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
        <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Approval Workflow</h2>
      </div>
      <ol className="p-6 grid grid-cols-[32px_1fr] gap-x-2">
        {steps.map((step, i) => (
          <li key={step.key} className="contents" data-testid={`voucher-timeline-${step.key}`} data-state={step.state}>
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <span className={`material-symbols-outlined ${icon[step.state].className}`} aria-hidden="true">
                {icon[step.state].name}
              </span>
              {i < steps.length - 1 && <div className="w-[2px] bg-gray-200 dark:bg-gray-700 h-full grow" />}
            </div>
            <div className={`flex flex-col ${i < steps.length - 1 ? 'pb-6' : ''}`}>
              <p
                className={`text-base ${
                  step.state === 'current'
                    ? 'font-bold text-orange-500'
                    : step.state === 'failed'
                      ? 'font-bold text-danger'
                      : step.state === 'todo'
                        ? 'font-medium text-subtle-text'
                        : 'font-medium text-text-light dark:text-text-dark'
                }`}
              >
                {step.title}
              </p>
              <p className="text-sm text-subtle-text">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

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

  // Changed (SOUPFIN-156): only a PENDING voucher is editable. The backend
  // refuses a non-admin update once a voucher is approved, so an approved,
  // posted or rejected voucher opens read-only even on the /edit URL.
  const lifecycleStatus = voucherLifecycleStatus(existingVoucher);
  const availableActions = existingVoucher ? voucherActions(lifecycleStatus) : [];
  const canEditVoucher = !existingVoucher || availableActions.includes('edit');
  const isReadOnly = isExisting && (!isEditRoute || !canEditVoucher);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Added (SOUPFIN-156): lifecycle action state. confirmAction holds an
  // action waiting for the user to confirm it in the dialog.
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<VoucherAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<VoucherAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Changed (SOUPFIN-9): expose the accounts query error so we can render a
  // ModuleDisabledBanner when the Accounting/Ledger module is not enabled.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: accounts, isLoading: _accountsLoading, error: accountsError } = useLedgerAccounts();

  // Added: Fetch payment methods from backend (domain class, not enum)
  const { data: paymentMethods } = usePaymentMethods();

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
      // Changed (SOUPFIN-156): the status now has its own badge
      return existingVoucher?.voucherNumber || 'Voucher details';
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
      // Changed: Transform form data to API request format with correct backend field names
      const request: CreateVoucherRequest = {
        voucherType: data.voucherType as VoucherType,
        voucherTo: data.voucherTo as VoucherTo,
        transactionDate: data.transactionDate,
        amount: data.amount,
        notes: data.notes,
        reference: data.reference,
        beneficiaryName: data.beneficiaryName,
        clientId: data.clientId || undefined,
        vendorId: data.vendorId || undefined,
        staffId: data.staffId || undefined,
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
      // Changed (SOUPFIN-9): use parseApiError so 403 ("module disabled")
      // shows a useful message instead of raw axios "Request failed..." text.
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [navigate, isExisting, voucherId]);

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

  // Added (SOUPFIN-156): balance of the selected bank/cash account, so the
  // user sees whether a payment would overdraw it.
  const watchedCashAccountId = watch('cashAccountId');
  const {
    data: cashBalance,
    isLoading: isLoadingCashBalance,
    error: cashBalanceError,
  } = useQuery({
    queryKey: ['ledgerAccountBalance', watchedCashAccountId],
    queryFn: () => getAccountBalance(watchedCashAccountId),
    enabled: !!watchedCashAccountId && !accountsError,
  });

  // Added (SOUPFIN-156): run a lifecycle action against the backend, then
  // reload the voucher so the badge, timeline and action bar follow it.
  const runVoucherAction = useCallback(async (action: VoucherAction) => {
    if (!voucherId) return;
    setConfirmAction(null);
    setPendingAction(action);
    setActionError(null);
    setActionMessage(null);
    try {
      switch (action) {
        case 'approve':
          await approveVoucher(voucherId);
          setActionMessage('Voucher approved. It can now be posted to the ledger.');
          break;
        case 'approveAndPost':
          // doPost refuses a voucher that is not APPROVED, so approve first.
          await approveVoucher(voucherId);
          await postVoucher(voucherId);
          setActionMessage('Voucher approved and posted to the ledger.');
          break;
        case 'post':
          await postVoucher(voucherId);
          setActionMessage('Voucher posted to the ledger.');
          break;
        case 'reject':
          await rejectVoucher(voucherId);
          setActionMessage('Voucher rejected. It will not be posted.');
          break;
        case 'delete':
          await deleteVoucher(voucherId);
          await queryClient.invalidateQueries({ queryKey: ['transactions'] });
          navigate('/accounting/transactions');
          return;
        default:
          return;
      }
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
    // Refetch even after a failure: an approve that succeeded before a failed
    // post has still moved the voucher on.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['voucher', voucherId] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['ledgerAccountBalance'] }),
    ]);
  }, [voucherId, queryClient, navigate]);

  // Added (SOUPFIN-156): Approve runs straight away; the others change the
  // ledger or remove the voucher for good, so they ask first.
  const requestVoucherAction = useCallback((action: VoucherAction) => {
    if (action === 'approve') {
      void runVoucherAction(action);
    } else {
      setConfirmAction(action);
    }
  }, [runVoucherAction]);

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
          {/* Changed (SOUPFIN-156): an existing voucher shows its status badge */}
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
              data-testid="voucher-form-heading"
            >
              {pageTitle}
            </h1>
            {isExisting && existingVoucher && (
              <span
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE_CLASSES[lifecycleStatus]}`}
                data-testid="voucher-status-badge"
              >
                {VOUCHER_STATUS_LABELS[lifecycleStatus]}
              </span>
            )}
          </div>
          <p className="text-subtle-text">
            {pageSubtitle}
          </p>
          <HelpLink section="vouchers" className="mt-1 self-start" />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3" data-testid="voucher-action-bar">
          <button
            type="button"
            onClick={() => navigate('/accounting/transactions')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="voucher-form-cancel-button"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {/* Added (SOUPFIN-154): an editable voucher shown read-only offers Edit */}
          {isReadOnly && availableActions.includes('edit') && (
            <Link
              to={`/accounting/vouchers/${voucherId}/edit`}
              className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30 flex items-center gap-2"
              data-testid="voucher-form-edit-button"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              Edit
            </Link>
          )}
          {/* Added (SOUPFIN-156): lifecycle actions for the voucher's status */}
          {isReadOnly && LIFECYCLE_BUTTONS.filter((b) => availableActions.includes(b.action)).map((b) => (
            <button
              key={b.action}
              type="button"
              onClick={() => requestVoucherAction(b.action)}
              disabled={pendingAction !== null}
              className={`h-10 px-4 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${b.className}`}
              data-testid={`voucher-action-${b.testId}`}
            >
              <span
                className={`material-symbols-outlined text-base ${pendingAction === b.action ? 'animate-spin' : ''}`}
              >
                {pendingAction === b.action ? 'progress_activity' : b.icon}
              </span>
              {b.label}
            </button>
          ))}
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
          {`This voucher is ${VOUCHER_STATUS_LABELS[lifecycleStatus].toLowerCase()}, so it can no longer be edited.`}
        </div>
      )}

      {/* Added (SOUPFIN-156): result of the last lifecycle action */}
      {actionMessage && (
        <div
          className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm flex items-center gap-2"
          role="status"
          data-testid="voucher-action-message"
        >
          <span className="material-symbols-outlined text-xl">check_circle</span>
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2"
          role="alert"
          data-testid="voucher-action-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          {actionError}
        </div>
      )}

      {/* Added (SOUPFIN-156): where the voucher is in its approval workflow */}
      {isExisting && existingVoucher && (
        <VoucherTimeline status={lifecycleStatus} createdAt={existingVoucher.dateCreated} />
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
            <div className="flex flex-col gap-2">
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
              {/* Added (SOUPFIN-156): the selected account's current balance */}
              {watchedCashAccountId && (
                <p className="text-sm text-subtle-text" data-testid="voucher-cash-account-balance">
                  {isLoadingCashBalance
                    ? 'Loading balance'
                    : cashBalanceError
                      ? 'Balance unavailable'
                      : <>Current balance: <span className="font-bold text-text-light dark:text-text-dark">{formatCurrency(Number(cashBalance?.balance ?? 0))}</span></>}
                </p>
              )}
            </div>

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

      {/* Added (SOUPFIN-156): confirm an action that cannot be undone */}
      {confirmAction && (
        <ConfirmActionDialog
          action={confirmAction}
          voucherLabel={existingVoucher?.voucherNumber || 'this voucher'}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runVoucherAction(confirmAction)}
        />
      )}
    </div>
  );
}
