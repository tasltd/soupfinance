/**
 * Help Page (SOUPFIN-75)
 *
 * Shows the SoupFinance user guide inside the app, at /help.
 *
 * The guide itself is the static HTML written for SOUPFIN-52 and served from
 * public/user-guide/. It is embedded in an iframe rather than ported to React
 * so there stays one copy of the guide, and its own stylesheet cannot leak into
 * the app's Tailwind styles. A hash on the route (/help#invoices) is passed
 * through, so other screens can deep-link to a section.
 */
import { useLocation } from 'react-router-dom';
// Changed (SOUPFIN-81): the guide URL moved to helpSections so the
// "Need Help?" links share it; re-exported here for existing imports.
import { USER_GUIDE_URL } from '../../components/help/helpSections';

export { USER_GUIDE_URL };

export function HelpPage() {
  const { hash } = useLocation();
  const guideSrc = `${USER_GUIDE_URL}${hash}`;

  return (
    <div className="flex flex-col gap-6" data-testid="help-page">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="help-heading"
          >
            Help
          </h1>
          <p className="text-subtle-text">
            How to use SoupFinance, from your first invoice to your reports.
          </p>
        </div>
        <a
          href={guideSrc}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="help-open-new-tab"
          className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 border border-primary text-primary hover:bg-primary/10"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-xl">open_in_new</span>
          <span className="text-sm font-bold">Open in new tab</span>
        </a>
      </div>

      <div className="rounded-xl border border-border-light dark:border-border-dark bg-white overflow-hidden shadow-sm">
        <iframe
          src={guideSrc}
          title="SoupFinance user guide"
          data-testid="help-guide-frame"
          className="block w-full h-[calc(100vh-14rem)] min-h-[32rem] border-0"
        />
      </div>
    </div>
  );
}
