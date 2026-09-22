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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TrialBalance } from '../../../types';
import { formatDisplayDate } from '../../../utils/date';

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

// Fix (SOUPFIN-56): the page derives its default filter range from the current
// date, so any expectation spelled as a literal month-end ("August 31, 2026")
// passes in the month it was written and fails after every rollover. Freeze the
// clock instead, and derive every expectation from that one frozen instant.
//
// Midday UTC mid-month, so the local calendar month is August 2026 at every real
// UTC offset (-12..+14) and the frozen range never straddles a month boundary.
const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');

// Mirrors getCurrentMonthRange() in TrialBalancePage.tsx exactly — including its
// local-midnight → toISOString() conversion — so the expected strings match what
// the component computes in whatever timezone the suite runs in.
function currentMonthRangeAt(now: Date): { from: string; to: string } {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0],
  };
}

const DEFAULT_RANGE = currentMonthRangeAt(FROZEN_NOW);

// A trial balance whose every ledger group is empty — this is what drives the
// empty state. `accounts` is a Record keyed by ledger group, not an array.
// `asOf` deliberately matches the default range's end date so the subtitle and
// the empty-state message refer to the same day and must render alike.
const EMPTY_TRIAL_BALANCE: TrialBalance = {
  asOf: DEFAULT_RANGE.to,
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
    vi.setSystemTime(FROZEN_NOW);
    vi.mocked(getTrialBalance).mockResolvedValue(EMPTY_TRIAL_BALANCE);
  });

  afterEach(() => {
    vi.useRealTimers();
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

    // Both the subtitle (from `asOf`) and the empty state (from `filters.to`)
    // point at the frozen month-end, so both must render the identical string.
    // Derived from the frozen clock, never written as a literal (SOUPFIN-56).
    const expectedMonthEnd = formatDisplayDate(DEFAULT_RANGE.to);
    expect(expectedMonthEnd).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);

    expect(document.body.textContent).toContain(`as of ${expectedMonthEnd}`);
    expect(empty.textContent).toContain(expectedMonthEnd);
    // And the raw ISO value must not leak into either surface.
    expect(document.body.textContent).not.toContain(DEFAULT_RANGE.to);
  });
});

describe('TrialBalancePage date filters — a11y attributes (SOUPFIN-33 #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(FROZEN_NOW);
    vi.mocked(getTrialBalance).mockResolvedValue(EMPTY_TRIAL_BALANCE);
  });

  afterEach(() => {
    vi.useRealTimers();
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
