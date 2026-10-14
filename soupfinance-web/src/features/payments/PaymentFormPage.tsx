/**
 * Payment Form Page
 * Record payment against invoice or bill
 *
 * Added: Full API integration with recordInvoicePayment and recordBillPayment
 * Added: Dynamic invoice/bill selection based on payment type
 * Added: Form validation and error handling
 * Added: data-testid attributes for E2E testing
 * Changed (SOUPFIN-180): strings come from the `payments` namespace, and a gated
 *   Finance module shows ModuleDisabledBanner above the form instead of replacing it
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInvoices, recordInvoicePayment } from '../../api/endpoints/invoices';
import { listBills, recordBillPayment } from '../../api/endpoints/bills';
import { useFormatCurrency, useCurrencySymbol } from '../../stores';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
// Changed (SOUPFIN-180): api/errors replaces the legacy utils/apiErrors check
import { parseApiError, getApiErrorMessage } from '../../api/errors';
import { ModuleDisabledBanner } from '../../components/feedback/ModuleDisabledBanner';
import type { Invoice, Bill, InvoicePayment, BillPayment } from '../../types';
import { getTodayIsoDate } from '../../utils/date';
// Added (SOUPFIN-184): one lifecycle status for every bill page
import { getBillDisplayStatus } from '../bills/billStatus';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Payment type for form toggle
type PaymentType = 'invoice' | 'bill';

export function PaymentFormPage() {
  const { t } = useTranslation('payments');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [searchParams] = useSearchParams();

  // Added: Detect if coming from invoice or bill page
  const preselectedInvoiceId = searchParams.get('invoiceId');
  const preselectedBillId = searchParams.get('billId');

  // Added: Form state
  const [paymentType, setPaymentType] = useState<PaymentType>(
    preselectedBillId ? 'bill' : 'invoice'
  );
  const [selectedId, setSelectedId] = useState(preselectedInvoiceId || preselectedBillId || '');
  const [amount, setAmount] = useState('');
  // Fix (SOUPFIN-64): local calendar day, not UTC today — `new Date().toISOString()`
  // defaults the field to yesterday for part of every day east of UTC.
  const [paymentDate, setPaymentDate] = useState(getTodayIsoDate());
  // Changed: Payment method is now a domain class FK ID (not a string enum)
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // Added: Bank/cash account for deposit (invoice) or payment source (bill)
  const [bankAccountId, setBankAccountId] = useState('');
  const [formError, setFormError] = useState('');

  // Added: Fetch invoices for dropdown (only unpaid/partial)
  // NOTE: retry=false so 403 (module disabled) surfaces immediately
  const {
    data: invoices,
    isLoading: isLoadingInvoices,
    error: invoicesError,
  } = useQuery({
    queryKey: ['invoices-for-payment'],
    queryFn: () => listInvoices({ max: 100 }),
    enabled: paymentType === 'invoice',
    retry: false,
  });

  // Added: Filter to invoices with balance due
  const unpaidInvoices = invoices?.filter(
    (inv) => inv.status !== 'PAID' && (inv.amountDue || 0) > 0
  );

  // Added: Fetch bills for dropdown (only unpaid/partial)
  const {
    data: bills,
    isLoading: isLoadingBills,
    error: billsError,
  } = useQuery({
    queryKey: ['bills-for-payment'],
    queryFn: () => listBills({ max: 100 }),
    enabled: paymentType === 'bill',
    retry: false,
  });

  // Added: Filter to bills with balance due
  // Changed (SOUPFIN-184): read the lifecycle status — a draft is not owed yet
  // and a voided bill is closed, so neither can be paid despite its balance.
  const unpaidBills = bills?.filter((bill) => {
    const status = getBillDisplayStatus(bill);
    return status !== 'PAID' && status !== 'DRAFT' && status !== 'CANCELLED' && (bill.amountDue || 0) > 0;
  });

  // Added: Fetch bank/cash accounts for payInAccount/payOutAccount selection
  const { data: ledgerAccounts } = useLedgerAccounts();
  const bankCashAccounts = (ledgerAccounts || []).filter(
    (account) => account.ledgerGroup === 'ASSET'
  );

  // Added: Fetch payment methods from backend (domain class, not enum)
  const { data: paymentMethodRecords } = usePaymentMethods();

  // Added: Get selected item details for amount validation
  const selectedInvoice = unpaidInvoices?.find((inv) => inv.id === selectedId);
  const selectedBill = unpaidBills?.find((bill) => bill.id === selectedId);
  const maxAmount = paymentType === 'invoice'
    ? selectedInvoice?.amountDue
    : selectedBill?.amountDue;

  // Added: Update selected ID when switching payment type
  useEffect(() => {
    if (paymentType === 'invoice' && !preselectedInvoiceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting selection on payment type change
      setSelectedId('');
    } else if (paymentType === 'bill' && !preselectedBillId) {
      setSelectedId('');
    }
  }, [paymentType, preselectedInvoiceId, preselectedBillId]);

  // Added: Invoice payment mutation
  const invoicePaymentMutation = useMutation({
    mutationFn: (data: Partial<InvoicePayment>) => recordInvoicePayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
      navigate('/payments');
    },
    // Changed (SOUPFIN-180): never show axios's "Request failed with status code"
    onError: (error: Error) => {
      setFormError(getApiErrorMessage(error));
    },
  });

  // Added: Bill payment mutation
  const billPaymentMutation = useMutation({
    mutationFn: (data: Partial<BillPayment>) => recordBillPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['bill', selectedId] });
      navigate('/payments');
    },
    // Changed (SOUPFIN-180): never show axios's "Request failed with status code"
    onError: (error: Error) => {
      setFormError(getApiErrorMessage(error));
    },
  });

  // Added: Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validate
    if (!selectedId) {
      setFormError(paymentType === 'invoice' ? t('form.errors.selectInvoice') : t('form.errors.selectBill'));
      return;
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setFormError(t('form.errors.invalidAmount'));
      return;
    }

    if (maxAmount && paymentAmount > maxAmount) {
      setFormError(t('form.errors.exceedsBalance', { amount: formatCurrency(maxAmount) }));
      return;
    }

    if (!paymentDate) {
      setFormError(t('form.errors.dateRequired'));
      return;
    }

    // Submit based on payment type
    // Changed: Send paymentMethod.id as FK reference (domain class, not string)
    if (paymentType === 'invoice') {
      invoicePaymentMutation.mutate({
        'invoice.id': selectedId,
        amount: paymentAmount,
        paymentDate,
        ...(paymentMethodId && { 'paymentMethod.id': paymentMethodId }),
        reference: reference || undefined,
        notes: notes || undefined,
        ...(bankAccountId && { 'payInAccount.id': bankAccountId }),
      } as unknown as Partial<InvoicePayment>);
    } else {
      billPaymentMutation.mutate({
        'bill.id': selectedId,
        amount: paymentAmount,
        paymentDate,
        ...(paymentMethodId && { 'paymentMethod.id': paymentMethodId }),
        reference: reference || undefined,
        notes: notes || undefined,
        ...(bankAccountId && { 'payOutAccount.id': bankAccountId }),
      } as unknown as Partial<BillPayment>);
    }
  };

  const isPending = invoicePaymentMutation.isPending || billPaymentMutation.isPending;
  const isLoadingData = paymentType === 'invoice' ? isLoadingInvoices : isLoadingBills;

  // Changed (SOUPFIN-180): classify the source-list error with api/errors. Only the
  // active type's endpoint matters — the other query is disabled by `enabled: false`.
  // A gated module keeps the form on screen under a banner; any other failure is
  // named under the document dropdown so an empty list is never mistaken for "nothing due".
  const dataError = paymentType === 'invoice' ? invoicesError : billsError;
  const dataErrorKind = dataError ? parseApiError(dataError).kind : null;
  const isModuleDisabled = dataErrorKind === 'module_disabled';

  return (
    <div className="flex flex-col gap-6" data-testid="payment-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="payment-form-heading">
            {t('form.title')}
          </h1>
          <p className="text-subtle-text">
            {paymentType === 'invoice' ? t('form.subtitleInvoice') : t('form.subtitleBill')}
          </p>
          <HelpLink section="record-payment" className="mt-1 self-start" />
        </div>
        <button
          onClick={() => navigate('/payments')}
          className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="cancel-button"
        >
          {t('form.cancel')}
        </button>
      </div>

      {/* Added (SOUPFIN-180): renders only for module_disabled; the form stays visible below */}
      <ModuleDisabledBanner
        error={dataError}
        context={t('form.moduleContext')}
        testId="payment-form-module-disabled"
      />

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t('form.detailsHeading')}</h2>
          </div>

          <div className="p-6 space-y-6">
            {/* Error Message */}
            {formError && (
              <div className="p-4 rounded-lg bg-danger/10 text-danger text-sm" data-testid="form-error">
                {formError}
              </div>
            )}

            {/* Payment Type Toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.paymentType')}</label>
              <div className="flex gap-2" data-testid="payment-type-toggle">
                <button
                  type="button"
                  onClick={() => setPaymentType('invoice')}
                  className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border transition-colors ${
                    paymentType === 'invoice'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-background-dark border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-primary/10'
                  }`}
                  data-testid="type-invoice"
                >
                  <span className="material-symbols-outlined">arrow_downward</span>
                  {t('form.typeInvoice')}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('bill')}
                  className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border transition-colors ${
                    paymentType === 'bill'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-background-dark border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-primary/10'
                  }`}
                  data-testid="type-bill"
                >
                  <span className="material-symbols-outlined">arrow_upward</span>
                  {t('form.typeBill')}
                </button>
              </div>
            </div>

            {/* Invoice/Bill Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">
                {paymentType === 'invoice' ? t('form.invoice') : t('form.bill')} *
              </label>
              {isLoadingData ? (
                <div className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 flex items-center px-4 text-subtle-text">
                  {t('form.loading')}
                </div>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                  data-testid="select-document"
                  required
                >
                  <option value="">
                    {paymentType === 'invoice' ? t('form.selectInvoice') : t('form.selectBill')}
                  </option>
                  {paymentType === 'invoice'
                    ? unpaidInvoices?.map((invoice: Invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {String(invoice.number)} - {invoice.accountServices?.serialised || t('form.unknownParty')} -{' '}
                          {t('form.due', { amount: formatCurrency(invoice.amountDue) })}
                        </option>
                      ))
                    : unpaidBills?.map((bill: Bill) => (
                        <option key={bill.id} value={bill.id}>
                          {bill.billNumber} - {bill.vendor?.name || t('form.unknownParty')} -{' '}
                          {t('form.due', { amount: formatCurrency(bill.amountDue) })}
                        </option>
                      ))}
                </select>
              )}
              {dataError && !isModuleDisabled && (
                <p className="text-sm text-danger" data-testid="document-load-error" role="alert">
                  {t('form.errors.documentsFailed', { message: getApiErrorMessage(dataError) })}
                </p>
              )}
              {maxAmount !== undefined && (
                <p className="text-sm text-subtle-text">
                  {t('form.balanceDue')} <span className="font-medium text-text-light dark:text-text-dark">{formatCurrency(maxAmount)}</span>
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.amount')} *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle-text">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={maxAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-12 pl-8 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                  data-testid="amount-input"
                  required
                />
              </div>
              {maxAmount !== undefined && (
                <button
                  type="button"
                  onClick={() => setAmount(maxAmount.toFixed(2))}
                  className="text-sm text-primary hover:underline text-left"
                  data-testid="pay-full-button"
                >
                  {t('form.payFull', { amount: formatCurrency(maxAmount) })}
                </button>
              )}
            </div>

            {/* Payment Date */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.paymentDate')} *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="date-input"
                required
              />
            </div>

            {/* Changed: Payment method dropdown from backend domain records (not hardcoded enum) */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.paymentMethod')}</label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="method-select"
              >
                <option value="">{t('form.selectMethod')}</option>
                {(paymentMethodRecords || []).map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Added: Bank/Cash Account selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">
                {paymentType === 'invoice' ? t('form.depositTo') : t('form.payFrom')}
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="bank-account-select"
              >
                <option value="">{t('form.selectAccount')}</option>
                {bankCashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-subtle-text">
                {paymentType === 'invoice' ? t('form.depositHint') : t('form.payFromHint')}
              </p>
            </div>

            {/* Reference */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.reference')}</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('form.referencePlaceholder')}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 placeholder:text-subtle-text"
                data-testid="reference-input"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">{t('form.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('form.notesPlaceholder')}
                rows={3}
                className="rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 py-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 placeholder:text-subtle-text resize-none"
                data-testid="notes-input"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="px-6 py-4 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/payments')}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              disabled={isPending}
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || isModuleDisabled || !selectedId || !amount}
              className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="submit-button"
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  {t('form.recording')}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">check</span>
                  {t('form.submit')}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
