/**
 * Unit tests for the industry codes and COA overlay preselection (SOUPFIN-151).
 *
 * The overlay table is checked against plans/coa-templates/industry/*.json, the
 * data the backend seeds from, so a new or renamed overlay fails here instead of
 * silently leaving the template picker with nothing to preselect.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  INDUSTRY_CODES,
  INDUSTRY_OVERLAYS,
  industryOverlayFor,
  isIndustryCode,
} from '../industry';
import type { IndustryCode } from '../industry';

const OVERLAY_DIR = resolve(__dirname, '../../../../plans/coa-templates/industry');
const LOCALES_DIR = resolve(__dirname, '../../i18n/locales');

interface OverlayFile {
  key: string;
  appliesTo: string[];
}

function readOverlays(): OverlayFile[] {
  return readdirSync(OVERLAY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(OVERLAY_DIR, f), 'utf8')) as OverlayFile);
}

describe('industry codes', () => {
  it('lists each code once, with "other" last', () => {
    expect(new Set(INDUSTRY_CODES).size).toBe(INDUSTRY_CODES.length);
    expect(INDUSTRY_CODES[INDUSTRY_CODES.length - 1]).toBe('other');
  });

  it('mirrors every COA industry overlay key and appliesTo list', () => {
    const overlays = readOverlays();
    expect(overlays.length).toBeGreaterThan(0);

    const fromFiles = Object.fromEntries(overlays.map((o) => [o.key, [...o.appliesTo].sort()]));
    const fromCode = Object.fromEntries(
      Object.entries(INDUSTRY_OVERLAYS).map(([k, v]) => [k, [...(v ?? [])].sort()])
    );
    expect(fromCode).toEqual(fromFiles);
    for (const key of Object.keys(fromFiles)) {
      expect(isIndustryCode(key)).toBe(true);
    }
  });

  it.each(['en', 'de', 'fr', 'nl'])('has a label for every code in %s, and no stray labels', (locale) => {
    const corporate = JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'corporate.json'), 'utf8'));
    const options = corporate.industry.options as Record<string, string>;
    expect(Object.keys(options).sort()).toEqual([...INDUSTRY_CODES].sort());
    for (const code of INDUSTRY_CODES) {
      expect(options[code].trim().length).toBeGreaterThan(0);
    }
    for (const key of ['label', 'optional', 'placeholder', 'overlayHint', 'noOverlayHint']) {
      expect(corporate.industry[key]).toEqual(expect.any(String));
    }
  });
});

describe('isIndustryCode', () => {
  it('accepts every listed code', () => {
    for (const code of INDUSTRY_CODES) {
      expect(isIndustryCode(code)).toBe(true);
    }
  });

  it.each([undefined, null, '', 'Retail', 'RETAIL', 'retail ', 'Professional Services', 42, {}, 'x'.repeat(10_000)])(
    'rejects %p',
    (value) => {
      expect(isIndustryCode(value)).toBe(false);
    }
  );
});

describe('industryOverlayFor', () => {
  it('preselects the overlay when it applies to the business type', () => {
    expect(industryOverlayFor('retail', 'TRADING')).toBe('retail');
    expect(industryOverlayFor('saas', 'SERVICES')).toBe('saas');
    expect(industryOverlayFor('professional-services', 'SERVICES')).toBe('professional-services');
    expect(industryOverlayFor('non-profit', 'SERVICES')).toBe('non-profit');
    expect(industryOverlayFor('construction', 'TRADING')).toBe('construction');
    expect(industryOverlayFor('construction', 'SERVICES')).toBe('construction');
    expect(industryOverlayFor('hospitality', 'TRADING')).toBe('hospitality');
  });

  it('returns null when the overlay does not apply to the business type', () => {
    // The backend rejects these pairings with overlay-not-applicable
    expect(industryOverlayFor('retail', 'SERVICES')).toBeNull();
    expect(industryOverlayFor('saas', 'TRADING')).toBeNull();
    expect(industryOverlayFor('non-profit', 'TRADING')).toBeNull();
  });

  it('returns null for an industry with no overlay', () => {
    const withoutOverlay = INDUSTRY_CODES.filter((c) => !(c in INDUSTRY_OVERLAYS));
    expect(withoutOverlay).toContain('agriculture');
    for (const code of withoutOverlay) {
      expect(industryOverlayFor(code, 'SERVICES')).toBeNull();
      expect(industryOverlayFor(code, 'TRADING')).toBeNull();
    }
  });

  it('returns null when industry or business type is missing or unknown', () => {
    expect(industryOverlayFor('', 'TRADING')).toBeNull();
    expect(industryOverlayFor(null, 'TRADING')).toBeNull();
    expect(industryOverlayFor(undefined, 'TRADING')).toBeNull();
    expect(industryOverlayFor('Retail & Wholesale', 'TRADING')).toBeNull();
    expect(industryOverlayFor('retail', undefined)).toBeNull();
    expect(industryOverlayFor('retail', null)).toBeNull();
  });

  it('gives every code a deterministic answer for both business types', () => {
    const results = INDUSTRY_CODES.flatMap((code: IndustryCode) => [
      industryOverlayFor(code, 'SERVICES'),
      industryOverlayFor(code, 'TRADING'),
    ]);
    // 6 overlays: construction and hospitality apply to both bases, 4 apply to one
    expect(results.filter((r) => r !== null)).toHaveLength(8);
  });
});
