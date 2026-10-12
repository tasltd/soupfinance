/**
 * Chart-of-accounts template API (SOUPFIN-147)
 *
 * Contract: plans/soupfin-145-apply-template-endpoints.html (revision 2), with the
 * runnable reference in plans/coa-templates/apply.mjs. Field names below mirror the
 * response keys that reference returns; the Grails port returns the same keys.
 *
 *   GET  /rest/coaTemplate/index.json            -> listCoaTemplates()
 *   POST /rest/ledgerAccount/applyTemplate.json  -> applyCoaTemplate()
 *
 * applyTemplate sits behind withForm, so every POST (dry run included) needs a fresh
 * single-use token from /rest/ledgerAccount/create.json.
 */
import apiClient, { getCsrfToken, csrfQueryString } from '../client';
import type { LedgerGroup } from '../../types';

/** Statement section of a template account. Never REVENUE: the backend reports INCOME. */
export type CoaTemplateGroup = Extract<LedgerGroup, 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'>;

export interface CoaTemplateAccount {
  number: string;
  name: string;
  /** LedgerAccountCategory name, e.g. "CASH ON HAND" */
  ledgerAccountCategory: string;
  /** Statement section (contract revision 2). Older servers may omit it. */
  ledgerGroup?: CoaTemplateGroup | null;
  parentAccount?: string | null;
  accountType?: string | null;
  systemAccount?: boolean;
}

export interface CoaTemplate {
  key: string;
  name: string;
  description?: string | null;
  businessLicenceCategory: string;
  accountCount: number;
  categoryCount: number;
  systemAccountCount: number;
  preview: CoaTemplateAccount[];
  previewTruncated: boolean;
}

export interface CoaTemplateOverlay {
  key: string;
  kind: 'country' | 'industry';
  name: string;
  description?: string | null;
  /** businessLicenceCategory values this overlay can sit on */
  appliesTo: string[];
  addCount: number;
  removeCount: number;
  preview: CoaTemplateAccount[];
  /** account numbers the overlay drops from the base */
  removes: string[];
}

export interface CoaTemplateIndex {
  templates: CoaTemplate[];
  overlays: CoaTemplateOverlay[];
  /** null when the tenant's licence category has no template (a brokerage tenant) */
  recommended: { template: string; overlays: string[] } | null;
}

export interface CoaApplyRequest {
  template: string;
  overlays: string[];
  dryRun: boolean;
}

export interface CoaApplySkipped {
  number: string;
  name: string;
  reason: 'number-exists' | 'name-exists' | string;
  existingName?: string;
  existingNumber?: string;
  archived?: boolean;
}

export interface CoaApplyResult {
  dryRun: boolean;
  template: string;
  overlays: string[];
  composedKey: string;
  created: CoaTemplateAccount[];
  skipped: CoaApplySkipped[];
  categoriesCreated: string[];
  problems: string[];
  summary: { templateAccounts: number; created: number; skipped: number; categoriesCreated: number };
}

/** GET /rest/coaTemplate/index.json */
export async function listCoaTemplates(): Promise<CoaTemplateIndex> {
  const response = await apiClient.get<CoaTemplateIndex>('/coaTemplate/index.json');
  const data = response.data;
  return {
    templates: data?.templates ?? [],
    overlays: data?.overlays ?? [],
    recommended: data?.recommended ?? null,
  };
}

/**
 * POST /rest/ledgerAccount/applyTemplate.json
 *
 * A dry run writes nothing and returns exactly what the real run then creates.
 * Errors (422 validation, 409 invalid-token / apply-conflict, 403) propagate so the
 * caller can show them; nothing is swallowed.
 */
export async function applyCoaTemplate(request: CoaApplyRequest): Promise<CoaApplyResult> {
  const csrf = await getCsrfToken('ledgerAccount');
  const response = await apiClient.post<CoaApplyResult>(
    `/ledgerAccount/applyTemplate.json?${csrfQueryString(csrf)}`,
    { template: request.template, overlays: request.overlays, dryRun: request.dryRun }
  );
  return response.data;
}

const GROUP_BY_PREFIX: Record<string, CoaTemplateGroup> = {
  '1': 'ASSET',
  '2': 'LIABILITY',
  '3': 'EQUITY',
  '4': 'INCOME',
};

/**
 * Statement section for a template account: the server's ledgerGroup when present,
 * otherwise the number range every template follows (1 asset, 2 liability, 3 equity,
 * 4 income, 5-9 expense; asserted for every shipped row by apply.test.mjs).
 */
export function templateAccountGroup(account: Pick<CoaTemplateAccount, 'number' | 'ledgerGroup'>): CoaTemplateGroup {
  if (account.ledgerGroup) return account.ledgerGroup;
  return GROUP_BY_PREFIX[String(account.number ?? '').charAt(0)] ?? 'EXPENSE';
}

/**
 * The account list a selection seeds, composed locally from the index previews the
 * way compose() does it: base, then each overlay drops its `removes` and adds (or
 * replaces) its rows. Sorted by number. Used for the picker's preview before the
 * dry run; the dry run stays the source of truth for what is actually created.
 */
export function composeTemplatePreview(template: CoaTemplate, overlays: CoaTemplateOverlay[]): CoaTemplateAccount[] {
  let accounts = [...template.preview];
  for (const overlay of overlays) {
    const removed = new Set(overlay.removes ?? []);
    accounts = accounts.filter((a) => !removed.has(a.number));
    for (const add of overlay.preview ?? []) {
      const idx = accounts.findIndex((a) => a.number === add.number);
      if (idx === -1) accounts.push(add);
      else accounts[idx] = add;
    }
  }
  return accounts.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
}
