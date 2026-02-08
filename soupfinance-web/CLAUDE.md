# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173, mock/no backend)
npm run dev:lxc          # Start with LXC backend (uses .env.lxc, port 9090)

# Build & Lint
npm run build            # TypeScript check + Vite build
npm run lint             # ESLint check

# Testing - Unit/Integration (Vitest)
npm run test             # Watch mode
npm run test:run         # Single run
npm run test:run -- src/features/invoices/__tests__/InvoiceFormPage.test.tsx  # Single file

# Testing - E2E (Playwright)
npm run test:e2e         # Run with mocks (port 5180)
npm run test:e2e:headed  # Run with browser UI
npm run test:e2e:lxc     # Run against real LXC backend (integration tests only)
npm run test:e2e:lxc:all # All tests (mock + integration) against LXC
npm run test:e2e:report  # Open mock test report
npm run test:e2e:lxc:report  # Open LXC test report

# Run specific integration test file against LXC
npx playwright test --config=playwright.lxc.config.ts e2e/integration/02-vendors.integration.spec.ts

# Alternative: integration-specific config (uses port 5181, separate report)
npx playwright test --config=playwright.integration.config.ts

# Deployment
./deploy/deploy-to-production.sh   # Deploy to app.soupfinance.com
```

## Environment Setup

| File | Purpose | Git-tracked? |
|------|---------|:---:|
| `.env.lxc` | LXC backend proxy target | Yes |
| `.env.lxc.local` | API Consumer credentials for LXC | **No** (git-ignored via `*.local`) |
| `.env.test` | E2E test environment | Yes |
| `.env.production` | Production build settings | Yes |

**To develop with LXC backend:** Copy `.env.lxc.local.example` → `.env.lxc.local` and fill in `VITE_API_CONSUMER_ID` + `VITE_API_CONSUMER_SECRET` (get from team). Then run `npm run dev:lxc`.

**Key env vars:**
- `VITE_PROXY_TARGET` — Where Vite proxy forwards `/rest/*` requests (e.g., `http://10.115.213.183:9090`)
- `VITE_API_URL` — Frontend API base path (always `/rest`, relative — do NOT set to backend URL)
- `VITE_API_CONSUMER_ID` / `VITE_API_CONSUMER_SECRET` — Proxy injects as `Api-Authorization: Basic base64(id:secret)`

## Architecture Overview

### Feature-Based Organization
```
src/features/{feature}/
├── {Feature}Page.tsx           # Page component with routing
├── {Feature}FormPage.tsx       # Create/Edit form page
├── {Feature}ListPage.tsx       # List view page
├── {Feature}DetailPage.tsx     # Detail view page
├── __tests__/                  # Feature-specific tests
└── index.ts                    # Barrel exports
```

Features: `accounting`, `auth`, `bills`, `clients`, `corporate`, `dashboard`, `invoices`, `ledger`, `payments`, `reports`, `settings`, `vendors`

### API Layer (`src/api/`)
- **client.ts**: Axios instance with X-Auth-Token authentication, auto-401 redirect, response normalization utilities
- **auth.ts**: Two auth flows: (1) Admin login via `POST /rest/api/login` (JSON), (2) Corporate 2FA via `POST /client/authenticate.json` + `POST /client/verifyCode.json` (FormData). Token management with dual-storage (rememberMe → localStorage, default → sessionStorage)
- **endpoints/{domain}.ts**: Domain-specific API functions (invoices, bills, vendors, clients, ledger, corporate, reports, settings, domainData). **Note:** `payments` feature has no dedicated endpoint file — uses bill/voucher endpoints
- **endpoints/email.ts**: Email service for sending invoices/bills/reports with PDF attachments
- **endpoints/registration.ts**: Tenant registration (uses `/account/*` proxy, not `/rest/*`)
- **endpoints/clients.ts**: Client + AccountServices APIs (invoices reference `accountServices.id` as FK, client metadata from `Client` entity)
- **endpoints/domainData.ts**: Shared domain data lookups — tax rates and payment terms are **hardcoded** (no backend endpoint); service descriptions from `/rest/serviceDescription/index.json`
- **endpoints/settings.ts**: 6 sub-APIs: `agentApi` (staff CRUD), `accountBankDetailsApi` (bank accounts), `accountPersonApi` (directors/signatories), `rolesApi` (`/sbRole/index.json`), `banksApi` (`/bank/index.json`), `accountSettingsApi` (`/account/current.json`)

Key patterns:
- Backend uses `application/json` content type (migrated from form-urlencoded 2026-01). **Exception:** OTP endpoints (`/client/authenticate.json`, `/client/verifyCode.json`) still use FormData
- Foreign keys: Use nested objects `{ vendor: { id: "uuid" } }` not `vendor.id`
- Registration endpoints go through `/account/*` proxy which injects `Api-Authorization` header
- Backend identifies the app via the `Api-Authorization` header injected by the proxy (ApiAuthenticatorInterceptor resolves the ApiConsumer name)
- **CSRF tokens required** for all POST/PUT/DELETE — see CSRF flow below
- **Client vs AccountServices**: Invoices reference `accountServices.id` as FK; use `Client` entity (`/rest/client/index.json`) for dropdown display, save `accountServices.id` as the FK value
- **Token storage caveat**: `client.ts` request interceptor (line 42) reads auth token from `localStorage` only. When `rememberMe=false`, the token is in `sessionStorage`. Use `getAccessToken()` from `auth.ts` for proper dual-storage reads

### CSRF Token Flow (CRITICAL for mutations)
All create/update/delete operations require a CSRF token from the backend:
```typescript
// 1. Fetch CSRF token (for new entity)
const csrf = await getCsrfToken('vendor'); // GET /rest/vendor/create.json

// 2. Include in request body
await apiClient.post('/vendor/save.json', {
  name: 'Acme Corp',
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});

// For updates, use getCsrfTokenForEdit(controller, id) instead
const csrf = await getCsrfTokenForEdit('vendor', vendorId); // GET /rest/vendor/edit/{id}.json
```
Without CSRF token, POST returns 302 redirect (not JSON error).

### Response Normalization (`src/api/client.ts`)
Backend can return certain fields as either objects or arrays (depending on count). Use these utilities:
```typescript
import { normalizeToArray, normalizeToObject, normalizeClientAccountResponse } from '../api/client';

// normalizeToArray: Ensures value is always an array
const services = normalizeToArray(response.accountServices);
// [] if null/undefined, [item] if object, array if already array

// normalizeToObject: Ensures value is an object (first item if array)
const individual = normalizeToObject(response.individual);
// null if empty, first item if array, object if already object

// normalizeClientAccountResponse: Normalizes common fields in one call
const normalized = normalizeClientAccountResponse(response.data);
// Handles: accountServices (→array), portfolioAccountServicesList (→array), individual (→object)
```

### Runtime Validation (`src/schemas/`)
Optional Zod schemas for API response validation:
- **base.ts**: Base entity, FK reference, enum schemas
- **domains.ts**: Domain-specific schemas (Vendor, Invoice, Bill, etc.)
- **validate.ts**: `validateResponse()`, `validateArray()`, `safeValidate()` utilities

Validation behavior:
- **Development**: Logs error + throws (catches issues early)
- **Production**: Logs error only (app continues working)

### State Management (`src/stores/`)
Zustand stores with persistence:
- **authStore**: Authentication state, token validation, remember-me support, `setAuthenticated()` for OTP flow
- **uiStore**: Dark mode, sidebar state
- **accountStore**: Tenant settings (currency, company info). Exports currency utilities:
  - Hooks: `useCurrencySymbol()`, `useFormatCurrency()`, `useCurrencyConfig()`
  - Non-React: `formatCurrency(amount)`, `getCurrencySymbol()`
  - Supports 12 currencies (USD, GHS, GBP, EUR, NGN, KES, ZAR, XOF, XAF, TZS, UGX, RWF)

### Hooks (`src/hooks/`)
- **usePdf**: Frontend PDF generation using html2pdf.js for invoices, bills, reports (templates in `src/utils/pdf/templates.ts`)
- **useEmailSend**: Combines PDF generation with email API sending
- **useDashboardStats**: Dashboard metrics and data
- **useLedgerAccounts**: Chart of accounts queries
- **useTransactions**: Ledger transaction queries

### Type Definitions (`src/types/`)
All domain types mirror soupmarkets-web Grails domain classes:
- **`index.ts`**: `BaseEntity`, `PaginatedResponse<T>`, and domain types: `Invoice`, `Bill`, `Vendor`, `Corporate`, `LedgerAccount`, etc.
- **`settings.ts`**: `Agent`, `AgentFormData`, `AccountBankDetails`, `AccountPerson`, `AccountSettings`, `SbRole`, `Bank`, `SOUPFINANCE_ROLES` constants, `SOUPFINANCE_ROLE_LABELS` mapping

### Routing (`src/App.tsx`)
- `ProtectedRoute`: Requires authentication, validates token on mount, shows loading during `isInitialized` check
- `PublicRoute`: Redirects to dashboard if already authenticated, waits for initialization
- Routes follow REST conventions: `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit`
- Accounting routes use type-based URLs: `/accounting/voucher/payment`, `/accounting/voucher/receipt`, `/accounting/journal-entry/:id`
- Onboarding routes: `/onboarding/company`, `/onboarding/directors`, `/onboarding/documents`, `/onboarding/status`
- Public (unauthenticated) routes: `/login`, `/register`, `/verify`, `/confirm-email`, `/resend-confirmation`, `/forgot-password`, `/reset-password`

## Code Quality

### ESLint (Flat Config)
- Config: `eslint.config.js` (ESLint v9 flat format)
- Ignores: `dist`, `coverage`, `storybook-static`
- Relaxed rules for tests: `@typescript-eslint/no-explicit-any` → warn, unused vars with `_` prefix allowed
- E2E tests: `react-hooks/rules-of-hooks` off (Playwright fixtures aren't React)

### Vitest Config
- Environment: `jsdom` with globals enabled
- Setup file: `src/test/setup.ts` (mocks axios globally, localStorage, window.location)
- Coverage: V8 provider, HTML + JSON + text reporters
- Mocks reset before each test (`vi.clearAllMocks()`), restored after (`vi.restoreAllMocks()`)

## Testing Patterns

### Unit/Integration Tests (Vitest + React Testing Library)
```typescript
// Mock API at module level
vi.mock('../../../api/endpoints/invoices', () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
}));

// Mock hooks when needed
vi.mock('../../../hooks', () => ({
  usePdf: () => ({ generateInvoice: vi.fn(), isGenerating: false }),
  useEmailSend: () => ({ sendInvoice: vi.fn(), isSending: false }),
}));

// Render with providers
render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <InvoiceListPage />
    </MemoryRouter>
  </QueryClientProvider>
);
```

### E2E Tests (Playwright) - Dual Mode
Tests support both mock and real backend modes:
```typescript
import { mockLoginApi, getTestUsers, isLxcMode } from './fixtures';

// Skip mock-only tests in LXC mode
test.skip(isLxcMode(), 'Mock-only test: skipped in LXC mode');

// Use mode-appropriate test users
const testUsers = getTestUsers();
await mockLoginApi(page, true, testUsers.admin);
```

### E2E Integration Tests (Numbered + Feature-based)
Integration tests in `e2e/integration/` run against the real LXC backend (serial, `workers: 1`):

**Numbered (CRUD order, run first):**
```
01-auth.integration.spec.ts       # Login/auth must run first
02-vendors.integration.spec.ts    # Vendor CRUD
03-invoices.integration.spec.ts   # Invoice CRUD (may need vendors)
04-bills.integration.spec.ts      # Bill CRUD
05-payments.integration.spec.ts   # Payment recording
```

**Feature-based (additional coverage):**
```
accounting.integration.spec.ts    # Accounting/voucher workflows
api-health.integration.spec.ts   # Backend health checks
auth.integration.spec.ts         # Extended auth scenarios
bills.integration.spec.ts        # Bill page tests
dashboard.integration.spec.ts    # Dashboard data tests
invoices.integration.spec.ts     # Invoice page tests
ledger.integration.spec.ts       # Chart of accounts, transactions
reports.integration.spec.ts      # Finance reports
settings.integration.spec.ts     # Settings pages
```

Use `backendTestUsers` from `e2e/fixtures.ts` for credentials. **768 unit tests** across 26 test files (2026-02-07).

### Playwright Config Inventory

| Config | Port | Backend | Use Case |
|--------|------|---------|----------|
| `playwright.config.ts` | 5180 | Mocked routes | Default E2E, `npm run test:e2e` |
| `playwright.lxc.config.ts` | 5180 | Real LXC backend | `npm run test:e2e:lxc`, serial workers |
| `playwright.integration.config.ts` | 5181 | Real LXC backend | Dedicated integration, separate report dir |

### E2E Token Retrieval (CRITICAL)
The auth store uses **dual-storage** - ALWAYS check both:
```typescript
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}
```
- `rememberMe=true` → localStorage
- `rememberMe=false` (DEFAULT) → sessionStorage

### E2E Session Handling
Backend sessions can expire during tests. Check before asserting:
```typescript
const isLoginPage = await page.getByText(/session expired|sign in|welcome back/i)
  .first().isVisible({ timeout: 3000 }).catch(() => false);
if (isLoginPage) { console.log('Session expired'); return; }
```

### E2E Form Element Types
Pay attention to form element types when writing E2E tests:
```typescript
// Input fields - use .fill()
await page.getByTestId('bill-item-description-0').fill('Office supplies');

// Select dropdowns - use .selectOption()
await page.getByTestId('bill-item-taxRate-0').selectOption('10');

// Currency displays - include thousand separators
await expect(page.locator('text=$25,000.00')).toBeVisible(); // NOT $25000.00
```

## Key Conventions

### Documentation & Planning

| Rule | Why |
|------|-----|
| **All plans in `plans/`** | Implementation plans (frontend and backend) go in `../plans/` |
| **Backend plans also in backend repo** | Backend-specific (Grails) change plans also go in `soupmarkets-web/docs/` |
| **Cross-project references** | If a plan spans both, create in backend repo and reference from `plans/` |

### Git Operations

| Rule | Why |
|------|-----|
| **Only commit/push this repo** | When working in soupfinance-web, never commit or push changes to other projects (e.g., soupmarkets-web) |
| **Ask before cross-repo commits** | If backend changes are needed, inform the user but let them handle commits in other repos |

### Data Test IDs
All interactive elements have `data-testid` attributes for E2E testing:
- Page containers: `{feature}-page`, `{feature}-list-page`
- Forms: `{feature}-form`, `{feature}-submit-button`
- Tables: `{feature}-table`, `{feature}-row-{id}`

### Form Handling
React Hook Form with Zod validation:
```typescript
const schema = z.object({ ... });
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
```

### API Endpoints
Backend is soupmarkets-web (Grails). Endpoints follow pattern:
```
GET    /rest/{domain}/index.json      # List (paginated)
GET    /rest/{domain}/show/{id}.json  # Read
GET    /rest/{domain}/create.json     # Get CSRF token (for new)
GET    /rest/{domain}/edit/{id}.json  # Get CSRF token (for update)
POST   /rest/{domain}/save.json       # Create (requires CSRF)
PUT    /rest/{domain}/update/{id}.json # Update (requires CSRF)
DELETE /rest/{domain}/delete/{id}.json # Delete/soft-delete (requires CSRF)
```
Some controllers have module prefixes: `/rest/finance/bill/*`, `/rest/trading/vendor/*`, `/rest/kyc/corporate/*`

### Styling (Tailwind CSS v4)
Tailwind v4 uses the Vite plugin (`@tailwindcss/vite`) — there is **no `tailwind.config.js`**. Custom tokens are defined via `@theme` in `src/index.css`:
- Colors: `primary`, `background-light/dark`, `surface-light/dark`, `text-light/dark`, `border-light/dark`, `danger`, `success`, `warning`, `info`
- Font: `--font-display: Manrope` (Google Fonts, loaded in `index.css`)
- Dark mode: `dark:` prefix classes (toggled via `html.dark` class)
- Icons: Material Symbols Outlined (`<span className="material-symbols-outlined">icon_name</span>`, use `.fill` class for filled variant)

### Internationalization (i18n)
4 languages (`en`, `de`, `fr`, `nl`), 12 namespaces in `src/i18n/locales/{lang}/`:

`common` · `navigation` · `auth` · `dashboard` · `invoices` · `bills` · `payments` · `vendors` · `ledger` · `accounting` · `reports` · `corporate`

- Language detection: `i18next-browser-languagedetector` → localStorage key `soupfinance_language`
- Fallback: English (`en`)
- When adding features: add keys to **all 4** language files in the corresponding namespace

## Deployment

### Production Server
- **Domain**: app.soupfinance.com (NOT www.soupfinance.com, that's the landing page)
- **Server**: 65.20.112.224
- **SSH Key**: `~/.ssh/crypttransact_rsa` (required, NOT id_rsa or daptordarattler_rsa)
- **Deploy Dir**: /var/www/soupfinance

### Deploy Commands
```bash
# Frontend deployment
./deploy/deploy-to-production.sh

# Manual SSH access
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224
```

### Architecture
```
Client -> Cloudflare (DNS/SSL) -> Apache (65.20.112.224) -> Static files
                                                        -> /rest/* proxy to tas.soupmarkets.com
                                                        -> /account/* proxy to tas.soupmarkets.com
```

Apache injects `Api-Authorization: Basic {credentials}` header for all proxied requests.

## Port Configuration

| Service | Port | Notes |
|---------|------|-------|
| Vite dev server | 5173 | Default development |
| E2E tests (mock + LXC) | 5180 | Dedicated for Playwright |
| E2E integration tests | 5181 | `playwright.integration.config.ts` |
| Storybook | 6006 | Component documentation |
| LXC Backend | 9090 | Grails backend proxy |

## Domain Architecture

SoupFinance uses strict domain separation:

| Domain | Purpose | Content |
|--------|---------|---------|
| `www.soupfinance.com` | Marketing | Static HTML landing page |
| `app.soupfinance.com` | Application | React SPA (this project) |

**Important**: The landing page (`soupfinance-landing/`) is a separate project. Never add login forms to the landing page.

## Proxy Configuration

The Vite dev server (and production Apache) proxies API requests and injects authentication:

| Path | Target | Headers Injected |
|------|--------|------------------|
| `/rest/*` | Backend (Grails) | `Api-Authorization` (API consumer credentials) |
| `^/account/` | Backend (Grails) | `Api-Authorization` (for tenant registration) |
| `/client/*` | Backend (Grails) | `Api-Authorization` (public client APIs) |

### Vite Proxy Regex Patterns (IMPORTANT)
Vite proxy uses **prefix matching** by default. Use regex patterns when there are route conflicts:

```typescript
// ❌ WRONG: /account matches /accounting/* frontend routes
'/account': proxyConfig,

// ✅ CORRECT: Use regex to only match /account/ API paths
'^/account/': proxyConfig,
```

This prevents the proxy from intercepting frontend routes like `/accounting/transactions`.

### API Consumer Credentials

| Environment | Location | Notes |
|-------------|----------|-------|
| **Development** | `.env.lxc.local` (git-ignored) | Copy from `.env.lxc.local.example` |
| **Production** | Server Apache config | `/etc/apache2/sites-available/app-soupfinance-com.conf` |

**NEVER commit credentials to the repo.** Development credentials go in `.env.lxc.local` which is git-ignored via `*.local` pattern.

## LXC Backend Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login returns 401 but credentials are correct | Stale MariaDB connection pool | `lxc exec soupfinance-backend -- systemctl restart soupmarkets.service` |
| ALL API requests return 401 | Missing ApiConsumer record in DB | Insert `soupfinance-web` into `api_consumer` table with secret matching `.env.lxc.local` |
| Backend returns 302 instead of JSON | Missing CSRF token in POST/PUT request | Fetch CSRF token via `getCsrfToken()` first |
| Backend logs show `Connection is closed` | MariaDB connection pool exhausted | Restart backend service |

**LXC Database:** `soupbroker_seed_source` on `10.115.213.114:3306`, user `soupbroker` / password `soupbroker`

**Check backend health:**
```bash
lxc exec soupfinance-backend -- systemctl status soupmarkets.service
lxc exec soupfinance-backend -- journalctl -u soupmarkets.service -n 30
```

## Related Projects

| Project | Location | Purpose |
|---------|----------|---------|
| **soupmarkets-web** | `../../../soupmarkets-web` | Grails backend (tas.soupmarkets.com) |
| **soupfinance-landing** | `../soupfinance-landing` | Marketing site (www.soupfinance.com) |

## Frontend Error Logging

`frontendLogger` (`src/utils/frontendLogger.ts`) captures console errors, unhandled JS errors, and promise rejections. Errors are batched and sent to `/rest/frontendLog/batch.json` with `[SOUPFINANCE]` tag. Initialized in `App.tsx` on mount. The `ErrorBoundary` component wraps the entire app to catch React rendering errors.

## Related Documentation

| Document | Purpose |
|----------|---------|
| **[../plans/](../plans/)** | Implementation plans and backend change requests |
| **[../prd/](../prd/)** | Product Requirements Documents (see `../PRD.md` for index) |
| **[../docs/USER-JOURNEYS.md](../docs/USER-JOURNEYS.md)** | User journey documentation |
