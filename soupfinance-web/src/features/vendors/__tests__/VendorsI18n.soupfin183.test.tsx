/**
 * SOUPFIN-183: the vendor pages read every user-facing string from the
 * `vendors` namespace, in en, de, fr and nl.
 *
 * Covers: key and placeholder parity across the four locales, every vendor
 * type labelled, each page rendered in a non-English language, plural forms at
 * 1 and at a million (French has a separate "many" form), a vendor name that
 * looks like markup in the delete dialog, validation messages, and a scan of
 * the source for English left in JSX.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import i18n from '../../../i18n';
import enVendors from '../../../i18n/locales/en/vendors.json';
import deVendors from '../../../i18n/locales/de/vendors.json';
import frVendors from '../../../i18n/locales/fr/vendors.json';
import nlVendors from '../../../i18n/locales/nl/vendors.json';
import { VendorListPage } from '../VendorListPage';
import { VendorDetailPage } from '../VendorDetailPage';
import { VendorFormPage } from '../VendorFormPage';
import { VENDOR_TYPES, type Vendor } from '../../../types';
import { flattenKeys, findHardcodedEnglish } from '../../../test/i18nAudit';

vi.mock('../../../api', () => ({
  listVendors: vi.fn(),
  getVendor: vi.fn(),
  deleteVendor: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
}));
vi.mock('../../../api/endpoints/ledger', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/ledger')>(
    '../../../api/endpoints/ledger'
  );
  return { ...actual, listAllLedgerAccounts: vi.fn() };
});

import { listVendors, getVendor, createVendor } from '../../../api';
import { listAllLedgerAccounts } from '../../../api/endpoints/ledger';

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-1',
    name: 'Acme Supplies',
    email: 'info@acme.example',
    phoneNumber: '555-1234',
    paymentTerms: 30,
    archived: false,
    dateCreated: '2026-10-01T00:00:00Z',
    lastUpdated: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Vendor;
}

function renderAt(path: string, element: React.ReactNode, route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const LOCALES = { de: deVendors, fr: frVendors, nl: nlVendors };
const MARKUP_NAME = '<1>Acme</1> & <b>Sons</b>';

describe('SOUPFIN-183: vendors namespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAllLedgerAccounts).mockResolvedValue([]);
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('locale files', () => {
    it.each(Object.entries(LOCALES))('%s has the same keys and placeholders as English', (_lang, locale) => {
      const en = flattenKeys(enVendors);
      const other = flattenKeys(locale);
      expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
      for (const [key, placeholders] of en) {
        expect(other.get(key), key).toEqual(placeholders);
      }
    });

    it('labels every backend vendor type in every locale', () => {
      for (const locale of [enVendors, deVendors, frVendors, nlVendors]) {
        const types = locale.types as Record<string, string>;
        for (const type of VENDOR_TYPES) expect(types[type]?.trim(), type).toBeTruthy();
        expect(Object.keys(types).sort()).toEqual([...VENDOR_TYPES, 'notClassified'].sort());
      }
    });
  });

  describe('VendorListPage', () => {
    it('renders the list in French, including singular and plural payment terms', async () => {
      await i18n.changeLanguage('fr');
      vi.mocked(listVendors).mockResolvedValue([
        vendor({ id: 'v-1', paymentTerms: 1, totalCount: 2 }),
        vendor({ id: 'v-2', name: 'Beta', paymentTerms: 30, totalCount: 2 }),
      ]);
      renderAt('/vendors', <VendorListPage />, '/vendors');

      expect(await screen.findByTestId('vendor-row-v-1')).toHaveTextContent('1 jour');
      expect(screen.getByTestId('vendor-row-v-2')).toHaveTextContent('30 jours');
      expect(screen.getByTestId('vendor-list-heading')).toHaveTextContent('Fournisseurs');
      expect(screen.getByRole('tab', { name: 'Actifs' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Archivés' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Rechercher des fournisseurs' })).toBeInTheDocument();
      expect(screen.getByTestId('vendor-pagination-range')).toHaveTextContent('1 à 2 sur 2 fournisseurs');
      expect(screen.getByTestId('vendor-view-v-1')).toHaveAttribute('title', 'Voir');
    });

    it.each([
      ['en', 'Showing 1 to 20 of 1000000 vendors'],
      ['fr', '1 à 20 sur 1000000 fournisseurs'],
      ['de', '1 bis 20 von 1000000 Lieferanten'],
      ['nl', '1 tot 20 van 1000000 leveranciers'],
    ])('uses the plural form for a million vendors in %s', async (lang, range) => {
      await i18n.changeLanguage(lang);
      vi.mocked(listVendors).mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => vendor({ id: `v-${i}`, totalCount: 1_000_000 }))
      );
      renderAt('/vendors', <VendorListPage />, '/vendors');

      expect(await screen.findByTestId('vendor-pagination-range')).toHaveTextContent(range);
      expect(screen.getByTestId('vendor-pagination-page-50000')).toBeInTheDocument();
    });

    it('uses the singular form for one archived vendor in German', async () => {
      await i18n.changeLanguage('de');
      vi.mocked(listVendors).mockResolvedValue([vendor({ archived: true, totalCount: 1 })]);
      renderAt('/vendors', <VendorListPage />, '/vendors');

      await userEvent.click(await screen.findByRole('tab', { name: 'Archiviert' }));
      expect(await screen.findByTestId('vendor-pagination-range')).toHaveTextContent(
        '1 bis 1 von 1 archivierten Lieferant'
      );
    });

    it('renders the empty state in Dutch', async () => {
      await i18n.changeLanguage('nl');
      vi.mocked(listVendors).mockResolvedValue([]);
      renderAt('/vendors', <VendorListPage />, '/vendors');

      expect(await screen.findByTestId('vendor-list-empty')).toHaveTextContent('Nog geen leveranciers');
    });

    it('shows a vendor name that looks like markup as text in the delete dialog', async () => {
      await i18n.changeLanguage('de');
      vi.mocked(listVendors).mockResolvedValue([vendor({ name: MARKUP_NAME, totalCount: 1 })]);
      renderAt('/vendors', <VendorListPage />, '/vendors');

      await userEvent.click(await screen.findByTestId('vendor-delete-vendor-1'));
      const dialog = screen.getByTestId('delete-confirmation-modal');
      expect(within(dialog).getByText('Lieferant löschen')).toBeInTheDocument();
      expect(within(dialog).getByText(MARKUP_NAME)).toHaveClass('font-semibold');
      expect(dialog.querySelector('b')).toBeNull();
      expect(dialog).toHaveTextContent(`Möchten Sie ${MARKUP_NAME} wirklich löschen?`);
      expect(within(dialog).getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
    });
  });

  describe('VendorDetailPage', () => {
    it('renders the page and delete dialog in German', async () => {
      await i18n.changeLanguage('de');
      vi.mocked(getVendor).mockResolvedValue(
        vendor({ name: MARKUP_NAME, email: undefined, phoneNumber: undefined, paymentTerms: 45 })
      );
      renderAt('/vendors/vendor-1', <VendorDetailPage />, '/vendors/:id');

      expect(await screen.findByText('45 Tage')).toBeInTheDocument();
      // email, phone, tax ID and address are missing
      expect(screen.getAllByText('Nicht angegeben')).toHaveLength(4);
      expect(screen.getByTestId('vendor-pay-bills')).toHaveTextContent('Rechnungen bezahlen');
      expect(screen.getByText('Keine Notizen')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('vendor-detail-delete'));
      const dialog = screen.getByTestId('delete-confirmation-modal');
      expect(within(dialog).getByText(MARKUP_NAME)).toBeInTheDocument();
      expect(screen.getByTestId('delete-confirm-button')).toHaveTextContent('Löschen');
    });
  });

  describe('VendorFormPage', () => {
    it('renders labels, vendor types and the ledger helper in Dutch', async () => {
      await i18n.changeLanguage('nl');
      renderAt('/vendors/new', <VendorFormPage />, '/vendors/new');

      expect(await screen.findByTestId('vendor-form-heading')).toHaveTextContent('Nieuwe leverancier');
      expect(screen.getByLabelText(/Naam leverancier/)).toHaveAttribute('placeholder', 'Voer de naam van de leverancier in');
      const types = [...(screen.getByTestId('vendor-form-vendor-type') as HTMLSelectElement).options].map((o) => o.text);
      expect(types.slice(0, 3)).toEqual(['Niet ingedeeld', 'Leverancier', 'Dienstverlener']);
      expect(types).toHaveLength(VENDOR_TYPES.length + 1);
      expect(await screen.findByText('Het rekeningschema bevat nog geen passivarekeningen.')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-form-save')).toHaveTextContent('Leverancier aanmaken');
    });

    it.each([
      ['nl', {}, 'Naam leverancier is verplicht'],
      ['de', { 'vendor-form-payment-terms': '366' }, 'Das Zahlungsziel darf 365 Tage nicht überschreiten'],
      ['fr', { 'vendor-form-payment-terms': '1.5' }, 'Le délai de paiement doit être un nombre entier'],
      ['fr', { 'vendor-form-email': 'pas-un-email' }, 'Adresse e-mail invalide'],
    ])('shows the validation message in %s', async (lang, fields: Record<string, string>, message) => {
      await i18n.changeLanguage(lang);
      const user = userEvent.setup();
      renderAt('/vendors/new', <VendorFormPage />, '/vendors/new');

      if (Object.keys(fields).length) await user.type(await screen.findByTestId('vendor-form-name'), 'Acme');
      for (const [testId, value] of Object.entries(fields)) {
        await user.click(screen.getByTestId(testId));
        await user.paste(value);
      }
      await user.click(screen.getByTestId('vendor-form-save'));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText(/form\.validation\./)).not.toBeInTheDocument();
      expect(createVendor).not.toHaveBeenCalled();
    });

    it('labels the archive toggle in edit mode in French', async () => {
      await i18n.changeLanguage('fr');
      vi.mocked(getVendor).mockResolvedValue(vendor());
      renderAt('/vendors/vendor-1/edit', <VendorFormPage />, '/vendors/:id/edit');

      await waitFor(() => expect(screen.getByTestId('vendor-form-heading')).toHaveTextContent('Modifier le fournisseur'));
      expect(screen.getByLabelText('Archiver ce fournisseur')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-form-save')).toHaveTextContent('Mettre à jour le fournisseur');
    });
  });

  describe('source', () => {
    it.each(['VendorListPage.tsx', 'VendorDetailPage.tsx', 'VendorFormPage.tsx'])(
      '%s has no English left in JSX text or labelled attributes',
      (file) => {
        expect(findHardcodedEnglish(readFileSync(`src/features/vendors/${file}`, 'utf8'))).toEqual([]);
      }
    );
  });
});
