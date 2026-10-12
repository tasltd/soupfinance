// Acceptance checks for the SOUPFIN-145 endpoints (applyTemplate + coaTemplate/index).
// The backend Spock specs in plans/soupfin-145-apply-template-endpoints.html port these
// one for one. Run with: node --test plans/coa-templates/*.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogue, compose } from './compose.mjs';
import {
  APPLY_ROLES, ApplyError, MAX_OVERLAYS, PREVIEW_LIMIT,
  applyTemplate, canApply, listTemplates, resolveSelection,
} from './apply.mjs';

const catalogue = loadCatalogue();

/**
 * In-memory stand-in for GORM under multi-tenancy: every read and write is keyed by
 * tenant, writes only happen inside transaction(), and a throw rolls the tenant back.
 * `writes` counts inserts so a test can prove a dry run wrote nothing.
 */
function createStore({ failOnInsert = null } = {}) {
  const tenants = new Map();
  let seq = 0;
  let inserts = 0;
  const data = (t) => {
    if (!tenants.has(t)) tenants.set(t, { accounts: [], categories: [] });
    return tenants.get(t);
  };
  const store = {
    writes: 0,
    accounts: (t) => data(t).accounts.map((a) => ({ ...a })),
    categories: (t) => data(t).categories.map((c) => ({ ...c })),
    seedAccount(t, account) {
      const row = { id: `seed-${++seq}`, archived: false, ...account };
      data(t).accounts.push(row);
      return row;
    },
    seedCategory(t, category) {
      const row = { id: `seedcat-${++seq}`, ...category };
      data(t).categories.push(row);
      return row;
    },
    transaction(t, fn) {
      const d = data(t);
      const snapshot = { accounts: d.accounts.map((a) => ({ ...a })), categories: d.categories.map((c) => ({ ...c })) };
      const before = store.writes;
      const insert = (list, row) => {
        inserts += 1;
        if (failOnInsert && inserts === failOnInsert) throw new Error('simulated constraint violation');
        // The real unique constraints: name and number per tenant, archived rows included.
        if (list === d.accounts && d.accounts.some((a) => a.name.toLowerCase() === row.name.toLowerCase() || (row.number && String(a.number) === row.number))) {
          throw new Error(`unique constraint: ${row.number} ${row.name}`);
        }
        const saved = { id: `id-${++seq}`, ...row };
        list.push(saved);
        store.writes += 1;
        return saved;
      };
      try {
        fn({
          categories: () => d.categories.map((c) => ({ ...c })),
          insertCategory: (row) => insert(d.categories, row),
          insertAccount: (row) => insert(d.accounts, row),
        });
      } catch (e) {
        d.accounts = snapshot.accounts;
        d.categories = snapshot.categories;
        store.writes = before;
        throw e;
      }
    },
  };
  return store;
}

const apply = (store, tenant, body) => applyTemplate(store, tenant, catalogue, body);

describe('applyTemplate: acceptance criteria', () => {
  test('applying twice creates nothing the second time', () => {
    const store = createStore();
    const first = apply(store, 'tenant-a', { template: 'services', overlays: ['GH'] });
    const expected = compose(catalogue, { businessLicenceCategory: 'SERVICES', country: 'GH' });
    assert.equal(first.summary.created, expected.accounts.length);
    assert.equal(store.accounts('tenant-a').length, expected.accounts.length);
    assert.equal(store.categories('tenant-a').length, expected.categories.length);

    const writesAfterFirst = store.writes;
    const second = apply(store, 'tenant-a', { template: 'services', overlays: ['GH'] });
    assert.equal(second.summary.created, 0);
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.categoriesCreated, []);
    assert.equal(second.summary.skipped, expected.accounts.length);
    assert.ok(second.skipped.every((s) => s.reason === 'number-exists'));
    assert.equal(store.writes, writesAfterFirst, 'second apply wrote rows');
    assert.equal(store.accounts('tenant-a').length, expected.accounts.length);
  });

  test('a dry run writes nothing and reports exactly what the real run then creates', () => {
    const store = createStore();
    const preview = apply(store, 't', { template: 'trading', overlays: ['GH', 'retail'], dryRun: true });
    assert.equal(preview.dryRun, true);
    assert.equal(store.writes, 0);
    assert.equal(store.accounts('t').length, 0);
    assert.equal(store.categories('t').length, 0);

    const real = apply(store, 't', { template: 'trading', overlays: ['GH', 'retail'], dryRun: false });
    assert.equal(real.dryRun, false);
    assert.deepEqual(real.created, preview.created);
    assert.deepEqual(real.categoriesCreated, preview.categoriesCreated);
    assert.equal(store.accounts('t').length, preview.summary.created);
  });

  test('dryRun accepts the string forms Grails params produce', () => {
    const store = createStore();
    assert.equal(apply(store, 't', { template: 'services', dryRun: 'true' }).dryRun, true);
    assert.equal(store.writes, 0);
    assert.equal(apply(store, 't', { template: 'services', dryRun: 'false' }).dryRun, false);
    assert.ok(store.writes > 0);
  });

  test('a dry run on a tenant that already applied the template previews zero creations', () => {
    const store = createStore();
    apply(store, 't', { template: 'services' });
    const writes = store.writes;
    const preview = apply(store, 't', { template: 'services', dryRun: true });
    assert.equal(preview.summary.created, 0);
    assert.equal(store.writes, writes);
  });

  test('tenant-scoped: applying for one tenant leaves another untouched, and a tenantId in the body is ignored', () => {
    const store = createStore();
    store.seedAccount('tenant-b', { number: '9999', name: 'Tenant B Only' });
    const result = apply(store, 'tenant-a', { template: 'services', tenantId: 'tenant-b', account: { id: 'tenant-b' } });
    assert.ok(result.summary.created > 0);
    assert.equal(store.accounts('tenant-b').length, 1, 'tenant B gained accounts');
    // Tenant B's existing data does not make tenant A skip anything.
    assert.equal(result.summary.skipped, 0);
    // And tenant A's accounts do not make tenant B skip.
    const forB = apply(store, 'tenant-b', { template: 'services', dryRun: true });
    assert.equal(forB.summary.skipped, 0);
  });
});

describe('applyTemplate: matching existing accounts', () => {
  test('matches on account number and skips, linking children to the existing parent', () => {
    const store = createStore();
    const parent = store.seedAccount('t', { number: '5000', name: 'My Own Direct Costs' });
    const result = apply(store, 't', { template: 'services', overlays: ['saas'] });
    const skip = result.skipped.find((s) => s.number === '5000');
    assert.deepEqual(skip, { number: '5000', name: skip.name, reason: 'number-exists', existingName: 'My Own Direct Costs', archived: false });
    const child = store.accounts('t').find((a) => a.number === '5085');
    assert.equal(child.parentAccount, parent.id);
  });

  test('a stored numeric number (bigint column on the seed DB) still matches', () => {
    const store = createStore();
    store.seedAccount('t', { number: 1000, name: 'Cash' });
    const result = apply(store, 't', { template: 'services', dryRun: true });
    assert.equal(result.skipped.find((s) => s.number === '1000')?.reason, 'number-exists');
  });

  test('archived accounts still block: the unique index includes them', () => {
    const store = createStore();
    store.seedAccount('t', { number: '1200', name: 'Old Receivables', archived: true });
    const result = apply(store, 't', { template: 'services' });
    const skip = result.skipped.find((s) => s.number === '1200');
    assert.equal(skip.reason, 'number-exists');
    assert.equal(skip.archived, true);
  });

  test('an existing account with the same name (any case) and another number is skipped, not duplicated', () => {
    const store = createStore();
    const template = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    const target = template.accounts[0];
    store.seedAccount('t', { number: '7777', name: target.name.toUpperCase() });
    const result = apply(store, 't', { template: 'services' });
    const skip = result.skipped.find((s) => s.number === target.number);
    assert.equal(skip.reason, 'name-exists');
    assert.equal(skip.existingNumber, '7777');
    assert.equal(store.accounts('t').filter((a) => a.name.toLowerCase() === target.name.toLowerCase()).length, 1);
  });

  test('the old 9-category registration shape (mixed-case names) gets only the missing categories', () => {
    const store = createStore();
    store.seedCategory('t', { name: 'Other Assets', ledgerGroup: 'ASSET' });
    store.seedCategory('t', { name: 'Cash on Hand', ledgerGroup: 'ASSET' });
    const result = apply(store, 't', { template: 'services' });
    assert.ok(!result.categoriesCreated.map((n) => n.toLowerCase()).includes('other assets'));
    assert.ok(!result.categoriesCreated.map((n) => n.toLowerCase()).includes('cash on hand'));
    const names = store.categories('t').map((c) => c.name.toLowerCase());
    assert.equal(names.length, new Set(names).size, 'duplicate category created');
  });

  test('a singleton role already held keeps its holder; the template account is created without the role', () => {
    const store = createStore();
    store.seedAccount('t', { number: '1290', name: 'Legacy Debtors', accountType: 'ACCOUNTS_RECEIVABLE' });
    const result = apply(store, 't', { template: 'services' });
    const holders = store.accounts('t').filter((a) => a.accountType === 'ACCOUNTS_RECEIVABLE');
    assert.equal(holders.length, 1);
    assert.equal(holders[0].number, '1290');
    assert.ok(result.problems.some((p) => p.includes('ACCOUNTS_RECEIVABLE')));
  });

  test('a write failure mid-apply rolls back every row of that apply', () => {
    const store = createStore({ failOnInsert: 30 });
    assert.throws(() => apply(store, 't', { template: 'services' }), /simulated/);
    assert.equal(store.accounts('t').length, 0);
    assert.equal(store.categories('t').length, 0);
    assert.equal(store.writes, 0);
  });
});

describe('applyTemplate: request validation (422)', () => {
  const rejects = (body, code) => assert.throws(() => resolveSelection(catalogue, body), (e) => e instanceof ApplyError && e.status === 422 && e.code === code);

  test('template is required and must exist', () => {
    rejects({}, 'template-required');
    rejects({ template: '   ' }, 'template-required');
    rejects({ template: 'manufacturing' }, 'unknown-template');
  });
  test('overlays must be a list of known, distinct, compatible keys', () => {
    rejects({ template: 'services', overlays: 'GH' }, 'invalid-overlays');
    rejects({ template: 'services', overlays: ['XX'] }, 'unknown-overlay');
    rejects({ template: 'services', overlays: ['GH', 'GH'] }, 'duplicate-overlay');
    rejects({ template: 'services', overlays: ['saas', 'construction'] }, 'overlay-conflict');
    rejects({ template: 'services', overlays: ['retail'] }, 'overlay-not-applicable');
    rejects({ template: 'services', dryRun: 'yes' }, 'invalid-dry-run');
  });
  test('overflow: an overlay list longer than one country plus one industry is refused before any lookup', () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
    rejects({ template: 'services', overlays: keys }, 'too-many-overlays');
    assert.equal(MAX_OVERLAYS, 2);
  });
  test('a rejected request writes nothing', () => {
    const store = createStore();
    assert.throws(() => apply(store, 't', { template: 'services', overlays: ['XX'] }), ApplyError);
    assert.equal(store.writes, 0);
  });
  test('zero overlays is valid: base template only', () => {
    const { selection } = resolveSelection(catalogue, { template: 'trading' });
    assert.deepEqual(selection, { businessLicenceCategory: 'TRADING', country: null, industry: null });
    assert.deepEqual(resolveSelection(catalogue, { template: 'trading', overlays: [] }).overlays, []);
  });
});

describe('applyTemplate: overflow tenant', () => {
  test('a tenant that already holds 10x the template (900 accounts) gets only the missing accounts', () => {
    const store = createStore();
    for (let i = 0; i < 900; i += 1) store.seedAccount('t', { number: String(7000 + i), name: `Custom ${i}` });
    const template = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
    for (const a of template.accounts.slice(0, 20)) store.seedAccount('t', { number: a.number, name: a.name });
    const result = apply(store, 't', { template: 'services' });
    assert.equal(result.summary.created, template.accounts.length - 20);
    assert.equal(result.summary.skipped, 20);
    assert.equal(store.accounts('t').length, 900 + template.accounts.length);
  });
});

describe('roles', () => {
  test('ROLE_ADMIN and ROLE_FINANCE may apply; ROLE_USER alone, nothing, or empty may not', () => {
    assert.deepEqual([...APPLY_ROLES], ['ROLE_ADMIN', 'ROLE_FINANCE']);
    assert.equal(canApply(['ROLE_USER', 'ROLE_ADMIN']), true);
    assert.equal(canApply(['ROLE_FINANCE']), true);
    assert.equal(canApply(['ROLE_USER']), false);
    assert.equal(canApply(['ROLE_LEDGER_ACCOUNT_CREATE']), false);
    assert.equal(canApply([]), false);
    assert.equal(canApply(), false);
  });
});

describe('listTemplates (coaTemplate/index)', () => {
  const index = listTemplates(catalogue, { businessLicenceCategory: 'SERVICES', country: 'GH' });

  test('every base template is listed with counts that match compose()', () => {
    assert.deepEqual(index.templates.map((t) => t.key), Object.values(catalogue.bases).map((b) => b.key).sort());
    for (const t of index.templates) {
      const composed = compose(catalogue, { businessLicenceCategory: t.businessLicenceCategory });
      assert.equal(t.accountCount, composed.accounts.length);
      assert.equal(t.categoryCount, composed.categories.length);
      assert.equal(t.preview.length, Math.min(composed.accounts.length, PREVIEW_LIMIT));
      assert.equal(t.previewTruncated, composed.accounts.length > PREVIEW_LIMIT);
      assert.ok(t.preview.every((a) => a.number && a.name && a.ledgerAccountCategory));
    }
  });

  test('every overlay is listed once with its kind, add and remove counts', () => {
    const expectedKeys = [...Object.keys(catalogue.countries), ...Object.keys(catalogue.industries)].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(index.overlays.map((o) => o.key), expectedKeys);
    const gh = index.overlays.find((o) => o.key === 'GH');
    assert.equal(gh.kind, 'country');
    assert.equal(gh.addCount, catalogue.countries.GH.add.length);
    assert.equal(gh.removeCount, catalogue.countries.GH.remove.length);
    const saas = index.overlays.find((o) => o.key === 'saas');
    assert.equal(saas.kind, 'industry');
    assert.deepEqual(saas.appliesTo, ['SERVICES']);
  });

  test('overlay keys never collide across kinds, so a bare key is unambiguous', () => {
    const keys = index.overlays.map((o) => o.key);
    assert.equal(keys.length, new Set(keys).size);
  });

  test('recommended follows the caller tenant; none for an unknown licence or no tenant', () => {
    assert.deepEqual(index.recommended, { template: 'services', overlays: ['GH'] });
    assert.deepEqual(listTemplates(catalogue, { businessLicenceCategory: 'TRADING', country: 'NG' }).recommended, { template: 'trading', overlays: [] });
    assert.equal(listTemplates(catalogue, { businessLicenceCategory: 'BROKERAGE' }).recommended, null);
    assert.equal(listTemplates(catalogue).recommended, null);
  });

  test('every recommended selection and every listed combination applies cleanly to an empty tenant', () => {
    for (const t of index.templates) {
      const industries = index.overlays.filter((o) => o.kind === 'industry' && o.appliesTo.includes(t.businessLicenceCategory));
      for (const country of [null, ...index.overlays.filter((o) => o.kind === 'country').map((o) => o.key)]) {
        for (const industry of [null, ...industries.map((o) => o.key)]) {
          const overlays = [country, industry].filter(Boolean);
          const result = apply(createStore(), 'fresh', { template: t.key, overlays, dryRun: true });
          assert.equal(result.summary.skipped, 0, `${t.key}+${overlays.join('+')}`);
          assert.deepEqual(result.problems, []);
        }
      }
    }
  });
});
