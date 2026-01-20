# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SoupFinance** is a corporate accounting/invoicing platform with a React frontend and HTML design assets. Part of the Soupmarkets ecosystem.

| Component | Tech Stack | Status |
|-----------|------------|--------|
| `soupfinance-web/` | React 19 + TypeScript + Vite + TailwindCSS v4 | Active development |
| `soupfinance-designs/` | HTML mockups + screenshots (114 screens) | Design reference |

## Quick Commands

```bash
# React Web App (soupfinance-web/)
cd soupfinance-web
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

# Design Mockups (soupfinance-designs/)
cd soupfinance-designs && python3 -m http.server 8000  # Preview at localhost:8000
```

## Architecture

### React App (`soupfinance-web/`)

```
src/
├── api/                    # Axios client + endpoint modules
│   ├── client.ts          # Base Axios instance + toFormData helper
│   ├── auth.ts            # Auth endpoints
│   └── endpoints/         # Feature-specific endpoints (invoices, bills, ledger, vendors, corporate)
├── components/
│   ├── layout/            # MainLayout, AuthLayout, SideNav, TopNav
│   ├── forms/             # Input, Select, Textarea, Checkbox, Radio, DatePicker (with Storybook)
│   └── feedback/          # AlertBanner, Spinner, Toast, Tooltip (with Storybook)
├── features/              # Feature modules (page components)
│   ├── auth/              # LoginPage
│   ├── dashboard/         # DashboardPage
│   ├── invoices/          # List, Form, Detail pages
│   ├── bills/             # List, Form, Detail pages
│   ├── payments/          # List, Form pages
│   ├── ledger/            # ChartOfAccounts, Transactions
│   ├── reports/           # P&L, Balance Sheet, Cash Flow, Aging
│   └── corporate/         # KYC onboarding (Registration, CompanyInfo, Directors, Documents, Status)
├── stores/                # Zustand stores (authStore, uiStore)
├── types/                 # TypeScript interfaces
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

### Routes

| Path | Component |
|------|-----------|
| `/login` | LoginPage |
| `/register` | RegistrationPage (public, corporate) |
| `/dashboard` | DashboardPage |
| `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit` | Invoice CRUD |
| `/bills`, `/bills/new`, `/bills/:id`, `/bills/:id/edit` | Bill CRUD |
| `/payments`, `/payments/new` | Payment CRUD |
| `/ledger/accounts` | ChartOfAccountsPage |
| `/ledger/transactions` | LedgerTransactionsPage |
| `/reports/*` | Report pages (pnl, balance-sheet, cash-flow, aging) |
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
