/**
 * Regression tests for SOUPFIN-60 — report Excel export returned HTTP 500.
 *
 * Validated against the LXC backend as a GHS tenant on 2026-09-22:
 *
 *   GET /rest/financeReports/trialBalance.json?...&f=xlsx  -> 500
 *     grails.plugins.export.exporter.ExporterNotFoundException:
 *       No exporter found for type: xlsx
 *     at soupbroker.finance.report.FinanceReportsController.doExport(...:94)
 *
 *   GET /rest/financeReports/trialBalance.json?...&f=excel -> 200, 146,944 bytes,
 *     magic bytes d0cf11e0 (OLE2 / BIFF8) — a legacy .xls, not a .xlsx ZIP.
 *
 * FinanceReportsController passes params.f straight to the Grails export plugin
 * (org.grails.plugins:export:2.0.0), which registers exactly six exporters:
 * excel, csv, xml, pdf, ods, rtf. So the UI's 'xlsx' has to be translated, and
 * the downloaded file has to be named for the bytes that actually come back.
 *
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../client';
import {
  exportFinanceReport,
  exportReport,
  getReportExtension,
  toBackendExportFormat,
  type ExportFormat,
  type ReportFilters,
} from '../reports';

vi.mock('../../client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  toQueryString: vi.fn((params: Record<string, unknown>) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return searchParams.toString();
  }),
}));

const FILTERS: ReportFilters = { from: '2026-01-01', to: '2026-12-31' };

/** Every report the two export helpers can be pointed at. */
const FINANCE_REPORTS = [
  'trialBalance',
  'balanceSheet',
  'incomeStatement',
  'agedReceivables',
  'agedPayables',
  'accountBalances',
  'accountTransactions',
] as const;

function lastCallUrl(): string {
  const calls = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('SOUPFIN-60: report export format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: new Blob(['stub'], { type: 'application/octet-stream' }),
    });
  });

  describe('toBackendExportFormat', () => {
    it("translates the UI's 'xlsx' to the backend's 'excel'", () => {
      expect(toBackendExportFormat('xlsx')).toBe('excel');
    });

    it('leaves formats the backend already understands untouched', () => {
      expect(toBackendExportFormat('pdf')).toBe('pdf');
      expect(toBackendExportFormat('csv')).toBe('csv');
    });

    it('never emits a value outside the export plugin\'s registered exporters', () => {
      // excel, csv, xml, pdf, ods, rtf — anything else throws
      // ExporterNotFoundException and the request 500s.
      const REGISTERED = ['excel', 'csv', 'xml', 'pdf', 'ods', 'rtf'];
      const formats: ExportFormat[] = ['pdf', 'xlsx', 'csv'];
      for (const format of formats) {
        expect(REGISTERED).toContain(toBackendExportFormat(format));
      }
    });
  });

  describe('getReportExtension', () => {
    it('names an Excel download .xls, matching the BIFF8 bytes the backend returns', () => {
      expect(getReportExtension('xlsx')).toBe('xls');
    });

    it('maps the remaining formats to their own extension', () => {
      expect(getReportExtension('pdf')).toBe('pdf');
      expect(getReportExtension('csv')).toBe('csv');
    });

    it('falls back to pdf rather than ".null" when no format is supplied', () => {
      // Guards the SOUPFIN-16 regression: a null/undefined format used to be
      // interpolated straight into the filename.
      expect(getReportExtension(null)).toBe('pdf');
      expect(getReportExtension(undefined)).toBe('pdf');
      expect(getReportExtension(null)).not.toContain('null');
    });
  });

  describe('exportFinanceReport', () => {
    it('sends f=excel for an Excel export and returns the blob', async () => {
      const blob = await exportFinanceReport('trialBalance', FILTERS, 'xlsx');

      const url = lastCallUrl();
      expect(url).toContain('/financeReports/trialBalance.json?');
      expect(url).toContain('f=excel');
      expect(url).not.toContain('f=xlsx');
      expect(apiClient.get).toHaveBeenCalledWith(expect.any(String), {
        responseType: 'blob',
      });
      expect(blob).toBeInstanceOf(Blob);
    });

    it('sends f=pdf and f=csv unchanged', async () => {
      await exportFinanceReport('trialBalance', FILTERS, 'pdf');
      expect(lastCallUrl()).toContain('f=pdf');

      await exportFinanceReport('trialBalance', FILTERS, 'csv');
      expect(lastCallUrl()).toContain('f=csv');
    });

    it('sends f=excel for every report type the Excel button is wired to', async () => {
      for (const reportType of FINANCE_REPORTS) {
        await exportFinanceReport(reportType, FILTERS, 'xlsx');
        const url = lastCallUrl();
        expect(url, `${reportType} must not request f=xlsx`).toContain('f=excel');
        expect(url, `${reportType} must not request f=xlsx`).not.toContain('f=xlsx');
      }
      expect((apiClient.get as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
        FINANCE_REPORTS.length
      );
    });

    it('preserves the date range alongside the translated format', async () => {
      await exportFinanceReport('agedReceivables', FILTERS, 'xlsx');
      const url = lastCallUrl();
      expect(url).toContain('from=2026-01-01');
      expect(url).toContain('to=2026-12-31');
      expect(url).toContain('f=excel');
    });

    it('propagates a backend failure instead of resolving with an error blob', async () => {
      const error = { response: { status: 500, data: { error: 'boom' } } };
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      await expect(exportFinanceReport('trialBalance', FILTERS, 'xlsx')).rejects.toEqual(
        error
      );
    });
  });

  describe('exportReport', () => {
    it('applies the same translation', async () => {
      await exportReport('accountBalances', FILTERS, 'xlsx');
      const url = lastCallUrl();
      expect(url).toContain('f=excel');
      expect(url).not.toContain('f=xlsx');
    });
  });
});
