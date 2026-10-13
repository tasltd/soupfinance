/**
 * Vendor Form Page (Create/Edit)
 * PURPOSE: Create new vendor or edit existing vendor details
 * Reference: soupfinance-designs/new-invoice-form/ (form patterns)
 */
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVendor, createVendor, updateVendor } from '../../api';
import { Input, Textarea, Select, Checkbox } from '../../components/forms';
// Added (SOUPFIN-182): ledger account FK select, filtered to liability accounts
import { listAllLedgerAccounts, ledgerGroupMatches } from '../../api/endpoints/ledger';
import { VENDOR_TYPES, type LedgerAccount, type Vendor, type VendorType } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
// Added (SOUPFIN-160): module-aware lookup and save errors
import { getApiErrorMessage, parseApiError } from '../../api/errors';
import { ApiErrorState, ModuleDisabledBanner } from '../../components/feedback';

// Added: Zod validation schema for vendor form
// Constraints: name required, email format validation, payment terms must be positive
// Changed: paymentTerms uses union with nan transform to handle empty input (valueAsNumber returns NaN for empty)
const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(255, 'Name is too long'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phoneNumber: z.string().max(50, 'Phone number is too long').optional().or(z.literal('')),
  address: z.string().max(500, 'Address is too long').optional().or(z.literal('')),
  taxIdentificationNumber: z.string().max(50, 'TIN is too long').optional().or(z.literal('')),
  paymentTerms: z
    .number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .optional()
    .or(z.nan().transform(() => undefined)),
  notes: z.string().max(2000, 'Notes are too long').optional().or(z.literal('')),
  // Added (SOUPFIN-182): soupbroker.trading.Vendor fields the form did not render
  symbol: z.string().trim().max(255, 'Symbol is too long').optional().or(z.literal('')),
  vendorType: z.enum(VENDOR_TYPES).optional().or(z.literal('')),
  postalAddress: z.string().max(500, 'Postal address is too long').optional().or(z.literal('')),
  ledgerAccountId: z.string().optional().or(z.literal('')),
  archived: z.boolean().optional(),
});

// Added: Type inference from schema for form values
type VendorFormData = z.infer<typeof vendorSchema>;

// Added (SOUPFIN-182): general-purpose types first — SoupFinance tenants are
// SERVICES businesses, so the brokerage-specific types are the rarer choice.
const GENERAL_VENDOR_TYPES: VendorType[] = ['SUPPLIER', 'SERVICE_PROVIDER', 'CONTRACTOR', 'CONSULTANT', 'OTHER'];

function vendorTypeLabel(type: string): string {
  const words = type.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const VENDOR_TYPE_OPTIONS = [
  { value: '', label: 'Not classified' },
  ...GENERAL_VENDOR_TYPES.map((type) => ({ value: type, label: vendorTypeLabel(type) })),
  ...VENDOR_TYPES.filter((type) => !GENERAL_VENDOR_TYPES.includes(type)).map((type) => ({
    value: type,
    label: vendorTypeLabel(type),
  })),
];

// Added (SOUPFIN-182): the generic GSON template flattens enums to their name,
// but an {enumType, name} map has leaked through on other domains. Anything not
// in the enum reads as "Not classified" rather than an option the Select lacks.
function readVendorType(raw: unknown): VendorType | undefined {
  const name = typeof raw === 'string' ? raw : (raw as { name?: unknown } | null)?.name;
  return VENDOR_TYPES.find((type) => type === name);
}

/**
 * Added (SOUPFIN-182): can a vendor's payables post to this account?
 * Liability accounts only, minus the per-client fund accounts the backend
 * generates under SHORT -TERM LIABILITIES (one per client portfolio: 1,006 of
 * 1,082 liability accounts on the LXC dev tenant). Hidden accounts are skipped
 * as everywhere else. The tenant's generated "Payable Account" (OTHER
 * LIABILITIES) stays in.
 */
function isVendorPayableAccount(account: LedgerAccount): boolean {
  if (!ledgerGroupMatches(account.ledgerGroup, 'LIABILITY') || account.hiddenAccount) return false;
  const category = account.ledgerAccountCategory?.name || account.ledgerAccountCategory?.serialised || '';
  const isClientFundAccount = !!account.systemAccount && /short\s*-?\s*term\s+liabilit/i.test(category);
  return !isClientFundAccount;
}

function ledgerAccountLabel(account: LedgerAccount): string {
  // `code` falls back to the random quickReference; only a real number helps here
  return account.number ? `${account.number} - ${account.name}` : account.name;
}

/**
 * Added (SOUPFIN-182): one payload builder for create and update.
 * Create omits empty fields. Update sends null for a cleared field, because an
 * omitted field is left unchanged by Grails binding and the user could never
 * clear a value once saved. Leaving the ledger account empty on create lets
 * VendorService.doSave generate "{name} Account" as before.
 */
function toVendorPayload(data: VendorFormData, isEdit: boolean): Partial<Vendor> {
  const cleared = isEdit ? null : undefined;
  const text = (value?: string) => (value && value.trim() ? value : cleared) as string | undefined;
  const payload: Partial<Vendor> = {
    name: data.name,
    symbol: text(data.symbol?.trim()),
    vendorType: (data.vendorType || cleared) as VendorType | undefined,
    email: text(data.email),
    phoneNumber: text(data.phoneNumber),
    address: text(data.address),
    postalAddress: text(data.postalAddress),
    taxIdentificationNumber: text(data.taxIdentificationNumber),
    paymentTerms: (data.paymentTerms ?? cleared) as number | undefined,
    notes: text(data.notes),
    ledgerAccount: data.ledgerAccountId ? { id: data.ledgerAccountId } : cleared,
  };
  if (isEdit) payload.archived = !!data.archived;
  return payload;
}

export function VendorFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Added: React Hook Form setup with Zod resolver
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      address: '',
      taxIdentificationNumber: '',
      paymentTerms: undefined,
      notes: '',
      symbol: '',
      vendorType: '',
      postalAddress: '',
      ledgerAccountId: '',
      archived: false,
    },
  });

  // Added: Query to fetch vendor data for edit mode
  const { data: vendor, isLoading: isLoadingVendor, error: vendorError, refetch: refetchVendor } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id!),
    enabled: isEdit, // Only fetch when editing
  });

  // Added (SOUPFIN-160): the vendor lookup came back "module not enabled". The
  // form stays visible under a banner, but saving is blocked: it would 403 too.
  const isModuleBlocked = !!vendorError && parseApiError(vendorError).kind === 'module_disabled';

  // Added (SOUPFIN-182): liability accounts for the payables link. Fetches every
  // page (index.json defaults to 10 rows). Ledger is a separate module, so a 403
  // here only empties the select — the vendor itself can still be saved.
  const {
    data: liabilityAccounts,
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useQuery({
    queryKey: ['ledger-accounts', 'all', 'vendor-payable'],
    queryFn: async () =>
      (await listAllLedgerAccounts())
        .filter(isVendorPayableAccount)
        .sort((a, b) => ledgerAccountLabel(a).localeCompare(ledgerAccountLabel(b))),
    staleTime: 5 * 60 * 1000,
  });

  // Added (SOUPFIN-182): a vendor saved without a choice is linked to the
  // generated expense account "{name} Account". Keep whatever is linked now as
  // an option, or the select would show "none" and an update would unlink it.
  const ledgerAccountOptions = useMemo(() => {
    const options = [
      { value: '', label: isEdit ? 'No ledger account' : 'Create one automatically' },
      ...(liabilityAccounts ?? []).map((account) => ({ value: account.id, label: ledgerAccountLabel(account) })),
    ];
    const linked = vendor?.ledgerAccount;
    if (linked?.id && !options.some((option) => option.value === linked.id)) {
      // serialised is "<name>[ <category path> ] - <currency>"; the name is enough here
      const name = linked.name || linked.serialised?.split('[')[0].trim() || linked.id;
      options.push({ value: linked.id, label: `${name} (currently linked)` });
    }
    return options;
  }, [liabilityAccounts, vendor, isEdit]);

  const ledgerAccountHelper = accountsError
    ? `Ledger accounts could not be loaded: ${getApiErrorMessage(accountsError)}`
    : isLoadingAccounts
      ? 'Loading ledger accounts...'
      : liabilityAccounts && liabilityAccounts.length === 0
        ? 'No liability accounts in the chart of accounts yet.'
        : isEdit
          ? 'Liability account that bills from this vendor post to'
          : 'Liability account that bills from this vendor post to. Leave empty to create one.';

  // Added: Populate form when vendor data is loaded
  useEffect(() => {
    if (vendor) {
      reset({
        name: vendor.name || '',
        email: vendor.email || '',
        phoneNumber: vendor.phoneNumber || '',
        address: vendor.address || '',
        taxIdentificationNumber: vendor.taxIdentificationNumber || '',
        paymentTerms: vendor.paymentTerms ?? undefined,
        notes: vendor.notes || '',
        // Added (SOUPFIN-182)
        symbol: vendor.symbol || '',
        vendorType: readVendorType(vendor.vendorType) ?? '',
        postalAddress: vendor.postalAddress || '',
        ledgerAccountId: vendor.ledgerAccount?.id || '',
        archived: !!vendor.archived,
      });
    }
  }, [vendor, reset]);

  // Added: Create mutation
  const createMutation = useMutation({
    // Changed (SOUPFIN-182): shared payload builder covers the new fields
    mutationFn: (data: VendorFormData) => createVendor(toVendorPayload(data, false)),
    onSuccess: (newVendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      navigate(`/vendors/${newVendor.id}`);
    },
  });

  // Added: Update mutation
  const updateMutation = useMutation({
    // Changed (SOUPFIN-182): shared payload builder covers the new fields
    mutationFn: (data: VendorFormData) => updateVendor(id!, toVendorPayload(data, true)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor', id] });
      navigate(`/vendors/${id}`);
    },
  });

  // Added: Form submission handler
  const onSubmit = (data: VendorFormData) => {
    // Added (SOUPFIN-160): Enter in a field must not bypass the disabled button
    if (isModuleBlocked) return;
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Added: Loading state for edit mode
  if (isEdit && isLoadingVendor) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-form-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading vendor...
        </div>
      </div>
    );
  }

  // Added (SOUPFIN-160): any other failed edit-mode load (no permission,
  // server fault, missing vendor) replaces the form, as on BillFormPage.
  if (isEdit && vendorError && !isModuleBlocked) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-form-page">
        <ApiErrorState error={vendorError} onRetry={() => refetchVendor()} testId="vendor-form-load-error" />
        <button
          onClick={() => navigate('/vendors')}
          className="self-center inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm"
          data-testid="vendor-form-back-button"
        >
          Back to Vendors
        </button>
      </div>
    );
  }

  // Added: Determine mutation state for button text
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error || updateMutation.error;

  return (
    <div className="flex flex-col gap-6" data-testid="vendor-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="vendor-form-heading"
          >
            {isEdit ? 'Edit Vendor' : 'New Vendor'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update vendor information' : 'Add a new vendor to your system'}
          </p>
          <HelpLink section="vendors" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/vendors')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="vendor-form-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || isSubmitting || isModuleBlocked}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="vendor-form-save"
          >
            {isSaving ? 'Saving...' : isEdit ? 'Update Vendor' : 'Create Vendor'}
          </button>
        </div>
      </div>

      {/* Added (SOUPFIN-160): explain why the vendor could not be loaded */}
      {isModuleBlocked && (
        <ModuleDisabledBanner
          error={vendorError}
          context="Vendors cannot be saved until the module is enabled."
          testId="vendor-form-module-disabled"
        />
      )}

      {/* Error Banner */}
      {mutationError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-3"
          data-testid="vendor-form-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          <div>
            <p className="font-medium">Failed to save vendor</p>
            <p className="text-sm opacity-80">
              {/* Changed (SOUPFIN-160): never "Request failed with status code 403" */}
              {getApiErrorMessage(mutationError)}
            </p>
          </div>
        </div>
      )}

      {/* Form Container */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark"
        data-testid="vendor-form-container"
      >
        {/* Basic Information Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Vendor Name"
              placeholder="Enter vendor name"
              required
              error={errors.name?.message}
              {...register('name')}
              data-testid="vendor-form-name"
            />
            <Input
              label="Email"
              type="email"
              placeholder="vendor@example.com"
              error={errors.email?.message}
              {...register('email')}
              data-testid="vendor-form-email"
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+1 (555) 123-4567"
              error={errors.phoneNumber?.message}
              {...register('phoneNumber')}
              data-testid="vendor-form-phone"
            />
            <Input
              label="Tax Identification Number"
              placeholder="Enter TIN"
              helperText="Tax ID for reporting purposes"
              error={errors.taxIdentificationNumber?.message}
              {...register('taxIdentificationNumber')}
              data-testid="vendor-form-tin"
            />
            {/* Added (SOUPFIN-182) */}
            <Input
              label="Symbol"
              placeholder="e.g. ACME"
              helperText="Short code used in lookups. Must be unique."
              error={errors.symbol?.message}
              {...register('symbol')}
              data-testid="vendor-form-symbol"
            />
            <Select
              label="Vendor Type"
              options={VENDOR_TYPE_OPTIONS}
              error={errors.vendorType?.message}
              {...register('vendorType')}
              data-testid="vendor-form-vendor-type"
            />
          </div>
        </div>

        {/* Payment Terms Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">Payment Terms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Payment Terms (Days)"
              type="number"
              placeholder="30"
              min={0}
              max={365}
              helperText="Number of days until payment is due (e.g., Net 30)"
              error={errors.paymentTerms?.message}
              {...register('paymentTerms', { valueAsNumber: true })}
              data-testid="vendor-form-payment-terms"
            />
            {/* Added (SOUPFIN-182): payables ledger account FK */}
            <Select
              label="Ledger Account"
              options={ledgerAccountOptions}
              helperText={ledgerAccountHelper}
              disabled={isLoadingAccounts}
              {...register('ledgerAccountId')}
              data-testid="vendor-form-ledger-account"
            />
          </div>
        </div>

        {/* Address Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">Address</h2>
          <Textarea
            label="Address"
            placeholder="Enter vendor's full address"
            rows={3}
            error={errors.address?.message}
            {...register('address')}
            data-testid="vendor-form-address"
          />
          {/* Added (SOUPFIN-182): Vendor.postalAddress is a separate column */}
          <Textarea
            label="Postal Address"
            placeholder="P.O. Box or mailing address, if different"
            rows={2}
            containerClassName="mt-6"
            error={errors.postalAddress?.message}
            {...register('postalAddress')}
            data-testid="vendor-form-postal-address"
          />
        </div>

        {/* Notes Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Additional Notes
          </h2>
          <Textarea
            label="Notes"
            placeholder="Add any additional notes about this vendor..."
            rows={4}
            error={errors.notes?.message}
            {...register('notes')}
            data-testid="vendor-form-notes"
          />
        </div>

        {/* Added (SOUPFIN-182): soft-delete toggle; a new vendor is always active */}
        {isEdit && (
          <div className="p-6 border-t border-border-light dark:border-border-dark" data-testid="vendor-form-status-section">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Status</h2>
            <Checkbox
              label="Archive this vendor"
              {...register('archived')}
              data-testid="vendor-form-archived"
            />
            <p className="text-sm text-subtle-text mt-2">
              Archived vendors move to the Archived tab of the vendor list. Their bills are kept.
            </p>
          </div>
        )}
      </form>

      {/* Bottom Action Buttons (mobile-friendly) */}
      <div className="flex justify-end gap-3 md:hidden">
        <button
          onClick={() => navigate('/vendors')}
          className="flex-1 h-12 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="vendor-form-cancel-mobile"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={isSaving || isSubmitting || isModuleBlocked}
          className="flex-1 h-12 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="vendor-form-save-mobile"
        >
          {isSaving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}
