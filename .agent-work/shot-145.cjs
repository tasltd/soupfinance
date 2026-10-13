const { firefox } = require('/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/node_modules/playwright');
(async () => { const b = await firefox.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 1400 } });
await p.goto('file://' + process.argv[2]); await p.screenshot({ path: process.argv[3] + '-top.png' });
await p.evaluate(() => document.querySelector('h2:nth-of-type(5)').scrollIntoView()); await p.screenshot({ path: process.argv[3] + '-files.png' });
console.log(await p.evaluate(() => document.body.scrollHeight)); await b.close(); })();
