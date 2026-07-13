/**
 * Unit tests for SideNav — category-aware navigation visibility (SOUPFIN-25)
 *
 * The Vendors nav item must be hidden for SERVICES tenants (they have no
 * suppliers/inventory) and shown for TRADING tenants. When the tenant's
 * business category is unknown (settings not yet loaded), items default to
 * visible so nothing disappears during the initial load.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BusinessLicenceCategory } from '../../../types/settings';

// Mutable mock state driven per-test
const mockUiState = {
  sidebarCollapsed: false,
  setSidebarCollapsed: vi.fn(),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: vi.fn(),
};
let mockBusinessCategory: BusinessLicenceCategory | undefined;
const mockAuthState = { user: { email: 'user@acme.test' }, logout: vi.fn() };

vi.mock('../../../stores', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
  useUIStore: () => mockUiState,
  useAccountStore: (
    selector: (s: { settings: { businessLicenceCategory?: BusinessLicenceCategory } | null }) => unknown
  ) => selector({ settings: { businessLicenceCategory: mockBusinessCategory } }),
}));

// Logo pulls in assets we don't need for nav assertions
vi.mock('../../Logo', () => ({ Logo: () => <div data-testid="logo" /> }));

import { SideNav } from '../SideNav';

function renderSideNav() {
  return render(
    <MemoryRouter>
      <SideNav />
    </MemoryRouter>
  );
}

describe('SideNav — category-aware visibility (SOUPFIN-25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUiState.sidebarCollapsed = false;
    mockBusinessCategory = undefined;
  });

  it('hides the Vendors item for SERVICES tenants', () => {
    mockBusinessCategory = 'SERVICES';
    renderSideNav();

    expect(screen.queryByText('Vendors')).not.toBeInTheDocument();
    // Unrelated items must still render
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows the Vendors item for TRADING tenants', () => {
    mockBusinessCategory = 'TRADING';
    renderSideNav();

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('shows the Vendors item for other non-SERVICES categories (e.g. BROKER)', () => {
    mockBusinessCategory = 'BROKER';
    renderSideNav();

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('defaults to showing Vendors when the category is unknown (settings not loaded)', () => {
    mockBusinessCategory = undefined;
    renderSideNav();

    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('keeps Vendors hidden for SERVICES even when the sidebar is collapsed', () => {
    // Collapsed mode hides labels but still renders the item; the filter must
    // remove the item entirely, so its icon-only link must not be present.
    mockBusinessCategory = 'SERVICES';
    mockUiState.sidebarCollapsed = true;
    renderSideNav();

    // Collapsed hides text labels, so assert on the item's route instead.
    expect(screen.queryByRole('link', { name: /vendors/i })).not.toBeInTheDocument();
    const vendorsLink = document.querySelector('a[href="/vendors"]');
    expect(vendorsLink).toBeNull();
  });

  it('renders the Vendors link to /vendors for TRADING tenants', () => {
    mockBusinessCategory = 'TRADING';
    renderSideNav();

    const vendorsLink = document.querySelector('a[href="/vendors"]');
    expect(vendorsLink).not.toBeNull();
  });
});
