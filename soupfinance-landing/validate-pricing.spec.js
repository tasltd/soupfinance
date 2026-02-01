const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://65.20.112.224', { waitUntil: 'networkidle' });
  
  // Capture full page
  await page.screenshot({ path: 'pricing-validation-full.png', fullPage: true });
  
  // Scroll to pricing section specifically
  await page.evaluate(() => {
    const pricing = document.getElementById('pricing');
    if (pricing) pricing.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'pricing-validation-section.png' });
  
  console.log('Screenshots captured:');
  console.log('- pricing-validation-full.png (full page)');
  console.log('- pricing-validation-section.png (pricing section)');
  
  await browser.close();
})();
