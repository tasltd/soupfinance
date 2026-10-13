/**
 * Unit tests for SideNav. Two independent concerns live here, kept as separate
 * describe blocks because they were authored against different bugs:
 *
 *  1. SOUPFIN-30 #16 — "fix sidebar distortion when the reports tab is
 *     selected". Reports has 7 sub-items. When it expanded, the nav column grew
 *     past the viewport height; because the flex children could not shrink
 *     (`min-h-0` was missing) the logo and the Help/Logout block were squashed
 *     and the sub-items were clipped. The fix makes the nav column scroll and
 *     pins the bottom block.
 *
 *  2. SOUPFIN-173 — Vendors is shown for every business category. SOUPFIN-25
 *     hid it for SERVICES tenants, but a SERVICES tenant still records bills,
 *     and a bill requires a vendor. The account store is still mocked so these
 *     tests can prove the category no longer changes the nav.
 *
 * Only `useAccountStore` is mocked — the real `useUIStore`/`useAuthStore` are
 * kept so the layout assertions above exercise the same code path they always
 * did. Mocking the whole stores barrel would break `useUIStore.setState()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { BusinessLicenceCategory } from '../../../types/settings';
import type { ModuleGroup } from '../../../api/endpoints/modules';

// Driven per-test; `undefined` models "account settings not loaded yet".
let mockBusinessCategory: BusinessLicenceCategory | undefined;
// Added (SOUPFIN-181): driven per-test; `null` models "modules not known".
let mockEnabledModules: ModuleGroup[] | null = null;

vi.mock('../../../stores', async () => {
  const actual = await vi.importActual<typeof import('../../../stores')>('../../../stores');
  return {
    ...actual,
    useAccountStore: (
      selector: (s: {
        settings: { businessLicenceCategory?: BusinessLicenceCategory } | null;
        enabledModules: ModuleGroup[] | null;
      }) => unknown
    ) => selector({ settings: { businessLicenceCategory: mockBusinessCategory }, enabledModules: mockEnabledModules }),
  };
});

import { SideNav } from '../SideNav';
import { filterNavItems } from '../navItems';
import { useUIStore } from '../../../stores';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SideNav />
    </MemoryRouter>
  );
}

/** The scrollable nav column is the parent of <nav>. */
function navColumn(container: HTMLElement): HTMLElement {
  const nav = container.querySelector('nav');
  expect(nav).not.toBeNull();
  return nav!.parentElement as HTMLElement;
}

describe('SideNav layout does not distort when a long section expands', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    // TRADING keeps every nav item visible, so the layout assertions below are
    // measured against the full-length nav (the worst case for distortion).
    mockBusinessCategory = 'TRADING';
  });

  it('renders every Reports sub-item when the Reports section is active', () => {
    renderAt('/reports/aging');
    for (const label of [
      'All Reports',
      'Profit & Loss',
      'Balance Sheet',
      'Cash Flow',
      'Aging Reports',
      'Trial Balance',
      'Scheduled Reports',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('makes the nav column scrollable and shrinkable so it cannot squash siblings', () => {
    const { container } = renderAt('/reports/aging');
    const column = navColumn(container);
    // min-h-0 is the load-bearing class: without it a flex child refuses to
    // shrink below its content height, which is what caused the distortion.
    expect(column.className).toContain('min-h-0');
    expect(column.className).toContain('overflow-y-auto');
  });

  it('keeps the Help/Logout block at full height (shrink-0) alongside a long nav', () => {
    const { container } = renderAt('/reports/aging');
    const logout = screen.getByTestId('logout-button');
    const bottomBlock = logout.parentElement as HTMLElement;
    expect(bottomBlock.className).toContain('shrink-0');
    // Sanity: the bottom block is a sibling of the scrollable nav column.
    expect(bottomBlock.parentElement).toBe(navColumn(container).parentElement);
  });

  it('applies the same shrink rules for a short section (Ledger, 2 children)', () => {
    const { container } = renderAt('/ledger/accounts');
    expect(navColumn(container).className).toContain('min-h-0');
    expect(screen.getByRole('link', { name: 'Chart of Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
  });

  it('does not render sub-items for an inactive section', () => {
    renderAt('/dashboard');
    expect(screen.queryByRole('link', { name: 'Trial Balance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chart of Accounts' })).not.toBeInTheDocument();
  });

  it('hides sub-item labels when the sidebar is collapsed', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    renderAt('/reports/aging');
    expect(screen.queryByRole('link', { name: 'Trial Balance' })).not.toBeInTheDocument();
  });

  it('keeps the nav column scrollable even when collapsed', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    const { container } = renderAt('/reports/aging');
    expect(navColumn(container).className).toContain('min-h-0');
  });
});

describe('SideNav — Vendors is reachable for every business category (SOUPFIN-173)', () => {
  // Every category the type allows, plus "settings not loaded yet".
  const CATEGORIES: (BusinessLicenceCategory | undefined)[] = [
    'SERVICES',
    'TRADING',
    'BROKER',
    'ASSET_MANAGER',
    'CUSTODIAN',
    'TRUSTEE',
    'PRIMARY_DEALER',
    undefined,
  ];

  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    mockBusinessCategory = undefined;
  });

  it.each(CATEGORIES)('shows the Vendors link to /vendors for category %s', (category) => {
    mockBusinessCategory = category;
    renderAt('/dashboard');

    const link = screen.getByRole('link', { name: 'Vendors' });
    expect(link).toHaveAttribute('href', '/vendors');
  });

  it('renders the same top-level items for SERVICES as for TRADING', () => {
    // The regression this guards against is a category filter coming back:
    // compare the full rendered list, not just the Vendors entry.
    const hrefs = (category: BusinessLicenceCategory) => {
      mockBusinessCategory = category;
      const { container, unmount } = renderAt('/dashboard');
      const list = [...container.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
      unmount();
      return list;
    };

    const services = hrefs('SERVICES');
    expect(services).toContain('/vendors');
    expect(services).toContain('/bills');
    expect(services).toEqual(hrefs('TRADING'));
  });

  it('keeps Vendors for SERVICES when the sidebar is collapsed', () => {
    // Collapsed mode hides labels, so assert on the route rather than the text.
    mockBusinessCategory = 'SERVICES';
    useUIStore.setState({ sidebarCollapsed: true });
    const { container } = renderAt('/dashboard');

    expect(container.querySelector('a[href="/vendors"]')).not.toBeNull();
  });

  it('marks Vendors active on vendor sub-routes for a SERVICES tenant', () => {
    mockBusinessCategory = 'SERVICES';
    renderAt('/vendors/new');

    expect(screen.getByRole('link', { name: 'Vendors' }).className).toContain('text-primary');
  });
});

/**
 * SOUPFIN-76 — tapping a link in the mobile drawer left the drawer and its
 * overlay covering the page it opened; only the overlay's onClick closed it.
 * SideNav now closes the drawer on every navigation. Each test opens the drawer
 * AFTER mount (as the menu button does), clicks a real NavLink, and checks both
 * the store and the rendered overlay, plus the location the click reached.
 */
describe('SideNav — mobile drawer closes on navigation (SOUPFIN-76)', () => {
  const OVERLAY = 'div.fixed.inset-0';

  function Where() {
    const location = useLocation();
    return <output data-testid="where">{location.pathname}</output>;
  }

  function renderWithLocation(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SideNav />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
  }

  function openDrawer() {
    act(() => useUIStore.getState().setMobileSidebarOpen(true));
  }

  function expectClosed(container: HTMLElement) {
    expect(useUIStore.getState().mobileSidebarOpen).toBe(false);
    expect(container.querySelector(OVERLAY)).toBeNull();
    expect(container.querySelector('aside')!.className).toContain('-translate-x-full');
  }

  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    mockBusinessCategory = 'TRADING';
  });

  it('stays open after opening when nothing navigates', () => {
    // Guards the effect's dependencies: listing the open flag would close the
    // drawer the instant the menu button opened it.
    const { container } = renderWithLocation('/dashboard');
    openDrawer();
    expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
    expect(container.querySelector(OVERLAY)).not.toBeNull();
    expect(container.querySelector('aside')!.className).toContain('translate-x-0');
  });

  it('closes when a top-level link is tapped, and the page changes', () => {
    const { container } = renderWithLocation('/dashboard');
    openDrawer();
    fireEvent.click(screen.getByRole('link', { name: 'Invoices' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/invoices');
    expectClosed(container);
  });

  it('closes when a sub-item link is tapped', () => {
    const { container } = renderWithLocation('/reports');
    openDrawer();
    fireEvent.click(screen.getByRole('link', { name: 'Trial Balance' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/reports/trial-balance');
    expectClosed(container);
  });

  it('closes when the Help link at the bottom is tapped', () => {
    const { container } = renderWithLocation('/dashboard');
    openDrawer();
    fireEvent.click(screen.getByTestId('help-link'));
    expect(screen.getByTestId('where')).toHaveTextContent('/help');
    expectClosed(container);
  });

  it('closes when the link for the page already open is tapped', () => {
    // The path does not change here, so a pathname-keyed close would miss it.
    const { container } = renderWithLocation('/invoices');
    openDrawer();
    fireEvent.click(screen.getByRole('link', { name: 'Invoices' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/invoices');
    expectClosed(container);
  });

  it('still closes from the overlay, as before', () => {
    const { container } = renderWithLocation('/dashboard');
    openDrawer();
    fireEvent.click(container.querySelector(OVERLAY)!);
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
    expectClosed(container);
  });

  it('does not touch the store on navigation when the drawer is already closed', () => {
    // Desktop case: every route change would otherwise write to the store and
    // re-render every subscriber for nothing.
    // subscribe() sees every write; a spy on useUIStore.setState would not,
    // because the store's actions call zustand's internal set directly.
    renderWithLocation('/dashboard');
    let writes = 0;
    const unsubscribe = useUIStore.subscribe(() => writes++);
    fireEvent.click(screen.getByRole('link', { name: 'Invoices' }));
    fireEvent.click(screen.getByRole('link', { name: 'Bills' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/bills');
    expect(writes).toBe(0);
    unsubscribe();
  });

  // Fix (SOUPFIN-83): this took 2.5 s alone and 6.7 s under a loaded full run,
  // past Vitest's 5 s default. Almost all of it was 50 getByRole calls, each
  // rebuilding the accessibility tree. None of these stops has sub-items, so
  // the nav's link nodes are stable: resolve them once by role, then check each
  // is still attached and that the click reached its page on every cycle. The
  // explicit timeout is headroom for a loaded machine, not the fix itself.
  it('closes on every tap across 50 open-and-navigate cycles', () => {
    const { container } = renderWithLocation('/dashboard');
    const stops = [
      { label: 'Invoices', path: '/invoices' },
      { label: 'Bills', path: '/bills' },
      { label: 'Clients', path: '/clients' },
      { label: 'Payments', path: '/payments' },
      { label: 'Dashboard', path: '/dashboard' },
    ].map((stop) => ({ ...stop, link: screen.getByRole('link', { name: stop.label }) }));
    const where = screen.getByTestId('where');
    for (let i = 0; i < 50; i++) {
      const { link, path } = stops[i % stops.length];
      openDrawer();
      expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
      expect(link.isConnected).toBe(true);
      fireEvent.click(link);
      expect(where).toHaveTextContent(path);
      expectClosed(container);
    }
    expect(where).toHaveTextContent('/dashboard');
  }, 20_000);
});

// Added (SOUPFIN-181): the nav hides pages whose backend module the tenant lacks, so a
// FINANCE-less tenant stops opening Payments, Ledger and Accounting into guaranteed 403s.
describe('SideNav — hides entries for modules the tenant lacks (SOUPFIN-181)', () => {
  const FINANCE_PAGES = ['Invoices', 'Bills', 'Payments', 'Ledger', 'Accounting'];

  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    mockBusinessCategory = 'SERVICES';
    mockEnabledModules = null;
  });

  // The icon ligature is real text (aria-hidden), so read the visible label <p>, not textContent
  function topLevelLabels(): string[] {
    return screen.getAllByRole('link').map((a) => a.querySelector('p')?.textContent?.trim() ?? a.textContent?.trim() ?? '');
  }

  it('shows every entry while the module list is unknown', () => {
    mockEnabledModules = null;
    renderAt('/dashboard');
    for (const label of [...FINANCE_PAGES, 'Vendors', 'Clients', 'Reports', 'Settings']) {
      expect(topLevelLabels()).toContain(label);
    }
    expect(screen.queryByTestId('nav-modules-hidden-note')).toBeNull();
  });

  it('shows every entry and no note when FINANCE is enabled', () => {
    mockEnabledModules = ['CLIENT', 'FINANCE'];
    renderAt('/dashboard');
    for (const label of [...FINANCE_PAGES, 'Vendors']) expect(topLevelLabels()).toContain(label);
    expect(screen.queryByTestId('nav-modules-hidden-note')).toBeNull();
  });

  it('hides the FINANCE pages, keeps the ungated ones and explains why', () => {
    mockEnabledModules = ['CLIENT'];
    renderAt('/dashboard');
    const labels = topLevelLabels();
    for (const label of FINANCE_PAGES) expect(labels).not.toContain(label);
    for (const label of ['Dashboard', 'Clients', 'Reports', 'Settings']) expect(labels).toContain(label);
    expect(screen.getByTestId('nav-modules-hidden-note')).toHaveTextContent(/turned off for your organisation/);
  });

  it('hides everything gated when the tenant has no modules at all (zero end)', () => {
    mockEnabledModules = [];
    renderAt('/dashboard');
    expect(topLevelLabels()).not.toContain('Vendors');
    expect(topLevelLabels()).not.toContain('Payments');
    expect(topLevelLabels()).toContain('Dashboard');
  });

  it('keeps Vendors for a TRADING-only tenant: the vendor gate accepts TRADING or FINANCE', () => {
    mockEnabledModules = ['TRADING'];
    renderAt('/dashboard');
    expect(topLevelLabels()).toContain('Vendors');
    expect(topLevelLabels()).not.toContain('Payments');
  });

  it('drops only the gated children of an ungated section', () => {
    mockEnabledModules = ['CLIENT'];
    renderAt('/reports');
    expect(screen.getByRole('link', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Scheduled Reports' })).toBeNull();
  });

  it('does not show the note when the sidebar is collapsed', () => {
    mockEnabledModules = ['CLIENT'];
    useUIStore.setState({ sidebarCollapsed: true });
    renderAt('/dashboard');
    expect(screen.queryByTestId('nav-modules-hidden-note')).toBeNull();
  });
});

describe('filterNavItems (SOUPFIN-181)', () => {
  const items = [
    { label: 'Open', icon: 'x', path: '/open' },
    { label: 'Gated', icon: 'x', path: '/gated', modules: ['FINANCE'] as ModuleGroup[] },
    {
      label: 'Mixed',
      icon: 'x',
      path: '/mixed',
      children: [
        { label: 'A', path: '/mixed/a' },
        { label: 'B', path: '/mixed/b', modules: ['FINANCE'] as ModuleGroup[] },
      ],
    },
    {
      label: 'AllGatedChildren',
      icon: 'x',
      path: '/all',
      children: [{ label: 'C', path: '/all/c', modules: ['CIS'] as ModuleGroup[] }],
    },
  ];

  it('returns the list unchanged when modules are unknown', () => {
    expect(filterNavItems(items, null)).toEqual(items);
    expect(filterNavItems(items, undefined)).toEqual(items);
  });

  it('drops gated entries, gated children, and a section left with no children', () => {
    const result = filterNavItems(items, []);
    expect(result.map((i) => i.label)).toEqual(['Open', 'Mixed']);
    expect(result[1].children?.map((c) => c.label)).toEqual(['A']);
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(items);
    filterNavItems(items, []);
    expect(JSON.stringify(items)).toBe(before);
  });

  it('copes with a very long nav (overflow end)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      label: `L${i}`,
      icon: 'x',
      path: `/p${i}`,
      modules: (i % 2 ? ['FINANCE'] : undefined) as ModuleGroup[] | undefined,
    }));
    expect(filterNavItems(many, ['CLIENT'])).toHaveLength(2500);
    expect(filterNavItems(many, ['FINANCE'])).toHaveLength(5000);
  });
});
