/**
 * Textarea Component Stories
 * Showcases all Textarea variants: default, with label, error states, disabled, rows
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './Textarea';

// Added: Meta configuration for Textarea stories
const meta = {
  title: 'Forms/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    rows: {
      control: { type: 'number', min: 1, max: 20 },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default textarea
export const Default: Story = {
  args: {
    placeholder: 'Enter your message...',
  },
};

// Added: Textarea with label
export const WithLabel: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Add notes for this invoice...',
  },
};

// Added: Textarea marked as required
export const Required: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter a description',
    required: true,
  },
};

// Added: Textarea with helper text
export const WithHelperText: Story = {
  args: {
    label: 'Terms & Conditions',
    placeholder: 'Enter payment terms...',
    helperText: 'This will appear on the invoice footer',
  },
};

// Added: Textarea with error state
export const WithError: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description',
    error: 'Description is required and must be at least 10 characters',
    defaultValue: 'Too short',
  },
};

// Added: Disabled textarea
export const Disabled: Story = {
  args: {
    label: 'System Notes',
    value: 'This invoice was auto-generated from recurring template.',
    disabled: true,
  },
};

// Added: Custom rows count
export const CustomRows: Story = {
  args: {
    label: 'Detailed Description',
    placeholder: 'Enter a detailed description...',
    rows: 6,
    helperText: 'Provide as much detail as needed',
  },
};

// Added: Textarea with long content
export const WithLongContent: Story = {
  args: {
    label: 'Invoice Notes',
    defaultValue: `Payment Terms:
- Net 30 days from invoice date
- 2% discount if paid within 10 days
- Late payments subject to 1.5% monthly interest

Additional Notes:
Please reference invoice number on all payments.
Wire transfer details available upon request.`,
    rows: 8,
  },
};

// Added: Full featured textarea
export const FullFeatured: Story = {
  args: {
    label: 'Payment Instructions',
    placeholder: 'Enter payment instructions for the client...',
    required: true,
    helperText: 'Include bank details or payment portal links',
    rows: 4,
  },
};

// Added: Dark mode variant demo
export const DarkModePreview: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Add notes...',
    helperText: 'These notes are for internal use only',
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
