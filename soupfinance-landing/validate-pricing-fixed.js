const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  // Navigate to landing page using IP, which will now serve the correct content
  // because www-soupfinance-com.conf matches *:80 (any ServerName)
  await page.goto('http://65.20.112.224/', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Get page content to verify
  const title = await page.title();
  const content = await page.content();
  const hasPricing = content.toLowerCase().includes('pricing');
  const hasSoupFinance = content.toLowerCase().includes('soupfinance');
  
  console.log('Page title:', title);
  console.log('Has SoupFinance content:', hasSoupFinance);
  console.log('Has pricing content:', hasPricing);
  console.log('');
  
  if (hasSoupFinance && hasPricing) {
    console.log('✓ Correct landing page loaded');
    
    // Capture full page
    await page.screenshot({ path: 'landing-page-full.png', fullPage: true });
    console.log('✓ Full page screenshot: landing-page-full.png (fullPage)');
    
    // Scroll to pricing section
    const pricingFound = await page.evaluate(() => {
      const pricing = document.querySelector('[id*="pricing"], [class*="pricing"]');
      if (pricing) {
        pricing.scrollIntoView({ behavior: 'instant', block: 'center' });
        return true;
      }
      return false;
    });
    
    if (pricingFound) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'landing-page-pricing-section.png' });
      console.log('✓ Pricing section screenshot: landing-page-pricing-section.png');
    } else {
      console.log('ℹ Pricing section not found by ID/class, capturing page middle');
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'landing-page-pricing-section.png' });
      console.log('✓ Page middle screenshot: landing-page-pricing-section.png');
    }
  } else {
    console.log('✗ Apache default page still being served');
    console.log('First 300 chars:', content.substring(0, 300));
  }
  
  await browser.close();
})();
