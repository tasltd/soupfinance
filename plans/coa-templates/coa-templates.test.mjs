// SOUPFIN-143: checks every COA template composition against the plan's invariants.
// Run: node --test plans/coa-templates/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCatalogue, compose, validate, applyOverlay, allCompositions,
  MIN_ACCOUNTS, MAX_ACCOUNTS,
} from './compose.mjs';

const catalogue = loadCatalogue();
const label = (c) => [c.businessLicenceCategory, c.country ?? 'no-country', c.industry ?? 'no-industry'].join(' + ');

// Category names the backend looks up by exact string today (git grep on
// authentication-base-on-multi-tenancy-descriminator, 2026-10-10).
const LOAD_BEARING_CATEGORIES = [
  'ACCOUNT RECEIVABLE', 'OTHER ASSETS', 'OTHER LIABILITIES', 'SHORT -TERM LIABILITIES',
  'DEPOSITS AND BALANCES WITH BANKS/DISCOUNT HOUSES', 'CASH ON HAND', 'INCOME',
  'INCOME FROM OTHER ACTIVITIES', 'DIRECT EXPENSES', 'OTHER EXPENSES', 'RETAINED EARNINGS',
];

describe('category catalogue', () => {
  test('names are unique', () => {
    const names = catalogue.categories.map((c) => c.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
  });

  test('keeps every name the posting code looks up, spelled exactly', () => {
    const names = catalogue.categories.map((c) => c.name);
    for (const name of LOAD_BEARING_CATEGORIES) {
      assert.ok(names.includes(name), `missing ${name}`);
      assert.equal(catalogue.categories.find((c) => c.name === name).requiredByPosting, true, `${name} must be requiredByPosting`);
    }
  });

  test('ledgerSubGroup only on EQUITY categories (LedgerAccountCategory validator)', () => {
    for (const c of catalogue.categories) {
      if (c.ledgerSubGroup) assert.equal(c.ledgerGroup, 'EQUITY', c.name);
    }
  });

  test('income and expense categories hang off RETAINED EARNINGS and RETAINED EARNINGS has no subgroup', () => {
    for (const c of catalogue.categories.filter((x) => x.ledgerSubGroup)) {
      assert.ok(['INCOME', 'EXPENSE'].includes(c.ledgerSubGroup), c.name);
      assert.equal(c.parentCategory, 'RETAINED EARNINGS', c.name);
    }
    // A non-null subgroup would pull retained earnings into the income statement.
    assert.equal(catalogue.categories.find((c) => c.name === 'RETAINED EARNINGS').ledgerSubGroup, null);
  });

  test('every parentCategory exists', () => {
    const names = new Set(catalogue.categories.map((c) => c.name));
    for (const c of catalogue.categories) if (c.parentCategory) assert.ok(names.has(c.parentCategory), c.name);
  });
});

describe('composed templates', () => {
  const compositions = allCompositions(catalogue);

  test('cover 2 bases x {none, GH} x {none + applicable industries}', () => {
    // SERVICES: 1 + 5 industries; TRADING: 1 + 3 industries; each with and without GH.
    assert.equal(compositions.length, (6 + 4) * 2);
  });

  for (const c of compositions) {
    test(`${label(c)} satisfies every invariant`, () => {
      const composed = compose(catalogue, c);
      assert.deepEqual(validate(catalogue, composed), []);
    });
  }

  test('base templates alone already meet the 60-account floor', () => {
    for (const blc of ['SERVICES', 'TRADING']) {
      const n = compose(catalogue, { businessLicenceCategory: blc }).accounts.length;
      assert.ok(n >= MIN_ACCOUNTS && n <= MAX_ACCOUNTS, `${blc}: ${n}`);
    }
  });

  test('TRADING carries inventory and COGS; SERVICES carries neither', () => {
    const trading = compose(catalogue, { businessLicenceCategory: 'TRADING' }).accounts;
    const services = compose(catalogue, { businessLicenceCategory: 'SERVICES' }).accounts;
    for (const role of ['INVENTORY_ASSET', 'COST_OF_GOODS_SOLD']) {
      assert.ok(trading.some((a) => a.accountType === role), `TRADING lacks ${role}`);
      assert.ok(!services.some((a) => a.accountType === role), `SERVICES has ${role}`);
    }
  });

  test('every system account the invoice and bill posting needs is present in both GH templates', () => {
    const needed = ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CASH', 'BANK', 'UNDEPOSITED_FUNDS',
      'TAX_PAYABLE', 'TAX_RECEIVABLE', 'RETAINED_EARNINGS', 'OPENING_BALANCE_EQUITY', 'SALES_INCOME',
      'DISCOUNTS_GIVEN', 'FX_GAIN_LOSS', 'ROUNDING', 'DEFAULT_EXPENSE'];
    for (const blc of ['SERVICES', 'TRADING']) {
      const roles = new Set(compose(catalogue, { businessLicenceCategory: blc, country: 'GH' }).accounts.map((a) => a.accountType));
      for (const role of needed) assert.ok(roles.has(role), `${blc}+GH lacks ${role}`);
    }
  });

  test('A/R, A/P and the earnings accounts cannot be renamed or deleted', () => {
    for (const blc of ['SERVICES', 'TRADING']) {
      const accounts = compose(catalogue, { businessLicenceCategory: blc }).accounts;
      for (const role of ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'RETAINED_EARNINGS', 'CURRENT_YEAR_EARNINGS', 'OPENING_BALANCE_EQUITY']) {
        const a = accounts.find((x) => x.accountType === role);
        assert.equal(a.editable, false, `${blc} ${role}`);
        assert.equal(a.deletable, false, `${blc} ${role}`);
      }
    }
  });

  test('categories seeded include every requiredByPosting category even with no overlay', () => {
    const composed = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    const seeded = new Set(composed.categories.map((c) => c.name));
    for (const name of LOAD_BEARING_CATEGORIES) assert.ok(seeded.has(name), name);
    // Parents come first so the seeder can resolve parentCategory in one pass.
    const index = (n) => composed.categories.findIndex((c) => c.name === n);
    assert.ok(index('RETAINED EARNINGS') < index('INCOME'));
  });
});

describe('Ghana overlay (Act 1151)', () => {
  const gh = compose(catalogue, { businessLicenceCategory: 'SERVICES', country: 'GH' });
  const byNumber = new Map(gh.accounts.map((a) => [a.number, a]));

  test('splits output tax into VAT, NHIL and GETFund and drops the generic sales-tax line', () => {
    assert.equal(byNumber.get('2210'), undefined);
    for (const n of ['2211', '2212', '2213']) assert.equal(byNumber.get(n).accountType, 'TAX_PAYABLE', n);
  });

  test('makes NHIL and GETFund recoverable as input tax, and the header loses the role', () => {
    for (const n of ['1401', '1402', '1403']) assert.equal(byNumber.get(n).accountType, 'TAX_RECEIVABLE', n);
    assert.equal(byNumber.get('1400').accountType, undefined);
  });

  test('carries WHT payable and WHT credit accounts', () => {
    assert.equal(byNumber.get('2220').accountType, 'WITHHOLDING_TAX_PAYABLE');
    assert.equal(byNumber.get('1420').accountType, 'WITHHOLDING_TAX_RECEIVABLE');
  });

  test('does not link the abolished COVID-19 levy or the VAT flat rate', () => {
    assert.equal(gh.taxEntryMap.CL, null);
    assert.equal(gh.taxEntryMap['VAT-FR'], null);
  });

  test('links every Ghana TaxEntry abbreviation the backend seeds today', () => {
    // From grails-app/conf/seed-data/country/GH/tax-entries.json.
    const seeded = ['CL', 'CST', 'GETFL', 'NHIL', 'RT-Comm', 'RT-Non Comm', 'TL', 'VAT', 'VAT-FR', 'VAT-S', 'WHT', 'WHT-S', 'Withholding Tax'];
    for (const abbreviation of seeded) assert.ok(abbreviation in gh.taxEntryMap, abbreviation);
  });

  test('tourism levy links only when the hospitality overlay supplies 2250', () => {
    const hotel = compose(catalogue, { businessLicenceCategory: 'SERVICES', country: 'GH', industry: 'hospitality' });
    assert.ok(hotel.accounts.some((a) => a.number === '2250'));
    assert.ok(!gh.accounts.some((a) => a.number === '2250'));
    assert.deepEqual(validate(catalogue, gh), []);
  });
});

describe('service description mapping', () => {
  test('covers all 32 universal service descriptions exactly once', () => {
    const names = catalogue.serviceDescriptions.map((s) => s.name);
    assert.equal(names.length, 32);
    assert.equal(new Set(names).size, 32);
  });

  test('falls back to the default income account when TRADING has no Professional Fees line', () => {
    const trading = compose(catalogue, { businessLicenceCategory: 'TRADING' });
    assert.ok(!trading.accounts.some((a) => a.number === '4020'));
    assert.deepEqual(validate(catalogue, trading), []);
  });
});

describe('overlay contract and edge cases', () => {
  const base = compose(catalogue, { businessLicenceCategory: 'SERVICES' }).accounts;

  test('an empty overlay changes nothing', () => {
    assert.deepEqual(applyOverlay(base, { add: [], remove: [] }, 'empty'), base);
  });

  test('reusing a number without replace:true is refused', () => {
    assert.throws(() => applyOverlay(base, { add: [{ number: '1200', name: 'Debtors', ledgerAccountCategory: 'ACCOUNT RECEIVABLE' }] }, 't'),
      /already exists/);
  });

  test('replace:true on a number that does not exist is refused', () => {
    assert.throws(() => applyOverlay(base, { add: [{ number: '1999', name: 'X', ledgerAccountCategory: 'OTHER ASSETS', replace: true }] }, 't'),
      /nothing to replace/);
  });

  test('removing a number that is not there is refused', () => {
    assert.throws(() => applyOverlay(base, { remove: ['1999'] }, 't'), /cannot remove/);
  });

  test('an industry that does not apply to the business type is refused', () => {
    assert.throws(() => compose(catalogue, { businessLicenceCategory: 'SERVICES', industry: 'retail' }), /does not apply/);
  });

  test('a template with no accounts fails on size and on every required role', () => {
    const problems = validate(catalogue, { businessLicenceCategory: 'SERVICES', accounts: [], categories: [], taxEntryMap: {} });
    assert.ok(problems.some((p) => p.includes('lean target')));
    assert.ok(problems.some((p) => p.includes('ACCOUNTS_RECEIVABLE')));
  });

  test('a template inflated to 10x the target is flagged, not silently accepted', () => {
    const many = Array.from({ length: MAX_ACCOUNTS * 10 }, (_, i) => ({
      number: String(1000 + i), name: `Bulk ${i}`, ledgerAccountCategory: 'OTHER ASSETS',
    }));
    const composed = { ...compose(catalogue, { businessLicenceCategory: 'SERVICES' }) };
    composed.accounts = [...composed.accounts.filter((a) => a.number >= '2000'), ...many.slice(0, 900)];
    const problems = validate(catalogue, composed);
    assert.ok(problems.some((p) => p.includes('lean target')), problems.slice(0, 3).join('\n'));
  });

  test('duplicate names are caught case-insensitively, as the MariaDB unique index would', () => {
    const composed = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    composed.accounts = [...composed.accounts, { number: '1399', name: 'PREPAID EXPENSES', ledgerAccountCategory: 'OTHER ASSETS',
      systemAccount: false, editable: true, deletable: true, cashFlow: false }];
    assert.ok(validate(catalogue, composed).some((p) => p.includes('duplicate name')));
  });

  test('a name ending in " Account" is refused because auto-generated accounts use that suffix', () => {
    const composed = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    composed.accounts = composed.accounts.map((a) => (a.number === '1110' ? { ...a, name: 'Operating Account' } : a));
    assert.ok(validate(catalogue, composed).some((p) => p.includes('reserved')));
  });

  test('a second singleton (two A/R accounts) is refused', () => {
    const composed = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    composed.accounts = [...composed.accounts, { number: '1205', name: 'Trade Debtors', ledgerAccountCategory: 'ACCOUNT RECEIVABLE',
      accountType: 'ACCOUNTS_RECEIVABLE', systemAccount: true, editable: false, deletable: false, cashFlow: false }];
    assert.ok(validate(catalogue, composed).some((p) => p.includes('singleton')));
  });

  test('an income number placed in an expense category is refused', () => {
    const composed = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    composed.accounts = composed.accounts.map((a) => (a.number === '4100' ? { ...a, ledgerAccountCategory: 'OTHER EXPENSES' } : a));
    assert.ok(validate(catalogue, composed).some((p) => p.startsWith('4100: category OTHER EXPENSES')));
  });
});
