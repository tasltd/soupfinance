/**
 * Unit tests for the SOUPFIN-30 #13 aging-report empty-state pluralisation fix.
 *
 * The bug: V19 testing reported the A/R empty state reading
 * "All customer s are current" — an stray space before the plural "s".
 *
 * The root cause is NOT a typo in the string. The JSX was:
 *
 *     All {entityLabel.toLowerCase()}s are current as of this date.
 *
 * which compiles to THREE sibling children — ["All ", entity, "s are current…"] —
 * and React renders each as its own DOM text node. `textContent` happens to
 * concatenate them cleanly, so a naive assertion on the final string passes
 * either way. But any consumer that joins sibling text nodes with a separator
 * (accessibility-tree serialisers, screen readers, and the a11y scanners used
 * during V19 testing — see SOUPFIN-30 #6) reads it back as
 * "All customer s are current".
 *
 * The fix interpolates inside a single template literal so the paragraph holds
 * exactly ONE text node and cannot be split.
 *
 * These tests therefore assert on the DOM NODE STRUCTURE, not just the string —
 * asserting the text alone would not have caught the original bug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AgingReport } from '../../../types';

// An aging report with no outstanding items — this is what drives the empty state.
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

import {
  getARAgingReport,
  getAPAgingReport,
} from '../../../api/endpoints/reports';
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

/**
 * Joins an element's direct child text nodes the way an accessibility-tree
 * serialiser does — with a single space between adjacent nodes. This is the
 * exact transformation that surfaced the original "customer s" defect, so it
 * is what we assert against.
 */
function joinTextNodesWithSpace(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join(' ');
}

describe('AgingReportsPage — empty-state pluralisation (SOUPFIN-30 #13)', () => {
  beforeEach(() => {
    vi.mocked(getARAgingReport).mockResolvedValue(emptyReport);
    vi.mocked(getAPAgingReport).mockResolvedValue(emptyReport);
  });

  it('renders the A/R empty-state sentence as a SINGLE text node', async () => {
    renderPage();

    const message = await screen.findByTestId('ar-aging-empty-message');

    const textNodes = Array.from(message.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE
    );

    // The regression guard: three sibling text nodes is the bug.
    expect(textNodes).toHaveLength(1);
    expect(message.textContent).toBe('All customers are current as of this date.');
  });

  it('does not produce "customer s" when sibling text nodes are space-joined', async () => {
    renderPage();

    const message = await screen.findByTestId('ar-aging-empty-message');

    // This is what the V19 a11y scanner effectively did.
    const a11yReading = joinTextNodesWithSpace(message);

    expect(a11yReading).toBe('All customers are current as of this date.');
    expect(a11yReading).not.toContain('customer s');
    expect(a11yReading).not.toMatch(/\s{2,}/); // no doubled whitespace either
  });

  it('pluralises the A/P empty state as "vendors" with no stray space', async () => {
    renderPage();

    const message = await screen.findByTestId('ap-aging-empty-message');

    expect(
      Array.from(message.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
    ).toHaveLength(1);
    expect(joinTextNodesWithSpace(message)).toBe(
      'All vendors are current as of this date.'
    );
    expect(message.textContent).not.toContain('vendor s');
  });

  it('shows the empty state only while there are no items', async () => {
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

    // A/P is still empty, so its message must render...
    await screen.findByTestId('ap-aging-empty-message');

    // ...while A/R now has data and must NOT show the empty message.
    await waitFor(() => {
      expect(screen.queryByTestId('ar-aging-empty-message')).not.toBeInTheDocument();
    });
  });
});
