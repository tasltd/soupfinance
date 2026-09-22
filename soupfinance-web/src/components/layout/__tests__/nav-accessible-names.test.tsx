/**
 * SOUPFIN-63 — nav icon ligatures must not leak into accessible names.
 *
 * Material Symbols renders its glyph from the element's TEXT CONTENT
 * (`<span class="material-symbols-outlined">receipt_long</span>`). That text is
 * real text, so without `aria-hidden` it joins the accessible name of whatever
 * link or button contains it: the Invoices link was named
 * "receipt_long Invoices", not "Invoices".
 *
 * Two consequences, and this spec pins both:
 *   1. Screen reader users hear the raw ligature before every label.
 *   2. `getByRole('link', { name: 'Invoices' })` silently never
 *      matches, so E2E navigation has to fall back to loose regexes.
 *
 * The collapsed-sidebar case is the trap: the label <p> is not rendered there,
 * so hiding the icon without adding an aria-label would leave the link with NO
 * accessible name at all. Both ends are asserted below.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BusinessLicenceCategory } from '../../../types/settings';

let mockBusinessCategory: BusinessLicenceCategory | undefined;

vi.mock('../../../stores', async () => {
  const actual = await vi.importActual<typeof import('../../../stores')>('../../../stores');
  return {
    ...actual,
    useAccountStore: (
      selector: (s: {
        settings: { businessLicenceCategory?: BusinessLicenceCategory } | null;
      }) => unknown
    ) => selector({ settings: { businessLicenceCategory: mockBusinessCategory } }),
  };
});

import { SideNav } from '../SideNav';
import { TopNav } from '../TopNav';
import { useUIStore } from '../../../stores';

/** The SideNav's top-level items, in render order. Vendors is hidden for
 *  SERVICES tenants (SOUPFIN-25); these tests pin the category to TRADING so
 *  every item renders. */
const TOP_LEVEL_LABELS = [
  'Dashboard',
  'Invoices',
  'Bills',
  'Vendors',
  'Clients',
  'Payments',
  'Ledger',
  'Accounting',
  'Reports',
  'Settings',
];

/** Every ligature rendered by the SideNav's top-level items. */
const LIGATURES = [
  'dashboard',
  'receipt_long',
  'receipt',
  'storefront',
  'people',
  'payments',
  'account_balance',
  'calculate',
  'analytics',
  'settings',
];

function renderSideNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SideNav />
    </MemoryRouter>
  );
}

describe('SideNav accessible names exclude the icon ligature (SOUPFIN-63)', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    // TRADING keeps every nav item visible, so the sweep below covers all of them.
    mockBusinessCategory = 'TRADING';
  });

  it.each([
    ['Dashboard', '/dashboard'],
    ['Invoices', '/invoices'],
    ['Bills', '/bills'],
    ['Vendors', '/vendors'],
    ['Clients', '/clients'],
    ['Payments', '/payments'],
    ['Ledger', '/ledger/accounts'],
    ['Accounting', '/accounting/transactions'],
    ['Reports', '/reports'],
    ['Settings', '/settings/users'],
  ])('names the %s link exactly, with no ligature prefix', (label, href) => {
    renderSideNav('/dashboard');

    // The regression: this is the assertion that failed before the fix, because
    // the name was "<ligature> <label>".
    // NB: no `exact: true` here — unlike Playwright, Testing Library matches a
    // STRING `name` against the whole accessible name already (and rejects the
    // option). A substring match would defeat the point of this spec.
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
  });

  it('resolves each top-level link to exactly its label, in order', () => {
    const { container } = renderSideNav('/dashboard');
    const nav = container.querySelector('nav') as HTMLElement;

    // The ticket stated as one assertion: every link in the nav is the link the
    // exact-name lookup finds, and nothing is left over. A new nav item added
    // without aria-hidden fails here even if nobody adds a per-item case —
    // getByRole would not find it under its bare label.
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(TOP_LEVEL_LABELS.length);

    TOP_LEVEL_LABELS.forEach((label, i) => {
      expect(links[i]).toBe(within(nav).getByRole('link', { name: label }));
    });
  });

  it('finds no link still named by its ligature', () => {
    const { container } = renderSideNav('/dashboard');
    const nav = container.querySelector('nav') as HTMLElement;

    // The inverse of the assertion above: the pre-fix names are gone. Queried
    // as regexes so a lingering "receipt_long Invoices" is caught as well as a
    // bare "receipt_long".
    for (const ligature of LIGATURES) {
      expect(
        within(nav).queryAllByRole('link', { name: new RegExp(ligature) })
      ).toHaveLength(0);
    }
  });

  it('marks the icon spans aria-hidden but still renders the glyph text', () => {
    const { container } = renderSideNav('/invoices');
    const icons = container.querySelectorAll('nav .material-symbols-outlined');

    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
    // The glyph must survive: hiding it from a11y must not blank the UI.
    expect(container.querySelector('nav .material-symbols-outlined')?.textContent?.trim())
      .toBeTruthy();
  });

  it('keeps child links (which have no icon) exactly named', () => {
    renderSideNav('/reports/aging');
    expect(screen.getByRole('link', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Balance Sheet' })).toBeInTheDocument();
  });
});

describe('SideNav collapsed — hiding the icon must not erase the name (SOUPFIN-63)', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: true, mobileSidebarOpen: false });
    mockBusinessCategory = 'TRADING';
  });

  it.each([
    ['Invoices', '/invoices'],
    ['Dashboard', '/dashboard'],
    ['Reports', '/reports'],
  ])('still names the %s link when the label text is not rendered', (label, href) => {
    renderSideNav('/dashboard');

    // Collapsed mode drops the <p> label, so this name can only come from
    // aria-label. Without it the link would be nameless — a worse a11y bug
    // than the one being fixed.
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
    // Confirm the premise: the visible label really is absent here.
    expect(link.querySelector('p')).toBeNull();
  });

  it('names every collapsed link — none is left empty', () => {
    const { container } = renderSideNav('/dashboard');
    const nav = container.querySelector('nav') as HTMLElement;

    const links = within(nav).getAllByRole('link');
    expect(links.length).toBe(10);
    for (const link of links) {
      expect((link.getAttribute('aria-label') ?? '').trim()).not.toBe('');
    }
  });

  it('names the Help and Logout buttons when collapsed', () => {
    renderSideNav('/dashboard');
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('names the collapse toggle by intent, not by "chevron_right"', () => {
    renderSideNav('/dashboard');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /chevron/i })).not.toBeInTheDocument();
  });
});

describe('SideNav expanded — Help/Logout/toggle names (SOUPFIN-63)', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    mockBusinessCategory = 'TRADING';
  });

  it('names Help and Logout from their visible labels, without the ligature', () => {
    renderSideNav('/dashboard');
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    const logout = screen.getByRole('button', { name: 'Logout' });
    // data-testid must survive — existing specs click through it.
    expect(logout).toHaveAttribute('data-testid', 'logout-button');
  });

  it('names the collapse toggle "Collapse sidebar" when expanded', () => {
    renderSideNav('/dashboard');
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TopNav icon-only buttons are named by intent (SOUPFIN-63)', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      notificationsOpen: false,
    });
  });

  function renderTopNav() {
    return render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );
  }

  it('names the mobile menu button, not "menu"', () => {
    renderTopNav();
    expect(
      screen.getByRole('button', { name: 'Open navigation menu' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'menu' })).not.toBeInTheDocument();
  });

  it('names the notifications button and exposes its expanded state', () => {
    renderTopNav();
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('names the theme toggle by the mode it switches to, not the ligature', () => {
    // themeMode starts at whatever the store default is; assert the ligature is
    // gone regardless of which of the three labels is current.
    renderTopNav();
    for (const ligature of ['light_mode', 'dark_mode', 'settings_brightness']) {
      expect(screen.queryByRole('button', { name: ligature })).not.toBeInTheDocument();
    }
    // Exactly one of the three theme labels must name a button.
    const named = ['Dark mode', 'Light mode', 'System theme'].filter(
      (label) => screen.queryAllByRole('button', { name: label }).length > 0
    );
    expect(named).toHaveLength(1);
  });

  it('hides every decorative icon in the header from the accessibility tree', () => {
    const { container } = renderTopNav();
    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('keeps the search field labelled (it has no visible label)', () => {
    renderTopNav();
    // The decorative "search" icon is now hidden, so the field's own aria-label
    // is the only thing naming it — regression guard for SOUPFIN-33 #6.
    expect(screen.getByRole('searchbox', { name: 'Search...' })).toBeInTheDocument();
  });
});
