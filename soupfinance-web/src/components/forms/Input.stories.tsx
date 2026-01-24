/**
 * Input Component Stories
 * Showcases all Input variants: default, with label, error states, disabled, different types
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

// Added: Meta configuration for Input stories
const meta = {
  title: 'Forms/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default text input
export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

// Added: Input with label and placeholder
export const WithLabel: Story = {
  args: {
    label: 'Full Name',
    placeholder: 'Enter your full name',
  },
};

// Added: Input with label marked as required
export const Required: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'user@example.com',
    required: true,
    type: 'email',
  },
};

// Added: Input with helper text
export const WithHelperText: Story = {
  args: {
    label: 'Username',
    placeholder: 'Enter username',
    helperText: 'Username must be 3-20 characters',
  },
};

// Added: Input with error state
export const WithError: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'Enter email',
    error: 'Please enter a valid email address',
    defaultValue: 'invalid-email',
    type: 'email',
  },
};

// Added: Disabled input
export const Disabled: Story = {
  args: {
    label: 'Invoice Number',
    value: 'INV-2024-00123',
    disabled: true,
  },
};

// Added: Email type input
export const EmailType: Story = {
  args: {
    label: 'Email',
    placeholder: 'user@example.com',
    type: 'email',
  },
};

// Added: Password type input
export const PasswordType: Story = {
  args: {
    label: 'Password',
    placeholder: 'Enter password',
    type: 'password',
  },
};

// Added: Number type input
export const NumberType: Story = {
  args: {
    label: 'Quantity',
    placeholder: '0',
    type: 'number',
    min: 0,
    max: 100,
  },
};

// Added: Input with all features combined
export const FullFeatured: Story = {
  args: {
    label: 'Contact Email',
    placeholder: 'contact@company.com',
    type: 'email',
    required: true,
    helperText: 'We will use this for invoice notifications',
  },
};
