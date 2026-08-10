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
 *  2. SOUPFIN-25 — category-aware navigation visibility. The Vendors nav item
 *     must be hidden for SERVICES tenants (they have no suppliers/inventory)
 *     and shown for TRADING tenants. When the tenant's business category is
 *     unknown (settings not yet loaded), items default to visible so nothing
 *     disappears during the initial load.
 *
 * Only `useAccountStore` is mocked — the real `useUIStore`/`useAuthStore` are
 * kept so the layout assertions above exercise the same code path they always
 * did. Mocking the whole stores barrel would break `useUIStore.setState()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BusinessLicenceCategory } from '../../../types/settings';

// Driven per-test; `undefined` models "account settings not loaded yet".
let mockBusinessCategory: BusinessLicenceCategory | undefined;

vi.mock('../../../stores', async () => {
  const actual = await vi.importActual<typeof import('../../../stores')>('../../../stores');
  return {
    ...actual,
    useAccountStore: (
      selector: (s: { settings: { businessLicenceCategory?: BusinessLicenceCategory } | null }) => unknown
    ) => selector({ settings: { businessLicenceCategory: mockBusinessCategory } }),
  };
});

import { SideNav } from '../SideNav';
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

describe('SideNav — category-aware visibility (SOUPFIN-25)', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
    mockBusinessCategory = undefined;
  });

  it('hides the Vendors item for SERVICES tenants', () => {
    mockBusinessCategory = 'SERVICES';
    renderAt('/dashboard');

    expect(screen.queryByText('Vendors')).not.toBeInTheDocument();
    // Grafted from variant B: guard against over-filtering. Hiding Vendors must
    // not take unrelated items with it — a filter bug that dropped everything
    // would still satisfy the assertion above on its own.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows the Vendors item for TRADING tenants', () => {
    mockBusinessCategory = 'TRADING';
    renderAt('/dashboard');

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('shows the Vendors item for other non-SERVICES categories (e.g. BROKER)', () => {
    mockBusinessCategory = 'BROKER';
    renderAt('/dashboard');

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('defaults to showing Vendors when the category is unknown (settings not loaded)', () => {
    mockBusinessCategory = undefined;
    renderAt('/dashboard');

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('keeps Vendors hidden for SERVICES even when the sidebar is collapsed', () => {
    // Collapsed mode hides labels but still renders the item, so a label-only
    // assertion would pass even if the filter did nothing. Assert on the route.
    mockBusinessCategory = 'SERVICES';
    useUIStore.setState({ sidebarCollapsed: true });
    const { container } = renderAt('/dashboard');

    expect(container.querySelector('a[href="/vendors"]')).toBeNull();
  });

  it('renders the Vendors link to /vendors for TRADING tenants', () => {
    mockBusinessCategory = 'TRADING';
    const { container } = renderAt('/dashboard');

    expect(container.querySelector('a[href="/vendors"]')).not.toBeNull();
  });
});
