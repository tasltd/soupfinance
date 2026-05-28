/**
 * Unit tests for useDashboardStats permission/backend error detection
 * (SOUPFIN-2 bug 11).
 *
 * Pre-fix the hook silently swallowed 403/500s via Promise.allSettled and
 * just returned zeros. The dashboard then showed "No invoices yet" with no
 * indication anything was wrong. Now the hook surfaces a `hasPermissionError`
 * flag when any source returned 403 / 5xx / network error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../api/endpoints/invoices', () => ({
  listInvoices: vi.fn(),
}));
vi.mock('../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
}));

import { listInvoices } from '../../api/endpoints/invoices';
import { listBills } from '../../api/endpoints/bills';
import { useDashboardStats } from '../useDashboardStats';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useDashboardStats permission error detection (SOUPFIN-2 bug 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not set hasPermissionError when both endpoints succeed', async () => {
    vi.mocked(listInvoices).mockResolvedValue([]);
    vi.mocked(listBills).mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBeFalsy();
    expect(result.current.data?.partialFailureSources).toBeUndefined();
    expect(result.current.data?.totalRevenue).toBe(0);
  });

  it('marks hasPermissionError when invoices returns 403', async () => {
    vi.mocked(listInvoices).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: {} },
      message: 'Forbidden',
    });
    vi.mocked(listBills).mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBe(true);
    expect(result.current.data?.partialFailureSources).toEqual(['invoices']);
  });

  it('marks hasPermissionError when bills returns 500', async () => {
    vi.mocked(listInvoices).mockResolvedValue([]);
    vi.mocked(listBills).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
      message: 'Server Error',
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBe(true);
    expect(result.current.data?.partialFailureSources).toEqual(['bills']);
  });

  it('marks both sources as partial failures when both reject', async () => {
    vi.mocked(listInvoices).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: {} },
      message: 'Forbidden',
    });
    vi.mocked(listBills).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: {} },
      message: 'Forbidden',
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBe(true);
    expect(result.current.data?.partialFailureSources).toEqual(['invoices', 'bills']);
  });

  it('treats network errors (no response) as permission errors', async () => {
    vi.mocked(listInvoices).mockRejectedValue({
      isAxiosError: true,
      response: undefined,
      message: 'Network Error',
    });
    vi.mocked(listBills).mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBe(true);
  });

  it('does NOT mark hasPermissionError for an unrecognised 404', async () => {
    vi.mocked(listInvoices).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
      message: 'Not Found',
    });
    vi.mocked(listBills).mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasPermissionError).toBe(false);
    expect(result.current.data?.partialFailureSources).toEqual(['invoices']);
  });
});
