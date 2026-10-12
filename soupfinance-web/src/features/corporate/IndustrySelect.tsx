/**
 * Industry select shared by RegistrationPage and CompanyInfoPage.
 *
 * Added (SOUPFIN-151): one list of industry codes (src/utils/industry.ts) with
 * translated labels, so both pages send the same value to Account.industry.
 * When a business type is known, a hint says whether the chosen industry adds
 * a COA overlay to the tenant's chart of accounts.
 */
import { useTranslation } from 'react-i18next';
import type { BusinessType } from '../../api/endpoints/registration';
import { INDUSTRY_CODES, industryOverlayFor } from '../../utils/industry';
import type { IndustryCode } from '../../utils/industry';

interface IndustrySelectProps {
  value: IndustryCode | '';
  onChange: (value: IndustryCode | '') => void;
  /** Business type the chart of accounts is seeded from; enables the overlay hint. */
  businessType?: BusinessType;
  /** Base for data-testid: `${testId}-select` and `${testId}-hint`. */
  testId: string;
  className?: string;
}

export function IndustrySelect({ value, onChange, businessType, testId, className }: IndustrySelectProps) {
  const { t } = useTranslation('corporate');
  const hasOverlay = industryOverlayFor(value, businessType) !== null;

  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-light dark:text-text-dark">
        {t('industry.label')}{' '}
        <span className="font-normal text-subtle-text">{t('industry.optional')}</span>
      </span>
      <select
        name="industry"
        value={value}
        onChange={(e) => onChange(e.target.value as IndustryCode | '')}
        data-testid={`${testId}-select`}
        className={
          className ??
          'h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none'
        }
      >
        <option value="">{t('industry.placeholder')}</option>
        {INDUSTRY_CODES.map((code) => (
          <option key={code} value={code}>
            {t(`industry.options.${code}`)}
          </option>
        ))}
      </select>
      {businessType && value && (
        <span className="text-xs text-subtle-text" data-testid={`${testId}-hint`}>
          {hasOverlay ? t('industry.overlayHint') : t('industry.noOverlayHint')}
        </span>
      )}
    </label>
  );
}
