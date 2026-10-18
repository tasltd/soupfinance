/**
 * Starting selection for the chart-of-accounts template picker (SOUPFIN-147).
 * Kept out of CoaTemplatePicker.tsx so that file only exports components (fast refresh).
 */
import type { CoaTemplateIndex } from '../../api/endpoints/coaTemplates';

export interface Selection {
  template: string;
  country: string;
  industry: string;
}

/**
 * Starting selection: the server's `recommended` first, then the tenant's own
 * businessLicenceCategory and countryOfOrigin, then the first template.
 */
export function initialSelection(
  index: CoaTemplateIndex,
  tenant: { businessLicenceCategory?: string; countryOfOrigin?: string } | null
): Selection {
  const byKey = new Map(index.overlays.map((o) => [o.key, o]));
  if (index.recommended && index.templates.some((t) => t.key === index.recommended?.template)) {
    const picked = index.recommended.overlays.map((k) => byKey.get(k)).filter(Boolean);
    return {
      template: index.recommended.template,
      country: picked.find((o) => o?.kind === 'country')?.key ?? '',
      industry: picked.find((o) => o?.kind === 'industry')?.key ?? '',
    };
  }
  const template =
    index.templates.find((t) => t.businessLicenceCategory === tenant?.businessLicenceCategory) ?? index.templates[0];
  const country = tenant?.countryOfOrigin
    ? index.overlays.find(
        (o) =>
          o.kind === 'country' &&
          o.key.toUpperCase() === tenant.countryOfOrigin?.toUpperCase() &&
          (!template || o.appliesTo.includes(template.businessLicenceCategory))
      )?.key ?? ''
    : '';
  return { template: template?.key ?? '', country, industry: '' };
}
