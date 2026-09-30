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
import { render, screen, fireEvent } from '@testing-library/react';
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

/**
 * SOUPFIN-94 — the notifications panel ran off the left edge of a phone.
 *
 * It was `absolute right-0 w-80` inside a `relative` wrapper around the bell.
 * The bell sits about 70px in from the right edge on a phone, so a 320px panel
 * hanging from it started 28px left of the screen at 360px (68px at 320px).
 * Below `sm` the wrapper is no longer positioned, so the panel is positioned
 * against the sticky header and spans it with a 1rem margin each side.
 */
describe('TopNav notifications panel fits a phone (SOUPFIN-94)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { username: 'admin', email: 'a@b.com', roles: ['ROLE_ADMIN'] } });
    useUIStore.setState({ mobileSidebarOpen: false, notificationsOpen: false });
  });

  function renderTopNav() {
    return render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );
  }

  it('is closed until the bell is pressed, and opens on a press', () => {
    renderTopNav();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('topnav-notifications-panel')).not.toBeInTheDocument();

    fireEvent.click(bell);

    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('topnav-notifications-panel')).toBeInTheDocument();
    expect(useUIStore.getState().notificationsOpen).toBe(true);
  });

  it('spans the header below sm and hangs 320px from the bell from sm up', () => {
    useUIStore.setState({ notificationsOpen: true });
    renderTopNav();
    const panel = screen.getByTestId('topnav-notifications-panel');

    // Phone: both edges set against the header, no fixed width.
    expect(panel).toHaveClass('absolute', 'left-4', 'right-4');
    expect(panel).not.toHaveClass('w-80');
    // sm and up: the pre-SOUPFIN-94 placement.
    expect(panel).toHaveClass('sm:left-auto', 'sm:right-0', 'sm:w-80');
    // The header is nowrap; the panel's text must still wrap.
    expect(panel).toHaveClass('whitespace-normal');
  });

  it('is positioned against the header, not the bell, below sm', () => {
    useUIStore.setState({ notificationsOpen: true });
    renderTopNav();
    const panel = screen.getByTestId('topnav-notifications-panel');
    const wrapper = panel.parentElement!;

    // A plain `relative` here would make the bell's wrapper the containing
    // block again, and the panel would run off the left edge.
    expect(wrapper).toHaveClass('sm:relative');
    expect(wrapper).not.toHaveClass('relative');
    // So the header must be positioned for the panel to hang from it.
    expect(screen.getByRole('banner')).toHaveClass('sticky');
  });

  it('keeps the unread dot on the bell', () => {
    renderTopNav();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    // The dot is absolute; with the wrapper unpositioned below sm, the bell
    // itself has to be its containing block.
    expect(bell).toHaveClass('relative');
    const dot = bell.querySelector('span.absolute');
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass('top-1', 'right-1', 'bg-danger');
  });
});
