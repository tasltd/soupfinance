/**
 * SOUPFIN-64 — report pages must default to the user's own calendar month/day.
 *
 * The unit tests in `src/utils/__tests__/date.localIso.test.ts` pin the date
 * helpers themselves. These tests pin the *wiring*: that each report page
 * actually asks the API for the local range, so re-introducing
 * `toISOString().split('T')[0]` anywhere in a page is caught here too.
 *
 * Each case forces its own timezone (Node 22 re-reads `process.env.TZ` on every
 * Date operation) and freezes the clock, then asserts on the arguments the page
 * passed to the report endpoint — the round trip from mount to request, not
 * just the return value of a helper.
 *
 * Every assertion below fails against the pre-fix build under Europe/Paris,
 * Asia/Kolkata and Pacific/Kiritimati, and passes under UTC — which is exactly
 * why a UTC-only run could not catch this bug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { AgingReport } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getTrialBalance: vi.fn(),
    getIncomeStatement: vi.fn(),
    getBalanceSheetDirect: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getARAgingReport: vi.fn(),
    getAPAgingReport: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import {
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheetDirect,
  getCashFlowStatement,
  getARAgingReport,
  getAPAgingReport,
} from '../../../api/endpoints/reports';
import { TrialBalancePage } from '../TrialBalancePage';
import { ProfitLossPage } from '../ProfitLossPage';
import { BalanceSheetPage } from '../BalanceSheetPage';
import { CashFlowPage } from '../CashFlowPage';
import { AgingReportsPage } from '../AgingReportsPage';

/** Timezones east of UTC — where the old code produced the wrong range. */
const POSITIVE_OFFSET = ['Europe/Paris', 'Asia/Kolkata', 'Pacific/Kiritimati'];
const ALL_ZONES = ['UTC', 'America/New_York', ...POSITIVE_OFFSET];

/**
 * Midday UTC mid-month: every real UTC offset (-12..+14) lands on the same
 * local calendar month, so the expected month is unambiguous everywhere.
 */
const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');
const EXPECTED_MONTH = { from: '2026-08-01', to: '2026-08-31' };

/** The local calendar day at FROZEN_NOW. Kiritimati (UTC+14) is already ahead. */
function expectedToday(tz: string): string {
  return tz === 'Pacific/Kiritimati' ? '2026-08-16' : '2026-08-15';
}

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
  // Every endpoint resolves to a shape the page can render without crashing;
  // what these tests assert is the ARGUMENTS, not the response.
  vi.mocked(getTrialBalance).mockResolvedValue({
    asOf: EXPECTED_MONTH.to,
    accounts: { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] },
    totalDebit: 0,
    totalCredit: 0,
  });
  vi.mocked(getIncomeStatement).mockResolvedValue({
    periodStart: EXPECTED_MONTH.from,
    periodEnd: EXPECTED_MONTH.to,
    income: [],
    expenses: [],
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
  });
  vi.mocked(getBalanceSheetDirect).mockResolvedValue({
    asOf: EXPECTED_MONTH.to,
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
  });
  vi.mocked(getCashFlowStatement).mockResolvedValue({
    periodStart: EXPECTED_MONTH.from,
    periodEnd: EXPECTED_MONTH.to,
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
  const emptyAging: AgingReport = {
    asOf: EXPECTED_MONTH.to,
    items: [],
    totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 },
  };
  vi.mocked(getARAgingReport).mockResolvedValue(emptyAging);
  vi.mocked(getAPAgingReport).mockResolvedValue(emptyAging);
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('SOUPFIN-64: report pages default to the local date range', () => {
  it.each(ALL_ZONES)('Trial Balance requests the whole local month in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<TrialBalancePage />);
    await waitFor(() => expect(getTrialBalance).toHaveBeenCalled());
    expect(vi.mocked(getTrialBalance).mock.calls[0][0]).toMatchObject(EXPECTED_MONTH);
  });

  it.each(ALL_ZONES)('Profit & Loss starts on the first of the local month in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<ProfitLossPage />);
    await waitFor(() => expect(getIncomeStatement).toHaveBeenCalled());
    const filters = vi.mocked(getIncomeStatement).mock.calls[0][0];
    expect(filters.from).toBe(EXPECTED_MONTH.from);
    expect(filters.to).toBe(expectedToday(tz));
  });

  it.each(ALL_ZONES)('Cash Flow starts on the first of the local month in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<CashFlowPage />);
    await waitFor(() => expect(getCashFlowStatement).toHaveBeenCalled());
    const filters = vi.mocked(getCashFlowStatement).mock.calls[0][0];
    expect(filters.from).toBe(EXPECTED_MONTH.from);
    expect(filters.to).toBe(expectedToday(tz));
  });

  it.each(ALL_ZONES)('Balance Sheet is "as of" the local day in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<BalanceSheetPage />);
    await waitFor(() => expect(getBalanceSheetDirect).toHaveBeenCalled());
    expect(vi.mocked(getBalanceSheetDirect).mock.calls[0][0]).toBe(expectedToday(tz));
  });

  it.each(ALL_ZONES)('Aging reports are "as of" the local day in %s', async (tz) => {
    process.env.TZ = tz;
    renderPage(<AgingReportsPage />);
    await waitFor(() => expect(getARAgingReport).toHaveBeenCalled());
    expect(vi.mocked(getARAgingReport).mock.calls[0][0]).toBe(expectedToday(tz));
  });

  it.each(POSITIVE_OFFSET)(
    'Trial Balance never drops the last day of the month in %s',
    async (tz) => {
      process.env.TZ = tz;
      renderPage(<TrialBalancePage />);
      await waitFor(() => expect(getTrialBalance).toHaveBeenCalled());
      const { from, to } = vi.mocked(getTrialBalance).mock.calls[0][0];
      // The pre-fix build asked for 2026-07-31 .. 2026-08-30 here, silently
      // excluding month end so the figures read low.
      expect(from).not.toBe('2026-07-31');
      expect(to).not.toBe('2026-08-30');
      expect(to).toBe('2026-08-31');
    }
  );
});
