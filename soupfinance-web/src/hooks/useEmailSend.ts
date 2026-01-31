/**
 * Email Send Hook
 *
 * Provides frontend email sending capabilities with PDF attachments.
 * Generates PDFs on the frontend and sends them via the email service API.
 */
import { useState, useCallback } from 'react';
import { useAccountStore, useFormatCurrency } from '../stores';
import { emailApi, type EmailRecipient } from '../api/endpoints/email';
import type { Invoice, Bill } from '../types';
import type { TrialBalance, ProfitLoss, BalanceSheet, AgingReport } from '../types';
import {
  generateInvoicePdfBlob,
  generateBillPdfBlob,
  generateTrialBalancePdfBlob,
  generateProfitLossPdfBlob,
  generateBalanceSheetPdfBlob,
  generateAgingReportPdfBlob,
  type CompanyInfo,
} from '../utils/pdf';

// =============================================================================
// Types
// =============================================================================

export interface EmailSendOptions {
  subject?: string;
  message?: string;
  cc?: EmailRecipient[];
}

export interface ReportEmailOptions extends EmailSendOptions {
  dateRange?: { from: string; to: string };
  asOfDate?: string;
}

export interface UseEmailSendReturn {
  /** Whether email is currently being sent */
  isSending: boolean;
  /** Error message if sending failed */
  error: string | null;
  /** Success state */
  success: boolean;
  /** Reset success/error state */
  reset: () => void;
  /** Send invoice email with frontend-generated PDF */
  sendInvoice: (
    invoice: Invoice,
    recipientEmail: string,
    recipientName?: string,
    options?: EmailSendOptions
  ) => Promise<boolean>;
  /** Send bill email with frontend-generated PDF */
  sendBill: (
    bill: Bill,
    recipientEmail: string,
    recipientName?: string,
    options?: EmailSendOptions
  ) => Promise<boolean>;
  /** Send trial balance report email */
  sendTrialBalance: (
    data: TrialBalance,
    recipientEmail: string,
    recipientName?: string,
    options?: ReportEmailOptions
  ) => Promise<boolean>;
  /** Send profit & loss report email */
  sendProfitLoss: (
    data: ProfitLoss,
    recipientEmail: string,
    recipientName?: string,
    options?: ReportEmailOptions
  ) => Promise<boolean>;
  /** Send balance sheet report email */
  sendBalanceSheet: (
    data: BalanceSheet,
    recipientEmail: string,
    recipientName?: string,
    options?: ReportEmailOptions
  ) => Promise<boolean>;
  /** Send aging report email */
  sendAgingReport: (
    data: AgingReport,
    reportType: 'receivables' | 'payables',
    recipientEmail: string,
    recipientName?: string,
    options?: ReportEmailOptions
  ) => Promise<boolean>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for sending emails with frontend-generated PDF attachments
 *
 * @example
 * ```tsx
 * const { sendInvoice, isSending, error, success } = useEmailSend();
 *
 * const handleSendInvoice = async () => {
 *   const sent = await sendInvoice(invoice, 'client@example.com', 'John Doe');
 *   if (sent) {
 *     toast.success('Invoice sent successfully!');
 *   }
 * };
 * ```
 */
export function useEmailSend(): UseEmailSendReturn {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const accountSettings = useAccountStore((state) => state.settings);
  const formatCurrency = useFormatCurrency();

  // Get company info from account settings
  const getCompanyInfo = useCallback((): CompanyInfo => {
    return {
      name: accountSettings?.name || 'Your Company',
      address: accountSettings?.address,
      website: accountSettings?.website,
    };
  }, [accountSettings]);

  // Reset state
  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  // Generic send wrapper
  const sendWithLoading = useCallback(
    async <T extends boolean>(sender: () => Promise<T>): Promise<T> => {
      setIsSending(true);
      setError(null);
      setSuccess(false);

      try {
        const result = await sender();
        setSuccess(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send email';
        setError(message);
        console.error('[Email] Send failed:', err);
        return false as T;
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  // Send Invoice
  const sendInvoice = useCallback(
    async (
      invoice: Invoice,
      recipientEmail: string,
      recipientName?: string,
      options?: EmailSendOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        // Generate PDF on frontend
        const pdfBlob = await generateInvoicePdfBlob(
          invoice,
          getCompanyInfo(),
          formatCurrency
        );

        // Send via email API
        const response = await emailApi.sendInvoice(
          invoice.id,
          pdfBlob,
          invoice.invoiceNumber,
          { email: recipientEmail, name: recipientName },
          options
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  // Send Bill
  const sendBill = useCallback(
    async (
      bill: Bill,
      recipientEmail: string,
      recipientName?: string,
      options?: EmailSendOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        const pdfBlob = await generateBillPdfBlob(
          bill,
          getCompanyInfo(),
          formatCurrency
        );

        const response = await emailApi.sendBill(
          bill.id,
          pdfBlob,
          bill.billNumber,
          { email: recipientEmail, name: recipientName },
          options
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  // Send Trial Balance
  const sendTrialBalance = useCallback(
    async (
      data: TrialBalance,
      recipientEmail: string,
      recipientName?: string,
      options?: ReportEmailOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        const dateRange = options?.dateRange || {
          from: data.asOf,
          to: data.asOf,
        };

        const pdfBlob = await generateTrialBalancePdfBlob(
          data,
          getCompanyInfo(),
          formatCurrency,
          dateRange
        );

        const response = await emailApi.sendReport(
          pdfBlob,
          'trial-balance',
          'Trial Balance',
          { email: recipientEmail, name: recipientName },
          { ...options, dateRange }
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  // Send Profit & Loss
  const sendProfitLoss = useCallback(
    async (
      data: ProfitLoss,
      recipientEmail: string,
      recipientName?: string,
      options?: ReportEmailOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        const dateRange = options?.dateRange || {
          from: new Date().toISOString().split('T')[0],
          to: new Date().toISOString().split('T')[0],
        };

        const pdfBlob = await generateProfitLossPdfBlob(
          data,
          getCompanyInfo(),
          formatCurrency,
          dateRange
        );

        const response = await emailApi.sendReport(
          pdfBlob,
          'profit-loss',
          'Profit & Loss Statement',
          { email: recipientEmail, name: recipientName },
          { ...options, dateRange }
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  // Send Balance Sheet
  const sendBalanceSheet = useCallback(
    async (
      data: BalanceSheet,
      recipientEmail: string,
      recipientName?: string,
      options?: ReportEmailOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        const asOfDate =
          options?.asOfDate || new Date().toISOString().split('T')[0];

        const pdfBlob = await generateBalanceSheetPdfBlob(
          data,
          getCompanyInfo(),
          formatCurrency,
          asOfDate
        );

        const response = await emailApi.sendReport(
          pdfBlob,
          'balance-sheet',
          'Balance Sheet',
          { email: recipientEmail, name: recipientName },
          { ...options, asOfDate }
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  // Send Aging Report
  const sendAgingReport = useCallback(
    async (
      data: AgingReport,
      reportType: 'receivables' | 'payables',
      recipientEmail: string,
      recipientName?: string,
      options?: ReportEmailOptions
    ): Promise<boolean> => {
      return sendWithLoading(async () => {
        const asOfDate =
          options?.asOfDate || new Date().toISOString().split('T')[0];

        const pdfBlob = await generateAgingReportPdfBlob(
          data,
          reportType,
          getCompanyInfo(),
          formatCurrency,
          asOfDate
        );

        const title =
          reportType === 'receivables'
            ? 'Accounts Receivable Aging'
            : 'Accounts Payable Aging';

        const response = await emailApi.sendReport(
          pdfBlob,
          `aging-${reportType}`,
          title,
          { email: recipientEmail, name: recipientName },
          { ...options, asOfDate }
        );

        return response.success;
      });
    },
    [sendWithLoading, getCompanyInfo, formatCurrency]
  );

  return {
    isSending,
    error,
    success,
    reset,
    sendInvoice,
    sendBill,
    sendTrialBalance,
    sendProfitLoss,
    sendBalanceSheet,
    sendAgingReport,
  };
}

export default useEmailSend;
