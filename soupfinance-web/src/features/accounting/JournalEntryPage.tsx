/**
 * Journal Entry Page
 * Multi-line journal entry form for recording accounting transactions (debits and credits)
 * Reference: soupfinance-designs/general-ledger-entries/, design-system.md
 *
 * Changed: Now fetches ledger accounts from API via useLedgerAccounts hook
 * Changed: Added edit mode - loads existing LedgerTransactionGroup when :id param present
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Input } from '../../components/forms/Input';
import { Select, type SelectOption } from '../../components/forms/Select';
import { DatePicker } from '../../components/forms/DatePicker';
import { Textarea } from '../../components/forms/Textarea';
// Added (SOUPFIN-30 #16): currency-aware amount input that rejects letters
import { MoneyInput } from '../../components/forms/MoneyInput';
import { createJournalEntry, getTransactionGroup, updateJournalEntry } from '../../api/endpoints/ledger';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
// Added (SOUPFIN-30 #16): tenant-currency formatter for the debit/credit totals.
import { useFormatCurrency } from '../../stores';
// Added (SOUPFIN-9): explain disabled module + parse submit errors
import { ModuleDisabledBanner } from '../../components/feedback';
import { getApiErrorMessage } from '../../api/errors';
import type { CreateJournalEntryRequest } from '../../types';

// Added: Zod schema for journal entry line item validation
// Fix: Using number().default(0) instead of coerce.number() for proper TypeScript inference
const journalLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  accountName: z.string().optional(),
  debitAmount: z.number().min(0, 'Cannot be negative').default(0),
  creditAmount: z.number().min(0, 'Cannot be negative').default(0),
  description: z.string().optional(),
});

// Added: Zod schema for the entire journal entry form
// Validates that total debits equal total credits
const journalEntrySchema = z.object({
  entryDate: z.string().min(1, 'Entry date is required'),
  reference: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  lines: z.array(journalLineSchema)
    .min(2, 'At least 2 lines are required')
    .refine(
      (lines) => {
        // Added: Each line must have either a debit OR credit amount (not both, not neither)
        return lines.every(line =>
          (line.debitAmount > 0 && line.creditAmount === 0) ||
          (line.creditAmount > 0 && line.debitAmount === 0)
        );
      },
      { message: 'Each line must have either a debit or credit amount (not both)' }
    )
    .refine(
      (lines) => {
        // Added: Total debits must equal total credits for balanced entry
        const totalDebit = lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
        return Math.abs(totalDebit - totalCredit) < 0.01; // Allow small floating point difference
      },
      { message: 'Total debits must equal total credits' }
    ),
});

// Added: Type inference from schema
type JournalEntryFormData = z.infer<typeof journalEntrySchema>;

// Added: Empty line template for adding new rows
const createEmptyLine = () => ({
  accountId: '',
  accountName: '',
  debitAmount: 0,
  creditAmount: 0,
  description: '',
});

/**
 * JournalEntryPage - Multi-line journal entry form for double-entry bookkeeping
 * Features:
 * - Dynamic line items with account selection
 * - Real-time debit/credit balance validation
 * - Save as draft or post immediately
 * - Edit mode: loads existing LedgerTransactionGroup when :id param is present
 * - Read-only mode for posted/reversed entries
 */
export function JournalEntryPage() {
  const navigate = useNavigate();
  const { id: entryId } = useParams<{ id: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Added: Determine if we're in edit mode (entryId present and not 'new')
  const isEditMode = !!entryId && entryId !== 'new';

  // Added: Fetch existing transaction group when editing
  const { data: existingGroup, isLoading: isLoadingGroup } = useQuery({
    queryKey: ['transaction-group', entryId],
    queryFn: () => getTransactionGroup(entryId!),
    enabled: isEditMode,
    staleTime: 5 * 60 * 1000,
  });

  // Added: Determine if entry is read-only (posted or reversed entries cannot be edited)
  const isReadOnly = isEditMode && !!existingGroup && (existingGroup.status === 'POSTED' || existingGroup.status === 'REVERSED');

  // Changed (SOUPFIN-9): expose the accounts query error so we can render a
  // ModuleDisabledBanner when the Ledger module is not enabled for the tenant.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: accounts, isLoading: _accountsLoading, error: accountsError } = useLedgerAccounts();

  // Fix (SOUPFIN-30 #16): totals follow the tenant currency, not a hardcoded USD.
  const formatCurrency = useFormatCurrency();

  // Added: Convert accounts to select options format
  const accountOptions: SelectOption[] = useMemo(() =>
    (accounts || []).map(account => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    })),
    [accounts]
  );

  // Added: Initialize form with react-hook-form and Zod validation
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JournalEntryFormData>({
    resolver: zodResolver(journalEntrySchema) as never,
    defaultValues: {
      entryDate: format(new Date(), 'yyyy-MM-dd'),
      reference: '',
      description: '',
      // Added: Start with 2 empty lines as minimum for double-entry
      lines: [createEmptyLine(), createEmptyLine()],
    },
  });

  // Added: Populate form when existing transaction group data loads (edit mode)
  useEffect(() => {
    if (existingGroup && isEditMode) {
      const lines = existingGroup.ledgerTransactionList.map((tx) => ({
        accountId: tx.ledgerAccount?.id || tx.debitLedgerAccount?.id || tx.creditLedgerAccount?.id || '',
        accountName: tx.ledgerAccount?.name || tx.debitLedgerAccount?.name || tx.creditLedgerAccount?.name || '',
        debitAmount: tx.transactionState === 'DEBIT' ? tx.amount : 0,
        creditAmount: tx.transactionState === 'CREDIT' ? tx.amount : 0,
        description: tx.description || '',
      }));

      // Ensure at least 2 lines for the form
      while (lines.length < 2) {
        lines.push(createEmptyLine());
      }

      reset({
        entryDate: existingGroup.groupDate || format(new Date(), 'yyyy-MM-dd'),
        reference: existingGroup.reference || '',
        description: existingGroup.description || '',
        lines,
      });
    }
  }, [existingGroup, isEditMode, reset]);

  // Added: useFieldArray for dynamic line item management
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  // Added: Watch all lines to calculate totals in real-time
  //
  // Fix (SOUPFIN-30 #16): this used `watch('lines')`, which reads straight out
  // of react-hook-form's internal `_formValues`. That array is mutated in place,
  // so its *reference* never changes — the `useMemo` below therefore never
  // re-ran and "Total Debits"/"Total Credits" stayed frozen at 0.00 no matter
  // what was typed, which also left the Balanced indicator lying. `useWatch`
  // returns a fresh value per update, so the memo invalidates correctly.
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];

  // Added: Calculate totals from watched line values
  const { totalDebit, totalCredit, isBalanced, difference } = useMemo(() => {
    const debit = watchedLines.reduce((sum, line) => sum + (Number(line.debitAmount) || 0), 0);
    const credit = watchedLines.reduce((sum, line) => sum + (Number(line.creditAmount) || 0), 0);
    const diff = Math.abs(debit - credit);
    return {
      totalDebit: debit,
      totalCredit: credit,
      isBalanced: diff < 0.01,
      difference: diff,
    };
  }, [watchedLines]);

  // Added: Handler to add a new line item
  const handleAddLine = useCallback(() => {
    append(createEmptyLine());
  }, [append]);

  // Added: Handler to remove a line item (prevent removal if only 2 lines remain)
  const handleRemoveLine = useCallback((index: number) => {
    if (fields.length > 2) {
      remove(index);
    }
  }, [fields.length, remove]);

  // Changed: Form submission handler supports both create and update modes
  const onSubmit = async (data: JournalEntryFormData) => {
    if (isReadOnly) return; // Prevent submission of posted/reversed entries

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Added: Transform form data to API request format
      const request: CreateJournalEntryRequest = {
        entryDate: data.entryDate,
        description: data.description,
        reference: data.reference,
        lines: data.lines.map(line => ({
          accountId: line.accountId,
          debitAmount: line.debitAmount || 0,
          creditAmount: line.creditAmount || 0,
          description: line.description,
        })),
      };

      // Changed: Call update when editing, create when new
      if (isEditMode && entryId) {
        await updateJournalEntry(entryId, request);
      } else {
        await createJournalEntry(request);
      }

      // Added: Navigate back to ledger transactions after successful save
      navigate('/ledger/transactions');
    } catch (error) {
      // Changed (SOUPFIN-9): use parseApiError so 403 ("module disabled")
      // shows a useful message instead of raw axios "Request failed..." text.
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Added: Wrapper for save draft - currently same as save, can be extended for draft status
  const handleSaveDraft = handleSubmit(onSubmit);

  // Added: Wrapper for save and post - currently same as save, can be extended for posted status
  const handleSaveAndPost = handleSubmit(onSubmit);

  // Fix (SOUPFIN-30 #16): the totals were hardcoded to USD, so a GHS tenant saw
  // "$0.00" underneath fields prefixed with GH₵. Use the tenant's configured
  // currency, the same source the amount fields read.

  // Added: Show loading state while fetching existing entry data
  if (isEditMode && isLoadingGroup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="journal-entry-page">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        <p className="text-subtle-text">Loading journal entry...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="journal-entry-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="journal-entry-heading"
          >
            {isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
          </h1>
          <p className="text-subtle-text">
            {isReadOnly
              ? 'This entry has been posted and cannot be modified'
              : isEditMode
                ? 'Modify this accounting transaction'
                : 'Record a multi-line accounting transaction'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/ledger/transactions')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="journal-entry-cancel-button"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmitting}
                className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="journal-entry-save-draft-button"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleSaveAndPost}
                disabled={isSubmitting || !isBalanced}
                className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                data-testid="journal-entry-save-post-button"
              >
                {isSubmitting && (
                  <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                )}
                {isEditMode ? 'Update & Post' : 'Save & Post'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Added (SOUPFIN-9): Warn when the Ledger module is disabled so the
          user understands why account dropdowns are empty and submit will fail. */}
      {accountsError && (
        <ModuleDisabledBanner
          error={accountsError}
          context="Account selection is unavailable until the module is enabled."
          testId="journal-entry-module-disabled"
        />
      )}

      {/* Added: Read-only banner for posted/reversed entries */}
      {isReadOnly && (
        <div
          className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm flex items-center gap-2"
          data-testid="journal-entry-readonly-banner"
        >
          <span className="material-symbols-outlined text-xl">lock</span>
          This journal entry has been {existingGroup?.status?.toLowerCase()} and cannot be modified.
        </div>
      )}

      {/* Error Banner */}
      {submitError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2"
          data-testid="journal-entry-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          {submitError}
        </div>
      )}

      {/* Entry Header Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="journal-entry-header-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Entry Details</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <DatePicker
              label="Entry Date"
              required
              disabled={isReadOnly}
              {...register('entryDate')}
              error={errors.entryDate?.message}
              data-testid="journal-entry-date-input"
            />
            <Input
              label="Reference"
              placeholder="e.g., JE-2024-001"
              disabled={isReadOnly}
              {...register('reference')}
              error={errors.reference?.message}
              data-testid="journal-entry-reference-input"
            />
            <div className="md:col-span-1">
              {/* Added: Spacer for layout alignment */}
            </div>
          </div>
          <div className="mt-6">
            <Textarea
              label="Description"
              required
              placeholder="Describe the purpose of this journal entry..."
              rows={2}
              disabled={isReadOnly}
              {...register('description')}
              error={errors.description?.message}
              data-testid="journal-entry-description-input"
            />
          </div>
        </div>
      </div>

      {/* Line Items Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="journal-entry-lines-section"
      >
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Line Items</h2>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddLine}
              className="flex items-center gap-1 h-9 px-3 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
              data-testid="journal-entry-add-line-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Line
            </button>
          )}
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          {/* Fix (SOUPFIN-30 #16): the amount columns were 15% each, which left
              the input too narrow to show both a multi-character currency prefix
              (e.g. "GH₵") and the typed value — the amount appeared truncated.
              `min-w` keeps them usable on narrow viewports (the wrapper scrolls). */}
          <table className="w-full min-w-[860px] text-sm" data-testid="journal-entry-lines-table">
            <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-[32%]">Account</th>
                <th className="px-4 py-3 text-right font-semibold w-[19%]">Debit</th>
                <th className="px-4 py-3 text-right font-semibold w-[19%]">Credit</th>
                <th className="px-4 py-3 text-left font-semibold w-[25%]">Description</th>
                <th className="px-4 py-3 text-center font-semibold w-[5%]"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr
                  key={field.id}
                  className="border-b border-border-light dark:border-border-dark"
                  data-testid={`journal-entry-line-${index}`}
                >
                  {/* Account Select */}
                  <td className="px-4 py-3">
                    <Select
                      options={accountOptions}
                      placeholder="Select account..."
                      disabled={isReadOnly}
                      {...register(`lines.${index}.accountId`)}
                      error={errors.lines?.[index]?.accountId?.message}
                      data-testid={`journal-entry-line-${index}-account`}
                    />
                  </td>

                  {/* Debit Amount
                      Fix (SOUPFIN-30 #16): MoneyInput renders the *tenant's*
                      currency symbol (₵ for GHS, $ for USD, ...) instead of a
                      hardcoded "$", and rejects letters that a bare
                      <input type="number"> would otherwise accept. */}
                  <td className="px-4 py-3">
                    <MoneyInput
                      placeholder="0.00"
                      aria-label={`Line ${index + 1} debit amount`}
                      disabled={isReadOnly}
                      {...register(`lines.${index}.debitAmount`, { valueAsNumber: true })}
                      data-testid={`journal-entry-line-${index}-debit`}
                    />
                  </td>

                  {/* Credit Amount */}
                  <td className="px-4 py-3">
                    <MoneyInput
                      placeholder="0.00"
                      aria-label={`Line ${index + 1} credit amount`}
                      disabled={isReadOnly}
                      {...register(`lines.${index}.creditAmount`, { valueAsNumber: true })}
                      data-testid={`journal-entry-line-${index}-credit`}
                    />
                  </td>

                  {/* Line Description */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Line description (optional)"
                      disabled={isReadOnly}
                      {...register(`lines.${index}.description`)}
                      className="w-full h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      data-testid={`journal-entry-line-${index}-description`}
                    />
                  </td>

                  {/* Remove Line Button */}
                  <td className="px-4 py-3 text-center">
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        disabled={fields.length <= 2}
                        className="flex items-center justify-center size-10 rounded-full text-subtle-text hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-subtle-text disabled:hover:bg-transparent"
                        title={fields.length <= 2 ? 'Minimum 2 lines required' : 'Remove line'}
                        data-testid={`journal-entry-line-${index}-remove`}
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Line-level validation errors */}
        {errors.lines?.root?.message && (
          <div className="px-6 py-3 bg-danger/5 border-t border-danger/20">
            <p className="text-sm text-danger flex items-center gap-1">
              <span className="material-symbols-outlined text-base">error</span>
              {errors.lines.root.message}
            </p>
          </div>
        )}
      </div>

      {/* Totals Footer Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="journal-entry-totals-section"
      >
        <div className="p-6">
          <div className="flex flex-wrap justify-end items-center gap-6">
            {/* Total Debits */}
            <div className="text-right">
              <p className="text-sm text-subtle-text font-medium">Total Debits</p>
              <p
                className="text-xl font-bold text-text-light dark:text-text-dark"
                data-testid="journal-entry-total-debit"
              >
                {formatCurrency(totalDebit)}
              </p>
            </div>

            {/* Total Credits */}
            <div className="text-right">
              <p className="text-sm text-subtle-text font-medium">Total Credits</p>
              <p
                className="text-xl font-bold text-text-light dark:text-text-dark"
                data-testid="journal-entry-total-credit"
              >
                {formatCurrency(totalCredit)}
              </p>
            </div>

            {/* Balance Indicator */}
            <div
              className={`px-4 py-3 rounded-lg ${
                isBalanced
                  ? 'bg-success/10 border border-success/30'
                  : 'bg-danger/10 border border-danger/30'
              }`}
              data-testid="journal-entry-balance-indicator"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-xl ${
                    isBalanced ? 'text-success' : 'text-danger'
                  }`}
                >
                  {isBalanced ? 'check_circle' : 'error'}
                </span>
                <div>
                  <p className={`text-sm font-medium ${isBalanced ? 'text-success' : 'text-danger'}`}>
                    {isBalanced ? 'Balanced' : 'Out of Balance'}
                  </p>
                  {!isBalanced && (
                    <p className="text-xs text-danger">
                      Difference: {formatCurrency(difference)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
