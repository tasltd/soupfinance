/**
 * Side Navigation Component
 * Reference: soupfinance-designs/balance-sheet-report/
 */
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore, useUIStore, useAccountStore } from '../../stores';
import { Logo } from '../Logo';
// Changed (SOUPFIN-181): nav data lives in navItems.ts so the filter can be exported
// without breaking fast refresh (react-refresh/only-export-components)
import { navItems, filterNavItems } from './navItems';

export function SideNav() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  // Added (SOUPFIN-181): null/undefined = modules not known yet, so nothing is hidden
  const enabledModules = useAccountStore((state) => state.enabledModules);
  const visibleItems = filterNavItems(navItems, enabledModules);
  const hiddenCount =
    navItems.length - visibleItems.length +
    visibleItems.reduce((n, item) => {
      const original = navItems.find((i) => i.path === item.path);
      return n + (original?.children?.length ?? 0) - (item.children?.length ?? 0);
    }, 0);
  const logout = useAuthStore((state) => state.logout);
  const { sidebarCollapsed, setSidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } =
    useUIStore();

  // Fix (SOUPFIN-76): close the mobile drawer on every navigation. Before this
  // only the overlay's onClick closed it, so tapping a link left the drawer and
  // overlay covering the page it opened. Keyed on `location.key`, not pathname,
  // so tapping the link for the page already open (a replace to the same path)
  // closes it too. The open state is read with getState() rather than listed as
  // a dependency: depending on it would close the drawer the moment it opened.
  useEffect(() => {
    if (useUIStore.getState().mobileSidebarOpen) setMobileSidebarOpen(false);
  }, [location.key, setMobileSidebarOpen]);

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
        {/* Fix (SOUPFIN-30 #16): `min-h-0` + a scrollable nav column. Expanding
            Reports (7 children) or Accounting pushed the nav past the viewport
            height; without min-h-0 the flex children refused to shrink, so the
            logo/Logout block was squashed and sub-items were clipped. */}
        <div className="flex flex-col justify-between p-4 h-full min-h-0">
          {/* Logo & Company */}
          <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center gap-3 px-3">
              {/* Logo */}
              {sidebarCollapsed ? (
                <Logo variant="mark" size={40} />
              ) : (
                <div className="flex items-center gap-3">
                  <Logo variant="mark" size={40} />
                  <div className="flex flex-col">
                    <h1 className="text-base font-bold text-text-light dark:text-text-dark">
                      <span>Soup</span>
                      <span className="text-primary">Finance</span>
                    </h1>
                    <p className="text-sm text-subtle-text dark:text-subtle-text-dark">
                      {user?.email || 'Corporate'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Collapse button (desktop only) */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              // Fix (SOUPFIN-63): icon-only in both states, so the ligature was
              // the whole accessible name ("chevron_left").
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              className="hidden md:flex items-center justify-center size-8 rounded-lg hover:bg-primary/10 text-subtle-text"
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>

            {/* Navigation */}
            <nav className="flex flex-col gap-1 mt-4">
              {visibleItems.map((item) => (
                <div key={item.path}>
                  <NavLink
                    to={item.children ? item.children[0].path : item.path}
                    /* Fix (SOUPFIN-63): when collapsed the label <p> below is not
                       rendered, so with the icon hidden the link would have no
                       accessible name at all. Name it explicitly in that case. */
                    aria-label={sidebarCollapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                      ${
                        isActive(item.path)
                          ? 'bg-primary/10 text-primary'
                          : 'text-subtle-text hover:bg-primary/5 hover:text-text-light dark:hover:text-text-dark'
                      }
                    `}
                  >
                    {/* Fix (SOUPFIN-63): the ligature is real text, so without
                        aria-hidden the link is named "receipt_long Invoices". */}
                    <span
                      aria-hidden="true"
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

            {/* Added (SOUPFIN-181): say why entries are missing, so a hidden Payments
                page reads as a setting the admin controls, not a broken menu. */}
            {hiddenCount > 0 && !sidebarCollapsed && (
              <p
                data-testid="nav-modules-hidden-note"
                className="mx-3 mt-2 rounded-lg bg-background-light dark:bg-background-dark px-3 py-2 text-xs text-subtle-text dark:text-subtle-text-dark"
              >
                Some pages are hidden because their module is turned off for your organisation.
                Ask your administrator to turn it on.
              </p>
            )}
          </div>

          {/* Bottom Links — shrink-0 keeps Help/Logout pinned and full height
              even when the nav column above overflows (SOUPFIN-30 #16). */}
          <div className="flex flex-col gap-1 shrink-0 pt-2">
            {/* Fix (SOUPFIN-75): Help was a button with no handler. It now
                opens the user guide at /help. */}
            <NavLink
              to="/help"
              data-testid="help-link"
              aria-label={sidebarCollapsed ? 'Help' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/help')
                  ? 'bg-primary/10 text-primary'
                  : 'text-subtle-text hover:bg-primary/5 hover:text-text-light dark:hover:text-text-dark'
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-xl">help</span>
              {!sidebarCollapsed && (
                <p className={`text-sm ${isActive('/help') ? 'font-bold' : 'font-medium'}`}>Help</p>
              )}
            </NavLink>
            <button
              onClick={logout}
              data-testid="logout-button"
              aria-label={sidebarCollapsed ? 'Logout' : undefined}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-subtle-text hover:bg-danger/10 hover:text-danger transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-xl">logout</span>
              {!sidebarCollapsed && <p className="text-sm font-medium">Logout</p>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
