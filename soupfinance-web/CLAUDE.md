# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run dev:lxc          # Start with LXC backend proxy

# Build & Lint
npm run build            # TypeScript check + Vite build
npm run lint             # ESLint check

# Testing - Unit/Integration (Vitest)
npm run test             # Watch mode
npm run test:run         # Single run
npm run test:run -- src/features/invoices/__tests__/InvoiceFormPage.test.tsx  # Single file

# Testing - E2E (Playwright)
npm run test:e2e         # Run with mocks (default)
npm run test:e2e:headed  # Run with browser UI
npm run test:e2e:lxc     # Run against real LXC backend
npm run test:e2e:lxc:integration  # Integration tests only

# Storybook
npm run storybook        # Start Storybook dev server
npm run build-storybook  # Build static Storybook
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

Key patterns:
- Backend uses `application/x-www-form-urlencoded` content type
- Use `toFormData()` helper for POST/PUT requests
- Nested objects with `id` are serialized as `{field}.id`

### State Management (`src/stores/`)
Zustand stores with persistence:
- **authStore**: Authentication state, token validation, remember-me support
- **uiStore**: Dark mode, sidebar state
- **accountStore**: Tenant settings (currency, company info)

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

// Setup mock returns per test
const mockListInvoices = vi.mocked(listInvoices);
mockListInvoices.mockResolvedValue([...]);

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

## Key Conventions

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
/rest/{domain}/list.json
/rest/{domain}/show/{id}.json
/rest/{domain}/save.json
/rest/{domain}/update/{id}.json
/rest/{domain}/delete/{id}.json
```

### Styling
Tailwind CSS v4 with custom design tokens:
- Colors: `primary`, `text-light/dark`, `surface-light/dark`, `border-light/dark`
- Dark mode: `dark:` prefix classes
- Icons: Material Symbols (`<span className="material-symbols-outlined">icon_name</span>`)
