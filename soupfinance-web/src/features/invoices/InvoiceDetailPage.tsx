/**
 * Invoice Detail Page
 * Shows invoice details, line items, and payment history
 * Reference: soupfinance-designs/invoice-draft-preview/
 *
 * Added: Full API integration with getInvoice endpoint
 * Added: Payment history with listInvoicePayments
 * Added: Delete, Send, and Cancel invoice actions
 * Added: Loading, error, and content states
 * Added: data-testid attributes for E2E testing
 * Updated: Frontend PDF generation and email sending
 */
import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInvoice,
  deleteInvoice,
  listInvoicePayments,
  cancelInvoice,
} from '../../api/endpoints/invoices';
import { useFormatCurrency } from '../../stores';
import { usePdf, useEmailSend } from '../../hooks';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const { generateInvoice, isGenerating: isPdfGenerating } = usePdf();
  const { sendInvoice: sendInvoiceEmail, isSending: isEmailSending, error: emailError, success: emailSuccess, reset: resetEmailState } = useEmailSend();

  // State for send email dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // Added: Fetch invoice details from API
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  // Added: Fetch invoice payments
  const { data: payments } = useQuery({
    queryKey: ['invoice-payments', id],
    queryFn: () => listInvoicePayments(id!),
    enabled: !!id,
  });

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/invoices');
    },
  });

  // Added: Cancel invoice mutation
  const cancelMutation = useMutation({
    mutationFn: () => cancelInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  // Added: Handle delete with confirmation
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  // Updated: Open send dialog instead of direct confirmation
  const handleOpenSendDialog = () => {
    resetEmailState();
    setRecipientEmail('');
    setRecipientName(invoice?.client?.name || '');
    setShowSendDialog(true);
  };

  // Updated: Send invoice with frontend-generated PDF via email
  const handleSendInvoice = async () => {
    if (!invoice || !recipientEmail) return;

    const success = await sendInvoiceEmail(invoice, recipientEmail, recipientName || undefined);
    if (success) {
      setShowSendDialog(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  };

  // Added: Handle cancel with confirmation
  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel this invoice?')) {
      cancelMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-detail-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="invoice-detail-loading">
          Loading invoice details...
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-detail-page">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">Invoice Details</h1>
          <Link to="/invoices" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center">
            Back to Invoices
          </Link>
        </div>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="invoice-detail-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load invoice</h3>
          <p className="text-subtle-text mb-4">The invoice could not be found or there was an error loading it.</p>
          <Link to="/invoices" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm">
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  // Added: Check if invoice can be edited/deleted (only DRAFT status)
  const canEdit = invoice.status === 'DRAFT';
  const canSend = invoice.status === 'DRAFT';
  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canRecordPayment = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (invoice.amountDue || 0) > 0;

  return (
    <div className="flex flex-col gap-6" data-testid="invoice-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="invoice-detail-heading">
            Invoice {invoice.invoiceNumber}
          </h1>
          <p className="text-subtle-text mt-1">
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusStyle(invoice.status)}`} data-testid="invoice-detail-status">
              {invoice.status}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/invoices" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center hover:bg-primary/5">
            Back
          </Link>
          <button
            onClick={() => generateInvoice(invoice)}
            disabled={isPdfGenerating}
            className="h-10 px-4 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-sm flex items-center hover:bg-purple-500/20 disabled:opacity-50"
            data-testid="invoice-download-pdf-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">download</span>
            {isPdfGenerating ? 'Generating...' : 'Download PDF'}
          </button>
          {canSend && (
            <button
              onClick={handleOpenSendDialog}
              className="h-10 px-4 rounded-lg bg-info/10 text-info font-bold text-sm flex items-center hover:bg-info/20"
              data-testid="invoice-send-button"
            >
              <span className="material-symbols-outlined text-lg mr-2">send</span>
              Send
            </button>
          )}
          {canEdit && (
            <Link
              to={`/invoices/${id}/edit`}
              className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm flex items-center hover:bg-primary/30"
              data-testid="invoice-edit-button"
            >
              <span className="material-symbols-outlined text-lg mr-2">edit</span>
              Edit
            </Link>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="h-10 px-4 rounded-lg bg-warning/10 text-warning font-bold text-sm flex items-center hover:bg-warning/20 disabled:opacity-50"
              data-testid="invoice-cancel-button"
            >
              <span className="material-symbols-outlined text-lg mr-2">cancel</span>
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="h-10 px-4 rounded-lg bg-danger/10 text-danger font-bold text-sm flex items-center hover:bg-danger/20 disabled:opacity-50"
              data-testid="invoice-delete-button"
            >
              <span className="material-symbols-outlined text-lg mr-2">delete</span>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* Invoice Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Info */}
        <div className="lg:col-span-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="invoice-info-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Invoice Information</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-subtle-text">Invoice Number</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-number">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Client</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-client">{invoice.client?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Issue Date</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-issue-date">{invoice.issueDate}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Due Date</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-due-date">{invoice.dueDate}</p>
            </div>
            {invoice.terms && (
              <div className="col-span-2">
                <p className="text-sm text-subtle-text">Payment Terms</p>
                <p className="font-medium text-text-light dark:text-text-dark">{invoice.terms}</p>
              </div>
            )}
            {invoice.notes && (
              <div className="col-span-2">
                <p className="text-sm text-subtle-text">Notes</p>
                <p className="font-medium text-text-light dark:text-text-dark">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Amount Summary */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="invoice-amount-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Amount Summary</h2>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between">
              <p className="text-subtle-text">Subtotal</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-subtotal">{formatCurrency(invoice.subtotal)}</p>
            </div>
            {(invoice.discountAmount || 0) > 0 && (
              <div className="flex justify-between">
                <p className="text-subtle-text">Discount</p>
                <p className="font-medium text-danger" data-testid="invoice-discount">-{formatCurrency(invoice.discountAmount)}</p>
              </div>
            )}
            <div className="flex justify-between">
              <p className="text-subtle-text">Tax</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="invoice-tax">{formatCurrency(invoice.taxAmount)}</p>
            </div>
            <div className="flex justify-between border-t border-border-light dark:border-border-dark pt-3">
              <p className="font-bold text-text-light dark:text-text-dark">Total</p>
              <p className="font-bold text-text-light dark:text-text-dark" data-testid="invoice-total">{formatCurrency(invoice.totalAmount)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-subtle-text">Amount Paid</p>
              <p className="font-medium text-success" data-testid="invoice-paid">{formatCurrency(invoice.amountPaid)}</p>
            </div>
            <div className="flex justify-between bg-primary/10 -mx-6 px-6 py-3 mt-3">
              <p className="font-bold text-primary">Balance Due</p>
              <p className="font-bold text-primary" data-testid="invoice-balance-due">{formatCurrency(invoice.amountDue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="invoice-items-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Line Items</h2>
        </div>
        {invoice.items && invoice.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="invoice-items-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-right">Qty</th>
                  <th className="px-6 py-3 text-right">Unit Price</th>
                  <th className="px-6 py-3 text-right">Tax Rate</th>
                  <th className="px-6 py-3 text-right">Discount</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={item.id || index} className="border-b border-border-light dark:border-border-dark">
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{item.description}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-6 py-4 text-right text-subtle-text">{item.taxRate || 0}%</td>
                    <td className="px-6 py-4 text-right text-subtle-text">{item.discountPercent || 0}%</td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="invoice-items-empty">
            No line items
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="invoice-payments-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Payment History</h2>
          {canRecordPayment && (
            <Link
              to={`/payments/new?invoiceId=${id}`}
              className="h-9 px-3 rounded-lg bg-primary text-white font-bold text-sm flex items-center hover:bg-primary/90"
              data-testid="record-payment-button"
            >
              <span className="material-symbols-outlined text-base mr-1">add</span>
              Record Payment
            </Link>
          )}
        </div>
        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="invoice-payments-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Method</th>
                  <th className="px-6 py-3 text-left">Reference</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border-light dark:border-border-dark">
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{payment.paymentDate}</td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodStyle(payment.paymentMethod)}`}>
                        {getPaymentMethodLabel(payment.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-subtle-text">{payment.reference || '-'}</td>
                    <td className="px-6 py-4 text-right font-medium text-success">{formatCurrency(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="invoice-payments-empty">
            No payments recorded yet
          </div>
        )}
      </div>

      {/* Send Invoice Email Dialog */}
      {showSendDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="send-invoice-dialog">
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark w-full max-w-md mx-4 shadow-xl">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Send Invoice</h3>
              <button
                onClick={() => setShowSendDialog(false)}
                className="text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-subtle-text">
                Send invoice <strong>{invoice?.invoiceNumber}</strong> with a frontend-generated PDF attachment.
              </p>

              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Client Name"
                  className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
                  data-testid="send-recipient-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Recipient Email <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@example.com"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
                  data-testid="send-recipient-email"
                />
              </div>

              {emailError && (
                <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm" data-testid="send-error">
                  {emailError}
                </div>
              )}

              {emailSuccess && (
                <div className="p-3 rounded-lg bg-success/10 text-success text-sm" data-testid="send-success">
                  Invoice sent successfully!
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
              <button
                onClick={() => setShowSendDialog(false)}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvoice}
                disabled={!recipientEmail || isEmailSending}
                className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm flex items-center disabled:opacity-50"
                data-testid="send-confirm-button"
              >
                {isEmailSending ? (
                  <>
                    <span className="material-symbols-outlined text-lg mr-2 animate-spin">progress_activity</span>
                    Sending...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg mr-2">send</span>
                    Send Invoice
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Added: Status badge styling helper
function getStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    PAID: 'bg-success/10 text-success',
    SENT: 'bg-info/10 text-info',
    VIEWED: 'bg-info/10 text-info',
    PARTIAL: 'bg-warning/10 text-warning',
    OVERDUE: 'bg-danger/10 text-danger',
    DRAFT: 'bg-subtle-text/10 text-subtle-text',
    CANCELLED: 'bg-subtle-text/10 text-subtle-text',
  };
  return styles[status] || styles.DRAFT;
}

// Added: Payment method label helper
function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank Transfer',
    CHEQUE: 'Cheque',
    CARD: 'Card',
    OTHER: 'Other',
  };
  return labels[method] || method;
}

// Added: Payment method badge styling helper
function getPaymentMethodStyle(method: string): string {
  const styles: Record<string, string> = {
    CASH: 'bg-success/10 text-success',
    BANK_TRANSFER: 'bg-info/10 text-info',
    CHEQUE: 'bg-warning/10 text-warning',
    CARD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    OTHER: 'bg-subtle-text/10 text-subtle-text',
  };
  return styles[method] || styles.OTHER;
}
