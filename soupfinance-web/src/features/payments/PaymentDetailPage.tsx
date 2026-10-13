/**
 * Payment Detail Page
 * Shows one invoice (incoming) or bill (outgoing) payment and lets the user void it.
 * Reference: soupfinance-designs/panel-invoice-detail-slideover/ (header, summary card, footer actions)
 *
 * Added (SOUPFIN-177): route /payments/:type/:id where type is "invoice" or "bill".
 * Voiding calls the payment's DELETE endpoint, then refreshes every query that
 * shows the payment or its parent document so amountDue and status update.
 * Changed (SOUPFIN-177): every string comes from the `payments` namespace (detail.*)
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getInvoicePayment, deleteInvoicePayment } from '../../api/endpoints/invoices';
import { getBillPayment, deleteBillPayment } from '../../api/endpoints/bills';
import type { PaymentType } from '../../api/endpoints/payments';
import { DeleteBlockedError, DeletePendingApprovalError } from '../../api/endpoints/deleteOutcome';
import { getApiErrorMessage } from '../../api/errors';
import { useFormatCurrency } from '../../stores';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { useToast } from '../../components/feedback/ToastProvider';
import { HelpLink } from '../../components/help';
import type { InvoicePayment, BillPayment } from '../../types';
import {
  getPaymentMethodName,
  getPaymentMethodBadgeStyle,
  describeInvoiceRef,
  describeBillRef,
  describeAccountRef,
} from './paymentDisplay';

function isPaymentType(value: string | undefined): value is PaymentType {
  return value === 'invoice' || value === 'bill';
}

/** Message shown in the void dialog when the backend did not delete. */
function voidErrorMessage(error: unknown, t: TFunction<'payments'>): string {
  if (error instanceof DeletePendingApprovalError) {
    return t('detail.voidPending');
  }
  if (error instanceof DeleteBlockedError) {
    return error.relatedModules.length
      ? t('detail.voidBlockedModules', { modules: error.relatedModules.join(', ') })
      : t('detail.voidBlocked');
  }
  return getApiErrorMessage(error);
}

export function PaymentDetailPage() {
  const { t } = useTranslation('payments');
  const { type: typeParam, id } = useParams<{ type: string; id: string }>();
  const type = isPaymentType(typeParam) ? typeParam : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const { showToast } = useToast();
  const { data: paymentMethods } = usePaymentMethods();
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const backPath = type === 'bill' ? '/payments?tab=outgoing' : '/payments';

  const {
    data: payment,
    isLoading,
    error,
  } = useQuery<InvoicePayment | BillPayment>({
    queryKey: [type === 'bill' ? 'bill-payment' : 'invoice-payment', id],
    queryFn: () => (type === 'bill' ? getBillPayment(id!) : getInvoicePayment(id!)),
    enabled: !!id && !!type,
    retry: false,
  });

  const documentId =
    type === 'bill'
      ? (payment as BillPayment | undefined)?.bill?.id
      : (payment as InvoicePayment | undefined)?.invoice?.id;

  const voidMutation = useMutation({
    mutationFn: () => (type === 'bill' ? deleteBillPayment(id!) : deleteInvoicePayment(id!)),
    onSuccess: () => {
      // Payment lists (Payments page + the parent's payment history), the parent
      // document (amountDue/status) and its list, and the dashboard figures.
      if (type === 'bill') {
        queryClient.invalidateQueries({ queryKey: ['bill-payments'] });
        queryClient.invalidateQueries({ queryKey: ['bills'] });
        queryClient.invalidateQueries({ queryKey: ['bills-for-payment'] });
        if (documentId) queryClient.invalidateQueries({ queryKey: ['bill', documentId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoices-for-payment'] });
        if (documentId) queryClient.invalidateQueries({ queryKey: ['invoice', documentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.removeQueries({ queryKey: [type === 'bill' ? 'bill-payment' : 'invoice-payment', id] });
      setShowVoidDialog(false);
      showToast({ variant: 'success', message: t('detail.voided') });
      navigate(backPath);
    },
  });

  // Focus the safe choice when the dialog opens; Escape closes it.
  useEffect(() => {
    if (!showVoidDialog) return;
    cancelButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !voidMutation.isPending) setShowVoidDialog(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showVoidDialog, voidMutation.isPending]);

  const openVoidDialog = () => {
    voidMutation.reset();
    setShowVoidDialog(true);
  };

  const backLink = (
    <Link
      to={backPath}
      className="inline-flex items-center gap-1 text-sm font-medium text-subtle-text hover:text-primary"
      data-testid="payment-detail-back"
    >
      <span className="material-symbols-outlined text-lg">arrow_back</span>
      {type === 'bill' ? t('detail.backOutgoing') : t('detail.backIncoming')}
    </Link>
  );

  if (!type) {
    return (
      <div className="flex flex-col gap-6" data-testid="payment-detail-page">
        {backLink}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="payment-detail-not-found">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('detail.notFoundTitle')}</h2>
          <p className="text-subtle-text">{t('detail.notFoundBody')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="payment-detail-page">
        {backLink}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="payment-detail-loading">
          {t('detail.loading')}
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="flex flex-col gap-6" data-testid="payment-detail-page">
        {backLink}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="payment-detail-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('detail.loadErrorTitle')}</h2>
          <p className="text-subtle-text">
            {error ? getApiErrorMessage(error) : t('detail.loadErrorMissing')}
          </p>
        </div>
      </div>
    );
  }

  const isIncoming = type === 'invoice';
  const doc = isIncoming
    ? describeInvoiceRef((payment as InvoicePayment).invoice)
    : describeBillRef((payment as BillPayment).bill);
  const account = describeAccountRef(
    isIncoming ? (payment as InvoicePayment).payInAccount : (payment as BillPayment).payOutAccount
  );
  const reference = payment.reference || payment.quickReference;
  const methodName = getPaymentMethodName(payment.paymentMethod, paymentMethods);

  const fields: Array<{ label: string; value: ReactNode; testId: string }> = [
    { label: t('detail.paymentDate'), value: payment.paymentDate || '-', testId: 'payment-detail-date' },
    {
      label: t('detail.method'),
      value: (
        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getPaymentMethodBadgeStyle(payment.paymentMethod)}`}>
          {methodName}
        </span>
      ),
      testId: 'payment-detail-method',
    },
    {
      label: isIncoming ? t('detail.depositedTo') : t('detail.paidFrom'),
      value: account || '-',
      testId: 'payment-detail-account',
    },
    { label: t('detail.reference'), value: reference || '-', testId: 'payment-detail-reference' },
    { label: t('detail.currency'), value: payment.currency || '-', testId: 'payment-detail-currency' },
    {
      label: t('detail.recorded'),
      value: payment.dateCreated ? payment.dateCreated.slice(0, 10) : '-',
      testId: 'payment-detail-recorded',
    },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl" data-testid="payment-detail-page">
      {backLink}

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="payment-detail-heading">
              {isIncoming ? t('detail.headingIncoming') : t('detail.headingOutgoing')}
            </h1>
            <span
              className={`px-2.5 py-0.5 text-xs font-bold uppercase rounded-full ${
                isIncoming ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              {isIncoming ? t('detail.badgeIncoming') : t('detail.badgeOutgoing')}
            </span>
          </div>
          <p className="text-subtle-text">
            {t('detail.recordedAgainst', {
              document: doc.party ? `${doc.label} · ${doc.party}` : doc.label,
            })}
          </p>
          <HelpLink section="payments" className="mt-1 self-start" />
        </div>
        <button
          type="button"
          onClick={openVoidDialog}
          className="flex items-center gap-2 h-10 px-4 rounded-lg border border-danger text-danger font-bold text-sm hover:bg-danger/10"
          data-testid="payment-void-button"
        >
          <span className="material-symbols-outlined text-lg">block</span>
          {t('detail.voidButton')}
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 shadow-sm" data-testid="payment-detail-card">
        <div className="flex flex-wrap justify-between gap-6 pb-6 border-b border-border-light dark:border-border-dark">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle-text">
              {isIncoming ? t('detail.invoice') : t('detail.bill')}
            </p>
            {documentId ? (
              <Link
                to={`/${isIncoming ? 'invoices' : 'bills'}/${documentId}`}
                className="text-xl font-bold text-primary hover:underline"
                data-testid="payment-detail-document-link"
              >
                {doc.label}
              </Link>
            ) : (
              <p className="text-xl font-bold text-text-light dark:text-text-dark">{doc.label}</p>
            )}
            {doc.party && (
              <p className="text-sm text-subtle-text" data-testid="payment-detail-party">
                {doc.party}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle-text">{t('detail.amount')}</p>
            <p
              className={`text-3xl font-black ${isIncoming ? 'text-success' : 'text-danger'}`}
              data-testid="payment-detail-amount"
            >
              {isIncoming ? '+' : '-'}
              {formatCurrency(payment.amount)}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 pt-6">
          {fields.map((field) => (
            <div key={field.testId} className="flex flex-col gap-1 min-w-0">
              <dt className="text-sm text-subtle-text">{field.label}</dt>
              <dd className="text-sm font-medium text-text-light dark:text-text-dark break-words" data-testid={field.testId}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
        {payment.notes && (
          <div className="pt-6 mt-6 border-t border-border-light dark:border-border-dark">
            <p className="text-sm text-subtle-text mb-1">{t('detail.notes')}</p>
            <p className="text-sm text-text-light dark:text-text-dark whitespace-pre-wrap" data-testid="payment-detail-notes">
              {payment.notes}
            </p>
          </div>
        )}
      </div>

      {/* Void confirmation */}
      {showVoidDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" data-testid="payment-void-dialog">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-void-title"
            className="relative w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <h2 id="payment-void-title" className="text-xl font-bold text-text-light dark:text-text-dark">
                {t('detail.voidTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setShowVoidDialog(false)}
                disabled={voidMutation.isPending}
                className="flex size-8 items-center justify-center rounded-full text-subtle-text hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={t('detail.close')}
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 text-sm text-text-light dark:text-text-dark">
              <p>
                {t(isIncoming ? 'detail.voidBodyInvoice' : 'detail.voidBodyBill', {
                  amount: formatCurrency(payment.amount),
                  document: doc.label,
                })}
              </p>
              {voidMutation.isError && (
                <p className="rounded-lg bg-danger/10 text-danger p-3" role="alert" data-testid="payment-void-error">
                  {voidErrorMessage(voidMutation.error, t)}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => setShowVoidDialog(false)}
                disabled={voidMutation.isPending}
                className="h-10 px-4 rounded-lg text-sm font-bold text-text-light dark:text-text-dark ring-1 ring-border-light dark:ring-border-dark hover:bg-black/5 dark:hover:bg-white/5"
                data-testid="payment-void-cancel"
              >
                {t('detail.keepPayment')}
              </button>
              <button
                type="button"
                onClick={() => voidMutation.mutate()}
                disabled={voidMutation.isPending}
                className="flex items-center gap-2 h-10 px-4 rounded-lg bg-danger text-white text-sm font-bold hover:bg-danger/90 disabled:opacity-60"
                data-testid="payment-void-confirm"
              >
                <span className="material-symbols-outlined text-lg">block</span>
                {voidMutation.isPending ? t('detail.voiding') : t('detail.voidButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
