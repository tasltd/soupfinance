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
npm run test:e2e:lxc     # Run against real LXC backend
npm run test:e2e:lxc:integration  # Integration tests only

# Deployment
./deploy/deploy-to-production.sh   # Deploy to app.soupfinance.com
```

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
- **client.ts**: Axios instance with X-Auth-Token authentication, auto-401 redirect
- **auth.ts**: Login/logout, token management, OTP verification
- **endpoints/{domain}.ts**: Domain-specific API functions (invoices, bills, vendors, etc.)
- **endpoints/email.ts**: Email service for sending invoices/bills/reports with PDF attachments
- **endpoints/registration.ts**: Tenant registration (uses `/account/*` proxy, not `/rest/*`)

Key patterns:
- Backend uses `application/json` content type (migrated from form-urlencoded 2026-01)
- Foreign keys: Use nested objects `{ vendor: { id: "uuid" } }` not `vendor.id`
- Registration endpoints go through `/account/*` proxy which injects `Api-Authorization` header

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
- **authStore**: Authentication state, token validation, remember-me support
- **uiStore**: Dark mode, sidebar state
- **accountStore**: Tenant settings (currency, company info)

### Hooks (`src/hooks/`)
- **usePdf**: Frontend PDF generation using html2pdf.js for invoices, bills, reports
- **useEmailSend**: Combines PDF generation with email API sending
- **useDashboardStats**: Dashboard metrics and data
- **useLedgerAccounts**: Chart of accounts queries
- **useTransactions**: Ledger transaction queries

### Type Definitions (`src/types/index.ts`)
All domain types mirror soupmarkets-web Grails domain classes:
- `BaseEntity`: Common fields (id, archived, dateCreated, tenantId)
- `PaginatedResponse<T>`: Standard pagination wrapper
- Domain types: `Invoice`, `Bill`, `Vendor`, `Corporate`, `LedgerAccount`, etc.

### Routing (`src/App.tsx`)
- `ProtectedRoute`: Requires authentication, validates token on mount
- `PublicRoute`: Redirects to dashboard if already authenticated
- Routes follow REST conventions: `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit`

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

## Key Conventions

### Documentation & Planning

| Rule | Why |
|------|-----|
| **Backend plans in backend repo** | Put implementation plans for backend (Grails) changes in `soupmarkets-web/docs/PLAN-*.md`, not here |
| **Frontend plans here** | Frontend-specific plans go in `docs/PLAN-*.md` in this repo |
| **Cross-project references** | If a plan spans both, create in backend repo and reference from frontend |

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
/rest/{domain}/index.json      # List (paginated)
/rest/{domain}/show/{id}.json  # Read
/rest/{domain}/save.json       # Create
/rest/{domain}/update/{id}.json # Update
/rest/{domain}/delete/{id}.json # Delete (soft)
```

### Styling
Tailwind CSS v4 with custom design tokens:
- Colors: `primary`, `text-light/dark`, `surface-light/dark`, `border-light/dark`
- Dark mode: `dark:` prefix classes
- Icons: Material Symbols (`<span className="material-symbols-outlined">icon_name</span>`)

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
| E2E tests | 5180 | Dedicated for Playwright |
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
| `/account/*` | Backend (Grails) | `Api-Authorization` (for tenant registration) |
| `/client/*` | Backend (Grails) | `Api-Authorization` (public client APIs) |

### API Consumer Credentials

| Environment | Location | Notes |
|-------------|----------|-------|
| **Development** | `.env.lxc.local` (git-ignored) | Copy from `.env.lxc.local.example` |
| **Production** | Server Apache config | `/etc/apache2/sites-available/app-soupfinance-com.conf` |

**NEVER commit credentials to the repo.** Development credentials go in `.env.lxc.local` which is git-ignored via `*.local` pattern.

## Related Projects

| Project | Location | Purpose |
|---------|----------|---------|
| **soupmarkets-web** | `../../../soupmarkets-web` | Grails backend (tas.soupmarkets.com) |
| **soupfinance-landing** | `../soupfinance-landing` | Marketing site (www.soupfinance.com) |

## Documentation

| Document | Purpose |
|----------|---------|
| **[docs/api-contract-schema.md](docs/api-contract-schema.md)** | API types, structure interceptor, Zod schemas |
| **[docs/PLAN-api-consumer-email-confirmation.md](docs/PLAN-api-consumer-email-confirmation.md)** | Email confirmation flow implementation |
| **[docs/PLAN-corporate-registration-frontend.md](docs/PLAN-corporate-registration-frontend.md)** | Corporate registration UI plan |
