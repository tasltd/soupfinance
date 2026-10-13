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
import {
  parseApiError,
  getApiErrorMessage,
  getLoginErrorMessage,
  classifyForbiddenBody,
} from '../errors';

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
      // Added (SOUPFIN-147): the template picker's index is gated with the finance module
      ['/coaTemplate/index.json', 'Ledger'],
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

  // SOUPFIN-150: the module gate and the role check both answer 403 on the same
  // URLs. The body tells them apart. Bodies below are the exact shapes the
  // backend sends (FinanceModuleInterceptor; Spring Boot error envelope from
  // Spring Security's sendError, captured from the LXC backend 2026-10-12).
  describe('403 cause from the body (SOUPFIN-150)', () => {
    const MODULE_GATE_BODY = { error: 'Finance module is not enabled for this tenant' };
    const SPRING_ROLE_BODY = {
      timestamp: 1791812465647,
      status: 403,
      error: 'Forbidden',
      path: '/rest/ledgerAccount/index.json',
    };

    it('module interceptor body on the ledger URL → module_disabled, Ledger named', () => {
      const result = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', MODULE_GATE_BODY));

      expect(result.kind).toBe('module_disabled');
      expect(result.title).toBe('Ledger module is not available');
      expect(result.actionHint).toContain('enable this module');
    });

    it('Spring Security body on the ledger URL → forbidden with ask-your-admin copy', () => {
      const result = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', SPRING_ROLE_BODY));

      expect(result.kind).toBe('forbidden');
      expect(result.title).toBe('You do not have permission');
      expect(result.message).toBe('Your account does not have permission to use Ledger.');
      expect(result.actionHint).toBe('Ask your administrator to give your account access.');
      // Never the module copy, never Spring's jargon.
      expect(`${result.title} ${result.message}`).not.toMatch(/module|not available|Forbidden/);
      expect(result.status).toBe(403);
    });

    it.each<[string, string]>([
      ['/ledgerTransaction/index.json', 'Ledger'],
      ['/rest/ledgerTransactionGroup/show/abc.json', 'Ledger'],
      ['/voucher/save.json', 'Accounting'],
      ['/paymentMethod/index.json', 'Accounting'],
    ])('Spring Security body on gated %s → forbidden, names %s', (url, module) => {
      const result = parseApiError(makeAxiosError(403, url, SPRING_ROLE_BODY));

      expect(result.kind).toBe('forbidden');
      expect(result.message).toContain(module);
    });

    it('"Access Denied" message variant of the envelope → forbidden', () => {
      const result = parseApiError(
        makeAxiosError(403, '/ledgerAccount/index.json', { ...SPRING_ROLE_BODY, message: 'Access Denied' }),
      );

      expect(result.kind).toBe('forbidden');
    });

    it('module body on a URL the frontend does not list → module_disabled, backend name used', () => {
      const result = parseApiError(makeAxiosError(403, '/invoice/index.json', MODULE_GATE_BODY));

      expect(result.kind).toBe('module_disabled');
      expect(result.title).toBe('Finance module is not available');
    });

    it('plain-text module body (non-JSON request) → module_disabled', () => {
      const result = parseApiError(
        makeAxiosError(403, '/vendor/index', 'Trading module is not enabled for this tenant'),
      );

      expect(result.kind).toBe('module_disabled');
      expect(result.title).toBe('Trading module is not available');
    });

    it('generic URL with a bare "Forbidden" body → forbidden without echoing the jargon', () => {
      const result = parseApiError(makeAxiosError(403, '/invoice/save.json', { error: 'Forbidden' }));

      expect(result.kind).toBe('forbidden');
      expect(result.message).not.toMatch(/forbidden/i);
      expect(result.message).toContain('permission');
    });

    it.each<[string, unknown]>([
      ['no body', undefined],
      ['empty object', {}],
      ['empty string', ''],
      ['HTML error page', '<html><body><h1>HTTP Status 403</h1></body></html>'],
    ])('silent body (%s) on the ledger URL keeps the URL fallback → module_disabled', (_label, body) => {
      const result = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', body));

      expect(result.kind).toBe('module_disabled');
      expect(result.title).toContain('Ledger');
    });

    it('silent body on a generic URL → forbidden', () => {
      expect(parseApiError(makeAxiosError(403, '/invoice/save.json', {})).kind).toBe('forbidden');
    });

    it('a 10,000-character body is ignored, not matched or echoed', () => {
      const huge = 'x'.repeat(10_000);
      const result = parseApiError(makeAxiosError(403, '/invoice/save.json', { error: huge }));

      expect(result.kind).toBe('forbidden');
      expect(result.message.length).toBeLessThan(300);
    });
  });

  describe('classifyForbiddenBody (SOUPFIN-150)', () => {
    it.each<[string, unknown, string, string | undefined]>([
      ['interceptor JSON', { error: 'Finance module is not enabled for this tenant' }, 'module_disabled', 'Finance'],
      ['CIS interceptor JSON', { error: 'CIS/Funds module is not enabled for this tenant' }, 'module_disabled', 'CIS/Funds'],
      ['interceptor plain text', 'Souplify module is not enabled for this tenant', 'module_disabled', 'Souplify'],
      ['explicit code', { code: 'MODULE_DISABLED', module: 'FINANCE' }, 'module_disabled', 'Finance'],
      ['explicit code, no module', { code: 'module_disabled' }, 'module_disabled', undefined],
      ['explicit role code', { code: 'ROLE_DENIED', error: 'Forbidden' }, 'role_denied', undefined],
      ['Spring envelope', { status: 403, error: 'Forbidden', path: '/rest/x' }, 'role_denied', undefined],
      ['Access Denied message', { message: 'Access Denied' }, 'role_denied', undefined],
      ['plain "Forbidden" text', 'Forbidden', 'role_denied', undefined],
      ['null', null, 'unknown', undefined],
      ['undefined', undefined, 'unknown', undefined],
      ['empty object', {}, 'unknown', undefined],
      ['number', 403, 'unknown', undefined],
      ['unrelated message', { error: 'Custom backend message about lacking ROLE_ADMIN' }, 'unknown', undefined],
    ])('%s → %s', (_label, body, cause, module) => {
      const result = classifyForbiddenBody(body);

      expect(result.cause).toBe(cause);
      expect(result.backendModule).toBe(module);
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

  // ==========================================================================
  // getLoginErrorMessage (SOUPFIN-29) — friendly messages for failed logins.
  // ==========================================================================
  describe('getLoginErrorMessage', () => {
    it('maps a bare 401 (no body) to "Invalid username or password."', () => {
      // This is the exact SOUPFIN-29 bug: raw AxiosError.message was
      // "Request failed with status code 401" leaking to the user.
      const error = makeAxiosError(401, '/api/login');

      const message = getLoginErrorMessage(error);

      expect(message).toBe('Invalid username or password.');
      expect(message).not.toContain('status code');
    });

    it('maps a 401 with a generic "Bad credentials" body to the friendly message', () => {
      const error = makeAxiosError(401, '/api/login', { error: 'Bad credentials' });

      const message = getLoginErrorMessage(error);

      expect(message).toBe('Invalid username or password.');
    });

    it.each(['Unauthorized', 'invalid_grant', 'Authentication failed', 'Access Denied'])(
      'replaces generic auth-failure phrase %s with the friendly message',
      (phrase) => {
        const error = makeAxiosError(401, '/api/login', { error: phrase });

        expect(getLoginErrorMessage(error)).toBe('Invalid username or password.');
      },
    );

    it('surfaces a descriptive backend message verbatim (e.g. email not confirmed)', () => {
      // LoginPage relies on this to detect UNCONFIRMED_PATTERNS and show a resend link.
      const error = makeAxiosError(401, '/api/login', {
        error_description: 'Your email is not confirmed. Please check your inbox.',
      });

      const message = getLoginErrorMessage(error);

      expect(message).toBe('Your email is not confirmed. Please check your inbox.');
      expect(message.toLowerCase()).toContain('not confirmed');
    });

    it('reads Spring Security REST error_description before generic error code', () => {
      const error = makeAxiosError(401, '/api/login', {
        error: 'invalid_grant',
        error_description: 'Account is locked. Contact your administrator.',
      });

      expect(getLoginErrorMessage(error)).toBe('Account is locked. Contact your administrator.');
    });

    it('maps a 403 on the auth endpoint to the friendly credentials message', () => {
      const error = makeAxiosError(403, '/api/login');

      expect(getLoginErrorMessage(error)).toBe('Invalid username or password.');
    });

    it('honours a custom fallback (used by OTP verify)', () => {
      const error = makeAxiosError(401, '/client/verifyCode.json');

      const message = getLoginErrorMessage(error, 'Invalid or expired verification code.');

      expect(message).toBe('Invalid or expired verification code.');
    });

    it('defers to parseApiError for network failures (no response)', () => {
      const error = makeAxiosError(undefined, '/api/login');

      const message = getLoginErrorMessage(error);

      // Should be the network message, NOT "Invalid username or password."
      expect(message.toLowerCase()).toContain('could not reach the server');
    });

    it('defers to parseApiError for 5xx (never "Session expired", never raw status)', () => {
      const error = makeAxiosError(500, '/api/login');

      const message = getLoginErrorMessage(error);

      expect(message).not.toContain('status code');
      expect(message).not.toContain('Session expired');
      expect(message.toLowerCase()).toContain('something went wrong');
    });

    it('never surfaces "Session expired" for a login 401 (regression guard)', () => {
      // parseApiError(401) says "Session expired" — wrong when actively logging in.
      const error = makeAxiosError(401, '/api/login');

      expect(getLoginErrorMessage(error)).not.toContain('Session expired');
    });

    it('handles a native Error thrown before the request (non-axios)', () => {
      const message = getLoginErrorMessage(new Error('boom'));

      expect(message).toBe('boom');
    });

    it('handles unknown thrown values', () => {
      // Asserted as a property rather than exact copy: the sibling suite below
      // pins the exact string ("Unable to sign in. Please try again."), which is
      // deliberately login-specific instead of parseApiError's generic
      // "unexpected error". What matters at this layer is that a non-Error throw
      // yields readable guidance and leaks nothing internal.
      const message = getLoginErrorMessage('exploded');

      expect(message).not.toContain('status code');
      expect(message).not.toContain('exploded');
      expect(message.length).toBeGreaterThan(0);
    });
  });
});

describe('getLoginErrorMessage (SOUPFIN-29)', () => {
  it.each<number>([401, 403])(
    'maps %d with no body to "Invalid username or password."',
    (status) => {
      const error = makeAxiosError(status, '/api/login');

      const message = getLoginErrorMessage(error);

      expect(message).toBe('Invalid username or password.');
      // CRITICAL: the whole point of the ticket — never leak the raw Axios text
      expect(message).not.toContain('status code');
    },
  );

  it('maps 401 with a generic "Bad credentials" body to the friendly message', () => {
    // Spring Security typically returns a jargon message we do NOT want to show
    const error = makeAxiosError(401, '/api/login', { error: 'Bad credentials' });

    const message = getLoginErrorMessage(error);

    expect(message).toBe('Invalid username or password.');
    expect(message).not.toContain('Bad credentials');
  });

  it.each<string>([
    'Your email is not confirmed. Please check your inbox.',
    'Account not activated',
    'This account has been locked. Contact support.',
    'Registration is pending confirmation.',
  ])('passes through descriptive account-state message: %s', (serverMessage) => {
    const error = makeAxiosError(403, '/api/login', { message: serverMessage });

    const result = getLoginErrorMessage(error);

    // Passed through verbatim so LoginPage can react (e.g. show Resend link)
    expect(result).toBe(serverMessage);
  });

  it('returns a connection message when there is no response (network failure)', () => {
    const error = makeAxiosError(undefined, '/api/login');

    const message = getLoginErrorMessage(error);

    expect(message).toMatch(/reach the server|connection/i);
    expect(message).not.toContain('status code');
  });

  it('maps 5xx to a temporary-unavailable message', () => {
    const error = makeAxiosError(503, '/api/login');

    const message = getLoginErrorMessage(error);

    expect(message).toMatch(/temporarily unavailable|try again/i);
    expect(message).not.toContain('status code');
  });

  it('never leaks raw messages for non-Axios errors', () => {
    const message = getLoginErrorMessage(new Error('Request failed with status code 401'));

    expect(message).toBe('Unable to sign in. Please try again.');
    expect(message).not.toContain('status code');
  });

  it('handles unknown thrown values without leaking', () => {
    expect(getLoginErrorMessage('boom')).toBe('Unable to sign in. Please try again.');
    expect(getLoginErrorMessage(undefined)).toBe('Unable to sign in. Please try again.');
  });
});

// Added (SOUPFIN-181): the backend module gate now signals itself with headers
// (X-Module-Status: disabled, X-Module: FINANCE) and a code in the body.
describe('module-gated 403 signals (SOUPFIN-181)', () => {
  function withHeaders(err: unknown, headers: unknown): unknown {
    (err as { response: { headers: unknown } }).response.headers = headers;
    return err;
  }

  // The body the backend ModuleGate renders, verbatim.
  const gateBody = {
    error: 'Finance module is not enabled for this tenant',
    code: 'MODULE_DISABLED',
    module: 'FINANCE',
    message: 'Finance module is not enabled for this tenant',
  };
  // Spring Boot's envelope for a role denial (verified on the LXC backend).
  const roleBody = { timestamp: '2026-10-13T10:00:00Z', status: 403, error: 'Forbidden', path: '/rest/invoicePayment/index.json' };

  it('reads module_disabled from the headers on a URL the frontend does not know', () => {
    const parsed = parseApiError(
      withHeaders(makeAxiosError(403, '/invoicePayment/index.json', ''), {
        'x-module-status': 'disabled',
        'x-module': 'FINANCE',
      }),
    );
    expect(parsed.kind).toBe('module_disabled');
    expect(parsed.title).toBe('Finance module is not available');
  });

  it('reads the headers through an AxiosHeaders-style get()', () => {
    const headers = { get: (n: string) => ({ 'x-module-status': 'disabled', 'x-module': 'TRADING' })[n] };
    const parsed = parseApiError(withHeaders(makeAxiosError(403, '/orderRequest/index.json', '<html></html>'), headers));
    expect(parsed.kind).toBe('module_disabled');
    expect(parsed.title).toBe('Trading module is not available');
  });

  it('matches the header names case-insensitively on a plain object', () => {
    const parsed = parseApiError(
      withHeaders(makeAxiosError(403, '/invoice/index.json', null), { 'X-Module-Status': 'DISABLED', 'X-Module': 'FINANCE' }),
    );
    expect(parsed.kind).toBe('module_disabled');
  });

  it('reads the structured body when the headers are absent', () => {
    const parsed = parseApiError(makeAxiosError(403, '/bill/index.json', gateBody));
    expect(parsed.kind).toBe('module_disabled');
    expect(parsed.title).toBe('Finance module is not available');
    expect(parsed.message).not.toContain('MODULE_DISABLED');
  });

  it('accepts the code in the error field, the shape the ticket describes', () => {
    expect(classifyForbiddenBody({ error: 'MODULE_DISABLED', module: 'finance', message: 'x' })).toEqual({
      cause: 'module_disabled',
      backendModule: 'finance',
    });
  });

  it('keeps a role denial distinguishable: no header, Spring body → forbidden, even on a gated URL', () => {
    const parsed = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', roleBody));
    expect(parsed.kind).toBe('forbidden');
    expect(parsed.title).toBe('You do not have permission');
  });

  it('ignores an X-Module-Status other than disabled and falls back to the body', () => {
    const parsed = parseApiError(
      withHeaders(makeAxiosError(403, '/invoicePayment/index.json', roleBody), { 'x-module-status': 'enabled' }),
    );
    expect(parsed.kind).toBe('forbidden');
  });

  it('the header wins over a body that says role denied', () => {
    const parsed = parseApiError(
      withHeaders(makeAxiosError(403, '/invoicePayment/index.json', roleBody), { 'x-module-status': 'disabled' }),
    );
    expect(parsed.kind).toBe('module_disabled');
    expect(parsed.title).toBe('Module is not available');
  });

  it('handles empty, null and array-valued headers without throwing', () => {
    for (const headers of [undefined, null, {}, { 'x-module-status': [] }, { 'x-module-status': ['disabled'] }]) {
      expect(() => parseApiError(withHeaders(makeAxiosError(403, '/x/index.json', null), headers))).not.toThrow();
    }
    expect(parseApiError(withHeaders(makeAxiosError(403, '/x/index.json', null), { 'x-module-status': ['disabled'] })).kind).toBe(
      'module_disabled',
    );
  });

  it('a very long module name is passed through, not truncated or dropped', () => {
    const long = 'A'.repeat(2000);
    const parsed = parseApiError(
      withHeaders(makeAxiosError(403, '/x/index.json', null), { 'x-module-status': 'disabled', 'x-module': long }),
    );
    expect(parsed.kind).toBe('module_disabled');
    expect(parsed.title.startsWith('A' + 'a'.repeat(10))).toBe(true);
  });
});
