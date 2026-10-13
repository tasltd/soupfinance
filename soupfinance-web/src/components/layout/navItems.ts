/**
 * Side navigation entries (moved out of SideNav.tsx for SOUPFIN-181).
 * Reference: soupfinance-designs/balance-sheet-report/
 */
import { isAnyModuleEnabled } from '../../stores/accountStore';
import type { ModuleGroup } from '../../api/endpoints/modules';

// Added (SOUPFIN-181): `modules` names the backend module(s) whose interceptor gates the
// page's controllers. The entry is shown when the tenant has ANY of them, or when the
// tenant's modules are not known. Without this a FINANCE-less tenant clicked Payments,
// Ledger or Accounting and got a page whose every request was a guaranteed 403.
export interface NavChild {
  label: string;
  path: string;
  modules?: ModuleGroup[];
}

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  modules?: ModuleGroup[];
  children?: NavChild[];
}

// Added (SOUPFIN-181): FinanceModuleInterceptor gates invoice, invoicePayment, bill,
// billPayment, ledgerAccount, ledgerTransaction, voucher, reportSchedule, financialYear.
const FINANCE: ModuleGroup[] = ['FINANCE'];

// Changed (2026-01-28): Added Vendors, Accounting section, Trial Balance to Reports
export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'Invoices', icon: 'receipt_long', path: '/invoices', modules: FINANCE },
  { label: 'Bills', icon: 'receipt', path: '/bills', modules: FINANCE },
  // Added: Vendors navigation item
  // Fix (SOUPFIN-173): shown for every business category. SOUPFIN-25 hid it for
  // SERVICES tenants, but service businesses still pay rent, utilities and
  // contractors: Bills requires a vendor, so hiding the list left vendor
  // management reachable only from the bill form's "+" link.
  // Added (SOUPFIN-181): TradingModuleInterceptor lets vendor through with TRADING or FINANCE
  { label: 'Vendors', icon: 'storefront', path: '/vendors', modules: ['TRADING', 'FINANCE'] },
  // Added: Clients navigation item (gap analysis §4.5 - was only reachable via invoice form)
  { label: 'Clients', icon: 'people', path: '/clients' },
  { label: 'Payments', icon: 'payments', path: '/payments', modules: FINANCE },
  {
    label: 'Ledger',
    icon: 'account_balance',
    path: '/ledger',
    modules: FINANCE,
    children: [
      { label: 'Chart of Accounts', path: '/ledger/accounts' },
      { label: 'Transactions', path: '/ledger/transactions' },
    ],
  },
  // Added: Accounting section for journal entries, vouchers
  {
    label: 'Accounting',
    icon: 'calculate',
    path: '/accounting',
    modules: FINANCE,
    children: [
      { label: 'Transaction Register', path: '/accounting/transactions' },
      { label: 'Journal Entry', path: '/accounting/journal-entry' },
      { label: 'Payment Voucher', path: '/accounting/voucher/payment' },
      { label: 'Receipt Voucher', path: '/accounting/voucher/receipt' },
    ],
  },
  {
    label: 'Reports',
    icon: 'analytics',
    path: '/reports',
    children: [
      { label: 'All Reports', path: '/reports' },
      { label: 'Profit & Loss', path: '/reports/pnl' },
      { label: 'Balance Sheet', path: '/reports/balance-sheet' },
      { label: 'Cash Flow', path: '/reports/cash-flow' },
      { label: 'Aging Reports', path: '/reports/aging' },
      // Added: Trial Balance report
      { label: 'Trial Balance', path: '/reports/trial-balance' },
      // Added: Scheduled Reports for automated delivery
      { label: 'Scheduled Reports', path: '/reports/scheduled', modules: FINANCE },
    ],
  },
  // Added (2026-01-30): Settings section
  {
    label: 'Settings',
    icon: 'settings',
    path: '/settings',
    children: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Bank Accounts', path: '/settings/bank-accounts' },
      { label: 'Account Settings', path: '/settings/account' },
      // Added (SOUPFIN-158)
      { label: 'Financial Years', path: '/settings/financial-years', modules: FINANCE },
    ],
  },
];

/**
 * Added (SOUPFIN-181): drop entries whose module the tenant lacks. A section loses the
 * children it cannot open, and disappears when none are left.
 */
export function filterNavItems(items: NavItem[], enabledModules: ModuleGroup[] | null | undefined): NavItem[] {
  return items.flatMap((item) => {
    if (!isAnyModuleEnabled(enabledModules, item.modules)) return [];
    if (!item.children) return [item];
    const children = item.children.filter((child) => isAnyModuleEnabled(enabledModules, child.modules));
    return children.length > 0 ? [{ ...item, children }] : [];
  });
}
