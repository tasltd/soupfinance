# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

| Task | Command |
|------|---------|
| Get issues | `./scripts/get-issues.sh --project SOUPFINANCE --markdown` |
| Dev server | `cd soupfinance-web && npm run dev` |
| Unit tests | `cd soupfinance-web && npm run test:run` |
| E2E tests | `cd soupfinance-web && npm run test:e2e` |
| Storybook | `cd soupfinance-web && npm run storybook` |
| Start backend | `cd backend && ./tomcat-control.sh start` |

## Project Overview

**SoupFinance** is a corporate accounting/invoicing platform (React frontend + Grails backend). Part of the Soupmarkets ecosystem.

| Component | Purpose |
|-----------|---------|
| `soupfinance-web/` | React 19 + TypeScript + Vite 7 + TailwindCSS v4 (main app) |
| `soupfinance-landing/` | Static HTML marketing site for www.soupfinance.com |
| `backend/` | LXC container with Grails WAR for local development |
| `soupfinance-designs/` | HTML mockups (114 screens) - design reference only |

## Tenant Architecture (CRITICAL)

**Tenant-per-Account model:** Each customer gets their own `Account` (not Corporate entities in a shared tenant).

| Flow | Endpoint | Notes |
|------|----------|-------|
| Registration | `POST /account/register.json` | Creates Account + Agent + SbUser |
| Email Confirm | `POST /account/confirmEmail.json` | Sets password, enables user |
| Invoice Clients | `/rest/invoiceClient/*` | NOT `/rest/client/*` (investment clients) |

**Business Types:** TRADING (inventory/COGS) or SERVICES (labor expenses, no inventory)

---

## Critical Rules (MUST READ)

| Rule | Location | Summary |
|------|----------|---------|
| **Tenant Architecture** | [plans/soupfinance-tenant-architecture-refactor.md](plans/soupfinance-tenant-architecture-refactor.md) | Tenant-per-Account: Registration creates new `Account`, NOT Corporate |
| **Domain Architecture** | [.claude/rules/soupfinance-domain-architecture.md](.claude/rules/soupfinance-domain-architecture.md) | `www.soupfinance.com` = landing (NO login), `app.soupfinance.com` = React app |
| **Backend Tenant** | [.claude/rules/soupfinance-backend-tenant.md](.claude/rules/soupfinance-backend-tenant.md) | Uses TAS tenant at `tas.soupmarkets.com`, registration via `/account/*` |
| **Backend Changes** | [.claude/rules/backend-changes-workflow.md](.claude/rules/backend-changes-workflow.md) | Do NOT modify backend directly; create plans in `.claude/plans/` |
| **Gradle Concurrency** | [.claude/rules/gradle-concurrent-tasks.md](.claude/rules/gradle-concurrent-tasks.md) | NEVER run concurrent Gradle tasks in same project |
| **Port Configuration** | [.claude/rules/port-configuration.md](.claude/rules/port-configuration.md) | Vite 5173, E2E 5180, Storybook 6006, Backend 9090 |
| **Design System** | [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) | Tailwind v4 tokens, Manrope font, Material Symbols icons |
| **API JSON Only** | [.claude/rules/soupfinance-api-json.md](.claude/rules/soupfinance-api-json.md) | Use `application/json` for all requests, NOT form-urlencoded |
| **E2E Testing** | [.claude/rules/e2e-testing-patterns.md](.claude/rules/e2e-testing-patterns.md) | Token from sessionStorage (not localStorage), dual-storage strategy |
| **Deployment** | [.claude/rules/soupfinance-deployment.md](.claude/rules/soupfinance-deployment.md) | SSH key `crypttransact_rsa` required, NOT id_rsa |
| **Deployment Restrictions** | [.claude/rules/deployment-restrictions.md](.claude/rules/deployment-restrictions.md) | **NEVER** deploy to Soupmarkets prod IPs; only soupfinance frontend/landing |
| **Cloudflare SSL** | [.claude/rules/cloudflare-ssl-configuration.md](.claude/rules/cloudflare-ssl-configuration.md) | **CRITICAL**: Apache MUST have SSL VirtualHost on port 443 for Cloudflare |
| **Server VHosts** | [.claude/rules/production-server-vhosts.md](.claude/rules/production-server-vhosts.md) | All Apache VHost configs for 65.20.112.224, proxy routes, SSL certs |

## Quick Commands

### React App (soupfinance-web/)

```bash
cd soupfinance-web

# Development
npm install && npm run dev              # Start dev server (port 5173, mock/no backend)
npm run dev:lxc                         # Dev against LXC backend (uses .env.lxc)
npm run build                           # Production build (runs tsc -b first)
npm run preview                         # Preview production build locally
npm run lint                            # ESLint

# Unit/Integration Tests (Vitest)
npm run test                            # Watch mode
npm run test:run                        # CI mode
npm run test:coverage                   # With coverage report
npx vitest run src/api/__tests__/client.test.ts    # Single file
npx vitest run -t "should attach Bearer token"    # By name

# E2E Tests (Playwright) - port 5180
npm run test:e2e                        # Headless with mocks
npm run test:e2e:headed                 # With browser UI
npm run test:e2e:ui                     # Interactive Playwright UI
npm run test:e2e -- e2e/auth.spec.ts    # Single file

# E2E against LXC backend (real API, no mocks)
npm run test:e2e:lxc                    # Headless (integration tests only)
npm run test:e2e:lxc:headed             # With browser UI
npm run test:e2e:lxc:all                # ALL tests against LXC (including mock tests)
npm run test:e2e:report                 # View last mock E2E report
npm run test:e2e:lxc:report             # View last LXC E2E report

# Storybook (component docs)
npm run storybook                       # Port 6006
npm run build-storybook                 # Build static docs
```

### Local Backend (LXC)

```bash
cd backend
./tomcat-control.sh start               # Start backend (starts LXC containers if needed)
./tomcat-control.sh status              # Check status, get container IP (10.115.213.183)
./tomcat-control.sh logs                # View Tomcat logs
./tomcat-control.sh stop                # Stop when done
```

**Deploy new WAR** (requires soupmarkets-web repo):
```bash
cd /path/to/soupmarkets-web
source env-variables.sh && ./gradlew assembleDeployToSoupfinance
```

**Database** (LXC MariaDB): Host `soupmarkets-mariadb`, DB `soupbroker_soupfinance`, User `soupbroker`

### Landing Page (soupfinance-landing/)

```bash
cd soupfinance-landing
python3 -m http.server 8000             # Preview locally
./deploy-landing.sh                     # Deploy to production
```

## Architecture

### React App Structure

```
soupfinance-web/src/
├── api/                    # Axios client + endpoint modules
│   ├── client.ts          # Base instance + toFormData/toQueryString helpers
│   └── endpoints/         # Feature-specific (invoices, bills, ledger, vendors, corporate, reports)
├── components/
│   ├── layout/            # MainLayout, AuthLayout, SideNav, TopNav
│   ├── forms/             # Input, Select, Textarea, Checkbox, Radio, DatePicker
│   ├── feedback/          # AlertBanner, Spinner, Toast, Tooltip
│   └── tables/            # Data table components
├── features/              # Page components by domain
│   ├── auth/, dashboard/, invoices/, bills/, vendors/, payments/
│   ├── ledger/, accounting/, reports/
│   ├── clients/           # NEW: Individual/Corporate client management
│   └── corporate/         # Company profile management
├── i18n/                  # 4 languages (en, de, fr, nl), 12 namespaces
├── stores/                # Zustand (authStore, uiStore)
├── types/                 # TypeScript interfaces (mirrors Grails domains)
└── App.tsx                # Routes + providers
```

**Key Tech:** Zustand (state) · TanStack Query (data) · React Hook Form + Zod (forms) · Recharts (charts) · Axios (HTTP) · Vitest + Playwright (tests) · Storybook 10 (docs)

**API Endpoint Modules** (`src/api/endpoints/`): `bills.ts`, `clients.ts`, `corporate.ts`, `domainData.ts`, `email.ts`, `invoices.ts`, `ledger.ts`, `registration.ts`, `reports.ts`, `settings.ts`, `vendors.ts`

### API Patterns (CRITICAL)

| Pattern | Detail |
|---------|--------|
| **Auth Header** | `X-Auth-Token: {token}` (NOT Bearer) |
| **Login** | POST `/rest/api/login` with JSON body |
| **Data Content-Type** | `application/json` for all requests |
| **Token Validation** | GET `/rest/user/current.json` on app mount |
| **Invoice Clients** | `/rest/invoiceClient/*` (NOT `/rest/client/*` which is for investment clients) |
| **CSRF Token** | **REQUIRED** for all POST/PUT/DELETE - see pattern below |

#### CSRF Token Pattern (REQUIRED for POST/PUT/DELETE)

The Grails backend uses `withForm {}` CSRF protection. The `TokenWithFormInterceptor` handles this for all `create` actions.

**How it works:**
1. Call `GET /rest/{controller}/create.json` - interceptor adds CSRF token to response
2. Response includes `SYNCHRONIZER_TOKEN` and `SYNCHRONIZER_URI` fields
3. Include both in subsequent POST/PUT/DELETE requests in JSON body

**Example Implementation:**
```typescript
// Step 1: Get CSRF token from create endpoint
const createResponse = await api.get('/rest/vendor/create.json');
const csrfToken = createResponse.data.vendor?.SYNCHRONIZER_TOKEN;
const csrfUri = createResponse.data.vendor?.SYNCHRONIZER_URI;

// Step 2: Include CSRF token in JSON body
const saveResponse = await api.post('/rest/vendor/save.json', {
  name: 'Acme Corp',
  symbol: 'ACME',
  SYNCHRONIZER_TOKEN: csrfToken,
  SYNCHRONIZER_URI: csrfUri,
});
```

**Key Points:**
- The CSRF token is per-session and per-URI
- Without the token, POST returns 302 redirect (not JSON)
- The interceptor matches `action: ~/(create)/` pattern
- For updates: call `edit.json` first to get token for update operations

#### File/Image Upload Pattern

The backend `SoupBrokerFileUtilityService` accepts files in three formats for any `SoupBrokerFile` property:

| Format | How to Send | Example |
|--------|-------------|---------|
| **Base64 String** | Send base64-encoded file data directly | `logo: "data:image/png;base64,iVBORw0KGgo..."` or just the base64 string |
| **Public URL** | Send a fully-qualified URL, backend downloads it | `logo: "https://example.com/logo.png"` |
| **MultipartFile** | Standard multipart form upload | `logoFile: <File object>` (requires multipart/form-data) |

**Example (Base64 in JSON):**
```typescript
// Send logo as base64 in JSON body
const response = await api.post('/rest/vendor/save.json', {
  name: 'Acme Corp',
  logo: base64EncodedImageString, // Service detects Base64.isBase64()
  SYNCHRONIZER_TOKEN: csrfToken,
  SYNCHRONIZER_URI: csrfUri,
});
```

**Example (Public URL in JSON):**
```typescript
// Backend will download from URL automatically
const response = await api.post('/rest/vendor/save.json', {
  name: 'Acme Corp',
  logo: 'https://cdn.example.com/company-logo.png', // Service validates URL
  SYNCHRONIZER_TOKEN: csrfToken,
  SYNCHRONIZER_URI: csrfUri,
});
```

**Example (Multipart File Upload):**
```typescript
// For actual file uploads, use FormData with multipart/form-data
const formData = new FormData();
formData.append('name', 'Acme Corp');
formData.append('logoFile', fileObject); // Note: {fieldName}File convention
formData.append('SYNCHRONIZER_TOKEN', csrfToken);
formData.append('SYNCHRONIZER_URI', csrfUri);

const response = await api.post('/rest/vendor/save.json', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
```

**Backend Service:** `grails-app/services/soupbroker/tools/SoupBrokerFileUtilityService.groovy`
- Auto-detects input type via `Base64.isBase64()` and `UrlValidator().isValid()`
- Compresses images via `imageCompressionService` (ImageMagick)
- Stores files via SFTP or local filesystem (with fallback)

**Proxy Configuration:** Vite proxies `/rest/*`, `/client/*`, and `/account/*` to backend (default `localhost:9090`, or `VITE_PROXY_TARGET` from `.env.lxc`).

**API Quirks:**
- `/rest/sbUser/index.json` requires `?sort=id` (default `dateCreated` sort not available for SbUser domain)
- Finance reports: Use `/rest/financeReports/*` (NOT `/rest/report/*` which returns 404)

#### Module-Prefixed Controllers

Some controllers have module prefixes in their URL paths:
```
/rest/finance/bill/*        /rest/finance/voucher/*
/rest/trading/vendor/*      /rest/kyc/corporate/*
```

Available modules: `trading`, `finance`, `funds`, `setting`, `tools`, `sales`, `kyc`, `clients`, `admin`, `staff`

### API Endpoint Status (LXC Backend)

**Working Endpoints:**
| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /rest/api/login` | ✅ 200 | Returns access_token |
| `GET /rest/user/current.json` | ✅ 200 | Returns current user |
| `GET /rest/invoice/index.json` | ✅ 200 | Returns invoice list |
| `GET /rest/vendor/index.json` | ✅ 200 | Returns vendor list |
| `GET /rest/ledgerAccount/index.json` | ✅ 200 | Returns account list |
| `GET /rest/ledgerAccount/balance.json` | ✅ 200 | Account balance |
| `GET /rest/ledgerTransaction/index.json` | ✅ 200 | Returns transactions |
| `GET /rest/financeReports/balanceSheet.json` | ✅ 200 | Returns balance sheet |
| `GET /rest/financeReports/agedPayables.json` | ✅ 200 | Returns AP aging |
| `GET /rest/voucher/index.json` | ✅ 200 | Returns voucher list |
| `GET /rest/financeReports/incomeStatement.json` | ✅ 200 | Returns P&L report |

**Frontend CSRF Token Implementation:**
All save endpoints in `src/api/endpoints/` now use `getCsrfToken()` and `getCsrfTokenForEdit()` helpers from `client.ts`:
- `vendors.ts`: `createVendor()`, `updateVendor()`
- `ledger.ts`: `createLedgerAccount()`, `updateLedgerAccount()`, `createLedgerTransaction()`, `createVoucher()`, `updateVoucher()`, `createJournalEntry()`
- `bills.ts`: `createBill()`, `updateBill()`, `addBillItem()`, `updateBillItem()`, `recordBillPayment()`
- `invoices.ts`: `createInvoice()`, `updateInvoice()`, `addInvoiceItem()`, `updateInvoiceItem()`, `recordInvoicePayment()`

**Known Issues (see [backend plan](../soupmarkets-web/plans/soupfinance-api-endpoint-fixes.md)):**
| Endpoint | Issue | Workaround |
|----------|-------|------------|
| `GET /rest/bill/index.json` | Returns 302 | Needs `Accept: application/json` header |
| `POST /rest/vendor/save.json` | Returns 302 without token | Use `getCsrfToken('vendor')` first |
| `POST /rest/ledgerAccount/save.json` | Returns 302 without token | Use `getCsrfToken('ledgerAccount')` first |

### Test Credentials (LXC Backend)

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| `test.admin` | `secret` | ROLE_ADMIN, ROLE_USER | Full admin access |
| `test.user` | `secret` | ROLE_USER | Minimal user access |
| `test.finance` | `secret` | ROLE_USER + Finance roles* | Finance CRUD testing |
| `soup.support` | `secret` | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |
| `admin` | `secret` | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |

*Finance roles: ROLE_INVOICE, ROLE_BILL, ROLE_LEDGER_TRANSACTION, ROLE_VENDOR, ROLE_FINANCE_REPORTS, ROLE_LEDGER_ACCOUNT, ROLE_VOUCHER

### Test Organization

```
soupfinance-web/
├── src/**/__tests__/           # Unit/integration (Vitest)
├── e2e/                        # E2E tests (Playwright)
│   ├── fixtures.ts             # authenticatedPage, mockApiResponse(), domain mocks
│   └── integration/            # LXC backend integration tests
├── playwright.config.ts        # Mock mode config (port 5180)
├── playwright.lxc.config.ts    # LXC backend config
└── playwright.integration.config.ts  # Integration-only config
```

**Important:**
- Axios is globally mocked in `src/test/setup.ts`
- E2E tests auto-start Vite dev server (see `playwright.config.ts`)
- Pages MUST fetch from API, never use mock data as fallback in production
- Use `isLxcMode()` from fixtures to conditionally skip mock-only tests

## Deployment

| Property | Value |
|----------|-------|
| Origin Server | 65.20.112.224 |
| Backend API | tas.soupmarkets.com (via Apache proxy) |
| Deploy Dir | /var/www/soupfinance |
| SSH Key | `~/.ssh/crypttransact_rsa` (NOT id_rsa) |

```bash
cd soupfinance-web && ./deploy/deploy-to-production.sh   # Deploy to app.soupfinance.com
```

**CRITICAL:** Sites only accessible via domain names, NEVER via direct IP.

### Logs

| Log | Path |
|-----|------|
| Frontend Apache | `65.20.112.224:/var/log/apache2/app.soupfinance.com-*.log` |
| Backend Tomcat | `140.82.32.141:/root/tomcat9078/logs/catalina.out` |

## Implementing Features

1. Check `soupfinance-designs/` for mockups
2. Use existing feature modules as templates (copy invoice patterns for new entities)
3. See [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) for design tokens (primary: `#f24a0d`, font: Manrope, icons: Material Symbols)
4. Include dark mode variants (`dark:` prefix)

## Git

| Remote | URL |
|--------|-----|
| origin | https://github.com/tasltd/soupfinance |
| gitlab | git@gitlab.com:tasltd/soupfinance.git |

Part of **Soupmarkets** ecosystem (see `../CLAUDE.md`).

**Note:** For detailed frontend development (API patterns, hooks, state management), see `soupfinance-web/CLAUDE.md`. For PRD and feature requirements, see `PRD.md` and `prd/` directory.
