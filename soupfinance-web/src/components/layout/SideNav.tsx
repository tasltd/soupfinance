/**
 * Side Navigation Component
 * Reference: soupfinance-designs/balance-sheet-report/
 */
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore, useUIStore } from '../../stores';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  children?: { label: string; path: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'Invoices', icon: 'receipt_long', path: '/invoices' },
  { label: 'Bills', icon: 'receipt', path: '/bills' },
  { label: 'Payments', icon: 'payments', path: '/payments' },
  {
    label: 'Ledger',
    icon: 'account_balance',
    path: '/ledger',
    children: [
      { label: 'Chart of Accounts', path: '/ledger/accounts' },
      { label: 'Transactions', path: '/ledger/transactions' },
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
    ],
  },
];

export function SideNav() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { sidebarCollapsed, setSidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } =
    useUIStore();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-50
          flex h-screen flex-col
          border-r border-border-light dark:border-border-dark
          bg-surface-light dark:bg-surface-dark
          transition-all duration-300
          ${sidebarCollapsed ? 'w-20' : 'w-64'}
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex flex-col justify-between p-4 h-full">
          {/* Logo & Company */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 px-3">
              {/* Logo */}
              <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                SF
              </div>
              {!sidebarCollapsed && (
                <div className="flex flex-col">
                  <h1 className="text-base font-medium text-text-light dark:text-text-dark">
                    SoupFinance
                  </h1>
                  <p className="text-sm text-subtle-text dark:text-subtle-text-dark">
                    {user?.email || 'Corporate'}
                  </p>
                </div>
              )}
            </div>

            {/* Collapse button (desktop only) */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden md:flex items-center justify-center size-8 rounded-lg hover:bg-primary/10 text-subtle-text"
            >
              <span className="material-symbols-outlined">
                {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>

            {/* Navigation */}
            <nav className="flex flex-col gap-1 mt-4">
              {navItems.map((item) => (
                <div key={item.path}>
                  <NavLink
                    to={item.children ? item.children[0].path : item.path}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                      ${
                        isActive(item.path)
                          ? 'bg-primary/10 text-primary'
                          : 'text-subtle-text hover:bg-primary/5 hover:text-text-light dark:hover:text-text-dark'
                      }
                    `}
                  >
                    <span
                      className={`material-symbols-outlined text-xl ${
                        isActive(item.path) ? 'fill' : ''
                      }`}
                      style={
                        isActive(item.path)
                          ? { fontVariationSettings: "'FILL' 1" }
                          : undefined
                      }
                    >
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <p
                        className={`text-sm ${isActive(item.path) ? 'font-bold' : 'font-medium'}`}
                      >
                        {item.label}
                      </p>
                    )}
                  </NavLink>

                  {/* Sub-items */}
                  {!sidebarCollapsed && item.children && isActive(item.path) && (
                    <div className="ml-9 mt-1 flex flex-col gap-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={`
                            px-3 py-1.5 text-sm rounded-lg transition-colors
                            ${
                              location.pathname === child.path
                                ? 'text-primary font-medium'
                                : 'text-subtle-text hover:text-text-light dark:hover:text-text-dark'
                            }
                          `}
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>

          {/* Bottom Links */}
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-subtle-text hover:bg-primary/5 hover:text-text-light dark:hover:text-text-dark transition-colors"
            >
              <span className="material-symbols-outlined text-xl">help</span>
              {!sidebarCollapsed && <p className="text-sm font-medium">Help</p>}
            </button>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-subtle-text hover:bg-danger/10 hover:text-danger transition-colors"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
              {!sidebarCollapsed && <p className="text-sm font-medium">Logout</p>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
