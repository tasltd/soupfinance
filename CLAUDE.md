# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SoupFinance** is a design assets repository containing HTML mockups and screenshots for a corporate accounting/invoicing platform. This is part of the Soupmarkets ecosystem.

**Status**: Design phase (no application code yet)

## Design System

**See [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) for the complete design system documentation.**

Quick reference:

| Property | Value |
|----------|-------|
| **CSS Framework** | TailwindCSS (CDN) |
| **Primary Color** | `#f24a0d` (orange) |
| **Background Light** | `#f8f6f5` |
| **Background Dark** | `#221510` |
| **Font** | Manrope (Google Fonts) |
| **Icons** | Material Symbols Outlined |
| **Dark Mode** | Supported via `class` strategy |

## Repository Structure

```
soupfinance/
├── .claude/
│   └── rules/
│       └── soupfinance-design-system.md   # Complete design system docs
├── soupfinance-designs/                    # 43 screen designs
│   ├── {screen-name}/
│   │   ├── code.html                       # TailwindCSS HTML mockup
│   │   └── screen.png                      # Screenshot of the design
│   └── ...
└── CLAUDE.md
```

## Screen Catalog

### Authentication
- `login-authentication/` - Split-screen login with branding

### Dashboard & Analytics
- `financial-overview-dashboard/` - Main dashboard with KPIs, charts, recent invoices
- `reporting-and-analytics/` - Analytics overview

### Invoices (10 screens)
- `invoice-management/` - Invoice list with pagination
- `new-invoice-form/` - Create invoice with line items
- `invoice-draft-preview/` - Preview before sending
- `invoice-line-items-table/` - Editable line items
- `advanced-invoice-metadata/` - Extended invoice details
- `invoice-status-summary/` - Status dashboard
- `invoice-status-update-log/` - Status change history
- `invoice-validation-checker/` - Validation rules
- `invoice-approval-workflow/` - Multi-step approval timeline
- `closed-invoice-archive/` - Completed invoices

### Payments (3 screens)
- `payment-entry-form/` - Record payment
- `payment-allocation-screen/` - Allocate payments
- `payment-history-report/` - Transaction history

### Vendors/Clients (2 screens)
- `vendor-client-management/` - Client CRUD
- `vendor-payment-analysis/` - Payment trends

### Items/Services (3 screens)
- `item-services-catalog-browser/` - Browse catalog
- `item-creation-modal/` - Add item modal
- `services-selection-grid/` - Services grid

### Financial Reports (7 screens)
- `balance-sheet-report/` - Assets/Liabilities/Equity
- `income-statement-report/` - Revenue/Expenses
- `cash-flow-statement-report/` - Cash flows
- `trial-balance-report/` - Debits/Credits
- `profit-and-loss-summary-report/` - P&L summary
- `budget-vs-actual-variance-report/` - Variance analysis
- `expense-category-breakdown/` - Expenses by category

### Equity Reports (2 screens)
- `statement-of-changes-in-equity/` - Equity changes
- `retained-earnings-statement/` - Retained earnings

### Aging Reports (2 screens)
- `ar-aging-report/` - Accounts receivable
- `ap-aging-report/` - Accounts payable

### General Ledger (3 screens)
- `general-ledger-entries/` - GL transactions
- `gl-integration-mapping/` - Account mapping
- `gl-reconciliation-report/` - Reconciliation

### Other Reports (4 screens)
- `tax-liability-report/` - Tax obligations
- `inventory-valuation-report/` - Inventory value
- `customer-credit-limit-report/` - Credit limits
- `audit-trail-log/` - System audit log

### Utilities (4 screens)
- `amount-due-tracker/` - Outstanding amounts
- `amount-due-summary/` - Due amounts overview
- `overdue-reminder-generator/` - Generate notices
- `tax-and-discount-calculator/` - Calculator tool

## Working with Designs

### Preview a Design

```bash
# Open in browser
xdg-open soupfinance-designs/financial-overview-dashboard/code.html

# Or use HTTP server for proper font loading
cd soupfinance-designs && python3 -m http.server 8000
# Visit http://localhost:8000/financial-overview-dashboard/code.html
```

### Toggle Dark Mode

Add/remove `dark` class on the `<html>` element:
```html
<html class="dark" lang="en">  <!-- Dark mode -->
<html class="light" lang="en"> <!-- Light mode -->
```

## When Implementing

1. **Read the design system** - `.claude/rules/soupfinance-design-system.md`
2. **Extract Tailwind config** - Use the embedded config as base
3. **Follow component patterns** - Each HTML demonstrates reusable patterns
4. **Use semantic colors** - `primary`, `background-light`, etc.
5. **Include dark mode** - All components support light/dark
6. **Use Material Symbols** - Consistent icon settings

## Tailwind Config (Quick Start)

```javascript
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#f24a0d",
        "background-light": "#f8f6f5",
        "background-dark": "#221510",
      },
      fontFamily: {
        "display": ["Manrope", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
```

## Parent Project

Part of the **Soupmarkets** ecosystem. See `../CLAUDE.md` for workspace docs.
