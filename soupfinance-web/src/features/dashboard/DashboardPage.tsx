/**
 * Dashboard Page
 * Financial overview with KPIs and recent activity
 * Reference: soupfinance-designs/financial-overview-dashboard/
 *
 * Changed: Now fetches dashboard stats from API via useDashboardStats hook
 */
import { useQuery } from '@tanstack/react-query';
import { listInvoices } from '../../api';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useFormatCurrency } from '../../stores';

// Added: Format percentage change for display
function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

export function DashboardPage() {
  const formatCurrency = useFormatCurrency();

  // Changed: Added error state handling for API failures
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();

  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ['invoices', { max: 5 }],
    queryFn: () => listInvoices({ max: 5, sort: 'dateCreated', order: 'desc' }),
  });

  // Added: data-testid attributes for E2E testing
  return (
    <div className="flex flex-col gap-8" data-testid="dashboard-page">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="dashboard-heading">
          Financial Overview
        </h1>
        <p className="text-base text-subtle-text">
          Welcome back! Here's your financial snapshot.
        </p>
      </div>

      {/* KPI Cards - Changed: Now using dynamic data from useDashboardStats hook */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-kpi-cards">
        {statsLoading ? (
          // Added: Loading skeleton for stats
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : statsError ? (
          // Added: Error state for stats
          <div className="col-span-full bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center" data-testid="dashboard-stats-error">
            <span className="material-symbols-outlined text-4xl text-danger/50 mb-2">error</span>
            <p className="text-subtle-text">Failed to load dashboard stats</p>
          </div>
        ) : (
          <>
            <StatCard
              label="Total Revenue"
              value={formatCurrency(stats?.totalRevenue ?? 0)}
              change={formatChange(stats?.totalRevenueChange ?? 0)}
              changeType={stats?.totalRevenueChange && stats.totalRevenueChange >= 0 ? 'positive' : 'negative'}
              icon="trending_up"
              testId="stat-total-revenue"
            />
            <StatCard
              label="Outstanding Invoices"
              value={formatCurrency(stats?.outstandingInvoices ?? 0)}
              change={`${stats?.outstandingInvoicesCount ?? 0} invoices`}
              changeType="neutral"
              icon="receipt_long"
              testId="stat-outstanding-invoices"
            />
            <StatCard
              label="Expenses (MTD)"
              value={formatCurrency(stats?.expensesMTD ?? 0)}
              change={formatChange(stats?.expensesMTDChange ?? 0)}
              changeType={stats?.expensesMTDChange && stats.expensesMTDChange <= 0 ? 'positive' : 'negative'}
              icon="trending_down"
              testId="stat-expenses"
            />
            <StatCard
              label="Net Profit"
              value={formatCurrency(stats?.netProfit ?? 0)}
              change={formatChange(stats?.netProfitChange ?? 0)}
              changeType={stats?.netProfitChange && stats.netProfitChange >= 0 ? 'positive' : 'negative'}
              icon="account_balance"
              testId="stat-net-profit"
            />
          </>
        )}
      </div>

      {/* Recent Invoices */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="dashboard-recent-invoices">
        <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">
            Recent Invoices
          </h2>
          <a
            href="/invoices"
            className="text-sm text-primary hover:underline font-medium"
            data-testid="dashboard-view-all-invoices"
          >
            View all
          </a>
        </div>
        <div className="overflow-x-auto">
          {invoicesLoading ? (
            <div className="p-8 text-center text-subtle-text" data-testid="dashboard-invoices-loading">Loading...</div>
          ) : invoicesError ? (
            // Added: Error state for invoices
            <div className="p-8 text-center text-subtle-text" data-testid="dashboard-invoices-error">
              Failed to load recent invoices
            </div>
          ) : invoices?.length ? (
            <table className="w-full text-sm" data-testid="dashboard-invoices-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Invoice #</th>
                  <th className="px-6 py-3 text-left">Client</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                    data-testid={`dashboard-invoice-row-${invoice.id}`}
                  >
                    <td className="px-6 py-4 font-medium text-primary">
                      {String(invoice.number)}
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {invoice.accountServices?.serialised || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right text-text-light dark:text-text-dark">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {/* Fix: invoice.status is optional, default to DRAFT */}
                      <StatusBadge status={invoice.status || 'DRAFT'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-subtle-text" data-testid="dashboard-no-invoices">
              No invoices yet. Create your first invoice to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stat Card Component - Added: testId prop for E2E testing
function StatCard({
  label,
  value,
  change,
  changeType,
  icon,
  testId,
}: {
  label: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: string;
  testId?: string;
}) {
  const changeColor = {
    positive: 'text-success',
    negative: 'text-danger',
    neutral: 'text-subtle-text',
  }[changeType];

  return (
    <div className="flex flex-col gap-3 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-subtle-text text-sm font-medium">{label}</p>
        <span className="material-symbols-outlined text-primary">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-text-light dark:text-text-dark tracking-tight" data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </p>
      <p className={`text-sm font-medium ${changeColor}`} data-testid={testId ? `${testId}-change` : undefined}>{change}</p>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const styles = {
    PAID: 'bg-success/10 text-success',
    SENT: 'bg-info/10 text-info',
    PENDING: 'bg-warning/10 text-warning',
    OVERDUE: 'bg-danger/10 text-danger',
    DRAFT: 'bg-subtle-text/10 text-subtle-text',
  }[status] || 'bg-subtle-text/10 text-subtle-text';

  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${styles}`}>
      {status}
    </span>
  );
}

// Added: Loading skeleton for stat cards
function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
        <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
    </div>
  );
}
