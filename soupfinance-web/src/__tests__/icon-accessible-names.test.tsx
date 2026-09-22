/**
 * SOUPFIN-71 — feature-page icon ligatures must not leak into accessible names.
 *
 * Follow-up to SOUPFIN-63, which fixed the navigation chrome only. Material
 * Symbols draws its glyph from the element's TEXT CONTENT
 * (`<span class="material-symbols-outlined">delete</span>`), so that ligature is
 * real text. Without `aria-hidden` it joins the accessible name of whatever
 * button or link wraps it: the vendor row's delete control was named
 * "delete Delete", and an icon-plus-label button was named "add Add Person".
 *
 * Two guards live here, and they cover different failure modes:
 *
 *   1. A SOURCE sweep over every `.tsx` under `src/`. The ticket covers ~380
 *      spans across 60 files; a per-page render test for each would be
 *      unmaintainable, and — more importantly — would not fail when somebody
 *      adds a 61st page. The sweep does. It is also the only check that can
 *      assert the INVERSE half of the fix: hiding an icon must not leave an
 *      icon-only control with no accessible name at all.
 *
 *   2. RENDER assertions on a real page, proving the attribute actually
 *      produces a clean accessible name at runtime rather than merely being
 *      present in the source. Both ends are covered: a page with ZERO rows
 *      (empty state — the icons there are decorative and nameless controls
 *      would be invisible to a row-based test) and a page with many rows
 *      (every row repeats the same three icon controls, so an ambiguity
 *      introduced by the fix shows up as N matches, not one).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Vendor } from '../types';

// ---------------------------------------------------------------------------
// Part 1 — source sweep
// ---------------------------------------------------------------------------

const SRC_ROOT = join(__dirname, '..');

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...listTsxFiles(full));
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/**
 * Index of every JSX opening tag of `name` in `src`, as
 * `[tagStart, afterTagName, indexOfClosingAngle]`.
 *
 * Written as a scanner rather than a regex because JSX attribute values contain
 * `{...}` expressions that may themselves contain `>` (arrow functions, generics,
 * comparisons). Stopping at the first `>` would truncate the attribute list and
 * make the sweep silently under-report.
 */
function findOpeningTags(src: string, name: string): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
      } else if (c === '>' && depth === 0) {
        break;
      }
      i++;
    }
    out.push([m.index, m.index + m[0].length, i]);
  }
  return out;
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

const SOURCE_FILES = listTsxFiles(SRC_ROOT);

describe('every Material Symbols icon span is aria-hidden (SOUPFIN-71)', () => {
  it('finds icon spans to check at all', () => {
    // Guards the guard: if the class name is ever renamed, the sweep below would
    // pass vacuously by inspecting nothing. The ticket counts ~380 spans, so any
    // figure near zero means this spec stopped testing anything.
    const total = SOURCE_FILES.reduce(
      (n, f) => n + findOpeningTags(readFileSync(f, 'utf8'), 'span')
        .filter(([, a, b]) => readFileSync(f, 'utf8').slice(a, b).includes('material-symbols-outlined'))
        .length,
      0
    );
    expect(total).toBeGreaterThan(300);
  });

  it('leaves no icon span without aria-hidden', () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      const src = readFileSync(file, 'utf8');
      for (const [start, afterName, gt] of findOpeningTags(src, 'span')) {
        const attrs = src.slice(afterName, gt);
        if (!attrs.includes('material-symbols-outlined')) continue;
        if (/\baria-hidden\b/.test(attrs)) continue;
        offenders.push(`${relative(SRC_ROOT, file)}:${lineOf(src, start)}`);
      }
    }

    // The regression: before the fix this listed ~380 locations.
    expect(offenders).toEqual([]);
  });
});

/** Elements that take an accessible name from their content. */
const NAMED_FROM_CONTENT = ['button', 'a', 'Link', 'NavLink'] as const;

/**
 * Inner JSX of the `name` element opening at `gt`, or null when the matching
 * close tag cannot be located (self-closing, or a shape this scanner does not
 * model — in which case it is skipped rather than guessed at).
 */
function innerOf(src: string, name: string, gt: number): string | null {
  if (src[gt - 1] === '/') return null;
  const pat = new RegExp(`<(/?)${name}\\b`, 'g');
  pat.lastIndex = gt + 1;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src))) {
    if (m[1]) {
      depth--;
      if (depth === 0) return src.slice(gt + 1, m.index);
      continue;
    }
    const [, , inner] = findOpeningTags(src.slice(m.index), name)[0];
    if (src[m.index + inner] !== undefined && src[m.index + inner - 1] !== '/') depth++;
    pat.lastIndex = m.index + inner + 1;
  }
  return null;
}

describe('no control is left nameless by hiding its icon (SOUPFIN-71)', () => {
  it('gives every icon-only button and link an aria-label or title', () => {
    const nameless: string[] = [];

    for (const file of SOURCE_FILES) {
      const src = readFileSync(file, 'utf8');
      for (const tag of NAMED_FROM_CONTENT) {
        for (const [start, afterName, gt] of findOpeningTags(src, tag)) {
          const inner = innerOf(src, tag, gt);
          if (inner === null || !inner.includes('material-symbols-outlined')) continue;

          // Strip JSX comments, then the icon spans, then remaining markup —
          // whatever text survives is a real visible label alongside the icon.
          let rest = inner.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
          rest = rest.replace(/<span\b[^>]*material-symbols-outlined[\s\S]*?<\/span>/g, '');
          rest = rest.replace(/<[^>]*>/g, '');
          if (rest.trim()) continue; // has its own label; icon is decorative

          const attrs = src.slice(afterName, gt);
          if (/\baria-label\b/.test(attrs) || /\btitle=/.test(attrs)) continue;
          nameless.push(`${relative(SRC_ROOT, file)}:${lineOf(src, start)} <${tag}>`);
        }
      }
    }

    // This is the half that hiding the icon CREATES: a close/delete/toggle
    // button whose only text was the ligature has no name once it is hidden.
    expect(nameless).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — render assertions on a real feature page
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  listVendors: vi.fn(),
  deleteVendor: vi.fn(),
}));

import { listVendors } from '../api';
import { VendorListPage } from '../features/vendors/VendorListPage';

/** Every ligature VendorListPage renders. None may appear in a control name. */
const VENDOR_LIGATURES = ['add', 'search', 'error', 'refresh', 'visibility', 'edit', 'delete', 'close', 'warning', 'storefront'];

function makeVendor(i: number): Vendor {
  return {
    id: `vendor-${i}`,
    name: `Vendor ${i}`,
    email: `vendor${i}@example.com`,
    phoneNumber: '555-0000',
    address: '1 Test Way',
    taxIdentificationNumber: `TAX-${i}`,
    paymentTerms: 30,
    notes: '',
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-1',
  };
}

function renderVendors() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VendorListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VendorListPage accessible names are free of ligatures (SOUPFIN-71)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the row controls exactly, one per row, across many rows', async () => {
    // Overflow end: 50 rows means 50 View/Edit/Delete controls. If the fix made
    // any of them ambiguous or nameless, the per-row lookup below breaks.
    const vendors = Array.from({ length: 50 }, (_, i) => makeVendor(i));
    vi.mocked(listVendors).mockResolvedValue(vendors);

    const { container } = renderVendors();
    await waitFor(() => expect(screen.getByTestId('vendor-list-table')).toBeInTheDocument());

    const rows = screen.getAllByTestId(/^vendor-row-/);
    expect(rows).toHaveLength(50);

    for (const row of rows) {
      // Before the fix these were named "visibility View" / "edit Edit" /
      // "delete Delete", so an exact-name lookup found nothing.
      expect(within(row).getByRole('link', { name: 'View' })).toBeInTheDocument();
      expect(within(row).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    }

    // Nothing anywhere on the page is still named by a ligature.
    for (const ligature of VENDOR_LIGATURES) {
      const re = new RegExp(ligature);
      expect(screen.queryAllByRole('button', { name: re })).toHaveLength(0);
      expect(screen.queryAllByRole('link', { name: re })).toHaveLength(0);
    }

    // The glyphs must survive: hiding them from a11y must not blank the UI.
    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon.textContent?.trim()).toBeTruthy();
    }
  });

  it('names the empty-state controls exactly when there are zero vendors', async () => {
    // Zero end: the empty state renders a large decorative icon plus a single
    // CTA. A decorative icon that is not hidden would name the CTA
    // "add Add Vendor"; a hidden icon with no sibling text would leave a
    // nameless control. Both are excluded here.
    vi.mocked(listVendors).mockResolvedValue([]);

    const { container } = renderVendors();
    await waitFor(() =>
      expect(screen.getByTestId('vendor-list-page')).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.queryByTestId('vendor-list-table')).toBeNull());

    for (const link of screen.getAllByRole('link')) {
      const name = (link.getAttribute('aria-label') ?? link.textContent ?? '').trim();
      expect(name).not.toBe('');
      for (const ligature of VENDOR_LIGATURES) {
        expect(name).not.toMatch(new RegExp(`\\b${ligature}\\b`));
      }
    }

    for (const icon of container.querySelectorAll('.material-symbols-outlined')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
