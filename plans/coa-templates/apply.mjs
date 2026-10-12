// Reference implementation of the SOUPFIN-145 endpoints:
//   GET  /rest/coaTemplate/index.json           -> listTemplates()
//   POST /rest/ledgerAccount/applyTemplate.json -> applyTemplate()
//
// The backend (soupmarkets-web) ports these one for one into CoaTemplateController,
// LedgerAccountController.applyTemplate and CoaTemplateService.apply. The response
// shapes below are the contract SOUPFIN-147 (the frontend template picker) builds on.
// apply.test.mjs holds the acceptance checks the Spock specs must port.
//
// Run the checks with: node --test plans/coa-templates/*.test.mjs

import { compose, validate } from './compose.mjs';

// Roles allowed to list and apply templates. The ticket says "ROLE_ADMIN or the
// accountant role"; the backend has no ROLE_ACCOUNTANT, and SbRole documents
// ROLE_FINANCE as "Financial operations access", so ROLE_FINANCE is that role.
export const APPLY_ROLES = Object.freeze(['ROLE_ADMIN', 'ROLE_FINANCE']);

// One country overlay and one industry overlay at most: compose() takes one of each.
export const MAX_OVERLAYS = 2;

// How many accounts the index previews per template. Every base has 69-73 accounts,
// so the whole list fits; the cap only stops a future 500-account template bloating the index.
export const PREVIEW_LIMIT = 100;

export class ApplyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function canApply(authorities = []) {
  return authorities.some((a) => APPLY_ROLES.includes(a));
}

function overlayIndex(catalogue) {
  const index = new Map();
  for (const c of Object.values(catalogue.countries)) index.set(c.country, { kind: 'country', overlay: c });
  for (const i of Object.values(catalogue.industries)) {
    if (index.has(i.key)) throw new Error(`overlay key ${i.key} is both a country and an industry`);
    index.set(i.key, { kind: 'industry', overlay: i });
  }
  return index;
}

function previewAccount(a) {
  return {
    number: a.number,
    name: a.name,
    ledgerAccountCategory: a.ledgerAccountCategory,
    parentAccount: a.parentAccount ?? null,
    accountType: a.accountType ?? null,
    systemAccount: Boolean(a.systemAccount),
  };
}

/**
 * GET /rest/coaTemplate/index.json
 * @param tenant optional { businessLicenceCategory, country } of the caller's Account,
 *               used only to fill `recommended`.
 */
export function listTemplates(catalogue, tenant = null) {
  const templates = Object.values(catalogue.bases)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((base) => {
      const composed = compose(catalogue, { businessLicenceCategory: base.businessLicenceCategory });
      return {
        key: base.key,
        name: base.name,
        description: base.description ?? null,
        businessLicenceCategory: base.businessLicenceCategory,
        accountCount: composed.accounts.length,
        categoryCount: composed.categories.length,
        systemAccountCount: composed.accounts.filter((a) => a.systemAccount).length,
        preview: composed.accounts.slice(0, PREVIEW_LIMIT).map(previewAccount),
        previewTruncated: composed.accounts.length > PREVIEW_LIMIT,
      };
    });

  const overlays = [...overlayIndex(catalogue).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { kind, overlay }]) => ({
      key,
      kind,
      name: overlay.name,
      description: overlay.description ?? null,
      appliesTo: kind === 'industry' ? overlay.appliesTo : Object.keys(catalogue.bases).sort(),
      addCount: (overlay.add ?? []).length,
      removeCount: (overlay.remove ?? []).length,
      preview: (overlay.add ?? []).map(previewAccount),
      removes: overlay.remove ?? [],
    }));

  let recommended = null;
  const base = tenant && Object.values(catalogue.bases).find((b) => b.businessLicenceCategory === tenant.businessLicenceCategory);
  if (base) {
    recommended = {
      template: base.key,
      overlays: tenant.country && catalogue.countries[tenant.country] ? [tenant.country] : [],
    };
  }
  return { templates, overlays, recommended };
}

function parseDryRun(value) {
  if (value === undefined || value === null || value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  throw new ApplyError(422, 'invalid-dry-run', `dryRun must be true or false, not ${JSON.stringify(value)}`);
}

/** Turn the request body into a compose() selection, or throw a 422 ApplyError. */
export function resolveSelection(catalogue, body) {
  const templateKey = body?.template;
  if (typeof templateKey !== 'string' || !templateKey.trim()) {
    throw new ApplyError(422, 'template-required', 'template is required');
  }
  const base = Object.values(catalogue.bases).find((b) => b.key === templateKey);
  if (!base) throw new ApplyError(422, 'unknown-template', `No template ${templateKey}`);

  const overlays = body.overlays ?? [];
  if (!Array.isArray(overlays)) throw new ApplyError(422, 'invalid-overlays', 'overlays must be a list');
  if (overlays.length > MAX_OVERLAYS) {
    throw new ApplyError(422, 'too-many-overlays', `At most ${MAX_OVERLAYS} overlays (one country, one industry), got ${overlays.length}`);
  }

  const index = overlayIndex(catalogue);
  const selection = { businessLicenceCategory: base.businessLicenceCategory, country: null, industry: null };
  const seen = new Set();
  for (const key of overlays) {
    if (seen.has(key)) throw new ApplyError(422, 'duplicate-overlay', `Overlay ${key} is listed twice`);
    seen.add(key);
    const entry = index.get(key);
    if (!entry) throw new ApplyError(422, 'unknown-overlay', `No overlay ${key}`);
    if (selection[entry.kind]) {
      throw new ApplyError(422, 'overlay-conflict', `Only one ${entry.kind} overlay is allowed; got ${selection[entry.kind]} and ${key}`);
    }
    if (entry.kind === 'industry' && !entry.overlay.appliesTo.includes(base.businessLicenceCategory)) {
      throw new ApplyError(422, 'overlay-not-applicable', `Overlay ${key} does not apply to ${base.businessLicenceCategory}`);
    }
    selection[entry.kind] = key;
  }
  return { selection, template: base.key, overlays: [...overlays], dryRun: parseDryRun(body.dryRun) };
}

const lower = (s) => (s ?? '').trim().toLowerCase();

/**
 * POST /rest/ledgerAccount/applyTemplate.json
 *
 * @param store    tenant-scoped persistence (see createStore in apply.test.mjs); the backend
 *                 equivalent is GORM under the request's resolved tenant.
 * @param tenantId the tenant resolved from the session, NEVER from the request body.
 * @param body     { template, overlays[], dryRun }
 * @returns {{ dryRun, template, overlays, composedKey, created, skipped, categoriesCreated, problems, summary }}
 */
export function applyTemplate(store, tenantId, catalogue, body) {
  const { selection, template, overlays, dryRun } = resolveSelection(catalogue, body);

  const composed = compose(catalogue, selection);
  const invalid = validate(catalogue, composed);
  if (invalid.length) {
    // Template data is shipped with the WAR, so this is a release defect, not a user error.
    throw new ApplyError(500, 'template-invalid', `Template ${composed.key} is invalid: ${invalid.join('; ')}`);
  }

  const plan = planApply(store, tenantId, composed, catalogue);
  if (!dryRun) {
    store.transaction(tenantId, (tx) => {
      const categoryIds = new Map(tx.categories().map((c) => [lower(c.name), c.id]));
      for (const c of plan.categoriesToCreate) {
        const parentId = c.parentCategory ? categoryIds.get(lower(c.parentCategory)) : null;
        const saved = tx.insertCategory({ name: c.name, ledgerGroup: c.ledgerGroup, ledgerSubGroup: c.ledgerSubGroup ?? null, parentCategory: parentId });
        categoryIds.set(lower(c.name), saved.id);
      }
      const accountIds = new Map(plan.existingByNumber);
      for (const a of plan.accountsToCreate) {
        const saved = tx.insertAccount({
          number: a.number,
          name: a.name,
          ledgerAccountCategory: categoryIds.get(lower(a.ledgerAccountCategory)),
          parentAccount: a.parentAccount ? accountIds.get(a.parentAccount) ?? null : null,
          accountType: a.accountType,
          systemAccount: a.systemAccount,
          editable: a.editable,
          deletable: a.deletable,
          cashFlow: a.cashFlow,
          archived: false,
        });
        accountIds.set(a.number, saved.id);
      }
    });
  }

  const created = plan.accountsToCreate.map((a) => ({
    number: a.number,
    name: a.name,
    ledgerAccountCategory: a.ledgerAccountCategory,
    parentAccount: a.parentAccount ?? null,
    accountType: a.accountType ?? null,
  }));
  return {
    dryRun,
    template,
    overlays,
    composedKey: composed.key,
    created,
    skipped: plan.skipped,
    categoriesCreated: plan.categoriesToCreate.map((c) => c.name),
    problems: plan.problems,
    summary: {
      templateAccounts: composed.accounts.length,
      created: created.length,
      skipped: plan.skipped.length,
      categoriesCreated: plan.categoriesToCreate.length,
    },
  };
}

/** Work out what an apply would do, reading only. Archived rows count: name and number are unique per tenant including them. */
export function planApply(store, tenantId, composed, catalogue) {
  const existing = store.accounts(tenantId);
  const byNumber = new Map(existing.filter((a) => a.number != null).map((a) => [String(a.number), a]));
  const byName = new Map(existing.map((a) => [lower(a.name), a]));
  const roleHolders = new Map();
  for (const a of existing) if (a.accountType && !a.archived) roleHolders.set(a.accountType, a);
  const singleton = new Set(catalogue.accountTypes.filter((t) => t.singleton).map((t) => t.name));

  const existingCategories = new Set(store.categories(tenantId).map((c) => lower(c.name)));
  const categoriesToCreate = composed.categories.filter((c) => !existingCategories.has(lower(c.name)));

  const accountsToCreate = [];
  const skipped = [];
  const problems = [];
  // number -> id of the account a template number resolves to, for parent links.
  const existingByNumber = new Map();
  const plannedNames = new Set();

  for (const a of composed.accounts) {
    const sameNumber = byNumber.get(a.number);
    if (sameNumber) {
      skipped.push({ number: a.number, name: a.name, reason: 'number-exists', existingName: sameNumber.name, archived: Boolean(sameNumber.archived) });
      existingByNumber.set(a.number, sameNumber.id);
      continue;
    }
    const sameName = byName.get(lower(a.name));
    if (sameName || plannedNames.has(lower(a.name))) {
      skipped.push({
        number: a.number,
        name: a.name,
        reason: 'name-exists',
        existingNumber: sameName?.number != null ? String(sameName.number) : null,
        archived: Boolean(sameName?.archived),
      });
      if (sameName) existingByNumber.set(a.number, sameName.id);
      continue;
    }
    let accountType = a.accountType ?? null;
    if (accountType && singleton.has(accountType) && roleHolders.has(accountType)) {
      problems.push(`${a.number} ${a.name}: role ${accountType} is already held by ${roleHolders.get(accountType).number ?? roleHolders.get(accountType).name}; created without the role`);
      accountType = null;
    }
    plannedNames.add(lower(a.name));
    accountsToCreate.push({ ...a, accountType });
  }
  return { accountsToCreate, categoriesToCreate, skipped, problems, existingByNumber };
}
