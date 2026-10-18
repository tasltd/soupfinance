/**
 * Added (SOUPFIN-158): Settings > Financial Years.
 *
 * Lists the tenant's financial years, creates a new one, closes a year after a
 * pre-close checklist (pending entries, trial balance, where the profit goes),
 * and lets an administrator reopen a closed year or move the lock date.
 *
 * Close, reopen, the checklist and the lock date call endpoints added by
 * plans/soupfin-158-period-end-backend.md. Until they ship each one fails with
 * a visible error here; nothing is swallowed into an empty state.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeFinancialYear,
  createFinancialYear,
  getCloseChecklist,
  getLockDate,
  listFinancialYears,
  reopenFinancialYear,
  setLockDate,
} from '../../api/endpoints/financialYears';
import { getApiErrorMessage } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { useHasRole } from '../../stores/authStore';
import { useCurrencyConfig } from '../../stores';
import { formatAmountWithConfig } from '../../stores/accountStore';
import { formatDisplayDate, getTodayIsoDate } from '../../utils/date';
import { financialYearStatus, type FinancialYear, type FinancialYearFormData } from '../../types/financialYear';
import { suggestNextYear, validateNewYear } from './financialYearDates';

const YEARS_KEY = ['financialYears'];
const LOCK_DATE_KEY = ['financialYearLockDate'];

const inputClass =
  'w-full h-11 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50';

function StatusBadge({ year }: { year: FinancialYear }) {
  const closed = financialYearStatus(year) === 'CLOSED';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${
        closed
          ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
      }`}
      data-testid={`financial-year-status-${year.id}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-sm">{closed ? 'lock' : 'lock_open'}</span>
      {closed ? 'Closed' : 'Open'}
    </span>
  );
}

/** A modal shell matching the design-system modal (fixed overlay, not <dialog>). */
function Modal({
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        className="relative w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden"
        data-testid={testId}
      >
        <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
          <h3 id={`${testId}-title`} className="text-xl font-bold text-text-light dark:text-text-dark">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4">{children}</div>
        <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">{footer}</div>
      </div>
    </div>
  );
}

/** One line of the pre-close checklist: a tick or a cross, and what it means. */
function CheckRow({ ok, label, detail, testId }: { ok: boolean; label: string; detail: string; testId: string }) {
  return (
    <li className="flex gap-3" data-testid={testId} data-ok={ok}>
      <span
        aria-hidden="true"
        className={`material-symbols-outlined ${ok ? 'text-green-600' : 'text-danger'}`}
      >
        {ok ? 'check_circle' : 'cancel'}
      </span>
      <div>
        <p className="text-sm font-bold text-text-light dark:text-text-dark">{label}</p>
        <p className="text-sm text-subtle-text">{detail}</p>
      </div>
    </li>
  );
}

function CloseYearDialog({ year, onDone, onCancel }: { year: FinancialYear; onDone: () => void; onCancel: () => void }) {
  const currency = useCurrencyConfig();
  const money = (amount: number) => formatAmountWithConfig(amount, currency);
  const [error, setError] = useState<string | null>(null);

  const checklistQuery = useQuery({
    queryKey: ['financialYearCloseChecklist', year.id],
    queryFn: () => getCloseChecklist(year.id),
  });
  const checklist = checklistQuery.data;

  const closeMutation = useMutation({
    mutationFn: () => closeFinancialYear(year.id),
    onSuccess: onDone,
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const noPending = checklist ? checklist.pendingEntries === 0 : false;
  const balanced = checklist?.trialBalance.balanced ?? false;
  const hasRetainedEarnings = !!checklist?.retainedEarningsAccount;
  const canClose = !!checklist && noPending && balanced && hasRetainedEarnings;

  return (
    <Modal
      title={`Close ${year.name}`}
      onClose={onCancel}
      testId="close-year-dialog"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg ring-1 ring-border-light dark:ring-border-dark text-sm font-bold text-text-light dark:text-text-dark hover:bg-black/5 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              closeMutation.mutate();
            }}
            disabled={!canClose || closeMutation.isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="close-year-confirm"
          >
            {closeMutation.isPending ? 'Closing...' : 'Close year'}
          </button>
        </>
      }
    >
      <p className="text-sm text-subtle-text">
        Closing {year.name} ({formatDisplayDate(year.fromDate)} to {formatDisplayDate(year.toDate)}) moves its profit
        or loss into Retained Earnings. Nobody can then post an entry dated in that year until an administrator reopens it.
      </p>

      {checklistQuery.isLoading && (
        <p className="text-sm text-subtle-text" data-testid="close-year-checklist-loading">Checking the year...</p>
      )}
      {checklistQuery.error && (
        <ApiErrorState error={checklistQuery.error} onRetry={() => checklistQuery.refetch()} testId="close-year-checklist-error" />
      )}
      {checklist && (
        <ul className="flex flex-col gap-3" data-testid="close-year-checklist">
          <CheckRow
            ok={noPending}
            label={noPending ? 'No pending entries' : `${checklist.pendingEntries} pending ${checklist.pendingEntries === 1 ? 'entry' : 'entries'}`}
            detail={
              noPending
                ? 'Every entry dated in this year is posted.'
                : 'Post or delete the draft invoices, bills, vouchers and journal entries dated in this year first.'
            }
            testId="check-pending-entries"
          />
          <CheckRow
            ok={balanced}
            label={balanced ? 'Trial balance balances' : 'Trial balance does not balance'}
            detail={`Debits ${money(checklist.trialBalance.totalDebit)}, credits ${money(checklist.trialBalance.totalCredit)}.`}
            testId="check-trial-balance"
          />
          <CheckRow
            ok={hasRetainedEarnings}
            label={
              checklist.retainedEarningsAccount
                ? `${checklist.netIncome < 0 ? 'Loss' : 'Profit'} of ${money(Math.abs(checklist.netIncome))} goes to ${checklist.retainedEarningsAccount.name}`
                : 'No Retained Earnings account'
            }
            detail={
              hasRetainedEarnings
                ? 'Income and expense accounts start the next year at zero.'
                : 'Add a Retained Earnings account to the chart of accounts before closing.'
            }
            testId="check-retained-earnings"
          />
        </ul>
      )}

      {error && (
        <p className="text-sm text-danger flex items-start gap-2" role="alert" data-testid="close-year-error">
          <span aria-hidden="true" className="material-symbols-outlined text-base">error</span>
          {error}
        </p>
      )}
    </Modal>
  );
}

function ReopenYearDialog({ year, onDone, onCancel }: { year: FinancialYear; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const reopenMutation = useMutation({
    mutationFn: () => reopenFinancialYear(year.id),
    onSuccess: onDone,
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  return (
    <Modal
      title={`Reopen ${year.name}`}
      onClose={onCancel}
      testId="reopen-year-dialog"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg ring-1 ring-border-light dark:ring-border-dark text-sm font-bold text-text-light dark:text-text-dark hover:bg-black/5 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              reopenMutation.mutate();
            }}
            disabled={reopenMutation.isPending}
            className="h-10 px-4 rounded-lg bg-danger text-white text-sm font-bold hover:bg-danger/90 disabled:opacity-50"
            data-testid="reopen-year-confirm"
          >
            {reopenMutation.isPending ? 'Reopening...' : 'Reopen year'}
          </button>
        </>
      }
    >
      <p className="text-sm text-subtle-text">
        Reopening reverses the closing entry and moves the lock date back, so entries dated in {year.name} can be
        changed again. Close the year again when you finish.
      </p>
      {error && (
        <p className="text-sm text-danger flex items-start gap-2" role="alert" data-testid="reopen-year-error">
          <span aria-hidden="true" className="material-symbols-outlined text-base">error</span>
          {error}
        </p>
      )}
    </Modal>
  );
}

function LockDateCard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const lockQuery = useQuery({ queryKey: LOCK_DATE_KEY, queryFn: getLockDate });
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (value: string | null) => setLockDate(value),
    onSuccess: (value) => {
      queryClient.setQueryData(LOCK_DATE_KEY, value);
      setDraft(null);
      setSaved(true);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const current = lockQuery.data ?? null;
  const value = draft ?? current ?? '';

  return (
    <section
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-4"
      data-testid="lock-date-card"
    >
      <div>
        <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Lock date</h3>
        <p className="text-sm text-subtle-text">
          Nobody can post a journal entry, voucher, invoice or bill dated on or before the lock date. Closing a year
          moves the lock date to its last day.
        </p>
      </div>

      {lockQuery.error ? (
        <ApiErrorState error={lockQuery.error} onRetry={() => lockQuery.refetch()} testId="lock-date-error-state" />
      ) : (
        <>
          <p className="text-sm text-text-light dark:text-text-dark" data-testid="lock-date-current">
            {lockQuery.isLoading
              ? 'Loading...'
              : current
                ? <>The books are locked up to and including <strong>{formatDisplayDate(current)}</strong>.</>
                : 'No lock date is set. Every date is open for posting.'}
          </p>

          {isAdmin ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">New lock date</span>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setSaved(false);
                    setError(null);
                  }}
                  className={`${inputClass} w-48`}
                  data-testid="lock-date-input"
                />
              </label>
              <button
                type="button"
                onClick={() => saveMutation.mutate(value || null)}
                disabled={saveMutation.isPending || !draft || draft === current}
                className="h-11 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="lock-date-save"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save lock date'}
              </button>
              {current && (
                <button
                  type="button"
                  onClick={() => saveMutation.mutate(null)}
                  disabled={saveMutation.isPending}
                  className="h-11 px-4 rounded-lg bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 disabled:opacity-50"
                  data-testid="lock-date-remove"
                >
                  Remove lock
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-subtle-text" data-testid="lock-date-admin-only">
              Only an administrator can change the lock date.
            </p>
          )}

          {saved && (
            <p className="text-sm text-green-700 dark:text-green-400" role="status" data-testid="lock-date-saved">
              Lock date saved.
            </p>
          )}
          {error && (
            <p className="text-sm text-danger" role="alert" data-testid="lock-date-save-error">{error}</p>
          )}
        </>
      )}
    </section>
  );
}

function NewYearForm({ years, onCreated, onCancel }: { years: FinancialYear[]; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<FinancialYearFormData>(() => suggestNextYear(years, getTodayIsoDate()));
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: FinancialYearFormData) => createFinancialYear(data),
    onSuccess: onCreated,
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const update = (field: keyof FinancialYearFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewYear(years, form);
    if (problem) {
      setError(problem);
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-4"
      data-testid="financial-year-form"
      noValidate
    >
      <h3 className="text-lg font-bold text-text-light dark:text-text-dark">New financial year</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">Name</span>
          <input value={form.name} onChange={update('name')} className={inputClass} data-testid="financial-year-name-input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">Start date</span>
          <input type="date" value={form.fromDate} onChange={update('fromDate')} className={inputClass} data-testid="financial-year-from-input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">End date</span>
          <input type="date" value={form.toDate} onChange={update('toDate')} className={inputClass} data-testid="financial-year-to-input" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-light dark:text-text-dark">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={update('notes')}
          rows={2}
          className="w-full rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark p-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
          data-testid="financial-year-notes-input"
        />
      </label>
      {error && (
        <p className="text-sm text-danger" role="alert" data-testid="financial-year-form-error">{error}</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-lg bg-[#f5f1f0] dark:bg-gray-700 text-text-light dark:text-white text-sm font-bold hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
          data-testid="financial-year-submit"
        >
          {createMutation.isPending ? 'Saving...' : 'Save financial year'}
        </button>
      </div>
    </form>
  );
}

export default function FinancialYearsPage() {
  const queryClient = useQueryClient();
  const isAdmin = useHasRole('ROLE_ADMIN');
  const [showForm, setShowForm] = useState(false);
  const [closing, setClosing] = useState<FinancialYear | null>(null);
  const [reopening, setReopening] = useState<FinancialYear | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const yearsQuery = useQuery({ queryKey: YEARS_KEY, queryFn: listFinancialYears });
  const years = yearsQuery.data ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: YEARS_KEY });
    queryClient.invalidateQueries({ queryKey: LOCK_DATE_KEY });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="financial-years-page">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Financial Years</h2>
          <p className="text-subtle-text text-sm">Set up your accounting years, close them at year end, and enter opening balances</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/settings/financial-years/opening-balances"
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-primary text-primary font-bold text-sm hover:bg-primary/10"
            data-testid="opening-balances-link"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">input</span>
            Enter opening balances
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setNotice(null);
            }}
            disabled={showForm || yearsQuery.isLoading}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="new-financial-year-button"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">add</span>
            New financial year
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm"
          role="status"
          data-testid="financial-years-notice"
        >
          <span aria-hidden="true" className="material-symbols-outlined">check_circle</span>
          {notice}
        </div>
      )}

      {showForm && (
        <NewYearForm
          years={years}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            setNotice('Financial year saved.');
            refresh();
          }}
        />
      )}

      <section className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        {yearsQuery.isLoading ? (
          <p className="p-8 text-center text-subtle-text" data-testid="financial-years-loading">Loading financial years...</p>
        ) : yearsQuery.error ? (
          <div className="p-6">
            <ApiErrorState error={yearsQuery.error} onRetry={() => yearsQuery.refetch()} testId="financial-years-error" />
          </div>
        ) : years.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-2" data-testid="financial-years-empty">
            <span aria-hidden="true" className="material-symbols-outlined text-4xl text-subtle-text">calendar_month</span>
            <p className="font-bold text-text-light dark:text-text-dark">No financial years yet</p>
            <p className="text-sm text-subtle-text">Add your first financial year to start closing your books each year.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" data-testid="financial-years-table">
              <thead className="text-xs text-subtle-text uppercase bg-[#f5f1f0] dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Start</th>
                  <th className="px-6 py-3">End</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Closed</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const closed = financialYearStatus(year) === 'CLOSED';
                  return (
                    <tr
                      key={year.id}
                      className="border-b border-border-light dark:border-border-dark last:border-0 hover:bg-primary/5"
                      data-testid={`financial-year-row-${year.id}`}
                    >
                      <td className="px-6 py-4 font-medium text-text-light dark:text-text-dark">{year.name}</td>
                      <td className="px-6 py-4 text-text-light dark:text-text-dark">{formatDisplayDate(year.fromDate)}</td>
                      <td className="px-6 py-4 text-text-light dark:text-text-dark">{formatDisplayDate(year.toDate)}</td>
                      <td className="px-6 py-4"><StatusBadge year={year} /></td>
                      <td className="px-6 py-4 text-subtle-text">
                        {closed
                          ? [formatDisplayDate(year.closedAt), year.closedBy].filter(Boolean).join(' by ') || 'Closed'
                          : ''}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!closed && (
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setClosing(year);
                            }}
                            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20"
                            data-testid={`close-year-button-${year.id}`}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-base">lock</span>
                            Close year
                          </button>
                        )}
                        {closed && isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setReopening(year);
                            }}
                            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg ring-1 ring-border-light dark:ring-border-dark text-text-light dark:text-text-dark font-bold hover:bg-black/5 dark:hover:bg-white/5"
                            data-testid={`reopen-year-button-${year.id}`}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-base">lock_open</span>
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LockDateCard isAdmin={isAdmin} />

      {closing && (
        <CloseYearDialog
          year={closing}
          onCancel={() => setClosing(null)}
          onDone={() => {
            setNotice(`${closing.name} is closed. Its profit or loss is now in Retained Earnings.`);
            setClosing(null);
            refresh();
          }}
        />
      )}
      {reopening && (
        <ReopenYearDialog
          year={reopening}
          onCancel={() => setReopening(null)}
          onDone={() => {
            setNotice(`${reopening.name} is open again.`);
            setReopening(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
