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
# CRITICAL: The canonical Apache config is deploy/apache-soupfinance.conf
# Do NOT edit deploy/app-soupfinance-com.conf — it is NOT deployed
# See .claude/rules/soupfinance-deployment.md for full deployment rules
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

Features: `accounting` (vouchers, journal entries, transaction register), `auth`, `bills`, `clients`, `corporate` (KYC), `dashboard`, `invoices`, `ledger` (chart of accounts), `payments` (record payments against invoices/bills), `reports`, `settings`, `vendors`

### API Layer (`src/api/`)
- **client.ts**: Axios instance with X-Auth-Token authentication, auto-401 redirect, response normalization utilities
- **auth.ts**: Two auth flows: (1) Admin login via `POST /rest/api/login` (JSON), (2) Corporate 2FA via `POST /client/authenticate.json` + `POST /client/verifyCode.json` (FormData). Token management with dual-storage (rememberMe → localStorage, default → sessionStorage)
- **endpoints/{domain}.ts**: Domain-specific API functions (invoices, bills, vendors, clients, ledger, corporate, reports, settings, domainData). **Note:** `payments` feature has no dedicated endpoint file — uses bill/voucher endpoints
- **endpoints/email.ts**: Email service — `emailApi.sendInvoice()`, `sendBill()`, `sendReport()` with PDF attachments (base64-encoded Blobs)
- **endpoints/registration.ts**: Tenant registration (uses `/account/*` proxy, not `/rest/*`)
- **endpoints/clients.ts**: Client + AccountServices APIs (invoices reference `accountServices.id` as FK, client metadata from `Client` entity)
- **endpoints/ledger.ts**: Ledger accounts, transactions, vouchers (payment/receipt/deposit), journal entries (multi-line). CSRF only needed for POST/save; PUT/DELETE do not require CSRF
- **endpoints/domainData.ts**: Shared domain data lookups — tax rates and payment terms are **hardcoded** (no backend endpoint); service descriptions from `/rest/serviceDescription/index.json`; **payment methods** from `/rest/paymentMethod/index.json` (domain class, dynamic)
- **endpoints/settings.ts**: 6 sub-APIs: `agentApi` (staff CRUD), `accountBankDetailsApi` (bank accounts), `accountPersonApi` (directors/signatories), `rolesApi` (`/sbRole/index.json`), `banksApi` (`/bank/index.json`), `accountSettingsApi` (`/account/current.json`)

Key patterns:
- Backend uses `application/json` content type (migrated from form-urlencoded 2026-01). **Exception:** OTP endpoints (`/client/authenticate.json`, `/client/verifyCode.json`) still use FormData
- Foreign keys: Use nested objects `{ vendor: { id: "uuid" } }` not `vendor.id`
- Registration endpoints go through `/account/*` proxy which injects `Api-Authorization` header
- Backend identifies the app via the `Api-Authorization` header injected by the proxy (ApiAuthenticatorInterceptor resolves the ApiConsumer name)
- **CSRF tokens required** for POST (save) only — PUT (update) and DELETE do NOT need CSRF. See flow below
- **Client vs AccountServices**: Invoices reference `accountServices.id` as FK; use `Client` entity (`/rest/client/index.json`) for dropdown display. Resolution: `client.portfolioList[0].accountServices.id` (NOT `client.accountServices.id`)
- **Token storage**: `client.ts` request interceptor checks both `localStorage` and `sessionStorage` for auth token (dual-storage pattern)
- **PaymentMethod is a domain class FK** (`{ id, name, serialised?, class? }`), NOT a string enum. Use `usePaymentMethods()` hook for dropdowns. Send `paymentMethodId` (not object) in create requests. Display with `payment.paymentMethod?.name || '-'`

### CSRF Token Flow (CRITICAL for POST/save only)
Only POST (create/save) operations require a CSRF token. PUT (update) and DELETE do NOT:
```typescript
// 1. Fetch CSRF token (for new entity)
const csrf = await getCsrfToken('vendor'); // GET /rest/vendor/create.json

// 2. Pass CSRF as URL query params (Grails withForm reads from request params, not JSON body)
await apiClient.post(`/vendor/save.json?${csrfQueryString(csrf)}`, {
  name: 'Acme Corp',
});

// Updates do NOT need CSRF:
await apiClient.put(`/vendor/update/${id}.json`, { name: 'New Name', id });
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
- **useEmailSend**: Combines PDF generation with email API — `sendInvoice()`, `sendBill()`, `sendTrialBalance()`, `sendProfitLoss()`, `sendBalanceSheet()`, `sendAgingReport()`
- **useDashboardStats**: Dashboard metrics; uses `Promise.allSettled()` so new accounts show zeros not errors
- **useLedgerAccounts**: Chart of accounts queries with `getMockAccounts()` for tests
- **useTransactions**: Unified transaction register (journal entries + vouchers) with `UnifiedTransaction` type
- **usePaymentMethods**: Fetches `PaymentMethod` domain objects from `/rest/paymentMethod/index.json` (5-min staleTime)

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

Use `backendTestUsers` from `e2e/fixtures.ts` for credentials. **768 unit tests** across 26 test files. **326 mock E2E tests** (all passing, 2026-02-08). **159/170 integration tests** pass against LXC backend (6 failed: backend Hibernate proxy bug in vendor CRUD, 5 skipped). See `e2e/integration/INTEGRATION-TEST-RESULTS.md` for detailed results.

### Integration Test Patterns (CRITICAL)

These patterns are required for stable integration tests against the LXC backend:

```typescript
// 1. NEVER use networkidle — backend is too slow on seed DB (3145+ accounts)
await page.waitForLoadState('domcontentloaded');

// 2. Auth verification wait — page shows "Verifying authentication..." before content renders
await page.waitForFunction(
  () => !document.body.textContent?.includes('Verifying authentication'),
  { timeout: 20000 }
).catch(() => {});

// 3. Always maxRedirects: 0 on direct API calls — Grails redirects to https://localhost:9090
const response = await page.request.get(`${API_BASE}/rest/endpoint/index.json`, {
  headers: { 'X-Auth-Token': token },
  maxRedirects: 0,
});

// 4. Use remember-me in login helpers — stores token in localStorage (survives navigation)
const rememberCheckbox = page.getByTestId('login-remember-checkbox');
if (await rememberCheckbox.isVisible().catch(() => false)) {
  await rememberCheckbox.check();
}

// 5. Wrap API calls in try/catch — backend crashes from heavy report queries
async function safeApiGet(page, url, token, timeout = 30000) {
  try {
    return await page.request.get(url, {
      headers: { 'X-Auth-Token': token }, timeout, maxRedirects: 0,
    });
  } catch { return null; }
}
```

**Known backend issues:** Vendor CRUD has Hibernate proxy bug (6 test failures). PaymentMethod uses domain display names ("Bank Transfer") not enum values ("BANK_TRANSFER") — select by `{ label: 'Bank Transfer' }`. Restart backend between heavy report test batches.

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

### E2E Mock Data Patterns (CRITICAL)
Mock data MUST mirror Grails domain structure because `transformInvoice()` and similar functions process raw API responses:
```typescript
// Invoice mock must include invoiceItemList/invoicePaymentList for correct total computation
const mockInvoice = {
  id: 'inv-001', number: 10,
  accountServices: { id: 'as-001', class: 'soupbroker.kyc.AccountServices', serialised: 'Direct Account : Corporate(ABC Corp)' },
  invoiceItemList: [{ id: 'ii-1', quantity: 1, unitPrice: 5000.0 }],
  invoicePaymentList: [{ id: 'ip-1', amount: 2000.0 }],
};
// After transformInvoice(): totalAmount=5000, amountPaid=2000, amountDue=3000
```

Form pages need mocks for ALL API endpoints they call. If `page.goto` times out, check for unmocked endpoints:
- Invoice form: `/rest/client/index.json`, `/rest/serviceDescription/index.json`, `/rest/invoiceItem/index.json`
- Dashboard: `/rest/invoice/index.json`, `/rest/bill/index.json`
- Always mock `mockTokenValidationApi(page, true)` for auth + account settings (currency)

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
PUT    /rest/{domain}/update/{id}.json # Update (NO CSRF needed)
DELETE /rest/{domain}/delete/{id}.json # Delete/soft-delete (NO CSRF needed)
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
# Frontend deployment (builds, deploys files, updates Apache config, validates SPA routes)
./deploy/deploy-to-production.sh

# Manual SSH access
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224
```

### Canonical Apache Config (CRITICAL)

The deploy script uploads **`deploy/apache-soupfinance.conf`** to the server. This is the ONLY config file that matters. Do NOT edit `deploy/app-soupfinance-com.conf` — it is a stale copy.

All ProxyPass paths and RewriteCond exclusions MUST use trailing slashes:
- `ProxyPass /client/` (CORRECT) vs `ProxyPass /client` (WRONG — catches `/clients/new`)
- `RewriteCond !^/client/` (CORRECT) vs `RewriteCond !^/client` (WRONG)

See `.claude/rules/soupfinance-deployment.md` for full rules.

### Architecture
```
Client -> Cloudflare (DNS/SSL) -> Apache (65.20.112.224) -> Static files
                                                        -> /rest/* proxy to tas.soupmarkets.com
                                                        -> /account/* proxy to tas.soupmarkets.com
                                                        -> /client/* proxy to tas.soupmarkets.com
```

Apache injects `Api-Authorization: Basic {credentials}` header for all proxied requests. The deploy script validates SPA routes, API proxy, trailing slashes, and Api-Authorization presence after deployment, auto-rolling back on failure.

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
| Backend returns 302 instead of JSON | Missing CSRF token in POST request | Fetch CSRF token via `getCsrfToken()` first (only needed for POST/save) |
| Backend logs show `Connection is closed` | MariaDB connection pool exhausted | Restart backend service |
| `ENOSPC: System limit for number of file watchers reached` | inotify watcher limit too low | `sudo sysctl -w fs.inotify.max_user_watches=524288` or use `CHOKIDAR_USEPOLLING=true` |
| Vendor save fails on 2nd creation (500) | Hibernate PaymentMethod proxy two-session bug | Backend Issue #15 — needs fix in VendorController.save() |
| Bill endpoints return 500/403 | LazyInitializationException on billItemList | Backend Issue #1 — needs custom GSON template for Bill |
| Report queries crash backend (socket hang up) | Income statement on 3145+ accounts exhausts memory (~60s query) | Restart backend; use `safeApiGet` in tests; avoid concurrent heavy reports |
| Tests fail with ECONNREFUSED 127.0.0.1:9090 | Grails returns 302 redirect to `https://localhost:9090` | Use `maxRedirects: 0` on all direct API calls |
| Backend takes ~60-90s to start | Grails cold start with large seed DB | Wait for full startup: `curl -sf http://localhost:9090/rest/api/login` returns 405 when ready |

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
