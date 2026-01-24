/**
 * Top Navigation Bar Component
 * Reference: soupfinance-designs/new-invoice-form/
 * Added: i18n support with LanguageSwitcher
 */
import { useTranslation } from 'react-i18next';
import { useAuthStore, useUIStore } from '../../stores';
import { LanguageSwitcherCompact } from './LanguageSwitcher';

export function TopNav() {
  const { t } = useTranslation('navigation');
  const user = useAuthStore((state) => state.user);
  const { darkMode, toggleDarkMode, setMobileSidebarOpen, notificationsOpen, setNotificationsOpen } =
    useUIStore();

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-border-light dark:border-border-dark px-6 lg:px-8 py-3 bg-surface-light dark:bg-surface-dark sticky top-0 z-10">
      {/* Left: Mobile menu button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        {/* Search (desktop) */}
        <div className="hidden md:flex relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text">
            search
          </span>
          <input
            type="search"
            placeholder={t('header.search')}
            className="w-64 pl-10 pr-4 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-sm placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Right: Actions & Avatar */}
      <div className="flex items-center gap-3">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
          title={darkMode ? t('header.lightMode') : t('header.darkMode')}
        >
          <span className="material-symbols-outlined">
            {darkMode ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        {/* Language Switcher - Added for i18n */}
        <LanguageSwitcherCompact />

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
          >
            <span className="material-symbols-outlined">notifications</span>
            {/* Notification badge */}
            <span className="absolute top-1 right-1 size-2 bg-danger rounded-full" />
          </button>

          {/* Notifications dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-lg z-50">
              <div className="p-4 border-b border-border-light dark:border-border-dark">
                <h3 className="text-sm font-bold text-text-light dark:text-text-dark">
                  {t('header.notifications')}
                </h3>
              </div>
              <div className="p-4 text-sm text-subtle-text text-center">
                {t('common:messages.noData', { defaultValue: 'No new notifications' })}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden lg:flex flex-col">
            <p className="text-sm font-medium text-text-light dark:text-text-dark">
              {user?.username || 'User'}
            </p>
            <p className="text-xs text-subtle-text">{user?.roles?.[0] || 'Member'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
