/**
 * Select Component Stories
 * Showcases all Select variants: default, with placeholder, error states, disabled
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

// Added: Sample options for select stories
const paymentTermOptions = [
  { value: 'net30', label: 'Net 30' },
  { value: 'net45', label: 'Net 45' },
  { value: 'net60', label: 'Net 60' },
  { value: 'due-on-receipt', label: 'Due on Receipt' },
];

const currencyOptions = [
  { value: 'usd', label: 'USD - US Dollar' },
  { value: 'eur', label: 'EUR - Euro' },
  { value: 'gbp', label: 'GBP - British Pound' },
  { value: 'kes', label: 'KES - Kenyan Shilling' },
];

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

// Added: Meta configuration for Select stories
const meta = {
  title: 'Forms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default select with options
export const Default: Story = {
  args: {
    options: paymentTermOptions,
    defaultValue: 'net30',
  },
};

// Added: Select with label
export const WithLabel: Story = {
  args: {
    label: 'Payment Terms',
    options: paymentTermOptions,
    defaultValue: 'net30',
  },
};

// Added: Select with placeholder option
export const WithPlaceholder: Story = {
  args: {
    label: 'Currency',
    options: currencyOptions,
    placeholder: 'Select currency...',
    defaultValue: '',
  },
};

// Added: Select marked as required
export const Required: Story = {
  args: {
    label: 'Invoice Status',
    options: statusOptions,
    placeholder: 'Select status...',
    required: true,
    defaultValue: '',
  },
};

// Added: Select with helper text
export const WithHelperText: Story = {
  args: {
    label: 'Payment Terms',
    options: paymentTermOptions,
    helperText: 'Select when payment is due after invoice date',
    defaultValue: 'net30',
  },
};

// Added: Select with error state
export const WithError: Story = {
  args: {
    label: 'Currency',
    options: currencyOptions,
    placeholder: 'Select currency...',
    error: 'Please select a currency',
    defaultValue: '',
  },
};

// Added: Disabled select
export const Disabled: Story = {
  args: {
    label: 'Payment Terms',
    options: paymentTermOptions,
    disabled: true,
    defaultValue: 'net30',
  },
};

// Added: Select with many options
export const ManyOptions: Story = {
  args: {
    label: 'Country',
    placeholder: 'Select country...',
    options: [
      { value: 'us', label: 'United States' },
      { value: 'gb', label: 'United Kingdom' },
      { value: 'de', label: 'Germany' },
      { value: 'fr', label: 'France' },
      { value: 'ke', label: 'Kenya' },
      { value: 'ng', label: 'Nigeria' },
      { value: 'za', label: 'South Africa' },
      { value: 'ae', label: 'United Arab Emirates' },
      { value: 'sg', label: 'Singapore' },
      { value: 'au', label: 'Australia' },
    ],
    defaultValue: '',
  },
};

// Added: Full featured select
export const FullFeatured: Story = {
  args: {
    label: 'Invoice Status',
    options: statusOptions,
    placeholder: 'Choose a status...',
    helperText: 'Current invoice workflow status',
    required: true,
    defaultValue: '',
  },
};
