/**
 * Email Service API Endpoints
 *
 * Handles sending emails with frontend-generated PDF attachments.
 * This allows the frontend to generate PDFs and send them directly
 * to recipients via the backend email service.
 */
import apiClient from '../client';

// =============================================================================
// Types
// =============================================================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Blob | string; // Blob for binary files or base64 string
  contentType: string;
}

export interface SendEmailRequest {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  // Reference IDs for tracking
  invoiceId?: string;
  billId?: string;
  reportType?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a Blob to Base64 string for API transmission
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Prepare attachments for API transmission
 * Converts Blob attachments to base64 strings
 */
async function prepareAttachments(
  attachments?: EmailAttachment[]
): Promise<Array<{ filename: string; content: string; contentType: string }>> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return Promise.all(
    attachments.map(async (attachment) => ({
      filename: attachment.filename,
      content:
        attachment.content instanceof Blob
          ? await blobToBase64(attachment.content)
          : attachment.content,
      contentType: attachment.contentType,
    }))
  );
}

// =============================================================================
// Email Service API
// =============================================================================

export const emailApi = {
  /**
   * Send email with optional attachments
   * POST /rest/email/send.json
   *
   * This endpoint accepts emails with attachments and sends them
   * via the backend email service (e.g., SMTP, SendGrid, etc.)
   */
  send: async (request: SendEmailRequest): Promise<SendEmailResponse> => {
    const preparedAttachments = await prepareAttachments(request.attachments);

    const payload = {
      to: request.to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
      cc: request.cc?.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
      bcc: request.bcc?.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
      subject: request.subject,
      body: request.body,
      bodyHtml: request.bodyHtml,
      attachments: preparedAttachments,
      replyTo: request.replyTo,
      invoiceId: request.invoiceId,
      billId: request.billId,
      reportType: request.reportType,
    };

    const response = await apiClient.post<SendEmailResponse>('/email/send.json', payload);
    return response.data;
  },

  /**
   * Send invoice email with frontend-generated PDF
   * Specialized endpoint for invoices
   */
  sendInvoice: async (
    invoiceId: string,
    pdfBlob: Blob,
    invoiceNumber: string,
    recipient: EmailRecipient,
    options?: {
      subject?: string;
      message?: string;
      cc?: EmailRecipient[];
    }
  ): Promise<SendEmailResponse> => {
    const subject =
      options?.subject || `Invoice ${invoiceNumber}`;
    const body =
      options?.message ||
      `Please find attached your invoice ${invoiceNumber}.\n\nThank you for your business.`;
    const bodyHtml = `
      <p>Please find attached your invoice <strong>${invoiceNumber}</strong>.</p>
      <p>Thank you for your business.</p>
    `;

    return emailApi.send({
      to: [recipient],
      cc: options?.cc,
      subject,
      body,
      bodyHtml,
      attachments: [
        {
          filename: `Invoice-${invoiceNumber}.pdf`,
          content: pdfBlob,
          contentType: 'application/pdf',
        },
      ],
      invoiceId,
    });
  },

  /**
   * Send bill email with frontend-generated PDF
   * Specialized endpoint for bills (internal use)
   */
  sendBill: async (
    billId: string,
    pdfBlob: Blob,
    billNumber: string,
    recipient: EmailRecipient,
    options?: {
      subject?: string;
      message?: string;
      cc?: EmailRecipient[];
    }
  ): Promise<SendEmailResponse> => {
    const subject = options?.subject || `Bill ${billNumber}`;
    const body =
      options?.message ||
      `Please find attached bill ${billNumber} for your records.`;
    const bodyHtml = `
      <p>Please find attached bill <strong>${billNumber}</strong> for your records.</p>
    `;

    return emailApi.send({
      to: [recipient],
      cc: options?.cc,
      subject,
      body,
      bodyHtml,
      attachments: [
        {
          filename: `Bill-${billNumber}.pdf`,
          content: pdfBlob,
          contentType: 'application/pdf',
        },
      ],
      billId,
    });
  },

  /**
   * Send report email with frontend-generated PDF
   * Generic endpoint for financial reports
   */
  sendReport: async (
    pdfBlob: Blob,
    reportType: string,
    reportTitle: string,
    recipient: EmailRecipient,
    options?: {
      subject?: string;
      message?: string;
      cc?: EmailRecipient[];
      dateRange?: { from: string; to: string };
      asOfDate?: string;
    }
  ): Promise<SendEmailResponse> => {
    const dateInfo = options?.dateRange
      ? `for period ${options.dateRange.from} to ${options.dateRange.to}`
      : options?.asOfDate
        ? `as of ${options.asOfDate}`
        : '';

    const subject = options?.subject || `${reportTitle} ${dateInfo}`.trim();
    const body =
      options?.message ||
      `Please find attached the ${reportTitle} ${dateInfo}.\n\nGenerated by SoupFinance.`;
    const bodyHtml = `
      <p>Please find attached the <strong>${reportTitle}</strong> ${dateInfo}.</p>
      <p style="color: #6b7280; font-size: 12px;">Generated by SoupFinance</p>
    `;

    // Generate filename-safe report name
    const safeReportTitle = reportTitle.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = options?.dateRange
      ? `${safeReportTitle}_${options.dateRange.from}_to_${options.dateRange.to}.pdf`
      : options?.asOfDate
        ? `${safeReportTitle}_${options.asOfDate}.pdf`
        : `${safeReportTitle}.pdf`;

    return emailApi.send({
      to: [recipient],
      cc: options?.cc,
      subject,
      body,
      bodyHtml,
      attachments: [
        {
          filename,
          content: pdfBlob,
          contentType: 'application/pdf',
        },
      ],
      reportType,
    });
  },
};

export default emailApi;
