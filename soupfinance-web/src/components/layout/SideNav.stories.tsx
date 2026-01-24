/**
 * SideNav Component Stories
 * Showcases Side Navigation in different states: expanded, collapsed, mobile
 * Reference: soupfinance-designs/balance-sheet-report/, design-system.md Side Navigation Bar
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SideNav } from './SideNav';
import { useUIStore, useAuthStore } from '../../stores';
import { useEffect } from 'react';

// Added: Wrapper component to set up store state for stories
interface StoryWrapperProps {
  collapsed?: boolean;
  mobileOpen?: boolean;
  activePath?: string;
  children: React.ReactNode;
}

function StoryWrapper({ collapsed = false, mobileOpen = false, activePath = '/dashboard', children }: StoryWrapperProps) {
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen);

  // Added: Set initial store state
  useEffect(() => {
    setSidebarCollapsed(collapsed);
    setMobileSidebarOpen(mobileOpen);
    
    // Set mock user data (AuthUser doesn't have id field)
    useAuthStore.setState({
      user: {
        email: 'admin@soupfinance.com',
        username: 'Admin User',
        roles: ['ROLE_ADMIN'],
      },
      isAuthenticated: true,
    });
  }, [collapsed, mobileOpen, setSidebarCollapsed, setMobileSidebarOpen]);

  return (
    <MemoryRouter initialEntries={[activePath]}>
      <Routes>
        <Route path="*" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

// Added: Meta configuration for SideNav stories
const meta = {
  title: 'Layout/SideNav',
  component: SideNav,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => {
      const args = context.args as { collapsed?: boolean; mobileOpen?: boolean; activePath?: string };
      const collapsed = args.collapsed ?? false;
      const mobileOpen = args.mobileOpen ?? false;
      const activePath = args.activePath ?? '/dashboard';
      
      return (
        <StoryWrapper collapsed={collapsed} mobileOpen={mobileOpen} activePath={activePath}>
          <div className="flex min-h-screen bg-background-light dark:bg-background-dark">
            <Story />
            {/* Main content placeholder */}
            <div className="flex-1 p-8">
              <div className="max-w-4xl">
                <h1 className="text-2xl font-bold text-text-light dark:text-text-dark mb-4">
                  Page Content
                </h1>
                <p className="text-subtle-text">
                  This area represents the main content of the page.
                </p>
              </div>
            </div>
          </div>
        </StoryWrapper>
      );
    },
  ],
  // Added: Custom args for story controls
  argTypes: {
    collapsed: {
      control: 'boolean',
      description: 'Whether the sidebar is collapsed',
    },
    mobileOpen: {
      control: 'boolean',
      description: 'Whether the mobile sidebar overlay is open',
    },
    activePath: {
      control: 'select',
      options: ['/dashboard', '/invoices', '/bills', '/payments', '/ledger/accounts', '/reports'],
      description: 'Current active route path',
    },
  },
} satisfies Meta<typeof SideNav & { collapsed?: boolean; mobileOpen?: boolean; activePath?: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Expanded sidebar (default state)
export const Expanded: Story = {
  args: {
    collapsed: false,
    activePath: '/dashboard',
  },
};

// Added: Collapsed sidebar
export const Collapsed: Story = {
  args: {
    collapsed: true,
    activePath: '/dashboard',
  },
};

// Added: Dashboard active
export const DashboardActive: Story = {
  args: {
    collapsed: false,
    activePath: '/dashboard',
  },
};

// Added: Invoices active
export const InvoicesActive: Story = {
  args: {
    collapsed: false,
    activePath: '/invoices',
  },
};

// Added: Bills active
export const BillsActive: Story = {
  args: {
    collapsed: false,
    activePath: '/bills',
  },
};

// Added: Payments active
export const PaymentsActive: Story = {
  args: {
    collapsed: false,
    activePath: '/payments',
  },
};

// Added: Ledger section active (shows sub-menu)
export const LedgerActive: Story = {
  args: {
    collapsed: false,
    activePath: '/ledger/accounts',
  },
};

// Added: Reports section active (shows sub-menu)
export const ReportsActive: Story = {
  args: {
    collapsed: false,
    activePath: '/reports',
  },
};

// Added: Dark mode variant
export const DarkMode: Story = {
  args: {
    collapsed: false,
    activePath: '/dashboard',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story, context) => {
      useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
      }, []);

      const args = context.args as { collapsed?: boolean; activePath?: string };
      const collapsed = args.collapsed ?? false;
      const activePath = args.activePath ?? '/dashboard';
      
      return (
        <StoryWrapper collapsed={collapsed} activePath={activePath}>
          <div className="flex min-h-screen bg-background-dark">
            <Story />
            <div className="flex-1 p-8">
              <div className="max-w-4xl">
                <h1 className="text-2xl font-bold text-text-dark mb-4">
                  Page Content (Dark Mode)
                </h1>
                <p className="text-subtle-text-dark">
                  This area represents the main content of the page.
                </p>
              </div>
            </div>
          </div>
        </StoryWrapper>
      );
    },
  ],
};

// Added: Collapsed dark mode
export const CollapsedDarkMode: Story = {
  args: {
    collapsed: true,
    activePath: '/invoices',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story, context) => {
      useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
      }, []);

      const args = context.args as { activePath?: string };
      const activePath = args.activePath ?? '/invoices';

      return (
        <StoryWrapper collapsed={true} activePath={activePath}>
          <div className="flex min-h-screen bg-background-dark">
            <Story />
            <div className="flex-1 p-8">
              <div className="max-w-4xl">
                <h1 className="text-2xl font-bold text-text-dark mb-4">
                  Page Content
                </h1>
                <p className="text-subtle-text-dark">
                  Collapsed sidebar in dark mode.
                </p>
              </div>
            </div>
          </div>
        </StoryWrapper>
      );
    },
  ],
};
