/**
 * SOUPFIN-94 — the Transaction Register was cut off on every narrow screen.
 *
 * Its content column is `flex-1` beside the Advanced Filters panel. Without
 * `min-w-0` it kept the flex default `min-width: auto` and grew to its table's
 * width (858px). <main> clips sideways overflow, so in Firefox 554px was cut off
 * at 320px, 370px at 768px, and at 1280px the filters panel lost 179px. The
 * table's card was `overflow-hidden`, so once the column could shrink it would
 * have cut off the table's right-hand columns; it now scrolls instead.
 *
 * jsdom has no layout engine, so these tests pin the class-level guards. The
 * widths are measured in Firefox by e2e/soupfin-94-phone-rows.spec.ts and the
 * page sweep in e2e/soupfin-91-phone-width.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../components/feedback';
import { TransactionRegisterPage } from '../TransactionRegisterPage';
import { useTransactions, type UnifiedTransaction } from '../../../hooks/useTransactions';

vi.mock('../../../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

vi.mock('../../../api/endpoints/ledger', () => ({
  postTransactionGroup: vi.fn(),
  reverseTransactionGroup: vi.fn(),
  deleteTransactionGroup: vi.fn(),
  postVoucher: vi.fn(),
  cancelVoucher: vi.fn(),
  deleteVoucher: vi.fn(),
}));

const mockedUseTransactions = vi.mocked(useTransactions);

function tx(i: number): UnifiedTransaction {
  return {
    id: `tx-${i}`,
    date: '2026-09-17',
    transactionId: `JE-${String(i).padStart(5, '0')}`,
    description: 'Office supplies',
    accountCode: '6010',
    accountName: 'Office Expenses',
    debitAmount: 150,
    creditAmount: 0,
    status: 'POSTED',
    type: 'JOURNAL_ENTRY',
    sourceId: `src-${i}`,
  };
}

function mockTransactions(data: UnifiedTransaction[]) {
  mockedUseTransactions.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTransactions>);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/accounting/transactions']}>
          <TransactionRegisterPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('TransactionRegisterPage fits narrow screens (SOUPFIN-94)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets the content column shrink below its table (min-w-0)', () => {
    mockTransactions([]);
    renderPage();

    const column = screen.getByTestId('transaction-register-content');
    expect(column).toHaveClass('flex-1', 'min-w-0');
    // It is the column that holds the heading, the actions and the table.
    expect(column).toContainElement(screen.getByTestId('transaction-register-heading'));
    expect(column).toContainElement(screen.getByTestId('new-journal-entry-button'));
    expect(column).toContainElement(screen.getByTestId('transaction-table'));
    // And it sits beside the filters panel in the page's flex row.
    expect(column.parentElement).toBe(screen.getByTestId('transaction-register-page'));
    expect(column.parentElement).toContainElement(screen.getByTestId('advanced-filters-panel'));
  });

  it('scrolls the table inside its card instead of clipping it', () => {
    mockTransactions([tx(1)]);
    renderPage();

    const scroller = screen.getByTestId('transaction-table-scroller');
    expect(scroller).toHaveClass('overflow-x-auto');
    expect(scroller).not.toHaveClass('overflow-hidden');
    expect(scroller).toContainElement(screen.getByTestId('transaction-table'));
    // The row is still there, in full.
    expect(within(scroller).getByText('JE-00001')).toBeInTheDocument();
  });

  it('keeps the same card with no transactions', () => {
    mockTransactions([]);
    renderPage();
    expect(screen.getByTestId('transaction-table-scroller')).toHaveClass('overflow-x-auto');
  });

  it('keeps every row of a long list inside the one scrolling card', () => {
    mockTransactions(Array.from({ length: 200 }, (_, i) => tx(i)));
    renderPage();

    const scroller = screen.getByTestId('transaction-table-scroller');
    const table = screen.getByTestId('transaction-table');
    expect(scroller).toContainElement(table);
    // Whatever page size the register shows, every rendered row is in the card.
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(scroller).toContainElement(row);
  });
});
