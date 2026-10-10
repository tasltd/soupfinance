/**
 * SOUPFIN-103: the Reports hub — categories, search and favourites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useGsapAnimations', () => ({ usePageEntrance: () => ({ current: null }) }));

import { useAuthStore, useReportFavouritesStore } from '../../../stores';
import { ReportsPage } from '../ReportsPage';
import { REPORTS, REPORT_CATEGORIES } from '../reportRegistry';

function renderHub() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  );
}

function signInAs(username: string) {
  useAuthStore.setState({ user: { username, email: `${username}@example.com`, roles: [] }, isAuthenticated: true });
}

beforeEach(() => {
  localStorage.clear();
  useReportFavouritesStore.getState().reset();
  signInAs('ama');
});

describe('Reports hub', () => {
  it('lists every registered report under its category, linking to its page', () => {
    renderHub();
    for (const category of REPORT_CATEGORIES) {
      expect(screen.getByTestId(`reports-category-${category.id}`)).toHaveTextContent(category.title);
    }
    for (const report of REPORTS) {
      const section = screen.getByTestId(`reports-category-${report.category}`);
      expect(within(section).getByTestId(`report-link-${report.id}`)).toHaveAttribute('href', report.path);
    }
    expect(screen.getByTestId('report-link-scheduled')).toHaveAttribute('href', '/reports/scheduled');
  });

  it('narrows the list as the user searches, and hides categories with no match', async () => {
    const user = userEvent.setup();
    renderHub();

    await user.type(screen.getByTestId('reports-search'), 'receivable');

    expect(screen.getByTestId('report-link-ar-aging')).toBeVisible();
    expect(screen.queryByTestId('report-link-profit-loss')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reports-category-business-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reports-automation')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, and Clear search brings everything back', async () => {
    const user = userEvent.setup();
    renderHub();

    await user.type(screen.getByTestId('reports-search'), 'payroll');
    expect(screen.getByTestId('reports-no-results')).toHaveTextContent('No reports match “payroll”');

    await user.click(screen.getByTestId('reports-clear-search'));
    expect(screen.queryByTestId('reports-no-results')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^report-link-/)).toHaveLength(REPORTS.length + 1);
  });
});

describe('favourites', () => {
  it('starts with a hint, then pins a starred report to Favourites and saves it', async () => {
    const user = userEvent.setup();
    renderHub();
    expect(screen.getByTestId('reports-favourites-empty')).toHaveTextContent('Select the star');

    const star = screen.getByTestId('report-favourite-toggle-trial-balance');
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(star).toHaveAccessibleName('Add Trial Balance to favourites');
    await user.click(star);

    expect(star).toHaveAttribute('aria-pressed', 'true');
    const favourites = screen.getByTestId('reports-favourites');
    expect(within(favourites).getByTestId('report-favourite-card-trial-balance')).toHaveTextContent('Trial Balance');
    expect(JSON.parse(localStorage.getItem('report-favourites') ?? '{}').state.byUser).toEqual({
      ama: ['trial-balance'],
    });
  });

  it('keeps favourites in the order they were starred, and removes them again', async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByTestId('report-favourite-toggle-cash-flow'));
    await user.click(screen.getByTestId('report-favourite-toggle-profit-loss'));

    const cards = within(screen.getByTestId('reports-favourites')).getAllByTestId(/^report-favourite-card-/);
    expect(cards.map((card) => card.dataset.testid)).toEqual([
      'report-favourite-card-cash-flow',
      'report-favourite-card-profit-loss',
    ]);

    await user.click(screen.getByTestId('report-favourite-remove-cash-flow'));
    expect(screen.queryByTestId('report-favourite-card-cash-flow')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-favourite-toggle-cash-flow')).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps each user their own favourites on a shared browser', async () => {
    const user = userEvent.setup();
    const { unmount } = renderHub();
    await user.click(screen.getByTestId('report-favourite-toggle-balance-sheet'));
    unmount();

    signInAs('kwame');
    renderHub();
    expect(screen.getByTestId('reports-favourites-empty')).toBeVisible();
    expect(screen.getByTestId('report-favourite-toggle-balance-sheet')).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores a stale favourite for a report that no longer exists', () => {
    useReportFavouritesStore.setState({ byUser: { ama: ['retired-report', 'profit-loss'] } });
    renderHub();
    const cards = within(screen.getByTestId('reports-favourites')).getAllByTestId(/^report-favourite-card-/);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Profit & Loss');
  });

  it('filters favourites by the search too', async () => {
    useReportFavouritesStore.setState({ byUser: { ama: ['profit-loss'] } });
    const user = userEvent.setup();
    renderHub();
    await user.type(screen.getByTestId('reports-search'), 'aging');
    expect(screen.getByTestId('reports-favourites-empty')).toHaveTextContent(
      'None of your favourites match this search.'
    );
  });
});
