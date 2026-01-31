# Financial Reports

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Generate and export financial reports.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| RPT-1 | As a business owner, I want to see P&L so I know profitability | P0 |
| RPT-2 | As an accountant, I want to see trial balance so I can verify the ledger | P0 |
| RPT-3 | As a business owner, I want to see balance sheet so I know financial position | P0 |
| RPT-4 | As a finance manager, I want to see aging reports so I can manage collections | P0 |
| RPT-5 | As a user, I want to export reports so I can share with stakeholders | P1 |

---

## Available Reports

| Report | Description | Key Metrics |
|--------|-------------|-------------|
| **Trial Balance** | All accounts with debit/credit balances | Validates ledger balance |
| **Income Statement (P&L)** | Revenue vs expenses for period | Gross profit, net profit |
| **Balance Sheet** | Assets, liabilities, equity snapshot | Financial position |
| **Cash Flow Statement** | Operating, investing, financing | Net cash flow |
| **AR Aging** | Customer receivables by age | Collection risk |
| **AP Aging** | Vendor payables by age | Payment planning |

---

## Report Details

### Trial Balance

- Shows all ledger accounts
- Debit and credit ending balances
- Validates: Total Debits = Total Credits
- Grouped by ledger group

### Income Statement (P&L)

- Revenue accounts with totals
- Expense accounts with totals
- Gross profit calculation
- Net profit/loss calculation
- Period comparison optional

### Balance Sheet

- Assets section with subtotals
- Liabilities section with subtotals
- Equity section
- Validates: Assets = Liabilities + Equity
- As-of date snapshot

### Cash Flow Statement

- Operating activities
- Investing activities
- Financing activities
- Net cash flow
- Beginning/ending cash balance

### Aging Reports

| Bucket | AR Description | AP Description |
|--------|----------------|----------------|
| Current | Not yet due | Not yet due |
| 30 Days | 1-30 days overdue | 1-30 days overdue |
| 60 Days | 31-60 days overdue | 31-60 days overdue |
| 90 Days | 61-90 days overdue | 61-90 days overdue |
| 90+ Days | Over 90 days overdue | Over 90 days overdue |

---

## Export Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| PDF | .pdf | Printing, sharing |
| Excel | .xlsx | Analysis, manipulation |
| CSV | .csv | Data import/export |

---

## Frontend PDF Generation

The frontend generates report PDFs using `html2pdf.js` library. This provides:

- Beautiful HTML-to-PDF rendering with consistent branding
- No backend dependency for PDF creation
- Instant preview and download capability
- Email sharing with PDF attachments

### PDF Components

| Report | Download Function | Blob Function | Template |
|--------|------------------|---------------|----------|
| Trial Balance | `generateTrialBalancePdf()` | `generateTrialBalancePdfBlob()` | `generateTrialBalanceHtml()` |
| Profit & Loss | `generateProfitLossPdf()` | `generateProfitLossPdfBlob()` | `generateProfitLossHtml()` |
| Balance Sheet | `generateBalanceSheetPdf()` | `generateBalanceSheetPdfBlob()` | `generateBalanceSheetHtml()` |
| AR/AP Aging | `generateAgingReportPdf()` | `generateAgingReportPdfBlob()` | `generateAgingReportHtml()` |

### PDF Template Features

- Company header with name and address
- Report title and date range/as-of date
- Data tables with proper formatting
- Section groupings (e.g., by ledger type)
- Summary totals and calculations
- Generated timestamp footer
- Page orientation optimization (landscape for aging/trial balance)

---

## Frontend Email Sending

Reports can be sent via email with frontend-generated PDF attachments:

### Email Service

| Endpoint | Description |
|----------|-------------|
| `POST /rest/email/send.json` | Send email with PDF attachment |

### Email Payload for Reports

```typescript
{
  to: [{ email: string, name?: string }],
  cc?: [{ email: string, name?: string }],
  subject: string,           // e.g., "Trial Balance for 2024-01-01 to 2024-12-31"
  body: string,
  bodyHtml: string,
  attachments: [{
    filename: string,        // e.g., "Trial-Balance_2024-01-01_to_2024-12-31.pdf"
    content: string,         // Base64 encoded PDF
    contentType: "application/pdf"
  }],
  reportType: string         // For tracking (e.g., "trial-balance", "profit-loss")
}
```

### Hooks

| Hook | Description |
|------|-------------|
| `usePdf()` | PDF generation and download |
| `useEmailSend()` | Report PDF + email sending |

### useEmailSend Report Methods

```typescript
sendTrialBalance(data, email, name?, options?)
sendProfitLoss(data, email, name?, options?)
sendBalanceSheet(data, email, name?, options?)
sendAgingReport(data, type, email, name?, options?)
```

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| ReportsPage | `/reports` | Report navigation hub |
| TrialBalancePage | `/reports/trial-balance` | Trial balance report |
| ProfitLossPage | `/reports/pnl` | Income statement |
| BalanceSheetPage | `/reports/balance-sheet` | Balance sheet |
| CashFlowPage | `/reports/cash-flow` | Cash flow statement |
| AgingReportsPage | `/reports/aging` | AR/AP aging reports |

---

## API Endpoints

```
GET /rest/financeReports/trialBalance.json      - Trial balance
GET /rest/financeReports/incomeStatement.json   - P&L
GET /rest/financeReports/balanceSheet.json      - Balance sheet
GET /rest/financeReports/agedReceivables.json   - AR aging
GET /rest/financeReports/agedPayables.json      - AP aging
GET /rest/financeReports/accountBalances.json   - Account balances
GET /rest/financeReports/accountTransactions.json - Account transactions

# Export (add format parameter)
GET /rest/financeReports/{type}.json?f=pdf      - Export as PDF
GET /rest/financeReports/{type}.json?f=xlsx     - Export as Excel
GET /rest/financeReports/{type}.json?f=csv      - Export as CSV
```

---

## Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| from | Start date | 2026-01-01 |
| to | End date | 2026-12-31 |
| ledgerGroup | Filter by group | ASSET |
| accountId | Specific account | uuid |
| f | Export format | pdf, xlsx, csv |

---

## Wireframe References

- `soupfinance-designs/screenshots/reports-hub.png`
- `soupfinance-designs/screenshots/trial-balance.png`
- `soupfinance-designs/screenshots/profit-loss.png`
- `soupfinance-designs/screenshots/balance-sheet.png`
- `soupfinance-designs/screenshots/aging-report.png`
