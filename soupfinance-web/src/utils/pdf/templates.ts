/**
 * PDF HTML Templates
 *
 * Beautiful, print-ready HTML templates for PDF generation.
 * Uses inline styles for maximum compatibility with html2pdf.js
 */
import type { Invoice, Bill } from '../../types';
import type { TrialBalance, ProfitLoss, BalanceSheet, AgingReport } from '../../types';
import type { CompanyInfo } from './index';

// =============================================================================
// Shared Styles
// =============================================================================

const baseStyles = `
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: #ffffff;
    }
    .page {
      padding: 20mm;
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #3b82f6;
    }
    .company-info {
      flex: 1;
    }
    .company-name {
      font-size: 24px;
      font-weight: 800;
      color: #3b82f6;
      margin-bottom: 8px;
    }
    .company-details {
      font-size: 11px;
      color: #6b7280;
      line-height: 1.6;
    }
    .document-info {
      text-align: right;
    }
    .document-title {
      font-size: 28px;
      font-weight: 800;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .document-number {
      font-size: 14px;
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 5px;
    }
    .document-date {
      font-size: 11px;
      color: #6b7280;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .status-paid { background: #d1fae5; color: #047857; }
    .status-sent { background: #dbeafe; color: #1d4ed8; }
    .status-pending { background: #fef3c7; color: #b45309; }
    .status-overdue { background: #fee2e2; color: #b91c1c; }
    .status-draft { background: #f3f4f6; color: #6b7280; }

    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 30px;
    }
    .party {
      flex: 1;
    }
    .party-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 4px;
    }
    .party-details {
      font-size: 11px;
      color: #6b7280;
      line-height: 1.6;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 30px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .info-item {
      text-align: center;
    }
    .info-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f3f4f6;
      padding: 12px 16px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e5e7eb;
    }
    th.text-right { text-align: right; }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
    }
    td.text-right { text-align: right; }
    td.font-medium { font-weight: 500; }

    .totals {
      margin-left: auto;
      width: 280px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 12px;
    }
    .total-row.border-top {
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      margin-top: 8px;
    }
    .total-row.grand-total {
      background: #3b82f6;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 12px;
      font-weight: 700;
      font-size: 14px;
    }
    .total-label { color: #6b7280; }
    .total-value { font-weight: 600; color: #1f2937; }
    .total-row.grand-total .total-label,
    .total-row.grand-total .total-value { color: white; }

    .notes {
      margin-top: 30px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .notes-title {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .notes-content {
      font-size: 11px;
      color: #4b5563;
      line-height: 1.6;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 10px;
      color: #9ca3af;
    }

    .report-header {
      text-align: center;
      margin-bottom: 30px;
    }
    .report-title {
      font-size: 20px;
      font-weight: 800;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .report-subtitle {
      font-size: 12px;
      color: #6b7280;
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1f2937;
      padding: 12px 0;
      border-bottom: 2px solid #3b82f6;
      margin-bottom: 12px;
      margin-top: 20px;
    }

    .summary-box {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }
    .summary-label {
      color: #6b7280;
    }
    .summary-value {
      font-weight: 600;
      color: #1f2937;
    }
    .summary-total {
      font-size: 16px;
      font-weight: 700;
      color: #3b82f6;
      border-top: 2px solid #3b82f6;
      padding-top: 12px;
      margin-top: 8px;
    }

    .page-break {
      page-break-after: always;
    }
  </style>
`;

// =============================================================================
// Invoice Template
// =============================================================================

export function generateInvoiceHtml(
  invoice: Invoice,
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): string {
  // Fix: invoice.status is optional (InvoiceStatus | undefined), default to DRAFT
  const statusClass = getStatusClass(invoice.status || 'DRAFT');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="company-info">
            <div class="company-name">${escapeHtml(company.name)}</div>
            <div class="company-details">
              ${company.address ? `${escapeHtml(company.address)}<br>` : ''}
              ${company.phone ? `Tel: ${escapeHtml(company.phone)}<br>` : ''}
              ${company.email ? `Email: ${escapeHtml(company.email)}<br>` : ''}
              ${company.taxId ? `Tax ID: ${escapeHtml(company.taxId)}` : ''}
            </div>
          </div>
          <div class="document-info">
            <div class="document-title">INVOICE</div>
            <div class="document-number">${escapeHtml(String(invoice.number))}</div>
            <div class="document-date">Date: ${escapeHtml(invoice.invoiceDate)}</div>
            <div class="status-badge ${statusClass}">${escapeHtml(invoice.status || 'DRAFT')}</div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <div class="party-label">Bill To</div>
            <div class="party-name">${escapeHtml(invoice.accountServices?.serialised || 'N/A')}</div>
          </div>
          <div class="party">
            <div class="party-label">Payment Details</div>
            <div class="party-details">
              <strong>Due Date:</strong> ${escapeHtml(invoice.paymentDate)}<br>
              ${invoice.purchaseOrderNumber ? `<strong>PO Number:</strong> ${escapeHtml(invoice.purchaseOrderNumber)}` : ''}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(invoice.invoiceItemList || []).map(item => `
              <tr>
                <td>${escapeHtml(item.description)}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                <td class="text-right">-</td>
                <td class="text-right font-medium">${formatCurrency(item.quantity * item.unitPrice)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span class="total-label">Subtotal</span>
            <span class="total-value">${formatCurrency(invoice.subtotal)}</span>
          </div>
          ${(invoice.discountAmount || 0) > 0 ? `
            <div class="total-row">
              <span class="total-label">Discount</span>
              <span class="total-value" style="color: #dc2626;">-${formatCurrency(invoice.discountAmount)}</span>
            </div>
          ` : ''}
          <div class="total-row">
            <span class="total-label">Tax</span>
            <span class="total-value">${formatCurrency(invoice.taxAmount)}</span>
          </div>
          <div class="total-row border-top">
            <span class="total-label">Total</span>
            <span class="total-value">${formatCurrency(invoice.totalAmount)}</span>
          </div>
          ${(invoice.amountPaid || 0) > 0 ? `
            <div class="total-row">
              <span class="total-label">Amount Paid</span>
              <span class="total-value" style="color: #16a34a;">${formatCurrency(invoice.amountPaid)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total">
            <span class="total-label">Balance Due</span>
            <span class="total-value">${formatCurrency(invoice.amountDue)}</span>
          </div>
        </div>

        ${invoice.notes ? `
          <div class="notes">
            <div class="notes-title">Notes</div>
            <div class="notes-content">${escapeHtml(invoice.notes)}</div>
          </div>
        ` : ''}

        <div class="footer">
          Thank you for your business!<br>
          Generated by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Bill Template
// =============================================================================

export function generateBillHtml(
  bill: Bill,
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string
): string {
  const statusClass = getStatusClass(bill.status);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="company-info">
            <div class="company-name">${escapeHtml(company.name)}</div>
            <div class="company-details">
              ${company.address ? `${escapeHtml(company.address)}<br>` : ''}
              ${company.phone ? `Tel: ${escapeHtml(company.phone)}<br>` : ''}
              ${company.email ? `Email: ${escapeHtml(company.email)}` : ''}
            </div>
          </div>
          <div class="document-info">
            <div class="document-title">BILL</div>
            <div class="document-number">${escapeHtml(bill.billNumber)}</div>
            <div class="document-date">Date: ${escapeHtml(bill.billDate)}</div>
            <div class="status-badge ${statusClass}">${escapeHtml(bill.status)}</div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <div class="party-label">From Vendor</div>
            <div class="party-name">${escapeHtml(bill.vendor?.name || 'N/A')}</div>
          </div>
          <div class="party">
            <div class="party-label">Payment Due</div>
            <div class="party-details">
              <strong>Due Date:</strong> ${escapeHtml(bill.paymentDate)}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(bill.billItemList || []).map(item => `
              <tr>
                <td>${escapeHtml(item.description)}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                <td class="text-right">${item.taxRate}%</td>
                <td class="text-right font-medium">${formatCurrency(item.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span class="total-label">Subtotal</span>
            <span class="total-value">${formatCurrency(bill.subtotal)}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Tax</span>
            <span class="total-value">${formatCurrency(bill.taxAmount)}</span>
          </div>
          <div class="total-row border-top">
            <span class="total-label">Total</span>
            <span class="total-value">${formatCurrency(bill.totalAmount)}</span>
          </div>
          ${(bill.amountPaid || 0) > 0 ? `
            <div class="total-row">
              <span class="total-label">Amount Paid</span>
              <span class="total-value" style="color: #16a34a;">${formatCurrency(bill.amountPaid)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total">
            <span class="total-label">Balance Due</span>
            <span class="total-value">${formatCurrency(bill.amountDue)}</span>
          </div>
        </div>

        ${bill.notes ? `
          <div class="notes">
            <div class="notes-title">Notes</div>
            <div class="notes-content">${escapeHtml(bill.notes)}</div>
          </div>
        ` : ''}

        <div class="footer">
          Generated by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Trial Balance Template
// =============================================================================

export function generateTrialBalanceHtml(
  data: TrialBalance,
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): string {
  // Flatten all accounts from the grouped structure
  const ledgerGroups = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
  const groupLabels: Record<string, string> = {
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    EQUITY: 'Equity',
    REVENUE: 'Revenue',
    EXPENSE: 'Expenses',
  };

  // Generate table rows grouped by ledger type
  const generateGroupRows = () => {
    return ledgerGroups
      .filter(group => data.accounts[group]?.length > 0)
      .map(group => {
        const items = data.accounts[group] || [];
        const groupDebit = items.reduce((sum, item) => sum + (item.endingDebit || 0), 0);
        const groupCredit = items.reduce((sum, item) => sum + (item.endingCredit || 0), 0);

        return `
          <tr style="background: #f3f4f6;">
            <td colspan="2" style="font-weight: 700; color: #3b82f6;">${groupLabels[group]}</td>
            <td></td>
            <td></td>
          </tr>
          ${items.map(item => `
            <tr>
              <td style="padding-left: 24px;">${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.currency || '')}</td>
              <td class="text-right">${item.endingDebit > 0 ? formatCurrency(item.endingDebit) : ''}</td>
              <td class="text-right">${item.endingCredit > 0 ? formatCurrency(item.endingCredit) : ''}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 1px solid #e5e7eb;">
            <td style="font-weight: 600; padding-left: 24px;">Total ${groupLabels[group]}</td>
            <td></td>
            <td class="text-right font-medium">${groupDebit > 0 ? formatCurrency(groupDebit) : ''}</td>
            <td class="text-right font-medium">${groupCredit > 0 ? formatCurrency(groupCredit) : ''}</td>
          </tr>
        `;
      })
      .join('');
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          <div class="company-name">${escapeHtml(company.name)}</div>
          <div class="report-title">Trial Balance</div>
          <div class="report-subtitle">For period ${escapeHtml(dateRange.from)} to ${escapeHtml(dateRange.to)}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Account Name</th>
              <th>Currency</th>
              <th class="text-right">Debit</th>
              <th class="text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            ${generateGroupRows()}
          </tbody>
          <tfoot>
            <tr style="background: #1f2937; color: white; font-weight: 700;">
              <td colspan="2">Grand Total</td>
              <td class="text-right">${formatCurrency(data.totalDebit)}</td>
              <td class="text-right">${formatCurrency(data.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <span class="summary-label">Total Debits</span>
            <span class="summary-value">${formatCurrency(data.totalDebit)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Credits</span>
            <span class="summary-value">${formatCurrency(data.totalCredit)}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Difference</span>
            <span>${formatCurrency(data.totalDebit - data.totalCredit)}</span>
          </div>
        </div>

        <div class="footer">
          Generated on ${new Date().toLocaleDateString()} by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Profit & Loss Template
// =============================================================================

export function generateProfitLossHtml(
  data: ProfitLoss,
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  dateRange: { from: string; to: string }
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          <div class="company-name">${escapeHtml(company.name)}</div>
          <div class="report-title">Profit & Loss Statement</div>
          <div class="report-subtitle">For period ${escapeHtml(dateRange.from)} to ${escapeHtml(dateRange.to)}</div>
        </div>

        <div class="section-title">Income</div>
        <table>
          <tbody>
            ${(data.income || []).map(item => `
              <tr>
                <td>${escapeHtml(item.account)}</td>
                <td class="text-right font-medium">${formatCurrency(item.amount)}</td>
              </tr>
            `).join('')}
            <tr style="background: #d1fae5; font-weight: 700;">
              <td>Total Income</td>
              <td class="text-right">${formatCurrency(data.totalIncome)}</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">Expenses</div>
        <table>
          <tbody>
            ${(data.expenses || []).map(item => `
              <tr>
                <td>${escapeHtml(item.account)}</td>
                <td class="text-right font-medium">${formatCurrency(item.amount)}</td>
              </tr>
            `).join('')}
            <tr style="background: #fee2e2; font-weight: 700;">
              <td>Total Expenses</td>
              <td class="text-right">${formatCurrency(data.totalExpenses)}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-box" style="margin-top: 30px;">
          <div class="summary-row">
            <span class="summary-label">Total Income</span>
            <span class="summary-value" style="color: #16a34a;">${formatCurrency(data.totalIncome)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Expenses</span>
            <span class="summary-value" style="color: #dc2626;">${formatCurrency(data.totalExpenses)}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Net ${data.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
            <span style="color: ${data.netProfit >= 0 ? '#16a34a' : '#dc2626'};">${formatCurrency(Math.abs(data.netProfit))}</span>
          </div>
        </div>

        <div class="footer">
          Generated on ${new Date().toLocaleDateString()} by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Balance Sheet Template
// =============================================================================

export function generateBalanceSheetHtml(
  data: BalanceSheet,
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          <div class="company-name">${escapeHtml(company.name)}</div>
          <div class="report-title">Balance Sheet</div>
          <div class="report-subtitle">As of ${escapeHtml(asOfDate)}</div>
        </div>

        <div class="section-title">Assets</div>
        <table>
          <tbody>
            ${(data.assets || []).map(item => `
              <tr>
                <td>${escapeHtml(item.account)}</td>
                <td class="text-right font-medium">${formatCurrency(item.balance)}</td>
              </tr>
            `).join('')}
            <tr style="background: #dbeafe; font-weight: 700;">
              <td>Total Assets</td>
              <td class="text-right">${formatCurrency(data.totalAssets)}</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">Liabilities</div>
        <table>
          <tbody>
            ${(data.liabilities || []).map(item => `
              <tr>
                <td>${escapeHtml(item.account)}</td>
                <td class="text-right font-medium">${formatCurrency(item.balance)}</td>
              </tr>
            `).join('')}
            <tr style="background: #fee2e2; font-weight: 700;">
              <td>Total Liabilities</td>
              <td class="text-right">${formatCurrency(data.totalLiabilities)}</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">Equity</div>
        <table>
          <tbody>
            ${(data.equity || []).map(item => `
              <tr>
                <td>${escapeHtml(item.account)}</td>
                <td class="text-right font-medium">${formatCurrency(item.balance)}</td>
              </tr>
            `).join('')}
            <tr style="background: #d1fae5; font-weight: 700;">
              <td>Total Equity</td>
              <td class="text-right">${formatCurrency(data.totalEquity)}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-box" style="margin-top: 30px;">
          <div class="summary-row">
            <span class="summary-label">Total Assets</span>
            <span class="summary-value">${formatCurrency(data.totalAssets)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Liabilities + Equity</span>
            <span class="summary-value">${formatCurrency(data.totalLiabilities + data.totalEquity)}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Difference</span>
            <span>${formatCurrency(data.totalAssets - (data.totalLiabilities + data.totalEquity))}</span>
          </div>
        </div>

        <div class="footer">
          Generated on ${new Date().toLocaleDateString()} by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Aging Report Template
// =============================================================================

export function generateAgingReportHtml(
  data: AgingReport,
  reportType: 'receivables' | 'payables',
  company: CompanyInfo,
  formatCurrency: (amount: number | null | undefined) => string,
  asOfDate: string
): string {
  const title = reportType === 'receivables' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging';
  const entityLabel = reportType === 'receivables' ? 'Customer' : 'Vendor';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${baseStyles}
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          <div class="company-name">${escapeHtml(company.name)}</div>
          <div class="report-title">${title}</div>
          <div class="report-subtitle">As of ${escapeHtml(asOfDate)}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>${entityLabel}</th>
              <th class="text-right">Current</th>
              <th class="text-right">1-30 Days</th>
              <th class="text-right">31-60 Days</th>
              <th class="text-right">61-90 Days</th>
              <th class="text-right">90+ Days</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(data.items || []).map(item => `
              <tr>
                <td>${escapeHtml(item.entity?.name || '')}</td>
                <td class="text-right">${formatCurrency(item.current)}</td>
                <td class="text-right">${formatCurrency(item.days30)}</td>
                <td class="text-right">${formatCurrency(item.days60)}</td>
                <td class="text-right">${formatCurrency(item.days90)}</td>
                <td class="text-right" style="color: ${item.over90 > 0 ? '#dc2626' : 'inherit'};">${formatCurrency(item.over90)}</td>
                <td class="text-right font-medium">${formatCurrency(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f3f4f6; font-weight: 700;">
              <td>Total</td>
              <td class="text-right">${formatCurrency(data.totals.current)}</td>
              <td class="text-right">${formatCurrency(data.totals.days30)}</td>
              <td class="text-right">${formatCurrency(data.totals.days60)}</td>
              <td class="text-right">${formatCurrency(data.totals.days90)}</td>
              <td class="text-right" style="color: #dc2626;">${formatCurrency(data.totals.over90)}</td>
              <td class="text-right">${formatCurrency(data.totals.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="summary-box" style="margin-top: 30px;">
          <div class="summary-row">
            <span class="summary-label">Current (Not Due)</span>
            <span class="summary-value">${formatCurrency(data.totals.current)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">1-30 Days Overdue</span>
            <span class="summary-value">${formatCurrency(data.totals.days30)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">31-60 Days Overdue</span>
            <span class="summary-value">${formatCurrency(data.totals.days60)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">61-90 Days Overdue</span>
            <span class="summary-value">${formatCurrency(data.totals.days90)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">90+ Days Overdue</span>
            <span class="summary-value" style="color: #dc2626;">${formatCurrency(data.totals.over90)}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Grand Total</span>
            <span>${formatCurrency(data.totals.total)}</span>
          </div>
        </div>

        <div class="footer">
          Generated on ${new Date().toLocaleDateString()} by SoupFinance
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Helper Functions
// =============================================================================

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    PAID: 'status-paid',
    SENT: 'status-sent',
    VIEWED: 'status-sent',
    PARTIAL: 'status-pending',
    PENDING: 'status-pending',
    OVERDUE: 'status-overdue',
    DRAFT: 'status-draft',
    CANCELLED: 'status-draft',
  };
  return classes[status] || 'status-draft';
}
