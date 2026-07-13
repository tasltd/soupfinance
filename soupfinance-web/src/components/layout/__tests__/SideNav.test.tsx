/**
 * Unit tests for SideNav (SOUPFIN-25).
 *
 * Verifies module-gated navigation visibility:
 *  - The Vendors nav item is HIDDEN for SERVICES tenants (they have no TRADING module,
 *    so the backend TradingModuleInterceptor would 403 the vendors endpoints).
 *  - The Vendors nav item is SHOWN for TRADING / broker categories and when the tenant's
 *    business category has not yet loaded (fail-open until we positively know it's SERVICES).
 *  - Hiding Vendors does not remove unrelated nav items (Invoices, Bills, Clients).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SideNav } from '../SideNav';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAccountStore } from '../../../stores/accountStore';
import type { BusinessLicenceCategory } from '../../../types/settings';

function setBusinessCategory(category?: BusinessLicenceCategory) {
  useAccountStore.setState({
    settings: category
      ? ({ id: 'tenant-1', name: 'Acme', businessLicenceCategory: category } as never)
      : null,
  } as never);
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SideNav />
    </MemoryRouter>
  );
}

describe('SideNav — module-gated Vendors visibility (SOUPFIN-25)', () => {
  beforeEach(() => {
    // Authenticated, non-collapsed sidebar so text labels render.
    useAuthStore.setState({
      user: { username: 'demo', email: 'demo@example.com', roles: [] },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
      logout: () => {},
    } as never);
    useUIStore.setState({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
    } as never);
    setBusinessCategory(undefined);
  });

  it('hides the Vendors item for SERVICES tenants', () => {
    setBusinessCategory('SERVICES');
    renderNav();
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument();
  });

  it('keeps unrelated nav items visible when Vendors is hidden', () => {
    setBusinessCategory('SERVICES');
    renderNav();
    // Sibling items must still render — only Vendors is gated.
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Bills')).toBeInTheDocument();
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows the Vendors item for TRADING tenants', () => {
    setBusinessCategory('TRADING');
    renderNav();
    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('shows the Vendors item for non-SERVICES categories (e.g. BROKER)', () => {
    setBusinessCategory('BROKER');
    renderNav();
    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('shows the Vendors item while the business category is not yet loaded (fail-open)', () => {
    setBusinessCategory(undefined);
    renderNav();
    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });
});
