/**
 * TopNav Component Stories
 * Showcases Top Navigation bar in different states
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Top Navigation Bar
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TopNav } from './TopNav';
import { useUIStore, useAuthStore } from '../../stores';
import { useEffect } from 'react';

// Added: Wrapper component to set up store state for stories
interface StoryWrapperProps {
  darkMode?: boolean;
  notificationsOpen?: boolean;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  children: React.ReactNode;
}

function StoryWrapper({ 
  darkMode = false, 
  notificationsOpen = false, 
  userEmail = 'admin@soupfinance.com',
  userName = 'Admin User',
  userRole = 'Administrator',
  children 
}: StoryWrapperProps) {
  const setDarkMode = useUIStore((state) => state.setDarkMode);
  const setNotificationsOpen = useUIStore((state) => state.setNotificationsOpen);

  // Added: Set initial store state
  useEffect(() => {
    setDarkMode(darkMode);
    setNotificationsOpen(notificationsOpen);
    
    // Set mock user data (AuthUser doesn't have id field)
    useAuthStore.setState({
      user: {
        email: userEmail,
        username: userName,
        roles: [userRole],
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
  }, [darkMode, notificationsOpen, userEmail, userName, userRole, setDarkMode, setNotificationsOpen]);

  return children;
}

// Added: Meta configuration for TopNav stories
const meta = {
  title: 'Layout/TopNav',
  component: TopNav,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => {
      const args = context.args as {
        darkMode?: boolean;
        notificationsOpen?: boolean;
        userEmail?: string;
        userName?: string;
        userRole?: string;
      };
      const darkMode = args.darkMode ?? false;
      const notificationsOpen = args.notificationsOpen ?? false;
      const userEmail = args.userEmail ?? 'admin@soupfinance.com';
      const userName = args.userName ?? 'Admin User';
      const userRole = args.userRole ?? 'Administrator';
      const bgClass = darkMode ? 'bg-background-dark' : 'bg-background-light';
      const textClass = darkMode ? 'text-text-dark' : 'text-text-light';
      
      return (
        <StoryWrapper 
          darkMode={darkMode} 
          notificationsOpen={notificationsOpen}
          userEmail={userEmail}
          userName={userName}
          userRole={userRole}
        >
          <div className={`min-h-screen ${bgClass}`}>
            <Story />
            {/* Page content placeholder */}
            <div className="p-8 max-w-4xl mx-auto">
              <h1 className={`text-2xl font-bold mb-4 ${textClass}`}>
                Page Content
              </h1>
              <p className="text-subtle-text">
                This area represents the main content below the top navigation.
              </p>
            </div>
          </div>
        </StoryWrapper>
      );
    },
  ],
  // Added: Custom args for story controls
  argTypes: {
    darkMode: {
      control: 'boolean',
      description: 'Dark mode enabled',
    },
    notificationsOpen: {
      control: 'boolean',
      description: 'Notifications dropdown open',
    },
    userEmail: {
      control: 'text',
      description: 'User email address',
    },
    userName: {
      control: 'text',
      description: 'User display name',
    },
    userRole: {
      control: 'select',
      options: ['Administrator', 'Accountant', 'Manager', 'Viewer'],
      description: 'User role displayed',
    },
  },
} satisfies Meta<typeof TopNav & { 
  darkMode?: boolean; 
  notificationsOpen?: boolean;
  userEmail?: string;
  userName?: string;
  userRole?: string;
}>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default light mode
export const Default: Story = {
  args: {
    darkMode: false,
    notificationsOpen: false,
    userEmail: 'admin@soupfinance.com',
    userName: 'Admin User',
    userRole: 'Administrator',
  },
};

// Added: Dark mode
export const DarkMode: Story = {
  args: {
    darkMode: true,
    notificationsOpen: false,
    userEmail: 'admin@soupfinance.com',
    userName: 'Admin User',
    userRole: 'Administrator',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Added: Notifications open
export const NotificationsOpen: Story = {
  args: {
    darkMode: false,
    notificationsOpen: true,
    userEmail: 'admin@soupfinance.com',
    userName: 'Admin User',
    userRole: 'Administrator',
  },
};

// Added: Different user roles
export const AccountantUser: Story = {
  args: {
    darkMode: false,
    notificationsOpen: false,
    userEmail: 'jane.doe@company.com',
    userName: 'Jane Doe',
    userRole: 'Accountant',
  },
};

export const ManagerUser: Story = {
  args: {
    darkMode: false,
    notificationsOpen: false,
    userEmail: 'john.smith@company.com',
    userName: 'John Smith',
    userRole: 'Manager',
  },
};

// Added: Long user name
export const LongUserName: Story = {
  args: {
    darkMode: false,
    notificationsOpen: false,
    userEmail: 'alexandra.richardson@verylongcompanyname.com',
    userName: 'Alexandra Richardson-Thompson',
    userRole: 'Administrator',
  },
};

// Added: Mobile viewport simulation
export const MobileViewport: Story = {
  args: {
    darkMode: false,
    notificationsOpen: false,
    userEmail: 'mobile@user.com',
    userName: 'Mobile User',
    userRole: 'Viewer',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Added: Dark mode with notifications
export const DarkModeNotificationsOpen: Story = {
  args: {
    darkMode: true,
    notificationsOpen: true,
    userEmail: 'admin@soupfinance.com',
    userName: 'Admin User',
    userRole: 'Administrator',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
