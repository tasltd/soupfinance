/**
 * Reports Hub Page
 *
 * Changed (SOUPFIN-103): the hub lists every report in the registry, grouped by
 * category, with a search box and favourites. It used to be a hardcoded list of
 * six cards, so a new report meant editing this page as well as adding one.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
// Added: GSAP page entrance animation (SOUP-679)
import { usePageEntrance } from '../../hooks/useGsapAnimations';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import { useReportFavourites } from '../../stores';
import {
  REPORTS,
  groupReportsByCategory,
  searchReports,
  type ReportDefinition,
} from './reportRegistry';

// Added: data-testid attributes for E2E testing
export function ReportsPage() {
  // Added: GSAP page entrance animation ref (SOUP-679)
  const pageRef = usePageEntrance();
  const [query, setQuery] = useState('');
  const { favourites, isFavourite, toggleFavourite } = useReportFavourites();

  const matches = useMemo(() => searchReports(query), [query]);
  const groups = useMemo(() => groupReportsByCategory(matches), [matches]);
  const favouriteReports = useMemo(
    () =>
      favourites
        .map((id) => REPORTS.find((report) => report.id === id))
        .filter((report): report is ReportDefinition => Boolean(report))
        .filter((report) => matches.includes(report)),
    [favourites, matches]
  );
  const searching = query.trim().length > 0;

  return (
    <div ref={pageRef} className="flex flex-col gap-8" data-testid="reports-page">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="reports-heading">Reports</h1>
        <p className="text-subtle-text">Financial reports and analytics</p>
        <HelpLink section="reports" className="mt-1 self-start" />
      </div>

      {/* Search */}
      <div className="relative max-w-xl">
        <label htmlFor="reports-search" className="sr-only">
          Search reports
        </label>
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text">search</span>
        <input
          id="reports-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports, for example aging or balance"
          className="w-full h-12 pl-10 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:ring-primary/50 focus:border-primary"
          data-testid="reports-search"
        />
      </div>

      {/* Favourites */}
      <section className="flex flex-col gap-3" data-testid="reports-favourites" aria-labelledby="reports-favourites-heading">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">star</span>
          <h2 id="reports-favourites-heading" className="text-lg font-bold text-text-light dark:text-text-dark">
            Favourites
          </h2>
        </div>
        {favouriteReports.length > 0 ? (
          <ReportGrid
            reports={favouriteReports}
            scope="favourite"
            isFavourite={isFavourite}
            onToggleFavourite={toggleFavourite}
          />
        ) : (
          <p className="text-sm text-subtle-text" data-testid="reports-favourites-empty">
            {searching && favourites.length > 0
              ? 'None of your favourites match this search.'
              : 'Select the star on a report to keep it here.'}
          </p>
        )}
      </section>

      {/* Reports by category */}
      {groups.map(({ category, reports }) => (
        <section
          key={category.id}
          className="flex flex-col gap-3"
          data-testid={`reports-category-${category.id}`}
          aria-labelledby={`reports-category-${category.id}-heading`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">{category.icon}</span>
            <h2
              id={`reports-category-${category.id}-heading`}
              className="text-lg font-bold text-text-light dark:text-text-dark"
            >
              {category.title}
            </h2>
            <span className="text-sm text-subtle-text">· {category.description}</span>
          </div>
          <ReportGrid
            reports={reports}
            scope="category"
            isFavourite={isFavourite}
            onToggleFavourite={toggleFavourite}
          />
        </section>
      ))}

      {matches.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 p-12 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-center"
          data-testid="reports-no-results"
        >
          <span className="material-symbols-outlined text-5xl text-subtle-text/50">search_off</span>
          <p className="font-bold text-text-light dark:text-text-dark">No reports match “{query.trim()}”</p>
          <p className="text-sm text-subtle-text">Try a different word, such as profit, aging or balance.</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90"
            data-testid="reports-clear-search"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Automation: scheduled delivery is not a report, so it sits outside the categories */}
      {!searching && (
        <section className="flex flex-col gap-3" data-testid="reports-automation">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">schedule_send</span>
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Automation</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/reports/scheduled"
              className="flex flex-col gap-3 p-6 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-primary transition-colors"
              data-testid="report-link-scheduled"
            >
              <span className="material-symbols-outlined text-3xl text-primary">event_repeat</span>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Scheduled Reports</h3>
              <p className="text-sm text-subtle-text">Automate report generation and delivery</p>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

interface ReportGridProps {
  reports: ReportDefinition[];
  /** Keeps test ids unique when a report shows in Favourites and in its category. */
  scope: 'favourite' | 'category';
  isFavourite: (reportId: string) => boolean;
  onToggleFavourite: (reportId: string) => void;
}

function ReportGrid({ reports, scope, isFavourite, onToggleFavourite }: ReportGridProps) {
  const prefix = scope === 'favourite' ? 'report-favourite-card' : 'report-card';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {reports.map((report) => {
        const starred = isFavourite(report.id);
        return (
          <div key={report.id} className="relative" data-testid={`${prefix}-${report.id}`}>
            <Link
              to={report.path}
              className="flex h-full flex-col gap-3 p-6 pr-14 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-primary transition-colors"
              data-testid={scope === 'category' ? `report-link-${report.id}` : undefined}
            >
              <span className="material-symbols-outlined text-3xl text-primary">{report.icon}</span>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">{report.title}</h3>
              <p className="text-sm text-subtle-text">{report.description}</p>
            </Link>
            {/* A sibling of the link, not inside it: a button nested in a link is invalid HTML */}
            <button
              type="button"
              onClick={() => onToggleFavourite(report.id)}
              aria-pressed={starred}
              aria-label={starred ? `Remove ${report.title} from favourites` : `Add ${report.title} to favourites`}
              title={starred ? 'Remove from favourites' : 'Add to favourites'}
              // The icon font is loaded without its FILL axis, so a starred report is
              // marked by a filled chip rather than a filled glyph.
              className={`absolute top-3 right-3 flex size-9 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                starred
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'text-subtle-text hover:bg-primary/10 hover:text-primary'
              }`}
              data-testid={scope === 'category' ? `report-favourite-toggle-${report.id}` : `report-favourite-remove-${report.id}`}
            >
              <span className="material-symbols-outlined">star</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
