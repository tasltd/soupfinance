/**
 * useLedgerAccounts — the account list behind the payment, voucher and journal-entry pickers.
 *
 * Added (SOUPFIN-175): the hook used to call listLedgerAccounts() with no params, which gets
 * the backend default of the 10 NEWEST rows. Every new vendor adds an expense account, so on
 * the LXC tenant (3,506 accounts) those 10 held no bank or cash account and the payment form's
 * "Pay From" picker was empty — no bill payment could be recorded. These tests drive the real
 * paging in listAllLedgerAccounts against a mocked transport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import type { ReactNode } from 'react';

const PAGE = 1000;

/** A backend-shaped row; the group is derived from the category's serialised path. */
function row(i: number, group: 'ASSET' | 'EXPENSE') {
  const path =
    group === 'ASSET'
      ? 'Cash and Bank < CURRENT ASSETS < ASSET'
      : 'Other Expenses < RETAINED EARNINGS < EXPENSE < RETAINED_EARNINGS < EQUITY';
  return {
    id: `acct-${i}`,
    name: `${group === 'ASSET' ? 'Bank' : 'Vendor'} account ${i}`,
    number: String(i).padStart(5, '0'),
    ledgerAccountCategory: { id: `cat-${group}`, serialised: path },
  };
}

let mockGet: ReturnType<typeof vi.fn>;

/** Serve `rows` the way LedgerAccountController.index pages them. */
function serve(rows: ReturnType<typeof row>[]) {
  mockGet.mockImplementation(async (url: string) => {
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const max = Number(params.get('max') ?? 10);
    const offset = Number(params.get('offset') ?? 0);
    return { data: rows.slice(offset, offset + max) };
  });
}

async function renderUseLedgerAccounts() {
  vi.resetModules();
  const { useLedgerAccounts } = await import('../useLedgerAccounts');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLedgerAccounts(), { wrapper });
}

describe('useLedgerAccounts (SOUPFIN-175)', () => {
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

  it('returns bank accounts that sit beyond the first 10 rows', async () => {
    // 12 vendor expense accounts first, the bank accounts after them.
    serve([
      ...Array.from({ length: 12 }, (_, i) => row(i, 'EXPENSE')),
      row(100, 'ASSET'),
      row(101, 'ASSET'),
    ]);

    const { result } = await renderUseLedgerAccounts();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(14);
    const banks = result.current.data!.filter((a) => a.ledgerGroup === 'ASSET').map((a) => a.id);
    expect(banks).toEqual(['acct-100', 'acct-101']);
    expect(mockGet.mock.calls[0][0]).toContain(`max=${PAGE}`);
  });

  it('returns an empty list for a tenant with no accounts', async () => {
    serve([]);

    const { result } = await renderUseLedgerAccounts();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('pages through 3,506 accounts and keeps every one, each once', async () => {
    const rows = Array.from({ length: 3506 }, (_, i) => row(i, i >= 3243 ? 'ASSET' : 'EXPENSE'));
    serve(rows);

    const { result } = await renderUseLedgerAccounts();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(4);
    expect(result.current.data).toHaveLength(3506);
    expect(new Set(result.current.data!.map((a) => a.id)).size).toBe(3506);
    expect(result.current.data!.filter((a) => a.ledgerGroup === 'ASSET')).toHaveLength(263);
  });

  it('surfaces a failed page as an error rather than a partial list', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500 },
    }));

    const { result } = await renderUseLedgerAccounts();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
