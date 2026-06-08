/**
 * Unit tests for BankAccountFormPage (SOUPFIN-14).
 *
 * Verifies:
 *  - "Bank" field has a required asterisk
 *  - Submitting without a Bank selection surfaces an inline validation error
 *    (matches the same style as the other required fields)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BankAccountFormPage from '../BankAccountFormPage';

vi.mock('../../../api/endpoints/settings', () => ({
  accountBankDetailsApi: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  banksApi: {
    list: vi.fn().mockResolvedValue([
      { id: 'bank-1', name: 'Acme Bank' },
      { id: 'bank-2', name: 'Demo Bank' },
    ]),
  },
}));

vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/domainData')>(
    '../../../api/endpoints/domainData'
  );
  return {
    ...actual,
    listCurrencies: vi.fn().mockResolvedValue(actual.DEFAULT_CURRENCIES),
  };
});

vi.mock('../../../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/bank-accounts/new']}>
        <Routes>
          <Route path="/settings/bank-accounts/new" element={<BankAccountFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BankAccountFormPage (SOUPFIN-14 fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a required asterisk on the Bank label', async () => {
    renderPage();

    // The Bank select must have a visible required marker matching the other
    // required fields (Account Holder Name, Account Number).
    const bankSelect = await screen.findByTestId('bank-account-bank');
    const bankLabel = bankSelect.closest('div')?.querySelector('label');
    expect(bankLabel?.textContent).toMatch(/Bank\s*\*/);
  });

  it('surfaces an inline error when the form is submitted without picking a bank', async () => {
    const user = userEvent.setup();
    renderPage();

    // Fill the other required fields so the only validation failure is on Bank.
    const nameInput = await screen.findByPlaceholderText(/Company name as registered/i);
    const numberInput = screen.getByPlaceholderText(/Bank account number/i);
    await user.type(nameInput, 'Demo Holdings');
    await user.type(numberInput, '1234567890');

    const submit = screen.getByRole('button', { name: /Add Account/i });
    await user.click(submit);

    await waitFor(() =>
      expect(screen.getByTestId('bank-account-bank-error')).toBeInTheDocument()
    );
    expect(screen.getByTestId('bank-account-bank-error')).toHaveTextContent(/Bank is required/i);
  });
});
