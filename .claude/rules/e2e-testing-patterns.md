# E2E Testing Patterns for SoupFinance

## Grails REST API URL Format

The soupmarkets-web backend uses Grails URL mappings with **optional format extension**:

```
/rest/$controller/$action?/$id?(.$format)?
```

### Key Points:
1. **`.json` is optional** - Both `/rest/vendor/index` and `/rest/vendor/index.json` work
2. **Content negotiation** - Format can be specified via:
   - URL extension: `/rest/vendor/index.json`
   - Accept header: `Accept: application/json`
3. **The `respond` method** automatically handles JSON serialization

### Correct URL Patterns:
```
GET  /rest/{controller}/index.json         → List items
GET  /rest/{controller}/archived.json      → List archived items
GET  /rest/{controller}/show/{id}.json     → Show single item
POST /rest/{controller}/save.json          → Create item
PUT  /rest/{controller}/update/{id}.json   → Update item
DELETE /rest/{controller}/delete/{id}.json → Delete item
```

### Module-Prefixed Controllers:
Some controllers have a module prefix:
```
/rest/finance/bill/index.json
/rest/finance/voucher/index.json
/rest/trading/vendor/index.json
/rest/kyc/corporate/index.json
```

Modules: `trading`, `finance`, `funds`, `setting`, `tools`, `sales`, `kyc`, `clients`, `admin`, `staff`

---

## Token Retrieval (CRITICAL)

**Problem:** Login uses dual-storage strategy - `rememberMe=true` stores in localStorage, `rememberMe=false` (default) stores in sessionStorage.

**Solution:** Always check BOTH storages when retrieving auth token:

```typescript
// CORRECT - checks both storages
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

// WRONG - only checks localStorage (will fail if rememberMe=false)
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() => localStorage.getItem('access_token') || '');
}
```

## Test Modes

| Mode | Command | Backend | Auth Token Source |
|------|---------|---------|-------------------|
| Mock | `npm run test:e2e` | Mocked routes | N/A |
| LXC | `npm run test:e2e:lxc` | Real LXC backend (10.115.213.183:9090) | sessionStorage |
| LXC Integration | `npm run test:e2e:lxc:integration` | Real LXC backend | sessionStorage |

## API Endpoint Patterns

### Available Endpoints (200 response)
- `GET /rest/invoice/index.json` - List invoices
- `GET /rest/vendor/index.json` - List vendors (returns array)
- `GET /rest/ledgerAccount/index.json` - List ledger accounts
- `GET /rest/ledgerTransaction/index.json` - List transactions
- `GET /rest/user/current.json` - Current user info

### Redirecting Endpoints (302 response)
- `GET /rest/bill/index.json` - Redirects to generic show (use `maxRedirects: 0` to detect)
- `POST /rest/vendor/save.json` - May redirect to HTML form

### Report Endpoints (FinanceReportsController)
**WRONG:** `/rest/report/*` - This controller DOES NOT EXIST (returns 404)!
**CORRECT:** `/rest/financeReports/*`

Available report endpoints:
- `GET /rest/financeReports/trialBalance.json?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /rest/financeReports/incomeStatement.json?from=YYYY-MM-DD&to=YYYY-MM-DD` (P&L)
- `GET /rest/financeReports/balanceSheet.json?to=YYYY-MM-DD`
- `GET /rest/financeReports/accountBalances.json?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /rest/financeReports/agedReceivables.json?to=YYYY-MM-DD`
- `GET /rest/financeReports/agedPayables.json?to=YYYY-MM-DD`
- `GET /rest/financeReports/accountTransactions.json?from=YYYY-MM-DD&to=YYYY-MM-DD`

## Page Routes and Headings

| Route | Page Component | Expected Heading |
|-------|---------------|------------------|
| `/dashboard` | DashboardPage | "Dashboard" |
| `/invoices` | InvoiceListPage | "Invoices" |
| `/bills` | BillListPage | "Bills" or "Expenses" |
| `/vendors` | VendorListPage | "Vendors" |
| `/reports` | ReportsPage | "Reports" |
| `/settings` | SettingsLayout | "Settings" |
| `/settings/users` | UserListPage | (under Settings) |
| `/settings/account` | AccountSettingsPage | (under Settings) |
| `/settings/bank-accounts` | BankAccountListPage | (under Settings) |
| `/ledger` | LedgerPage | "Chart of Accounts" or "Ledger" |

**Note:** `/settings/company` and `/settings/profile` do NOT exist. Use `/settings/account` instead.

## Test User Credentials (LXC Backend)

```typescript
const backendTestUsers = {
  admin: {
    username: 'soup.support',
    password: 'secret',
    roles: ['ROLE_ADMIN', 'ROLE_ADMIN_ROOT', 'ROLE_USER', 'ROOT_ROOT'],
  },
};
```

## Common Test Patterns

### Wait for Page Load
```typescript
await page.goto('/vendors');
await page.waitForLoadState('networkidle');
await expect(page.getByRole('heading', { name: /vendor/i })).toBeVisible({ timeout: 15000 });
```

### Flexible Content Detection
```typescript
// Check for table OR empty state OR list container
const hasTable = await page.locator('table').isVisible().catch(() => false);
const hasEmptyState = await page.getByText(/no vendors/i).isVisible().catch(() => false);
const hasListPage = await page.locator('[data-testid="vendor-list-page"]').isVisible().catch(() => false);

expect(hasTable || hasEmptyState || hasListPage).toBeTruthy();
```

### Handle 302 Redirects
```typescript
const response = await page.request.get(`${API_BASE}/rest/bill/index.json`, {
  headers: { 'X-Auth-Token': token },
  maxRedirects: 0,  // Don't follow redirects
});

if (response.status() === 302) {
  console.log('Endpoint not available (redirects)');
  test.skip();
  return;
}
```

## Known Issues

1. **HTTPS Redirect Issue**: Backend may redirect to `https://localhost:9090` which fails. Use `maxRedirects: 0` to prevent.

2. **Voucher Endpoint**: `/rest/voucher/index.json` may not be available in all backend versions.

3. **Report Endpoints**: Use `/rest/financeReports/*` not `/rest/report/*` for finance reports.

4. **SbUser Sorting**: `/rest/sbUser/index.json` requires `?sort=id` parameter.
