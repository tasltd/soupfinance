/**
 * Bill List Page
 * Reference: soupfinance-designs/invoice-management/ (adapted for bills)
 *
 * Added: Full API integration with listBills endpoint
 * Added: Loading, empty, and error states
 * Added: data-testid attributes for E2E testing
 * Changed: Uses dynamic currency formatting from account settings
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listBills } from '../../api/endpoints/bills';
import { useFormatCurrency } from '../../stores';

export function BillListPage() {
  // Added: Fetch bills from API
  const { data: bills, isLoading, error } = useQuery({
    queryKey: ['bills'],
    queryFn: () => listBills({ max: 20, sort: 'dateCreated', order: 'desc' }),
  });

  // Changed: Use dynamic currency formatting from account settings
  const formatCurrency = useFormatCurrency();

  return (
    <div className="flex flex-col gap-6" data-testid="bill-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="bill-list-heading">
            Bills
          </h1>
          <p className="text-subtle-text">Manage your expenses and bills</p>
        </div>
        <Link
          to="/bills/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="bill-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Bill
        </Link>
      </div>

      {/* Bill Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-list-loading">Loading bills...</div>
        ) : error ? (
          // Added: Error state when API fails
          <div className="p-12 text-center" data-testid="bill-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load bills</h3>
            <p className="text-subtle-text mb-4">There was an error loading your bills. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : bills?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Bill #</th>
                  <th className="px-6 py-3 text-left">Vendor</th>
                  <th className="px-6 py-3 text-left">Issue Date</th>
                  <th className="px-6 py-3 text-left">Due Date</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-right">Balance Due</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`bill-row-${bill.id}`}>
                    <td className="px-6 py-4">
                      <Link to={`/bills/${bill.id}`} className="font-medium text-primary hover:underline" data-testid={`bill-link-${bill.id}`}>
                        {bill.billNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">{bill.vendor?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-subtle-text">{bill.issueDate}</td>
                    <td className="px-6 py-4 text-subtle-text">{bill.dueDate}</td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(bill.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(bill.amountDue)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusStyle(bill.status)}`} data-testid={`bill-status-${bill.id}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link to={`/bills/${bill.id}/edit`} className="text-primary hover:underline text-sm" data-testid={`bill-edit-${bill.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Added: Empty state when no bills exist
          <div className="p-12 text-center" data-testid="bill-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">receipt</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No bills yet</h3>
            <p className="text-subtle-text mb-4">Track your expenses by adding bills from vendors.</p>
            <Link to="/bills/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm" data-testid="bill-create-first-button">
              <span className="material-symbols-outlined text-lg">add</span>
              Create Bill
            </Link>
          </div>
        )}
      </div>
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
