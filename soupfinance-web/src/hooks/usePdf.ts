/**
 * PDF Generation Hook
 *
 * Provides easy-to-use PDF generation for invoices, bills, and reports.
 * Integrates with the account store for company info and currency formatting.
 */
import { useState, useCallback } from 'react';
import { useAccountStore, useFormatCurrency } from '../stores';
import { useTaxRates } from './useTaxRates';
import type { Invoice, Bill } from '../types';
import type { TrialBalance, ProfitLoss, BalanceSheet, AgingReport } from '../types';
import {
  generateInvoicePdf,
  generateBillPdf,
  generateTrialBalancePdf,
  generateProfitLossPdf,
  generateBalanceSheetPdf,
  generateAgingReportPdf,
  type CompanyInfo,
} from '../utils/pdf';

export interface UsePdfReturn {
  /** Whether PDF is currently being generated */
  isGenerating: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Generate PDF for an invoice */
  generateInvoice: (invoice: Invoice) => Promise<void>;
  /** Generate PDF for a bill */
  generateBill: (bill: Bill) => Promise<void>;
  /** Generate PDF for trial balance report */
  generateTrialBalance: (data: TrialBalance, dateRange: { from: string; to: string }) => Promise<void>;
  /** Generate PDF for profit & loss report */
  generateProfitLoss: (data: ProfitLoss, dateRange: { from: string; to: string }) => Promise<void>;
  /** Generate PDF for balance sheet */
  generateBalanceSheet: (data: BalanceSheet, asOfDate: string) => Promise<void>;
  /** Generate PDF for aging report */
  generateAgingReport: (
    data: AgingReport,
    type: 'receivables' | 'payables',
    asOfDate: string
  ) => Promise<void>;
}

/**
 * Hook for generating PDFs from invoices, bills, and reports
 *
 * @example
 * ```tsx
 * const { generateInvoice, isGenerating } = usePdf();
 *
 * const handleDownload = () => {
 *   generateInvoice(invoice);
 * };
 * ```
 */
export function usePdf(): UsePdfReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountSettings = useAccountStore((state) => state.settings);
  const formatCurrency = useFormatCurrency();

  // Fix (SOUPFIN-47): a line item's tax rate can only be named by matching its
  // TaxEntry join rows against this catalogue. Without it every bill PDF printed
  // "0%" per line while its own total block reported the tax. If the catalogue is
  // still loading or the module gate 403s, `taxRates` is undefined and the
  // templates render an em dash — unknown, never a false 0%.
  const { data: taxRates } = useTaxRates();

  // Get company info from account settings
  const getCompanyInfo = useCallback((): CompanyInfo => {
    return {
      name: accountSettings?.name || 'Your Company',
      address: accountSettings?.address,
      website: accountSettings?.website,
    };
  }, [accountSettings]);

  // Generic wrapper for PDF generation
  const generateWithLoading = useCallback(
    async (generator: () => Promise<void>) => {
      setIsGenerating(true);
      setError(null);
      try {
        await generator();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate PDF';
        setError(message);
        console.error('[PDF] Generation failed:', err);
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  // Invoice PDF
  const generateInvoice = useCallback(
    async (invoice: Invoice) => {
      await generateWithLoading(async () => {
        await generateInvoicePdf(invoice, getCompanyInfo(), formatCurrency, taxRates);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency, taxRates]
  );

  // Bill PDF
  const generateBill = useCallback(
    async (bill: Bill) => {
      await generateWithLoading(async () => {
        await generateBillPdf(bill, getCompanyInfo(), formatCurrency, taxRates);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency, taxRates]
  );

  // Trial Balance PDF
  const generateTrialBalance = useCallback(
    async (data: TrialBalance, dateRange: { from: string; to: string }) => {
      await generateWithLoading(async () => {
        await generateTrialBalancePdf(data, getCompanyInfo(), formatCurrency, dateRange);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency]
  );

  // Profit & Loss PDF
  const generateProfitLoss = useCallback(
    async (data: ProfitLoss, dateRange: { from: string; to: string }) => {
      await generateWithLoading(async () => {
        await generateProfitLossPdf(data, getCompanyInfo(), formatCurrency, dateRange);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency]
  );

  // Balance Sheet PDF
  const generateBalanceSheet = useCallback(
    async (data: BalanceSheet, asOfDate: string) => {
      await generateWithLoading(async () => {
        await generateBalanceSheetPdf(data, getCompanyInfo(), formatCurrency, asOfDate);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency]
  );

  // Aging Report PDF
  const generateAgingReport = useCallback(
    async (data: AgingReport, type: 'receivables' | 'payables', asOfDate: string) => {
      await generateWithLoading(async () => {
        await generateAgingReportPdf(data, type, getCompanyInfo(), formatCurrency, asOfDate);
      });
    },
    [generateWithLoading, getCompanyInfo, formatCurrency]
  );

  return {
    isGenerating,
    error,
    generateInvoice,
    generateBill,
    generateTrialBalance,
    generateProfitLoss,
    generateBalanceSheet,
    generateAgingReport,
  };
}

export default usePdf;
