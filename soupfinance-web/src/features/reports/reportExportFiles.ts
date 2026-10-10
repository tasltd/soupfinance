/**
 * Added (SOUPFIN-104): PDF, Excel and CSV files for registry reports, built in
 * the browser from the rows the page is showing.
 *
 * The backend exports only the handful of reports FinanceReportsController
 * serves. Every report in the pack is built from the same DisplayRow list the
 * page draws, so its three downloads always match the screen:
 *
 * - CSV: header row, then one line per row, subtotal and total. Numbers carry
 *   no currency symbol so a spreadsheet can add them up.
 * - Excel: SpreadsheetML 2003, saved as .xls like the backend's Excel export
 *   (SOUPFIN-60). Excel and LibreOffice both open it; numbers are typed cells.
 * - PDF: an HTML table rendered by html2pdf.js.
 */
import html2pdf from 'html2pdf.js';
import {
  formatReportCell,
  rawReportCell,
  type DisplayRow,
  type ReportColumn,
} from './reportTable';

export interface ReportExportContent {
  title: string;
  /** The period line, e.g. "Oct 1, 2026 - Oct 10, 2026". */
  subtitle: string;
  columns: ReportColumn[];
  displayRows: DisplayRow[];
  /** Tenant currency code, written under the title. */
  currencyCode?: string;
}

/** The cells of one display row, as raw spreadsheet values. */
function rawCells(row: DisplayRow, columns: ReportColumn[]): (string | number)[] {
  if (row.kind === 'group') {
    return columns.map((_, index) => (index === 0 ? row.label : ''));
  }
  return columns.map((column) => rawReportCell(column, row.row[column.key]));
}

// =============================================================================
// CSV
// =============================================================================

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReportCsv(content: ReportExportContent): string {
  const lines = [content.columns.map((c) => csvField(c.header)).join(',')];
  for (const row of content.displayRows) {
    lines.push(rawCells(row, content.columns).map(csvField).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function buildReportCsvBlob(content: ReportExportContent): Blob {
  // The BOM tells Excel the file is UTF-8, so GH₵ and accented names survive.
  return new Blob(['﻿', buildReportCsv(content)], { type: 'text/csv;charset=utf-8' });
}

// =============================================================================
// Excel (SpreadsheetML 2003)
// =============================================================================

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function excelCell(value: string | number, style?: string): string {
  const styleAttr = style ? ` ss:StyleID="${style}"` : '';
  if (typeof value === 'number') {
    return `<Cell${styleAttr}><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell${styleAttr}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

/** Sheet names: 31 characters, none of []:*?/\ (Excel refuses the file otherwise). */
export function excelSheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Report';
}

export function buildReportExcel(content: ReportExportContent): string {
  const header = content.columns.map((c) => excelCell(c.header, 'header')).join('');
  const body = content.displayRows
    .map((row) => {
      const style = row.kind === 'row' ? undefined : 'bold';
      return `<Row>${rawCells(row, content.columns).map((v) => excelCell(v, style)).join('')}</Row>`;
    })
    .join('');
  const meta = [content.subtitle, content.currencyCode ? `Amounts in ${content.currencyCode}` : '']
    .filter(Boolean)
    .map((line) => `<Row>${excelCell(line)}</Row>`)
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles>',
    '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>',
    '<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#F5F1F0" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="bold"><Font ss:Bold="1"/></Style>',
    '</Styles>',
    `<Worksheet ss:Name="${xmlEscape(excelSheetName(content.title))}">`,
    '<Table>',
    `<Row>${excelCell(content.title, 'title')}</Row>`,
    meta,
    '<Row></Row>',
    `<Row>${header}</Row>`,
    body,
    '</Table>',
    '</Worksheet>',
    '</Workbook>',
  ].join('');
}

export function buildReportExcelBlob(content: ReportExportContent): Blob {
  return new Blob([buildReportExcel(content)], { type: 'application/vnd.ms-excel' });
}

// =============================================================================
// PDF
// =============================================================================

function htmlEscape(text: string): string {
  return xmlEscape(text).replace(/'/g, '&#39;');
}

/** Wide reports (more than five columns) print landscape. */
export function pdfOrientation(columns: ReportColumn[]): 'portrait' | 'landscape' {
  return columns.length > 5 ? 'landscape' : 'portrait';
}

export function buildReportPdfHtml(
  content: ReportExportContent,
  formatCurrency: (amount: number) => string
): string {
  const align = (column: ReportColumn) => (column.type === 'text' || column.type === 'date' ? 'left' : 'right');
  const cell = 'padding:5px 8px;border-bottom:1px solid #e6dedb;';
  const head = content.columns
    .map(
      (c) =>
        `<th style="${cell}text-align:${align(c)};font-size:10px;text-transform:uppercase;color:#8a6b60;background:#f5f1f0;">${htmlEscape(c.header)}</th>`
    )
    .join('');

  const body = content.displayRows
    .map((row) => {
      if (row.kind === 'group') {
        return `<tr><td colspan="${content.columns.length}" style="${cell}font-weight:700;background:#faf8f7;">${htmlEscape(row.label)}</td></tr>`;
      }
      const weight = row.kind === 'row' ? 400 : 700;
      const border = row.kind === 'total' ? 'border-top:2px solid #181311;' : '';
      return `<tr>${content.columns
        .map(
          (c) =>
            `<td style="${cell}${border}font-weight:${weight};text-align:${align(c)};white-space:nowrap;">${htmlEscape(
              formatReportCell(c, row.row[c.key], formatCurrency)
            )}</td>`
        )
        .join('')}</tr>`;
    })
    .join('');

  return [
    '<div style="font-family:Manrope,Arial,sans-serif;color:#181311;font-size:11px;background:#ffffff;padding:8px 8px 24px;">',
    `<h1 style="font-size:20px;font-weight:800;margin:0 0 4px;">${htmlEscape(content.title)}</h1>`,
    `<p style="margin:0 0 2px;color:#8a6b60;">${htmlEscape(content.subtitle)}</p>`,
    content.currencyCode
      ? `<p style="margin:0 0 12px;color:#8a6b60;">Amounts in ${htmlEscape(content.currencyCode)}</p>`
      : '',
    `<table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    '</div>',
  ].join('');
}

/**
 * Render report HTML to a PDF.
 *
 * html2pdf.js captures a clone of the element it is given, inline styles
 * included, so the element itself must sit in frame: an off-screen offset on it
 * yields a blank page (SOUPFIN-89). The holder around it is what moves off-screen.
 */
export async function renderReportPdf(html: string, orientation: 'portrait' | 'landscape'): Promise<Blob> {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-12000px';
  holder.style.top = '0';
  holder.setAttribute('data-testid', 'report-pdf-render');
  const page = document.createElement('div');
  page.style.width = orientation === 'landscape' ? '1080px' : '760px';
  page.innerHTML = html;
  holder.appendChild(page);
  document.body.appendChild(holder);

  try {
    return await html2pdf()
      .from(page)
      .set({
        margin: 8,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .output('blob');
  } finally {
    document.body.removeChild(holder);
  }
}
