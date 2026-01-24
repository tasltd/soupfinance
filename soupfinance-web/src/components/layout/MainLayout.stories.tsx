/**
 * MainLayout Component Stories
 * Showcases the main application layout with sidebar and content area
 * Reference: soupfinance-designs/balance-sheet-report/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './MainLayout';
import { useUIStore, useAuthStore } from '../../stores';
import { useEffect } from 'react';

// Added: Sample page content for stories
function SampleDashboardContent() {
  const stats = [
    { label: 'Total Revenue', value: '$125,430.50', change: '+12.5%', positive: true },
    { label: 'Outstanding', value: '$23,150.00', change: '+5.2%', positive: false },
    { label: 'Paid Invoices', value: '156', change: '+8.3%', positive: true },
    { label: 'Pending', value: '23', change: '-2.1%', positive: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-text-light dark:text-text-dark tracking-tight">
            Dashboard
          </h1>
          <p className="text-subtle-text mt-1">Overview of your financial metrics</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90">
          New Invoice
        </button>
      </div>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="p-6 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
            <p className="text-subtle-text text-sm font-medium">{stat.label}</p>
            <p className="text-2xl font-bold text-text-light dark:text-text-dark mt-1">{stat.value}</p>
            <p className={stat.positive ? 'text-sm font-medium mt-1 text-green-600' : 'text-sm font-medium mt-1 text-red-600'}>
              {stat.change}
            </p>
          </div>
        ))}
      </div>
      
      {/* Recent invoices table placeholder */}
      <div className="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Recent Invoices</h2>
        </div>
        <div className="p-6">
          <p className="text-subtle-text text-center py-8">Sample table content would appear here</p>
        </div>
      </div>
    </div>
  );
}

function SampleInvoicesContent() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-text-light dark:text-text-dark tracking-tight">
            Invoices
          </h1>
          <p className="text-subtle-text mt-1">Manage your invoices and payments</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90">
          Create Invoice
        </button>
      </div>
      
      {/* Invoice list placeholder */}
      <div className="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between items-center">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">All Invoices</h2>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-background-light dark:bg-background-dark text-sm font-medium">
              Filter
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-background-light dark:bg-background-dark text-sm font-medium">
              Export
            </button>
          </div>
        </div>
        <div className="p-6">
          <p className="text-subtle-text text-center py-8">Invoice table would appear here</p>
        </div>
      </div>
    </div>
  );
}

// Added: Wrapper component to set up store state for stories
interface StoryWrapperProps {
  sidebarCollapsed?: boolean;
  darkMode?: boolean;
  activePath?: string;
  children: React.ReactNode;
}

function StoryWrapper({ 
  sidebarCollapsed = false, 
  darkMode = false, 
  activePath = '/dashboard',
  children 
}: StoryWrapperProps) {
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const setDarkMode = useUIStore((state) => state.setDarkMode);

  // Added: Set initial store state
  useEffect(() => {
    setSidebarCollapsed(sidebarCollapsed);
    setDarkMode(darkMode);
    
    // Set mock user data (AuthUser doesn't have id field)
    useAuthStore.setState({
      user: {
        email: 'admin@soupfinance.com',
        username: 'Admin User',
        roles: ['ROLE_ADMIN'],
      },
      isAuthenticated: true,
    });

    // Apply dark mode class
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [sidebarCollapsed, darkMode, setSidebarCollapsed, setDarkMode]);

  // Get the content component based on active path
  const getContent = () => {
    if (activePath.startsWith('/invoices')) {
      return <SampleInvoicesContent />;
    }
    return <SampleDashboardContent />;
  };

  return (
    <MemoryRouter initialEntries={[activePath]}>
      <Routes>
        <Route element={children}>
          <Route path="*" element={getContent()} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// Added: Meta configuration for MainLayout stories
const meta = {
  title: 'Layout/MainLayout',
  component: MainLayout,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => {
      // Added: Type assertion for decorator args to fix TypeScript errors
      const args = context.args as {
        sidebarCollapsed?: boolean;
        darkMode?: boolean;
        activePath?: string;
      };
      const sidebarCollapsed = args.sidebarCollapsed ?? false;
      const darkMode = args.darkMode ?? false;
      const activePath = args.activePath ?? '/dashboard';
      
      return (
        <StoryWrapper 
          sidebarCollapsed={sidebarCollapsed} 
          darkMode={darkMode}
          activePath={activePath}
        >
          <Story />
        </StoryWrapper>
      );
    },
  ],
  argTypes: {
    sidebarCollapsed: {
      control: 'boolean',
      description: 'Whether the sidebar is collapsed',
    },
    darkMode: {
      control: 'boolean',
      description: 'Dark mode enabled',
    },
    activePath: {
      control: 'select',
      options: ['/dashboard', '/invoices', '/bills', '/payments', '/ledger/accounts', '/reports'],
      description: 'Current active route path',
    },
  },
} satisfies Meta<typeof MainLayout & { 
  sidebarCollapsed?: boolean; 
  darkMode?: boolean;
  activePath?: string;
}>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default layout (expanded sidebar, light mode)
export const Default: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: false,
    activePath: '/dashboard',
  },
};

// Added: Collapsed sidebar
export const CollapsedSidebar: Story = {
  args: {
    sidebarCollapsed: true,
    darkMode: false,
    activePath: '/dashboard',
  },
};

// Added: Dark mode
export const DarkMode: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: true,
    activePath: '/dashboard',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Added: Dark mode with collapsed sidebar
export const DarkModeCollapsed: Story = {
  args: {
    sidebarCollapsed: true,
    darkMode: true,
    activePath: '/dashboard',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Added: Invoices page
export const InvoicesPage: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: false,
    activePath: '/invoices',
  },
};

// Added: Mobile viewport
export const MobileViewport: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: false,
    activePath: '/dashboard',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Added: Tablet viewport
export const TabletViewport: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: false,
    activePath: '/dashboard',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};

// Added: Large screen viewport
export const LargeScreen: Story = {
  args: {
    sidebarCollapsed: false,
    darkMode: false,
    activePath: '/dashboard',
  },
  parameters: {
    viewport: {
      viewports: {
        large: {
          name: 'Large Desktop',
          styles: {
            width: '1920px',
            height: '1080px',
          },
        },
      },
      defaultViewport: 'large',
    },
  },
};
