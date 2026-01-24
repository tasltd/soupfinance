/**
 * Toast Component Stories
 * Showcases all Toast variants: success, error, warning, info with auto-dismiss
 * Reference: soupfinance-designs/alert-toast-notification-stack/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from './Toast';
import { ToastProvider, useToast } from './ToastProvider';

// Added: Meta configuration for Toast stories
const meta = {
  title: 'Feedback/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'],
    },
    duration: {
      control: { type: 'number', min: 0, max: 30000, step: 1000 },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default handler for onClose
const defaultOnClose = (id: string) => console.log(`Toast ${id} closed`);

// Added: Success toast
export const Success: Story = {
  args: {
    id: 'toast-1',
    variant: 'success',
    message: 'Invoice sent successfully!',
    duration: 0, // Disable auto-dismiss for stories
    onClose: defaultOnClose,
  },
};

// Added: Error toast
export const Error: Story = {
  args: {
    id: 'toast-2',
    variant: 'error',
    message: 'Failed to save invoice. Please try again.',
    duration: 0,
    onClose: defaultOnClose,
  },
};

// Added: Warning toast
export const Warning: Story = {
  args: {
    id: 'toast-3',
    variant: 'warning',
    message: 'Your session will expire in 5 minutes.',
    duration: 0,
    onClose: defaultOnClose,
  },
};

// Added: Info toast
export const Info: Story = {
  args: {
    id: 'toast-4',
    variant: 'info',
    message: 'New invoice template available.',
    duration: 0,
    onClose: defaultOnClose,
  },
};

// Added: Toast with long message
export const LongMessage: Story = {
  args: {
    id: 'toast-5',
    variant: 'info',
    message: 'Your invoice #INV-2024-00456 has been approved by the finance team and is now ready to be sent to the client.',
    duration: 0,
    onClose: defaultOnClose,
  },
};

// Added: Toast with short message
export const ShortMessage: Story = {
  args: {
    id: 'toast-6',
    variant: 'success',
    message: 'Saved!',
    duration: 0,
    onClose: defaultOnClose,
  },
};

// Added: All variants displayed together
export const AllVariants: Story = {
  args: {
    id: 'demo',
    variant: 'info',
    message: 'Demo',
    duration: 0,
    onClose: defaultOnClose,
  },
  render: () => (
    <div className="flex flex-col gap-3">
      <Toast
        id="success-demo"
        variant="success"
        message="Payment received successfully!"
        duration={0}
        onClose={defaultOnClose}
      />
      <Toast
        id="error-demo"
        variant="error"
        message="Failed to process refund."
        duration={0}
        onClose={defaultOnClose}
      />
      <Toast
        id="warning-demo"
        variant="warning"
        message="Invoice is overdue by 15 days."
        duration={0}
        onClose={defaultOnClose}
      />
      <Toast
        id="info-demo"
        variant="info"
        message="New report is ready for download."
        duration={0}
        onClose={defaultOnClose}
      />
    </div>
  ),
};

// Added: Dark mode variant demo
export const DarkModePreview: Story = {
  args: {
    id: 'toast-dark',
    variant: 'success',
    message: 'Changes saved successfully!',
    duration: 0,
    onClose: defaultOnClose,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="dark p-4 w-full max-w-md">
        <Story />
      </div>
    ),
  ],
};

// Added: Interactive demo using ToastProvider
const InteractiveDemo = () => {
  const { showToast } = useToast();

  return (
    <div className="flex flex-col gap-3 items-center">
      <p className="text-sm text-subtle-text mb-2">Click buttons to show toasts:</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => showToast({ variant: 'success', message: 'Invoice saved!' })}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Success
        </button>
        <button
          onClick={() => showToast({ variant: 'error', message: 'Something went wrong!' })}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          Error
        </button>
        <button
          onClick={() => showToast({ variant: 'warning', message: 'Unsaved changes!' })}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700"
        >
          Warning
        </button>
        <button
          onClick={() => showToast({ variant: 'info', message: 'New feature available!' })}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Info
        </button>
      </div>
    </div>
  );
};

// Added: Interactive toast demo with ToastProvider wrapper
export const Interactive: Story = {
  args: {
    id: 'interactive',
    variant: 'info',
    message: 'Interactive demo',
    duration: 5000,
    onClose: defaultOnClose,
  },
  render: () => (
    <ToastProvider>
      <InteractiveDemo />
    </ToastProvider>
  ),
};
