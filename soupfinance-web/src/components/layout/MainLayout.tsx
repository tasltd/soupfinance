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
      {/* Fix (SOUPFIN-78): min-w-0 lets this flex item shrink below its content.
          With the default min-width:auto it grew to the widest table (734px on
          /invoices at a 390px viewport), so the whole page scrolled sideways and
          the tables' own overflow-x-auto wrappers never engaged. */}
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
