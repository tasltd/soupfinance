/**
 * Radio Component Stories
 * Showcases Radio group with different configurations
 * Reference: soupfinance-designs/form-radio-button-styles/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Radio } from './Radio';

// Added: Sample options for radio stories
const paymentMethodOptions = [
  { value: 'credit-card', label: 'Credit Card' },
  { value: 'bank-transfer', label: 'Bank Transfer' },
  { value: 'paypal', label: 'PayPal' },
];

const priorityOptions = [
  { value: 'low', label: 'Low Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'high', label: 'High Priority' },
  { value: 'urgent', label: 'Urgent' },
];

const frequencyOptions = [
  { value: 'once', label: 'One-time payment' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

// Added: Meta configuration for Radio stories
const meta = {
  title: 'Forms/Radio',
  component: Radio,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default radio group
export const Default: Story = {
  args: {
    name: 'payment-method-default',
    options: paymentMethodOptions,
    value: 'credit-card',
  },
};

// Added: Radio group with label
export const WithLabel: Story = {
  args: {
    name: 'payment-method-labeled',
    label: 'Payment Method',
    options: paymentMethodOptions,
    value: 'credit-card',
  },
};

// Added: Radio group without pre-selection
export const NoSelection: Story = {
  args: {
    name: 'payment-method-none',
    label: 'Payment Method',
    options: paymentMethodOptions,
    value: '',
  },
};

// Added: Radio group with error state
export const WithError: Story = {
  args: {
    name: 'priority-error',
    label: 'Invoice Priority',
    options: priorityOptions,
    error: 'Please select a priority level',
    value: '',
  },
};

// Added: Disabled radio group
export const Disabled: Story = {
  args: {
    name: 'payment-method-disabled',
    label: 'Payment Method (Locked)',
    options: paymentMethodOptions,
    disabled: true,
    value: 'bank-transfer',
  },
};

// Added: Radio group with many options
export const ManyOptions: Story = {
  args: {
    name: 'frequency',
    label: 'Billing Frequency',
    options: frequencyOptions,
    value: 'monthly',
  },
};

// Added: Interactive radio group with state management
export const Interactive: Story = {
  args: {
    name: 'priority-demo',
    options: priorityOptions,
  },
  render: function InteractiveRadio() {
    const [value, setValue] = useState('medium');
    return (
      <div className="flex flex-col gap-4">
        <Radio
          name="priority-interactive"
          label="Select Priority"
          options={priorityOptions}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-sm text-subtle-text">
          Selected: <strong className="text-text-light">{value || 'None'}</strong>
        </p>
      </div>
    );
  },
};
