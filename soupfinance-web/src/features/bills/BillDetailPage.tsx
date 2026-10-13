/**
 * Bill Detail Page
 * Shows bill details, line items, and payment history
 *
 * Added: Full API integration with getBill endpoint
 * Added: Loading, error, and content states
 * Added: data-testid attributes for E2E testing
 * Updated: Frontend PDF generation and email sending
 * Changed (SOUPFIN-183): every string goes through the `bills` namespace and the
 *   status badge is translated through billStatusLabel instead of the raw enum
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ELEMENT_SLOT, withElement } from '../../i18n/withElement';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Added (SOUPFIN-160): module-aware error card for a failed bill load
import { ApiErrorState } from '../../components/feedback';
import { getBill, deleteBill, listBillPayments, resolveBillItemTaxRate } from '../../api/endpoints/bills';
import { listTaxRates } from '../../api/endpoints/domainData';
import { useFormatCurrency } from '../../stores';
import { usePdf, useEmailSend } from '../../hooks';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import { billStatusLabel, billStatusStyle } from './billStatus';

export function BillDetailPage() {
  const { t } = useTranslation('bills');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fix (SOUPFIN-38): BillItem has no taxRate column and the backend does not
  // serialise the derived getter, so the Tax Rate column rendered "undefined%".
  // Resolve the line's TaxEntry from its join rows against the real catalogue.
  const { data: taxRates } = useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => listTaxRates(),
  });
  const formatCurrency = useFormatCurrency();
  const { generateBill, isGenerating: isPdfGenerating } = usePdf();
  const { sendBill: sendBillEmail, isSending: isEmailSending, error: emailError, success: emailSuccess, reset: resetEmailState } = useEmailSend();

  // State for send email dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // Added: Fetch bill details from API
  const { data: bill, isLoading, error, refetch } = useQuery({
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
    if (window.confirm(t('detail.confirmDelete'))) {
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
          {t('detail.loading')}
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="flex flex-col gap-6" data-testid="bill-detail-page">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">{t('billDetails')}</h1>
          <Link to="/bills" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center">
            {t('detail.backToBills')}
          </Link>
        </div>
        {/* Changed (SOUPFIN-160): a failed load says why (module disabled, no
            permission, server fault); "not found" is kept for an empty answer. */}
        {error ? (
          <ApiErrorState error={error} onRetry={() => refetch()} testId="bill-detail-error" />
        ) : (
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="bill-detail-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('detail.notFoundTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('detail.notFoundBody')}</p>
            <Link to="/bills" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm">
              {t('detail.backToBills')}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="bill-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="bill-detail-heading">
            {t('detail.heading', { number: bill.billNumber })}
          </h1>
          <p className="text-subtle-text">
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${billStatusStyle(bill.status)}`} data-testid="bill-detail-status">
              {billStatusLabel(t, bill.status)}
            </span>
          </p>
          <HelpLink section="bills" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <Link to="/bills" className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm flex items-center hover:bg-primary/5">
            {t('detail.back')}
          </Link>
          <button
            onClick={() => generateBill(bill)}
            disabled={isPdfGenerating}
            className="h-10 px-4 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-sm flex items-center hover:bg-purple-500/20 disabled:opacity-50"
            data-testid="bill-download-pdf-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">download</span>
            {isPdfGenerating ? t('detail.generatingPdf') : t('detail.downloadPdf')}
          </button>
          <button
            onClick={handleOpenSendDialog}
            className="h-10 px-4 rounded-lg bg-info/10 text-info font-bold text-sm flex items-center hover:bg-info/20"
            data-testid="bill-send-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">send</span>
            {t('detail.send')}
          </button>
          <Link
            to={`/bills/${id}/edit`}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm flex items-center hover:bg-primary/30"
            data-testid="bill-edit-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">edit</span>
            {t('detail.edit')}
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="h-10 px-4 rounded-lg bg-danger/10 text-danger font-bold text-sm flex items-center hover:bg-danger/20 disabled:opacity-50"
            data-testid="bill-delete-button"
          >
            <span className="material-symbols-outlined text-lg mr-2">delete</span>
            {deleteMutation.isPending ? t('detail.deleting') : t('detail.delete')}
          </button>
        </div>
      </div>

      {/* Bill Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bill Info */}
        <div className="lg:col-span-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="bill-info-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t('detail.infoTitle')}</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-subtle-text">{t('detail.billNumber')}</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.billNumber}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">{t('detail.vendor')}</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.vendor?.name || t('notAvailable')}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">{t('detail.billDate')}</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.billDate}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text">{t('detail.dueDate')}</p>
              <p className="font-medium text-text-light dark:text-text-dark">{bill.paymentDate}</p>
            </div>
            {bill.notes && (
              <div className="col-span-2">
                <p className="text-sm text-subtle-text">{t('detail.notes')}</p>
                <p className="font-medium text-text-light dark:text-text-dark">{bill.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Amount Summary */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="bill-amount-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t('detail.amountTitle')}</h2>
          </div>
          {/*
            Fix (SOUPFIN-43): these read the NORMALISED header amounts. The backend
            spells them subTotal / totalTaxAmount / total / paidAmount, so before
            `transformBill()` mapped them every row here rendered 0.00 while Balance
            Due — the one name that happened to collide — was right. Test ids added
            so the regression is assertable through the UI rather than by eye.
          */}
          <div className="p-6 space-y-3">
            <div className="flex justify-between">
              <p className="text-subtle-text">{t('detail.subtotal')}</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="bill-detail-subtotal">{formatCurrency(bill.subtotal)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-subtle-text">{t('detail.tax')}</p>
              <p className="font-medium text-text-light dark:text-text-dark" data-testid="bill-detail-tax">{formatCurrency(bill.taxAmount)}</p>
            </div>
            <div className="flex justify-between border-t border-border-light dark:border-border-dark pt-3">
              <p className="font-bold text-text-light dark:text-text-dark">{t('detail.total')}</p>
              <p className="font-bold text-text-light dark:text-text-dark" data-testid="bill-detail-total">{formatCurrency(bill.totalAmount)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-subtle-text">{t('detail.amountPaid')}</p>
              <p className="font-medium text-success" data-testid="bill-detail-amount-paid">{formatCurrency(bill.amountPaid)}</p>
            </div>
            <div className="flex justify-between bg-primary/10 -mx-6 px-6 py-3 mt-3">
              <p className="font-bold text-primary">{t('detail.balanceDue')}</p>
              <p className="font-bold text-primary" data-testid="bill-detail-balance-due">{formatCurrency(bill.amountDue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-items-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t('detail.lineItemsTitle')}</h2>
        </div>
        {bill.billItemList && bill.billItemList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-items-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">{t('detail.lineColumns.description')}</th>
                  <th className="px-6 py-3 text-right">{t('detail.lineColumns.quantity')}</th>
                  <th className="px-6 py-3 text-right">{t('detail.lineColumns.unitPrice')}</th>
                  <th className="px-6 py-3 text-right">{t('detail.lineColumns.taxRate')}</th>
                  <th className="px-6 py-3 text-right">{t('detail.lineColumns.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {bill.billItemList.map((item, index) => (
                  <tr key={item.id || index} className="border-b border-border-light dark:border-border-dark">
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{item.description}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-6 py-4 text-right text-subtle-text">
                      {(() => {
                        // Fix (SOUPFIN-44): resolve the RATE, not the id. Looking the
                        // rate up by `resolveBillItemTaxEntryId` matched NO_TAX_OPTION
                        // (id '', rate 0) whenever the line's TaxEntry could not be
                        // resolved, so a taxed line was labelled "0%" — a positive claim
                        // of no tax, contradicting the Tax figure in the Amount Summary
                        // above it. `null` now means UNKNOWN and renders the dash; a line
                        // with no tax rows at all still reports a truthful 0%.
                        const rate = resolveBillItemTaxRate(item, taxRates);
                        return rate != null ? `${rate}%` : '—';
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-items-empty">
            {t('detail.noLineItems')}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-payments-card">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{t('detail.paymentsTitle')}</h2>
          {/* Added (SOUPFIN-81): how recording a payment works */}
          <HelpLink section="record-payment" className="ml-auto" />
          {bill.amountDue > 0 && (
            <Link
              to={`/payments/new?billId=${id}`}
              className="h-9 px-3 rounded-lg bg-primary text-white font-bold text-sm flex items-center hover:bg-primary/90"
              data-testid="record-payment-button"
            >
              <span className="material-symbols-outlined text-base mr-1">add</span>
              {t('detail.recordPayment')}
            </Link>
          )}
        </div>
        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-payments-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">{t('detail.paymentColumns.date')}</th>
                  <th className="px-6 py-3 text-left">{t('detail.paymentColumns.method')}</th>
                  <th className="px-6 py-3 text-left">{t('detail.paymentColumns.reference')}</th>
                  <th className="px-6 py-3 text-right">{t('detail.paymentColumns.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border-light dark:border-border-dark">
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{payment.paymentDate}</td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{payment.paymentMethod?.name || '-'}</td>
                    <td className="px-6 py-4 text-subtle-text">{payment.reference || '-'}</td>
                    <td className="px-6 py-4 text-right font-medium text-success">{formatCurrency(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-payments-empty">
            {t('detail.noPayments')}
          </div>
        )}
      </div>

      {/* Send Bill Email Dialog */}
      {showSendDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="send-bill-dialog">
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark w-full max-w-md mx-4 shadow-xl">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">{t('detail.sendDialog.title')}</h3>
              <button
                onClick={() => setShowSendDialog(false)}
                aria-label={t('detail.sendDialog.close')}
                className="text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-subtle-text">
                {withElement(
                  t('detail.sendDialog.intro', { number: ELEMENT_SLOT }),
                  <strong>{bill?.billNumber}</strong>
                )}
              </p>

              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  {t('detail.sendDialog.recipientName')}
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder={t('detail.sendDialog.recipientNamePlaceholder')}
                  className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
                  data-testid="send-recipient-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  {t('detail.sendDialog.recipientEmail')} <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder={t('detail.sendDialog.recipientEmailPlaceholder')}
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
                  {t('detail.sendDialog.success')}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
              <button
                onClick={() => setShowSendDialog(false)}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm"
              >
                {t('detail.sendDialog.cancel')}
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
                    {t('detail.sendDialog.sending')}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg mr-2">send</span>
                    {t('detail.sendDialog.submit')}
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

