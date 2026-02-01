const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  // Navigate to the landing page (now on HTTP port 80)
  await page.goto('http://65.20.112.224', { waitUntil: 'networkidle' });
  
  // Capture full page
  await page.screenshot({ path: 'pricing-validation-full-v2.png', fullPage: true });
  console.log('✓ Full page screenshot captured');
  
  // Scroll to pricing section specifically
  await page.evaluate(() => {
    const pricing = document.getElementById('pricing');
    if (pricing) {
      pricing.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'pricing-validation-section-v2.png' });
  console.log('✓ Pricing section screenshot captured');
  
  // Get page title and check for Pricing section heading
  const title = await page.title();
  console.log('✓ Page title:', title);
  
  // Check if pricing section exists
  const pricingExists = await page.evaluate(() => {
    return !!document.getElementById('pricing');
  });
  console.log('✓ Pricing section exists:', pricingExists);
  
  // Get pricing cards count
  const pricingCardsCount = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="pricing"]');
    return cards.length;
  });
  console.log('✓ Pricing elements found:', pricingCardsCount);
  
  await browser.close();
  process.exit(0);
})();
