/**
 * Invoice List Page
 * Reference: soupfinance-designs/invoice-management/
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listInvoices } from '../../api';
import { useFormatCurrency } from '../../stores';

export function InvoiceListPage() {
  const formatCurrency = useFormatCurrency();

  // Changed: Added error state handling for API failures
  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => listInvoices({ max: 20, sort: 'dateCreated', order: 'desc' }),
  });

  // Added: data-testid attributes for E2E testing
  return (
    <div className="flex flex-col gap-6" data-testid="invoice-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="invoice-list-heading">
            Invoices
          </h1>
          <p className="text-subtle-text">Manage and track your invoices</p>
        </div>
        <Link
          to="/invoices/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="invoice-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Invoice
        </Link>
      </div>

      {/* Invoice Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="invoice-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="invoice-list-loading">Loading invoices...</div>
        ) : error ? (
          // Added: Error state when API fails
          <div className="p-12 text-center" data-testid="invoice-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load invoices</h3>
            <p className="text-subtle-text mb-4">There was an error loading your invoices. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : invoices?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="invoice-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Invoice #</th>
                  {/* Changed: Label from Account to Client */}
                  <th className="px-6 py-3 text-left">Client</th>
                  <th className="px-6 py-3 text-left">Invoice Date</th>
                  <th className="px-6 py-3 text-left">Due Date</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`invoice-row-${invoice.id}`}>
                    <td className="px-6 py-4">
                      <Link to={`/invoices/${invoice.id}`} className="font-medium text-primary hover:underline" data-testid={`invoice-link-${invoice.id}`}>
                        {String(invoice.number)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{invoice.accountServices?.serialised || 'N/A'}</td>
                    <td className="px-6 py-4 text-subtle-text">{invoice.invoiceDate}</td>
                    <td className="px-6 py-4 text-subtle-text">{invoice.paymentDate}</td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {/* Fix: invoice.status is optional, default to DRAFT */}
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusStyle(invoice.status || 'DRAFT')}`} data-testid={`invoice-status-${invoice.id}`}>
                        {invoice.status || 'DRAFT'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link to={`/invoices/${invoice.id}/edit`} className="text-primary hover:underline text-sm" data-testid={`invoice-edit-${invoice.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="invoice-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">receipt_long</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No invoices yet</h3>
            <p className="text-subtle-text mb-4">Create your first invoice to start tracking payments.</p>
            <Link to="/invoices/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm" data-testid="invoice-create-first-button">
              <span className="material-symbols-outlined text-lg">add</span>
              Create Invoice
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    PAID: 'bg-success/10 text-success',
    SENT: 'bg-info/10 text-info',
    PENDING: 'bg-warning/10 text-warning',
    OVERDUE: 'bg-danger/10 text-danger',
    DRAFT: 'bg-subtle-text/10 text-subtle-text',
  };
  return styles[status] || styles.DRAFT;
}
