/**
 * Unit tests for the chart-of-accounts template API (SOUPFIN-147).
 *
 *   - listCoaTemplates: GET /rest/coaTemplate/index.json, normalised so a missing
 *     list or recommendation never crashes the picker.
 *   - applyCoaTemplate: fetches a fresh CSRF token from ledgerAccount/create.json
 *     for EVERY call (dry run included) and posts { template, overlays, dryRun }.
 *   - templateAccountGroup: server ledgerGroup first, number-range fallback.
 *   - composeTemplatePreview: base minus overlay removes, plus overlay adds.
 *
 * Note: axios is mocked globally via test/setup.ts. Modules are imported
 * dynamically after installing the per-test axios mock (matches bills.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { CoaTemplate, CoaTemplateOverlay, CoaTemplateAccount } from '../coaTemplates';

const acc = (number: string, name = `Account ${number}`, extra: Partial<CoaTemplateAccount> = {}): CoaTemplateAccount => ({
  number,
  name,
  ledgerAccountCategory: 'CAT',
  ...extra,
});

const template = (preview: CoaTemplateAccount[]): CoaTemplate => ({
  key: 'services',
  name: 'Services business',
  businessLicenceCategory: 'SERVICES',
  accountCount: preview.length,
  categoryCount: 1,
  systemAccountCount: 0,
  preview,
  previewTruncated: false,
});

const overlay = (key: string, add: CoaTemplateAccount[], removes: string[] = []): CoaTemplateOverlay => ({
  key,
  kind: 'country',
  name: key,
  appliesTo: ['SERVICES'],
  addCount: add.length,
  removeCount: removes.length,
  preview: add,
  removes,
});

describe('coaTemplates API (SOUPFIN-147)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGet = vi.fn();
    mockPost = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      delete: vi.fn(),
    });
  });

  describe('listCoaTemplates', () => {
    it('reads /coaTemplate/index.json and returns templates, overlays and the recommendation', async () => {
      const { listCoaTemplates } = await import('../coaTemplates');
      const body = {
        templates: [template([acc('1000')])],
        overlays: [overlay('GH', [acc('1020')])],
        recommended: { template: 'services', overlays: ['GH'] },
      };
      mockGet.mockResolvedValue({ data: body });

      const index = await listCoaTemplates();

      expect(mockGet).toHaveBeenCalledWith('/coaTemplate/index.json');
      expect(index).toEqual(body);
    });

    it('normalises an empty or partial body (zero templates, no recommendation)', async () => {
      const { listCoaTemplates } = await import('../coaTemplates');
      mockGet.mockResolvedValue({ data: {} });
      expect(await listCoaTemplates()).toEqual({ templates: [], overlays: [], recommended: null });

      mockGet.mockResolvedValue({ data: null });
      expect(await listCoaTemplates()).toEqual({ templates: [], overlays: [], recommended: null });
    });

    it('lets a 403 propagate instead of looking like "no templates"', async () => {
      const { listCoaTemplates } = await import('../coaTemplates');
      mockGet.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }));
      await expect(listCoaTemplates()).rejects.toThrow('403');
    });
  });

  describe('applyCoaTemplate', () => {
    it('fetches a fresh CSRF token per call and posts the selection with the token in the URL', async () => {
      const { applyCoaTemplate } = await import('../coaTemplates');
      mockGet
        .mockResolvedValueOnce({ data: { SYNCHRONIZER_TOKEN: 'tok-1', SYNCHRONIZER_URI: '/ledgerAccount/create' } })
        .mockResolvedValueOnce({ data: { SYNCHRONIZER_TOKEN: 'tok-2', SYNCHRONIZER_URI: '/ledgerAccount/create' } });
      const result = { dryRun: true, summary: { created: 3 } };
      mockPost.mockResolvedValue({ data: result });

      expect(await applyCoaTemplate({ template: 'services', overlays: ['GH'], dryRun: true })).toEqual(result);
      await applyCoaTemplate({ template: 'services', overlays: ['GH'], dryRun: false });

      expect(mockGet).toHaveBeenNthCalledWith(1, '/ledgerAccount/create.json');
      expect(mockGet).toHaveBeenNthCalledWith(2, '/ledgerAccount/create.json');
      const [url1, body1] = mockPost.mock.calls[0];
      const [url2, body2] = mockPost.mock.calls[1];
      expect(url1).toBe('/ledgerAccount/applyTemplate.json?SYNCHRONIZER_TOKEN=tok-1&SYNCHRONIZER_URI=%2FledgerAccount%2Fcreate');
      expect(url2).toContain('SYNCHRONIZER_TOKEN=tok-2');
      expect(body1).toEqual({ template: 'services', overlays: ['GH'], dryRun: true });
      expect(body2).toEqual({ template: 'services', overlays: ['GH'], dryRun: false });
    });

    it('propagates a 409 apply-conflict to the caller', async () => {
      const { applyCoaTemplate } = await import('../coaTemplates');
      mockGet.mockResolvedValue({ data: { SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: 'u' } });
      mockPost.mockRejectedValue(Object.assign(new Error('Request failed with status code 409'), { response: { status: 409 } }));
      await expect(applyCoaTemplate({ template: 'services', overlays: [], dryRun: false })).rejects.toThrow('409');
    });
  });

  describe('templateAccountGroup', () => {
    it('uses the server ledgerGroup when present, even against the number range', async () => {
      const { templateAccountGroup } = await import('../coaTemplates');
      expect(templateAccountGroup({ number: '1000', ledgerGroup: 'INCOME' })).toBe('INCOME');
    });

    it('falls back to the number range: 1 asset, 2 liability, 3 equity, 4 income, else expense', async () => {
      const { templateAccountGroup } = await import('../coaTemplates');
      expect(templateAccountGroup({ number: '1010' })).toBe('ASSET');
      expect(templateAccountGroup({ number: '2310', ledgerGroup: null })).toBe('LIABILITY');
      expect(templateAccountGroup({ number: '3100' })).toBe('EQUITY');
      expect(templateAccountGroup({ number: '4000' })).toBe('INCOME');
      expect(templateAccountGroup({ number: '5200' })).toBe('EXPENSE');
      expect(templateAccountGroup({ number: '9999' })).toBe('EXPENSE');
    });

    it('treats a missing or empty number as an expense rather than throwing', async () => {
      const { templateAccountGroup } = await import('../coaTemplates');
      expect(templateAccountGroup({ number: '' })).toBe('EXPENSE');
      expect(templateAccountGroup({ number: undefined as unknown as string })).toBe('EXPENSE');
    });
  });

  describe('composeTemplatePreview', () => {
    it('returns the base sorted by number when no overlay is chosen', async () => {
      const { composeTemplatePreview } = await import('../coaTemplates');
      const rows = composeTemplatePreview(template([acc('5000'), acc('1000'), acc('10000')]), []);
      expect(rows.map((r) => r.number)).toEqual(['1000', '5000', '10000']);
    });

    it('drops the overlay removes, adds new rows and replaces rows with the same number', async () => {
      const { composeTemplatePreview } = await import('../coaTemplates');
      const base = template([acc('1000', 'Cash'), acc('2310', 'Sales Tax Payable'), acc('5000', 'Wages')]);
      const gh = overlay('GH', [acc('1020', 'Mobile Money Wallets'), acc('5000', 'Salaries and SSNIT')], ['2310']);

      const rows = composeTemplatePreview(base, [gh]);

      expect(rows.map((r) => `${r.number} ${r.name}`)).toEqual([
        '1000 Cash',
        '1020 Mobile Money Wallets',
        '5000 Salaries and SSNIT',
      ]);
      // The base template object is not mutated
      expect(base.preview.map((r) => r.number)).toEqual(['1000', '2310', '5000']);
    });

    it('applies overlays in order: a later overlay can remove what an earlier one added', async () => {
      const { composeTemplatePreview } = await import('../coaTemplates');
      const rows = composeTemplatePreview(template([acc('1000')]), [
        overlay('GH', [acc('1020')]),
        overlay('NOMOMO', [], ['1020']),
      ]);
      expect(rows.map((r) => r.number)).toEqual(['1000']);
    });

    it('handles an overflow-sized template (2000 accounts plus a 500-row overlay)', async () => {
      const { composeTemplatePreview } = await import('../coaTemplates');
      const base = template(Array.from({ length: 2000 }, (_, i) => acc(String(100000 + i))));
      const big = overlay('BIG', Array.from({ length: 500 }, (_, i) => acc(String(200000 + i))), ['100000']);
      const rows = composeTemplatePreview(base, [big]);
      expect(rows).toHaveLength(2499);
      expect(rows[0].number).toBe('100001');
      expect(rows[rows.length - 1].number).toBe('200499');
    });
  });
});
