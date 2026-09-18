/**
 * KycOnboardingBanner — dashboard prompt that opens the company verification
 * wizard.
 *
 * Added (SOUPFIN-55): the four `/onboarding/*` routes had no entry point in the
 * app. A user could only reach step 1 from a link we emailed them, so there was
 * no way back into a half-finished application. This banner is that way back.
 */
import { Link } from 'react-router-dom';
import { useKycOnboarding } from '../../hooks';

interface KycOnboardingBannerProps {
  testId?: string;
}

export function KycOnboardingBanner({ testId }: KycOnboardingBannerProps) {
  const { corporateId, kycStatus, needsOnboarding } = useKycOnboarding();

  // Nothing to resume: either verification is approved, or this tenant has no
  // corporate application at all.
  if (!needsOnboarding || !corporateId) return null;

  const rejected = kycStatus === 'REJECTED';

  const title = rejected
    ? 'Company verification needs attention'
    : 'Company verification in progress';

  const message = rejected
    ? 'Our compliance team could not approve your application. Update your details and submit it again.'
    : 'Your company has not been verified yet. Review your details and finish the remaining steps.';

  const cta = rejected ? 'Update your application' : 'Continue verification';

  const tone = rejected
    ? 'bg-danger/10 border-danger/30'
    : 'bg-warning/10 border-warning/30';

  const iconTone = rejected ? 'text-danger' : 'text-warning';

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border p-4 ${tone}`}
      role="status"
      data-testid={testId ?? 'kyc-onboarding-banner'}
    >
      <span
        className={`material-symbols-outlined text-2xl shrink-0 ${iconTone}`}
        aria-hidden="true"
      >
        {rejected ? 'error' : 'verified_user'}
      </span>

      <div className="flex-1">
        <p
          className="font-bold text-sm text-text-light dark:text-text-dark"
          data-testid="kyc-onboarding-banner-title"
        >
          {title}
        </p>
        <p className="text-sm text-subtle-text mt-1">{message}</p>
      </div>

      <Link
        to={`/onboarding/company?id=${corporateId}`}
        className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 shrink-0"
        data-testid="kyc-onboarding-banner-cta"
      >
        <span className="truncate">{cta}</span>
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          arrow_forward
        </span>
      </Link>
    </div>
  );
}
