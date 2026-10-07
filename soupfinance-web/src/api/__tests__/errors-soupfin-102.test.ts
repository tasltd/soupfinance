/**
 * SOUPFIN-102: with custom roles, a 403 can be a ROLE denial on a module-gated URL.
 * It must read "You do not have permission", never "module not enabled".
 *
 * Bodies below are the real ones (captured from the LXC backend 2026-10-07):
 *   Spring Security role denial → {"timestamp":…,"status":403,"error":"Forbidden","path":…}
 *   FinanceModuleInterceptor    → {"error":"Finance module is not enabled for this tenant"}
 * plus the planned permission-check body {"code":"PERMISSION_DENIED","error":"…"}.
 */
import { describe, it, expect } from 'vitest';
import { parseApiError, isPermissionDenialBody } from '../errors';
import { isModuleDisabledError } from '../../utils/apiErrors';

function makeAxiosError(status: number, url: string, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url },
    response: { status, data },
  });
}

const SPRING_403 = (path: string) => ({ timestamp: 1791367969595, status: 403, error: 'Forbidden', path });
const MODULE_403 = { error: 'Finance module is not enabled for this tenant' };
const PERMISSION_403 = {
  code: 'PERMISSION_DENIED',
  error: 'Your role does not allow you to create journal entries.',
  permission: 'ROLE_PERM_LEDGER_CREATE',
};

describe('parseApiError — permission vs module 403 (SOUPFIN-102)', () => {
  it('a Spring role denial on a ledger URL is forbidden, not module_disabled', () => {
    const result = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', SPRING_403('/rest/ledgerAccount/index.json')));
    expect(result.kind).toBe('forbidden');
    expect(result.title).toBe('You do not have permission');
    // Spring's bare "Forbidden" is replaced with a sentence
    expect(result.message).not.toBe('Forbidden');
    expect(result.message).toMatch(/permission/i);
    expect(result.message).not.toMatch(/module/i);
  });

  it('a PERMISSION_DENIED body on a voucher URL shows the backend sentence', () => {
    const result = parseApiError(makeAxiosError(403, '/voucher/save.json', PERMISSION_403));
    expect(result.kind).toBe('forbidden');
    expect(result.message).toBe('Your role does not allow you to create journal entries.');
  });

  it('the module interceptor message is module_disabled on ANY URL, naming its module', () => {
    const onInvoice = parseApiError(makeAxiosError(403, '/invoice/index.json', MODULE_403));
    expect(onInvoice.kind).toBe('module_disabled');
    expect(onInvoice.title).toBe('Finance module is not available');

    const onLedger = parseApiError(makeAxiosError(403, '/ledgerAccount/index.json', MODULE_403));
    expect(onLedger.kind).toBe('module_disabled');
    expect(onLedger.title).toContain('Finance');
  });

  it('an empty 403 body on a gated URL still falls back to module_disabled (legacy)', () => {
    expect(parseApiError(makeAxiosError(403, '/voucher/index.json')).kind).toBe('module_disabled');
    expect(parseApiError(makeAxiosError(403, '/voucher/index.json', '')).kind).toBe('module_disabled');
  });

  it('a Spring role denial on a non-gated URL is forbidden', () => {
    expect(parseApiError(makeAxiosError(403, '/agent/create.json', SPRING_403('/rest/agent/create.json'))).kind).toBe(
      'forbidden'
    );
  });

  it('an overlong body message is ignored, not shown, and still classed as forbidden', () => {
    const longMessage = 'x'.repeat(5000);
    const result = parseApiError(makeAxiosError(403, '/bill/index.json', { code: 'PERMISSION_DENIED', error: longMessage }));
    expect(result.kind).toBe('forbidden');
    expect(result.message).not.toBe(longMessage);
  });
});

describe('isPermissionDenialBody', () => {
  it.each([
    ['PERMISSION_DENIED code', PERMISSION_403, true],
    ['Spring default 403 page', SPRING_403('/rest/bill/index.json'), true],
    ['module interceptor body', MODULE_403, false],
    ['empty object', {}, false],
    ['null', null, false],
    ['string body', 'Forbidden', false],
  ] as const)('%s → %s', (_label, body, expected) => {
    expect(isPermissionDenialBody(body)).toBe(expected);
  });
});

describe('isModuleDisabledError (payments pages) — SOUPFIN-102', () => {
  it('is false for a permission denial so payments show "permission", not "module disabled"', () => {
    expect(isModuleDisabledError(makeAxiosError(403, '/voucher/index.json', PERMISSION_403))).toBe(false);
    expect(isModuleDisabledError(makeAxiosError(403, '/voucher/index.json', SPRING_403('/rest/voucher/index.json')))).toBe(false);
  });

  it('stays true for the module message and for an empty 403', () => {
    expect(isModuleDisabledError(makeAxiosError(403, '/voucher/index.json', MODULE_403))).toBe(true);
    expect(isModuleDisabledError({ response: { status: 403 } })).toBe(true);
  });
});
