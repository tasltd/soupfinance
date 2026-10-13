/**
 * Invoice pages in German (SOUPFIN-167)
 *
 * The invoice list, detail and form pages used to hard-code English, so a user
 * who picked Deutsch, Français or Nederlands still read "Invoice Date", "PAID"
 * and "Please select a client". These tests render each page in German with
 * the REAL currency store (no formatter mock) and check three things:
 *   1. the German copy is on screen, including dialogs and validation messages
 *   2. none of the old English copy leaks through
 *   3. dates and amounts are formatted for a German reader
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { Invoice, InvoicePayment } from '../../../types';

vi.mock('../../../api', () => ({ listInvoices: vi.fn() }));

vi.mock('../../../api/endpoints/invoices', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/invoices')>(
    '../../../api/endpoints/invoices'
  );
  return {
    getInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    listInvoicePayments: vi.fn(),
    cancelInvoice: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    sendInvoice: vi.fn(),
    createInvoiceItem: vi.fn(),
    resolveItemTaxEntryId: actual.resolveItemTaxEntryId,
  };
});

vi.mock('../../../api/endpoints/clients', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/clients')>(
    '../../../api/endpoints/clients'
  );
  return { ...actual, listClients: vi.fn(), getClientPortfolio: vi.fn(), createClient: vi.fn() };
});

vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual('../../../api/endpoints/domainData');
  return { ...actual, listTaxRates: vi.fn(), listInvoiceServices: vi.fn() };
});

vi.mock('../../../hooks', () => ({
  usePdf: () => ({ generateInvoice: vi.fn(), isGenerating: false }),
  useEmailSend: () => ({
    sendInvoice: vi.fn().mockResolvedValue(true),
    isSending: false,
    error: null,
    success: false,
    reset: vi.fn(),
  }),
}));

import { listInvoices } from '../../../api';
import { getInvoice, listInvoicePayments } from '../../../api/endpoints/invoices';
import { listClients } from '../../../api/endpoints/clients';
import { listTaxRates, listInvoiceServices } from '../../../api/endpoints/domainData';
import i18n from '../../../i18n';
import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import { InvoiceListPage } from '../InvoiceListPage';
import { InvoiceDetailPage } from '../InvoiceDetailPage';
import { InvoiceFormPage } from '../InvoiceFormPage';

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    number: 42,
    accountServices: { id: 'as-1', serialised: 'Acme GmbH' },
    invoiceDate: '2024-03-01',
    paymentDate: '2024-03-31',
    status: 'PAID',
    subtotal: 1234567.89,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 1234567.89,
    amountPaid: 1000,
    amountDue: 1233567.89,
    invoiceItemList: [{ id: 'it-1', description: 'Beratung', quantity: 2, unitPrice: 617283.945 }],
    dateCreated: '2024-03-01T10:00:00Z',
    lastUpdated: '2024-03-01T10:00:00Z',
    ...overrides,
  } as Invoice;
}

function renderAt(element: ReactElement, path: string, route = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Every visible text node, trimmed, so a leaked English label is caught exactly. */
function textNodes(root: HTMLElement): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text) out.push(text);
  }
  return out;
}

function expectNoEnglish(root: HTMLElement, english: string[]) {
  const texts = textNodes(root);
  for (const phrase of english) {
    expect(texts, `English "${phrase}" leaked`).not.toContain(phrase);
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  useAccountStore.setState({ currencyConfig: CURRENCIES.USD });
  await i18n.changeLanguage('de');
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('InvoiceListPage in German', () => {
  it('translates headings, columns, actions and status badges, and formats for a German reader', async () => {
    vi.mocked(listInvoices).mockResolvedValue([
      invoice(),
      invoice({ id: 'inv-2', number: 43, status: 'OVERDUE', accountServices: undefined, paymentDate: '0000-00-00' }),
    ]);
    const { container } = renderAt(<InvoiceListPage />, '/invoices');

    const row = await screen.findByTestId('invoice-row-inv-1');
    expect(screen.getByTestId('invoice-list-heading')).toHaveTextContent('Rechnungen');
    expect(screen.getByTestId('invoice-new-button')).toHaveTextContent('Neue Rechnung');
    const headers = within(screen.getByTestId('invoice-list-table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Rechnung Nr.', 'Kunde', 'Rechnungsdatum', 'Fälligkeitsdatum', 'Betrag', 'Status', 'Aktionen']);

    expect(within(row).getByTestId('invoice-status-inv-1')).toHaveTextContent('Bezahlt');
    expect(within(row).getByText('1. März 2024')).toBeInTheDocument();
    expect(within(row).getByText('31. März 2024')).toBeInTheDocument();
    expect(within(row).getByText('$1.234.567,89')).toBeInTheDocument();
    expect(within(row).getByTestId('invoice-edit-inv-1')).toHaveTextContent('Bearbeiten');

    const row2 = screen.getByTestId('invoice-row-inv-2');
    expect(within(row2).getByTestId('invoice-status-inv-2')).toHaveTextContent('Überfällig');
    expect(within(row2).getByText('k. A.')).toBeInTheDocument();
    // The MariaDB null date shows a dash, never "0000-00-00" or "Invalid Date"
    expect(within(row2).getByText('-')).toBeInTheDocument();

    expectNoEnglish(container, ['Invoices', 'New Invoice', 'Invoice Date', 'Due Date', 'Amount', 'Actions', 'Edit', 'Paid', 'PAID', 'OVERDUE', 'N/A', '2024-03-01']);
  });

  it('shows a status the backend adds later as sent, rather than a blank badge', async () => {
    vi.mocked(listInvoices).mockResolvedValue([invoice({ status: 'DISPUTED' as Invoice['status'] })]);
    renderAt(<InvoiceListPage />, '/invoices');
    expect(await screen.findByTestId('invoice-status-inv-1')).toHaveTextContent('DISPUTED');
  });

  it('translates the empty state', async () => {
    vi.mocked(listInvoices).mockResolvedValue([]);
    const { container } = renderAt(<InvoiceListPage />, '/invoices');
    expect(await screen.findByTestId('invoice-list-empty')).toHaveTextContent('Noch keine Rechnungen');
    expect(screen.getByTestId('invoice-create-first-button')).toHaveTextContent('Rechnung erstellen');
    expectNoEnglish(container, ['No invoices yet', 'Create Invoice']);
  });

  it('translates the load error', async () => {
    vi.mocked(listInvoices).mockRejectedValue(new Error('boom'));
    renderAt(<InvoiceListPage />, '/invoices');
    const error = await screen.findByTestId('invoice-list-error');
    expect(error).toHaveTextContent('Rechnungen konnten nicht geladen werden');
    expect(error).toHaveTextContent('Erneut versuchen');
  });

  it('translates every badge on a 500-row page', async () => {
    const statuses = ['DRAFT', 'SENT', 'VIEWED', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
    vi.mocked(listInvoices).mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => invoice({ id: `inv-${i}`, number: i, status: statuses[i % statuses.length] }))
    );
    const { container } = renderAt(<InvoiceListPage />, '/invoices');
    await screen.findByTestId('invoice-row-inv-499', {}, { timeout: 10000 });
    const german = ['Entwurf', 'Gesendet', 'Angesehen', 'Teilweise bezahlt', 'Bezahlt', 'Überfällig', 'Storniert'];
    const badges = [...container.querySelectorAll<HTMLElement>('[data-status]')];
    expect(badges).toHaveLength(500);
    badges.forEach((badge, i) => expect(badge.textContent).toBe(german[i % german.length]));
  }, 20000);

  it('switches language live without a reload', async () => {
    vi.mocked(listInvoices).mockResolvedValue([invoice()]);
    renderAt(<InvoiceListPage />, '/invoices');
    expect(await screen.findByTestId('invoice-status-inv-1')).toHaveTextContent('Bezahlt');
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(screen.getByTestId('invoice-list-heading')).toHaveTextContent('Factures');
    expect(screen.getByTestId('invoice-status-inv-1')).toHaveTextContent('Payée');
    const row = screen.getByTestId('invoice-row-inv-1');
    expect(within(row).getByText('1 mars 2024')).toBeInTheDocument();
    // French groups with a narrow no-break space (U+202F); Testing Library's text
    // normaliser would fold it to a plain space, so compare the raw text
    expect(row.textContent).toContain('$1 234 567,89');
  });
});

describe('InvoiceDetailPage in German', () => {
  const payment: InvoicePayment = {
    id: 'pay-1',
    invoice: { id: 'inv-1' },
    amount: 1000,
    paymentDate: '2024-03-15',
    paymentMethod: { id: 'pm-1', name: 'BANK_TRANSFER' },
    reference: 'REF-1',
  } as InvoicePayment;

  it('translates the cards, payment method and send dialog', async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice({ status: 'DRAFT' }));
    vi.mocked(listInvoicePayments).mockResolvedValue([payment]);
    const { container } = renderAt(<InvoiceDetailPage />, '/invoices/:id', '/invoices/inv-1');

    expect(await screen.findByTestId('invoice-detail-heading')).toHaveTextContent('Rechnung 42');
    expect(screen.getByTestId('invoice-detail-status')).toHaveTextContent('Entwurf');
    expect(screen.getByTestId('invoice-info-card')).toHaveTextContent('Rechnungsinformationen');
    expect(screen.getByTestId('invoice-date')).toHaveTextContent('1. März 2024');
    expect(screen.getByTestId('invoice-amount-card')).toHaveTextContent('Offener Saldo');
    expect(screen.getByTestId('invoice-balance-due')).toHaveTextContent('$1.233.567,89');
    const payments = await screen.findByTestId('invoice-payments-table');
    expect(payments).toHaveTextContent('Überweisung');
    expect(payments).toHaveTextContent('15. März 2024');
    expect(screen.getByTestId('invoice-download-pdf-button')).toHaveTextContent('PDF herunterladen');
    expectNoEnglish(container, ['Invoice Information', 'Amount Summary', 'Balance Due', 'Payment History', 'Bank Transfer', 'Download PDF', 'Back', 'Delete']);

    await userEvent.click(screen.getByTestId('invoice-send-button'));
    const dialog = screen.getByTestId('send-invoice-dialog');
    expect(dialog).toHaveTextContent('Rechnung senden');
    expect(dialog).toHaveTextContent('Rechnung 42 per E-Mail mit PDF-Anhang senden.');
    expect(within(dialog).getByText('42').tagName).toBe('STRONG');
    expect(screen.getByTestId('send-recipient-email')).toHaveAttribute('placeholder', 'kunde@beispiel.de');
    expect(within(dialog).getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
    expectNoEnglish(dialog, ['Send Invoice', 'Recipient Email', 'Recipient Name', 'Cancel']);
  });

  it('asks for delete and cancel confirmation in German', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(getInvoice).mockResolvedValue(invoice({ status: 'DRAFT' }));
    vi.mocked(listInvoicePayments).mockResolvedValue([]);
    renderAt(<InvoiceDetailPage />, '/invoices/:id', '/invoices/inv-1');

    await userEvent.click(await screen.findByTestId('invoice-delete-button'));
    expect(confirm).toHaveBeenLastCalledWith(
      'Möchten Sie diese Rechnung wirklich löschen? Dies kann nicht rückgängig gemacht werden.'
    );
    await userEvent.click(screen.getByTestId('invoice-cancel-button'));
    expect(confirm).toHaveBeenLastCalledWith('Möchten Sie diese Rechnung wirklich stornieren?');
    expect(screen.getByTestId('invoice-payments-empty')).toHaveTextContent('Noch keine Zahlungen erfasst');
  });

  it('translates the not-found state', async () => {
    vi.mocked(getInvoice).mockRejectedValue(new Error('404'));
    vi.mocked(listInvoicePayments).mockResolvedValue([]);
    renderAt(<InvoiceDetailPage />, '/invoices/:id', '/invoices/missing');
    expect(await screen.findByTestId('invoice-detail-error')).toHaveTextContent('Rechnung konnte nicht geladen werden');
  });
});

describe('InvoiceFormPage in German', () => {
  beforeEach(() => {
    vi.mocked(listClients).mockResolvedValue([]);
    vi.mocked(listTaxRates).mockResolvedValue([]);
    vi.mocked(listInvoiceServices).mockResolvedValue([]);
  });

  it('translates labels, placeholders and the totals', async () => {
    const { container } = renderAt(<InvoiceFormPage />, '/invoices/new');
    expect(await screen.findByTestId('invoice-form-heading')).toHaveTextContent('Neue Rechnung');
    expect(screen.getByTestId('invoice-form-save-draft-button')).toHaveTextContent('Als Entwurf speichern');
    expect(screen.getByTestId('invoice-form-save-send-button')).toHaveTextContent('Speichern und senden');
    expect(screen.getByTestId('invoice-client-select')).toHaveAccessibleName('Kunde');
    expect(screen.getByTestId('invoice-po-number-input')).toHaveAttribute('placeholder', 'Nummer der Bestellung');
    expect(screen.getByTestId('invoice-item-description-0')).toHaveAttribute('placeholder', 'Beschreibung der Position');
    expect(screen.getByTestId('invoice-item-remove-0')).toHaveAccessibleName('Position entfernen');
    expect(screen.getByTestId('invoice-items-card')).toHaveTextContent('Zwischensumme');
    expectNoEnglish(container, ['New Invoice', 'Save Draft', 'Save & Send', 'Invoice Details', 'Line Items', 'Add Item', 'Subtotal', 'Total', 'Select a client']);
  });

  it('shows the validation message in German', async () => {
    renderAt(<InvoiceFormPage />, '/invoices/new');
    await userEvent.click(await screen.findByTestId('invoice-form-save-draft-button'));
    expect(screen.getByTestId('invoice-form-error-message')).toHaveTextContent('Bitte wählen Sie einen Kunden aus');
  });

  it('translates the quick-add client form and its validation', async () => {
    renderAt(<InvoiceFormPage />, '/invoices/new');
    await userEvent.click(await screen.findByTestId('invoice-new-client-button'));
    const form = screen.getByTestId('invoice-new-client-form');
    expect(form).toHaveTextContent('Kunden schnell anlegen');
    expect(screen.getByTestId('new-client-first-name')).toHaveAttribute('placeholder', 'Vorname *');
    await userEvent.click(screen.getByTestId('new-client-create-button'));
    await waitFor(() => expect(form).toHaveTextContent('Vor- und Nachname sind erforderlich'));
    await userEvent.click(screen.getByTestId('new-client-type-corporate'));
    await userEvent.click(screen.getByTestId('new-client-create-button'));
    await waitFor(() => expect(form).toHaveTextContent('Firmenname ist erforderlich'));
  });
});
