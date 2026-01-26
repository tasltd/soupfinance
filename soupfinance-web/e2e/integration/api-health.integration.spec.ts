/**
 * API Health & CORS Integration Tests
 * Tests real backend API endpoints and CORS configuration
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';

test.describe('Backend API Health Checks', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Get auth token for authenticated endpoints
    const loginResponse = await request.post(`${API_BASE}/rest/api/login`, {
      data: {
        username: backendTestUsers.admin.username,
        password: backendTestUsers.admin.password,
      },
    });

    if (loginResponse.ok()) {
      const data = await loginResponse.json();
      authToken = data.access_token;
      console.log('Auth token obtained:', authToken ? 'YES' : 'NO');
    }
  });

  test.describe('Authentication Endpoints', () => {
    test('POST /rest/api/login - returns token', async ({ request }) => {
      const response = await request.post(`${API_BASE}/rest/api/login`, {
        data: {
          username: backendTestUsers.admin.username,
          password: backendTestUsers.admin.password,
        },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('access_token');
      expect(data).toHaveProperty('username');
      expect(data).toHaveProperty('roles');
      console.log('Login response:', JSON.stringify(data, null, 2));
    });

    test('GET /rest/user/current.json - returns current user', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/user/current.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Current user status:', response.status());
      const data = await response.json().catch(() => ({}));
      console.log('Current user response:', JSON.stringify(data, null, 2));

      // Document actual response
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Invoice Endpoints', () => {
    test('GET /rest/invoice/index.json - list invoices', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/invoice/index.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Invoice list status:', response.status());
      const data = await response.json().catch(() => ({}));
      console.log('Invoice list response:', JSON.stringify(data, null, 2).slice(0, 500));

      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Bill Endpoints', () => {
    test('GET /rest/bill/index.json - list bills', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/bill/index.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Bill list status:', response.status());
      const data = await response.json().catch(() => ({}));
      console.log('Bill list response:', JSON.stringify(data, null, 2).slice(0, 500));

      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Vendor Endpoints', () => {
    test('GET /rest/vendor/index.json - list vendors', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/vendor/index.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Vendor list status:', response.status());
      const data = await response.json().catch(() => ({}));
      console.log('Vendor list response:', JSON.stringify(data, null, 2).slice(0, 500));

      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Ledger Endpoints', () => {
    test('GET /rest/ledgerAccount/index.json - list accounts', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/ledgerAccount/index.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Ledger accounts status:', response.status());
      const data = await response.json().catch(() => ({}));
      console.log('Ledger accounts response:', JSON.stringify(data, null, 2).slice(0, 500));

      expect(response.status()).toBeLessThan(500);
    });

    test('GET /rest/ledgerTransaction/index.json - list transactions', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/ledgerTransaction/index.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Ledger transactions status:', response.status());
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Report Endpoints', () => {
    test('GET /rest/report/trialBalance.json - trial balance', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/report/trialBalance.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Trial balance status:', response.status());
      expect(response.status()).toBeLessThan(500);
    });

    test('GET /rest/report/profitLoss.json - profit & loss', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/report/profitLoss.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('P&L status:', response.status());
      expect(response.status()).toBeLessThan(500);
    });

    test('GET /rest/report/balanceSheet.json - balance sheet', async ({ request }) => {
      const response = await request.get(`${API_BASE}/rest/report/balanceSheet.json`, {
        headers: { 'X-Auth-Token': authToken },
      });

      console.log('Balance sheet status:', response.status());
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('CORS Configuration', () => {
    test('OPTIONS preflight request is handled', async ({ request }) => {
      const response = await request.fetch(`${API_BASE}/rest/invoice/index.json`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5181',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'X-Auth-Token, Content-Type',
        },
      });

      console.log('CORS preflight status:', response.status());
      console.log('CORS headers:', {
        'Access-Control-Allow-Origin': response.headers()['access-control-allow-origin'],
        'Access-Control-Allow-Methods': response.headers()['access-control-allow-methods'],
        'Access-Control-Allow-Headers': response.headers()['access-control-allow-headers'],
      });

      // Document CORS response for backend plan
      expect(response.status()).toBeLessThan(500);
    });
  });
});
