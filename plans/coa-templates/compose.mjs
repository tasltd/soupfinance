// Reference implementation of COA template composition and validation (SOUPFIN-143).
//
// The backend CoaTemplateService (soupmarkets-web) must compose templates exactly as
// compose() does here: base -> country overlay -> industry overlay, with the same
// errors. validate() lists the invariants the seeded chart of accounts must satisfy;
// the Spock spec in the plan ports them one for one.
//
// Run the checks with: node --test plans/coa-templates/

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATE_DIR = dirname(fileURLToPath(import.meta.url));

// Domain defaults of soupbroker.finance.LedgerAccount: the JSON omits them.
export const ACCOUNT_DEFAULTS = Object.freeze({
  systemAccount: false,
  editable: true,
  deletable: true,
  cashFlow: false,
});

// Lean-template target from the SOUPFIN-143 acceptance criteria. A target, not a cap:
// tenants can add as many accounts as they like after seeding.
export const MIN_ACCOUNTS = 60;
export const MAX_ACCOUNTS = 90;

// Auto-generated backend accounts are named "<thing> Account" (Account.checkAndGetDefault*,
// ServiceDescription, Vendor). LedgerAccount.name is unique per tenant, so a template
// name with that suffix could collide with one of them.
export const RESERVED_NAME_SUFFIX = ' account';

// Category names a template may use for cash-flow (cash and cash-equivalent) accounts.
export const CASH_CATEGORIES = ['CASH ON HAND', 'DEPOSITS AND BALANCES WITH BANKS/DISCOUNT HOUSES'];

function readJson(...parts) {
  return JSON.parse(readFileSync(join(TEMPLATE_DIR, ...parts), 'utf8'));
}

export function loadCatalogue(dir = TEMPLATE_DIR) {
  const read = (...p) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));
  const jsonFiles = (sub) => readdirSync(join(dir, sub)).filter((f) => f.endsWith('.json')).sort();
  const bases = {};
  for (const f of jsonFiles('base')) {
    const t = read('base', f);
    bases[t.businessLicenceCategory] = t;
  }
  const countries = {};
  for (const f of jsonFiles('country')) {
    const c = read('country', f);
    countries[c.country] = c;
  }
  const industries = {};
  for (const f of jsonFiles('industry')) {
    const i = read('industry', f);
    industries[i.key] = i;
  }
  return {
    categories: read('categories.json').categories,
    accountTypes: read('account-types.json').accountTypes,
    serviceDescriptions: read('service-description-map.json').serviceDescriptions,
    bases,
    countries,
    industries,
  };
}

function withDefaults(account) {
  const { replace, ...rest } = account;
  return { ...ACCOUNT_DEFAULTS, ...rest };
}

/**
 * Apply one overlay to an ordered account list. Throws on a contract breach:
 * removing a number that is not there, or adding a number that exists without replace:true.
 */
export function applyOverlay(accounts, overlay, label) {
  const result = accounts.map((a) => ({ ...a }));
  for (const number of overlay.remove ?? []) {
    const idx = result.findIndex((a) => a.number === number);
    if (idx === -1) throw new Error(`${label}: cannot remove ${number}, it is not in the template`);
    result.splice(idx, 1);
  }
  for (const add of overlay.add ?? []) {
    const idx = result.findIndex((a) => a.number === add.number);
    if (idx !== -1 && !add.replace) {
      throw new Error(`${label}: ${add.number} already exists; set replace:true to override it`);
    }
    if (idx === -1 && add.replace) {
      throw new Error(`${label}: ${add.number} has replace:true but there is nothing to replace`);
    }
    if (idx === -1) result.push(withDefaults(add));
    else result[idx] = withDefaults(add);
  }
  return result;
}

/**
 * Compose base + optional country + optional industry into the account list a tenant is seeded with.
 * @returns {{ key: string, businessLicenceCategory: string, accounts: object[], categories: object[], taxEntryMap: object }}
 */
export function compose(catalogue, { businessLicenceCategory, country = null, industry = null }) {
  const base = catalogue.bases[businessLicenceCategory];
  if (!base) throw new Error(`No base template for ${businessLicenceCategory}`);
  let accounts = base.accounts.map(withDefaults);
  let taxEntryMap = {};
  const keyParts = [base.key];

  if (country) {
    const overlay = catalogue.countries[country];
    if (!overlay) throw new Error(`No country overlay for ${country}`);
    accounts = applyOverlay(accounts, overlay, `country ${country}`);
    taxEntryMap = overlay.taxEntryMap ?? {};
    keyParts.push(country);
  }
  if (industry) {
    const overlay = catalogue.industries[industry];
    if (!overlay) throw new Error(`No industry overlay ${industry}`);
    if (!overlay.appliesTo.includes(businessLicenceCategory)) {
      throw new Error(`industry ${industry} does not apply to ${businessLicenceCategory}`);
    }
    accounts = applyOverlay(accounts, overlay, `industry ${industry}`);
    keyParts.push(industry);
  }

  accounts.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
  return {
    key: keyParts.join('+'),
    businessLicenceCategory,
    accounts,
    categories: categoriesFor(catalogue, accounts),
    taxEntryMap,
  };
}

/** Categories to seed: every category an account uses, their parents, and every requiredByPosting one. */
export function categoriesFor(catalogue, accounts) {
  const byName = new Map(catalogue.categories.map((c) => [c.name, c]));
  const wanted = new Set(accounts.map((a) => a.ledgerAccountCategory));
  for (const c of catalogue.categories) if (c.requiredByPosting) wanted.add(c.name);
  for (const name of [...wanted]) {
    let parent = byName.get(name)?.parentCategory;
    while (parent) {
      wanted.add(parent);
      parent = byName.get(parent)?.parentCategory;
    }
  }
  // Catalogue order, so parents (RETAINED EARNINGS) are created before their children.
  return catalogue.categories
    .filter((c) => wanted.has(c.name))
    .sort((a, b) => (a.parentCategory ? 1 : 0) - (b.parentCategory ? 1 : 0));
}

/** Every composition the registration flow can produce: 2 bases x {none, GH} x {none, each applicable industry}. */
export function allCompositions(catalogue) {
  const out = [];
  for (const blc of Object.keys(catalogue.bases)) {
    for (const country of [null, ...Object.keys(catalogue.countries)]) {
      const industries = Object.values(catalogue.industries)
        .filter((i) => i.appliesTo.includes(blc))
        .map((i) => i.key);
      for (const industry of [null, ...industries]) {
        out.push({ businessLicenceCategory: blc, country, industry });
      }
    }
  }
  return out;
}

function expectedGroup(number) {
  const lead = number[0];
  if (lead === '1') return { ledgerGroup: 'ASSET', ledgerSubGroup: null };
  if (lead === '2') return { ledgerGroup: 'LIABILITY', ledgerSubGroup: null };
  if (lead === '3') return { ledgerGroup: 'EQUITY', ledgerSubGroup: null };
  if (lead === '4') return { ledgerGroup: 'EQUITY', ledgerSubGroup: 'INCOME' };
  if (lead === '5' || lead === '6') return { ledgerGroup: 'EQUITY', ledgerSubGroup: 'EXPENSE' };
  return null;
}

/**
 * Check a composed template against every SOUPFIN-143 invariant.
 * @returns {string[]} problems; empty when the template is valid
 */
export function validate(catalogue, composed) {
  const problems = [];
  const { accounts, businessLicenceCategory: blc } = composed;
  const categories = new Map(catalogue.categories.map((c) => [c.name, c]));
  const types = new Map(catalogue.accountTypes.map((t) => [t.name, t]));
  const byNumber = new Map();

  if (accounts.length < MIN_ACCOUNTS || accounts.length > MAX_ACCOUNTS) {
    problems.push(`${accounts.length} accounts; the lean target is ${MIN_ACCOUNTS}-${MAX_ACCOUNTS}`);
  }

  const seenNames = new Set();
  for (const a of accounts) {
    if (!/^[1-6]\d{3}$/.test(a.number ?? '')) problems.push(`${a.number}: number must be four digits 1000-6999`);
    if (byNumber.has(a.number)) problems.push(`${a.number}: duplicate number`);
    byNumber.set(a.number, a);

    const name = (a.name ?? '').trim();
    if (!name) problems.push(`${a.number}: blank name`);
    // MariaDB's default collation is case-insensitive, so the unique index is too.
    if (seenNames.has(name.toLowerCase())) problems.push(`${a.number}: duplicate name "${name}"`);
    seenNames.add(name.toLowerCase());
    if (name.toLowerCase().endsWith(RESERVED_NAME_SUFFIX)) {
      problems.push(`${a.number}: "${name}" ends with " Account", which is reserved for auto-generated accounts`);
    }
    if (/\.\.\.|…/.test(name)) problems.push(`${a.number}: name contains an ellipsis`);

    const category = categories.get(a.ledgerAccountCategory);
    if (!category) {
      problems.push(`${a.number}: unknown category "${a.ledgerAccountCategory}"`);
      continue;
    }
    const expected = expectedGroup(a.number);
    if (expected && (category.ledgerGroup !== expected.ledgerGroup || category.ledgerSubGroup !== expected.ledgerSubGroup)) {
      problems.push(`${a.number}: category ${category.name} is ${category.ledgerGroup}/${category.ledgerSubGroup}, ` +
        `but numbers starting ${a.number[0]} must be ${expected.ledgerGroup}/${expected.ledgerSubGroup}`);
    }

    if (a.accountType !== undefined) {
      if (!types.has(a.accountType)) problems.push(`${a.number}: unknown accountType ${a.accountType}`);
      if (!a.systemAccount) problems.push(`${a.number}: carries accountType ${a.accountType} but is not a systemAccount`);
      if (a.deletable) problems.push(`${a.number}: carries accountType ${a.accountType} but is deletable`);
    }
    if (a.cashFlow && !CASH_CATEGORIES.includes(a.ledgerAccountCategory)) {
      problems.push(`${a.number}: cashFlow is only for cash and bank categories, not ${a.ledgerAccountCategory}`);
    }
  }

  for (const a of accounts) {
    if (!a.parentAccount) continue;
    const parent = byNumber.get(a.parentAccount);
    if (!parent) {
      problems.push(`${a.number}: parent ${a.parentAccount} is not in the template`);
      continue;
    }
    if (parent.ledgerAccountCategory !== a.ledgerAccountCategory) {
      problems.push(`${a.number}: parent ${parent.number} is in ${parent.ledgerAccountCategory}, child is in ${a.ledgerAccountCategory}`);
    }
    if (parent.parentAccount) problems.push(`${a.number}: parent ${parent.number} is itself a child; keep the tree two levels deep`);
  }

  const typeCounts = new Map();
  for (const a of accounts) if (a.accountType) typeCounts.set(a.accountType, (typeCounts.get(a.accountType) ?? 0) + 1);
  for (const t of catalogue.accountTypes) {
    const n = typeCounts.get(t.name) ?? 0;
    if (t.requiredFor.includes(blc) && n === 0) problems.push(`missing required accountType ${t.name}`);
    if (t.singleton && n > 1) problems.push(`accountType ${t.name} is a singleton but ${n} accounts carry it`);
  }

  for (const c of composed.categories) {
    if (c.requiredByPosting && !accounts.some((a) => a.ledgerAccountCategory === c.name) &&
        !composed.categories.some((child) => child.parentCategory === c.name)) {
      problems.push(`category ${c.name} is looked up by posting code but holds no account`);
    }
  }

  const accountForRole = (role) => accounts.find((a) => a.accountType === role);
  for (const sd of catalogue.serviceDescriptions) {
    const target = byNumber.get(sd.number) ??
      accountForRole(sd.type === 'INVOICE' ? 'SALES_INCOME' : 'DEFAULT_EXPENSE');
    if (!target) {
      problems.push(`service description ${sd.name}: no account and no fallback`);
      continue;
    }
    const sub = categories.get(target.ledgerAccountCategory)?.ledgerSubGroup;
    const want = sd.type === 'INVOICE' ? 'INCOME' : 'EXPENSE';
    if (sub !== want) {
      problems.push(`service description ${sd.name} (${sd.type}) -> ${target.number} is ${sub}; the ServiceDescription validator needs ${want}`);
    }
  }

  for (const [abbreviation, link] of Object.entries(composed.taxEntryMap)) {
    if (abbreviation.startsWith('_') || link === null) continue;
    for (const [side, roles] of [['liability', ['TAX_PAYABLE', 'WITHHOLDING_TAX_PAYABLE']], ['recoverable', ['TAX_RECEIVABLE', 'WITHHOLDING_TAX_RECEIVABLE']]]) {
      const number = link[side];
      if (!number) continue;
      const target = byNumber.get(number);
      if (!target) {
        if (!link.optional) problems.push(`tax ${abbreviation}: ${side} ${number} is not in the template`);
        continue;
      }
      if (!roles.includes(target.accountType)) {
        problems.push(`tax ${abbreviation}: ${side} ${number} has accountType ${target.accountType}, expected one of ${roles.join(', ')}`);
      }
    }
  }

  return problems;
}

export function summarise(composed) {
  const roles = composed.accounts.filter((a) => a.accountType).length;
  return { key: composed.key, accounts: composed.accounts.length, categories: composed.categories.length, systemAccounts: roles };
}

export { readJson };
