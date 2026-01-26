/**
 * Reports Hub Page - Stub
 */
import { Link } from 'react-router-dom';

const reports = [
  { title: 'Profit & Loss', description: 'Revenue, expenses, and net income', icon: 'trending_up', path: '/reports/pnl' },
  { title: 'Balance Sheet', description: 'Assets, liabilities, and equity', icon: 'account_balance', path: '/reports/balance-sheet' },
  { title: 'Cash Flow', description: 'Cash movements and liquidity', icon: 'water_drop', path: '/reports/cash-flow' },
  { title: 'Aging Reports', description: 'Outstanding receivables and payables', icon: 'schedule', path: '/reports/aging' },
  // Added: Trial Balance report link
  { title: 'Trial Balance', description: 'Debit and credit balances for all accounts', icon: 'balance', path: '/reports/trial-balance' },
];

// Added: data-testid attributes for E2E testing
export function ReportsPage() {
  return (
    <div className="flex flex-col gap-6" data-testid="reports-page">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="reports-heading">Reports</h1>
        <p className="text-subtle-text">Financial reports and analytics</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reports.map((report) => (
          <Link
            key={report.path}
            to={report.path}
            className="flex flex-col gap-3 p-6 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-primary transition-colors"
          >
            <span className="material-symbols-outlined text-3xl text-primary">{report.icon}</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark">{report.title}</h3>
            <p className="text-sm text-subtle-text">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
