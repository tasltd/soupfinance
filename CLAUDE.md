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

## Gradle Concurrent Task Rule (HARD RULE)

**NEVER run Gradle tasks if another process is already running a Gradle task in the same project folder.**

Before running any `./gradlew` command in `soupmarkets-web`:
1. **Check first**: `pgrep -af "gradlew\|GradleDaemon" | grep soupmarkets`
2. **If process found**: WAIT for it to complete before running yours
3. **Reason**: Gradle uses file locks - concurrent tasks cause hangs and build failures

This applies to:
- Host machine running `./gradlew bootRun`
- LXC containers running `./gradlew bootRun` on mounted `/app`
- Any CI/CD pipelines

## Quick Commands

**IMPORTANT**: Most development requires the soupmarkets-web backend running on port 9090:
```bash
cd ../soupmarkets-web && source env-variables.sh && ./gradlew bootRun
```

```bash
cd soupfinance-web

# Development
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 5173)
npm run dev:lxc                # Dev server against LXC backend
npm run build                  # Production build (runs tsc -b first)
npm run lint                   # ESLint
npm run preview                # Preview production build

# Unit/Integration Tests (Vitest)
npm run test                   # Watch mode
npm run test:run               # Run once (CI mode)
npm run test:coverage          # With V8 coverage report
npx vitest run src/api/__tests__/client.test.ts           # Single test file
npx vitest run -t "should attach Bearer token"            # Single test by name

# E2E Tests (Playwright) - uses dedicated port 5180 to avoid conflicts
npm run test:e2e               # Run all E2E tests (headless, port 5180)
npm run test:e2e:headed        # Run with browser visible
npm run test:e2e:ui            # Interactive Playwright UI
npm run test:e2e:report        # Open HTML report in browser
npx playwright test e2e/auth.spec.ts                      # Single E2E file
npx playwright test --grep "login flow"                   # By test name

# E2E Tests against LXC Backend (real backend, not mocked)
npm run test:e2e:lxc           # Run all E2E tests against LXC backend
npm run test:e2e:lxc:headed    # With browser visible
npm run test:e2e:lxc:report    # Open LXC test report

# Integration E2E Tests (port 5181, sequential execution)
npx playwright test --config=playwright.integration.config.ts

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

## Local Development Backend (LXC)

For local development and endpoint verification, use the LXC backend instead of running Grails directly.

**Two backend options exist** (use ONE, not both):

| Option | Location | Use Case |
|--------|----------|----------|
| `backend/tomcat-control.sh` | `backend/` | **Recommended** - Spring Boot embedded Tomcat from pre-built WAR |
| `soupfinance-lxc/setup-backend.sh` | `soupfinance-lxc/` | Alternative - Grails bootRun (slower startup, requires source mount) |

### Option 1: Spring Boot WAR (Recommended)

```bash
cd backend

# Start the backend (starts containers if needed)
./tomcat-control.sh start

# Check status and get container IP
./tomcat-control.sh status

# View logs
./tomcat-control.sh logs

# Stop when done
./tomcat-control.sh stop
```

### Run React app against LXC backend

```bash
cd soupfinance-web
npm run dev:lxc
```

### Deploy new WAR from soupmarkets-web

```bash
# Option 1: From soupmarkets-web (recommended)
cd ../soupmarkets-web
source env-variables.sh
./gradlew assembleDeployToSoupfinance

# Option 2: Manual deploy (if WAR already built)
cd backend
./deploy-war.sh --restart
```

### Architecture

| Component | IP/Port | Description |
|-----------|---------|-------------|
| `soupfinance-backend` LXC | Dynamic (check with `status`) | Java 21 + Spring Boot embedded Tomcat |
| `soupmarkets-mariadb` LXC | Dynamic (check with `status`) | Database: `soupbroker_soupfinance` |

**Note**: Container IPs are assigned dynamically by LXC. Run `./tomcat-control.sh status` to get current IPs and update `.env.lxc` if needed.

See `backend/README.md` for full documentation.

### Test Credentials (LXC Backend)

Test users for integration and E2E testing against the LXC backend:

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| `test.admin` | `secret` | ROLE_ADMIN, ROLE_USER | Full admin access |
| `test.user` | `secret` | ROLE_USER | Minimal user access |
| `test.finance` | `secret` | ROLE_USER + Finance roles | Finance CRUD testing |
| `soup.support` | `secret` | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |

**Finance roles for `test.finance`**: ROLE_INVOICE, ROLE_BILL, ROLE_LEDGER_TRANSACTION, ROLE_VENDOR, ROLE_FINANCE_REPORTS, ROLE_LEDGER_ACCOUNT, ROLE_VOUCHER

**Environment files**:
- `.env.test` - Test credentials as environment variables
- `.env.lxc` - API URL for LXC backend

**E2E usage** (see `e2e/fixtures.ts`):
```typescript
import { backendTestUsers, authenticateWithBackend } from './fixtures';

test('integration test', async ({ page }) => {
  await authenticateWithBackend(page, backendTestUsers.admin);
  // ... test against real API
});
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

See `src/App.tsx` for complete route definitions. Key routes:
- **Public**: `/login`, `/register`
- **Finance**: `/invoices/*`, `/bills/*`, `/vendors/*`, `/payments/*`
- **Accounting**: `/ledger/*`, `/accounting/*` (journal entries, vouchers)
- **Reports**: `/reports/*` (pnl, balance-sheet, cash-flow, aging, trial-balance)
- **Onboarding**: `/onboarding/*` (corporate KYC)

### Backend Proxy

Vite proxies API calls to the backend (default `http://localhost:9090`, or `VITE_API_URL` from `.env.lxc`):

| Prefix | Target | Auth Required | Usage |
|--------|--------|---------------|-------|
| `/rest/*` | Backend `/rest/*` | Yes (X-Auth-Token) | Admin API endpoints |
| `/client/*` | Backend `/client/*` | No | Public endpoints (registration, 2FA) |

**Note**: API endpoint modules in `src/api/endpoints/` use paths like `/invoice/index.json` which become `/rest/invoice/index.json` via the Axios base URL configured in `client.ts`.

### API Client Patterns

The API client (`src/api/client.ts`) handles:
- **X-Auth-Token header**: Stored in localStorage (`access_token`), auto-attached via `X-Auth-Token` header (NOT Bearer token)
- **FormData serialization**: POST/PUT use `application/x-www-form-urlencoded`
- **Foreign key references**: Nested objects serialize as `field.id` (e.g., `client.id: uuid`)
- **401 handling**: Auto-redirects to `/login` and clears credentials

### Critical API Notes (For Backend Integration)

| Pattern | Detail |
|---------|--------|
| **Auth Header** | `X-Auth-Token: {token}` (NOT `Authorization: Bearer`) |
| **Login Endpoint** | POST `/rest/api/login` with JSON body (`{"username": "...", "password": "..."}`) |
| **Content-Type (Auth)** | `application/json` for login only |
| **Content-Type (Data)** | `application/x-www-form-urlencoded` for all other POST/PUT |
| **Token Validation** | On app mount, validates token with GET `/rest/user/current.json` |
| **2FA (Corporate)** | POST `/client/authenticate.json` then `/client/verifyCode.json` |

### Backend API Endpoints (Verified 2026-01-22)

**Finance Controllers** (in `soupmarkets-web/grails-app/controllers/soupbroker/finance/`):

| Controller | Endpoints | Notes |
|------------|-----------|-------|
| `InvoiceController` | `/rest/invoice/*` | CRUD + status actions, PDF, email |
| `BillController` | `/rest/bill/*` | CRUD + status actions |
| `InvoicePaymentController` | `/rest/invoicePayment/*` | Payment allocation |
| `BillPaymentController` | `/rest/billPayment/*` | Payment allocation |
| `VendorController` | `/rest/vendor/*` | CRUD |
| `LedgerAccountController` | `/rest/ledgerAccount/*` | Chart of accounts |
| `LedgerTransactionController` | `/rest/ledgerTransaction/*` | GL entries |
| `LedgerTransactionGroupController` | `/rest/ledgerTransactionGroup/*` | Standard CRUD (journal entries) |
| `VoucherController` | `/rest/voucher/*` | CRUD + PDF + email |
| `FinanceReportsController` | `/rest/financeReports/*` | P&L, Balance Sheet, Trial Balance, Aging |

**Approval Workflows**:

| Controller | Action | Endpoint | Description |
|------------|--------|----------|-------------|
| `VoucherApprovalController` | `save` | POST `/rest/voucherApproval/save` | Create approval record with ApprovalState |
| `LedgerTransactionApprovalController` | `approve` | POST `/rest/ledgerTransactionApproval/approve/{id}` | Approve a transaction |

**Note**: Voucher approval is managed by creating `VoucherApproval` records. Ledger transaction approval has explicit `approve` action.

### Key Architectural Patterns

**Authentication Flow** (spans: `authStore.ts`, `client.ts`, `App.tsx`, `LoginPage.tsx`):
1. User submits credentials → `authStore.login()` → POST to `/rest/api/login` (JSON body)
2. Success: Store token in localStorage + Zustand state → Redirect to `/dashboard`
3. On app mount: `authStore.initialize()` checks localStorage for existing token
4. Token validation: `validateToken()` calls GET `/rest/user/current.json` to verify token is valid
5. Invalid token: Clears localStorage and shows "Session expired" message
6. 401 response: `client.ts` interceptor clears credentials and redirects to `/login`

**Data Fetching Pattern** (React Query + Axios):
- TanStack Query with 5-minute stale time wraps API calls
- API modules in `src/api/endpoints/` return typed promises
- Components use `useQuery`/`useMutation` hooks for data operations

**Form Pattern** (React Hook Form + Zod):
- Forms use `useForm` with Zod schema validation via `@hookform/resolvers`
- Submit handlers call API endpoint functions directly
- Toast notifications for success/error feedback via `ToastProvider`

### Internationalization (i18n)

**Languages**: English (en), German (de), French (fr), Dutch (nl)

**12 Namespaces**: `common`, `auth`, `navigation`, `invoices`, `reports`, `accounting` (★ core), `bills`, `payments`, `ledger`, `vendors`, `dashboard`, `corporate`

**Usage**:
```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('invoices');       // Single namespace
const { t } = useTranslation(['accounting', 'common']);  // Multiple

t('title');                           // Simple key
t('common:actions.save');             // Cross-namespace
t('count', { count: 5 });             // Interpolation {{count}}
```

**Adding Translations**: Add to `en/*.json` first (source of truth), then to de/fr/nl. TypeScript validates via `i18next.d.ts`.

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

**IMPORTANT - Axios Mocking in Unit Tests:**
```typescript
// Axios is globally mocked - set up return values like this:
import apiClient from '../api/client';
import { vi } from 'vitest';

vi.mocked(apiClient.get).mockResolvedValue({ data: { ... } });
vi.mocked(apiClient.post).mockResolvedValue({ data: { ... } });

// For integration tests needing real HTTP, unmock at top of file:
vi.unmock('axios');
```

**E2E Test Fixtures** (`e2e/fixtures.ts`):
- `authenticatedPage` - Pre-authenticates via localStorage injection
- `mockApiResponse()` - Generic route intercept helper
- `mockLoginApi()`, `mockInvoicesApi()`, `mockBillsApi()`, etc. - Domain-specific mocks
- E2E tests auto-start Vite dev server if not running (see `playwright.config.ts`)

**IMPORTANT - No Fallback to Mock Data in Production**:
- Pages MUST fetch from backend API, never use mock data as fallback
- Show error state if API fails, empty state if data is empty
- Mock data is ONLY for tests (`e2e/fixtures.ts`) and Storybook stories

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

Located in `soupfinance-designs/{screen-name}/` with `code.html` (TailwindCSS) + `screen.png`. See `.claude/rules/soupfinance-design-system.md` for full screen catalog.

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
