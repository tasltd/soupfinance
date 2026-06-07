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
import { useFormatCurrency } from '../../stores';
import { isModuleDisabledError } from '../../utils/apiErrors';
import type { InvoicePayment, BillPayment } from '../../types';

// Added: Tab type for filtering
type PaymentTab = 'incoming' | 'outgoing';

export function PaymentListPage() {
  const formatCurrency = useFormatCurrency();

  // Added: Tab state
  const [activeTab, setActiveTab] = useState<PaymentTab>('incoming');

  // Added: Fetch incoming payments (from invoices)
  // NOTE: retry=false so 403 (module disabled) surfaces immediately instead of retrying 3x
  const {
    data: incomingPayments,
    isLoading: isLoadingIncoming,
    error: incomingError,
  } = useQuery({
    queryKey: ['invoice-payments'],
    queryFn: () => listAllInvoicePayments({ max: 50, sort: 'paymentDate', order: 'desc' }),
    retry: false,
  });

  // Added: Fetch outgoing payments (to vendors/bills)
  const {
    data: outgoingPayments,
    isLoading: isLoadingOutgoing,
    error: outgoingError,
  } = useQuery({
    queryKey: ['bill-payments'],
    queryFn: () => listAllBillPayments({ max: 50, sort: 'paymentDate', order: 'desc' }),
    retry: false,
  });

  // Added: Get current tab data
  const isLoading = activeTab === 'incoming' ? isLoadingIncoming : isLoadingOutgoing;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;
  const payments = activeTab === 'incoming' ? incomingPayments : outgoingPayments;

  // Added: Detect Finance module disabled (403 on BOTH read endpoints)
  // Both must be 403 because a single 403 could be a transient permission glitch;
  // both endpoints failing the same way is the module-disabled signal.
  const isModuleDisabled =
    isModuleDisabledError(incomingError) && isModuleDisabledError(outgoingError);

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
          aria-disabled={isModuleDisabled}
          tabIndex={isModuleDisabled ? -1 : undefined}
          onClick={(e) => {
            if (isModuleDisabled) e.preventDefault();
          }}
          className={`flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 ${
            isModuleDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
          }`}
          data-testid="record-payment-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Record Payment
        </Link>
      </div>

      {/* Added: Finance module disabled — render dedicated state instead of broken table + tabs */}
      {isModuleDisabled ? (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="payment-module-disabled"
        >
          <span className="material-symbols-outlined text-6xl text-warning/70 mb-4">block</span>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark mb-2">
            Finance module not available
          </h2>
          <p className="text-subtle-text max-w-lg mx-auto mb-6">
            The Finance module is not enabled for your account, so payments cannot be
            listed or recorded right now. Please contact your administrator to enable
            the Finance module for this workspace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              data-testid="payment-module-disabled-dashboard"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Back to Dashboard
            </Link>
            <a
              href="mailto:support@soupfinance.com?subject=Enable%20Finance%20module"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
              data-testid="payment-module-disabled-contact"
            >
              <span className="material-symbols-outlined text-lg">mail</span>
              Contact Support
            </a>
          </div>
        </div>
      ) : (
        <>

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
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodStyle(payment.paymentMethod?.name || '')}`}>
                            {getPaymentMethodLabel(payment.paymentMethod?.name || '')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-subtle-text">
                          {payment.reference || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-success">
                          +{formatCurrency(payment.amount)}
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
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodStyle(payment.paymentMethod?.name || '')}`}>
                            {getPaymentMethodLabel(payment.paymentMethod?.name || '')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-subtle-text">
                          {payment.reference || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-danger">
                          -{formatCurrency(payment.amount)}
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
              {activeTab === 'incoming' ? '+' : '-'}
              {formatCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}
            </span>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
