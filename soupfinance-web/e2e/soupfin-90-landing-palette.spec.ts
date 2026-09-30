/**
 * SOUPFIN-90 — landing page custom colours never loaded
 *
 * soupfinance-landing/index.html configured the Tailwind Play CDN with
 * `tailwindcss.config = {...}`. The CDN defines `tailwind`, not `tailwindcss`,
 * so that line threw a ReferenceError and every custom colour class
 * (bg-primary, text-text-primary, bg-text-primary, border-border, ...) was a
 * no-op. On www.soupfinance.com that made the nav "Start Free Trial" button
 * white on white, and the dark closing call to action and footer white text on
 * a white page.
 *
 * The page review also found `from-white/98` on the hero overlay: 98 is not a
 * Tailwind opacity step, so below the lg breakpoint the whole overlay was
 * dropped and the hero text sat straight on the photo.
 *
 * The homepage is served from this checkout's soupfinance-landing/ files
 * through a routed origin, so the spec checks this code, not what is live.
 *
 * Run: E2E_PORT=5190 npx playwright test e2e/soupfin-90-landing-palette.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = 'e2e/playwright/screenshots/soupfin-90';
mkdirSync(SHOTS, { recursive: true });

// ESM spec: no __dirname, derive it from the module URL.
const LANDING_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../soupfinance-landing');
const LANDING_ORIGIN = 'http://soupfinance-landing.localhost';

// The design tokens from the page's own tailwind.config, as computed colours.
const PRIMARY = 'rgb(242, 74, 13)'; // #f24a0d
const PRIMARY_DARK = 'rgb(217, 63, 8)'; // #d93f08
const BACKGROUND_LIGHT = 'rgb(248, 246, 245)'; // #f8f6f5
const TEXT_PRIMARY = 'rgb(24, 19, 17)'; // #181311
const TEXT_SECONDARY = 'rgb(138, 107, 96)'; // #8a6b60
const BORDER = 'rgb(230, 222, 219)'; // #e6dedb
const WHITE = 'rgb(255, 255, 255)';

/**
 * Below this contrast ratio text is effectively invisible. White on white is
 * 1:1. The lowest ratio on the page as designed is about 3:1 (orange
 * "BETA TESTING" on its light orange pill). This is a floor for "can it be
 * seen at all", not a WCAG AA audit.
 */
const MIN_VISIBLE_CONTRAST = 2.5;

/** Serve soupfinance-landing/ from this checkout on a routed origin. */
async function serveLanding(page: Page) {
  await page.route(`${LANDING_ORIGIN}/**`, (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = normalize(join(LANDING_DIR, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(LANDING_DIR) || !existsSync(file)) {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ path: file });
  });
}

/** Open the homepage and wait until the Play CDN has generated its stylesheet. */
async function openHomepage(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await serveLanding(page);
  await page.goto(`${LANDING_ORIGIN}/`);
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav');
    return nav !== null && getComputedStyle(nav).position === 'fixed';
  });
  return pageErrors;
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

function colours(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, text: style.color, border: style.borderBottomColor };
  });
}

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test.describe('SOUPFIN-90: landing page palette', () => {
  test('the config loads and the nav Start Free Trial button is orange with white text', async ({ page }) => {
    const pageErrors = await openHomepage(page);

    // The config script runs cleanly and reaches the global the CDN reads.
    expect(pageErrors).toEqual([]);
    const primary = await page.evaluate(
      () =>
        (window as unknown as { tailwind: { config: { theme: { extend: { colors: Record<string, string> } } } } })
          .tailwind.config.theme.extend.colors.primary
    );
    expect(primary).toBe('#f24a0d');

    const navTrial = page.locator('nav').getByRole('link', { name: 'Start Free Trial' });
    await expect(navTrial).toBeVisible();
    await expect(navTrial).toHaveAttribute('href', 'https://app.soupfinance.com/register');
    await expect(navTrial).toHaveCSS('background-color', PRIMARY);
    await expect(navTrial).toHaveCSS('color', WHITE);
    await shot(page, 'landing-nav-start-free-trial');

    // hover:bg-primary-dark is part of the same palette.
    await navTrial.hover();
    await expect(navTrial).toHaveCSS('background-color', PRIMARY_DARK);
    await shot(page, 'landing-nav-start-free-trial-hover');

    // Body and nav chrome pick up the page tokens.
    expect(await colours(page, 'body')).toMatchObject({ background: BACKGROUND_LIGHT, text: TEXT_PRIMARY });
    expect((await colours(page, 'nav')).border).toBe(BORDER);
    await expect(page.locator('nav').getByRole('link', { name: 'Features' })).toHaveCSS('color', TEXT_SECONDARY);
    await expect(page.locator('h1 .text-primary')).toHaveCSS('color', PRIMARY);

    // Domain rule: the landing page links to the app, it never signs anyone in.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('clicking through the nav, the dark sections render dark with readable white text', async ({ page }) => {
    await openHomepage(page);

    // "About" smooth-scrolls to the Tech At Scale section (the page's own click
    // handler prevents the hash change); its button is bg-text-primary.
    await page.locator('nav').getByRole('link', { name: 'About' }).click();
    await expect(page.locator('#about')).toBeInViewport();
    const visit = page.getByRole('link', { name: /Visit Tech At Scale/ });
    await expect(visit).toBeInViewport();
    await expect(visit).toHaveCSS('background-color', TEXT_PRIMARY);
    await expect(visit).toHaveCSS('color', WHITE);
    await shot(page, 'landing-about-visit-button');

    // The closing call to action and the footer are bg-text-primary sections.
    const cta = page.locator('section', { has: page.getByRole('heading', { name: 'Ready to Simplify Your Accounting?' }) });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toHaveCSS('background-color', TEXT_PRIMARY);
    await expect(cta.getByRole('heading')).toHaveCSS('color', WHITE);
    await expect(cta.getByRole('link', { name: 'Talk to Sales' })).toBeVisible();

    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toHaveCSS('background-color', TEXT_PRIMARY);
    await expect(footer.getByRole('heading', { name: 'Legal' })).toHaveCSS('color', WHITE);
    await shot(page, 'landing-cta-and-footer');

    await shot(page, 'landing-full-page', true);
  });

  test('every class on the page generates CSS (overflow edge: all 220+ classes)', async ({ page }) => {
    await openHomepage(page);

    const { total, dead } = await page.evaluate(() => {
      const selectors: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) selectors.push(rule.selectorText);
          if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules);
        } catch {
          // Cross-origin sheets (Google Fonts) cannot be read.
        }
      }
      const all = selectors.join('\n');
      const classes = new Set<string>();
      document.querySelectorAll('[class]').forEach((el) => el.classList.forEach((c) => classes.add(c)));
      return {
        total: classes.size,
        dead: [...classes].filter((c) => !all.includes(`.${CSS.escape(c)}`)),
      };
    });

    // An empty scan would pass vacuously; the page uses well over 200 classes.
    expect(total).toBeGreaterThan(200);
    // material-symbols-outlined is defined by the cross-origin Google Fonts sheet.
    expect(dead).toEqual(['material-symbols-outlined']);
  });

  test('no visible text is lost against its background', async ({ page }) => {
    await openHomepage(page);

    const results = await page.evaluate(() => {
      type Rgba = { r: number; g: number; b: number; a: number };
      const parse = (value: string): Rgba | null => {
        const m = value.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1].split(',').map((part) => parseFloat(part));
        return { r, g, b, a };
      };
      const over = (top: Rgba, base: Rgba): Rgba => ({
        r: top.r * top.a + base.r * (1 - top.a),
        g: top.g * top.a + base.g * (1 - top.a),
        b: top.b * top.a + base.b * (1 - top.a),
        a: 1,
      });
      const luminance = ({ r, g, b }: Rgba) => {
        const f = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };

      const checked: { text: string; ratio: number }[] = [];
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (!ownText) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;

        // Walk up, collecting background layers until an opaque one. Text on a
        // gradient or image cannot be judged from colours alone; skip it.
        const layers: Rgba[] = [];
        let hidden = false;
        let onImage = false;
        let opaque = false;
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.opacity === '0') {
            hidden = true;
            break;
          }
          if (opaque || onImage) continue;
          if (style.backgroundImage !== 'none') {
            onImage = true;
            continue;
          }
          const bg = parse(style.backgroundColor);
          if (bg && bg.a > 0) {
            layers.push(bg);
            opaque = bg.a >= 1;
          }
        }
        if (hidden || onImage) continue;

        let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
        for (const layer of layers.reverse()) background = over(layer, background);
        const text = over(parse(getComputedStyle(el).color)!, background);
        const [hi, lo] = [luminance(text), luminance(background)].sort((x, y) => y - x);
        checked.push({ text: el.textContent!.trim().slice(0, 40), ratio: (hi + 0.05) / (lo + 0.05) });
      }
      return checked;
    });

    expect(results.length).toBeGreaterThan(100);
    const unreadable = results.filter((r) => r.ratio < MIN_VISIBLE_CONTRAST).map((r) => r.text);
    expect(unreadable).toEqual([]);
  });

  test('on a phone the nav button and the hero overlay render (narrow edge)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await openHomepage(page);

    const navTrial = page.locator('nav').getByRole('link', { name: 'Start Free Trial' });
    await expect(navTrial).toBeVisible();
    await expect(navTrial).toHaveCSS('background-color', PRIMARY);
    await expect(navTrial).toHaveCSS('color', WHITE);

    // The overlay that keeps the hero text off the photo exists below lg.
    const overlay = page.locator('section').first().locator('.bg-gradient-to-r').first();
    await expect(overlay).toHaveCSS(
      'background-image',
      'linear-gradient(to right, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.2))'
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'landing-phone-hero');
  });
});
