/**
 * SOUPFIN-90 — the marketing site's Tailwind colours must load.
 *
 * www.soupfinance.com (soupfinance-landing/) styles itself with the Tailwind
 * Play CDN, which defines ONE global, `tailwind`, and reads `tailwind.config`.
 * The homepage wrote `tailwindcss.config = {...}`: that line threw a
 * ReferenceError, so no custom colour applied and the nav "Start Free Trial"
 * button (bg-primary text-white) was white on white.
 *
 * These tests run each page's config script in a sandbox holding only what the
 * CDN provides, then check that every palette class a page uses names a colour
 * that page actually defines. The browser-level check (computed colours and
 * classes with no CSS rule) lives in e2e/soupfin-90-landing-palette.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const LANDING_DIR = resolve(__dirname, '../../../soupfinance-landing');
const CDN_TAG = '<script src="https://cdn.tailwindcss.com"></script>';

const PAGES = readdirSync(LANDING_DIR)
  .filter((file) => file.endsWith('.html'))
  .sort();

type Colours = Record<string, string>;
interface TailwindConfig {
  theme?: { extend?: { colors?: Colours } };
}

function readPage(file: string): string {
  return readFileSync(resolve(LANDING_DIR, file), 'utf8');
}

/** The inline <script> that directly follows the CDN tag. */
function configScript(html: string): string {
  const at = html.indexOf(CDN_TAG);
  if (at === -1) throw new Error('page does not load the Tailwind Play CDN');
  const match = /^\s*<script>([\s\S]*?)<\/script>/.exec(html.slice(at + CDN_TAG.length));
  if (!match) throw new Error('no inline config script after the Tailwind CDN tag');
  return match[1];
}

/** Run a config script with only what the Play CDN puts on window: `tailwind`. */
function runConfig(script: string): TailwindConfig | undefined {
  const sandbox: { tailwind: { config?: TailwindConfig } } = { tailwind: {} };
  runInNewContext(script, sandbox);
  return sandbox.tailwind.config;
}

function coloursOf(file: string): Colours {
  return runConfig(configScript(readPage(file)))?.theme?.extend?.colors ?? {};
}

/** Every class token in every class="" attribute, with variant prefixes (hover:, lg:) removed. */
function classTokens(html: string): string[] {
  return [...html.matchAll(/\bclass="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean)
    .map((token) => token.slice(token.lastIndexOf(':') + 1));
}

const COLOUR_UTILITY = /^(bg|text|border|from|via|to|ring|shadow|divide|outline|decoration|placeholder|fill|stroke|accent|caret)-(.+?)(?:\/(.+))?$/;

describe('SOUPFIN-90: landing page Tailwind config', () => {
  it('finds the homepage and the four legal pages', () => {
    expect(PAGES).toEqual([
      'acceptable-use-policy.html',
      'cookie-policy.html',
      'index.html',
      'privacy-policy.html',
      'terms-of-service.html',
    ]);
  });

  it.each(PAGES)('%s configures the global the Play CDN defines, without throwing', (file) => {
    const script = configScript(readPage(file));
    expect(script).toMatch(/\btailwind\.config\s*=/);
    expect(script).not.toMatch(/\btailwindcss\.config\s*=/);

    const colours = runConfig(script)?.theme?.extend?.colors;
    expect(colours).toBeDefined();
    expect(Object.keys(colours!).length).toBeGreaterThan(0);
    expect(colours!.primary).toBe('#f24a0d');
  });

  it('the homepage palette carries the SoupFinance design tokens', () => {
    expect(coloursOf('index.html')).toEqual({
      primary: '#f24a0d',
      'primary-dark': '#d93f08',
      'background-light': '#f8f6f5',
      surface: '#ffffff',
      'text-primary': '#181311',
      'text-secondary': '#8a6b60',
      border: '#e6dedb',
    });
  });

  it('the old tailwindcss.config line throws in the same sandbox (zero edge: the check can fail)', () => {
    expect(() => runConfig("tailwindcss.config = { theme: { extend: { colors: { primary: '#f24a0d' } } } }"))
      .toThrow(/tailwindcss is not defined/);
    // And a page with no config assignment yields no palette at all.
    expect(runConfig('// nothing here')).toBeUndefined();
  });

  it.each(PAGES)(
    '%s: every palette class names a colour this page defines (overflow edge: all uses)',
    (file) => {
      const html = readPage(file);
      const own = new Set(Object.keys(coloursOf(file)));
      // A token is a palette token if ANY landing page defines it. Using one
      // this page does not define renders as nothing, silently.
      const everyPalette = new Set(PAGES.flatMap((page) => Object.keys(coloursOf(page))));

      const paletteUses = classTokens(html)
        .map((token) => COLOUR_UTILITY.exec(token))
        .filter((m): m is RegExpExecArray => m !== null && everyPalette.has(m[2]))
        .map((m) => m[2]);

      // Every page leans on its palette heavily; an empty scan means the parser broke.
      expect(paletteUses.length).toBeGreaterThan(file === 'index.html' ? 150 : 20);
      expect(paletteUses.filter((name) => !own.has(name))).toEqual([]);
    }
  );

  it.each(PAGES)('%s: every /opacity modifier is one Tailwind 3.4 generates', (file) => {
    // Tailwind 3.4 (what the CDN serves) has opacity steps of 5 from 0 to 100.
    // Anything else, such as /98, generates no CSS unless written as /[0.98].
    const invalid = classTokens(readPage(file))
      .map((token) => COLOUR_UTILITY.exec(token)?.[3])
      .filter((modifier): modifier is string => modifier !== undefined)
      .filter((modifier) => !/^\[.+\]$/.test(modifier))
      .filter((modifier) => !(/^\d+$/.test(modifier) && Number(modifier) % 5 === 0 && Number(modifier) <= 100));
    expect(invalid).toEqual([]);
  });
});
