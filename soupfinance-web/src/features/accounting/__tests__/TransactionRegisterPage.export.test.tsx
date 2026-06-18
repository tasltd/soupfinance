/**
 * Unit tests for TransactionRegisterPage Export feedback (SOUPFIN-19 / SOUPFIN-9).
 *
 * The "Export" button must give explicit visual feedback via a toast:
 *  - success toast when rows are exported to CSV
 *  - warning toast when the current view is empty
 *  - error toast when the underlying transactions query failed
 *
 * Tests render with the real ToastProvider so the full round-trip is exercised
 * (click → handler → toast rendered in the DOM), not just that a spy was called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../components/feedback';
import { TransactionRegisterPage } from '../TransactionRegisterPage';
import { useTransactions, type UnifiedTransaction } from '../../../hooks/useTransactions';

// Mock the data hook so we control success / empty / error states.
vi.mock('../../../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

// Ledger action endpoints are not exercised here — stub to no-ops.
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

describe('TransactionRegisterPage — Export feedback (SOUPFIN-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks URL.createObjectURL / revokeObjectURL used by the CSV download.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  function mockTransactions(state: Partial<ReturnType<typeof useTransactions>>) {
    mockedUseTransactions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      ...state,
    } as unknown as ReturnType<typeof useTransactions>);
  }

  it('shows a success toast after exporting rows to CSV', async () => {
    const user = userEvent.setup();
    mockTransactions({ data: [SAMPLE_TX] });

    renderPage();

    await user.click(await screen.findByTestId('export-button'));

    // Visible feedback: the success toast text is rendered in the DOM.
    await waitFor(() =>
      expect(screen.getByText(/Exported 1 transaction\(s\) to CSV/i)).toBeInTheDocument()
    );
    // And the download was actually triggered.
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shows a warning toast when the current view is empty', async () => {
    const user = userEvent.setup();
    mockTransactions({ data: [] });

    renderPage();

    await user.click(await screen.findByTestId('export-button'));

    await waitFor(() =>
      expect(screen.getByText(/Nothing to export/i)).toBeInTheDocument()
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows an error toast when the transactions query failed', async () => {
    const user = userEvent.setup();
    mockTransactions({
      isError: true,
      error: Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403 },
      }),
    });

    renderPage();

    await user.click(await screen.findByTestId('export-button'));

    await waitFor(() =>
      expect(screen.getByText(/Cannot export/i)).toBeInTheDocument()
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
