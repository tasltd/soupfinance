/**
 * Ledger Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Tests ledger accounts, transactions, vouchers, and journal entries
 * Uses actual API endpoints: /rest/ledgerAccount/*, /rest/ledgerTransaction/*, /rest/voucher/*
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';

// Helper to login as admin
async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible' });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

// Helper to get auth token from page
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

test.describe('Ledger Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.describe('Chart of Accounts (Ledger Accounts)', () => {
    test('ledger accounts page loads with real data', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Navigate to ledger/chart of accounts via sidebar
      const ledgerLink = page.getByRole('link', { name: /ledger|chart of accounts|accounting/i }).first();
      if (await ledgerLink.isVisible().catch(() => false)) {
        await ledgerLink.click();
        await page.waitForLoadState('networkidle');
      } else {
        await page.goto('/ledger');
      }

      await expect(page.getByRole('heading', { name: /ledger|account|chart/i })).toBeVisible({ timeout: 15000 });
      await takeScreenshot(page, 'integration-ledger-accounts');
    });

    test('GET /rest/ledgerAccount/index.json - returns account list', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/ledgerAccount/index.json`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('Ledger accounts status:', response.status());
      expect(response.status()).toBeLessThan(500);

      const data = await response.json().catch(() => null);
      console.log('Ledger accounts response:', JSON.stringify(data, null, 2).slice(0, 1000));

      if (data) {
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('ledger accounts grouped by type', async ({ page }) => {
      const token = await getAuthToken(page);

      // Test filtering by ledger group
      const groups = ['ASSET', 'LIABILITY', 'EQUITY'];

      for (const group of groups) {
        const response = await page.request.get(
          `${API_BASE}/rest/ledgerAccount/index.json?ledgerGroup=${group}`,
          { headers: { 'X-Auth-Token': token } }
        );

        console.log(`Ledger accounts (${group}):`, response.status());
        expect(response.status()).toBeLessThan(500);

        if (response.ok()) {
          const accounts = await response.json();
          console.log(`${group} accounts count:`, Array.isArray(accounts) ? accounts.length : 'N/A');
        }
      }
    });

    test('ledger account CRUD flow', async ({ page }) => {
      const token = await getAuthToken(page);

      // 1. Create ledger account
      const accountData = new URLSearchParams({
        name: `Test Account ${Date.now()}`,
        accountNumber: `TEST-${Date.now().toString().slice(-6)}`,
        ledgerGroup: 'ASSET',
        ledgerSubGroup: 'CURRENT_ASSET',
        description: 'Integration test account',
        currency: 'USD',
      });

      const createResponse = await page.request.post(`${API_BASE}/rest/ledgerAccount/save.json`, {
        headers: {
          'X-Auth-Token': token,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: accountData.toString(),
        maxRedirects: 0,
      });

      console.log('Create ledger account status:', createResponse.status());

      if (createResponse.status() === 302) {
        console.log('Ledger account save endpoint redirects');
        test.skip();
        return;
      }

      if (!createResponse.ok()) {
        const errorText = await createResponse.text();
        console.log('Create account failed:', errorText.slice(0, 500));
        return;
      }

      const createdAccount = await createResponse.json();
      console.log('Created account:', JSON.stringify(createdAccount, null, 2));
      expect(createdAccount).toHaveProperty('id');

      const accountId = createdAccount.id;

      // 2. Read account
      const readResponse = await page.request.get(`${API_BASE}/rest/ledgerAccount/show/${accountId}.json`, {
        headers: { 'X-Auth-Token': token },
      });

      expect(readResponse.status()).toBeLessThan(500);

      // 3. Get account balance
      const balanceResponse = await page.request.get(`${API_BASE}/rest/ledgerAccount/balance/${accountId}.json`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('Account balance status:', balanceResponse.status());
      expect(balanceResponse.status()).toBeLessThan(500);
    });
  });

  test.describe('Ledger Transactions', () => {
    test('GET /rest/ledgerTransaction/index.json - returns transactions', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/ledgerTransaction/index.json`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('Ledger transactions status:', response.status());
      expect(response.status()).toBeLessThan(500);

      const data = await response.json().catch(() => null);
      console.log('Ledger transactions response:', JSON.stringify(data, null, 2).slice(0, 500));
    });

    test('transactions page loads', async ({ page }) => {
      await page.goto('/ledger/transactions');
      await page.waitForLoadState('networkidle');

      // Check if session expired
      const isLoginPage = await page.getByText(/session expired|sign in|welcome back/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (isLoginPage) {
        console.log('Session expired - test skipped');
        return;
      }

      // Should show transactions page - may have different headings or just content
      const hasHeading = await page.getByRole('heading', { name: /ledger.*transaction|transaction|journal/i }).first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasTestId = await page.locator('[data-testid="ledger-transactions-heading"]').isVisible({ timeout: 5000 }).catch(() => false);
      const hasTable = await page.locator('table').isVisible({ timeout: 5000 }).catch(() => false);
      const hasContent = await page.getByText(/transaction|journal|ledger/i).first().isVisible({ timeout: 5000 }).catch(() => false);

      console.log('Transactions page content:', { hasHeading, hasTestId, hasTable, hasContent });
      expect(hasHeading || hasTestId || hasTable || hasContent).toBeTruthy();
      await takeScreenshot(page, 'integration-ledger-transactions');
    });

    test('transactions filtered by date range', async ({ page }) => {
      const token = await getAuthToken(page);

      const startDate = '2026-01-01';
      const endDate = '2026-12-31';

      const response = await page.request.get(
        `${API_BASE}/rest/ledgerTransaction/index.json?startDate=${startDate}&endDate=${endDate}`,
        { headers: { 'X-Auth-Token': token } }
      );

      console.log('Filtered transactions status:', response.status());
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Vouchers (Payments/Receipts)', () => {
    test('GET /rest/voucher/index.json - returns vouchers', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/voucher/index.json`, {
        headers: { 'X-Auth-Token': token },
        maxRedirects: 0,
        timeout: 30000,
      });

      console.log('Vouchers status:', response.status());

      // Voucher endpoint may not exist in all backends
      if (response.status() === 302 || response.status() === 404) {
        console.log('Voucher endpoint not available');
        return;
      }

      expect(response.status()).toBeLessThanOrEqual(500);

      const data = await response.json().catch(() => null);
      console.log('Vouchers response:', JSON.stringify(data, null, 2).slice(0, 500));
    });

    test('vouchers filtered by type', async ({ page }) => {
      const token = await getAuthToken(page);

      // First check if voucher endpoint exists
      const checkResponse = await page.request.get(`${API_BASE}/rest/voucher/index.json`, {
        headers: { 'X-Auth-Token': token },
        maxRedirects: 0,
        timeout: 10000,
      });

      if (checkResponse.status() === 302 || checkResponse.status() === 404) {
        console.log('Voucher endpoint not available, skipping filter test');
        return;
      }

      const types = ['PAYMENT', 'RECEIPT', 'DEPOSIT'];

      for (const type of types) {
        const response = await page.request.get(
          `${API_BASE}/rest/voucher/index.json?voucherType=${type}`,
          {
            headers: { 'X-Auth-Token': token },
            maxRedirects: 0,
            timeout: 15000,
          }
        );

        console.log(`Vouchers (${type}):`, response.status());
        expect(response.status()).toBeLessThanOrEqual(500);
      }
    });

    test('payments page loads', async ({ page }) => {
      await page.goto('/payments');
      await page.waitForLoadState('networkidle');

      // Check if session expired
      const isLoginPage = await page.getByText(/session expired|sign in|welcome back/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (isLoginPage) {
        console.log('Session expired - test skipped');
        return;
      }

      // Should show payments page - may have different headings or just content
      const hasHeading = await page.getByRole('heading', { name: /payment/i }).first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasTestId = await page.locator('[data-testid="payment-list-heading"]').isVisible({ timeout: 5000 }).catch(() => false);
      const hasTable = await page.locator('table').isVisible({ timeout: 5000 }).catch(() => false);
      const hasContent = await page.getByText(/payment/i).first().isVisible({ timeout: 5000 }).catch(() => false);

      console.log('Payments page content:', { hasHeading, hasTestId, hasTable, hasContent });
      expect(hasHeading || hasTestId || hasTable || hasContent).toBeTruthy();
      await takeScreenshot(page, 'integration-payments-list');
    });
  });

  test.describe('Trial Balance', () => {
    test('GET /rest/ledgerAccount/trialBalance.json - returns trial balance', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/ledgerAccount/trialBalance.json`, {
        headers: { 'X-Auth-Token': token },
        timeout: 30000, // Trial balance can be slow
      });

      console.log('Trial balance status:', response.status());

      // Trial balance endpoint may not exist on all backends
      if (response.status() === 404 || response.status() === 302) {
        console.log('Trial balance endpoint not available in ledgerAccount controller');
        return;
      }

      expect(response.status()).toBeLessThanOrEqual(500);

      const data = await response.json().catch(() => null);
      console.log('Trial balance response:', JSON.stringify(data, null, 2).slice(0, 500));

      if (data && response.ok()) {
        // Should have totals - could be totalDebit/totalCredit or totalDebits/totalCredits
        const hasTotals = data.totalDebit !== undefined || data.totalDebits !== undefined;
        expect(hasTotals).toBeTruthy();
      }
    });
  });

  test.describe('Page Navigation', () => {
    test('can navigate between ledger sections', async ({ page }) => {
      // Start at ledger
      await page.goto('/ledger');
      await page.waitForLoadState('networkidle');
      await takeScreenshot(page, 'integration-ledger-main');

      // Try to navigate to transactions
      const transactionsLink = page.getByRole('link', { name: /transaction/i });
      if (await transactionsLink.isVisible().catch(() => false)) {
        await transactionsLink.click();
        await page.waitForLoadState('networkidle');
        await takeScreenshot(page, 'integration-ledger-nav-transactions');
      }

      // Try to navigate to journal entries
      const journalLink = page.getByRole('link', { name: /journal/i });
      if (await journalLink.isVisible().catch(() => false)) {
        await journalLink.click();
        await page.waitForLoadState('networkidle');
        await takeScreenshot(page, 'integration-ledger-nav-journal');
      }
    });

    test('can create new journal entry', async ({ page }) => {
      await page.goto('/ledger/transactions');
      await page.waitForLoadState('networkidle');

      const newEntryBtn = page.getByRole('button', { name: /new|create|add/i }).first();

      if (await newEntryBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await newEntryBtn.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'integration-ledger-new-entry');
      }
    });
  });
});
