/**
 * SOUPFIN-164: the Ledger and Accounting pages, and the two error components they
 * share, follow the selected language.
 *
 * Each page is rendered in German and must show at least its heading translated
 * (one key per page, as the acceptance asks), plus a string from deeper in the page
 * so a half-wired page cannot pass on its heading alone. English is checked once per
 * page as the zero case, so the existing English copy did not drift.
 *
 * The file also guards the two things that would quietly undo this work:
 *  - every key in en exists in de, fr and nl (a missing key falls back to English),
 *  - no file under features/accounting calls window.confirm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { ToastProvider, ApiErrorState, ModuleDisabledBanner } from '../../components/feedback';
import { ChartOfAccountsPage } from '../ledger/ChartOfAccountsPage';
import { LedgerTransactionsPage } from '../ledger/LedgerTransactionsPage';
import { JournalEntryPage } from '../accounting/JournalEntryPage';
import { VoucherFormPage } from '../accounting/VoucherFormPage';
import { TransactionRegisterPage } from '../accounting/TransactionRegisterPage';
import { useTransactions } from '../../hooks/useTransactions';
import { useLedgerAccounts } from '../../hooks/useLedgerAccounts';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { listAllLedgerAccounts, listLedgerAccounts, listLedgerTransactions } from '../../api/endpoints/ledger';
import { moduleDisabled403, serverError500 } from '../../test/apiErrorFixtures';

vi.mock('../../api/endpoints/ledger', () => ({
  listAllLedgerAccounts: vi.fn(),
  listLedgerAccounts: vi.fn(),
  listLedgerTransactions: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  getTransactionGroup: vi.fn(),
  createVoucher: vi.fn(),
  updateVoucher: vi.fn(),
  getVoucher: vi.fn(),
  ledgerGroupMatches: vi.fn(() => true),
  postTransactionGroup: vi.fn(),
  reverseTransactionGroup: vi.fn(),
  deleteTransactionGroup: vi.fn(),
  postVoucher: vi.fn(),
  cancelVoucher: vi.fn(),
  deleteVoucher: vi.fn(),
}));
vi.mock('../../hooks/useTransactions', () => ({ useTransactions: vi.fn() }));
vi.mock('../../hooks/useLedgerAccounts', () => ({ useLedgerAccounts: vi.fn() }));
vi.mock('../../hooks/usePaymentMethods', () => ({ usePaymentMethods: vi.fn() }));

const ACCOUNT = {
  id: 'acc-1',
  code: '1010',
  name: 'Cash',
  ledgerGroup: 'ASSET',
  currency: 'GHS',
  balance: 100,
  isActive: true,
};

function renderAt(path: string, routePath: string, element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(listAllLedgerAccounts).mockResolvedValue([ACCOUNT] as never);
  vi.mocked(listLedgerAccounts).mockResolvedValue([ACCOUNT] as never);
  vi.mocked(listLedgerTransactions).mockResolvedValue([] as never);
  vi.mocked(useLedgerAccounts).mockReturnValue({ data: [ACCOUNT], isLoading: false, error: null } as never);
  vi.mocked(usePaymentMethods).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useTransactions).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
});

// The language is reset to English before each test by src/test/setup.ts.

describe('SOUPFIN-164 — each page renders in German', () => {
  it('Chart of Accounts: heading, group name and column headers', async () => {
    await i18n.changeLanguage('de');
    renderAt('/ledger/accounts', '/ledger/accounts', <ChartOfAccountsPage />);
    expect(screen.getByTestId('coa-heading')).toHaveTextContent('Kontenplan');
    expect(await screen.findByText('Aktiva')).toBeInTheDocument();
    expect(screen.getByText('1 Konto')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Währung' })).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  it('Ledger Transactions: heading, filters and empty state', async () => {
    await i18n.changeLanguage('de');
    renderAt('/ledger/transactions', '/ledger/transactions', <LedgerTransactionsPage />);
    expect(screen.getByTestId('ledger-transactions-heading')).toHaveTextContent('Hauptbuchtransaktionen');
    expect(screen.getByLabelText('Transaktionen nach Status filtern')).toBeInTheDocument();
    expect(await screen.findByText('Noch keine Transaktionen')).toBeInTheDocument();
    expect(screen.getByTestId('new-journal-entry-button')).toHaveTextContent('Neuer Buchungssatz');
  });

  it('Journal Entry: heading, totals and buttons', async () => {
    await i18n.changeLanguage('de');
    renderAt('/accounting/journal-entry/new', '/accounting/journal-entry/new', <JournalEntryPage />);
    expect(screen.getByTestId('journal-entry-heading')).toHaveTextContent('Neuer Buchungssatz');
    expect(screen.getByText('Summe Soll')).toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-save-draft-button')).toHaveTextContent('Entwurf speichern');
    expect(screen.getByTestId('journal-entry-cancel-button')).toHaveTextContent('Abbrechen');
    expect(screen.getByTestId('journal-entry-balance-indicator')).toHaveTextContent('Ausgeglichen');
  });

  it('Voucher form: heading, type tabs and party section', async () => {
    await i18n.changeLanguage('de');
    renderAt('/accounting/voucher/payment', '/accounting/voucher/payment', <VoucherFormPage />);
    expect(screen.getByTestId('voucher-form-heading')).toHaveTextContent('Neuer Zahlungsbeleg');
    expect(screen.getByTestId('voucher-type-receipt')).toHaveTextContent('Einnahmebeleg');
    expect(screen.getByText('Angaben zum Empfänger')).toBeInTheDocument();
    expect(screen.getByTestId('voucher-form-approve-post-button')).toHaveTextContent('Genehmigen & buchen');
  });

  it('Transaction Register: heading, column headers and empty state', async () => {
    await i18n.changeLanguage('de');
    renderAt('/accounting/transactions', '/accounting/transactions', <TransactionRegisterPage />);
    expect(screen.getByTestId('transaction-register-heading')).toHaveTextContent('Transaktionsregister');
    expect(screen.getByRole('columnheader', { name: 'Kontoname' })).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-heading')).toHaveTextContent('Keine Transaktionen gefunden');
    expect(screen.getByText('Erweiterte Filter')).toBeInTheDocument();
  });

  it('the validation messages follow the language too', async () => {
    await i18n.changeLanguage('de');
    renderAt('/accounting/journal-entry/new', '/accounting/journal-entry/new', <JournalEntryPage />);
    await userEvent.setup().click(screen.getByTestId('journal-entry-save-draft-button'));
    expect(await screen.findByText('Beschreibung ist erforderlich')).toBeInTheDocument();
  });
});

describe('SOUPFIN-164 — English copy is unchanged (zero case)', () => {
  it.each([
    ['/ledger/accounts', <ChartOfAccountsPage />, 'coa-heading', 'Chart of Accounts'],
    ['/ledger/transactions', <LedgerTransactionsPage />, 'ledger-transactions-heading', 'Ledger Transactions'],
    ['/accounting/journal-entry/new', <JournalEntryPage />, 'journal-entry-heading', 'New Journal Entry'],
    ['/accounting/voucher/payment', <VoucherFormPage />, 'voucher-form-heading', 'New Payment Voucher'],
    ['/accounting/transactions', <TransactionRegisterPage />, 'transaction-register-heading', 'Transaction Register'],
  ] as const)('%s heading reads as before', (path, element, testId, heading) => {
    renderAt(path, path, element);
    expect(screen.getByTestId(testId)).toHaveTextContent(heading);
  });
});

describe('SOUPFIN-164 — ApiErrorState and ModuleDisabledBanner', () => {
  const ledger403 = moduleDisabled403('Finance', '/rest/ledgerAccount/index.json');

  it('ApiErrorState shows the module-disabled copy in German, module name included', async () => {
    await i18n.changeLanguage('de');
    render(<ApiErrorState error={ledger403} onRetry={() => {}} testId="err" />);
    expect(screen.getByTestId('err-title')).toHaveTextContent('Das Modul Hauptbuch ist nicht verfügbar');
    expect(screen.getByTestId('err-hint')).toHaveTextContent('Bitten Sie Ihren Administrator');
  });

  it('ApiErrorState shows the Retry button in German for a server error', async () => {
    await i18n.changeLanguage('de');
    render(<ApiErrorState error={serverError500('/rest/ledgerTransaction/index.json')} onRetry={() => {}} testId="err" />);
    expect(screen.getByTestId('err-title')).toHaveTextContent('Serverfehler');
    expect(screen.getByTestId('err-retry')).toHaveTextContent('Erneut versuchen');
  });

  it('ApiErrorState keeps a message the server sent, as sent', async () => {
    await i18n.changeLanguage('de');
    const err = Object.assign(new Error('x'), {
      isAxiosError: true,
      config: { url: '/rest/voucher/show/1.json' },
      response: { status: 404, data: { error: 'Voucher 1 not found' } },
    });
    render(<ApiErrorState error={err} testId="err" />);
    expect(screen.getByTestId('err-title')).toHaveTextContent('Nicht gefunden');
    expect(screen.getByTestId('err-message')).toHaveTextContent('Voucher 1 not found');
  });

  it('ModuleDisabledBanner renders in French and switches back to English', async () => {
    await i18n.changeLanguage('fr');
    const { rerender } = render(<ModuleDisabledBanner error={ledger403} context="ctx" testId="banner" />);
    expect(screen.getByTestId('banner')).toHaveTextContent("Le module Grand livre n'est pas disponible");
    await act(() => i18n.changeLanguage('en'));
    rerender(<ModuleDisabledBanner error={ledger403} context="ctx" testId="banner" />);
    await waitFor(() => expect(screen.getByTestId('banner')).toHaveTextContent('Ledger module is not available'));
  });
});

describe('SOUPFIN-164 — guards', () => {
  // Vite inlines every locale file; compare their flattened key sets.
  const locales = import.meta.glob('../../i18n/locales/*/*.json', { eager: true, import: 'default' }) as Record<
    string,
    Record<string, unknown>
  >;
  const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
    );
  const base = (key: string) => key.replace(/_(zero|one|two|few|many|other|plural)$/, '');

  it.each(['common', 'ledger', 'accounting'])('every %s key in English exists in de, fr and nl', (ns) => {
    const english = new Set(flatten(locales[`../../i18n/locales/en/${ns}.json`]).map(base));
    for (const lang of ['de', 'fr', 'nl']) {
      const other = new Set(flatten(locales[`../../i18n/locales/${lang}/${ns}.json`]).map(base));
      const missing = [...english].filter((key) => !other.has(key));
      expect(missing, `${lang}/${ns}.json is missing keys`).toEqual([]);
    }
  });

  it('no file under features/accounting calls window.confirm', () => {
    const sources = import.meta.glob('../accounting/**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<
      string,
      string
    >;
    const files = Object.entries(sources).filter(([path]) => !path.includes('__tests__'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const offenders = files.filter(([, src]) => /window\.confirm\s*\(/.test(src)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
