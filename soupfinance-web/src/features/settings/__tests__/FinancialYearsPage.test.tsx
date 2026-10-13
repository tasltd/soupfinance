/**
 * Added (SOUPFIN-158): Settings > Financial Years.
 *
 * Covers the round trips the page owns: list -> close (with the pre-close
 * checklist) -> refreshed list; admin-only reopen and lock date; create with
 * client-side overlap checks; and failures that must stay visible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialYearsPage from '../FinancialYearsPage';
import { useAuthStore } from '../../../stores/authStore';
import {
  closeFinancialYear,
  createFinancialYear,
  getCloseChecklist,
  getLockDate,
  listFinancialYears,
  reopenFinancialYear,
  setLockDate,
} from '../../../api/endpoints/financialYears';
import type { FinancialYear, FinancialYearCloseChecklist } from '../../../types/financialYear';

vi.mock('../../../api/endpoints/financialYears', () => ({
  listFinancialYears: vi.fn(),
  createFinancialYear: vi.fn(),
  getCloseChecklist: vi.fn(),
  closeFinancialYear: vi.fn(),
  reopenFinancialYear: vi.fn(),
  getLockDate: vi.fn(),
  setLockDate: vi.fn(),
}));

const FY2024: FinancialYear = {
  id: 'fy24', name: 'FY 2024', fromDate: '2024-01-01', toDate: '2024-12-31',
  status: 'CLOSED', closedAt: '2025-01-15', closedBy: 'soup.support',
};
const FY2025: FinancialYear = { id: 'fy25', name: 'FY 2025', fromDate: '2025-01-01', toDate: '2025-12-31' };

const CLEAN: FinancialYearCloseChecklist = {
  pendingEntries: 0,
  trialBalance: { totalDebit: 52000, totalCredit: 52000, balanced: true },
  netIncome: 12500,
  retainedEarningsAccount: { id: 'acc-re', name: 'Retained Earnings' },
};

function axios404(url: string) {
  return Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true, config: { url }, response: { status: 404, data: {} },
  });
}

function setRoles(roles: string[]) {
  useAuthStore.setState({ user: { username: 'u', email: 'u@x.io', roles } as never });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FinancialYearsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  setRoles(['ROLE_ADMIN', 'ROLE_USER']);
  vi.mocked(listFinancialYears).mockResolvedValue([FY2025, FY2024]);
  vi.mocked(getLockDate).mockResolvedValue('2024-12-31');
});

describe('FinancialYearsPage', () => {
  it('lists years with their status, and offers Close only on an open year', async () => {
    renderPage();
    const open = await screen.findByTestId('financial-year-row-fy25');
    expect(within(open).getByTestId('financial-year-status-fy25')).toHaveTextContent('Open');
    expect(within(open).getByTestId('close-year-button-fy25')).toBeInTheDocument();

    const closed = screen.getByTestId('financial-year-row-fy24');
    expect(within(closed).getByTestId('financial-year-status-fy24')).toHaveTextContent('Closed');
    expect(closed).toHaveTextContent('by soup.support');
    expect(within(closed).queryByTestId('close-year-button-fy24')).not.toBeInTheDocument();
    expect(within(closed).getByTestId('reopen-year-button-fy24')).toBeInTheDocument();
  });

  it('shows the empty state when there are no years', async () => {
    vi.mocked(listFinancialYears).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByTestId('financial-years-empty')).toHaveTextContent('No financial years yet');
  });

  it('shows a failed list as an error, never as an empty list', async () => {
    vi.mocked(listFinancialYears).mockRejectedValue(axios404('/financialYear/index.json'));
    renderPage();
    expect(await screen.findByTestId('financial-years-error')).toBeInTheDocument();
    expect(screen.queryByTestId('financial-years-empty')).not.toBeInTheDocument();
  });

  it('closes a year once the checklist passes, then refreshes the list', async () => {
    vi.mocked(getCloseChecklist).mockResolvedValue(CLEAN);
    vi.mocked(closeFinancialYear).mockResolvedValue({ ...FY2025, status: 'CLOSED' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('close-year-button-fy25'));
    const dialog = await screen.findByTestId('close-year-dialog');
    await within(dialog).findByTestId('close-year-checklist');
    expect(within(dialog).getByTestId('check-pending-entries')).toHaveAttribute('data-ok', 'true');
    expect(within(dialog).getByTestId('check-trial-balance')).toHaveTextContent('Trial balance balances');
    expect(within(dialog).getByTestId('check-retained-earnings')).toHaveTextContent(/Profit of .*12,500\.00 goes to Retained Earnings/);
    expect(getCloseChecklist).toHaveBeenCalledWith('fy25');

    vi.mocked(listFinancialYears).mockResolvedValue([{ ...FY2025, status: 'CLOSED' }, FY2024]);
    await user.click(within(dialog).getByTestId('close-year-confirm'));

    await waitFor(() => expect(closeFinancialYear).toHaveBeenCalledWith('fy25'));
    expect(await screen.findByTestId('financial-years-notice')).toHaveTextContent('FY 2025 is closed');
    await waitFor(() => expect(screen.getByTestId('financial-year-status-fy25')).toHaveTextContent('Closed'));
    expect(screen.queryByTestId('close-year-dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['pending entries', { ...CLEAN, pendingEntries: 3 }, 'check-pending-entries', '3 pending entries'],
    ['an unbalanced trial balance', { ...CLEAN, trialBalance: { totalDebit: 100, totalCredit: 90, balanced: false } }, 'check-trial-balance', 'does not balance'],
    ['no Retained Earnings account', { ...CLEAN, retainedEarningsAccount: null }, 'check-retained-earnings', 'No Retained Earnings account'],
  ])('blocks closing on %s', async (_label, checklist, testId, text) => {
    vi.mocked(getCloseChecklist).mockResolvedValue(checklist);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('close-year-button-fy25'));
    const row = await screen.findByTestId(testId);
    expect(row).toHaveAttribute('data-ok', 'false');
    expect(row).toHaveTextContent(text);
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });

  it('calls a loss a loss', async () => {
    vi.mocked(getCloseChecklist).mockResolvedValue({ ...CLEAN, netIncome: -800 });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('close-year-button-fy25'));
    expect(await screen.findByTestId('check-retained-earnings')).toHaveTextContent(/Loss of .*800\.00/);
  });

  it('keeps the dialog open with the reason when the backend refuses to close', async () => {
    vi.mocked(getCloseChecklist).mockResolvedValue(CLEAN);
    vi.mocked(closeFinancialYear).mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true, config: { url: '/financialYear/close/fy25.json' },
        response: { status: 422, data: { code: 'PREVIOUS_YEAR_OPEN', error: 'Close FY 2024 first.' } },
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('close-year-button-fy25'));
    await screen.findByTestId('close-year-checklist');
    await user.click(screen.getByTestId('close-year-confirm'));
    expect(await screen.findByTestId('close-year-error')).toHaveTextContent('Close FY 2024 first.');
    expect(screen.getByTestId('close-year-dialog')).toBeInTheDocument();
  });

  it('shows a checklist that cannot load as an error and keeps Close disabled', async () => {
    vi.mocked(getCloseChecklist).mockRejectedValue(axios404('/financialYear/closeChecklist/fy25.json'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('close-year-button-fy25'));
    expect(await screen.findByTestId('close-year-checklist-error')).toBeInTheDocument();
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });

  it('lets an administrator reopen a closed year', async () => {
    vi.mocked(reopenFinancialYear).mockResolvedValue({ ...FY2024, status: 'OPEN' });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('reopen-year-button-fy24'));
    await user.click(within(screen.getByTestId('reopen-year-dialog')).getByTestId('reopen-year-confirm'));
    await waitFor(() => expect(reopenFinancialYear).toHaveBeenCalledWith('fy24'));
    expect(await screen.findByTestId('financial-years-notice')).toHaveTextContent('FY 2024 is open again');
  });

  it('hides Reopen and the lock-date controls from a non-administrator', async () => {
    setRoles(['ROLE_USER']);
    renderPage();
    await screen.findByTestId('financial-year-row-fy24');
    expect(screen.queryByTestId('reopen-year-button-fy24')).not.toBeInTheDocument();
    expect(await screen.findByTestId('lock-date-admin-only')).toBeInTheDocument();
    expect(screen.queryByTestId('lock-date-input')).not.toBeInTheDocument();
  });

  it('shows the lock date and saves a new one', async () => {
    vi.mocked(setLockDate).mockResolvedValue('2025-06-30');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('lock-date-current')).toHaveTextContent('December 31, 2024'));
    const input = screen.getByTestId('lock-date-input');
    await user.clear(input);
    await user.type(input, '2025-06-30');
    await user.click(screen.getByTestId('lock-date-save'));
    await waitFor(() => expect(setLockDate).toHaveBeenCalledWith('2025-06-30'));
    expect(await screen.findByTestId('lock-date-saved')).toBeInTheDocument();
    expect(screen.getByTestId('lock-date-current')).toHaveTextContent('June 30, 2025');
  });

  it('removes the lock', async () => {
    vi.mocked(setLockDate).mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('lock-date-remove'));
    await waitFor(() => expect(setLockDate).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByTestId('lock-date-current')).toHaveTextContent('No lock date is set'));
  });

  it('suggests the year after the latest one, and refuses an overlapping year', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('new-financial-year-button'));
    expect(screen.getByTestId('financial-year-name-input')).toHaveValue('FY 2026');
    expect(screen.getByTestId('financial-year-from-input')).toHaveValue('2026-01-01');
    expect(screen.getByTestId('financial-year-to-input')).toHaveValue('2026-12-31');

    const from = screen.getByTestId('financial-year-from-input');
    await user.clear(from);
    await user.type(from, '2025-12-01');
    await user.click(screen.getByTestId('financial-year-submit'));
    expect(screen.getByTestId('financial-year-form-error')).toHaveTextContent('overlap FY 2025');
    expect(createFinancialYear).not.toHaveBeenCalled();
  });

  it('creates a year and lists it', async () => {
    const FY2026 = { id: 'fy26', name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31' };
    vi.mocked(createFinancialYear).mockResolvedValue(FY2026);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('new-financial-year-button'));
    vi.mocked(listFinancialYears).mockResolvedValue([FY2026, FY2025, FY2024]);
    await user.click(screen.getByTestId('financial-year-submit'));
    await waitFor(() =>
      expect(createFinancialYear).toHaveBeenCalledWith({ name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31', notes: '' })
    );
    expect(await screen.findByTestId('financial-year-row-fy26')).toBeInTheDocument();
    expect(screen.queryByTestId('financial-year-form')).not.toBeInTheDocument();
  });
});
