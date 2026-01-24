/**
 * AuthLayout Component Stories
 * Showcases the authentication layout for login/registration pages
 * Reference: soupfinance-designs/login-authentication/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';

// Added: Sample login form component for stories
function SampleLoginForm() {
  return (
    <div className="flex flex-col gap-6">
      {/* Mobile logo - only visible on small screens */}
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
          SF
        </div>
        <h1 className="text-xl font-bold text-text-light dark:text-text-dark">SoupFinance</h1>
      </div>
      
      <div>
        <h2 className="text-2xl font-black text-text-light dark:text-text-dark">Welcome back</h2>
        <p className="text-subtle-text mt-1">Sign in to your account to continue</p>
      </div>
      
      <form className="flex flex-col gap-4">
        <label className="flex flex-col">
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Email</span>
          <input 
            type="email" 
            placeholder="you@company.com"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        
        <label className="flex flex-col">
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Password</span>
          <input 
            type="password" 
            placeholder="Enter your password"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-border-light" />
            <span className="text-sm text-text-light dark:text-text-dark">Remember me</span>
          </label>
          <a href="#" className="text-sm text-primary hover:underline">Forgot password?</a>
        </div>
        
        <button 
          type="button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
        >
          Sign in
        </button>
      </form>
      
      <p className="text-center text-sm text-subtle-text">
        Don&apos;t have an account? <a href="#" className="text-primary hover:underline">Sign up</a>
      </p>
    </div>
  );
}

// Added: Sample registration form for variation
function SampleRegisterForm() {
  return (
    <div className="flex flex-col gap-6">
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
          SF
        </div>
        <h1 className="text-xl font-bold text-text-light dark:text-text-dark">SoupFinance</h1>
      </div>
      
      <div>
        <h2 className="text-2xl font-black text-text-light dark:text-text-dark">Create account</h2>
        <p className="text-subtle-text mt-1">Start your free trial today</p>
      </div>
      
      <form className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col">
            <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">First name</span>
            <input 
              type="text" 
              placeholder="John"
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Last name</span>
            <input 
              type="text" 
              placeholder="Doe"
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        
        <label className="flex flex-col">
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Work email</span>
          <input 
            type="email" 
            placeholder="you@company.com"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        
        <label className="flex flex-col">
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Password</span>
          <input 
            type="password" 
            placeholder="Create a strong password"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        
        <button 
          type="button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
        >
          Create account
        </button>
      </form>
      
      <p className="text-center text-sm text-subtle-text">
        Already have an account? <a href="#" className="text-primary hover:underline">Sign in</a>
      </p>
    </div>
  );
}

// Added: Forgot password form
function SampleForgotPasswordForm() {
  return (
    <div className="flex flex-col gap-6">
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
          SF
        </div>
        <h1 className="text-xl font-bold text-text-light dark:text-text-dark">SoupFinance</h1>
      </div>
      
      <div>
        <h2 className="text-2xl font-black text-text-light dark:text-text-dark">Reset password</h2>
        <p className="text-subtle-text mt-1">Enter your email and we&apos;ll send you a reset link</p>
      </div>
      
      <form className="flex flex-col gap-4">
        <label className="flex flex-col">
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">Email</span>
          <input 
            type="email" 
            placeholder="you@company.com"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        
        <button 
          type="button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
        >
          Send reset link
        </button>
      </form>
      
      <p className="text-center text-sm text-subtle-text">
        Remember your password? <a href="#" className="text-primary hover:underline">Sign in</a>
      </p>
    </div>
  );
}

// Added: Meta configuration for AuthLayout stories
const meta = {
  title: 'Layout/AuthLayout',
  component: AuthLayout,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    // Note: _Story is unused because this decorator renders custom form components
    (_Story, context) => {
      // Get the form type from context args
      const formType = (context.args as { formType?: string })?.formType ?? 'login';
      
      // Render the appropriate form based on the story
      const getFormComponent = () => {
        switch (formType) {
          case 'register':
            return <SampleRegisterForm />;
          case 'forgot-password':
            return <SampleForgotPasswordForm />;
          default:
            return <SampleLoginForm />;
        }
      };
      
      return (
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="*" element={getFormComponent()} />
            </Route>
          </Routes>
        </MemoryRouter>
      );
    },
  ],
  argTypes: {
    formType: {
      control: 'select',
      options: ['login', 'register', 'forgot-password'],
      description: 'Type of authentication form to display',
    },
  },
} satisfies Meta<typeof AuthLayout & { formType?: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Login page (default)
export const LoginPage: Story = {
  args: {
    formType: 'login',
  },
};

// Added: Registration page
export const RegisterPage: Story = {
  args: {
    formType: 'register',
  },
};

// Added: Forgot password page
export const ForgotPasswordPage: Story = {
  args: {
    formType: 'forgot-password',
  },
};

// Added: Mobile viewport login
export const MobileLogin: Story = {
  args: {
    formType: 'login',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Added: Tablet viewport login
export const TabletLogin: Story = {
  args: {
    formType: 'login',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};

// Added: Mobile viewport registration
export const MobileRegister: Story = {
  args: {
    formType: 'register',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
