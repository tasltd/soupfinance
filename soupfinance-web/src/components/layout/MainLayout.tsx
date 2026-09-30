/**
 * Main Layout Component
 * Used for authenticated pages with sidebar navigation
 * Reference: soupfinance-designs/balance-sheet-report/
 */
import { Outlet } from 'react-router-dom';
import { SideNav } from './SideNav';
import { TopNav } from './TopNav';

export function MainLayout() {
  return (
    <div className="relative flex min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Side Navigation */}
      <SideNav />

      {/* Main Content Area */}
      {/* Note: No margin-left needed - sidebar is md:sticky so it's in document flow */}
      {/* Fix (SOUPFIN-91): min-w-0. A flex item defaults to min-width:auto, so this
          column grew to the min-content width of the widest page content (the
          dashboard's min-w-[480px] invoice table made it 514px). On a 360px phone
          the whole page, top bar included, became 514px wide and main's
          overflow-x-hidden cut off the right side. With min-w-0 the column stays
          at the viewport width and wide content scrolls inside its own
          overflow-x-auto wrapper. */}
      <div className="flex-1 min-w-0 flex flex-col transition-all duration-300">
        {/* Top Navigation */}
        <TopNav />

        {/* Page Content */}
        {/* Changed: Added overflow-x-hidden to prevent page-level horizontal scroll on mobile */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Changed: Reduced mobile padding from p-6 to p-4 for more content space on small screens */}
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
