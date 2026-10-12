/**
 * Industry classification for a tenant (Account).
 *
 * Added (SOUPFIN-151): industry used to live only inside a free-text JSON
 * `metadata` string on the corporate update, which the Corporate domain has no
 * field for, so it was dropped. It is now a first-class code sent on
 * `/account/register.json` and stored on `Account.industry`
 * (backend plan: plans/soupfin-151-industry-field-backend.md).
 *
 * The codes are the COA industry overlay keys in plans/coa-templates/industry/*.json
 * wherever an overlay exists, so the chart-of-accounts template picker
 * (SOUPFIN-147) can preselect an overlay without a lookup table that could drift.
 * Industries with no overlay get a code of their own and seed the base chart only.
 *
 * Labels live in the `corporate` i18n namespace under `industry.options.<code>`.
 */
import type { BusinessType } from '../api/endpoints/registration';

/** Every industry a tenant can pick, in display order ('other' last). */
export const INDUSTRY_CODES = [
  'agriculture',
  'construction',
  'education',
  'energy',
  'financial-services',
  'healthcare',
  'hospitality',
  'manufacturing',
  'mining',
  'non-profit',
  'professional-services',
  'retail',
  'saas',
  'telecommunications',
  'transportation',
  'other',
] as const;

export type IndustryCode = (typeof INDUSTRY_CODES)[number];

/**
 * Industries that have a COA overlay, and the base charts each overlay applies to.
 * Mirrors the `key` and `appliesTo` of plans/coa-templates/industry/*.json; the
 * industry unit test reads those files and fails if the two drift apart.
 */
export const INDUSTRY_OVERLAYS: Readonly<Partial<Record<IndustryCode, readonly BusinessType[]>>> = {
  construction: ['SERVICES', 'TRADING'],
  hospitality: ['SERVICES', 'TRADING'],
  'non-profit': ['SERVICES'],
  'professional-services': ['SERVICES'],
  retail: ['TRADING'],
  saas: ['SERVICES'],
};

/** True when `value` is one of the industry codes above. */
export function isIndustryCode(value: unknown): value is IndustryCode {
  return typeof value === 'string' && (INDUSTRY_CODES as readonly string[]).includes(value);
}

/**
 * The COA industry overlay to preselect for a tenant, or null when none applies.
 *
 * Returns null for an empty or unknown industry, for an industry with no overlay,
 * and for an overlay that does not apply to the business type (retail on a
 * SERVICES chart): the backend rejects that pairing with `overlay-not-applicable`.
 */
export function industryOverlayFor(
  industry: string | null | undefined,
  businessType: BusinessType | null | undefined
): IndustryCode | null {
  if (!isIndustryCode(industry) || !businessType) return null;
  const appliesTo = INDUSTRY_OVERLAYS[industry];
  return appliesTo?.includes(businessType) ? industry : null;
}
