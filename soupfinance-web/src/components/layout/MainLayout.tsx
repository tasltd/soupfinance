/**
 * Main Layout Component
 * Used for authenticated pages with sidebar navigation
 * Reference: soupfinance-designs/balance-sheet-report/
 */
import { Outlet } from 'react-router-dom';
import { SideNav } from './SideNav';
import { TopNav } from './TopNav';
import { useUIStore } from '../../stores';

export function MainLayout() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <div className="relative flex min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Side Navigation */}
      <SideNav />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
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
