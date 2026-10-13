import { firefox } from '/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/node_modules/playwright/index.mjs';
const b = await firefox.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('file://' + process.cwd() + '/plans/soupfin-143-coa-template-seed-data.html');
for (const [id, f] of [['', 'top'], ['#evidence', 'evidence'], ['#seeding', 'seeding'], ['#services', 'services'], ['#ghana', 'ghana'], ['#matrix', 'matrix']]) {
  if (id) await p.locator(id).scrollIntoViewIfNeeded(); else await p.evaluate(() => window.scrollTo(0,0));
  await p.screenshot({ path: `.agent-work/plan-${f}.png` });
}
console.log(await p.evaluate(() => document.querySelectorAll('table').length), 'tables');
await b.close();
