/**
 * Bill Detail Page
 * Shows bill details, line items, and payment history
 *
 * Added: Full API integration with getBill endpoint
 * Added: Loading, error, and content states
 * Added: data-testid attributes for E2E testing
 * Updated: Frontend PDF generation and email sending
 */
import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBill, deleteBill, listBillPayments } from '../../api/endpoints/bills';
import { useFormatCurrency } from '../../stores';
import { usePdf, useEmailSend } from '../../hooks';

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const { generateBill, isGenerating: isPdfGenerating } = usePdf();
  const { sendBill: sendBillEmail, isSending: isEmailSending, error: emailError, success: emailSuccess, reset: resetEmailState } = useEmailSend();

  // State for send email dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // Added: Fetch bill details from API
  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => getBill(id!),
    enabled: !!id,
  });

  // Added: Fetch bill payments
  const { data: payments } = useQuery({
    queryKey: ['bill-payments', id],
    queryFn: () => listBillPayments(id!),
    enabled: !!id,
  });

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteBill(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      navigate('/bills');
    },
  });

  // Added: Handle delete with confirmation
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  // Open send dialog
  const handleOpenSendDialog = () => {
    resetEmailState();
    setRecipientEmail('');
    setRecipientName(bill?.vendor?.name || '');
    setShowSendDialog(true);
  };

  // Send bill with frontend-generated PDF via email
  const handleSendBill = async () => {
    if (!bill || !recipientEmail) return;

    const success = await sendBillEmail(bill, recipientEmail, recipientName || undefined);
    if (success) {
      setShowSendDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="bill-detail-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="bill-detail-loading">
          Loading bill details...
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="flex flex-col gap-6" data-testid="bill-detail-page">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">Bill Details</h1>
          <Link to="/bills" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center">
            Back to Bills
          </Link>
        </div>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="bill-detail-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load bill</h3>
          <p className="text-subtle-text mb-4">The bill could not be found or there was an error loading it.</p>
          <Link to="/bills" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm">
            Back to Bills
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="bill-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="bill-detail-heading">
            Bill {bill.billNumber}
          </h1>
          <p className="text-subtle-text">
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusStyle(bill.status)}`} data-testid="bill-detail-status">
              {bill.status}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/bills" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center hover:bg-primary/5">
            Back
          </Link>
          <button
            onClick={() => generateBill(bill)}
            disabled={isPdfGenerating}
            className="h-10 px-4 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-sm flex items-center hover:bg-purple-500/20 disabled:opacity-50"
            data-testid="bill-download-pdf-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">download</span>
            {isPdfGenerating ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            onClick={handleOpenSendDialog}
            className="h-10 px-4 rounded-lg bg-info/10 text-info font-bold text-sm flex items-center hover:bg-info/20"
            data-testid="bill-send-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">send</span>
            Send
          </button>
          <Link
            to={`/bills/${id}/edit`}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm flex items-center hover:bg-primary/30"
            data-testid="bill-edit-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">edit</span>
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="h-10 px-4 rounded-lg bg-danger/10 text-danger font-bold text-sm flex items-center hover:bg-danger/20 disabled:opacity-50"
            data-testid="bill-delete-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">delete</span>
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Bill Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bill Info */}
        <div className="lg:col-span-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="bill-info-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Bill Information</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-subtle-text">Bill Number</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.billNumber}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Vendor</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.vendor?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Issue Date</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.issueDate}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">Due Date</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.dueDate}</p>
            </div>
            {bill.notes && (
              <div className="col-span-2">
                <p className="text-sm text-subtle-text">Notes</p>
                <p className="font-medium text-text-light dark:text-text-dark">{bill.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Amount Summary */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="bill-amount-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Amount Summary</h2>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between">
              <p className="text-subtle-text">Subtotal</p>
              <p className="font-medium text-text-light dark:text-text-dark">{formatCurrency(bill.subtotal)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-subtle-text">Tax</p>
              <p className="font-medium text-text-light dark:text-text-dark">{formatCurrency(bill.taxAmount)}</p>
            </div>
            <div className="flex justify-between border-t border-border-light dark:border-border-dark pt-3">
              <p className="font-bold text-text-light dark:text-text-dark">Total</p>
              <p className="font-bold text-text-light dark:text-text-dark">{formatCurrency(bill.totalAmount)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-subtle-text">Amount Paid</p>
              <p className="font-medium text-success">{formatCurrency(bill.amountPaid)}</p>
            </div>
            <div className="flex justify-between bg-primary/10 -mx-6 px-6 py-3 mt-3">
              <p className="font-bold text-primary">Balance Due</p>
              <p className="font-bold text-primary">{formatCurrency(bill.amountDue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-items-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Line Items</h2>
        </div>
        {bill.items && bill.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-items-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-right">Qty</th>
                  <th className="px-6 py-3 text-right">Unit Price</th>
                  <th className="px-6 py-3 text-right">Tax Rate</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, index) => (
                  <tr key={item.id || index} className="border-b border-border-light dark:border-border-dark">
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{item.description}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-6 py-4 text-right text-subtle-text">{item.taxRate}%</td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-items-empty">
            No line items
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-payments-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Payment History</h2>
          {bill.amountDue > 0 && (
            <Link
              to={`/payments/new?billId=${id}`}
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
            <table className="w-full text-sm" data-testid="bill-payments-table">
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
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{payment.paymentMethod}</td>
                    <td className="px-6 py-4 text-subtle-text">{payment.reference || '-'}</td>
                    <td className="px-6 py-4 text-right font-medium text-success">{formatCurrency(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-payments-empty">
            No payments recorded yet
          </div>
        )}
      </div>

      {/* Send Bill Email Dialog */}
      {showSendDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="send-bill-dialog">
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark w-full max-w-md mx-4 shadow-xl">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Send Bill</h3>
              <button
                onClick={() => setShowSendDialog(false)}
                className="text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-subtle-text">
                Send bill <strong>{bill?.billNumber}</strong> with a frontend-generated PDF attachment.
              </p>

              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Vendor Name"
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
                  placeholder="recipient@example.com"
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
                  Bill sent successfully!
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
                onClick={handleSendBill}
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
                    Send Bill
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
    PARTIAL: 'bg-info/10 text-info',
    PENDING: 'bg-warning/10 text-warning',
    OVERDUE: 'bg-danger/10 text-danger',
    DRAFT: 'bg-subtle-text/10 text-subtle-text',
    CANCELLED: 'bg-subtle-text/10 text-subtle-text',
  };
  return styles[status] || styles.DRAFT;
}
