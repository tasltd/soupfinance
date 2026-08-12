/**
 * Unit tests for the domainData tax catalogue.
 *
 * Covers SOUPFIN-37: `listTaxRates()` previously returned a hardcoded list whose ids
 * ("tax-vat-15", "tax-none", …) do not exist in the backend `tax_entry` table. Line-item
 * tax is persisted as `TaxEntryInvoiceItem` rows referencing a real `TaxEntry.id`, so
 * every tax selected from that catalogue was silently discarded on save.
 *
 * The fixtures below are verbatim captures from `/rest/taxEntry/index.json` on the
 * LXC backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

/** Verbatim subset of /rest/taxEntry/index.json from the LXC backend. */
const REAL_TAX_ENTRIES = [
  {
    id: 'ff8081817fe4ae93017fe5c9cf10017b',
    abbreviation: 'CST',
    name: 'CST',
    description: 'Comsys',
    taxRate: 5.0,
    isTaxable: true,
    serialised: 'CST-5.0%',
  },
  {
    id: 'ff80818186941f2701869cb315b11dda',
    abbreviation: 'VAT-S',
    name: 'VAT- STANDARD',
    description: 'New Standard rate',
    taxRate: 15.0,
    isCompoundTax: true,
    serialised: 'VAT-S-15.0%',
  },
  {
    id: 'ff8081817f6b33e7017f6d575b310005',
    abbreviation: 'WHT-S',
    name: 'Withholding Tax-Services',
    taxRate: 7.5,
    isWithholdingTax: true,
    serialised: 'WHT-S-7.5%',
  },
  {
    id: 'ff80818196cf615b0196cf80f6f40007',
    abbreviation: 'Covid 19',
    name: 'Covid 19',
    taxRate: 1.0,
    isTaxable: true,
    serialised: 'Covid 19-1.0%',
  },
];

describe('listTaxRates (SOUPFIN-37)', () => {
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    });
  });

  async function load() {
    vi.resetModules();
    return (await import('../domainData')).listTaxRates;
  }

  it('fetches the real TaxEntry catalogue instead of returning hardcoded data', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: REAL_TAX_ENTRIES });

    await listTaxRates();

    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/taxEntry/index.json'));
  });

  it('returns real backend UUIDs — never synthetic ids', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: REAL_TAX_ENTRIES });

    const rates = await listTaxRates();

    // Regression guard for the root cause: a synthetic id can never be persisted.
    expect(rates.every((r) => !r.id.startsWith('tax-'))).toBe(true);
    expect(rates.map((r) => r.id)).toContain('ff8081817fe4ae93017fe5c9cf10017b');
  });

  it('maps name, rate, description and the withholding flag', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: REAL_TAX_ENTRIES });

    const rates = await listTaxRates();
    const cst = rates.find((r) => r.id === 'ff8081817fe4ae93017fe5c9cf10017b');

    expect(cst).toMatchObject({
      name: 'CST',
      rate: 5,
      description: 'Comsys',
      isWithholdingTax: false,
      serialised: 'CST-5.0%',
    });

    const wht = rates.find((r) => r.serialised === 'WHT-S-7.5%');
    expect(wht?.isWithholdingTax).toBe(true);
  });

  it('excludes compound taxes, which the backend computes on top of other taxes', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: REAL_TAX_ENTRIES });

    const rates = await listTaxRates();

    expect(rates.find((r) => r.serialised === 'VAT-S-15.0%')).toBeUndefined();
    expect(rates).toHaveLength(3);
  });

  it('sorts by rate ascending', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: REAL_TAX_ENTRIES });

    const rates = await listTaxRates();
    expect(rates.map((r) => r.rate)).toEqual([1, 5, 7.5]);
  });

  it('falls back to the abbreviation when name is missing', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: [{ id: 'x1', abbreviation: 'NHIL', taxRate: 2.5 }] });

    const rates = await listTaxRates();
    expect(rates[0].name).toBe('NHIL');
  });

  it('coerces a missing/invalid taxRate to 0 rather than NaN', async () => {
    const listTaxRates = await load();
    mockGet.mockResolvedValue({ data: [{ id: 'x1', name: 'Broken' }] });

    const rates = await listTaxRates();
    expect(rates[0].rate).toBe(0);
  });

  it('returns an empty array when the backend returns null or an empty list', async () => {
    const listTaxRates = await load();

    mockGet.mockResolvedValue({ data: null });
    expect(await listTaxRates()).toEqual([]);

    mockGet.mockResolvedValue({ data: [] });
    expect(await listTaxRates()).toEqual([]);
  });

  it('propagates a backend failure instead of silently returning stale defaults', async () => {
    const listTaxRates = await load();
    mockGet.mockRejectedValue(new Error('Request failed with status code 403'));

    // Swallowing this would re-introduce a dropdown of unpersistable options.
    await expect(listTaxRates()).rejects.toThrow(/403/);
  });
});
