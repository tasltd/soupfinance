// Renders the SOUPFIN-143 plan from the committed template data, so the tables can never
// drift from the JSON the backend copies.
//
//   node plans/coa-templates/render-plan.mjs
//
// Writes plans/soupfin-143-coa-template-seed-data.html (the plan) and
// plans/soupfin-143-coa-template-seed-data.md (the machine-readable skeleton).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATE_DIR, loadCatalogue, compose, validate, allCompositions, summarise } from './compose.mjs';

const OUT_BASE = join(TEMPLATE_DIR, '..', 'soupfin-143-coa-template-seed-data');
const catalogue = loadCatalogue();

const PLAN_INDEX = {
  title: 'SOUPFIN-143 — COA template domain and seed data',
  revision: '1',
  goal: 'Every new SERVICES or TRADING tenant starts with a lean 69-90 account chart that contains every system account invoice and bill posting needs, seeded from versioned JSON templates with a Ghana tax overlay and optional industry overlays.',
  stories: [
    { id: 'P1', title: 'Template data (categories, account types, SERVICES, TRADING, GH, 6 industries, service-description map) committed in plans/coa-templates/', status: 'done' },
    { id: 'P2', title: 'Reference composer and 50-check validator (node --test plans/coa-templates/coa-templates.test.mjs)', status: 'done' },
    { id: 'P3', title: 'Backend: LedgerAccountType enum, LedgerAccount.accountType, TaxEntry liability/recoverable FKs, Flyway migration', status: 'todo' },
    { id: 'P4', title: 'Backend: CoaTemplateService (compose, seed with dry run, listTemplates) replacing createTrading/ServicesChartOfAccounts', status: 'todo' },
    { id: 'P5', title: 'Backend: default A/R and A/P FKs at seed time; linkLookups for service descriptions and tax entries', status: 'todo' },
    { id: 'P6', title: 'Backend: CoaTemplateServiceSpec + CoaTemplateSeedIntegrationSpec', status: 'todo' },
  ],
  screens: [],
  followUps: ['SOUPFIN-144', 'SOUPFIN-145', 'SOUPFIN-146', 'SOUPFIN-231', 'SOUPFIN-232', 'SOUPFIN-233', 'SOUPFIN-234'],
};

const FOLLOWUPS = [
  ['SOUPFIN-231', 'Frontend: the COA page files income and expense accounts under Equity, because <code>deriveLedgerGroup</code> reads the last segment of the category string. Blocks the epic\'s grouping criterion.'],
  ['SOUPFIN-232', 'Backend: post invoice and bill tax to the new TaxEntry liability and recoverable accounts. Output VAT currently lands in an expense account and A/P.'],
  ['SOUPFIN-233', 'Backend: update the Ghana tax seed for Act 1151 (drop the COVID-19 levy and flat rate, fix the 12.5% VAT row, mark NHIL and GETFund recoverable).'],
  ['SOUPFIN-234', 'Backend: the cash-flow statement filters <code>LedgerAccount</code> by an <code>account</code> property it does not have.'],
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const table = (headers, rows, rowClass = () => '') =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>\n` +
  rows.map((r, i) => `<tr${rowClass(i) ? ` class="${rowClass(i)}"` : ''}>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n') +
  '\n</tbody></table>';

function flags(a) {
  const out = [];
  if (a.accountType) out.push(`<span class="pill role">${esc(a.accountType)}</span>`);
  if (a.editable === false) out.push('<span class="pill lock">locked name</span>');
  if (a.cashFlow) out.push('<span class="pill cash">cash flow</span>');
  if (a.contra) out.push('<span class="pill contra">contra</span>');
  if (a.replace) out.push('<span class="pill lock">replaces base</span>');
  return out.join(' ');
}

function accountTable(accounts) {
  return table(['Number', 'Name', 'Category', 'Parent', 'Flags'],
    accounts.map((a) => [`<code>${esc(a.number)}</code>`, esc(a.name), esc(a.ledgerAccountCategory), a.parentAccount ? `<code>${esc(a.parentAccount)}</code>` : '', flags(a)]),
    (i) => (accounts[i].parentAccount ? 'child' : ''));
}

function sections() {
  const out = {};
  out.categories = table(['Name', 'Group', 'Sub-group', 'Parent', 'Found by'],
    catalogue.categories.map((c) => [
      `<code>${esc(c.name)}</code>${c.requiredByPosting ? ' <span class="pill lock">looked up</span>' : ''}`,
      esc(c.ledgerGroup), esc(c.ledgerSubGroup ?? ''), esc(c.parentCategory ?? ''),
      c.lookedUpBy.map(esc).join('<br>'),
    ]));
  out.types = table(['Value', 'Singleton', 'Required for', 'Used by'],
    catalogue.accountTypes.map((t) => [`<code>${t.name}</code>`, t.singleton ? 'yes' : 'no', t.requiredFor.join(', ') || 'optional', esc(t.usedBy)]));

  const services = compose(catalogue, { businessLicenceCategory: 'SERVICES' });
  const trading = compose(catalogue, { businessLicenceCategory: 'TRADING' });
  out.services = `<p>${services.accounts.length} accounts in ${services.categories.length} categories. ${esc(catalogue.bases.SERVICES.description)}</p>` + accountTable(services.accounts);
  out.trading = `<p>${trading.accounts.length} accounts in ${trading.categories.length} categories. ${esc(catalogue.bases.TRADING.description)}</p>` + accountTable(trading.accounts);

  const gh = catalogue.countries.GH;
  out.gh = `<p>Removes <code>${gh.remove.join('</code>, <code>')}</code> and adds or replaces ${gh.add.length} accounts.</p>` + accountTable(gh.add);
  out.taxmap = table(['TaxEntry abbreviation', 'Liability (output)', 'Recoverable (input)', 'Note'],
    Object.entries(gh.taxEntryMap).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [
      `<code>${esc(k)}</code>`,
      v?.liability ? `<code>${v.liability}</code>` : '',
      v?.recoverable ? `<code>${v.recoverable}</code>` : '',
      v === null ? 'Not linked (abolished, or sector-specific)' : esc(v._note ?? (v.optional ? 'Only when present' : '')),
    ]));

  out.industries = Object.values(catalogue.industries).map((ind) =>
    `<h3>${esc(ind.name)} <small>(${ind.appliesTo.join(', ')})</small></h3><p>${esc(ind.description)}</p>` + accountTable(ind.add)).join('\n');

  const rows = allCompositions(catalogue).map((c) => {
    const composed = compose(catalogue, c);
    const s = summarise(composed);
    const problems = validate(catalogue, composed);
    return [`<code>${esc(s.key)}</code>`, s.accounts, s.categories, s.systemAccounts,
      problems.length ? `<span class="bad">${problems.length} problems</span>` : '<span class="ok">valid</span>'];
  });
  out.matrix = table(['Composition', 'Accounts', 'Categories', 'Role accounts', 'validate()'], rows);

  const name = (n, tpl) => tpl.accounts.find((a) => a.number === n)?.name;
  out.sd = table(['Service description', 'Type', 'Number', 'SERVICES account', 'TRADING account'],
    catalogue.serviceDescriptions.map((s) => [esc(s.name), s.type, `<code>${s.number}</code>`,
      esc(name(s.number, services) ?? `fallback: ${s.type === 'INVOICE' ? 'Service Revenue' : 'Sundry Expenses'}`),
      esc(name(s.number, trading) ?? `fallback: ${s.type === 'INVOICE' ? 'Sales Revenue' : 'Sundry Expenses'}`)]));
  return out;
}

function enumValues() {
  return catalogue.accountTypes.map((t, i) =>
    `    ${t.name}(${t.singleton})${i === catalogue.accountTypes.length - 1 ? ';' : ','}`).join('\n');
}

const indexBlock = `<script type="application/json" id="plan-index">\n${JSON.stringify(PLAN_INDEX, null, 2)}\n</script>`;
let html = readFileSync(join(TEMPLATE_DIR, 'plan.src.html'), 'utf8')
  .replace('<!--PLAN_INDEX-->', indexBlock)
  .replace('<!--ENUM_VALUES-->', enumValues())
  .replace('<!--FOLLOWUPS-->', FOLLOWUPS.map(([id, text]) => `<li>${id} (filed with this plan): ${text}</li>`).join('\n  '));
for (const [key, body] of Object.entries(sections())) html = html.replace(`<!--TABLE:${key}-->`, body);
if (/<!--(TABLE|PLAN_INDEX|ENUM_VALUES|FOLLOWUPS)/.test(html)) throw new Error('unreplaced marker in plan.src.html');
writeFileSync(`${OUT_BASE}.html`, html);

const md = `# ${PLAN_INDEX.title}

Skeleton of \`soupfin-143-coa-template-seed-data.html\` (the plan a person reads). Regenerate both with
\`node plans/coa-templates/render-plan.mjs\`; do not edit either by hand.

**Goal:** ${PLAN_INDEX.goal}

**Data:** \`plans/coa-templates/\` — the backend copies these JSON files to
\`soupmarkets-web/grails-app/conf/seed-data/coa/\` verbatim. Check them with
\`node --test plans/coa-templates/coa-templates.test.mjs\`.

## Parts

${PLAN_INDEX.stories.map((s) => `- **${s.id}** [${s.status}] ${s.title}`).join('\n')}

## Compositions

| Composition | Accounts | Categories | Role accounts |
|---|---|---|---|
${allCompositions(catalogue).map((c) => summarise(compose(catalogue, c))).map((s) => `| ${s.key} | ${s.accounts} | ${s.categories} | ${s.systemAccounts} |`).join('\n')}

## Follow-ups

${FOLLOWUPS.map(([id, text]) => `- ${id}: ${text.replace(/<\/?code>/g, '`')}`).join('\n')}

\`\`\`json plan-index
${JSON.stringify(PLAN_INDEX, null, 2)}
\`\`\`
`;
writeFileSync(`${OUT_BASE}.md`, md);
console.log(`wrote ${OUT_BASE}.html (${html.length} bytes) and ${OUT_BASE}.md (${md.length} bytes)`);
