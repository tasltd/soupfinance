/**
 * Users sub-tabs (SOUPFIN-101)
 * PURPOSE: Splits Settings → Users into the company's own team and its outside
 * accountants. Both routes sit under /settings/users so the Settings header keeps
 * the Users tab active and the help link on the Users guide section.
 */
import { NavLink } from 'react-router-dom';

const TABS = [
  // `end` so /settings/users/accountants does not also light up Team members
  { label: 'Team members', path: '/settings/users', icon: 'group', end: true, testId: 'users-tab-team' },
  {
    label: 'Accountants',
    path: '/settings/users/accountants',
    icon: 'calculate',
    end: false,
    testId: 'users-tab-accountants',
  },
];

export default function UsersTabs() {
  return (
    <nav aria-label="User types" className="flex gap-1 border-b border-border-light dark:border-border-dark" data-testid="users-tabs">
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          data-testid={tab.testId}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-subtle-text hover:text-text-light dark:hover:text-text-dark'
            }`
          }
        >
          {/* Decorative — the label names the tab (SOUPFIN-63). */}
          <span aria-hidden="true" className="material-symbols-outlined text-lg">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
