/**
 * Unit tests for parseApiError / getApiErrorMessage
 *
 * Validates that the error parser translates raw axios errors into the
 * structured ParsedApiError the UI relies on — especially the
 * `module_disabled` case for SOUPFIN-9 where the backend returns 403 on
 * ledger/voucher endpoints because the module is not enabled for the tenant.
 *
 * Note: axios is globally mocked in src/test/setup.ts, so we cannot use the
 * real AxiosError class. parseApiError supports duck typing via `isAxiosError`,
 * which is what production code produces anyway.
 */
import { describe, it, expect } from 'vitest';
import { parseApiError, getApiErrorMessage } from '../errors';

// Build a duck-typed axios error matching the shape the response interceptor
// sees in production (config.url + response.status + response.data).
// parseApiError checks `'isAxiosError' in error` so this satisfies the type guard.
function makeAxiosError(
  status: number | undefined,
  url: string,
  data?: unknown,
): unknown {
  const err = new Error(`Request failed with status code ${status ?? 'NA'}`) as Error & {
    isAxiosError: boolean;
    config: { url: string };
    response?: { status: number; data: unknown };
  };
  err.isAxiosError = true;
  err.config = { url };
  if (status !== undefined) {
    err.response = { status, data };
  }
  return err;
}

describe('parseApiError', () => {
  describe('module_disabled (SOUPFIN-9)', () => {
    it.each<[string, string]>([
      ['/ledgerAccount/index.json', 'Ledger'],
      ['/ledgerTransaction/index.json', 'Ledger'],
      ['/ledgerTransactionGroup/index.json', 'Ledger'],
      ['/voucher/index.json', 'Accounting'],
      ['/paymentMethod/index.json', 'Accounting'],
      // Production paths still flow through the /rest prefix in some clients
      ['/rest/ledgerAccount/show/abc.json', 'Ledger'],
      ['/rest/voucher/save.json', 'Accounting'],
    ])('classifies 403 on %s as module_disabled (%s module)', (url, expectedModule) => {
      const error = makeAxiosError(403, url);

      const result = parseApiError(error);

      expect(result.kind).toBe('module_disabled');
      expect(result.title).toContain(expectedModule);
      expect(result.message).toContain(expectedModule);
      // CRITICAL: must NOT leak the raw "Request failed with status code 403" text
      expect(result.message).not.toContain('status code');
      expect(result.actionHint).toContain('administrator');
      expect(result.status).toBe(403);
    });
  });

  describe('forbidden (non-module 403)', () => {
    it('classifies 403 on a generic endpoint as forbidden, not module_disabled', () => {
      const error = makeAxiosError(403, '/invoice/save.json');

      const result = parseApiError(error);

      expect(result.kind).toBe('forbidden');
      expect(result.title).toBe('You do not have permission');
      expect(result.message).not.toContain('status code');
    });

    it('uses server-provided message when present', () => {
      const error = makeAxiosError(403, '/invoice/save.json', {
        error: 'Custom backend message about lacking ROLE_ADMIN',
      });

      const result = parseApiError(error);

      expect(result.kind).toBe('forbidden');
      expect(result.message).toBe('Custom backend message about lacking ROLE_ADMIN');
    });
  });

  describe('unauthorized', () => {
    it('classifies 401 as unauthorized with a session expired message', () => {
      const error = makeAxiosError(401, '/anything.json');

      const result = parseApiError(error);

      expect(result.kind).toBe('unauthorized');
      expect(result.title).toBe('Session expired');
      expect(result.message).toContain('sign in');
      expect(result.status).toBe(401);
    });
  });

  describe('not_found', () => {
    it('classifies 404 as not_found', () => {
      const error = makeAxiosError(404, '/invoice/show/missing.json');

      const result = parseApiError(error);

      expect(result.kind).toBe('not_found');
      expect(result.message).not.toContain('status code');
      expect(result.status).toBe(404);
    });
  });

  describe('server_error', () => {
    it.each<number>([500, 502, 503, 504])('classifies %d as server_error', (status) => {
      const error = makeAxiosError(status, '/financeReports/balanceSheet.json');

      const result = parseApiError(error);

      expect(result.kind).toBe('server_error');
      expect(result.title).toBe('Server error');
      expect(result.status).toBe(status);
    });
  });

  describe('network errors (no response)', () => {
    it('classifies missing response as network error', () => {
      // No response field — simulates connection refused or DNS failure
      const error = makeAxiosError(undefined, '/anything');

      const result = parseApiError(error);

      expect(result.kind).toBe('network');
      expect(result.title).toBe('Connection problem');
      expect(result.actionHint).toContain('administrator');
    });
  });

  describe('non-axios errors', () => {
    it('handles native Error instances', () => {
      const error = new Error('Boom');

      const result = parseApiError(error);

      expect(result.kind).toBe('unknown');
      expect(result.message).toBe('Boom');
    });

    it('handles plain string / unknown thrown values', () => {
      const result = parseApiError('something exploded');

      expect(result.kind).toBe('unknown');
      expect(result.message).toContain('unexpected error');
    });

    it('handles undefined', () => {
      const result = parseApiError(undefined);

      expect(result.kind).toBe('unknown');
      expect(result.message).toContain('unexpected error');
    });
  });

  describe('getApiErrorMessage convenience', () => {
    it('returns just the message string', () => {
      const error = makeAxiosError(403, '/ledgerAccount/index.json');

      const message = getApiErrorMessage(error);

      expect(typeof message).toBe('string');
      expect(message).toContain('Ledger');
      expect(message).not.toContain('status code');
    });
  });
});
