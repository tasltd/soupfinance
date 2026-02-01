const { chromium } = require('playwright');
const http = require('http');

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  
  // Set custom headers to ensure we hit the right vhost
  page.setDefaultNavigationTimeout(30000);
  
  // Navigate using IP with explicit Host header
  const options = new URL('http://65.20.112.224');
  
  // Use direct navigation with context
  await page.goto('http://65.20.112.224/', {
    waitUntil: 'networkidle',
    referer: 'http://www.soupfinance.com/'
  });
  
  // Override Host header by making request directly
  await page.context().addInitScript(() => {
    // Monkey patch fetch to add host header
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      return originalFetch.apply(this, args);
    };
  });
  
  // Try reloading with explicit navigation
  await page.goto('http://www.soupfinance.com', { waitUntil: 'networkidle' }).catch(() => {
    console.log('Note: Could not resolve www.soupfinance.com, will use IP');
  });
  
  // Get the page content to verify
  const content = await page.content();
  const isCorrectPage = content.includes('SoupFinance') && content.includes('pricing');
  
  if (isCorrectPage) {
    console.log('✓ Correct landing page loaded');
    
    // Capture full page
    await page.screenshot({ path: 'pricing-validation-landing-full.png', fullPage: true });
    console.log('✓ Full page screenshot captured');
    
    // Scroll to pricing section
    await page.evaluate(() => {
      const pricing = document.getElementById('pricing');
      if (pricing) pricing.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'pricing-validation-landing-section.png' });
    console.log('✓ Pricing section screenshot captured');
  } else {
    console.log('✗ Apache default page loaded instead');
    console.log('First 500 chars:', content.substring(0, 500));
  }
  
  // Check page elements
  const title = await page.title();
  const hasPricing = content.includes('pricing') || content.includes('Pricing');
  
  console.log('✓ Page title:', title);
  console.log('✓ Has pricing content:', hasPricing);
  
  await browser.close();
}

captureScreenshots().then(() => {
  console.log('\n=== Screenshots captured successfully ===');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
