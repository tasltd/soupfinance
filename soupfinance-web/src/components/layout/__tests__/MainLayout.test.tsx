/**
 * Unit tests for MainLayout — SOUPFIN-78.
 *
 * At a 390px viewport /dashboard measured 514px wide and /invoices 734px. The
 * content column beside the sidebar is a flex item; with the default
 * `min-width: auto` it could not shrink below its widest child (the invoice
 * table), so the whole page scrolled sideways and the tables' own
 * `overflow-x-auto` wrappers never engaged.
 *
 * jsdom does no layout, so these tests pin the class contract that makes the
 * column shrinkable. The real widths are measured in Firefox by
 * e2e/soupfin-78-mobile-no-sideways-scroll.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '../MainLayout';

function renderLayout(pageContent: React.ReactNode = <p data-testid="page-content">Page</p>) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={pageContent} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

/** The flex item beside the sidebar that holds the TopNav and <main>. */
function contentColumn() {
  const column = screen.getByRole('main').parentElement;
  expect(column).not.toBeNull();
  return column!;
}

describe('MainLayout (SOUPFIN-78: content column must be able to shrink)', () => {
  it('gives the content column min-w-0 so it can shrink below its content', () => {
    renderLayout();
    const column = contentColumn();
    // flex-1 makes it take the remaining width; min-w-0 overrides the
    // min-width:auto default that let a wide table widen the whole page.
    expect(column).toHaveClass('flex-1');
    expect(column).toHaveClass('min-w-0');
  });

  it('keeps the TopNav inside the shrinkable column, so it shrinks with it', () => {
    renderLayout();
    const column = contentColumn();
    // The header was the second-widest element in the report; it has to live
    // in the same column so it is bounded by the same width.
    const header = column.querySelector(':scope > header');
    expect(header).not.toBeNull();
  });

  it('still renders the routed page inside <main>', () => {
    renderLayout();
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('page-content'));
  });

  it('keeps the column shrinkable with no page content (zero case)', () => {
    renderLayout(null);
    expect(contentColumn()).toHaveClass('min-w-0');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('keeps the column shrinkable when the page content is far wider than any screen', () => {
    // The class contract must not depend on what the page renders: a 10000px
    // table gets the same shrinkable column (jsdom cannot measure the result;
    // the E2E spec does, at 320px with 60 oversized rows).
    renderLayout(
      <table data-testid="huge-table" style={{ minWidth: 10000 }}>
        <tbody>
          <tr>
            {Array.from({ length: 200 }, (_, i) => (
              <td key={i}>{'Consolidated Holdings International '.repeat(10)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    );
    expect(contentColumn()).toHaveClass('min-w-0');
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('huge-table'));
  });
});
