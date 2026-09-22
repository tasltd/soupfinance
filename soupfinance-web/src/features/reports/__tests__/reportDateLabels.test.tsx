/**
 * SOUPFIN-72 — report date LABELS render a day early west of UTC.
 *
 * Mirror image of SOUPFIN-64, on the read side. Cash Flow, Balance Sheet and
 * P&L each formatted a YYYY-MM-DD string by handing it straight to
 * `new Date()`. The ECMAScript date-only form is parsed as UTC midnight, and
 * `toLocaleDateString()` then renders it in LOCAL time — so at any negative UTC
 * offset the label shows the previous day:
 *
 *   UTC              -> August 1, 2026   (correct)
 *   America/New_York -> July 31, 2026    (wrong)
 *
 * The numbers were right; only the header lied. Invisible from Ghana (UTC+0).
 *
 * Note the timezone list: SOUPFIN-64 needed a POSITIVE offset to fail, this
 * needs a NEGATIVE one. A UTC-only or Europe-only run cannot catch either, and
 * neither timezone alone catches both — so both sets are asserted here.
 *
 * Each test asserts the FULL round trip: mount the page, let it fetch, and read
 * the rendered header/empty-state text — not just the helper's return value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getIncomeStatement: vi.fn(),
    getBalanceSheetDirect: vi.fn(),
    getCashFlowStatement: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import {
  getIncomeStatement,
  getBalanceSheetDirect,
  getCashFlowStatement,
} from '../../../api/endpoints/reports';
import { ProfitLossPage } from '../ProfitLossPage';
import { BalanceSheetPage } from '../BalanceSheetPage';
import { CashFlowPage } from '../CashFlowPage';
import { formatDisplayDate } from '../../../utils/date';

/** Timezones WEST of UTC — the ones where the old code rendered a day early. */
const NEGATIVE_OFFSET = ['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu'];
/** UTC and an eastern zone — the old code happened to be right here. */
const NON_NEGATIVE_OFFSET = ['UTC', 'Europe/Paris'];
const ALL_ZONES = [...NON_NEGATIVE_OFFSET, ...NEGATIVE_OFFSET];

/** The reported range: 1-31 August, which read as "July 31 - August 30". */
const PERIOD_START = '2026-08-01';
const PERIOD_END = '2026-08-31';

/**
 * Frozen mid-month so the pages' own default range never coincides with the
 * period under test — the labels must come from the API response, not the
 * defaults, and a stale default would otherwise mask a regression.
 */
const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');

const ORIGINAL_TZ = process.env.TZ;

function renderPage(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);

  vi.mocked(getIncomeStatement).mockResolvedValue({
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    income: [],
    expenses: [],
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
  });
  vi.mocked(getBalanceSheetDirect).mockResolvedValue({
    asOf: PERIOD_START,
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
  });
  vi.mocked(getCashFlowStatement).mockResolvedValue({
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    operatingActivities: [],
    totalOperatingCashFlow: 0,
    investingActivities: [],
    totalInvestingCashFlow: 0,
    financingActivities: [],
    totalFinancingCashFlow: 0,
    netCashFlow: 0,
    beginningCashBalance: 0,
    endingCashBalance: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('SOUPFIN-72: report date labels use the local calendar parts', () => {
  it.each(ALL_ZONES)('Cash Flow header names the requested period in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<CashFlowPage />);
    await waitFor(() => expect(getCashFlowStatement).toHaveBeenCalled());
    // The subtitle is "<start> to <end>"; the pre-fix build rendered
    // "July 31, 2026 to August 30, 2026" in every negative-offset zone.
    const subtitle = await screen.findByText(/August 1, 2026 to August 31, 2026/);
    expect(subtitle).toBeInTheDocument();
    expect(subtitle.textContent).not.toContain('July 31, 2026');
    expect(subtitle.textContent).not.toContain('August 30, 2026');
  });

  it.each(ALL_ZONES)('Balance Sheet header names the "as of" day in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<BalanceSheetPage />);
    await waitFor(() => expect(getBalanceSheetDirect).toHaveBeenCalled());
    const subtitle = await screen.findByText(/As of August 1, 2026/);
    expect(subtitle).toBeInTheDocument();
    expect(subtitle.textContent).not.toContain('July 31');
  });

  it.each(ALL_ZONES)('Profit & Loss header names the requested range in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<ProfitLossPage />);
    await waitFor(() => expect(getIncomeStatement).toHaveBeenCalled());
    const subtitle = await screen.findByText(/August 1, 2026 - August 31, 2026/);
    expect(subtitle).toBeInTheDocument();
    expect(subtitle.textContent).not.toContain('July 31, 2026');
    expect(subtitle.textContent).not.toContain('August 30, 2026');
  });

  it.each(NEGATIVE_OFFSET)(
    'pins the underlying defect: new Date("2026-08-01") is the 31st in %s',
    (tz) => {
      process.env.TZ = tz;
      // This is the expression the three pages used to call. It really does
      // render the previous day here — which is why a UTC-only run passed.
      expect(
        new Date('2026-08-01').toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      ).toBe('July 31, 2026');
      // The replacement is immune.
      expect(formatDisplayDate('2026-08-01')).toBe('August 1, 2026');
    }
  );

  it.each(NON_NEGATIVE_OFFSET)('the old expression was already correct in %s', (tz) => {
    process.env.TZ = tz;
    // Documents why this bug was invisible from Ghana (UTC+0) and Europe: at a
    // zero or positive offset, UTC midnight is still the same calendar day.
    expect(
      new Date('2026-08-01').toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    ).toBe('August 1, 2026');
    expect(formatDisplayDate('2026-08-01')).toBe('August 1, 2026');
  });
});

describe('SOUPFIN-72: empty-state labels use the local calendar parts', () => {
  it.each(NEGATIVE_OFFSET)('Cash Flow empty state names the period in %s', async (tz) => {
    process.env.TZ = tz;
    // An all-empty statement drives the page into its empty state, which
    // formats the filter dates rather than the response dates.
    vi.mocked(getCashFlowStatement).mockResolvedValue({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      operatingActivities: [],
      totalOperatingCashFlow: 0,
      investingActivities: [],
      totalInvestingCashFlow: 0,
      financingActivities: [],
      totalFinancingCashFlow: 0,
      netCashFlow: 0,
      beginningCashBalance: 0,
      endingCashBalance: 0,
    });
    renderPage(<CashFlowPage />);
    const empty = await screen.findByTestId('cash-flow-empty');
    // The default range at FROZEN_NOW is 1..15 August in every zone listed.
    expect(empty.textContent).toContain('August 1, 2026');
    expect(empty.textContent).toContain('August 15, 2026');
    expect(empty.textContent).not.toContain('July 31, 2026');
    expect(empty.textContent).not.toContain('August 14, 2026');
  });

  it.each(NEGATIVE_OFFSET)('Balance Sheet empty state names the as-of day in %s', async (tz) => {
    process.env.TZ = tz;
    vi.mocked(getBalanceSheetDirect).mockResolvedValue({
      asOf: '2026-08-15',
      assets: [],
      liabilities: [],
      equity: [],
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
    });
    renderPage(<BalanceSheetPage />);
    const empty = await screen.findByTestId('balance-sheet-empty');
    expect(empty.textContent).toContain('August 15, 2026');
    expect(empty.textContent).not.toContain('August 14, 2026');
  });
});

describe('SOUPFIN-72: unusable dates hide the label instead of printing "Invalid Date"', () => {
  it.each(ALL_ZONES)('P&L renders no range when the period is unusable in %s', async (tz) => {
    process.env.TZ = tz;
    vi.mocked(getIncomeStatement).mockResolvedValue({
      // The MariaDB null-date sentinel, which used to render "Invalid Date".
      periodStart: '0000-00-00',
      periodEnd: '0000-00-00',
      income: [],
      expenses: [],
      totalIncome: 0,
      totalExpenses: 0,
      netProfit: 0,
    });
    renderPage(<ProfitLossPage />);
    await waitFor(() => expect(getIncomeStatement).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    });
  });
});
