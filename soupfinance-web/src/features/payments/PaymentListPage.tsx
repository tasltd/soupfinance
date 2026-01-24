/**
 * Payment List Page
 * Lists all incoming (invoice) and outgoing (bill) payments
 *
 * Added: Full API integration with listAllInvoicePayments and listAllBillPayments
 * Added: Tabbed view for incoming vs outgoing payments
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAllInvoicePayments } from '../../api/endpoints/invoices';
import { listAllBillPayments } from '../../api/endpoints/bills';
import type { InvoicePayment, BillPayment } from '../../types';

// Added: Tab type for filtering
type PaymentTab = 'incoming' | 'outgoing';

export function PaymentListPage() {
  // Added: Tab state
  const [activeTab, setActiveTab] = useState<PaymentTab>('incoming');

  // Added: Fetch incoming payments (from invoices)
  const {
    data: incomingPayments,
    isLoading: isLoadingIncoming,
    error: incomingError,
  } = useQuery({
    queryKey: ['invoice-payments'],
    queryFn: () => listAllInvoicePayments({ max: 50, sort: 'paymentDate', order: 'desc' }),
  });

  // Added: Fetch outgoing payments (to vendors/bills)
  const {
    data: outgoingPayments,
    isLoading: isLoadingOutgoing,
    error: outgoingError,
  } = useQuery({
    queryKey: ['bill-payments'],
    queryFn: () => listAllBillPayments({ max: 50, sort: 'paymentDate', order: 'desc' }),
  });

  // Added: Get current tab data
  const isLoading = activeTab === 'incoming' ? isLoadingIncoming : isLoadingOutgoing;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;
  const payments = activeTab === 'incoming' ? incomingPayments : outgoingPayments;

  // Added: Payment method display helper
  const getPaymentMethodLabel = (method: string): string => {
    const labels: Record<string, string> = {
      CASH: 'Cash',
      BANK_TRANSFER: 'Bank Transfer',
      CHEQUE: 'Cheque',
      CARD: 'Card',
      OTHER: 'Other',
    };
    return labels[method] || method;
  };

  // Added: Payment method badge styling
  const getPaymentMethodStyle = (method: string): string => {
    const styles: Record<string, string> = {
      CASH: 'bg-success/10 text-success',
      BANK_TRANSFER: 'bg-info/10 text-info',
      CHEQUE: 'bg-warning/10 text-warning',
      CARD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
      OTHER: 'bg-subtle-text/10 text-subtle-text',
    };
    return styles[method] || styles.OTHER;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="payment-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="payment-list-heading">
            Payments
          </h1>
          <p className="text-subtle-text">Track all incoming and outgoing payments</p>
        </div>
        <Link
          to="/payments/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="record-payment-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Record Payment
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-light dark:bg-surface-dark rounded-lg p-1 border border-border-light dark:border-border-dark w-fit" data-testid="payment-tabs">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'incoming'
              ? 'bg-primary text-white'
              : 'text-subtle-text hover:bg-primary/10'
          }`}
          data-testid="tab-incoming"
        >
          <span className="material-symbols-outlined text-lg">arrow_downward</span>
          Incoming
          {incomingPayments && incomingPayments.length > 0 && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === 'incoming' ? 'bg-white/20' : 'bg-success/20 text-success'}`}>
              {incomingPayments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'outgoing'
              ? 'bg-primary text-white'
              : 'text-subtle-text hover:bg-primary/10'
          }`}
          data-testid="tab-outgoing"
        >
          <span className="material-symbols-outlined text-lg">arrow_upward</span>
          Outgoing
          {outgoingPayments && outgoingPayments.length > 0 && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === 'outgoing' ? 'bg-white/20' : 'bg-danger/20 text-danger'}`}>
              {outgoingPayments.length}
            </span>
          )}
        </button>
      </div>

      {/* Payment Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="payment-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="payment-list-loading">
            Loading {activeTab} payments...
          </div>
        ) : error ? (
          <div className="p-12 text-center" data-testid="payment-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              Failed to load payments
            </h3>
            <p className="text-subtle-text mb-4">
              There was an error loading your {activeTab} payments. Please try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : !payments || payments.length === 0 ? (
          <div className="p-12 text-center" data-testid="payment-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">payments</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No {activeTab} payments
            </h3>
            <p className="text-subtle-text mb-4">
              {activeTab === 'incoming'
                ? 'Record payments received from customers against invoices.'
                : 'Record payments made to vendors against bills.'}
            </p>
            <Link
              to="/payments/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              data-testid="record-first-payment-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Record Payment
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="payment-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">{activeTab === 'incoming' ? 'Invoice' : 'Bill'}</th>
                  <th className="px-6 py-3 text-left">Method</th>
                  <th className="px-6 py-3 text-left">Reference</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {activeTab === 'incoming'
                  ? (payments as InvoicePayment[]).map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                        data-testid={`payment-row-${payment.id}`}
                      >
                        <td className="px-6 py-4 text-text-light dark:text-text-dark">
                          {payment.paymentDate}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            to={`/invoices/${payment.invoice?.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            View Invoice
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodStyle(payment.paymentMethod)}`}>
                            {getPaymentMethodLabel(payment.paymentMethod)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-subtle-text">
                          {payment.reference || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-success">
                          +${payment.amount?.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  : (payments as BillPayment[]).map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                        data-testid={`payment-row-${payment.id}`}
                      >
                        <td className="px-6 py-4 text-text-light dark:text-text-dark">
                          {payment.paymentDate}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            to={`/bills/${payment.bill?.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            View Bill
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodStyle(payment.paymentMethod)}`}>
                            {getPaymentMethodLabel(payment.paymentMethod)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-subtle-text">
                          {payment.reference || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-danger">
                          -${payment.amount?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {payments && payments.length > 0 && (
        <div className="flex justify-between items-center text-sm text-subtle-text" data-testid="payment-summary">
          <span>
            Showing {payments.length} {activeTab} payment{payments.length !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2 items-center">
            <span>Total:</span>
            <span className={`font-bold ${activeTab === 'incoming' ? 'text-success' : 'text-danger'}`}>
              {activeTab === 'incoming' ? '+' : '-'}$
              {payments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
