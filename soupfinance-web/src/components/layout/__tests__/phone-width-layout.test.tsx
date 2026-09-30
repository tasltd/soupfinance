/**
 * SOUPFIN-91 — the signed-in app was wider than a phone screen.
 *
 * MainLayout's content column (`flex-1 flex flex-col`) kept the flex default
 * `min-width: auto`, so it grew to the min-content width of whatever the page
 * rendered. The dashboard's `min-w-[480px]` invoice table made it 514px; on a
 * 360px phone the top bar and every page were cut off on the right.
 *
 * jsdom has no layout engine, so these tests pin the two class-level guards the
 * fix depends on. The widths themselves are measured in Firefox by
 * e2e/soupfin-91-phone-width.spec.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// MainLayout's own markup is under test, not its children.
vi.mock('../SideNav', () => ({ SideNav: () => <aside data-testid="sidenav-stub" /> }));

import { MainLayout } from '../MainLayout';
import { TopNav } from '../TopNav';
import { useAuthStore, useUIStore } from '../../../stores';
import type { AuthUser } from '../../../api/auth';

describe('MainLayout content column (SOUPFIN-91)', () => {
  it('lets the column shrink below its content width (min-w-0)', () => {
    render(
      <MemoryRouter>
        <MainLayout />
      </MemoryRouter>
    );
    // The column is the element that holds both the top bar and <main>.
    const column = screen.getByRole('banner').parentElement!;
    expect(column).toContainElement(screen.getByRole('main'));
    expect(column).toHaveClass('flex-1', 'min-w-0');
  });
});

describe('TopNav user name cannot widen the header (SOUPFIN-91)', () => {
  const LONG_NAME =
    'finance.department.administrator@some-very-long-company-name.example.com';

  beforeEach(() => {
    useUIStore.setState({ mobileSidebarOpen: false, notificationsOpen: false });
  });

  function renderWithUser(user: AuthUser | null) {
    useAuthStore.setState({ user });
    return render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );
  }

  it('caps and truncates a very long username, keeping the full name in its title', () => {
    renderWithUser({ username: LONG_NAME, email: 'a@b.com', roles: ['ROLE_ADMIN'] });

    const name = screen.getByTestId('topnav-username');
    // Nothing is cut from the DOM text: truncation is visual only.
    expect(name).toHaveTextContent(LONG_NAME);
    expect(name).toHaveAttribute('title', LONG_NAME);
    expect(name).toHaveClass('truncate');

    // truncate only takes effect when the flex column may shrink and is capped.
    expect(screen.getByTestId('topnav-user')).toHaveClass('min-w-0', 'max-w-40');
  });

  it('truncates a long role label too', () => {
    const longRole = 'ROLE_FINANCE_REPORTS_AND_SCHEDULED_EXPORTS_ADMINISTRATOR';
    renderWithUser({ username: 'admin', email: 'a@b.com', roles: [longRole] });
    expect(screen.getByText(longRole)).toHaveClass('truncate');
  });

  it('falls back to "User" and "Member" when there is no user', () => {
    renderWithUser(null);

    const name = screen.getByTestId('topnav-username');
    expect(name).toHaveTextContent('User');
    expect(name).toHaveAttribute('title', 'User');
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  it('keeps the avatar at full size when the header is tight (shrink-0)', () => {
    renderWithUser({ username: LONG_NAME, email: 'finance@acme.com', roles: ['ROLE_ADMIN'] });
    const avatar = screen.getByText('F');
    expect(avatar).toHaveClass('size-10', 'shrink-0');
  });
});
