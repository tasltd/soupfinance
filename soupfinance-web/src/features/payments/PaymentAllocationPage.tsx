/**
 * Payment Allocation Page (SOUPFIN-178)
 *
 * Receive one payment from a client and apply it across their open invoices
 * (`/payments/receive`), or pay a vendor once across their open bills
 * (`/payments/make`). Design: soupfinance-designs/payment-allocation-screen/.
 *
 * - Lines are filled oldest due date first (FIFO) as soon as an amount is
 *   entered. Editing or ticking a line switches to manual; "Auto-allocate"
 *   switches back.
 * - The unapplied amount is shown, and a payment whose lines add up to more
 *   than the amount paid cannot be saved.
 * - Saving posts one PaymentAllocationGroup. The backend creates a payment per
 *   line, so each invoice's amountDue and status move (see paymentAllocations.ts).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listClients, getClient } from '../../api/endpoints/clients';
import { listVendors } from '../../api/endpoints/vendors';
import {
  createPaymentAllocation,
  listOpenBillsForVendor,
  listOpenInvoicesForAccountServices,
  resolveClientAccountServicesIds,
} from '../../api/endpoints/paymentAllocations';
import { getApiErrorMessage, parseApiError } from '../../api/errors';
import { useFormatCurrency, useCurrencySymbol } from '../../stores';
import { listAllLedgerAccounts, ledgerGroupMatches } from '../../api/endpoints/ledger';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { ModuleDisabledBanner } from '../../components/feedback/ModuleDisabledBanner';
import { useToast } from '../../components/feedback';
import { HelpLink } from '../../components/help';
import { getClientDisplayName } from '../clients/getClientDisplayName';
import { formatDisplayDate, getTodayIsoDate } from '../../utils/date';
import {
  allocateFIFO,
  amountForTickedLine,
  billToDoc,
  invoiceToDoc,
  sortByDueDate,
  summariseAllocation,
  toAllocationLines,
  toCents,
  type AllocatableDoc,
  type Allocations,
} from './allocation';
import type { AllocationDirection, Client } from '../../types';

interface PaymentAllocationPageProps {
  direction: AllocationDirection;
}

// Number inputs without the browser's spin buttons, which sit on top of the digits
const noSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const inputClass =
  'h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50';

export function PaymentAllocationPage({ direction }: PaymentAllocationPageProps) {
  const isReceipt = direction === 'RECEIPT';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const docNoun = isReceipt ? 'invoice' : 'bill';
  const listPath = isReceipt ? '/payments' : '/payments?tab=outgoing';

  const [partyId, setPartyId] = useState(
    (isReceipt ? searchParams.get('clientId') : searchParams.get('vendorId')) ?? ''
  );
  const [amountText, setAmountText] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayIsoDate());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // null = automatic (FIFO); otherwise the text of every line the user set by hand
  const [manualLines, setManualLines] = useState<Record<string, string> | null>(null);
  const [formError, setFormError] = useState('');

  const paymentAmount = Number.parseFloat(amountText) || 0;

  // ---- Parties --------------------------------------------------------------
  const clientsQuery = useQuery({
    queryKey: ['clients', 'allocation-picker'],
    queryFn: () => listClients({ max: 100 }),
    enabled: isReceipt,
  });
  // A client reached from its detail page may sit beyond the first 100.
  const preselectedClientQuery = useQuery({
    queryKey: ['client', partyId],
    queryFn: () => getClient(partyId),
    enabled:
      isReceipt && !!partyId && !!clientsQuery.data && !clientsQuery.data.some((c) => c.id === partyId),
  });
  const clients: Client[] = useMemo(() => {
    const list = clientsQuery.data ?? [];
    const extra = preselectedClientQuery.data;
    return extra && !list.some((c) => c.id === extra.id) ? [extra, ...list] : list;
  }, [clientsQuery.data, preselectedClientQuery.data]);
  const selectedClient = clients.find((c) => c.id === partyId);

  const vendorsQuery = useQuery({
    queryKey: ['vendors', 'allocation-picker'],
    queryFn: () => listVendors({ max: 100, sort: 'name', order: 'asc' }),
    enabled: !isReceipt,
  });

  // ---- Open documents -------------------------------------------------------
  const accountServicesQuery = useQuery({
    queryKey: ['client-account-services', partyId],
    queryFn: () => resolveClientAccountServicesIds(selectedClient as Client),
    enabled: isReceipt && !!selectedClient,
  });
  const accountServicesIds = accountServicesQuery.data ?? [];

  const openDocsQuery = useQuery({
    queryKey: isReceipt
      ? ['open-invoices', accountServicesIds.join(',')]
      : ['open-bills', partyId],
    queryFn: async () => {
      if (isReceipt) {
        const res = await listOpenInvoicesForAccountServices(accountServicesIds);
        return { docs: res.documents.map(invoiceToDoc), truncated: res.truncated };
      }
      const res = await listOpenBillsForVendor(partyId);
      return { docs: res.documents.map(billToDoc), truncated: res.truncated };
    },
    enabled: isReceipt ? accountServicesIds.length > 0 : !!partyId,
    retry: false,
  });
  const docs: AllocatableDoc[] = useMemo(
    () => sortByDueDate(openDocsQuery.data?.docs ?? []),
    [openDocsQuery.data]
  );

  // ---- Lookups --------------------------------------------------------------
  // Every account, not useLedgerAccounts(): that sends no `max`, so Grails returns the 10
  // newest accounts and the bank accounts are usually not among them (see SOUPFIN-142).
  const { data: assetAccounts } = useQuery({
    queryKey: ['ledger-accounts', 'all', 'ASSET'],
    queryFn: async () => (await listAllLedgerAccounts()).filter((a) => ledgerGroupMatches(a.ledgerGroup, 'ASSET')),
    staleTime: 5 * 60 * 1000,
  });
  const bankCashAccounts = assetAccounts ?? [];
  const { data: paymentMethods } = usePaymentMethods();

  // ---- Allocation -----------------------------------------------------------
  const allocations: Allocations = useMemo(() => {
    if (!manualLines) return allocateFIFO(docs, paymentAmount);
    const result: Allocations = {};
    for (const [id, text] of Object.entries(manualLines)) {
      result[id] = text.trim() === '' ? 0 : Number(text);
    }
    return result;
  }, [manualLines, docs, paymentAmount]);

  const summary = summariseAllocation(docs, allocations, paymentAmount);
  const isOverAllocated = summary.overAllocatedBy > 0;
  const hasLineErrors = Object.keys(summary.lineErrors).length > 0;

  /** Text shown in a line's input. */
  const lineText = (doc: AllocatableDoc): string => {
    if (manualLines) return manualLines[doc.id] ?? '';
    const value = allocations[doc.id];
    return value ? value.toFixed(2) : '';
  };

  /** Freeze the current automatic lines so one of them can be edited. */
  const currentLinesAsText = (): Record<string, string> => {
    if (manualLines) return { ...manualLines };
    const frozen: Record<string, string> = {};
    for (const [id, value] of Object.entries(allocations)) frozen[id] = value.toFixed(2);
    return frozen;
  };

  const setLine = (docId: string, text: string) => {
    setFormError('');
    setManualLines({ ...currentLinesAsText(), [docId]: text });
  };

  const toggleLine = (doc: AllocatableDoc, checked: boolean) => {
    if (!checked) {
      setLine(doc.id, '0');
      return;
    }
    const amount = amountForTickedLine(doc, allocations, paymentAmount);
    setLine(doc.id, amount.toFixed(2));
  };

  const changeParty = (id: string) => {
    setPartyId(id);
    setManualLines(null);
    setFormError('');
  };

  // ---- Save -----------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: createPaymentAllocation,
    onSuccess: () => {
      for (const key of ['invoices', 'invoice-payments', 'bills', 'bill-payments', 'open-invoices', 'open-bills', 'dashboard-stats']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      showToast({
        variant: 'success',
        message: `Payment of ${formatCurrency(paymentAmount)} applied to ${summary.allocatedCount} ${docNoun}${summary.allocatedCount === 1 ? '' : 's'}.`,
      });
      navigate(listPath);
    },
    onError: (error: unknown) => setFormError(getApiErrorMessage(error)),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!partyId) return setFormError(isReceipt ? 'Choose the client who paid.' : 'Choose the vendor you paid.');
    if (toCents(paymentAmount) <= 0) {
      return setFormError(isReceipt ? 'Enter the amount received.' : 'Enter the amount paid.');
    }
    if (!paymentDate) return setFormError('Choose the payment date.');
    if (!bankAccountId) {
      return setFormError(
        isReceipt ? 'Choose the bank or cash account the money went into.' : 'Choose the bank or cash account you paid from.'
      );
    }
    if (hasLineErrors) return setFormError('Fix the highlighted lines first.');
    if (isOverAllocated) {
      return setFormError(
        `The lines add up to ${formatCurrency(summary.allocated)}, more than the ${formatCurrency(paymentAmount)} paid.`
      );
    }
    const lines = toAllocationLines(docs, allocations);
    if (lines.length === 0) return setFormError(`Apply the payment to at least one ${docNoun}.`);

    const partyOfFirstLine = docs.find((d) => d.id === lines[0].id)?.partyId;
    saveMutation.mutate({
      direction,
      strategy: manualLines ? 'MANUAL' : 'FIFO',
      totalAmount: Math.round(paymentAmount * 100) / 100,
      paymentDate,
      ...(paymentMethodId && { paymentMethod: { id: paymentMethodId } }),
      ...(reference.trim() && { reference: reference.trim() }),
      ...(notes.trim() && { notes: notes.trim() }),
      ...(isReceipt
        ? { accountServicesId: partyOfFirstLine || accountServicesIds[0] }
        : { vendorId: partyId }),
      cashAccountId: bankAccountId,
      allocations: lines.map((line) =>
        isReceipt ? { invoiceId: line.id, amount: line.amount } : { billId: line.id, amount: line.amount }
      ),
    });
  };

  // ---- Render ---------------------------------------------------------------
  const partyName = isReceipt
    ? selectedClient
      ? getClientDisplayName(selectedClient)
      : ''
    : vendorsQuery.data?.find((v) => v.id === partyId)?.name ?? '';
  const today = getTodayIsoDate();
  const docsError = openDocsQuery.error ?? accountServicesQuery.error;
  const docsErrorKind = docsError ? parseApiError(docsError).kind : null;
  const isLoadingDocs =
    !!partyId && (accountServicesQuery.isLoading || openDocsQuery.isLoading || preselectedClientQuery.isLoading);
  const clientHasNoAccount = isReceipt && !!selectedClient && accountServicesQuery.isSuccess && accountServicesIds.length === 0;

  return (
    <div className="flex flex-col gap-6" data-testid="payment-allocation-page" data-direction={direction}>
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="payment-allocation-heading"
          >
            {isReceipt ? 'Receive payment' : 'Pay bills'}
            {partyName && <span className="text-subtle-text font-bold"> from {partyName}</span>}
          </h1>
          <p className="text-subtle-text">
            {isReceipt
              ? 'Record one payment from a client and apply it to their open invoices.'
              : 'Record one payment to a vendor and apply it to their open bills.'}
          </p>
          <HelpLink section="record-payment" className="mt-1 self-start" />
        </div>
        <Link
          to={listPath}
          className="h-10 px-4 inline-flex items-center rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="allocation-cancel"
        >
          Cancel
        </Link>
      </div>

      {docsErrorKind === 'module_disabled' && (
        <ModuleDisabledBanner
          error={docsError}
          context={`Open ${docNoun}s cannot be listed, so this payment cannot be recorded.`}
          testId="allocation-module-disabled"
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_260px] gap-6 items-start">
        {/* ---- Payment details ---- */}
        <section className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-4 xl:row-span-2 2xl:row-span-1">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Payment details</h2>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              {isReceipt ? 'Client' : 'Vendor'} *
            </span>
            <select
              value={partyId}
              onChange={(e) => changeParty(e.target.value)}
              className={inputClass}
              data-testid="allocation-party-select"
            >
              <option value="">{isReceipt ? 'Select a client' : 'Select a vendor'}</option>
              {isReceipt
                ? clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {getClientDisplayName(client)}
                    </option>
                  ))
                : (vendorsQuery.data ?? []).map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              {isReceipt ? 'Amount received' : 'Amount paid'} *
            </span>
            <div className="flex h-12 items-center rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50">
              <span className="pl-4 pr-2 text-subtle-text whitespace-nowrap">{currencySymbol}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amountText}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  setFormError('');
                }}
                placeholder="0.00"
                className={`h-full w-full min-w-0 rounded-r-lg border-0 bg-transparent pr-4 text-text-light dark:text-text-dark focus:ring-0 ${noSpinner}`}
                data-testid="allocation-amount-input"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Payment date *</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputClass}
              data-testid="allocation-date-input"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Payment method</span>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className={inputClass}
              data-testid="allocation-method-select"
            >
              <option value="">Select a payment method</option>
              {(paymentMethods ?? []).map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              {isReceipt ? 'Deposit to' : 'Pay from'} *
            </span>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className={inputClass}
              data-testid="allocation-bank-select"
            >
              <option value="">Select a bank or cash account</option>
              {bankCashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code ? `${account.code} - ` : ''}
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Reference</span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque number, transfer ID"
              className={`${inputClass} placeholder:text-subtle-text`}
              data-testid="allocation-reference-input"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 py-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 resize-none"
              data-testid="allocation-notes-input"
            />
          </label>
        </section>

        {/* ---- Open documents ---- */}
        <section className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden min-w-0 xl:col-start-2 xl:row-start-1">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Open {docNoun}s</h2>
              <p className="text-xs text-subtle-text" data-testid="allocation-strategy">
                {manualLines ? 'Amounts set by hand' : 'Filled automatically, oldest due date first'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualLines(null);
                setFormError('');
              }}
              disabled={!manualLines || docs.length === 0}
              className="h-9 px-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="allocation-auto-button"
            >
              <span className="material-symbols-outlined text-lg">auto_fix_high</span>
              Auto-allocate
            </button>
          </div>

          {!partyId ? (
            <p className="p-10 text-center text-subtle-text" data-testid="allocation-no-party">
              {isReceipt ? 'Choose a client to see their open invoices.' : 'Choose a vendor to see their open bills.'}
            </p>
          ) : isLoadingDocs ? (
            <p className="p-10 text-center text-subtle-text" data-testid="allocation-loading">
              Loading open {docNoun}s
            </p>
          ) : clientHasNoAccount ? (
            <p className="p-10 text-center text-subtle-text" data-testid="allocation-no-account">
              This client has no account yet, so no invoices can have been raised to them.
            </p>
          ) : docsError && docsErrorKind !== 'module_disabled' ? (
            <div className="p-10 text-center" data-testid="allocation-docs-error">
              <p className="text-danger mb-3">{getApiErrorMessage(docsError)}</p>
              <button
                type="button"
                onClick={() => {
                  accountServicesQuery.refetch();
                  openDocsQuery.refetch();
                }}
                className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium hover:bg-primary/5"
                data-testid="allocation-docs-retry"
              >
                Try again
              </button>
            </div>
          ) : docs.length === 0 ? (
            <p className="p-10 text-center text-subtle-text" data-testid="allocation-empty">
              {isReceipt ? 'This client has no unpaid invoices.' : 'This vendor has no unpaid bills.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="allocation-table">
                <thead className="text-xs uppercase text-subtle-text bg-background-light dark:bg-background-dark">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <span className="sr-only">Apply</span>
                    </th>
                    <th className="px-3 py-3 text-left">{isReceipt ? 'Invoice' : 'Bill'}</th>
                    <th className="px-3 py-3 text-left hidden sm:table-cell">Due date</th>
                    <th className="px-3 py-3 text-right">Balance due</th>
                    <th className="px-3 py-3 text-right">Amount to apply</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const applied = allocations[doc.id] ?? 0;
                    const error = summary.lineErrors[doc.id];
                    const overdue = !!doc.dueDate && doc.dueDate < today;
                    return (
                      <tr
                        key={doc.id}
                        className="border-t border-border-light dark:border-border-dark align-top"
                        data-testid={`allocation-row-${doc.id}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={toCents(applied) > 0}
                            onChange={(e) => toggleLine(doc, e.target.checked)}
                            aria-label={`Apply to ${docNoun} ${doc.label}`}
                            className="size-5 rounded border-border-light text-primary focus:ring-primary/50"
                            data-testid={`allocation-check-${doc.id}`}
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-text-light dark:text-text-dark">
                          <Link
                            to={isReceipt ? `/invoices/${doc.id}` : `/bills/${doc.id}`}
                            className="hover:text-primary"
                          >
                            {doc.label}
                          </Link>
                          {/* Phones: the due date sits under the number instead of in its own column */}
                          <span className={`block sm:hidden text-xs font-normal ${overdue ? 'text-danger' : 'text-subtle-text'}`}>
                            {doc.dueDate ? formatDisplayDate(doc.dueDate) : 'No due date'}
                          </span>
                        </td>
                        <td
                          className={`px-3 py-3 hidden sm:table-cell ${overdue ? 'text-danger' : 'text-subtle-text'}`}
                          data-testid={`allocation-due-${doc.id}`}
                        >
                          {doc.dueDate ? formatDisplayDate(doc.dueDate) : 'No due date'}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-subtle-text" data-testid={`allocation-balance-${doc.id}`}>
                          {formatCurrency(doc.amountDue)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={doc.amountDue}
                            value={lineText(doc)}
                            onChange={(e) => setLine(doc.id, e.target.value)}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (manualLines && value !== '' && Number.isFinite(Number(value))) {
                                setManualLines({ ...manualLines, [doc.id]: Number(value).toFixed(2) });
                              }
                            }}
                            placeholder="0.00"
                            aria-label={`Amount to apply to ${docNoun} ${doc.label}`}
                            aria-invalid={!!error}
                            className={`w-28 sm:w-32 h-10 rounded-lg border px-3 text-right ${noSpinner} bg-white dark:bg-background-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 ${
                              error ? 'border-danger' : 'border-border-light dark:border-border-dark focus:border-primary'
                            }`}
                            data-testid={`allocation-input-${doc.id}`}
                          />
                          {error && (
                            <p className="text-xs text-danger mt-1" data-testid={`allocation-line-error-${doc.id}`}>
                              {error}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {openDocsQuery.data?.truncated && (
                <p className="px-6 py-3 text-xs text-subtle-text border-t border-border-light dark:border-border-dark" data-testid="allocation-truncated">
                  Only the first {docNoun}s could be checked. Older unpaid {docNoun}s may be missing from this list.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ---- Summary ---- */}
        <aside className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-4 xl:col-start-2 xl:row-start-2 2xl:col-start-3 2xl:row-start-1">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Allocation summary</h2>

          <div className="rounded-lg border border-border-light dark:border-border-dark p-4">
            <p className="text-sm text-subtle-text">{isReceipt ? 'Amount received' : 'Amount paid'}</p>
            <p className="text-xl font-bold text-text-light dark:text-text-dark" data-testid="allocation-summary-payment">
              {formatCurrency(summary.paymentAmount)}
            </p>
          </div>

          <div className="rounded-lg border border-border-light dark:border-border-dark p-4">
            <p className="text-sm text-subtle-text">Applied to {summary.allocatedCount} {docNoun}{summary.allocatedCount === 1 ? '' : 's'}</p>
            <p className="text-xl font-bold text-text-light dark:text-text-dark" data-testid="allocation-summary-allocated">
              {formatCurrency(summary.allocated)}
            </p>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              summary.unapplied > 0 ? 'border-primary/40 bg-primary/5' : 'border-border-light dark:border-border-dark'
            }`}
          >
            <p className={`text-sm ${summary.unapplied > 0 ? 'text-primary' : 'text-subtle-text'}`}>Unapplied amount</p>
            <p
              className={`text-xl font-bold ${summary.unapplied > 0 ? 'text-primary' : 'text-text-light dark:text-text-dark'}`}
              data-testid="allocation-summary-unapplied"
            >
              {formatCurrency(summary.unapplied)}
            </p>
            {summary.unapplied > 0 && summary.allocatedCount > 0 && (
              <p className="text-xs text-subtle-text mt-1" data-testid="allocation-unapplied-note">
                {summary.remainingOnDocs > 0
                  ? `Apply it to another ${docNoun}, or it stays unapplied.`
                  : `More than the open ${docNoun}s. The rest stays unapplied.`}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border-light dark:border-border-dark p-4">
            <p className="text-sm text-subtle-text">Still due on these {docNoun}s</p>
            <p className="text-xl font-bold text-text-light dark:text-text-dark" data-testid="allocation-summary-remaining">
              {formatCurrency(summary.remainingOnDocs)}
            </p>
          </div>

          {isOverAllocated && (
            <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert" data-testid="allocation-over-error">
              The lines add up to {formatCurrency(summary.allocated)}, which is {formatCurrency(summary.overAllocatedBy)} more
              than the amount {isReceipt ? 'received' : 'paid'}. Lower a line or raise the amount.
            </div>
          )}

          {formError && (
            <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert" data-testid="allocation-form-error">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={saveMutation.isPending || isOverAllocated || docsErrorKind === 'module_disabled'}
            className="h-11 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="allocation-submit"
          >
            {saveMutation.isPending ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                Saving
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">check</span>
                {isReceipt ? 'Record receipt' : 'Record payment'}
              </>
            )}
          </button>
        </aside>
      </form>
    </div>
  );
}

export function ReceivePaymentPage() {
  return <PaymentAllocationPage direction="RECEIPT" />;
}

export function PayBillsPage() {
  return <PaymentAllocationPage direction="PAYMENT" />;
}
