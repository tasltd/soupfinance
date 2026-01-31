/**
 * Payment Form Page
 * Record payment against invoice or bill
 *
 * Added: Full API integration with recordInvoicePayment and recordBillPayment
 * Added: Dynamic invoice/bill selection based on payment type
 * Added: Form validation and error handling
 * Added: data-testid attributes for E2E testing
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInvoices, recordInvoicePayment } from '../../api/endpoints/invoices';
import { listBills, recordBillPayment } from '../../api/endpoints/bills';
import { useFormatCurrency, useCurrencySymbol } from '../../stores';
import type { Invoice, Bill, InvoicePayment, BillPayment } from '../../types';

// Added: Payment type for form toggle
type PaymentType = 'invoice' | 'bill';
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';

export function PaymentFormPage() {
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
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Added: Fetch invoices for dropdown (only unpaid/partial)
  const { data: invoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-for-payment'],
    queryFn: () => listInvoices({ max: 100 }),
    enabled: paymentType === 'invoice',
  });

  // Added: Filter to invoices with balance due
  const unpaidInvoices = invoices?.filter(
    (inv) => inv.status !== 'PAID' && (inv.amountDue || 0) > 0
  );

  // Added: Fetch bills for dropdown (only unpaid/partial)
  const { data: bills, isLoading: isLoadingBills } = useQuery({
    queryKey: ['bills-for-payment'],
    queryFn: () => listBills({ max: 100 }),
    enabled: paymentType === 'bill',
  });

  // Added: Filter to bills with balance due
  const unpaidBills = bills?.filter(
    (bill) => bill.status !== 'PAID' && (bill.amountDue || 0) > 0
  );

  // Added: Get selected item details for amount validation
  const selectedInvoice = unpaidInvoices?.find((inv) => inv.id === selectedId);
  const selectedBill = unpaidBills?.find((bill) => bill.id === selectedId);
  const maxAmount = paymentType === 'invoice'
    ? selectedInvoice?.amountDue
    : selectedBill?.amountDue;

  // Added: Update selected ID when switching payment type
  /* eslint-disable-next-line -- Resetting state on payment type change is required */
  useEffect(() => {
    if (paymentType === 'invoice' && !preselectedInvoiceId) {
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
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to record payment');
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
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to record payment');
    },
  });

  // Added: Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validate
    if (!selectedId) {
      setFormError(`Please select ${paymentType === 'invoice' ? 'an invoice' : 'a bill'}`);
      return;
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setFormError('Please enter a valid payment amount');
      return;
    }

    if (maxAmount && paymentAmount > maxAmount) {
      setFormError(`Payment amount cannot exceed balance due (${formatCurrency(maxAmount)})`);
      return;
    }

    if (!paymentDate) {
      setFormError('Please select a payment date');
      return;
    }

    // Submit based on payment type
    if (paymentType === 'invoice') {
      invoicePaymentMutation.mutate({
        'invoice.id': selectedId,
        amount: paymentAmount,
        paymentDate,
        paymentMethod,
        reference: reference || undefined,
        notes: notes || undefined,
      } as unknown as Partial<InvoicePayment>);
    } else {
      billPaymentMutation.mutate({
        'bill.id': selectedId,
        amount: paymentAmount,
        paymentDate,
        paymentMethod,
        reference: reference || undefined,
        notes: notes || undefined,
      } as unknown as Partial<BillPayment>);
    }
  };

  const isPending = invoicePaymentMutation.isPending || billPaymentMutation.isPending;
  const isLoadingData = paymentType === 'invoice' ? isLoadingInvoices : isLoadingBills;

  return (
    <div className="flex flex-col gap-6" data-testid="payment-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="payment-form-heading">
            Record Payment
          </h1>
          <p className="text-subtle-text">
            {paymentType === 'invoice'
              ? 'Record payment received against an invoice'
              : 'Record payment made against a bill'}
          </p>
        </div>
        <button
          onClick={() => navigate('/payments')}
          className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="cancel-button"
        >
          Cancel
        </button>
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Payment Details</h2>
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
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Payment Type</label>
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
                  Incoming (Invoice)
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
                  Outgoing (Bill)
                </button>
              </div>
            </div>

            {/* Invoice/Bill Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">
                {paymentType === 'invoice' ? 'Invoice' : 'Bill'} *
              </label>
              {isLoadingData ? (
                <div className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 flex items-center px-4 text-subtle-text">
                  Loading...
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
                    Select {paymentType === 'invoice' ? 'an invoice' : 'a bill'}
                  </option>
                  {paymentType === 'invoice'
                    ? unpaidInvoices?.map((invoice: Invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {invoice.client?.name || 'Unknown'} - Due: {formatCurrency(invoice.amountDue)}
                        </option>
                      ))
                    : unpaidBills?.map((bill: Bill) => (
                        <option key={bill.id} value={bill.id}>
                          {bill.billNumber} - {bill.vendor?.name || 'Unknown'} - Due: {formatCurrency(bill.amountDue)}
                        </option>
                      ))}
                </select>
              )}
              {maxAmount !== undefined && (
                <p className="text-sm text-subtle-text">
                  Balance due: <span className="font-medium text-text-light dark:text-text-dark">{formatCurrency(maxAmount)}</span>
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Amount *</label>
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
                  Pay full balance ({formatCurrency(maxAmount)})
                </button>
              )}
            </div>

            {/* Payment Date */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="date-input"
                required
              />
            </div>

            {/* Payment Method */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="method-select"
                required
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Reference */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., Check #, Transaction ID"
                className="h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-4 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 placeholder:text-subtle-text"
                data-testid="reference-input"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-light dark:text-text-dark">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional payment notes..."
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedId || !amount}
              className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="submit-button"
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  Recording...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">check</span>
                  Record Payment
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
