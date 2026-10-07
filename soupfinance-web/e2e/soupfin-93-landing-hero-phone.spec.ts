/**
 * SOUPFIN-93 — landing hero subtitle overlaps the photo on phones
 *
 * Below the lg breakpoint the hero heading and subtitle on www.soupfinance.com
 * are centred across the full width, but the overlay faded from 98% white on
 * the left to 20% white on the right. The right end of each subtitle line
 * ("payments, and", "business.", "software") sat on the dark hair in the photo:
 * measured at 1.0:1 contrast at 320 and 375px, and 1.2:1 at 768px.
 *
 * The overlay below lg is now near-flat (98% / 95% / 90% white). The lg:
 * classes are unchanged, so desktop keeps its fade to transparent.
 *
 * How the contrast is measured: each text line is captured twice, once as
 * rendered and once with the text made transparent. Pixels that differ are
 * glyph pixels; the second capture gives the photo-and-overlay colour under
 * each one. A third capture with the photo hidden proves the photo really is
 * behind the text, so the check cannot pass on a page whose image failed.
 *
 * The homepage is served from this checkout's soupfinance-landing/ files
 * through a routed origin, so the spec checks this code, not what is live.
 *
 * Run: E2E_PORT=5190 npx playwright test e2e/soupfin-93-landing-hero-phone.spec.ts --project=firefox
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = 'e2e/playwright/screenshots/soupfin-93';
mkdirSync(SHOTS, { recursive: true });

// ESM spec: no __dirname, derive it from the module URL.
const LANDING_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../soupfinance-landing');
const LANDING_ORIGIN = 'http://soupfinance-landing.localhost';

/*
 * Worst glyph contrast measured below lg, per overlay (320 / 375 / 768px):
 *
 *   overlay below lg        subtitle   orange accent   photo shows (mean/max diff)
 *   old   98 / 80 / 20      1.0        1.0             126 / 536
 *   issue 98 / 90 / 80      3.1        -               37 / 137
 *   fix   98 / 95 / 90      3.75       2.85            19 / 68
 *   alt   98 / 95 / 95      3.9        2.95            12 / 36
 *
 * Desktop (1440, unchanged): subtitle 4.2, accent 3.5.
 */

/** 18px text-secondary (#8a6b60) subtitle. Desktop reaches about 4.2:1. */
const MIN_SUBTITLE_CONTRAST = 3.5;
/** The near-black heading text; it measures about 14:1 with the fix. */
const MIN_HEADING_CONTRAST = 4.5;
/**
 * The orange "Made Simple" accent. Brand orange on the warm-tinted hero tops
 * out below 3:1 on phones with any overlay tried (tracked in SOUPFIN-96), so
 * this is the SOUPFIN-90 "can it be seen at all" floor. The old overlay put
 * "Made" on the mid-tone hair at 1.0:1.
 */
const MIN_ACCENT_CONTRAST = 2.5;

const PHONE_OVERLAY =
  'linear-gradient(to right, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))';
// What lg: rendered before this fix; it must not change.
const DESKTOP_OVERLAY =
  'linear-gradient(to right, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.6), rgba(0, 0, 0, 0))';

type Box = { x: number; y: number; width: number; height: number };
type LineStats = {
  line: string;
  glyphPixels: number;
  minContrast: number;
  worstAt: string;
  photoDiff: number;
};

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

/** Open the homepage and wait for the Play CDN stylesheet, the hero photo and the fonts. */
async function openHomepage(page: Page) {
  // In-page PNG decoder, so pixel work needs no Node image library.
  await page.addInitScript(() => {
    (window as unknown as { __decodePng: (b64: string) => Promise<ImageData> }).__decodePng = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    };
  });
  await serveLanding(page);
  await page.goto(`${LANDING_ORIGIN}/`);
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav');
    return nav !== null && getComputedStyle(nav).position === 'fixed';
  });
  // Zero edge: with no photo every contrast check would pass on plain white.
  await expect
    .poll(() => heroPhoto(page).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

const hero = (page: Page) => page.locator('section').first();
const heroPhoto = (page: Page) => hero(page).locator('img').first();
const overlay = (page: Page) => hero(page).locator('.bg-gradient-to-r').first();
const subtitle = (page: Page) => hero(page).locator('p').first();
const heading = (page: Page) => hero(page).getByRole('heading', { level: 1 });
const headingAccent = (page: Page) => heading(page).locator('span');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const MUTED = 'data-soupfin93-muted';

/** One box per rendered line of the element's own text (muted children skipped), in page coordinates. */
function lineBoxes(target: Locator): Promise<Box[]> {
  return target.evaluate((el, muted) => {
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(`[${muted}]`)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
    }
    const lines: { x: number; y: number; width: number; height: number }[] = [];
    for (const r of rects) {
      if (r.width < 4) continue;
      const box = { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
      const same = lines.find((l) => Math.abs(l.y - box.y) < box.height / 2);
      if (!same) {
        lines.push(box);
        continue;
      }
      const right = Math.max(same.x + same.width, box.x + box.width);
      same.x = Math.min(same.x, box.x);
      same.width = right - same.x;
    }
    return lines;
  }, MUTED);
}

async function setTextVisible(targets: Locator[], visible: boolean) {
  for (const target of targets) {
    await target.evaluate((el, show) => {
      for (const node of [el, ...Array.from(el.querySelectorAll('*'))] as HTMLElement[]) {
        if (show) node.style.removeProperty('color');
        else node.style.setProperty('color', 'transparent', 'important');
      }
    }, visible);
  }
}

async function setMuted(targets: Locator[], muted: boolean) {
  for (const target of targets) {
    await target.evaluate((el, [attr, on]) => {
      if (on) el.setAttribute(attr as string, '');
      else el.removeAttribute(attr as string);
    }, [MUTED, muted] as const);
  }
  await setTextVisible(targets, !muted);
}

async function capture(page: Page, clip: Box): Promise<string> {
  return (await page.screenshot({ clip, fullPage: true })).toString('base64');
}

/**
 * Contrast of `target`'s text colour against the pixel under each of its glyph
 * pixels, line by line. `mute` elements stay transparent in every capture, so
 * a differently coloured child (the orange accent) is measured on its own.
 */
async function measureLines(page: Page, target: Locator, mute: Locator[] = []): Promise<LineStats[]> {
  const colour = await target.evaluate((el) => getComputedStyle(el).color);
  await setMuted(mute, true);
  const texts = await target.evaluate((el, muted) => {
    // Label each line with its words, for a readable failure message.
    const words: { text: string; y: number }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(`[${muted}]`)) continue;
      for (const match of Array.from(node.textContent!.matchAll(/\S+/g))) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const rect = range.getBoundingClientRect();
        words.push({ text: match[0], y: rect.y + window.scrollY + rect.height / 2 });
      }
    }
    return words;
  }, MUTED);

  const results: LineStats[] = [];
  for (const box of await lineBoxes(target)) {
    const clip = {
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height),
    };
    const rendered = await capture(page, clip);
    await setTextVisible([target], false);
    const bare = await capture(page, clip);
    await heroPhoto(page).evaluate((img) => (img.style.visibility = 'hidden'));
    const noPhoto = await capture(page, clip);
    await heroPhoto(page).evaluate((img) => img.style.removeProperty('visibility'));
    await setTextVisible([target], true);
    await setTextVisible(mute, false);

    const stats = await page.evaluate(
      async ({ rendered, bare, noPhoto, colour }) => {
        const decode = (window as unknown as { __decodePng: (b64: string) => Promise<ImageData> }).__decodePng;
        const [withText, background, withoutPhoto] = await Promise.all([rendered, bare, noPhoto].map(decode));
        const channel = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (d: Uint8ClampedArray, i: number) =>
          0.2126 * channel(d[i]) + 0.7152 * channel(d[i + 1]) + 0.0722 * channel(d[i + 2]);
        const [r, g, b] = colour.match(/\d+/g)!.map(Number);
        const text = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

        let glyphPixels = 0;
        let minContrast = Infinity;
        let worstX = 0;
        let photoDiff = 0;
        for (let i = 0; i < withText.data.length; i += 4) {
          const diff = (a: ImageData, z: ImageData) =>
            Math.abs(a.data[i] - z.data[i]) + Math.abs(a.data[i + 1] - z.data[i + 1]) + Math.abs(a.data[i + 2] - z.data[i + 2]);
          photoDiff = Math.max(photoDiff, diff(background, withoutPhoto));
          // Anti-aliased fringes barely differ; they are not glyph pixels.
          if (diff(withText, background) < 24) continue;
          glyphPixels++;
          const under = luminance(background.data, i);
          const [hi, lo] = under > text ? [under, text] : [text, under];
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < minContrast) {
            minContrast = ratio;
            worstX = (i / 4) % withText.width;
          }
        }
        return { glyphPixels, minContrast, worstX, width: withText.width, photoDiff };
      },
      { rendered, bare, noPhoto, colour }
    );

    const line = texts
      .filter((w) => w.y >= box.y && w.y <= box.y + box.height)
      .map((w) => w.text)
      .join(' ');
    results.push({
      line,
      glyphPixels: stats.glyphPixels,
      minContrast: Math.round(stats.minContrast * 100) / 100,
      worstAt: `${Math.round((stats.worstX / stats.width) * 100)}% across`,
      photoDiff: stats.photoDiff,
    });
  }
  await setMuted(mute, false);
  return results;
}

/** Every line is real text on the photo, and none falls below `floor`. */
function expectReadable(lines: LineStats[], floor: number, minLines: number) {
  expect(lines.length).toBeGreaterThanOrEqual(minLines);
  for (const line of lines) {
    // Non-vacuous: the line was found and the photo shows through under it.
    expect(line.glyphPixels, line.line).toBeGreaterThan(200);
    expect(line.photoDiff, `photo behind "${line.line}"`).toBeGreaterThan(0);
  }
  const unreadable = lines.filter((l) => l.minContrast < floor);
  expect(unreadable, `lines below ${floor}:1`).toEqual([]);
}

test.setTimeout(90_000);

const WIDTHS = [
  { name: 'phone-320', width: 320, height: 568, subtitleLines: 5 }, // narrowest phone
  { name: 'phone-375', width: 375, height: 812, subtitleLines: 4 }, // the reported width
  { name: 'tablet-768', width: 768, height: 1024, subtitleLines: 3 }, // widest below lg
  { name: 'desktop-1440', width: 1440, height: 900, subtitleLines: 3 }, // lg: unchanged
];

test.describe('SOUPFIN-93: landing hero text stays off the photo', () => {
  for (const size of WIDTHS) {
    test(`${size.name}: the subtitle and heading read clearly over the photo`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openHomepage(page);
      await expect(subtitle(page)).toContainText('Streamline invoicing, payments, and financial reporting');
      await shot(page, `landing-hero-${size.name}`);

      const subtitleLines = await measureLines(page, subtitle(page));
      test.info().annotations.push({ type: 'subtitle', description: JSON.stringify(subtitleLines) });
      expectReadable(subtitleLines, MIN_SUBTITLE_CONTRAST, size.subtitleLines);

      // The dark heading text and its orange "Made Simple" accent, separately.
      const headingLines = await measureLines(page, heading(page), [headingAccent(page)]);
      const accentLines = await measureLines(page, headingAccent(page));
      test.info().annotations.push({ type: 'heading', description: JSON.stringify([...headingLines, ...accentLines]) });
      expectReadable(headingLines, MIN_HEADING_CONTRAST, 1);
      expectReadable(accentLines, MIN_ACCENT_CONTRAST, 1);
    });
  }

  test('the overlay is near-flat below lg and unchanged from lg up (boundary: 1023 / 1024)', async ({ page }) => {
    await openHomepage(page);
    for (const width of [320, 375, 768, 1023]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(overlay(page), `${width}px`).toHaveCSS('background-image', PHONE_OVERLAY);
    }
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(overlay(page), `${width}px`).toHaveCSS('background-image', DESKTOP_OVERLAY);
    }
  });

  test('the photo still shows through the phone overlay (it is not painted out)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openHomepage(page);

    // Compare the hero right of centre with and without the photo.
    const box = (await hero(page).boundingBox())!;
    const clip = { x: Math.floor(box.width / 2), y: 64, width: Math.floor(box.width / 2), height: 700 };
    const withPhoto = await capture(page, clip);
    await heroPhoto(page).evaluate((img) => (img.style.visibility = 'hidden'));
    const withoutPhoto = await capture(page, clip);
    await heroPhoto(page).evaluate((img) => img.style.removeProperty('visibility'));

    const { meanDiff, maxDiff } = await page.evaluate(
      async ({ a, b }) => {
        const decode = (window as unknown as { __decodePng: (b64: string) => Promise<ImageData> }).__decodePng;
        const [x, y] = await Promise.all([decode(a), decode(b)]);
        let sum = 0;
        let max = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          const d = Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]);
          sum += d;
          max = Math.max(max, d);
        }
        return { meanDiff: sum / (x.data.length / 4), maxDiff: max };
      },
      { a: withPhoto, b: withoutPhoto }
    );
    test.info().annotations.push({ type: 'photo', description: JSON.stringify({ meanDiff, maxDiff }) });
    // A white-out would read perfectly and show nothing. The fix measures about
    // 19 / 68; a 95% flat overlay (12 / 36) is where the photo stops reading.
    expect(maxDiff).toBeGreaterThan(50);
    expect(meanDiff).toBeGreaterThan(10);
  });

  test('overflow edge: a subtitle three times as long still reads over the photo at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openHomepage(page);

    // A longer translation wraps over more of the photo, including the face.
    await subtitle(page).evaluate((el) => {
      el.textContent = Array(3).fill(el.textContent!.trim().replace(/\s+/g, ' ')).join(' ');
    });
    const lines = await measureLines(page, subtitle(page));
    test.info().annotations.push({ type: 'long-subtitle', description: JSON.stringify(lines) });
    expectReadable(lines, MIN_SUBTITLE_CONTRAST, 10);
    await shot(page, 'landing-hero-phone-375-long-subtitle');
  });
});
