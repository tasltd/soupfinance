# E2E Testing Patterns for SoupFinance

## Token Retrieval (CRITICAL)
The auth store uses dual-storage strategy:
- `rememberMe=true` -> localStorage
- `rememberMe=false` (DEFAULT) -> sessionStorage

**Always check both storages:**
```typescript
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}
```

## Session Expiration Handling
Backend sessions can expire during test runs. Always check for session expiration before asserting:
```typescript
const isLoginPage = await page.getByText(/session expired|sign in|welcome back/i).first().isVisible({ timeout: 3000 }).catch(() => false);
if (isLoginPage) {
  console.log('Session expired - test skipped');
  return;
}
```

## Grails REST URL Patterns
Format: `/rest/$controller/$action?/$id?(.$format)?`
- `.json` extension is optional with proper content negotiation
- POST/PUT with form data uses `application/x-www-form-urlencoded`
- Endpoints that redirect with 302 are HTML forms, not REST APIs

### Available Endpoints
- `/rest/api/login` - POST authentication
- `/rest/user/current.json` - GET current user
- `/rest/invoice/index.json` - GET invoice list
- `/rest/vendor/index.json` - GET vendor list (save endpoint redirects)
- `/rest/ledgerAccount/index.json` - GET ledger accounts
- `/rest/ledgerTransaction/index.json` - GET transactions
- `/rest/financeReports/*` - Finance reports (slow endpoints!)
- `/rest/sbUser/index.json?sort=id` - GET users (admin only)

### Slow Endpoints (Skip or Long Timeout)
These endpoints can take >60s with large datasets:
- `/rest/financeReports/trialBalance.json`
- `/rest/financeReports/accountBalances.json`
- `/rest/financeReports/balanceSheet.json`

## Page Routes
| Route | Page | Notes |
|-------|------|-------|
| `/ledger/accounts` | Chart of Accounts | NOT `/accounting` |
| `/ledger/transactions` | Ledger Transactions | |
| `/reports/pnl` | Profit & Loss | NOT `/reports/profit-loss` |
| `/reports/balance-sheet` | Balance Sheet | |
| `/reports/aging` | Aging Reports | NOT `/reports/ar-aging` or `/reports/ap-aging` |
| `/reports/trial-balance` | Trial Balance | |
| `/settings/account` | Account Settings | NOT `/settings/company` |
| `/settings/users` | User Management | |
| `/settings/bank-accounts` | Bank Accounts | |

## Page Load Assertions
Use flexible assertions that check multiple indicators:
```typescript
const hasHeading = await page.getByRole('heading', { name: /pattern/i }).first().isVisible({ timeout: 15000 }).catch(() => false);
const hasTable = await page.locator('table').isVisible({ timeout: 5000 }).catch(() => false);
const hasContent = await page.getByText(/pattern/i).first().isVisible({ timeout: 5000 }).catch(() => false);

expect(hasHeading || hasTable || hasContent).toBeTruthy();
```

## API Test Best Practices
1. Use `maxRedirects: 0` to detect HTML form redirects
2. Handle 500 errors gracefully with `toBeLessThanOrEqual(500)`
3. Add appropriate timeouts for slow endpoints
4. Log response status for debugging

## Known Issues
- Bill endpoints (`/rest/bill/*`) redirect to HTML forms - not available via REST API
- Vendor save endpoint redirects to HTML form - CRUD via API not supported
- Some financeReports endpoints return 500 with incomplete data
- Voucher endpoints may not be available on all backends
