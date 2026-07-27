/**
 * Unit tests for SideNav (SOUPFIN-30 #16 — "fix sidebar distortion when the
 * reports tab is selected").
 *
 * Reports has 7 sub-items. When it expanded, the nav column grew past the
 * viewport height; because the flex children could not shrink (`min-h-0` was
 * missing) the logo and the Help/Logout block were squashed and the sub-items
 * were clipped. The fix makes the nav column scroll and pins the bottom block.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SideNav } from '../SideNav';
import { useUIStore } from '../../../stores';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SideNav />
    </MemoryRouter>
  );
}

/** The scrollable nav column is the parent of <nav>. */
function navColumn(container: HTMLElement): HTMLElement {
  const nav = container.querySelector('nav');
  expect(nav).not.toBeNull();
  return nav!.parentElement as HTMLElement;
}

describe('SideNav layout does not distort when a long section expands', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
  });

  it('renders every Reports sub-item when the Reports section is active', () => {
    renderAt('/reports/aging');
    for (const label of [
      'All Reports',
      'Profit & Loss',
      'Balance Sheet',
      'Cash Flow',
      'Aging Reports',
      'Trial Balance',
      'Scheduled Reports',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('makes the nav column scrollable and shrinkable so it cannot squash siblings', () => {
    const { container } = renderAt('/reports/aging');
    const column = navColumn(container);
    // min-h-0 is the load-bearing class: without it a flex child refuses to
    // shrink below its content height, which is what caused the distortion.
    expect(column.className).toContain('min-h-0');
    expect(column.className).toContain('overflow-y-auto');
  });

  it('keeps the Help/Logout block at full height (shrink-0) alongside a long nav', () => {
    const { container } = renderAt('/reports/aging');
    const logout = screen.getByTestId('logout-button');
    const bottomBlock = logout.parentElement as HTMLElement;
    expect(bottomBlock.className).toContain('shrink-0');
    // Sanity: the bottom block is a sibling of the scrollable nav column.
    expect(bottomBlock.parentElement).toBe(navColumn(container).parentElement);
  });

  it('applies the same shrink rules for a short section (Ledger, 2 children)', () => {
    const { container } = renderAt('/ledger/accounts');
    expect(navColumn(container).className).toContain('min-h-0');
    expect(screen.getByRole('link', { name: 'Chart of Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
  });

  it('does not render sub-items for an inactive section', () => {
    renderAt('/dashboard');
    expect(screen.queryByRole('link', { name: 'Trial Balance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chart of Accounts' })).not.toBeInTheDocument();
  });

  it('hides sub-item labels when the sidebar is collapsed', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    renderAt('/reports/aging');
    expect(screen.queryByRole('link', { name: 'Trial Balance' })).not.toBeInTheDocument();
  });

  it('keeps the nav column scrollable even when collapsed', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    const { container } = renderAt('/reports/aging');
    expect(navColumn(container).className).toContain('min-h-0');
  });
});
