/**
 * Added (SOUPFIN-176): useLedgerAccounts must return every ledger account, not the
 * backend's default first page of 10. The payment form filters this list to ASSET
 * accounts for its bank/cash dropdown; with only the 10 newest rows (vendor-generated
 * expense accounts) that dropdown was empty and no payment could be saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import apiClient from '../../api/client';
import { useLedgerAccounts } from '../useLedgerAccounts';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  default: { get: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Raw backend row; the group is derived from the category's serialised string. */
function rawAccount(id: string, group: 'ASSET' | 'EXPENSE') {
  return {
    id,
    name: `Account ${id}`,
    serialised: `Account ${id}[ Some Category < ${group} ] - GHS`,
    ledgerAccountCategory: { id: `cat-${group}`, serialised: `Some Category < ${group}` },
  };
}

describe('useLedgerAccounts (SOUPFIN-176)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('asks for a full page instead of the backend default of 10', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [rawAccount('a1', 'ASSET')] });
    const { result } = renderHook(() => useLedgerAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = String(vi.mocked(apiClient.get).mock.calls[0][0]);
    expect(url).toMatch(/^\/ledgerAccount\/index\.json\?/);
    expect(url).toContain('max=1000');
    expect(url).toContain('offset=0');
  });

  it('returns accounts beyond the first page, so ASSET accounts are not cut off', async () => {
    // Page 1: 1000 expense accounts (the newest rows). Page 2: the bank account.
    const page1 = Array.from({ length: 1000 }, (_, i) => rawAccount(`e${i}`, 'EXPENSE'));
    const page2 = [rawAccount('bank-1', 'ASSET')];
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const { result } = renderHook(() => useLedgerAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(apiClient.get).mock.calls[1][0])).toContain('offset=1000');
    expect(result.current.data).toHaveLength(1001);
    expect(result.current.data?.filter((a) => a.ledgerGroup === 'ASSET').map((a) => a.id)).toEqual([
      'bank-1',
    ]);
  });

  it('returns an empty list when the tenant has no accounts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useLedgerAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces a backend error instead of an empty dropdown', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Request failed with status code 500'));
    const { result } = renderHook(() => useLedgerAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
