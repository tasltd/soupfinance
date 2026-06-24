/**
 * Unit tests for TransactionRegisterPage date filters (SOUPFIN-20).
 *
 * Reported symptom: the "From:" / "To:" date fields (and the Advanced Filters
 * date range) initialise showing a confusing "0/0/0" instead of a blank
 * placeholder. The four raw <input type="date"> elements now route their value
 * through the shared sanitizeDateInputValue() util (the same hardening applied
 * to the shared DatePicker in SOUPFIN-19), so a null/sentinel/malformed value
 * can never render as a zero date.
 *
 * These tests prove the rendered inputs are empty on load and accept/keep a
 * valid YYYY-MM-DD value — the full round-trip, not just a spy call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const SAMPLE_TX: UnifiedTransaction = {
  id: 'tx-1',
  date: '2024-06-17',
  transactionId: 'JE-00001',
  description: 'Office supplies',
  accountCode: '6010',
  accountName: 'Office Expenses',
  debitAmount: 150,
  creditAmount: 0,
  status: 'POSTED',
  type: 'JOURNAL_ENTRY',
  sourceId: 'src-1',
};

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

// The four date filter inputs the user reported (inline From/To + Advanced panel).
const DATE_FILTER_TEST_IDS = [
  'filter-start-date',
  'filter-end-date',
  'panel-filter-start-date',
  'panel-filter-end-date',
] as const;

describe('TransactionRegisterPage — date filters never show "0/0/0" (SOUPFIN-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseTransactions.mockReturnValue({
      data: [SAMPLE_TX],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTransactions>);
  });

  it('renders all date filter inputs empty on initial load (no zero date)', async () => {
    renderPage();

    for (const testId of DATE_FILTER_TEST_IDS) {
      const input = (await screen.findByTestId(testId)) as HTMLInputElement;
      expect(input.type).toBe('date');
      // Empty string makes the native picker show its standard locale placeholder
      // (mm/dd/yyyy) rather than the reported "0/0/0".
      expect(input.value).toBe('');
    }
  });

  it('keeps a valid date the user selects (inline From field round-trip)', async () => {
    const user = userEvent.setup();
    renderPage();

    const fromInput = (await screen.findByTestId('filter-start-date')) as HTMLInputElement;
    // Date inputs accept a YYYY-MM-DD value via fireEvent/type; use direct value set
    // through userEvent typing in ISO order.
    await user.type(fromInput, '2024-01-15');

    expect(fromInput.value).toBe('2024-01-15');
  });

  it('mirrors the inline From value into the Advanced Filters panel (shared state, still sanitized)', async () => {
    const user = userEvent.setup();
    renderPage();

    const fromInput = (await screen.findByTestId('filter-start-date')) as HTMLInputElement;
    await user.type(fromInput, '2024-03-31');

    // Both inputs are bound to the same filters.startDate state and both pass it
    // through the sanitiser; a valid date is forwarded unchanged to each.
    const panelFrom = (await screen.findByTestId('panel-filter-start-date')) as HTMLInputElement;
    expect(fromInput.value).toBe('2024-03-31');
    expect(panelFrom.value).toBe('2024-03-31');
  });
});
