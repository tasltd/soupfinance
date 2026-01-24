/**
 * DatePicker Component Stories
 * Showcases all DatePicker variants: default, with label, error states, disabled, min/max dates
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatePicker } from './DatePicker';

// Added: Meta configuration for DatePicker stories
const meta = {
  title: 'Forms/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Helper to get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

// Added: Default date picker
export const Default: Story = {
  args: {
    placeholder: 'Select a date',
  },
};

// Added: DatePicker with label
export const WithLabel: Story = {
  args: {
    label: 'Invoice Date',
  },
};

// Added: DatePicker with value
export const WithValue: Story = {
  args: {
    label: 'Invoice Date',
    defaultValue: today,
  },
};

// Added: DatePicker marked as required
export const Required: Story = {
  args: {
    label: 'Due Date',
    required: true,
  },
};

// Added: DatePicker with helper text
export const WithHelperText: Story = {
  args: {
    label: 'Payment Due Date',
    helperText: 'Payments are typically due within 30 days',
  },
};

// Added: DatePicker with error state
export const WithError: Story = {
  args: {
    label: 'Due Date',
    error: 'Due date cannot be before invoice date',
    defaultValue: lastMonth,
  },
};

// Added: Disabled date picker
export const Disabled: Story = {
  args: {
    label: 'Invoice Date',
    value: today,
    disabled: true,
  },
};

// Added: DatePicker with min date (future dates only)
export const FutureDatesOnly: Story = {
  args: {
    label: 'Due Date',
    min: tomorrow,
    helperText: 'Select a future date for payment due',
  },
};

// Added: DatePicker with max date (past dates only)
export const PastDatesOnly: Story = {
  args: {
    label: 'Transaction Date',
    max: today,
    helperText: 'Select when the transaction occurred',
  },
};

// Added: DatePicker with date range constraint
export const WithDateRange: Story = {
  args: {
    label: 'Report Period End',
    min: lastMonth,
    max: nextMonth,
    helperText: 'Select a date within the current reporting period',
  },
};

// Added: Full featured date picker
export const FullFeatured: Story = {
  args: {
    label: 'Invoice Due Date',
    required: true,
    min: today,
    helperText: 'Default: 30 days from invoice date',
    defaultValue: nextMonth,
  },
};

// Added: Dark mode variant demo
export const DarkModePreview: Story = {
  args: {
    label: 'Due Date',
    defaultValue: today,
    helperText: 'Payment due on this date',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="dark p-4">
        <Story />
      </div>
    ),
  ],
};
