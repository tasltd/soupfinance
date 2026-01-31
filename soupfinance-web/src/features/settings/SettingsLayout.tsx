/**
 * Settings Layout Component
 * PURPOSE: Provides sub-navigation for Settings pages
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom';

interface SettingsNavItem {
  label: string;
  path: string;
  icon: string;
  description: string;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    label: 'Users',
    path: '/settings/users',
    icon: 'group',
    description: 'Manage users and access permissions',
  },
  {
    label: 'Bank Accounts',
    path: '/settings/bank-accounts',
    icon: 'account_balance',
    description: 'Company bank account details',
  },
  {
    label: 'Account Settings',
    path: '/settings/account',
    icon: 'settings',
    description: 'Company preferences',
  },
];

export default function SettingsLayout() {
  const location = useLocation();

  // Check if we're on a settings sub-page (not the main /settings)
  const isOnSubPage = location.pathname !== '/settings';

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
          Settings
        </h1>
        <p className="text-subtle-text">Manage your account and team settings</p>
      </div>

      {/* Sub-navigation Tabs */}
      <nav className="flex flex-wrap gap-2 border-b border-border-light dark:border-border-dark pb-4">
        {settingsNavItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark hover:bg-primary/10'
                }
              `}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Content Area */}
      {isOnSubPage ? (
        <Outlet />
      ) : (
        /* Settings Overview Cards when on /settings */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settingsNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex items-start gap-4 p-6 rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark hover:border-primary/50 hover:shadow-lg transition-all group"
            >
              <div className="flex-shrink-0 size-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-2xl text-primary">{item.icon}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-text-light dark:text-text-dark group-hover:text-primary transition-colors">
                  {item.label}
                </h3>
                <p className="text-subtle-text text-sm mt-1">{item.description}</p>
              </div>
              <span className="material-symbols-outlined text-subtle-text group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
