/**
 * Unit tests for KycOnboardingBanner (SOUPFIN-55).
 *
 * The banner is the app's only entry point into /onboarding/company. Before it
 * existed, a user whose company verification was half-finished had no way back
 * into the wizard unless they still had the email we sent them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseKycOnboarding = vi.fn();

vi.mock('../../../hooks', () => ({
  useKycOnboarding: () => mockUseKycOnboarding(),
}));

import { KycOnboardingBanner } from '../KycOnboardingBanner';

function renderBanner() {
  return render(
    <MemoryRouter>
      <KycOnboardingBanner />
    </MemoryRouter>
  );
}

describe('KycOnboardingBanner (SOUPFIN-55)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links into the onboarding wizard with the corporate id when KYC is pending', () => {
    mockUseKycOnboarding.mockReturnValue({
      corporate: { id: 'corp-001' },
      corporateId: 'corp-001',
      kycStatus: 'PENDING',
      needsOnboarding: true,
      isLoading: false,
    });

    renderBanner();

    expect(screen.getByTestId('kyc-onboarding-banner')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-onboarding-banner-title')).toHaveTextContent(
      'Company verification in progress'
    );

    const cta = screen.getByTestId('kyc-onboarding-banner-cta');
    expect(cta).toHaveAttribute('href', '/onboarding/company?id=corp-001');
    expect(cta).toHaveTextContent('Continue verification');
  });

  it('shows the rejected wording and still links into the wizard', () => {
    mockUseKycOnboarding.mockReturnValue({
      corporate: { id: 'corp-002' },
      corporateId: 'corp-002',
      kycStatus: 'REJECTED',
      needsOnboarding: true,
      isLoading: false,
    });

    renderBanner();

    expect(screen.getByTestId('kyc-onboarding-banner-title')).toHaveTextContent(
      'Company verification needs attention'
    );
    expect(screen.getByTestId('kyc-onboarding-banner-cta')).toHaveAttribute(
      'href',
      '/onboarding/company?id=corp-002'
    );
  });

  it('renders nothing once verification is approved', () => {
    mockUseKycOnboarding.mockReturnValue({
      corporate: { id: 'corp-003' },
      corporateId: 'corp-003',
      kycStatus: 'APPROVED',
      needsOnboarding: false,
      isLoading: false,
    });

    renderBanner();

    expect(screen.queryByTestId('kyc-onboarding-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when the tenant has no corporate application', () => {
    mockUseKycOnboarding.mockReturnValue({
      corporate: null,
      corporateId: null,
      kycStatus: null,
      needsOnboarding: false,
      isLoading: false,
    });

    renderBanner();

    expect(screen.queryByTestId('kyc-onboarding-banner')).not.toBeInTheDocument();
  });

  it('renders nothing while the lookup is still loading', () => {
    mockUseKycOnboarding.mockReturnValue({
      corporate: null,
      corporateId: null,
      kycStatus: null,
      needsOnboarding: false,
      isLoading: true,
    });

    renderBanner();

    expect(screen.queryByTestId('kyc-onboarding-banner')).not.toBeInTheDocument();
  });

  it('does not render a broken link if needsOnboarding is set without an id', () => {
    // Defensive: a truthy flag with no id would produce /onboarding/company?id=null
    mockUseKycOnboarding.mockReturnValue({
      corporate: null,
      corporateId: null,
      kycStatus: 'PENDING',
      needsOnboarding: true,
      isLoading: false,
    });

    renderBanner();

    expect(screen.queryByTestId('kyc-onboarding-banner')).not.toBeInTheDocument();
  });
});
