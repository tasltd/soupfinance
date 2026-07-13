/**
 * Unit tests for SideNav (SOUPFIN-25).
 *
 * Verifies the Vendors navigation item is hidden for SERVICES tenants (which don't use
 * suppliers/inventory) and remains visible for TRADING / unknown / not-yet-loaded tenants.
 *
 * SERVICES tenants are also gated out of the trading VendorController by the backend
 * TradingModuleInterceptor, so showing the link would only lead to a 403.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SideNav } from '../SideNav';
import { useAccountStore } from '../../../stores/accountStore';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import type { AccountSettings, BusinessLicenceCategory } from '../../../types/settings';

function buildSettings(
  category?: BusinessLicenceCategory
): AccountSettings {
  return {
    id: 'acct-1',
    name: 'Test Tenant',
    currency: 'USD',
    businessLicenceCategory: category,
  };
}

function setBusinessCategory(category?: BusinessLicenceCategory) {
  // settings === null means "not loaded yet"
  useAccountStore.setState({
    settings: category === undefined ? null : buildSettings(category),
  });
}

function renderSideNav() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SideNav />
    </MemoryRouter>
  );
}

describe('SideNav — Vendors visibility by business licence category (SOUPFIN-25)', () => {
  beforeEach(() => {
    // Authenticated user + expanded sidebar so labels render.
    useAuthStore.setState({
      isAuthenticated: true,
      user: { username: 'u', email: 'u@test.com', roles: ['ROLE_USER'] } as never,
    });
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
  });

  afterEach(() => {
    useAccountStore.setState({ settings: null });
  });

  it('hides the Vendors nav item for SERVICES tenants', () => {
    setBusinessCategory('SERVICES');
    renderSideNav();

    expect(screen.queryByRole('link', { name: /vendors/i })).not.toBeInTheDocument();
    // Sanity: other nav items still render.
    expect(screen.getByRole('link', { name: /invoices/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /clients/i })).toBeInTheDocument();
  });

  it('shows the Vendors nav item for TRADING tenants', () => {
    setBusinessCategory('TRADING');
    renderSideNav();

    expect(screen.getByRole('link', { name: /vendors/i })).toBeInTheDocument();
  });

  it('shows the Vendors nav item for other licence categories (e.g. BROKER)', () => {
    setBusinessCategory('BROKER');
    renderSideNav();

    expect(screen.getByRole('link', { name: /vendors/i })).toBeInTheDocument();
  });

  it('shows the Vendors nav item while settings are still loading (undefined)', () => {
    setBusinessCategory(undefined);
    renderSideNav();

    // Fail-open: don't hide until we KNOW the tenant is SERVICES.
    expect(screen.getByRole('link', { name: /vendors/i })).toBeInTheDocument();
  });
});
