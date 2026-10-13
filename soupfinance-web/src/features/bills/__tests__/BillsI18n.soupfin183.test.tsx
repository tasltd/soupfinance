/**
 * SOUPFIN-183: the bill pages and the bill PDF read every user-facing string
 * from the `bills` namespace, in en, de, fr and nl.
 *
 * Covers: key and placeholder parity across the four locales, each page
 * rendered in a non-English language, the status badge translated through a
 * map (and an enum value the frontend does not know yet), a bill number that
 * looks like markup, 200 rows, the PDF template, and a scan of the source for
 * English left in JSX.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import i18n from '../../../i18n';
import enBills from '../../../i18n/locales/en/bills.json';
import deBills from '../../../i18n/locales/de/bills.json';
import frBills from '../../../i18n/locales/fr/bills.json';
import nlBills from '../../../i18n/locales/nl/bills.json';
import { BillListPage } from '../BillListPage';
import { BillDetailPage } from '../BillDetailPage';
import { BillFormPage } from '../BillFormPage';
import { BILL_STATUSES, billStatusLabel } from '../billStatus';
import { generateBillHtml } from '../../../utils/pdf/templates';
import type { Bill, BillStatus } from '../../../types';
import { flattenKeys, findHardcodedEnglish } from '../../../test/i18nAudit';

vi.mock('../../../api/endpoints/bills', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/bills')>(
    '../../../api/endpoints/bills'
  );
  return {
    listBills: vi.fn(),
    getBill: vi.fn(),
    deleteBill: vi.fn(),
    createBill: vi.fn(),
    updateBill: vi.fn(),
    listBillPayments: vi.fn(),
    resolveBillItemTaxEntryId: actual.resolveBillItemTaxEntryId,
    resolveBillItemTaxRate: actual.resolveBillItemTaxRate,
  };
});
vi.mock('../../../api/endpoints/vendors', () => ({ listVendors: vi.fn() }));
vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual('../../../api/endpoints/domainData');
  return { ...actual, listTaxRates: vi.fn(), listBillServices: vi.fn() };
});
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => `$${(amount ?? 0).toFixed(2)}`,
}));
vi.mock('../../../hooks', () => ({
  usePdf: () => ({ generateBill: vi.fn(), isGenerating: false }),
  useEmailSend: () => ({ sendBill: vi.fn(), isSending: false, error: null, success: false, reset: vi.fn() }),
}));

import { listBills, getBill, listBillPayments } from '../../../api/endpoints/bills';
import { listVendors } from '../../../api/endpoints/vendors';
import { listTaxRates, listBillServices, NO_TAX_OPTION } from '../../../api/endpoints/domainData';

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    billNumber: 'BILL-001',
    vendor: { id: 'v-1', name: 'Acme Supplies' },
    billDate: '2026-10-01',
    paymentDate: '2026-10-31',
    status: 'PARTIAL',
    subtotal: 1000,
    taxAmount: 150,
    totalAmount: 1150,
    amountPaid: 500,
    amountDue: 650,
    billItemList: [],
    archived: false,
    dateCreated: '2026-10-01T00:00:00Z',
    lastUpdated: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Bill;
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

const LOCALES = { de: deBills, fr: frBills, nl: nlBills };

describe('SOUPFIN-183: bills namespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBillPayments).mockResolvedValue([]);
    vi.mocked(listTaxRates).mockResolvedValue([]);
    vi.mocked(listBillServices).mockResolvedValue([]);
    vi.mocked(listVendors).mockResolvedValue([]);
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('locale files', () => {
    it.each(Object.entries(LOCALES))('%s has the same keys and placeholders as English', (_lang, locale) => {
      const en = flattenKeys(enBills);
      const other = flattenKeys(locale);
      expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
      for (const [key, placeholders] of en) {
        expect(other.get(key), key).toEqual(placeholders);
      }
    });

    it('has a label for every bill status in every locale', () => {
      for (const locale of [enBills, deBills, frBills, nlBills]) {
        expect(Object.keys(locale.status).sort()).toEqual([...BILL_STATUSES].sort());
        for (const status of BILL_STATUSES) expect(locale.status[status].trim()).not.toBe('');
      }
    });
  });

  describe('billStatusLabel', () => {
    it('translates a known status', async () => {
      await i18n.changeLanguage('de');
      expect(billStatusLabel(i18n.getFixedT(null, 'bills'), 'OVERDUE')).toBe('Überfällig');
    });

    it('shows a status the frontend does not know yet as sent, not as a key path', () => {
      const t = i18n.getFixedT(null, 'bills');
      expect(billStatusLabel(t, 'VOIDED')).toBe('VOIDED');
    });

    it('leaves a missing status blank (Bill.status is nullable on the backend)', () => {
      const t = i18n.getFixedT(null, 'bills');
      expect(billStatusLabel(t, undefined)).toBe('');
      expect(billStatusLabel(t, null)).toBe('');
      expect(billStatusLabel(t, '')).toBe('');
    });
  });

  describe('BillListPage', () => {
    it('renders headings, columns and the status badge in German', async () => {
      await i18n.changeLanguage('de');
      vi.mocked(listBills).mockResolvedValue([bill()]);
      renderAt('/bills', <BillListPage />, '/bills');

      expect(await screen.findByTestId('bill-status-bill-1')).toHaveTextContent('Teilweise bezahlt');
      expect(screen.getByTestId('bill-list-heading')).toHaveTextContent('Eingangsrechnungen');
      expect(screen.getByRole('columnheader', { name: 'Offener Betrag' })).toBeInTheDocument();
      expect(screen.getByTestId('bill-edit-bill-1')).toHaveTextContent('Bearbeiten');
      expect(screen.queryByText('PARTIAL')).not.toBeInTheDocument();
    });

    it('renders the empty state in French', async () => {
      await i18n.changeLanguage('fr');
      vi.mocked(listBills).mockResolvedValue([]);
      renderAt('/bills', <BillListPage />, '/bills');

      const empty = await screen.findByTestId('bill-list-empty');
      expect(empty).toHaveTextContent('Aucune facture fournisseur');
      expect(screen.getByTestId('bill-create-first-button')).toHaveTextContent('Créer une facture fournisseur');
    });

    it('translates every badge across 200 rows of mixed and unknown statuses', async () => {
      await i18n.changeLanguage('nl');
      const statuses: string[] = [...BILL_STATUSES, 'VOIDED'];
      const bills = Array.from({ length: 200 }, (_, i) =>
        bill({ id: `b-${i}`, billNumber: `BILL-${i}`, status: statuses[i % statuses.length] as BillStatus })
      );
      vi.mocked(listBills).mockResolvedValue(bills);
      renderAt('/bills', <BillListPage />, '/bills');

      await screen.findByTestId('bill-status-b-199');
      const labels = bills.map((b) => screen.getByTestId(`bill-status-${b.id}`).textContent);
      const known = labels.filter((_, i) => statuses[i % statuses.length] !== 'VOIDED');
      expect(new Set(known)).toEqual(new Set(BILL_STATUSES.map((s) => nlBills.status[s])));
      // An enum value added on the backend later still renders, as sent
      const unknownRows = bills.filter((b) => b.status === ('VOIDED' as BillStatus)).length;
      expect(unknownRows).toBeGreaterThan(0);
      expect(labels.filter((label) => label === 'VOIDED')).toHaveLength(unknownRows);
    });
  });

  describe('BillDetailPage', () => {
    it('renders the page in Dutch', async () => {
      await i18n.changeLanguage('nl');
      vi.mocked(getBill).mockResolvedValue(bill());
      renderAt('/bills/bill-1', <BillDetailPage />, '/bills/:id');

      expect(await screen.findByTestId('bill-detail-heading')).toHaveTextContent('Inkoopfactuur BILL-001');
      expect(screen.getByTestId('bill-detail-status')).toHaveTextContent('Gedeeltelijk betaald');
      expect(within(screen.getByTestId('bill-amount-card')).getByText('Openstaand saldo')).toBeInTheDocument();
      expect(screen.getByTestId('bill-items-empty')).toHaveTextContent('Geen regels');
      expect(screen.getByTestId('bill-payments-empty')).toHaveTextContent('Nog geen betalingen vastgelegd');
    });

    it('asks to confirm a delete in German', async () => {
      await i18n.changeLanguage('de');
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      vi.mocked(getBill).mockResolvedValue(bill());
      renderAt('/bills/bill-1', <BillDetailPage />, '/bills/:id');

      await userEvent.click(await screen.findByTestId('bill-delete-button'));
      expect(confirm).toHaveBeenCalledWith(deBills.detail.confirmDelete);
      confirm.mockRestore();
    });

    it('shows a bill number that looks like markup as text in the send dialog', async () => {
      await i18n.changeLanguage('fr');
      const number = 'B-<b>1</b> & <1>2</1>';
      vi.mocked(getBill).mockResolvedValue(bill({ billNumber: number }));
      renderAt('/bills/bill-1', <BillDetailPage />, '/bills/:id');

      await userEvent.click(await screen.findByTestId('bill-send-button'));
      const dialog = screen.getByTestId('send-bill-dialog');
      expect(within(dialog).getByRole('heading', { name: 'Envoyer la facture fournisseur' })).toBeInTheDocument();
      expect(dialog.querySelector('strong')?.textContent).toBe(number);
      expect(dialog.querySelector('b')).toBeNull();
      expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
      expect(screen.getByTestId('send-recipient-email')).toHaveAttribute('placeholder', 'destinataire@exemple.fr');
    });
  });

  describe('BillFormPage', () => {
    it('renders the form and its validation message in French', async () => {
      await i18n.changeLanguage('fr');
      vi.mocked(listTaxRates).mockResolvedValue([
        NO_TAX_OPTION,
        { id: 'tax-vat', name: 'VAT-S 15%', rate: 15, isDefault: false },
      ]);
      renderAt('/bills/new', <BillFormPage />, '/bills/new');

      expect(await screen.findByTestId('bill-form-heading')).toHaveTextContent('Nouvelle facture fournisseur');
      expect(screen.getByRole('option', { name: 'Sélectionner un fournisseur' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Service/Produit' })).toBeInTheDocument();
      expect(screen.getByTestId('bill-item-remove-0')).toHaveAccessibleName('Supprimer la ligne');
      // The built-in no-tax entry is translated; a tenant's own tax name is shown as named
      await screen.findByRole('option', { name: 'VAT-S 15%' });
      expect([...(screen.getByTestId('bill-item-taxRate-0') as HTMLSelectElement).options].map((o) => o.text)).toEqual([
        'Aucune taxe',
        'VAT-S 15%',
      ]);

      await userEvent.click(screen.getByTestId('bill-form-save-button'));
      expect(await screen.findByTestId('bill-form-error-message')).toHaveTextContent(
        'Veuillez sélectionner un fournisseur'
      );
    });

    it('keeps English when the user has not chosen a language', async () => {
      renderAt('/bills/new', <BillFormPage />, '/bills/new');
      expect(await screen.findByTestId('bill-form-save-button')).toHaveTextContent('Save Bill');
    });
  });

  describe('bill PDF template', () => {
    const company = { name: 'Tech At Scale', phone: '+233 20 000 0000', email: 'ap@tas.example' };
    const format = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;

    it('prints its labels in German', async () => {
      await i18n.changeLanguage('de');
      const html = generateBillHtml(bill({ notes: 'Bitte zahlen' }), company, format);
      for (const text of ['EINGANGSRECHNUNG', 'Datum: 2026-10-01', 'Von Lieferant', 'Zwischensumme',
        'Offener Betrag', 'Teilweise bezahlt', 'Tel.: +233 20 000 0000', 'Erstellt mit SoupFinance']) {
        expect(html).toContain(text);
      }
      expect(html).not.toMatch(/>\s*(BILL|Subtotal|Balance Due|From Vendor|PARTIAL)\s*</);
    });

    it('still prints English by default', () => {
      const html = generateBillHtml(bill(), company, format);
      expect(html).toContain('>BILL<');
      expect(html).toContain('Partially Paid');
      expect(html).toContain('Generated by SoupFinance');
    });

    it('escapes vendor names and placeholders values', async () => {
      await i18n.changeLanguage('nl');
      const html = generateBillHtml(
        bill({ vendor: { id: 'v', name: '<script>x</script>' } }),
        { ...company, email: 'a"<b>@x' },
        format
      );
      expect(html).not.toContain('<script>x');
      expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
      expect(html).toContain('E-mail: a&quot;&lt;b&gt;@x');
    });
  });

  describe('source', () => {
    it.each(['BillListPage.tsx', 'BillDetailPage.tsx', 'BillFormPage.tsx'])(
      '%s has no English left in JSX text or labelled attributes',
      (file) => {
        const source = readFileSync(`src/features/bills/${file}`, 'utf8');
        expect(findHardcodedEnglish(source)).toEqual([]);
      }
    );

    it('the bill PDF template has no English left', () => {
      const source = readFileSync('src/utils/pdf/templates.ts', 'utf8');
      const start = source.indexOf('export function generateBillHtml(');
      const end = source.indexOf('// Trial Balance Template');
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      expect(findHardcodedEnglish(source.slice(start, end))).toEqual([]);
    });
  });
});
