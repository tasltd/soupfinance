// Acceptance checks for the SOUPFIN-146 backfill (backfill.mjs). The backend Spock specs
// in plans/soupfin-146-coa-backfill.html port these one for one.
// Run with: node --test plans/coa-templates/*.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalogue, compose, TEMPLATE_DIR } from './compose.mjs';
import {
  backfill, countryOverlayFor, selectionFor,
  BROKERAGE_LICENCES, FINANCE_MODULE, LISTENER_GUARD_CATEGORY,
} from './backfill.mjs';

const catalogue = loadCatalogue();
const SERVICES = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
const TRADING = compose(catalogue, { businessLicenceCategory: 'TRADING' });
const SERVICES_GH = compose(catalogue, { businessLicenceCategory: 'SERVICES', country: 'GH' });

// What AccountModuleUtilityService.createFinanceAccountAndCategory seeds when a FINANCE
// module is inserted on a tenant with no chart (two rows stand for its ~60).
const BROKERAGE_SEED = [
  { category: 'TRADING PORTFOLIO', account: 'SHARES QUOTED ON THE GHANA STOCK EXCHANGE' },
  { category: 'SECURITIES UNDER CUSTODY', account: 'CLIENT SECURITIES' },
];

/**
 * In-memory stand-in for GORM: Accounts (tenants) are global, everything else is keyed by
 * tenant. A transaction rolls its tenant back on a throw. After a commit that inserted a
 * FINANCE module, it runs the backend's afterCommit listener with the backend's own guard:
 * skip when any category belongs to the account or one is named SHORT -TERM LIABILITIES.
 */
function createStore({ failOnInsert = null, beforeTransaction = null } = {}) {
  const accounts = [];
  const data = new Map();
  let seq = 0;
  let inserts = 0;
  const of = (t) => {
    if (!data.has(t)) data.set(t, { accounts: [], categories: [], modules: [] });
    return data.get(t);
  };
  const copy = (rows) => rows.map((r) => ({ ...r }));

  function listener(t) {
    const d = of(t);
    if (d.categories.some((c) => c.account === t) || d.categories.some((c) => c.name === LISTENER_GUARD_CATEGORY)) return;
    for (const s of BROKERAGE_SEED) {
      const cat = { id: `l-${++seq}`, name: s.category, account: t };
      d.categories.push(cat);
      d.accounts.push({ id: `l-${++seq}`, name: s.account, number: null, ledgerAccountCategory: cat.id, archived: false });
    }
    store.listenerRuns += 1;
  }

  const store = {
    writes: 0,
    listenerRuns: 0,
    tenants: () => copy(accounts),
    accounts: (t) => copy(of(t).accounts),
    categories: (t) => copy(of(t).categories),
    modules: (t) => copy(of(t).modules),
    addTenant(tenant) {
      const row = { id: `acc-${++seq}`, name: null, businessLicenceCategory: null, countryOfOrigin: null, archived: false, ...tenant };
      accounts.push(row);
      of(row.id);
      return row;
    },
    seedAccount(t, row) { of(t).accounts.push({ id: `s-${++seq}`, archived: false, ...row }); },
    seedCategory(t, row) { of(t).categories.push({ id: `s-${++seq}`, ...row }); },
    seedModule(t, row) { of(t).modules.push({ id: `s-${++seq}`, archived: false, ...row }); },
    snapshot(t) { const d = of(t); return JSON.parse(JSON.stringify(d)); },
    transaction(t, fn) {
      if (beforeTransaction) beforeTransaction(t, store);
      const d = of(t);
      const saved = { accounts: copy(d.accounts), categories: copy(d.categories), modules: copy(d.modules) };
      const writesBefore = store.writes;
      let moduleInserted = false;
      const insert = (list, row) => {
        inserts += 1;
        if (failOnInsert && failOnInsert(t, inserts, row)) throw new Error('simulated constraint violation');
        if (list === d.accounts && d.accounts.some((a) => a.name.toLowerCase() === row.name.toLowerCase() || (row.number && String(a.number) === row.number))) {
          throw new Error(`unique constraint: ${row.number} ${row.name}`);
        }
        const r = { id: `id-${++seq}`, ...row };
        list.push(r);
        store.writes += 1;
        return r;
      };
      try {
        fn({
          accounts: () => copy(d.accounts),
          categories: () => copy(d.categories),
          modules: () => copy(d.modules),
          insertCategory: (row) => insert(d.categories, row),
          insertAccount: (row) => insert(d.accounts, row),
          insertModule: (row) => { moduleInserted = moduleInserted || row.moduleGroup === FINANCE_MODULE; return insert(d.modules, row); },
        });
      } catch (e) {
        d.accounts = saved.accounts;
        d.categories = saved.categories;
        d.modules = saved.modules;
        store.writes = writesBefore;
        throw e;
      }
      if (moduleInserted) listener(t);
    },
  };
  return store;
}

const run = (store, options) => backfill(store, catalogue, options);
const real = (store, options = {}) => run(store, { ...options, dryRun: false });
const rowFor = (report, id) => report.tenants.find((r) => r.accountId === id);
const financeModules = (store, t) => store.modules(t).filter((m) => m.moduleGroup === FINANCE_MODULE && !m.archived);

describe('backfill: acceptance criteria', () => {
  test('after a real run no tenant with a template has an empty chart', () => {
    const store = createStore();
    const ids = [
      store.addTenant({ name: 'No licence' }),
      store.addTenant({ name: 'Services', businessLicenceCategory: 'SERVICES' }),
      store.addTenant({ name: 'Trading', businessLicenceCategory: 'TRADING' }),
      store.addTenant({ name: 'Ghana services', businessLicenceCategory: 'SERVICES', countryOfOrigin: 'GH' }),
    ].map((t) => t.id);
    const report = real(store);
    assert.equal(report.summary.stillEmpty, 0);
    assert.deepEqual(report.stillEmpty, []);
    assert.equal(report.summary.seeded, 4);
    assert.equal(report.summary.failed, 0);
    for (const id of ids) {
      assert.ok(store.accounts(id).length >= SERVICES.accounts.length, `${id} has ${store.accounts(id).length} accounts`);
      assert.equal(financeModules(store, id).length, 1, `${id} finance module`);
    }
  });

  test('tenants that already had accounts are untouched: accounts, categories and modules all identical', () => {
    const store = createStore();
    const one = store.addTenant({ name: 'One account', businessLicenceCategory: 'SERVICES' });
    store.seedAccount(one.id, { number: '1000', name: 'Cash' });
    const archivedOnly = store.addTenant({ name: 'Only an archived account' });
    store.seedAccount(archivedOnly.id, { number: '1', name: 'Gone', archived: true });
    const broker = store.addTenant({ name: 'Broker', businessLicenceCategory: 'BROKER' });
    for (let i = 0; i < 50; i += 1) store.seedAccount(broker.id, { number: String(9000 + i), name: `Broker ${i}` });
    store.seedCategory(broker.id, { name: 'OTHER ASSETS', account: broker.id });
    const noModule = store.addTenant({ name: 'Has accounts, no finance module', businessLicenceCategory: 'SERVICES' });
    store.seedAccount(noModule.id, { number: '1200', name: 'Debtors' });
    store.addTenant({ name: 'Empty' });

    const before = [one, archivedOnly, broker, noModule].map((t) => store.snapshot(t.id));
    const report = real(store);
    const after = [one, archivedOnly, broker, noModule].map((t) => store.snapshot(t.id));
    assert.deepEqual(after, before);
    assert.equal(report.summary.untouched, 4);
    assert.equal(report.summary.seeded, 1);
    for (const t of [one, archivedOnly, broker, noModule]) assert.equal(rowFor(report, t.id), undefined, 'untouched tenants are not listed');
  });

  test('a second run creates nothing and writes nothing', () => {
    const store = createStore();
    store.addTenant({});
    store.addTenant({ businessLicenceCategory: 'TRADING', countryOfOrigin: 'gha' });
    real(store);
    const writes = store.writes;
    const second = real(store);
    assert.equal(store.writes, writes);
    assert.equal(second.summary.seeded, 0);
    assert.equal(second.summary.empty, 0);
    assert.equal(second.summary.untouched, 2);
  });

  test('a call with no options is a dry run, and it predicts the real run tenant by tenant', () => {
    const store = createStore();
    const a = store.addTenant({});
    const b = store.addTenant({ businessLicenceCategory: 'TRADING', countryOfOrigin: 'GH' });
    store.seedModule(b.id, { moduleGroup: FINANCE_MODULE });
    const c = store.addTenant({ businessLicenceCategory: 'SERVICES' });
    store.seedCategory(c.id, { name: 'Other Assets', ledgerGroup: 'ASSET' });

    const preview = run(store);
    assert.equal(preview.dryRun, true);
    assert.equal(store.writes, 0);
    assert.equal(preview.summary.stillEmpty, null);
    assert.ok(preview.tenants.every((r) => r.outcome === 'would-seed'));

    const done = real(store);
    for (const id of [a.id, b.id, c.id]) {
      const p = rowFor(preview, id);
      const r = rowFor(done, id);
      assert.equal(r.outcome, 'seeded');
      for (const k of ['template', 'overlays', 'accountsCreated', 'categoriesCreated', 'moduleEnabled', 'problems']) {
        assert.deepEqual(r[k], p[k], `${id} ${k}`);
      }
    }
  });
});

describe('backfill: which template', () => {
  test('no licence gets SERVICES and says so; SERVICES and TRADING get their own', () => {
    const store = createStore();
    const none = store.addTenant({});
    const services = store.addTenant({ businessLicenceCategory: 'SERVICES' });
    const trading = store.addTenant({ businessLicenceCategory: 'TRADING' });
    const report = real(store);
    assert.equal(rowFor(report, none.id).template, 'services');
    assert.equal(rowFor(report, none.id).licenceDefaulted, true);
    assert.equal(rowFor(report, services.id).licenceDefaulted, false);
    assert.equal(rowFor(report, trading.id).template, 'trading');
    assert.equal(store.accounts(none.id).length, SERVICES.accounts.length);
    assert.equal(store.accounts(services.id).length, SERVICES.accounts.length);
    assert.equal(store.accounts(trading.id).length, TRADING.accounts.length);
    assert.equal(store.categories(trading.id).length, TRADING.categories.length);
    // The licence is reported, never written back.
    assert.equal(store.tenants().find((t) => t.id === none.id).businessLicenceCategory, null);
  });

  test('countryOfOrigin spellings map to the Ghana overlay; anything else gets none', () => {
    for (const v of ['GH', 'gh', ' GHA ', 'gha', 'Ghana']) assert.equal(countryOverlayFor(catalogue, v), 'GH', v);
    for (const v of [null, undefined, '', '  ', 'NG', 'zz', 42]) assert.equal(countryOverlayFor(catalogue, v), null, String(v));
    const store = createStore();
    const t = store.addTenant({ countryOfOrigin: 'gha' });
    const report = real(store);
    assert.deepEqual(rowFor(report, t.id).overlays, ['GH']);
    assert.equal(store.accounts(t.id).length, SERVICES_GH.accounts.length);
  });

  test('brokerage licences are skipped as no-template, write nothing, and stay in stillEmpty', () => {
    const store = createStore();
    const ids = BROKERAGE_LICENCES.map((l) => store.addTenant({ businessLicenceCategory: l }).id);
    const report = real(store);
    assert.equal(store.writes, 0);
    for (const id of ids) {
      assert.equal(rowFor(report, id).outcome, 'skipped');
      assert.equal(rowFor(report, id).reason, 'no-template');
    }
    assert.deepEqual([...report.stillEmpty].sort(), [...ids].sort());
  });

  test('archived tenants are skipped and do not count as still empty', () => {
    const store = createStore();
    const t = store.addTenant({ archived: true });
    const report = real(store);
    assert.equal(rowFor(report, t.id).reason, 'archived');
    assert.equal(store.writes, 0);
    assert.equal(report.summary.stillEmpty, 0);
    assert.deepEqual(selectionFor(catalogue, { archived: true, businessLicenceCategory: 'SERVICES' }), { seed: false, reason: 'archived' });
  });
});

describe('backfill: the finance module', () => {
  test('created only when missing; an active row is kept, an archived one does not count', () => {
    const store = createStore();
    const has = store.addTenant({});
    store.seedModule(has.id, { moduleGroup: FINANCE_MODULE });
    store.seedModule(has.id, { moduleGroup: 'TRADING' });
    const archived = store.addTenant({});
    store.seedModule(archived.id, { moduleGroup: FINANCE_MODULE, archived: true });
    const none = store.addTenant({});
    const report = real(store);
    assert.equal(rowFor(report, has.id).moduleEnabled, false);
    assert.equal(store.modules(has.id).length, 2);
    assert.equal(rowFor(report, archived.id).moduleEnabled, true);
    assert.equal(financeModules(store, archived.id).length, 1);
    assert.equal(rowFor(report, none.id).moduleEnabled, true);
    assert.equal(financeModules(store, none.id)[0].account, none.id);
    assert.equal(report.summary.modulesEnabled, 2);
  });

  test('the brokerage listener stays silent: the chart is written before the module, in the same transaction', () => {
    const store = createStore();
    const t = store.addTenant({ businessLicenceCategory: 'SERVICES' });
    real(store);
    assert.equal(store.listenerRuns, 0);
    const names = store.accounts(t.id).map((a) => a.name);
    for (const s of BROKERAGE_SEED) assert.ok(!names.includes(s.account), `brokerage account ${s.account} seeded`);
    assert.equal(store.accounts(t.id).length, SERVICES.accounts.length);
  });

  test('control: enabling the module first, in its own transaction, lets the listener seed the brokerage chart', () => {
    // Proves the stand-in listener bites, so the previous check is not passing vacuously.
    const store = createStore();
    const t = store.addTenant({ businessLicenceCategory: 'SERVICES' });
    store.transaction(t.id, (tx) => tx.insertModule({ moduleGroup: FINANCE_MODULE, account: t.id }));
    assert.equal(store.listenerRuns, 1);
    assert.ok(store.accounts(t.id).some((a) => a.name === BROKERAGE_SEED[0].account));
  });

  test('every base template carries the category the listener guard looks for, and every seeded category names its account', () => {
    for (const base of Object.values(catalogue.bases)) {
      const composed = compose(catalogue, { businessLicenceCategory: base.businessLicenceCategory });
      assert.ok(composed.categories.some((c) => c.name === LISTENER_GUARD_CATEGORY), `${base.key} lacks ${LISTENER_GUARD_CATEGORY}`);
    }
    const store = createStore();
    const t = store.addTenant({});
    real(store);
    assert.ok(store.categories(t.id).every((c) => c.account === t.id));
  });
});

describe('backfill: isolation and races', () => {
  test('a tenant that fails mid-write rolls back completely and the others are still seeded', () => {
    const store = createStore({ failOnInsert: (t, _n, row) => t === bad.id && row.number === '2000' });
    const good1 = store.addTenant({ name: 'Good 1' });
    const bad = store.addTenant({ name: 'Bad' });
    const good2 = store.addTenant({ name: 'Good 2', businessLicenceCategory: 'TRADING' });
    const report = real(store);
    const r = rowFor(report, bad.id);
    assert.equal(r.outcome, 'failed');
    assert.match(r.error, /simulated/);
    assert.equal(r.accountsCreated, 0);
    assert.deepEqual(store.snapshot(bad.id), { accounts: [], categories: [], modules: [] });
    assert.equal(rowFor(report, good1.id).outcome, 'seeded');
    assert.equal(rowFor(report, good2.id).outcome, 'seeded');
    assert.deepEqual(report.stillEmpty, [bad.id]);
    assert.equal(report.summary.failed, 1);
  });

  test('a tenant that gains an account between the scan and its transaction is left alone', () => {
    let raced = false;
    const store = createStore({
      beforeTransaction: (t, s) => {
        if (t === target.id && !raced) { raced = true; s.seedAccount(t, { number: '1000', name: 'Typed by a user' }); }
      },
    });
    const target = store.addTenant({});
    const report = real(store);
    assert.equal(rowFor(report, target.id).outcome, 'skipped');
    assert.equal(rowFor(report, target.id).reason, 'gained-accounts');
    assert.equal(store.accounts(target.id).length, 1);
    assert.equal(store.categories(target.id).length, 0);
    assert.equal(store.modules(target.id).length, 0);
  });

  test('a tenant with categories but no accounts is seeded, reusing its categories', () => {
    const store = createStore();
    const t = store.addTenant({ businessLicenceCategory: 'SERVICES' });
    store.seedCategory(t.id, { name: 'OTHER ASSETS', ledgerGroup: 'ASSET', account: t.id });
    store.seedCategory(t.id, { name: 'Cash on Hand', ledgerGroup: 'ASSET', account: t.id });
    const report = real(store);
    assert.equal(rowFor(report, t.id).outcome, 'seeded');
    const names = store.categories(t.id).map((c) => c.name.toLowerCase());
    assert.equal(names.length, new Set(names).size, 'duplicate category');
    assert.equal(rowFor(report, t.id).categoriesCreated, SERVICES.categories.length - 2);
  });
});

describe('backfill: options, zero and overflow', () => {
  test('accountIds limits the run; unknown ids are ignored; an empty list scans nothing', () => {
    const store = createStore();
    const a = store.addTenant({});
    const b = store.addTenant({});
    const report = real(store, { accountIds: [a.id, 'no-such-account'] });
    assert.equal(report.summary.scanned, 1);
    assert.equal(rowFor(report, a.id).outcome, 'seeded');
    assert.equal(store.accounts(b.id).length, 0);
    assert.deepEqual(report.stillEmpty, []);
    const none = real(store, { accountIds: [] });
    assert.equal(none.summary.scanned, 0);
  });

  test('rejects option types the controller should have converted', () => {
    const store = createStore();
    store.addTenant({});
    assert.throws(() => run(store, { dryRun: 'false' }), TypeError);
    assert.throws(() => run(store, { dryRun: false, accountIds: 'acc-1' }), TypeError);
    assert.equal(store.writes, 0);
  });

  test('zero: no tenants, or no empty tenants, gives an empty report and writes nothing', () => {
    const empty = real(createStore());
    assert.deepEqual(empty.summary, { scanned: 0, untouched: 0, empty: 0, seeded: 0, skipped: 0, failed: 0, accountsCreated: 0, modulesEnabled: 0, stillEmpty: 0 });
    assert.deepEqual(empty.tenants, []);
    const store = createStore();
    const t = store.addTenant({});
    store.seedAccount(t.id, { number: '1', name: 'x' });
    const report = real(store);
    assert.equal(store.writes, 0);
    assert.deepEqual(report.tenants, []);
  });

  test('overflow: 1,000 empty tenants among 200 full ones are all seeded and the full ones are untouched', () => {
    const store = createStore();
    const empties = [];
    const full = [];
    for (let i = 0; i < 1200; i += 1) {
      const t = store.addTenant({ businessLicenceCategory: i % 3 === 0 ? 'TRADING' : null, countryOfOrigin: i % 2 ? 'GH' : null });
      if (i % 6 === 5) {
        for (let n = 0; n < 300; n += 1) store.seedAccount(t.id, { number: String(10000 + n), name: `Own ${n}` });
        full.push(t.id);
      } else {
        empties.push(t.id);
      }
    }
    const before = full.map((id) => store.snapshot(id));
    const report = real(store);
    assert.equal(empties.length, 1000);
    assert.equal(report.summary.seeded, 1000);
    assert.equal(report.summary.untouched, 200);
    assert.equal(report.summary.stillEmpty, 0);
    assert.equal(report.tenants.length, 1000);
    assert.deepEqual(full.map((id) => store.snapshot(id)), before);
    assert.equal(report.summary.accountsCreated, empties.reduce((n, id) => n + store.accounts(id).length, 0));
    assert.equal(report.summary.modulesEnabled, 1000);
  });
});

describe('plan files', () => {
  const html = readFileSync(join(TEMPLATE_DIR, '..', 'soupfin-146-coa-backfill.html'), 'utf8');
  const md = readFileSync(join(TEMPLATE_DIR, '..', 'soupfin-146-coa-backfill.md'), 'utf8');
  const fromHtml = JSON.parse(html.match(/<script type="application\/json" id="plan-index">([\s\S]*?)<\/script>/)[1]);
  const fromMd = JSON.parse(md.match(/```json plan-index\n([\s\S]*?)```/)[1]);

  test('the skeleton carries the page\'s plan-index verbatim', () => {
    assert.deepEqual(fromMd, fromHtml);
  });

  test('the plan has no ellipsis a reader could take for a value', () => {
    for (const text of [html, md]) assert.ok(!/\.\.\.|…/.test(text), 'ellipsis in a plan file');
  });
});
