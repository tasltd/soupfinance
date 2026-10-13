/**
 * Vendor Detail Page
 * PURPOSE: Display vendor information, accounts payable summary and bill history
 * Reference: soupfinance-designs/vendor-client-management/,
 *            soupfinance-designs/vendor-payment-analysis/
 */
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getVendor, deleteVendor, listVendorBills, summariseVendorBills, type VendorBills } from '../../api';
import { useState } from 'react';
// Added (SOUPFIN-172): currency formatting + error state for the bill history
import { useFormatCurrency } from '../../stores';
import { ApiErrorState } from '../../components/feedback';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
}

export function VendorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<DeleteState>({ isOpen: false });

  // Added: Query to fetch vendor data
  const { data: vendor, isLoading, error } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id!),
    enabled: !!id,
  });

  // Added (SOUPFIN-172): the vendor's bills. The AP summary is computed from
  // these because the backend has no paymentSummary action yet.
  const billsQuery = useQuery({
    queryKey: ['vendor-bills', id],
    queryFn: () => listVendorBills(id!),
    enabled: !!id,
  });
  const formatCurrency = useFormatCurrency();

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteVendor(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      navigate('/vendors');
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading vendor...
        </div>
      </div>
    );
  }

  // Error state
  if (error || !vendor) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
        <div className="p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Vendor not found</h3>
          <p className="text-subtle-text mb-4">The vendor you're looking for doesn't exist or has been deleted.</p>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            Back to Vendors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1 text-sm text-subtle-text hover:text-primary mb-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Vendors
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            {vendor.name}
          </h1>
          <p className="text-subtle-text">Vendor Details</p>
          <HelpLink section="vendors" className="mt-1 self-start" />
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Added (SOUPFIN-172): start a bill with this vendor already chosen */}
          <Link
            to={`/bills/new?vendorId=${encodeURIComponent(id!)}`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30"
            data-testid="vendor-detail-create-bill"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Create bill
          </Link>
          <button
            onClick={() => setDeleteState({ isOpen: true })}
            className="h-10 px-4 rounded-lg border border-danger text-danger font-medium text-sm hover:bg-danger/10"
            data-testid="vendor-detail-delete"
          >
            Delete
          </button>
          <Link
            to={`/vendors/${id}/edit`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="vendor-detail-edit"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            Edit
          </Link>
        </div>
      </div>

      {/* Added (SOUPFIN-172): accounts payable summary (PRD VND-2) */}
      <VendorBillSummaryCards
        query={billsQuery}
        formatCurrency={formatCurrency}
      />

      {/* Vendor Information Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        {/* Basic Information Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-subtle-text mb-1">Vendor Name</p>
              <p className="text-text-light dark:text-text-dark font-medium">{vendor.name}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Email</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.email || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Phone Number</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.phoneNumber || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Tax Identification Number</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.taxIdentificationNumber || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Terms Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Payment Terms</h2>
          <div>
            <p className="text-sm text-subtle-text mb-1">Payment Terms (Days)</p>
            <p className="text-text-light dark:text-text-dark">
              {vendor.paymentTerms ? `${vendor.paymentTerms} days` : <span className="text-subtle-text">Not specified</span>}
            </p>
          </div>
        </div>

        {/* Address Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Address</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.address || <span className="text-subtle-text">Not provided</span>}
          </p>
        </div>

        {/* Notes Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Additional Notes</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.notes || <span className="text-subtle-text">No notes</span>}
          </p>
        </div>
      </div>

      {/* Added (SOUPFIN-172): bill history */}
      <VendorBillHistory
        vendorId={id!}
        query={billsQuery}
        formatCurrency={formatCurrency}
      />

      {/* Delete Confirmation Modal */}
      {deleteState.isOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          data-testid="delete-confirmation-modal"
        >
          <div className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Delete Vendor</p>
              <button
                onClick={() => setDeleteState({ isOpen: false })}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-2xl text-subtle-text">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 size-12 rounded-full bg-danger/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-danger">warning</span>
                </div>
                <div>
                  <p className="text-text-light dark:text-text-dark">
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{vendor.name}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This action cannot be undone. All bills associated with this vendor will remain but
                    the vendor reference will be removed.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                onClick={() => setDeleteState({ isOpen: false })}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="delete-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="delete-confirm-button"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Added (SOUPFIN-172): AP summary and bill history
// =============================================================================

type VendorBillsQuery = UseQueryResult<VendorBills>;
type FormatCurrency = ReturnType<typeof useFormatCurrency>;

const STAT_CARDS = [
  { key: 'totalBilled', label: 'Total Billed', testId: 'vendor-summary-total-billed' },
  { key: 'totalPaid', label: 'Total Paid', testId: 'vendor-summary-total-paid' },
  { key: 'totalOutstanding', label: 'Outstanding', testId: 'vendor-summary-outstanding' },
] as const;

function VendorBillSummaryCards({
  query,
  formatCurrency,
}: {
  query: VendorBillsQuery;
  formatCurrency: FormatCurrency;
}) {
  // The bill history section below owns the error message; showing a second
  // copy here would only repeat it.
  if (query.isError) return null;

  const summary = query.data ? summariseVendorBills(query.data.bills) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="vendor-summary">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark"
          >
            <p className="text-subtle-text text-base font-medium">{card.label}</p>
            <p
              className={`tracking-tight text-2xl font-bold ${
                card.key === 'totalOutstanding' && (summary?.totalOutstanding ?? 0) > 0
                  ? 'text-primary'
                  : 'text-text-light dark:text-text-dark'
              }`}
              data-testid={card.testId}
            >
              {summary ? formatCurrency(summary[card.key]) : '\u2014'}
            </p>
          </div>
        ))}
      </div>
      {query.data && !query.data.complete && (
        <p className="text-sm text-warning" data-testid="vendor-summary-incomplete">
          These totals may be low. This business has more bills than one request can load,
          so some of this vendor&apos;s bills may be missing.
        </p>
      )}
    </div>
  );
}

function VendorBillHistory({
  vendorId,
  query,
  formatCurrency,
}: {
  vendorId: string;
  query: VendorBillsQuery;
  formatCurrency: FormatCurrency;
}) {
  const bills = query.data?.bills ?? [];

  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid="vendor-bills"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Bill History</h2>
        {query.data && (
          <span className="text-sm text-subtle-text" data-testid="vendor-bills-count">
            {bills.length === 1 ? '1 bill' : `${bills.length} bills`}
          </span>
        )}
      </div>

      {query.isLoading ? (
        <div className="p-8 text-center text-subtle-text" data-testid="vendor-bills-loading">
          Loading bills...
        </div>
      ) : query.isError ? (
        <ApiErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          testId="vendor-bills-error"
        />
      ) : bills.length === 0 ? (
        <div className="p-12 text-center" data-testid="vendor-bills-empty">
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">receipt</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
            No bills from this vendor yet
          </h3>
          <p className="text-subtle-text mb-4">Record a bill to start tracking what you owe them.</p>
          <Link
            to={`/bills/new?vendorId=${encodeURIComponent(vendorId)}`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            data-testid="vendor-bills-create-first"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Create bill
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="vendor-bills-table">
            <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left">Bill #</th>
                <th className="px-4 sm:px-6 py-3 text-left">Bill Date</th>
                <th className="px-4 sm:px-6 py-3 text-left">Due Date</th>
                <th className="px-4 sm:px-6 py-3 text-right">Amount</th>
                <th className="px-4 sm:px-6 py-3 text-right">Paid</th>
                <th className="px-4 sm:px-6 py-3 text-right">Balance Due</th>
                <th className="px-4 sm:px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr
                  key={bill.id}
                  className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                  data-testid={`vendor-bill-row-${bill.id}`}
                >
                  <td className="px-4 sm:px-6 py-4">
                    <Link
                      to={`/bills/${bill.id}`}
                      className="font-medium text-primary hover:underline break-all"
                      data-testid={`vendor-bill-link-${bill.id}`}
                    >
                      {bill.billNumber || bill.id}
                    </Link>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-subtle-text">{bill.billDate || '\u2014'}</td>
                  <td className="px-4 sm:px-6 py-4 text-subtle-text">{bill.paymentDate || '\u2014'}</td>
                  <td className="px-4 sm:px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                    {formatCurrency(bill.totalAmount)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-right text-text-light dark:text-text-dark">
                    {formatCurrency(bill.amountPaid)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                    {formatCurrency(bill.amountDue)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-center">
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getBillStatusStyle(bill.status)}`}
                      data-testid={`vendor-bill-status-${bill.id}`}
                    >
                      {bill.status || 'No status'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Badge colours for every backend PaymentStatus, plus the frontend-only ones. */
function getBillStatusStyle(status: string | null | undefined): string {
  const styles: Record<string, string> = {
    PAID: 'bg-success/10 text-success',
    PARTIAL: 'bg-info/10 text-info',
    PROCESSING: 'bg-info/10 text-info',
    PENDING: 'bg-warning/10 text-warning',
    OVERDUE: 'bg-danger/10 text-danger',
    FAILED: 'bg-danger/10 text-danger',
    EXPIRED: 'bg-subtle-text/10 text-subtle-text',
    DRAFT: 'bg-subtle-text/10 text-subtle-text',
    CANCELLED: 'bg-subtle-text/10 text-subtle-text',
  };
  return (status && styles[status]) || styles.DRAFT;
}
