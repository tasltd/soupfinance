const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  console.log('Navigating to landing page...');
  await page.goto('http://65.20.112.224/', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Verify we have the right page
  const title = await page.title();
  const content = await page.content();
  const hasPricing = content.toLowerCase().includes('pricing');
  
  console.log('✓ Page title:', title);
  console.log('✓ Has pricing section:', hasPricing);
  console.log('');
  
  if (!hasPricing) {
    console.log('First 500 chars:', content.substring(0, 500));
    await browser.close();
    process.exit(1);
  }
  
  // Capture full page
  console.log('Capturing full page screenshot...');
  await page.screenshot({ path: 'landing-page-full.png', fullPage: true });
  console.log('✓ landing-page-full.png');
  
  // Find and scroll to pricing section
  console.log('Scrolling to pricing section...');
  await page.evaluate(() => {
    // Try multiple selectors
    let pricingElement = 
      document.getElementById('pricing') ||
      document.querySelector('[id*="pricing"]') ||
      document.querySelector('[class*="pricing"]') ||
      document.querySelector('h2:has-text("Pricing")') ||
      Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent.includes('Pricing') && 
        (el.tagName === 'H2' || el.tagName === 'H1')
      );
    
    if (pricingElement) {
      pricingElement.scrollIntoView({ behavior: 'instant', block: 'center' });
      console.log('Found pricing element');
    }
  });
  
  await page.waitForTimeout(500);
  
  // Capture pricing section
  console.log('Capturing pricing section screenshot...');
  await page.screenshot({ path: 'landing-page-pricing-section.png' });
  console.log('✓ landing-page-pricing-section.png');
  
  // Get page height info
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('✓ Page height: ' + pageHeight + 'px');
  
  // Count pricing elements
  const pricingCount = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="plan"], [class*="price"], [class*="tier"]');
    return items.length;
  });
  console.log('✓ Pricing/plan elements found:', pricingCount);
  
  await browser.close();
  
  console.log('');
  console.log('=== SUCCESS: Landing Page Screenshots Captured ===');
  console.log('Files created:');
  console.log('  1. landing-page-full.png (full page height: ' + pageHeight + 'px)');
  console.log('  2. landing-page-pricing-section.png (pricing section)');
})();
