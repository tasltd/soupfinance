/**
 * KYC Onboarding Hook
 * Added (SOUPFIN-55): Resolves whether the signed-in tenant has a corporate KYC
 * application that still needs finishing, so the app can offer an entry point
 * into the onboarding wizard.
 *
 * Before this, the four `/onboarding/*` routes were only reachable from an
 * emailed link — nothing in the app ever navigated to `/onboarding/company`.
 */
import { useQuery } from '@tanstack/react-query';
import { resolveOnboardingCorporate } from '../api/endpoints/corporate';
import type { Corporate } from '../types';

export interface KycOnboardingState {
  /** Corporate whose onboarding can be resumed, or null when there is none */
  corporate: Corporate | null;
  /** Corporate id, convenient for building the `?id=` wizard links */
  corporateId: string | null;
  /** KYC status of that corporate, defaults to PENDING when unset */
  kycStatus: NonNullable<Corporate['kycStatus']> | null;
  /** True when a corporate exists and its KYC is not yet approved */
  needsOnboarding: boolean;
  isLoading: boolean;
}

/**
 * Resolve the current tenant's outstanding KYC onboarding, if any.
 *
 * Deliberately degrades quietly: this drives an optional nudge, so a failed
 * lookup means "show nothing" rather than an error state on an unrelated page.
 * The error is still exposed through react-query for anyone who needs it.
 */
export function useKycOnboarding(): KycOnboardingState {
  const { data, isLoading } = useQuery({
    queryKey: ['kyc-onboarding-corporate'],
    queryFn: resolveOnboardingCorporate,
    // The KYC status changes rarely; avoid refetching on every dashboard visit
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const corporate = data ?? null;
  const kycStatus = corporate ? (corporate.kycStatus ?? 'PENDING') : null;

  return {
    corporate,
    corporateId: corporate?.id ?? null,
    kycStatus,
    needsOnboarding: Boolean(corporate?.id) && kycStatus !== 'APPROVED',
    isLoading,
  };
}
