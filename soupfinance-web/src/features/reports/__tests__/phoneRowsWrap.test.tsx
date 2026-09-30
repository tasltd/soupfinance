/**
 * SOUPFIN-94 — report rows were cut off on small phones.
 *
 * Since SOUPFIN-91, <main> is `overflow-x-hidden` and the content column may
 * shrink, so a row that does not wrap is clipped at the right edge of the page
 * with no way to scroll to it. Measured in Firefox before the fix:
 * Balance Sheet's As Of Date row (69px at 320px), Aging's As of row (40px),
 * Scheduled Reports' header and filter chips (15px, 17px), each schedule in its
 * list (254px), and Cash Flow's export buttons (1px). Balance Sheet's and P&L's
 * export buttons stopped 1px short of clipping, through the page margin.
 *
 * jsdom has no layout engine, so these tests pin the class-level guards: each
 * row wraps, and it still holds the controls it held before. The widths are
 * measured in Firefox by e2e/soupfin-94-phone-rows.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    getBalanceSheetDirect: vi.fn(),
    getIncomeStatement: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getARAgingReport: vi.fn(),
    getAPAgingReport: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

vi.mock('../../../api/endpoints/report-schedules', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/report-schedules')>(
      '../../../api/endpoints/report-schedules'
    );
  return {
    ...actual,
    getSchedules: vi.fn(),
    getScheduleHistory: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    toggleScheduleStatus: vi.fn(),
    deleteSchedule: vi.fn(),
  };
});

import {
  getBalanceSheetDirect,
  getIncomeStatement,
  getCashFlowStatement,
  getARAgingReport,
  getAPAgingReport,
} from '../../../api/endpoints/reports';
import { getSchedules, type ReportSchedule } from '../../../api/endpoints/report-schedules';
import { BalanceSheetPage } from '../BalanceSheetPage';
import { ProfitLossPage } from '../ProfitLossPage';
import { CashFlowPage } from '../CashFlowPage';
import { AgingReportsPage } from '../AgingReportsPage';
import { ScheduledReportsPage } from '../ScheduledReportsPage';

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

function schedule(overrides: Partial<ReportSchedule>): ReportSchedule {
  return {
    id: 'sched-1',
    name: 'Monthly balance sheet',
    reportType: 'BALANCE_SHEET',
    frequency: 'MONTHLY',
    recipients: 'cfo@example.com',
    dateRangeType: 'LAST_MONTH',
    exportFormat: 'PDF',
    status: 'ACTIVE',
    dateCreated: '2026-08-01T00:00:00Z',
    lastUpdated: '2026-08-01T00:00:00Z',
    archived: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The rows under test render whatever the report returns; loading is enough
  // for the toolbars, and the schedule list gets real rows below.
  vi.mocked(getBalanceSheetDirect).mockReturnValue(new Promise(() => {}));
  vi.mocked(getIncomeStatement).mockReturnValue(new Promise(() => {}));
  vi.mocked(getCashFlowStatement).mockReturnValue(new Promise(() => {}));
  vi.mocked(getARAgingReport).mockReturnValue(new Promise(() => {}));
  vi.mocked(getAPAgingReport).mockReturnValue(new Promise(() => {}));
});

describe('SOUPFIN-94: report rows wrap on a phone', () => {
  it('Balance Sheet: the As Of Date row wraps and keeps its date field and Refresh', () => {
    renderPage(<BalanceSheetPage />);
    const row = screen.getByTestId('balance-sheet-date-row');
    expect(row).toHaveClass('flex', 'flex-wrap');
    expect(row).toContainElement(screen.getByTestId('balance-sheet-date-picker'));
    expect(row).toContainElement(screen.getByTestId('balance-sheet-refresh'));
    expect(within(row).getByLabelText('As Of Date:')).toBe(screen.getByTestId('balance-sheet-date-picker'));
  });

  it.each([
    ['Balance Sheet', <BalanceSheetPage />, 'balance-sheet'],
    ['Profit & Loss', <ProfitLossPage />, 'profit-loss'],
    ['Cash Flow', <CashFlowPage />, 'cash-flow'],
  ] as const)('%s: the export row wraps and keeps PDF, Excel and CSV', (_name, page, prefix) => {
    renderPage(page);
    const row = screen.getByTestId(`${prefix}-export-row`);
    expect(row).toHaveClass('flex', 'flex-wrap');
    for (const format of ['pdf', 'excel', 'csv']) {
      expect(row).toContainElement(screen.getByTestId(`${prefix}-export-${format}`));
    }
  });

  it('Aging: the As of row wraps and keeps its date field and Today', () => {
    renderPage(<AgingReportsPage />);
    const row = screen.getByTestId('aging-reports-date-row');
    expect(row).toHaveClass('flex', 'flex-wrap');
    expect(row).toContainElement(screen.getByTestId('aging-reports-date-picker'));
    expect(row).toContainElement(screen.getByTestId('aging-reports-reset-date'));
  });

  it('Scheduled Reports: the header and the four status chips wrap', async () => {
    vi.mocked(getSchedules).mockResolvedValue([]);
    renderPage(<ScheduledReportsPage />);

    const header = screen.getByTestId('scheduled-reports-header');
    expect(header).toHaveClass('flex', 'flex-wrap', 'gap-4');
    expect(header).toContainElement(screen.getByTestId('scheduled-reports-new-button'));

    const chips = screen.getByTestId('scheduled-reports-status-filter');
    expect(chips).toHaveClass('flex', 'flex-wrap');
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All',
      'ACTIVE',
      'PAUSED',
      'CANCELLED',
    ]);
    // Zero schedules: the empty state, and no rows to wrap.
    expect(await screen.findByText('No scheduled reports yet')).toBeInTheDocument();
    expect(screen.queryByTestId(/^scheduled-report-row-/)).not.toBeInTheDocument();
  });

  it('Scheduled Reports: a chip still filters the list after wrapping', async () => {
    const user = userEvent.setup();
    vi.mocked(getSchedules).mockResolvedValue([]);
    renderPage(<ScheduledReportsPage />);
    await screen.findByText('No scheduled reports yet');

    await user.click(within(screen.getByTestId('scheduled-reports-status-filter')).getByText('CANCELLED'));

    expect(getSchedules).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'CANCELLED' }));
  });

  it('Scheduled Reports: every line of a schedule wraps, and so does the row', async () => {
    const longName =
      'Quarterly consolidated income statement and cash flow pack for the board of directors and the audit committee';
    vi.mocked(getSchedules).mockResolvedValue([
      schedule({
        id: 'sched-long',
        name: longName,
        reportType: 'INCOME_STATEMENT',
        status: 'PAUSED',
        lastExecutionStatus: 'FAILED',
        nextExecutionAt: '2026-10-05T06:00:00Z',
        lastExecutedAt: '2026-09-28T06:00:00Z',
      }),
    ]);
    renderPage(<ScheduledReportsPage />);

    const row = await screen.findByTestId('scheduled-report-row-sched-long');
    expect(row).toHaveClass('flex', 'flex-wrap', 'gap-4');
    // The full name is shown, not cut short.
    expect(within(row).getByRole('heading', { name: longName })).toBeInTheDocument();

    // The details column may shrink, and each of its three lines wraps.
    const details = row.firstElementChild as HTMLElement;
    expect(details).toHaveClass('min-w-0');
    const lines = Array.from(details.children) as HTMLElement[];
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toHaveClass('flex', 'flex-wrap');
    expect(lines[1]).toHaveTextContent('Income Statement');
    expect(lines[2]).toHaveTextContent('Next run:');
    expect(lines[2]).toHaveTextContent('Last run:');

    // The actions stay together as one block that drops under the details.
    const actions = screen.getByTestId('scheduled-report-actions-sched-long');
    expect(row).toContainElement(actions);
    expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('title'))).toEqual([
      'View history',
      'Resume',
      'Edit',
      'Delete',
    ]);
  });

  it('Scheduled Reports: fifty schedules all get wrapping rows', async () => {
    vi.mocked(getSchedules).mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => schedule({ id: `s-${i}`, name: `Schedule ${i}` }))
    );
    renderPage(<ScheduledReportsPage />);

    await screen.findByTestId('scheduled-report-row-s-49');
    const rows = screen.getAllByTestId(/^scheduled-report-row-/);
    expect(rows).toHaveLength(50);
    for (const row of rows) expect(row).toHaveClass('flex-wrap');
  });
});
