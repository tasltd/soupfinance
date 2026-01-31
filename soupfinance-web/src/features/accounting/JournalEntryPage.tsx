/**
 * Journal Entry Page
 * Multi-line journal entry form for recording accounting transactions (debits and credits)
 * Reference: soupfinance-designs/general-ledger-entries/, design-system.md
 *
 * Changed: Now fetches ledger accounts from API via useLedgerAccounts hook
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Input } from '../../components/forms/Input';
import { Select, type SelectOption } from '../../components/forms/Select';
import { DatePicker } from '../../components/forms/DatePicker';
import { Textarea } from '../../components/forms/Textarea';
import { createJournalEntry } from '../../api/endpoints/ledger';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
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
 */
export function JournalEntryPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Changed: Fetch accounts from API via useLedgerAccounts hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: accounts, isLoading: _accountsLoading } = useLedgerAccounts();

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
    watch,
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

  // Added: useFieldArray for dynamic line item management
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  // Added: Watch all lines to calculate totals in real-time
  const watchedLines = watch('lines');

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

  // Added: Form submission handler for saving/posting journal entry
  const onSubmit = async (data: JournalEntryFormData) => {
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

      await createJournalEntry(request);

      // Added: Navigate back to ledger transactions after successful save
      navigate('/ledger/transactions');
    } catch (error) {
      // Added: Display error message from API or generic fallback
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to save journal entry. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Added: Wrapper for save draft - currently same as save, can be extended for draft status
  const handleSaveDraft = handleSubmit(onSubmit);

  // Added: Wrapper for save and post - currently same as save, can be extended for posted status
  const handleSaveAndPost = handleSubmit(onSubmit);

  // Added: Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="journal-entry-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="journal-entry-heading"
          >
            New Journal Entry
          </h1>
          <p className="text-subtle-text">
            Record a multi-line accounting transaction
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
            Cancel
          </button>
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
            Save & Post
          </button>
        </div>
      </div>

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
              {...register('entryDate')}
              error={errors.entryDate?.message}
              data-testid="journal-entry-date-input"
            />
            <Input
              label="Reference"
              placeholder="e.g., JE-2024-001"
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
          <button
            type="button"
            onClick={handleAddLine}
            className="flex items-center gap-1 h-9 px-3 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
            data-testid="journal-entry-add-line-button"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Add Line
          </button>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="journal-entry-lines-table">
            <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-[40%]">Account</th>
                <th className="px-4 py-3 text-right font-semibold w-[15%]">Debit</th>
                <th className="px-4 py-3 text-right font-semibold w-[15%]">Credit</th>
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
                      {...register(`lines.${index}.accountId`)}
                      error={errors.lines?.[index]?.accountId?.message}
                      data-testid={`journal-entry-line-${index}-account`}
                    />
                  </td>

                  {/* Debit Amount */}
                  <td className="px-4 py-3">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-subtle-text text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...register(`lines.${index}.debitAmount`, { valueAsNumber: true })}
                        className="w-full h-12 pl-7 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        data-testid={`journal-entry-line-${index}-debit`}
                      />
                    </div>
                  </td>

                  {/* Credit Amount */}
                  <td className="px-4 py-3">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-subtle-text text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...register(`lines.${index}.creditAmount`, { valueAsNumber: true })}
                        className="w-full h-12 pl-7 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        data-testid={`journal-entry-line-${index}-credit`}
                      />
                    </div>
                  </td>

                  {/* Line Description */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Line description (optional)"
                      {...register(`lines.${index}.description`)}
                      className="w-full h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                      data-testid={`journal-entry-line-${index}-description`}
                    />
                  </td>

                  {/* Remove Line Button */}
                  <td className="px-4 py-3 text-center">
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
