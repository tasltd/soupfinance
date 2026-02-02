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
      <div className="flex-1 flex flex-col transition-all duration-300">
        {/* Top Navigation */}
        <TopNav />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
