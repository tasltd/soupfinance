/**
 * Unit tests for the SOUPFIN-35 aging-report empty-state acronym fix.
 *
 * The bug: with no outstanding items the A/R panel read
 *
 *     No outstanding a/r
 *
 * because the heading was derived from the panel title:
 *
 *     No outstanding {title.toLowerCase().replace(' aging', '')}
 *
 * `title` is "A/R Aging", so `.toLowerCase()` destroyed the acronym. The A/P
 * panel had the same defect. Casing is CONTENT, not a transform — the fix
 * passes an explicit, already-cased `shortLabel` ("A/R" / "A/P") instead of
 * deriving one, and does the same for the entity plural so the sibling
 * `entityLabel.toLowerCase() + 's'` derivation cannot break on an acronym or
 * an irregular plural later.
 *
 * The heading is also asserted for DOM node structure, because
 * `No outstanding {shortLabel}` compiles to two sibling text nodes and an
 * accessibility-tree serialiser joining them with a space yields
 * "No outstanding  A/R" (doubled space) — the SOUPFIN-30 #13 defect class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AgingReport } from '../../../types';

const emptyReport: AgingReport = {
  asOf: '2026-07-21',
  items: [],
  totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 },
};

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getARAgingReport: vi.fn(),
    getAPAgingReport: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getARAgingReport, getAPAgingReport } from '../../../api/endpoints/reports';
import { AgingReportsPage } from '../AgingReportsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgingReportsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Joins direct child text nodes the way an a11y serialiser does. */
function joinTextNodesWithSpace(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join(' ');
}

describe('AgingReportsPage — empty-state acronym casing (SOUPFIN-35)', () => {
  beforeEach(() => {
    vi.mocked(getARAgingReport).mockResolvedValue(emptyReport);
    vi.mocked(getAPAgingReport).mockResolvedValue(emptyReport);
  });

  it('renders the A/R heading with the acronym cased, not lowercased', async () => {
    renderPage();

    const heading = await screen.findByTestId('ar-aging-empty-heading');

    expect(heading.textContent).toBe('No outstanding A/R');
  });

  it('renders the A/P heading with the acronym cased, not lowercased', async () => {
    renderPage();

    const heading = await screen.findByTestId('ap-aging-empty-heading');

    expect(heading.textContent).toBe('No outstanding A/P');
  });

  // The exact reported strings. Asserting their ABSENCE pins the bug so it
  // cannot silently return if someone reintroduces a `.toLowerCase()`.
  it.each([
    ['ar-aging-empty-heading', 'a/r'],
    ['ap-aging-empty-heading', 'a/p'],
  ])('never renders the lowercased acronym in %s', async (testId, lowercased) => {
    renderPage();

    const heading = await screen.findByTestId(testId);

    expect(heading.textContent).not.toContain(lowercased);
  });

  // Guards the SOUPFIN-30 #13 defect class in the heading specifically:
  // a space-joining a11y reader must not see a doubled space.
  it.each(['ar-aging-empty-heading', 'ap-aging-empty-heading'])(
    'renders %s as a single text node with no doubled whitespace',
    async (testId) => {
      renderPage();

      const heading = await screen.findByTestId(testId);
      const textNodes = Array.from(heading.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE
      );

      expect(textNodes).toHaveLength(1);
      expect(joinTextNodesWithSpace(heading)).not.toMatch(/\s{2,}/);
    }
  );

  // The entity plural is now an explicit prop rather than
  // `entityLabel.toLowerCase() + 's'`; confirm both panels still read correctly.
  it.each([
    ['ar-aging-empty-message', 'All customers are current as of this date.'],
    ['ap-aging-empty-message', 'All vendors are current as of this date.'],
  ])('renders the explicit plural sentence in %s', async (testId, expected) => {
    renderPage();

    const message = await screen.findByTestId(testId);

    expect(message.textContent).toBe(expected);
  });

  it('shows no empty heading for a panel that has data', async () => {
    vi.mocked(getARAgingReport).mockResolvedValue({
      ...emptyReport,
      items: [
        {
          entity: { id: 'c-1', name: 'Acme Corp' },
          current: 100,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 100,
        },
      ],
      totals: { current: 100, days30: 0, days60: 0, days90: 0, over90: 0, total: 100 },
    });

    renderPage();

    // A/P is still empty and keeps its cased heading...
    expect((await screen.findByTestId('ap-aging-empty-heading')).textContent).toBe(
      'No outstanding A/P'
    );

    // ...while A/R has data, so no empty heading at all.
    await waitFor(() => {
      expect(screen.queryByTestId('ar-aging-empty-heading')).not.toBeInTheDocument();
    });
  });
});
