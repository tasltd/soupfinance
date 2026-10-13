/**
 * Test helpers for i18n audits.
 *
 * Added (SOUPFIN-183): shared by the bill and vendor translation tests.
 */

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Flattens a locale file to `dotted.key -> sorted {{placeholders}}`. Plural
 * variants (`range_one`, `range_other`, `range_many`) fold into one key, since
 * languages legitimately carry different plural forms; their placeholders are
 * unioned.
 */
export function flattenKeys(node: unknown, prefix = '', out = new Map<string, string[]>()): Map<string, string[]> {
  if (typeof node === 'string') {
    const key = prefix.replace(PLURAL_SUFFIX, '');
    const found = node.match(/{{\s*\w+\s*}}/g)?.map((p) => p.replace(/\s/g, '')) ?? [];
    out.set(key, [...new Set([...(out.get(key) ?? []), ...found])].sort());
    return out;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    flattenKeys(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

const RULES: Array<[string, RegExp]> = [
  // Text between a closing `>` and the next `<`, e.g. `>Bill Details</h2>`
  ['jsx text', />\s*([A-Z][A-Za-z ,.!?'’-]*[a-z][A-Za-z ,.!?'’-]*)\s*</g],
  // A user-visible attribute set to a literal, e.g. placeholder="Enter TIN"
  ['attribute', /\b(?:label|placeholder|title|aria-label|helperText|context|alt)="([^"]*[A-Za-z]{2,}[^"]*)"/g],
  // An English literal handed to the user through a call, e.g. setFormError('Please')
  ['message call', /\b(?:setFormError|confirm|alert|toast(?:\.\w+)?)\(\s*['"`]([A-Za-z][^'"`]*)['"`]/g],
  // An English fallback, e.g. `name || 'N/A'`
  ['fallback', /(?:\|\||\?\?)\s*'([A-Za-z][^']*)'/g],
  // A labelled template literal, e.g. `Tel: ${phone}`
  ['template label', /`([A-Z][a-z]+(?: [A-Za-z]+)*:) \$\{/g],
];

/** Returns every English string literal a user would see, as `rule: text`. */
export function findHardcodedEnglish(source: string): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  for (const [rule, pattern] of RULES) {
    for (const match of code.matchAll(pattern)) hits.push(`${rule}: ${match[1].trim()}`);
  }
  return hits;
}
