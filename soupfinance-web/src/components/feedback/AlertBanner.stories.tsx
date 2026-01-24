/**
 * AlertBanner Component Stories
 * Showcases all alert variants: success, error, warning, info with action/dismiss options
 * Reference: soupfinance-designs/alert-banner-*, design-system.md Status Badges section
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertBanner } from './AlertBanner';

// Added: Meta configuration for AlertBanner stories
const meta = {
  title: 'Feedback/AlertBanner',
  component: AlertBanner,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'],
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Success variant
export const Success: Story = {
  args: {
    variant: 'success',
    message: 'Invoice has been sent successfully!',
  },
};

// Added: Error variant
export const Error: Story = {
  args: {
    variant: 'error',
    message: 'Failed to process payment. Please try again.',
  },
};

// Added: Warning variant
export const Warning: Story = {
  args: {
    variant: 'warning',
    message: 'Your session will expire in 5 minutes.',
  },
};

// Added: Info variant
export const Info: Story = {
  args: {
    variant: 'info',
    message: 'New features are available. Check the changelog for details.',
  },
};

// Added: Alert with action button
export const WithAction: Story = {
  args: {
    variant: 'error',
    message: 'Payment failed due to insufficient funds.',
    action: {
      label: 'Retry',
      onClick: () => alert('Retry clicked'),
    },
  },
};

// Added: Alert with dismiss button
export const WithDismiss: Story = {
  args: {
    variant: 'success',
    message: 'Your changes have been saved.',
    onDismiss: () => alert('Dismissed'),
  },
};

// Added: Alert with both action and dismiss
export const WithActionAndDismiss: Story = {
  args: {
    variant: 'warning',
    message: 'Unsaved changes will be lost.',
    action: {
      label: 'Save Now',
      onClick: () => alert('Save clicked'),
    },
    onDismiss: () => alert('Dismissed'),
  },
};

// Added: Alert with long message
export const LongMessage: Story = {
  args: {
    variant: 'info',
    message: 'We have updated our terms of service and privacy policy. Please review the changes before continuing to use the platform. Your continued use constitutes acceptance of these terms.',
    onDismiss: () => alert('Dismissed'),
  },
};

// Added: All variants displayed together
export const AllVariants: Story = {
  args: {
    variant: 'info',
    message: 'All variants demo',
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <AlertBanner
        variant="success"
        message="Payment received successfully!"
        onDismiss={() => {}}
      />
      <AlertBanner
        variant="error"
        message="Failed to send invoice. Please check your connection."
        action={{ label: 'Retry', onClick: () => {} }}
      />
      <AlertBanner
        variant="warning"
        message="Invoice is overdue by 15 days."
        action={{ label: 'Send Reminder', onClick: () => {} }}
        onDismiss={() => {}}
      />
      <AlertBanner
        variant="info"
        message="Tip: You can schedule recurring invoices from the settings page."
        onDismiss={() => {}}
      />
    </div>
  ),
};
