/**
 * Added (SOUPFIN-160): VendorFormPage error handling.
 * Covers the edit-mode lookup (module disabled, role denied, server fault),
 * the save error banner, and the round trip of a successful save.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorFormPage } from '../VendorFormPage';
import type { Vendor } from '../../../types';
import { moduleDisabled403, roleDenied403, serverError500 } from '../../../test/apiErrorFixtures';

vi.mock('../../../api', () => ({
  getVendor: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { getVendor, createVendor, updateVendor } from '../../../api';

function createMockVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-123',
    name: 'Acme Supplies',
    email: 'contact@acme.com',
    archived: false,
    dateCreated: '2024-01-01T10:00:00Z',
    lastUpdated: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

function renderVendorFormPage(vendorId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const entry = vendorId ? `/vendors/${vendorId}/edit` : '/vendors/new';
  const path = vendorId ? '/vendors/:id/edit' : '/vendors/new';
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={<VendorFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VendorFormPage module-aware errors (SOUPFIN-160)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('edit-mode lookup', () => {
    it('keeps the form under a module banner and blocks saving when Trading is disabled', async () => {
      vi.mocked(getVendor).mockRejectedValue(moduleDisabled403('Trading', '/vendor/show/vendor-123.json'));

      renderVendorFormPage('vendor-123');

      const banner = await screen.findByTestId('vendor-form-module-disabled');
      expect(banner).toHaveTextContent('Trading module is not available');
      expect(banner).toHaveTextContent('Vendors cannot be saved until the module is enabled.');
      expect(screen.getByTestId('vendor-form-container')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-form-save')).toBeDisabled();
      expect(screen.getByTestId('vendor-form-save-mobile')).toBeDisabled();

      // Enter in a field submits the form element; that must not reach the API either
      await userEvent.setup().type(screen.getByTestId('vendor-form-name'), 'Acme');
      fireEvent.submit(screen.getByTestId('vendor-form-container'));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updateVendor).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/status code/i);
    });

    it.each([
      ['a missing role', () => roleDenied403('/vendor/show/vendor-123.json'), 'forbidden', 'You do not have permission'],
      ['a server fault', () => serverError500('/vendor/show/vendor-123.json'), 'server_error', 'Server error'],
    ])('replaces the form with an error card for %s', async (_cause, makeError, kind, title) => {
      vi.mocked(getVendor).mockRejectedValue(makeError());

      renderVendorFormPage('vendor-123');

      const card = await screen.findByTestId('vendor-form-load-error');
      expect(card).toHaveAttribute('data-error-kind', kind);
      expect(within(card).getByText(title)).toBeInTheDocument();
      expect(screen.queryByTestId('vendor-form-container')).not.toBeInTheDocument();
      expect(screen.queryByTestId('vendor-form-module-disabled')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/status code/i);

      await userEvent.setup().click(screen.getByTestId('vendor-form-back-button'));
      expect(mockNavigate).toHaveBeenCalledWith('/vendors');
    });

    it('Retry after a server fault loads the vendor into the form', async () => {
      vi.mocked(getVendor).mockRejectedValueOnce(serverError500('/vendor/show/vendor-123.json'));

      renderVendorFormPage('vendor-123');

      const card = await screen.findByTestId('vendor-form-load-error');
      vi.mocked(getVendor).mockResolvedValue(createMockVendor({ name: 'Acme Supplies' }));
      await userEvent.setup().click(within(card).getByRole('button', { name: /retry/i }));

      await waitFor(() => expect(screen.getByTestId('vendor-form-name')).toHaveValue('Acme Supplies'));
      expect(screen.getByTestId('vendor-form-save')).toBeEnabled();
    });
  });

  describe('save', () => {
    it.each([
      ['a disabled module', () => moduleDisabled403('Trading', '/vendor/save.json'), /Trading module/],
      ['a missing role', () => roleDenied403('/vendor/save.json'), /does not have permission to perform this action/],
      ['a server fault', () => serverError500('/vendor/save.json'), /Something went wrong on our side/],
    ])('explains %s instead of the HTTP status', async (_cause, makeError, message) => {
      const user = userEvent.setup();
      vi.mocked(createVendor).mockRejectedValue(makeError());

      renderVendorFormPage();
      await user.type(screen.getByTestId('vendor-form-name'), 'Acme Supplies');
      await user.click(screen.getByTestId('vendor-form-save'));

      const banner = await screen.findByTestId('vendor-form-error');
      expect(banner).toHaveTextContent('Failed to save vendor');
      expect(banner).toHaveTextContent(message);
      expect(banner).not.toHaveTextContent(/status code/i);
      expect(createVendor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme Supplies' }));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates to the new vendor when the save succeeds', async () => {
      const user = userEvent.setup();
      vi.mocked(createVendor).mockResolvedValue(createMockVendor({ id: 'vendor-new' }));

      renderVendorFormPage();
      await user.type(screen.getByTestId('vendor-form-name'), 'Acme Supplies');
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/vendors/vendor-new'));
      expect(screen.queryByTestId('vendor-form-error')).not.toBeInTheDocument();
    });
  });
});
