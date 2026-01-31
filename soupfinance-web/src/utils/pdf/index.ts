/**
 * PDF Generation Service
 *
 * Frontend PDF creation using html2pdf.js for:
 * - Invoices
 * - Bills
 * - Financial Reports (Trial Balance, P&L, Balance Sheet, Aging)
 *
 * Uses beautiful HTML templates rendered to PDF with consistent branding.
 */
import html2pdf from 'html2pdf.js';
import type { Invoice, Bill } from '../../types';
import type { TrialBalance, ProfitLoss, BalanceSheet, AgingReport } from '../../types';

// Re-export templates
export * from './templates';

// =============================================================================
// PDF Configuration
// =============================================================================

export interface PdfOptions {
  filename?: string;
  margin?: number;
  pageSize?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
  quality?: number;
}

const DEFAULT_OPTIONS: PdfOptions = {
  margin: 10,
  pageSize: 'a4',
  orientation: 'portrait',
  quality: 0.98,
};

// =============================================================================
// Core PDF Generation
// =============================================================================

/**
 * Generate PDF from HTML string
 */
export async function generatePdfFromHtml(
  html: string,
  options: PdfOptions = {}
): Promise<Blob> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Create a temporary container
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    const blob = await html2pdf()
      .from(container)
      .set({
        margin: config.margin,
        filename: config.filename || 'document.pdf',
        image: { type: 'jpeg', quality: config.quality },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: {
          unit: 'mm',
          format: config.pageSize,
          orientation: config.orientation,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .output('blob');

    return blob;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Download PDF blob as file
 */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download PDF from HTML
 */
export async function generateAndDownloadPdf(
  html: string,
  filename: string,
  options: PdfOptions = {}
): Promise<void> {
  const blob = await generatePdfFromHtml(html, { ...options, filename });
  downloadPdf(blob, filename);
}

// =============================================================================
// Document-Specific Generators
// =============================================================================

import {
  generateInvoiceHtml,
  generateBillHtml,
  generateTrialBalanceHtml,
  generateProfitLossHtml,
  generateBalanceSheetHtml,
  generateAgingReportHtml,
} from './templates';

/**
 * Generate and download Invoice PDF
 */
export async function generateInvoicePdf(
  invoice: Invoice,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): Promise<void> {
  const html = generateInvoiceHtml(invoice, companyInfo, formatCurrency);
  const filename = `Invoice-${invoice.invoiceNumber}.pdf`;
  await generateAndDownloadPdf(html, filename);
}

/**
 * Generate and download Bill PDF
 */
export async function generateBillPdf(
  bill: Bill,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): Promise<void> {
  const html = generateBillHtml(bill, companyInfo, formatCurrency);
  const filename = `Bill-${bill.billNumber}.pdf`;
  await generateAndDownloadPdf(html, filename);
}

/**
 * Generate and download Trial Balance PDF
 */
export async function generateTrialBalancePdf(
  data: TrialBalance,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): Promise<void> {
  const html = generateTrialBalanceHtml(data, companyInfo, formatCurrency, dateRange);
  const filename = `Trial-Balance-${dateRange.from}-to-${dateRange.to}.pdf`;
  await generateAndDownloadPdf(html, filename, { orientation: 'landscape' });
}

/**
 * Generate and download Profit & Loss PDF
 */
export async function generateProfitLossPdf(
  data: ProfitLoss,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): Promise<void> {
  const html = generateProfitLossHtml(data, companyInfo, formatCurrency, dateRange);
  const filename = `Profit-Loss-${dateRange.from}-to-${dateRange.to}.pdf`;
  await generateAndDownloadPdf(html, filename);
}

/**
 * Generate and download Balance Sheet PDF
 */
export async function generateBalanceSheetPdf(
  data: BalanceSheet,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): Promise<void> {
  const html = generateBalanceSheetHtml(data, companyInfo, formatCurrency, asOfDate);
  const filename = `Balance-Sheet-${asOfDate}.pdf`;
  await generateAndDownloadPdf(html, filename);
}

/**
 * Generate and download Aging Report PDF
 */
export async function generateAgingReportPdf(
  data: AgingReport,
  reportType: 'receivables' | 'payables',
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): Promise<void> {
  const html = generateAgingReportHtml(data, reportType, companyInfo, formatCurrency, asOfDate);
  const typeLabel = reportType === 'receivables' ? 'AR' : 'AP';
  const filename = `${typeLabel}-Aging-${asOfDate}.pdf`;
  await generateAndDownloadPdf(html, filename, { orientation: 'landscape' });
}

// =============================================================================
// Blob Generators (for email attachments)
// =============================================================================

/**
 * Generate Invoice PDF as Blob (for email attachment)
 */
export async function generateInvoicePdfBlob(
  invoice: Invoice,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): Promise<Blob> {
  const html = generateInvoiceHtml(invoice, companyInfo, formatCurrency);
  return generatePdfFromHtml(html);
}

/**
 * Generate Bill PDF as Blob (for email attachment)
 */
export async function generateBillPdfBlob(
  bill: Bill,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): Promise<Blob> {
  const html = generateBillHtml(bill, companyInfo, formatCurrency);
  return generatePdfFromHtml(html);
}

/**
 * Generate Trial Balance PDF as Blob (for email attachment)
 */
export async function generateTrialBalancePdfBlob(
  data: TrialBalance,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): Promise<Blob> {
  const html = generateTrialBalanceHtml(data, companyInfo, formatCurrency, dateRange);
  return generatePdfFromHtml(html, { orientation: 'landscape' });
}

/**
 * Generate Profit & Loss PDF as Blob (for email attachment)
 */
export async function generateProfitLossPdfBlob(
  data: ProfitLoss,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): Promise<Blob> {
  const html = generateProfitLossHtml(data, companyInfo, formatCurrency, dateRange);
  return generatePdfFromHtml(html);
}

/**
 * Generate Balance Sheet PDF as Blob (for email attachment)
 */
export async function generateBalanceSheetPdfBlob(
  data: BalanceSheet,
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): Promise<Blob> {
  const html = generateBalanceSheetHtml(data, companyInfo, formatCurrency, asOfDate);
  return generatePdfFromHtml(html);
}

/**
 * Generate Aging Report PDF as Blob (for email attachment)
 */
export async function generateAgingReportPdfBlob(
  data: AgingReport,
  reportType: 'receivables' | 'payables',
  companyInfo: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): Promise<Blob> {
  const html = generateAgingReportHtml(data, reportType, companyInfo, formatCurrency, asOfDate);
  return generatePdfFromHtml(html, { orientation: 'landscape' });
}

// =============================================================================
// Types
// =============================================================================

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
  logo?: string;
}
