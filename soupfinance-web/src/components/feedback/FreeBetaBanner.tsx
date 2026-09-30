/**
 * FreeBetaBanner — tells every user that SoupFinance is free during the beta.
 *
 * Added (SOUPFIN-89): SoupFinance is free for all users for one year of beta,
 * until November 2027. The banner sits on the dashboard, on each step of the
 * company verification (onboarding) wizard and on the sign-up form.
 *
 * It removes itself once the offer has ended, so it never advertises a free
 * period that is over.
 */
import { useTranslation } from 'react-i18next';
import { isFreeBetaActive } from './freeBeta';

interface FreeBetaBannerProps {
  testId?: string;
  className?: string;
  /** Injectable clock, for tests. */
  now?: Date;
}

export function FreeBetaBanner({ testId = 'free-beta-banner', className = '', now }: FreeBetaBannerProps) {
  const { t } = useTranslation('common');

  if (!isFreeBetaActive(now)) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 dark:bg-primary/20 p-4 ${className}`}
      role="status"
      data-testid={testId}
    >
      <span className="material-symbols-outlined text-2xl text-primary shrink-0" aria-hidden="true">
        redeem
      </span>
      <div className="flex-1">
        <p className="font-bold text-sm text-text-light dark:text-text-dark" data-testid={`${testId}-title`}>
          {t('freeBeta.title')}
        </p>
        <p className="text-sm text-subtle-text mt-1" data-testid={`${testId}-message`}>
          {t('freeBeta.message')}
        </p>
      </div>
    </div>
  );
}
