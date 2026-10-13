/**
 * Added (SOUPFIN-160): VendorFormPage error handling.
 * Covers the edit-mode lookup (module disabled, role denied, server fault),
 * the save error banner, and the round trip of a successful save.
 *
 * Added (SOUPFIN-182): create and edit with the domain fields the form did not
 * render (symbol, vendorType, postalAddress, ledgerAccount, archived), schema
 * validation, and the liability-filtered ledger account select. The CSRF save
 * path itself is covered in api/endpoints/__tests__/vendors.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorFormPage } from '../VendorFormPage';
// Added (SOUPFIN-183): the page reads its strings from the i18n namespaces
import '../../../i18n';
import type { Vendor } from '../../../types';
import { moduleDisabled403, roleDenied403, serverError500 } from '../../../test/apiErrorFixtures';

vi.mock('../../../api', () => ({
  getVendor: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
}));

// Added (SOUPFIN-182): the ledger account select; keep the real group matcher
vi.mock('../../../api/endpoints/ledger', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/ledger')>(
    '../../../api/endpoints/ledger'
  );
  return { ...actual, listAllLedgerAccounts: vi.fn() };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { getVendor, createVendor, updateVendor } from '../../../api';
import { listAllLedgerAccounts } from '../../../api/endpoints/ledger';
import type { LedgerAccount } from '../../../types';

function account(
  id: string,
  number: string,
  name: string,
  ledgerGroup: LedgerAccount['ledgerGroup'],
  extra: Partial<LedgerAccount> = {}
): LedgerAccount {
  // code mirrors transformLedgerAccount: number, else the random quickReference
  return { id, code: number || id.toUpperCase(), number: number || undefined, name, ledgerGroup, isActive: true, balance: 0, ...extra };
}

const SHORT_TERM = { id: 'cat-st', serialised: 'Short-term Liabilities < LIABILITY' };

const LEDGER_ACCOUNTS: LedgerAccount[] = [
  account('la-cash', '1000', 'Cash', 'ASSET'),
  account('la-accrued', '2100', 'Accrued Expenses', 'LIABILITY'),
  account('la-ap', '2000', 'Accounts Payable', 'LIABILITY'),
  // The tenant's generated payables account (OTHER LIABILITIES, no number): kept
  account('la-sys-ap', '', 'Acme Ltd Payable Account', 'LIABILITY', {
    systemAccount: true,
    ledgerAccountCategory: { id: 'cat-ol', serialised: 'Other Liabilities < LIABILITY' },
  }),
  // A generated per-client fund account: not somewhere a vendor bill posts
  account('la-client', '', 'Direct Account : Individual(Ama Owusu) Investment Fund Account', 'LIABILITY', {
    systemAccount: true,
    ledgerAccountCategory: SHORT_TERM,
  }),
  account('la-hidden', '2900', 'Suspense', 'LIABILITY', { hiddenAccount: true }),
  account('la-rent', '5200', 'Rent Expense', 'EXPENSE'),
];

// Added (SOUPFIN-182): every test renders the ledger select
beforeEach(() => {
  vi.mocked(listAllLedgerAccounts).mockResolvedValue(LEDGER_ACCOUNTS);
});

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

// =============================================================================
// Added (SOUPFIN-182): domain fields, validation, ledger account select
// =============================================================================

function optionLabels(select: HTMLElement) {
  return Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
}

describe('VendorFormPage domain fields (SOUPFIN-182)', () => {
  beforeEach(() => {
    vi.mocked(getVendor).mockReset();
    vi.mocked(createVendor).mockReset();
    vi.mocked(updateVendor).mockReset();
    mockNavigate.mockClear();
  });

  describe('create', () => {
    it('sends every filled field, with the ledger account as a nested FK', async () => {
      const user = userEvent.setup();
      vi.mocked(createVendor).mockResolvedValue(createMockVendor({ id: 'vendor-new' }));

      renderVendorFormPage();
      await waitFor(() => expect(screen.getByTestId('vendor-form-ledger-account')).toBeEnabled());

      await user.type(screen.getByTestId('vendor-form-name'), 'Acme Supplies');
      await user.type(screen.getByTestId('vendor-form-symbol'), '  ACME  ');
      await user.selectOptions(screen.getByTestId('vendor-form-vendor-type'), 'SERVICE_PROVIDER');
      await user.type(screen.getByTestId('vendor-form-email'), 'ap@acme.com');
      await user.type(screen.getByTestId('vendor-form-payment-terms'), '0');
      await user.selectOptions(screen.getByTestId('vendor-form-ledger-account'), 'la-ap');
      await user.type(screen.getByTestId('vendor-form-address'), '12 High St');
      await user.type(screen.getByTestId('vendor-form-postal-address'), 'P.O. Box 77');
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(createVendor).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createVendor).mock.calls[0][0]).toEqual({
        name: 'Acme Supplies',
        symbol: 'ACME',
        vendorType: 'SERVICE_PROVIDER',
        email: 'ap@acme.com',
        phoneNumber: undefined,
        address: '12 High St',
        postalAddress: 'P.O. Box 77',
        taxIdentificationNumber: undefined,
        // Net 0 is a real term; it used to be dropped as falsy
        paymentTerms: 0,
        notes: undefined,
        ledgerAccount: { id: 'la-ap' },
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/vendors/vendor-new'));
    });

    it('sends only the name for a minimal vendor and leaves the ledger account to the backend', async () => {
      const user = userEvent.setup();
      vi.mocked(createVendor).mockResolvedValue(createMockVendor({ id: 'vendor-min' }));

      renderVendorFormPage();
      await user.type(screen.getByTestId('vendor-form-name'), 'Minimal Ltd');
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(createVendor).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createVendor).mock.calls[0][0];
      expect(Object.entries(payload).filter(([, v]) => v !== undefined)).toEqual([['name', 'Minimal Ltd']]);
      // A new vendor is never created archived
      expect(payload).not.toHaveProperty('archived');
    });

    it('offers liability accounts by name, without client fund or hidden accounts', async () => {
      renderVendorFormPage();
      const select = screen.getByTestId('vendor-form-ledger-account');
      await waitFor(() => expect(select).toBeEnabled());

      expect(optionLabels(select)).toEqual([
        'Create one automatically',
        '2000 - Accounts Payable',
        '2100 - Accrued Expenses',
        'Acme Ltd Payable Account',
      ]);
      expect(screen.queryByTestId('vendor-form-status-section')).not.toBeInTheDocument();
    });

    it('lists general-purpose vendor types first and covers every backend enum value', () => {
      renderVendorFormPage();
      const labels = optionLabels(screen.getByTestId('vendor-form-vendor-type'));

      expect(labels.slice(0, 6)).toEqual([
        'Not classified', 'Supplier', 'Service provider', 'Contractor', 'Consultant', 'Other',
      ]);
      // 19 enum values + "Not classified"
      expect(labels).toHaveLength(20);
      expect(labels).toContain('Rural and community bank');
    });

    it('explains an empty chart of accounts (zero liability accounts)', async () => {
      vi.mocked(listAllLedgerAccounts).mockResolvedValue([account('la-cash', '1000', 'Cash', 'ASSET')]);

      renderVendorFormPage();

      expect(await screen.findByText('No liability accounts in the chart of accounts yet.')).toBeInTheDocument();
      expect(optionLabels(screen.getByTestId('vendor-form-ledger-account'))).toEqual(['Create one automatically']);
    });

    it('still saves the vendor when the Ledger module is disabled', async () => {
      const user = userEvent.setup();
      vi.mocked(listAllLedgerAccounts).mockRejectedValue(moduleDisabled403('Ledger', '/ledgerAccount/index.json'));
      vi.mocked(createVendor).mockResolvedValue(createMockVendor({ id: 'vendor-new' }));

      renderVendorFormPage();

      const helper = await screen.findByText(/Ledger accounts could not be loaded/);
      expect(helper).toHaveTextContent(/Ledger module/);
      expect(helper).not.toHaveTextContent(/status code/i);
      // Only the ledger feature is off; the vendor form itself is not blocked
      expect(screen.queryByTestId('vendor-form-module-disabled')).not.toBeInTheDocument();

      await user.type(screen.getByTestId('vendor-form-name'), 'Acme Supplies');
      await user.click(screen.getByTestId('vendor-form-save'));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/vendors/vendor-new'));
    });

    it('lists hundreds of liability accounts without truncation (overflow)', async () => {
      const many = Array.from({ length: 600 }, (_, i) =>
        account(`la-${i}`, String(20000 + i), `Payable ${i}`, 'LIABILITY')
      );
      // The LXC dev tenant has 1,006 client fund accounts beside its real payables
      const clientFunds = Array.from({ length: 1006 }, (_, i) =>
        account(`la-cf-${i}`, '', `Direct Account : Individual(Client ${i}) Investment Fund Account`, 'LIABILITY', {
          systemAccount: true,
          ledgerAccountCategory: SHORT_TERM,
        })
      );
      vi.mocked(listAllLedgerAccounts).mockResolvedValue([
        ...clientFunds,
        ...many,
        account('la-x', '5000', 'Expense', 'EXPENSE'),
      ]);

      renderVendorFormPage();
      const select = screen.getByTestId('vendor-form-ledger-account');
      await waitFor(() => expect(select).toBeEnabled());

      expect((select as HTMLSelectElement).options).toHaveLength(601);
      expect(optionLabels(select)).toContain('20599 - Payable 599');
    });
  });

  describe('validation', () => {
    it.each([
      ['an empty name', {}, 'Vendor name is required'],
      ['an invalid email', { 'vendor-form-email': 'not-an-email' }, 'Invalid email address'],
      ['payment terms over 365 days', { 'vendor-form-payment-terms': '366' }, 'Payment terms cannot exceed 365 days'],
      ['a symbol over 255 characters', { 'vendor-form-symbol': 'S'.repeat(256) }, 'Symbol is too long'],
      ['a postal address over 500 characters', { 'vendor-form-postal-address': 'P'.repeat(501) }, 'Postal address is too long'],
    ])('blocks saving with %s', async (_case, fields: Record<string, string>, message) => {
      const user = userEvent.setup();
      renderVendorFormPage();

      if (Object.keys(fields).length) await user.type(screen.getByTestId('vendor-form-name'), 'Acme');
      for (const [testId, value] of Object.entries(fields)) {
        // paste, not type: typing 500 characters one by one is slow and proves nothing more
        await user.click(screen.getByTestId(testId));
        await user.paste(value);
      }
      await user.click(screen.getByTestId('vendor-form-save'));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(createVendor).not.toHaveBeenCalled();
    });

    it('accepts a postal address of exactly 500 characters', async () => {
      const user = userEvent.setup();
      vi.mocked(createVendor).mockResolvedValue(createMockVendor({ id: 'vendor-new' }));
      renderVendorFormPage();

      await user.type(screen.getByTestId('vendor-form-name'), 'Acme');
      await user.click(screen.getByTestId('vendor-form-postal-address'));
      await user.paste('P'.repeat(500));
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(createVendor).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createVendor).mock.calls[0][0].postalAddress).toHaveLength(500);
    });
  });

  describe('edit', () => {
    const stored = createMockVendor({
      id: 'vendor-123',
      name: 'Acme Supplies',
      symbol: 'ACME',
      vendorType: 'CONSULTANT',
      postalAddress: 'P.O. Box 9',
      phoneNumber: '555-0100',
      paymentTerms: 45,
      // VendorService.doSave links new vendors to a generated EXPENSE account
      ledgerAccount: {
        id: 'la-generated',
        // Real shape from the LXC backend
        serialised: 'Acme Supplies Account[ Other Expenses < RETAINED EARNINGS < EXPENSE < RETAINED_EARNINGS < EQUITY ] - GHS',
        class: 'soupbroker.finance.LedgerAccount',
      },
    });

    it('loads the stored fields and keeps the currently linked non-liability account selectable', async () => {
      vi.mocked(getVendor).mockResolvedValue(stored);

      renderVendorFormPage('vendor-123');

      await waitFor(() => expect(screen.getByTestId('vendor-form-name')).toHaveValue('Acme Supplies'));
      expect(screen.getByTestId('vendor-form-symbol')).toHaveValue('ACME');
      expect(screen.getByTestId('vendor-form-vendor-type')).toHaveValue('CONSULTANT');
      expect(screen.getByTestId('vendor-form-postal-address')).toHaveValue('P.O. Box 9');
      expect(screen.getByTestId('vendor-form-archived')).not.toBeChecked();

      const select = screen.getByTestId('vendor-form-ledger-account');
      await waitFor(() => expect(select).toHaveValue('la-generated'));
      expect(optionLabels(select)).toEqual([
        'No ledger account',
        '2000 - Accounts Payable',
        '2100 - Accrued Expenses',
        'Acme Ltd Payable Account',
        'Acme Supplies Account (currently linked)',
      ]);
    });

    it('archives the vendor, relinks the ledger account and sends null for cleared fields', async () => {
      const user = userEvent.setup();
      vi.mocked(getVendor).mockResolvedValue(stored);
      vi.mocked(updateVendor).mockResolvedValue({ ...stored, archived: true });

      renderVendorFormPage('vendor-123');
      await waitFor(() => expect(screen.getByTestId('vendor-form-symbol')).toHaveValue('ACME'));
      await waitFor(() => expect(screen.getByTestId('vendor-form-ledger-account')).toBeEnabled());

      await user.clear(screen.getByTestId('vendor-form-symbol'));
      await user.clear(screen.getByTestId('vendor-form-phone'));
      await user.clear(screen.getByTestId('vendor-form-payment-terms'));
      await user.selectOptions(screen.getByTestId('vendor-form-vendor-type'), '');
      await user.selectOptions(screen.getByTestId('vendor-form-ledger-account'), 'la-accrued');
      await user.click(screen.getByTestId('vendor-form-archived'));
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
      expect(vi.mocked(updateVendor).mock.calls[0]).toEqual([
        'vendor-123',
        {
          name: 'Acme Supplies',
          symbol: null,
          vendorType: null,
          email: 'contact@acme.com',
          phoneNumber: null,
          address: null,
          postalAddress: 'P.O. Box 9',
          taxIdentificationNumber: null,
          paymentTerms: null,
          notes: null,
          ledgerAccount: { id: 'la-accrued' },
          archived: true,
        },
      ]);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/vendors/vendor-123'));
    });

    it('restores an archived vendor and can unlink its ledger account', async () => {
      const user = userEvent.setup();
      vi.mocked(getVendor).mockResolvedValue({ ...stored, archived: true });
      vi.mocked(updateVendor).mockResolvedValue({ ...stored, archived: false });

      renderVendorFormPage('vendor-123');
      await waitFor(() => expect(screen.getByTestId('vendor-form-archived')).toBeChecked());
      await waitFor(() => expect(screen.getByTestId('vendor-form-ledger-account')).toHaveValue('la-generated'));

      await user.click(screen.getByTestId('vendor-form-archived'));
      await user.selectOptions(screen.getByTestId('vendor-form-ledger-account'), '');
      await user.click(screen.getByTestId('vendor-form-save'));

      await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
      expect(vi.mocked(updateVendor).mock.calls[0][1]).toMatchObject({ archived: false, ledgerAccount: null });
    });

    it('reads an {enumType, name} vendorType and ignores a value the enum lacks', async () => {
      vi.mocked(getVendor).mockResolvedValueOnce(
        createMockVendor({ vendorType: { enumType: 'soupbroker.VendorType', name: 'BROKER' } as unknown as Vendor['vendorType'] })
      );
      const { unmount } = renderVendorFormPage('vendor-123');
      await waitFor(() => expect(screen.getByTestId('vendor-form-vendor-type')).toHaveValue('BROKER'));
      unmount();

      vi.mocked(getVendor).mockResolvedValueOnce(
        createMockVendor({ vendorType: 'NOT_A_TYPE' as unknown as Vendor['vendorType'] })
      );
      renderVendorFormPage('vendor-123');
      await waitFor(() => expect(screen.getByTestId('vendor-form-name')).toHaveValue('Acme Supplies'));
      expect(screen.getByTestId('vendor-form-vendor-type')).toHaveValue('');
    });
  });
});

