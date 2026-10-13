/**
 * Unit tests for modulesApi (SOUPFIN-181).
 *
 * GET /account/modules.json lists the tenant's enabled modules. The nav hides pages for
 * modules the tenant lacks, so the failure modes matter as much as the happy path:
 * "unknown" must never be read as "no modules", or every gated page disappears.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountClient } from '../../client';
import { modulesApi, isEnabledModulesResponse } from '../modules';

vi.mock('../../client', () => ({
  accountClient: { get: vi.fn() },
  default: { get: vi.fn() },
}));

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });
}

describe('modulesApi.list', () => {
  // Block body: an arrow returning the mock would register it as a teardown and call it
  beforeEach(() => {
    vi.mocked(accountClient.get).mockReset();
  });

  it('GETs /account/modules.json through accountClient and returns the module names', async () => {
    vi.mocked(accountClient.get).mockResolvedValue({ data: { tenantId: 't-1', modules: ['CLIENT', 'FINANCE'] } });

    await expect(modulesApi.list()).resolves.toEqual(['CLIENT', 'FINANCE']);
    expect(accountClient.get).toHaveBeenCalledWith('/account/modules.json', { expectedStatuses: [404] });
  });

  it('upper-cases and de-duplicates names', async () => {
    vi.mocked(accountClient.get).mockResolvedValue({ data: { modules: ['finance', 'FINANCE', 'Trading'] } });
    await expect(modulesApi.list()).resolves.toEqual(['FINANCE', 'TRADING']);
  });

  it('returns an empty list for a tenant with no modules (zero end)', async () => {
    vi.mocked(accountClient.get).mockResolvedValue({ data: { modules: [] } });
    await expect(modulesApi.list()).resolves.toEqual([]);
  });

  it('collapses thousands of repeated names to one per module (overflow end)', async () => {
    const modules = Array.from({ length: 10_000 }, (_, i) => ['FINANCE', 'CLIENT', 'TRADING'][i % 3]);
    vi.mocked(accountClient.get).mockResolvedValue({ data: { modules } });
    await expect(modulesApi.list()).resolves.toEqual(['FINANCE', 'CLIENT', 'TRADING']);
  });

  it('returns null (unknown) on 404, a backend deployed before the endpoint existed', async () => {
    vi.mocked(accountClient.get).mockImplementation(() => Promise.reject(httpError(404)));
    await expect(modulesApi.list()).resolves.toBeNull();
  });

  it.each([401, 403, 500])('rethrows a %i instead of hiding it', async (status) => {
    vi.mocked(accountClient.get).mockImplementation(() => Promise.reject(httpError(status)));
    await expect(modulesApi.list()).rejects.toMatchObject({ response: { status } });
  });

  it('rethrows a network failure', async () => {
    vi.mocked(accountClient.get).mockImplementation(() => Promise.reject(new Error('Network Error')));
    await expect(modulesApi.list()).rejects.toThrow('Network Error');
  });

  it.each([
    ['the login page HTML an expired session is redirected to', '<!doctype html><html></html>'],
    ['an empty object', {}],
    ['a modules field that is not an array', { modules: 'FINANCE' }],
    ['an array with a non-string entry', { modules: ['FINANCE', 7] }],
    ['null', null],
  ])('throws on %s rather than reading it as "no modules"', async (_label, data) => {
    vi.mocked(accountClient.get).mockResolvedValue({ data });
    await expect(modulesApi.list()).rejects.toThrow('expected format');
  });
});

describe('isEnabledModulesResponse', () => {
  it('accepts the AccountController.modules shape and rejects the rest', () => {
    expect(isEnabledModulesResponse({ tenantId: 'x', modules: ['FINANCE'] })).toBe(true);
    expect(isEnabledModulesResponse({ modules: [] })).toBe(true);
    expect(isEnabledModulesResponse({ modules: [null] })).toBe(false);
    expect(isEnabledModulesResponse(undefined)).toBe(false);
  });
});
