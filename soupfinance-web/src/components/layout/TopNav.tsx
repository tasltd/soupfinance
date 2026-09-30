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
  const { themeMode, cycleThemeMode, setMobileSidebarOpen, notificationsOpen, setNotificationsOpen } =
    useUIStore();

  // Fix (SOUPFIN-63): single source for the toggle's name, used by both
  // aria-label and title. 'System' was previously hardcoded, untranslated.
  const themeLabel =
    themeMode === 'light'
      ? t('header.darkMode')
      : themeMode === 'dark'
        ? t('header.systemMode')
        : t('header.lightMode');

  // Changed: Reduced mobile padding from px-6 to px-4 to match MainLayout content padding
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-border-light dark:border-border-dark px-4 sm:px-6 lg:px-8 py-3 bg-surface-light dark:bg-surface-dark sticky top-0 z-10">
      {/* Left: Mobile menu button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          /* Fix (SOUPFIN-63): icon-only button — the ligature was the entire
             accessible name. */
          aria-label={t('header.openMenu')}
          className="md:hidden flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
        >
          <span aria-hidden="true" className="material-symbols-outlined">menu</span>
        </button>

        {/* Search (desktop) */}
        <div className="hidden md:flex relative">
          <span
            aria-hidden="true"
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text"
          >
            search
          </span>
          {/* Fix (SOUPFIN-33 #6): this global search renders on EVERY authenticated page,
              so one unlabelled field counted against every page's a11y audit. */}
          <input
            type="search"
            id="global-search"
            name="global-search"
            aria-label={t('header.search')}
            placeholder={t('header.search')}
            className="w-64 pl-10 pr-4 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-sm placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Right: Actions & Avatar */}
      <div className="flex items-center gap-3">
        {/* Changed: Dark mode toggle — cycles through light → dark → system */}
        <button
          onClick={cycleThemeMode}
          className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
          /* Fix (SOUPFIN-63): `title` only names an element when it has no text
             content — the ligature had priority, so this button was announced as
             "light_mode". aria-label wins over both. */
          aria-label={themeLabel}
          title={themeLabel}
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            {themeMode === 'light' ? 'light_mode' : themeMode === 'dark' ? 'dark_mode' : 'settings_brightness'}
          </span>
        </button>

        {/* Language Switcher - Added for i18n */}
        <LanguageSwitcherCompact />

        {/* Notifications */}
        {/* Fix (SOUPFIN-94): positioned only from sm up. The panel is 320px wide
            and was anchored to this button, which sits about 70px in from the
            right edge on a phone, so the panel ran 28px off the LEFT edge at
            360px (68px at 320px). Below sm the panel is positioned against the
            header instead (sticky, so it is a containing block) and spans it
            with a 1rem margin each side. */}
        <div className="sm:relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            // Fix (SOUPFIN-63): named by the ligature before this.
            aria-label={t('header.notifications')}
            aria-expanded={notificationsOpen}
            // Fix (SOUPFIN-94): relative, so the badge stays on the bell now
            // that the wrapper is not positioned below sm.
            className="relative flex items-center justify-center size-10 rounded-full hover:bg-primary/10 text-text-light dark:text-text-dark"
          >
            <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
            {/* Notification badge */}
            <span aria-hidden="true" className="absolute top-1 right-1 size-2 bg-danger rounded-full" />
          </button>

          {/* Notifications dropdown */}
          {notificationsOpen && (
            // whitespace-normal: the header is whitespace-nowrap, and a longer
            // translation must wrap inside the narrower phone panel.
            <div
              className="absolute left-4 right-4 sm:left-auto sm:right-0 mt-2 sm:w-80 whitespace-normal bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-lg z-50"
              data-testid="topnav-notifications-panel"
            >
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
          <div className="size-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          {/* Fix (SOUPFIN-91): capped and truncated. The header is whitespace-nowrap,
              so an email-length username set the header's minimum width and pushed
              the page wider than the screen. The full name stays in the title. */}
          <div className="hidden lg:flex flex-col min-w-0 max-w-40" data-testid="topnav-user">
            <p
              className="truncate text-sm font-medium text-text-light dark:text-text-dark"
              title={user?.username || 'User'}
              data-testid="topnav-username"
            >
              {user?.username || 'User'}
            </p>
            <p className="truncate text-xs text-subtle-text">{user?.roles?.[0] || 'Member'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
