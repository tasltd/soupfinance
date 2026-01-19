# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SoupFinance** is a design assets repository containing HTML mockups and screenshots for a corporate accounting/invoicing platform. This is part of the Soupmarkets ecosystem.

**Status**: Design phase (no application code yet)

## Repository Structure

```
soupfinance/
└── soupfinance-designs/     # 42+ screen designs
    ├── {screen-name}/
    │   ├── code.html        # TailwindCSS HTML mockup
    │   └── screen.png       # Screenshot of the design
    └── ...
```

## Design System

All mockups use a consistent design system:

| Property | Value |
|----------|-------|
| **CSS Framework** | TailwindCSS (CDN) |
| **Primary Color** | `#f24a0d` (orange) |
| **Background Light** | `#f8f6f5` |
| **Background Dark** | `#221510` |
| **Font** | Manrope (Google Fonts) |
| **Icons** | Material Symbols Outlined |
| **Dark Mode** | Supported via `class` strategy |

### Tailwind Config (embedded in each HTML)

```javascript
tailwind.config = {
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
}
```

## Available Screens

### Core Features
- **Dashboard**: `financial_overview_dashboard/` - KPIs, cash flow chart, invoice status donut
- **Invoices**: `invoice_management/`, `new_invoice_form/`, `invoice_line_items_table/`, `invoice_draft_preview/`, `invoice_approval_workflow/`, `invoice_validation_checker/`, `invoice_status_summary/`, `invoice_status_update_log/`, `closed_invoice_archive/`, `advanced_invoice_metadata/`
- **Payments**: `payment_entry_form/`, `payment_allocation_screen/`, `payment_history_report/`
- **Vendors/Clients**: `vendor/client_management/`, `vendor_payment_analysis/`
- **Items/Services**: `item/services_catalog_browser/`, `item_creation_modal/`, `services_selection_grid/`

### Financial Reports
- **Core Statements**: `balance_sheet_report/`, `income_statement_report/`, `cash_flow_statement_report/`, `trial_balance_report/`
- **Equity**: `statement_of_changes_in_equity/`, `retained_earnings_statement/`
- **Aging**: `ar_aging_report/`, `ap_aging_report/`
- **Analysis**: `profit_&_loss_summary_report/`, `budget_vs._actual_variance_report/`, `expense_category_breakdown/`
- **GL**: `general_ledger_entries/`, `gl_integration_mapping/`, `gl_reconciliation_report/`
- **Other**: `tax_liability_report/`, `inventory_valuation_report/`, `customer_credit_limit_report/`, `audit_trail_log/`

### Utilities
- **Auth**: `login/authentication/`
- **Tracking**: `amount_due_tracker/`, `amount_due_summary/`, `overdue_reminder_generator/`
- **Analytics**: `reporting_&_analytics/`
- **Calculations**: `tax_&_discount_calculator/`

## Working with Designs

### Preview a Design

```bash
# Open in browser
xdg-open soupfinance-designs/financial_overview_dashboard/code.html

# Or use a simple HTTP server for proper font loading
cd soupfinance-designs && python3 -m http.server 8000
# Then visit http://localhost:8000/financial_overview_dashboard/code.html
```

### View Screenshot

```bash
xdg-open soupfinance-designs/financial_overview_dashboard/screen.png
```

### Toggle Dark Mode

Add/remove `dark` class on the `<html>` element in any `code.html` file:
```html
<html class="dark" lang="en">  <!-- Dark mode -->
<html class="light" lang="en"> <!-- Light mode -->
```

## When Implementing

When building the actual application from these designs:

1. **Extract Tailwind Config** - Use the embedded config as the base for your `tailwind.config.js`
2. **Component Patterns** - Each HTML file demonstrates reusable patterns (sidebar nav, top nav, data tables, stat cards, form inputs)
3. **Color Tokens** - Use semantic color names (`primary`, `background-light`, `background-dark`) consistently
4. **Icon Usage** - Material Symbols Outlined with consistent settings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`
5. **Responsive** - Designs include responsive breakpoints (`lg:`, `sm:`, etc.)

## Parent Project

This repository is part of the **Soupmarkets** ecosystem. See `../CLAUDE.md` for workspace-level documentation.
