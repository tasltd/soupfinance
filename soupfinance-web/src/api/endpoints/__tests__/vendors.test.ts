/**
 * Added (SOUPFIN-182): unit tests for the vendors API module.
 *
 * Covers the CSRF save path (create.json token -> save.json query params, the
 * new fields in the JSON body), update without CSRF, and listVendors routing
 * archived lists to archived.json (index.json always filters archived=false).
 *
 * Note: axios is mocked globally via test/setup.ts. Modules are imported
 * dynamically after installing the per-test axios mock (matches bills.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { Vendor } from '../../../types';

describe('vendors API (SOUPFIN-182)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;
  let mockPut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGet = vi.fn();
    mockPost = vi.fn();
    mockPut = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: vi.fn(),
    });
  });

  describe('createVendor', () => {
    it('fetches the token from trading/vendor/create.json and sends it as query params', async () => {
      // Grails nests the token under the bare controller name, not "trading/vendor"
      mockGet.mockResolvedValue({
        data: { vendor: { SYNCHRONIZER_TOKEN: 'tok-123', SYNCHRONIZER_URI: '/trading/vendor/create' } },
      });
      mockPost.mockResolvedValue({ data: { id: 'vendor-new', name: 'Acme' } });
      const { createVendor } = await import('../vendors');

      const body = {
        name: 'Acme',
        symbol: 'ACME',
        vendorType: 'SUPPLIER' as const,
        postalAddress: 'P.O. Box 1',
        ledgerAccount: { id: 'la-ap' },
      };
      const created = await createVendor(body);

      expect(mockGet).toHaveBeenCalledWith('/trading/vendor/create.json');
      const [url, sent] = mockPost.mock.calls[0];
      const [path, query] = url.split('?');
      expect(path).toBe('/trading/vendor/save.json');
      const params = new URLSearchParams(query);
      expect(params.get('SYNCHRONIZER_TOKEN')).toBe('tok-123');
      expect(params.get('SYNCHRONIZER_URI')).toBe('/trading/vendor/create');
      // JSON body, FK as a nested object, token not duplicated into the body
      expect(sent).toEqual(body);
      expect(sent).not.toHaveProperty('SYNCHRONIZER_TOKEN');
      expect(created).toEqual({ id: 'vendor-new', name: 'Acme' });
    });

    it('still posts when create.json carries no token (empty params, no throw)', async () => {
      mockGet.mockResolvedValue({ data: {} });
      mockPost.mockResolvedValue({ data: { id: 'v1' } });
      const { createVendor } = await import('../vendors');

      await createVendor({ name: 'No Token Ltd' });

      expect(mockPost.mock.calls[0][0]).toBe('/trading/vendor/save.json?SYNCHRONIZER_TOKEN=&SYNCHRONIZER_URI=');
    });
  });

  describe('updateVendor', () => {
    it('PUTs without a CSRF fetch and includes the id and cleared (null) fields', async () => {
      mockPut.mockResolvedValue({ data: { id: 'v1', archived: true } });
      const { updateVendor } = await import('../vendors');

      // The form sends null for a field the user cleared (see VendorFormPage toVendorPayload)
      const cleared = { name: 'Acme', archived: true, symbol: null, ledgerAccount: null } as unknown as Partial<Vendor>;
      await updateVendor('v1', cleared);

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPut).toHaveBeenCalledWith('/trading/vendor/update/v1.json', {
        name: 'Acme',
        archived: true,
        symbol: null,
        ledgerAccount: null,
        id: 'v1',
      });
    });
  });

  describe('listVendors', () => {
    it('lists active vendors from index.json with paging params', async () => {
      mockGet.mockResolvedValue({ data: [] });
      const { listVendors } = await import('../vendors');

      await listVendors({ max: 20, offset: 40, sort: 'name', order: 'asc', search: undefined });

      expect(mockGet).toHaveBeenCalledWith('/trading/vendor/index.json?max=20&offset=40&sort=name&order=asc');
    });

    it('lists archived vendors from archived.json and drops the archived flag from the query', async () => {
      mockGet.mockResolvedValue({ data: [{ id: 'v9', name: 'Old', archived: true, totalCount: 1 }] });
      const { listVendors } = await import('../vendors');

      const rows = await listVendors({ max: 20, offset: 0, archived: true, search: 'old' });

      expect(mockGet).toHaveBeenCalledWith('/trading/vendor/archived.json?max=20&offset=0&search=old');
      expect(rows).toEqual([{ id: 'v9', name: 'Old', archived: true, totalCount: 1 }]);
    });

    it('sends no query string when called without params', async () => {
      mockGet.mockResolvedValue({ data: [] });
      const { listVendors } = await import('../vendors');

      await listVendors();

      expect(mockGet).toHaveBeenCalledWith('/trading/vendor/index.json');
    });
  });
});
