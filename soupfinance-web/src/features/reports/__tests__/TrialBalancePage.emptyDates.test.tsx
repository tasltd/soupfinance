/**
 * Unit tests for the Trial Balance empty-state date formatting (SOUPFIN-33 #2).
 *
 * Reported symptom on app.soupfinance.com/reports/trial-balance:
 *   header      -> "…as of August 31, 2026"                (formatted, correct)
 *   empty state -> "No account balances found between 2026-08-01 and 2026-08-31 ."
 *                                                          (raw ISO, the bug)
 *
 * Root cause: the empty-state JSX interpolated `{filters.from}` / `{filters.to}`
 * directly, while the subtitle in the same component routed the same values through
 * formatDisplayDate(). These tests pin the empty-state message to the human-readable
 * format and guard against the raw YYYY-MM-DD form coming back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TrialBalance } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getTrialBalance: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getTrialBalance } from '../../../api/endpoints/reports';
import { TrialBalancePage } from '../TrialBalancePage';

// A trial balance whose every ledger group is empty — this is what drives the
// empty state. `accounts` is a Record keyed by ledger group, not an array.
const EMPTY_TRIAL_BALANCE: TrialBalance = {
  asOf: '2026-08-31',
  accounts: { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] },
  totalDebit: 0,
  totalCredit: 0,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrialBalancePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TrialBalancePage empty state — formatted dates (SOUPFIN-33 #2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTrialBalance).mockResolvedValue(EMPTY_TRIAL_BALANCE);
  });

  it('renders the default date range in human-readable form, not raw ISO', async () => {
    renderPage();

    const empty = await screen.findByTestId('trial-balance-empty');
    const text = empty.textContent ?? '';

    // The exact defect: a YYYY-MM-DD literal anywhere in the empty-state copy.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // "Month D, YYYY" — the format formatDisplayDate() produces.
    expect(text).toMatch(/between [A-Z][a-z]+ \d{1,2}, \d{4} and [A-Z][a-z]+ \d{1,2}, \d{4}\./);
  });

  it('reflects a user-selected range in the formatted message (round-trip)', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the first empty render before changing the filters.
    await screen.findByTestId('trial-balance-empty');

    const from = screen.getByTestId('trial-balance-filter-from') as HTMLInputElement;
    const to = screen.getByTestId('trial-balance-filter-to') as HTMLInputElement;

    await user.clear(from);
    await user.type(from, '2026-01-15');
    await user.clear(to);
    await user.type(to, '2026-03-04');

    // The message must track the NEW filter values, still formatted.
    const empty = await screen.findByTestId('trial-balance-empty');
    expect(empty.textContent).toContain('between January 15, 2026 and March 4, 2026.');
    expect(empty.textContent).not.toContain('2026-01-15');
    expect(empty.textContent).not.toContain('2026-03-04');
  });

  it('does not leave a stray space before the sentence-ending period', async () => {
    // The report showed "…and 2026-08-31 ." — a gap created by the interpolation.
    renderPage();

    const empty = await screen.findByTestId('trial-balance-empty');
    expect(empty.textContent).not.toMatch(/\s+\./);
  });

  it('keeps the page subtitle and the empty-state message in the same format', async () => {
    renderPage();

    const empty = await screen.findByTestId('trial-balance-empty');
    // asOf 2026-08-31 → "August 31, 2026" in the subtitle; the empty state's `to`
    // date is the same month-end, so both must read alike.
    expect(document.body.textContent).toContain('August 31, 2026');
    expect(empty.textContent).toContain('August 31, 2026');
  });
});

describe('TrialBalancePage date filters — a11y attributes (SOUPFIN-33 #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTrialBalance).mockResolvedValue(EMPTY_TRIAL_BALANCE);
  });

  it.each([
    ['trial-balance-filter-from', 'trial-balance-from', 'Trial balance from date'],
    ['trial-balance-filter-to', 'trial-balance-to', 'Trial balance to date'],
  ])('%s carries id, name and an accessible name', async (testId, expectedId, accessibleName) => {
    renderPage();

    const input = (await screen.findByTestId(testId)) as HTMLInputElement;
    expect(input.id).toBe(expectedId);
    expect(input.name).toBe(expectedId);
    expect(screen.getByLabelText(accessibleName)).toBe(input);
  });
});
