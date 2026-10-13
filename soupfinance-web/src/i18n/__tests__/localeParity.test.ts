/**
 * Locale key parity (SOUPFIN-167)
 *
 * Every namespace file under src/i18n/locales/en/ must exist in de, fr and nl
 * with exactly the same keys, no blank values and the same {{placeholders}}.
 * A key missing from one locale silently falls back to English at runtime, which
 * is how the German, French and Dutch invoice screens ended up half English.
 * This suite fails instead, naming the locale, namespace and key.
 */
import { describe, it, expect } from 'vitest';
import i18n, { namespaces, supportedLanguages } from '../index';

type Json = { [key: string]: string | Json };

// Every locale file, read straight from disk so a file that exists but was
// never registered in i18n/index.ts is still checked.
const files = import.meta.glob<Json>('../locales/*/*.json', { eager: true, import: 'default' });

function loadLocales(): Record<string, Record<string, Json>> {
  const byLocale: Record<string, Record<string, Json>> = {};
  for (const [path, data] of Object.entries(files)) {
    const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, locale, namespace] = match;
    (byLocale[locale] ??= {})[namespace] = data;
  }
  return byLocale;
}

/** Flatten nested keys to dotted paths, keeping each leaf value. */
export function flattenKeys(obj: Json, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.set(path, value);
    } else {
      for (const [k, v] of flattenKeys(value, path)) out.set(k, v);
    }
  }
  return out;
}

/** Keys present in the reference but not in the candidate. */
export function findMissingKeys(reference: Json, candidate: Json): string[] {
  const have = flattenKeys(candidate);
  return [...flattenKeys(reference).keys()].filter((key) => !have.has(key));
}

function placeholders(text: string): string[] {
  return (text.match(/{{\s*[\w.]+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();
}

const locales = loadLocales();
const reference = locales.en;
const otherLocales = Object.keys(supportedLanguages).filter((l) => l !== 'en');

describe('locale key parity', () => {
  it('has a locale folder for every supported language', () => {
    expect(Object.keys(locales).sort()).toEqual(Object.keys(supportedLanguages).sort());
  });

  it('registers every English namespace file with i18next', () => {
    expect([...namespaces].sort()).toEqual(Object.keys(reference).sort());
  });

  it('registers the clients namespace in every language', () => {
    for (const lng of Object.keys(supportedLanguages)) {
      expect(i18n.hasResourceBundle(lng, 'clients'), `${lng}/clients`).toBe(true);
    }
  });

  describe.each(otherLocales)('%s', (locale) => {
    it.each(Object.keys(reference))('%s.json has every English key and no extra keys', (namespace) => {
      const candidate = locales[locale]?.[namespace];
      expect(candidate, `${locale}/${namespace}.json is missing`).toBeDefined();
      expect(findMissingKeys(reference[namespace], candidate!), `missing from ${locale}/${namespace}.json`).toEqual([]);
      expect(findMissingKeys(candidate!, reference[namespace]), `extra in ${locale}/${namespace}.json`).toEqual([]);
    });

    it.each(Object.keys(reference))('%s.json keeps the English {{placeholders}} and has no blank values', (namespace) => {
      const english = flattenKeys(reference[namespace]);
      const translated = flattenKeys(locales[locale][namespace]);
      for (const [key, value] of translated) {
        expect(value.trim(), `${locale}/${namespace}.json ${key} is blank`).not.toBe('');
        expect(placeholders(value), `${locale}/${namespace}.json ${key}`).toEqual(placeholders(english.get(key) ?? ''));
      }
    });
  });

  it('English has no blank values either', () => {
    for (const [namespace, data] of Object.entries(reference)) {
      for (const [key, value] of flattenKeys(data)) {
        expect(value.trim(), `en/${namespace}.json ${key}`).not.toBe('');
      }
    }
  });
});

describe('findMissingKeys (the check the parity suite relies on)', () => {
  it('reports a key missing from a nested section', () => {
    const en = { title: 'Invoices', list: { loading: 'Loading', columns: { amount: 'Amount' } } };
    const de = { title: 'Rechnungen', list: { loading: 'Lädt', columns: {} } };
    expect(findMissingKeys(en, de)).toEqual(['list.columns.amount']);
  });

  it('reports a whole missing section key by key', () => {
    const en = { a: 'x', status: { paid: 'Paid', sent: 'Sent' } };
    expect(findMissingKeys(en, { a: 'y' })).toEqual(['status.paid', 'status.sent']);
  });

  it('reports nothing for identical shapes, including empty files', () => {
    expect(findMissingKeys({}, {})).toEqual([]);
    expect(findMissingKeys({ a: { b: 'c' } }, { a: { b: 'd' } })).toEqual([]);
  });

  it('copes with a namespace far larger than any real one', () => {
    const big: Json = {};
    for (let i = 0; i < 5000; i++) big[`k${i}`] = { leaf: `v${i}` };
    const missingOne = { ...big };
    delete missingOne.k4999;
    expect(findMissingKeys(big, missingOne)).toEqual(['k4999.leaf']);
  });
});
