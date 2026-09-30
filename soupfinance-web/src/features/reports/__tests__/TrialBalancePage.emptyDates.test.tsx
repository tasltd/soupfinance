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
import { formatDisplayDate, getCurrentMonthRange } from '../../../utils/date';

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

// Fix (SOUPFIN-64): this used to re-implement the page's range helper, faithfully
// copying its local-midnight → toISOString() conversion so the expectations matched
// whatever the (buggy) component produced. That made the test agree with the defect
// instead of catching it. It now calls the same shared helper the page calls, so the
// expected range is the real local calendar month in every timezone.
const DEFAULT_RANGE = getCurrentMonthRange(FROZEN_NOW);

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

/**
 * SOUPFIN-61: the original version of the suite above asserted a literal
 * "August 31, 2026", so it passed only during August 2026 and failed from
 * 2026-09-01 onward. SOUPFIN-56 fixed that by freezing the clock at one instant.
 *
 * Freezing at ONE instant proves the assertion no longer drifts with the wall
 * clock, but it does not prove the page's own month arithmetic holds at the
 * calendar edges — a 28-day February, a 30-day month, the December/January
 * rollover, or the first day of a month. This sweep pins that: for each frozen
 * instant the empty-state copy must name that month's own first and last day,
 * derived from the frozen clock, never a hardcoded month name.
 */
describe('TrialBalancePage empty state — calendar independence (SOUPFIN-61)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['first day of a 31-day month', '2026-01-01T12:00:00Z'],
    ['inside a 28-day February', '2026-02-14T12:00:00Z'],
    ['leap-year February', '2028-02-14T12:00:00Z'],
    ['inside a 30-day month', '2026-04-10T12:00:00Z'],
    ['last day of the year', '2026-12-31T12:00:00Z'],
    ['the month the ticket was filed', '2026-09-22T12:00:00Z'],
  ])('renders the current month range when frozen at %s', async (_label, iso) => {
    const frozen = new Date(iso);
    vi.clearAllMocks();
    vi.setSystemTime(frozen);

    const range = getCurrentMonthRange(frozen);
    vi.mocked(getTrialBalance).mockResolvedValue({
      ...EMPTY_TRIAL_BALANCE,
      asOf: range.to,
    });

    renderPage();

    const empty = await screen.findByTestId('trial-balance-empty');
    const text = empty.textContent ?? '';

    // The full sentence, both endpoints formatted, for THIS frozen month.
    expect(text).toContain(
      `between ${formatDisplayDate(range.from)} and ${formatDisplayDate(range.to)}.`
    );
    // No raw ISO leak, and no month-end from any other month.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // The page requested exactly the frozen month's range from the backend.
    expect(vi.mocked(getTrialBalance)).toHaveBeenCalledWith(
      expect.objectContaining({ from: range.from, to: range.to })
    );
  });
});
