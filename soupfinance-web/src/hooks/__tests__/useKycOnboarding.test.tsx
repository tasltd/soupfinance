/**
 * Unit tests for useKycOnboarding (SOUPFIN-55).
 *
 * The hook resolves the corporate whose KYC onboarding the signed-in user can
 * resume. It drives the dashboard entry point into /onboarding/company, which
 * previously had no in-app entry point at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../api/endpoints/corporate', () => ({
  resolveOnboardingCorporate: vi.fn(),
}));

import { resolveOnboardingCorporate } from '../../api/endpoints/corporate';
import { useKycOnboarding } from '../useKycOnboarding';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const corporate = {
  id: 'corp-001',
  name: 'Acme Ltd',
  certificateOfIncorporationNumber: 'C-1',
  registrationDate: '2020-01-01',
};

describe('useKycOnboarding (SOUPFIN-55)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags onboarding as needed when the corporate KYC is PENDING', async () => {
    vi.mocked(resolveOnboardingCorporate).mockResolvedValue({
      ...corporate,
      kycStatus: 'PENDING',
    } as never);

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.corporateId).toBe('corp-001');
    expect(result.current.kycStatus).toBe('PENDING');
  });

  it('flags onboarding as needed when the corporate KYC is REJECTED', async () => {
    vi.mocked(resolveOnboardingCorporate).mockResolvedValue({
      ...corporate,
      kycStatus: 'REJECTED',
    } as never);

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.kycStatus).toBe('REJECTED');
  });

  it('defaults a corporate with no kycStatus to PENDING and still needs onboarding', async () => {
    vi.mocked(resolveOnboardingCorporate).mockResolvedValue(corporate as never);

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.kycStatus).toBe('PENDING');
    expect(result.current.needsOnboarding).toBe(true);
  });

  it('does not need onboarding once KYC is APPROVED', async () => {
    vi.mocked(resolveOnboardingCorporate).mockResolvedValue({
      ...corporate,
      kycStatus: 'APPROVED',
    } as never);

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
    expect(result.current.corporateId).toBe('corp-001');
  });

  it('reports nothing to resume when the tenant has no corporate', async () => {
    vi.mocked(resolveOnboardingCorporate).mockResolvedValue(null);

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.corporate).toBeNull();
    expect(result.current.corporateId).toBeNull();
    expect(result.current.kycStatus).toBeNull();
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('degrades quietly when the lookup fails rather than claiming onboarding is needed', async () => {
    vi.mocked(resolveOnboardingCorporate).mockRejectedValue(
      new Error('Request failed with status code 403')
    );

    const { result } = renderHook(() => useKycOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
    expect(result.current.corporateId).toBeNull();
  });
});
