/**
 * SOUPFIN-104: the table model the report pack draws, and the PDF, Excel and
 * CSV files built from it in the browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import html2pdf from 'html2pdf.js';
import {
  REPORT_ROW_LIMIT,
  buildDisplayRows,
  formatReportCell,
  percentOf,
  rawReportCell,
  totalReportColumns,
  type ReportColumn,
} from '../reportTable';
import {
  buildReportCsv,
  buildReportCsvBlob,
  buildReportExcel,
  buildReportPdfHtml,
  excelSheetName,
  pdfOrientation,
  renderReportPdf,
  type ReportExportContent,
} from '../reportExportFiles';

vi.mock('html2pdf.js', () => {
  const worker = {
    from: vi.fn(),
    set: vi.fn(),
    output: vi.fn(),
  };
  worker.from.mockReturnValue(worker);
  worker.set.mockReturnValue(worker);
  return { default: vi.fn(() => worker) };
});

const COLUMNS: ReportColumn[] = [
  { key: 'date', header: 'Date', type: 'date' },
  { key: 'description', header: 'Description', type: 'text' },
  { key: 'debit', header: 'Debit', type: 'currency' },
  { key: 'credit', header: 'Credit', type: 'currency' },
  { key: 'balance', header: 'Balance', type: 'currency', total: false },
];

const ROWS = [
  { account: 'Cash', date: '2026-08-01', description: 'Opening', debit: null, credit: null, balance: 100 },
  { account: 'Cash', date: '2026-08-02', description: 'Fees', debit: 50.1, credit: 0, balance: 150.1 },
  { account: 'Rent', date: '2026-08-03', description: 'August, "office"', debit: 0, credit: 20.2, balance: -20.2 },
];

const fmt = (n: number) => `GH₵${n.toFixed(2)}`;

describe('buildDisplayRows', () => {
  it('groups by a field, with a header and a subtotal per group, then a totals row', () => {
    const rows = buildDisplayRows({ rows: ROWS }, COLUMNS, { groupBy: 'account' });
    expect(rows.map((r) => r.kind)).toEqual(['group', 'row', 'row', 'subtotal', 'group', 'row', 'subtotal', 'total']);
    expect(rows[3]).toEqual({ kind: 'subtotal', label: 'Total Cash', row: { date: 'Total Cash', debit: 50.1, credit: 0 } });
    // A running balance is never summed.
    expect(rows[7]).toEqual({ kind: 'total', row: { date: 'Total', debit: 50.1, credit: 20.2 } });
  });

  it('uses the loader summary rows in place of the totals row', () => {
    const rows = buildDisplayRows({ rows: ROWS, summaryRows: [{ description: 'Net', debit: 1 }] }, COLUMNS);
    expect(rows.at(-1)).toEqual({ kind: 'total', row: { description: 'Net', debit: 1 } });
    expect(rows.filter((r) => r.kind === 'total')).toHaveLength(1);
  });

  it('leaves the totals row out when the report says a grand total means nothing', () => {
    const rows = buildDisplayRows({ rows: ROWS }, COLUMNS, { groupBy: 'account', showTotals: false });
    expect(rows.some((r) => r.kind === 'total')).toBe(false);
    expect(rows.filter((r) => r.kind === 'subtotal')).toHaveLength(2);
  });

  it('draws nothing at all for no rows: no header, no zero totals', () => {
    expect(buildDisplayRows({ rows: [] }, COLUMNS, { groupBy: 'account' })).toEqual([]);
  });

  it('puts rows with a blank group under "Unassigned"', () => {
    const rows = buildDisplayRows({ rows: [{ debit: 5 }] }, COLUMNS, { groupBy: 'account' });
    expect(rows[0]).toEqual({ kind: 'group', label: 'Unassigned' });
  });

  it('totals the row cap without float drift', () => {
    const many = Array.from({ length: REPORT_ROW_LIMIT }, () => ({ debit: 0.1, credit: 1_234_567.89 }));
    const totals = totalReportColumns(many, COLUMNS);
    expect(totals).toEqual({ debit: 500, credit: 6_172_839_450 });
  });
});

describe('cell formatting', () => {
  it('shows money in the tenant currency, percents to one place and dates without a time-zone shift', () => {
    expect(formatReportCell(COLUMNS[2], 1500, fmt)).toBe('GH₵1500.00');
    expect(formatReportCell({ key: 'p', header: 'P', type: 'percent' }, 12.345, fmt)).toBe('12.3%');
    expect(formatReportCell({ key: 'n', header: 'N', type: 'number' }, 12000, fmt)).toBe('12,000');
    expect(formatReportCell(COLUMNS[0], '2026-08-01T00:00:00Z', fmt)).toBe('August 1, 2026');
  });

  it('leaves blank cells blank instead of printing 0.00', () => {
    expect(formatReportCell(COLUMNS[2], null, fmt)).toBe('');
    expect(rawReportCell(COLUMNS[2], undefined)).toBe('');
  });

  it('keeps spreadsheet values as plain numbers and ISO dates', () => {
    expect(rawReportCell(COLUMNS[2], '1234.567')).toBe(1234.57);
    expect(rawReportCell(COLUMNS[0], '2026-08-01T00:00:00Z')).toBe('2026-08-01');
    // A label in a date column keeps its text ("Total" has a T in it).
    expect(rawReportCell(COLUMNS[0], 'Total')).toBe('Total');
    expect(rawReportCell(COLUMNS[0], 'Total Tema branch')).toBe('Total Tema branch');
  });

  it('percentOf returns 0 for a zero whole', () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33.33);
  });
});

function content(): ReportExportContent {
  return {
    title: 'General Ledger',
    subtitle: 'Aug 1, 2026 - Aug 31, 2026',
    columns: COLUMNS,
    displayRows: buildDisplayRows({ rows: ROWS }, COLUMNS, { groupBy: 'account' }),
    currencyCode: 'GHS',
  };
}

describe('CSV', () => {
  it('writes a header and one line per displayed row, quoting commas and quotes', () => {
    const lines = buildReportCsv(content()).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Date,Description,Debit,Credit,Balance');
    expect(lines[1]).toBe('Cash,,,,');
    expect(lines[2]).toBe('2026-08-01,Opening,,,100');
    expect(lines).toContain('2026-08-03,"August, ""office""",0,20.2,-20.2');
    expect(lines.at(-1)).toBe('Total,,50.1,20.2,');
    expect(lines).toHaveLength(9);
  });

  it('starts with a UTF-8 byte order mark so Excel reads GH₵ correctly', async () => {
    const blob = buildReportCsvBlob(content());
    // jsdom's Blob has no arrayBuffer(); FileReader reads the same bytes.
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(blob.type).toContain('text/csv');
  });
});

describe('Excel', () => {
  it('writes typed number cells and escapes text', () => {
    const xml = buildReportExcel({ ...content(), title: 'P&L <draft>' });
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('<Data ss:Type="Number">150.1</Data>');
    expect(xml).toContain('<Data ss:Type="String">P&amp;L &lt;draft&gt;</Data>');
    expect(xml).toContain('Amounts in GHS');
    // Parses as XML.
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('keeps sheet names within Excel limits', () => {
    expect(excelSheetName('Sales by Product/Service Summary [draft]')).toBe('Sales by Product Service Summar');
    expect(excelSheetName('Sales by Product/Service Summary [draft]').length).toBeLessThanOrEqual(31);
    expect(excelSheetName('///')).toBe('Report');
  });
});

describe('PDF', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints the title, period, currency and every row, escaped', () => {
    const html = buildReportPdfHtml({ ...content(), title: '<script>x</script>' }, fmt);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Aug 1, 2026 - Aug 31, 2026');
    expect(html).toContain('GH₵150.10');
    expect(html).toContain('August, &quot;office&quot;');
    expect(html).toContain('Total Cash');
  });

  it('prints wide reports landscape', () => {
    expect(pdfOrientation(COLUMNS)).toBe('portrait');
    expect(pdfOrientation([...COLUMNS, COLUMNS[0]])).toBe('landscape');
  });

  it('hands html2pdf an element that is in frame, and cleans up (SOUPFIN-89)', async () => {
    const worker = (html2pdf as unknown as () => { from: ReturnType<typeof vi.fn>; output: ReturnType<typeof vi.fn> })();
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    worker.output.mockResolvedValue(pdf);
    vi.mocked(html2pdf).mockClear();

    const result = await renderReportPdf('<p>Hello</p>', 'landscape');

    expect(result).toBe(pdf);
    const element = worker.from.mock.calls.at(-1)![0] as HTMLElement;
    expect(element.innerHTML).toBe('<p>Hello</p>');
    // The rendered element carries no off-screen offset; its holder does.
    expect(element.style.left).toBe('');
    expect(element.style.width).toBe('1080px');
    expect(document.querySelector('[data-testid="report-pdf-render"]')).toBeNull();
  });
});
