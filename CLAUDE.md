# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SoupFinance** is a corporate accounting/invoicing platform with a React frontend and HTML design assets. Part of the Soupmarkets ecosystem.

| Component | Tech Stack | Status |
|-----------|------------|--------|
| `soupfinance-web/` | React 19 + TypeScript + Vite 7 + TailwindCSS v4 | Active development |
| `soupfinance-landing/` | Static HTML + TailwindCSS | Marketing site |
| `soupfinance-designs/` | HTML mockups + screenshots (114 screens) | Design reference |

## Domain Architecture (CRITICAL)

**See [.claude/rules/soupfinance-domain-architecture.md](.claude/rules/soupfinance-domain-architecture.md) for full rules.**

| Domain | Purpose | Content | Login? |
|--------|---------|---------|--------|
| `www.soupfinance.com` | Marketing | Static HTML landing page | **NO** |
| `soupfinance.com` | Marketing | Static HTML landing page | **NO** |
| `app.soupfinance.com` | Application | React SPA | **YES** |

**HARD RULE**: The landing page (`www.soupfinance.com`) MUST NOT contain login forms - only links to `app.soupfinance.com`.

**Current Status**: Landing page is in **beta testing mode**. The pricing section is hidden (preserved in HTML comments for later reactivation) and replaced with a beta testing notice.

## Quick Commands

```bash
cd soupfinance-web

# Development
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 5173)
npm run build                  # Production build (runs tsc -b first)
npm run lint                   # ESLint
npm run preview                # Preview production build

# Unit/Integration Tests (Vitest)
npm run test                   # Watch mode
npm run test:run               # Run once (CI mode)
npm run test:coverage          # With V8 coverage report
npx vitest run src/api/__tests__/client.test.ts           # Single test file
npx vitest run -t "should attach Bearer token"            # Single test by name

# E2E Tests (Playwright) - requires dev server running
npm run test:e2e               # Run all E2E tests (headless)
npm run test:e2e:headed        # Run with browser visible
npm run test:e2e:ui            # Interactive Playwright UI
npx playwright test e2e/login.spec.ts                     # Single E2E file
npx playwright test --grep "login flow"                   # By test name

# Storybook (component documentation)
npm run storybook              # Start Storybook dev server (port 6006)
npm run build-storybook        # Build static Storybook

# Design Mockups Preview
cd ../soupfinance-designs && python3 -m http.server 8000

# Landing Page
cd soupfinance-landing
./deploy-landing.sh              # Deploy to production (www.soupfinance.com)
./deploy-landing.sh --skip-ssl   # Deploy without SSL setup
python3 -m http.server 8000      # Preview locally
```

## Deployment

### Production (app.soupfinance.com)

| Property | Value |
|----------|-------|
| URL | https://app.soupfinance.com |
| Origin Server | 65.20.112.224 |
| Deploy Directory | /var/www/soupfinance |
| CDN | Cloudflare |
| SSL | Cloudflare (flexible) |

**Architecture**: Cloudflare CDN → Apache (port 80) → Static SPA files → Varnish (port 6081) → Tomcat (Grails API)

```bash
# Deploy to production
cd soupfinance-web
./deploy/deploy-to-production.sh
```

### Demo Server (for testing)

| Property | Value |
|----------|-------|
| Server | 140.82.32.141 |
| Deploy Directory | /var/www/soupfinance |

```bash
# Deploy to demo
cd soupfinance-web
./deploy/deploy-to-demo.sh
```

### Deploy Scripts

| Script | Target | Description |
|--------|--------|-------------|
| `deploy/deploy-to-production.sh` | 65.20.112.224 | Production (app.soupfinance.com) |
| `deploy/deploy-to-demo.sh` | 140.82.32.141 | Demo server for testing |

### Apache Configuration Files

| File | Purpose |
|------|---------|
| `deploy/apache-soupfinance-production.conf` | Production Apache vhost |
| `deploy/apache-soupfinance.conf` | Demo Apache vhost |
| `deploy/nginx-soupfinance.conf` | Alternative Nginx config (demo) |

## Architecture

### React App (`soupfinance-web/`)

```
src/
├── api/                    # Axios client + endpoint modules
│   ├── client.ts          # Base Axios instance + toFormData/toQueryString helpers
│   ├── auth.ts            # Auth endpoints
│   └── endpoints/         # Feature-specific endpoints (invoices, bills, ledger, vendors, corporate, reports)
├── components/
│   ├── layout/            # MainLayout, AuthLayout, SideNav, TopNav, LanguageSwitcher
│   ├── forms/             # Input, Select, Textarea, Checkbox, Radio, DatePicker (with Storybook)
│   ├── feedback/          # AlertBanner, Spinner, Toast, Tooltip (with Storybook)
│   ├── tables/            # Data table components
│   └── charts/            # Recharts wrapper components
├── features/              # Feature modules (page components)
│   ├── auth/              # LoginPage
│   ├── dashboard/         # DashboardPage
│   ├── invoices/          # List, Form, Detail pages
│   ├── bills/             # List, Form, Detail pages
│   ├── vendors/           # Vendor CRUD pages
│   ├── payments/          # List, Form pages
│   ├── ledger/            # ChartOfAccounts, LedgerTransactions
│   ├── accounting/        # JournalEntry, Vouchers, TransactionRegister
│   ├── reports/           # P&L, Balance Sheet, Cash Flow, Aging, Trial Balance
│   └── corporate/         # KYC onboarding (Registration, CompanyInfo, Directors, Documents, Status)
├── i18n/                  # Internationalization (4 languages: en, de, fr, nl)
│   ├── index.ts           # i18n configuration
│   ├── i18next.d.ts       # TypeScript types
│   └── locales/           # Translation files by language/namespace
├── stores/                # Zustand stores (authStore, uiStore)
├── types/                 # TypeScript interfaces (mirrors Grails domain classes)
├── hooks/                 # Custom React hooks
├── test/                  # Test setup (Vitest + Testing Library)
├── App.tsx                # Routes + providers
└── index.css              # Tailwind + design system tokens
```

**Key Tech:**
- State: Zustand (auth, UI) with localStorage persistence
- Data Fetching: TanStack Query (React Query) - 5min stale time
- Forms: React Hook Form + Zod validation
- Routing: React Router v7
- Charts: Recharts
- HTTP: Axios (proxied to `/rest` → `localhost:9090`)
- Testing: Vitest + Testing Library + Playwright (browser)
- Component Docs: Storybook 10
- i18n: react-i18next with browser language detection

### Routes

| Path | Component |
|------|-----------|
| `/login` | LoginPage |
| `/register` | RegistrationPage (public, corporate) |
| `/dashboard` | DashboardPage |
| `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit` | Invoice CRUD |
| `/bills`, `/bills/new`, `/bills/:id`, `/bills/:id/edit` | Bill CRUD |
| `/vendors`, `/vendors/new`, `/vendors/:id`, `/vendors/:id/edit` | Vendor CRUD |
| `/payments`, `/payments/new` | Payment CRUD |
| `/ledger/accounts` | ChartOfAccountsPage |
| `/ledger/transactions` | LedgerTransactionsPage |
| `/accounting/transactions` | TransactionRegisterPage |
| `/accounting/journal-entry/new`, `/accounting/journal-entry/:id` | JournalEntryPage |
| `/accounting/vouchers/new`, `/accounting/vouchers/:id` | VoucherFormPage |
| `/reports/*` | Report pages (pnl, balance-sheet, cash-flow, aging, trial-balance) |
| `/onboarding/*` | Corporate KYC (company, directors, documents, status) |

### Backend Proxy

Vite proxies to `http://localhost:9090` (Soupmarkets Grails backend):
- `/rest/*` → Authenticated admin API endpoints
- `/client/*` → Public/unauthenticated client endpoints (registration, etc.)

### API Client Patterns

The API client (`src/api/client.ts`) handles:
- **Bearer token auth**: Stored in localStorage (`access_token`), auto-attached to requests
- **FormData serialization**: POST/PUT use `application/x-www-form-urlencoded`
- **Foreign key references**: Nested objects serialize as `field.id` (e.g., `client.id: uuid`)
- **401 handling**: Auto-redirects to `/login` and clears credentials

### Key Architectural Patterns

**Authentication Flow** (spans: `authStore.ts`, `client.ts`, `App.tsx`, `LoginPage.tsx`):
1. User submits credentials → `authStore.login()` → POST to `/rest/auth/login.json`
2. Success: Store token in localStorage + Zustand state → Redirect to `/dashboard`
3. On app mount: `authStore.initialize()` checks localStorage for existing token
4. 401 response: `client.ts` interceptor clears credentials and redirects to `/login`

**Data Fetching Pattern** (React Query + Axios):
- TanStack Query with 5-minute stale time wraps API calls
- API modules in `src/api/endpoints/` return typed promises
- Components use `useQuery`/`useMutation` hooks for data operations

**Form Pattern** (React Hook Form + Zod):
- Forms use `useForm` with Zod schema validation via `@hookform/resolvers`
- Submit handlers call API endpoint functions directly
- Toast notifications for success/error feedback via `ToastProvider`

### Internationalization (i18n)

**Supported Languages**: English (en), German (de), French (fr), Dutch (nl)

**Tech Stack**: react-i18next v16.5 + i18next v25.8 + i18next-browser-languagedetector v8.2

**File Structure** (48 translation files total):
```
src/i18n/
├── index.ts                   # i18n configuration (12 namespaces)
├── i18next.d.ts              # TypeScript types for type-safe translations
└── locales/
    ├── en/                    # English translations (12 files)
    │   ├── common.json       # Shared actions, status, messages, validation
    │   ├── auth.json         # Login, register, logout, 2FA
    │   ├── navigation.json   # Sidebar, header, breadcrumbs
    │   ├── invoices.json     # Invoice management
    │   ├── reports.json      # Financial reports
    │   ├── accounting.json   # ★ CORE: Journal entries, vouchers, transactions
    │   ├── bills.json        # Vendor bills management
    │   ├── payments.json     # Payment tracking
    │   ├── ledger.json       # Chart of accounts, GL transactions
    │   ├── vendors.json      # Vendor management
    │   ├── dashboard.json    # Dashboard overview
    │   └── corporate.json    # KYC onboarding
    ├── de/                    # German (Deutsch) - 12 files
    ├── fr/                    # French (Français) - 12 files
    └── nl/                    # Dutch (Nederlands) - 12 files
```

**Namespaces (12 total)**:

| Namespace | Content | Priority |
|-----------|---------|----------|
| `common` | Shared actions (save, cancel), status labels, validation messages, pagination | Shared |
| `auth` | Login, registration, logout, 2FA | Auth |
| `navigation` | Sidebar menu items, header elements, breadcrumbs | UI |
| `invoices` | Invoice CRUD, line items, status, filters, messages | Finance |
| `reports` | Report types, periods, P&L, balance sheet, cash flow, aging | Finance |
| **`accounting`** | **★ Journal entries, vouchers, transaction register - CORE for integrations** | **Core** |
| `bills` | Vendor bills management, line items, status | Finance |
| `payments` | Incoming/outgoing payments, methods, allocation | Finance |
| `ledger` | Chart of accounts, account types, GL transactions | Core |
| `vendors` | Vendor CRUD, banking info, address | Finance |
| `dashboard` | Stats, charts, quick actions, alerts | UI |
| `corporate` | KYC onboarding: registration, directors, documents, status | Onboarding |

**★ Accounting Namespace (Core Feature)**

The `accounting` namespace is the **dominant feature for integrations**. It covers:
- **Journal Entries**: Create, edit, post, balance validation
- **Vouchers**: Payment/receipt/journal/contra vouchers with approval workflow
- **Transaction Register**: View all accounting transactions with filters

```tsx
// Accounting namespace usage
const { t } = useTranslation('accounting');

// Journal entry fields
t('journalEntry.debitAccount')     // "Debit Account"
t('journalEntry.totalDebits')      // "Total Debits"
t('journalEntry.balanced')         // "Balanced"
t('journalEntry.unbalanced')       // "Unbalanced"

// Voucher types
t('voucher.types.payment')         // "Payment Voucher"
t('voucher.types.receipt')         // "Receipt Voucher"
t('voucher.status.approved')       // "Approved"

// Transaction types
t('transactions.types.journal')    // "Journal Entry"
t('transactions.filters.dateRange') // "Date Range"
```

**Usage in Components**:
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('invoices');  // Use 'invoices' namespace

  return (
    <h1>{t('title')}</h1>           // Simple key
    <p>{t('common:actions.save')}</p>  // Cross-namespace reference
    <p>{t('summary.invoiceCount', { count: 5 })}</p>  // With interpolation
  );
}

// Multiple namespaces
function AccountingPage() {
  const { t } = useTranslation(['accounting', 'common', 'ledger']);

  return (
    <h1>{t('accounting:journalEntry.title')}</h1>
    <button>{t('common:actions.save')}</button>
    <select>{t('ledger:accountTypes.asset')}</select>
  );
}
```

**Language Switching**:
- `LanguageSwitcher` component in `src/components/layout/LanguageSwitcher.tsx`
- Compact variant `LanguageSwitcherCompact` for header/navbar
- Language preference persisted to localStorage (`soupfinance_language`)
- Auto-detects browser language on first visit

**Adding Translations**:
1. Add key to English file first (source of truth)
2. Add same key to all other language files (de, fr, nl)
3. TypeScript will warn if keys don't match (via `i18next.d.ts`)
4. **For accounting features**: Always add to `accounting.json` namespace

**Interpolation**: Use `{{variable}}` syntax in JSON, pass values as second argument to `t()`

**Pluralization**: Use `_plural` suffix for plural forms
```json
{
  "billCount": "{{count}} bill",
  "billCount_plural": "{{count}} bills"
}
```

### Test Organization

```
soupfinance-web/
├── src/**/__tests__/           # Unit/integration tests (Vitest)
│   ├── *.test.ts              # Co-located with source
│   └── integration/*.test.ts  # API integration tests
├── e2e/                        # E2E tests (Playwright) - create when needed
│   └── *.spec.ts              # Browser automation tests
├── test-results/               # Playwright artifacts (gitignored)
└── playwright-report/          # HTML test report (gitignored)
```

**Test Patterns:**
- Arrange/Act/Assert structure in all tests
- Axios is globally mocked in `src/test/setup.ts` (auto-clears before each test)
- localStorage and window.location are mocked globally
- Integration tests in `__tests__/integration/` test API modules against mock responses

### Type System (`src/types/index.ts`)

All types mirror the soupmarkets-web Grails domain classes:
- **BaseEntity**: All entities have `id` (UUID string), `archived`, `dateCreated`, `lastUpdated`, `tenantId`
- **Foreign keys**: Referenced as `{ id: string; name?: string }` objects
- **Enums**: TypeScript union types matching Grails enums (e.g., `InvoiceStatus`, `LedgerGroup`, `VoucherType`)

Key domain types:
- **Finance**: `Invoice`, `Bill`, `Vendor`, `InvoicePayment`, `BillPayment`
- **Ledger**: `LedgerAccount`, `LedgerTransaction`, `LedgerTransactionGroup`, `Voucher`, `JournalEntry`
- **Reports**: `BalanceSheet`, `ProfitLoss`, `TrialBalance`, `CashFlowStatement`, `AgingReport`
- **Corporate KYC**: `Corporate`, `CorporateAccountPerson`, `CorporateDocuments`

## Storybook Components

Components with Storybook stories (run `npm run storybook` to view):

| Category | Components |
|----------|------------|
| Forms | Input, Select, Textarea, Checkbox, Radio, DatePicker |
| Feedback | AlertBanner, Spinner, Tooltip, Toast |
| Layout | SideNav, TopNav, MainLayout, AuthLayout |

When adding new reusable components, create a `.stories.tsx` file alongside the component.

## Design System

**Full documentation: [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md)**

| Property | Value |
|----------|-------|
| CSS Framework | TailwindCSS v4 |
| Primary Color | `#f24a0d` (orange) |
| Background Light | `#f8f6f5` |
| Background Dark | `#221510` |
| Font | Manrope (Google Fonts) |
| Icons | Material Symbols Outlined |
| Dark Mode | `class` strategy on `<html>` |

### CSS Tokens (Tailwind v4)

Defined in `src/index.css` via `@theme`:

```css
--color-primary: #f24a0d;
--color-background-light: #f8f6f5;
--color-background-dark: #221510;
--color-surface-light: #FFFFFF;
--color-surface-dark: #1f1715;
--color-text-light: #181311;
--color-subtle-text: #8a6b60;
--color-border-light: #e6dedb;
--color-danger: #EF4444;
--font-display: "Manrope", "Noto Sans", sans-serif;
```

## Design Mockups (114 screens)

Located in `soupfinance-designs/{screen-name}/`:
- `code.html` - TailwindCSS HTML mockup
- `screen.png` - Screenshot

### Screen Categories

| Category | Count | Examples |
|----------|-------|----------|
| Invoices | 10 | `invoice-management/`, `new-invoice-form/`, `invoice-approval-workflow/` |
| Reports | 13 | `balance-sheet-report/`, `income-statement-report/`, `report-pnl-*` |
| Forms | 10 | `form-checkbox-styles/`, `form-date-range-picker/`, `form-validation-error-states/` |
| Mobile | 12 | `mobile-bottom-nav/`, `mobile-sidenav/`, `mobile-invoice-form/` |
| Modals | 8 | `modal-delete-confirmation/`, `modal-export-options/` |
| States | 17 | `loading-*`, `empty-state-*`, `error-*`, `alert-*` |
| Interactive | 8 | `interactive-user-dropdown/`, `interactive-tooltip-examples/` |

## When Implementing Features

1. Check `soupfinance-designs/` for the relevant mockup
2. Reference `.claude/rules/soupfinance-design-system.md` for component patterns
3. Use existing feature modules as templates (e.g., copy invoice patterns for new entities)
4. Use Tailwind v4 tokens from `index.css` (`text-primary`, `bg-background-light`, etc.)
5. Include dark mode variants (`dark:bg-background-dark`)

## Git Remotes

| Remote | URL |
|--------|-----|
| origin (GitHub) | https://github.com/tasltd/soupfinance |
| gitlab | git@gitlab.com:tasltd/soupfinance.git |

## Parent Project

Part of **Soupmarkets** ecosystem. Backend runs on port 9090. See `../CLAUDE.md` for ecosystem docs.
