/**
 * Checkbox Component Stories
 * Showcases all Checkbox variants: unchecked, checked, disabled states
 * Reference: soupfinance-designs/form-checkbox-styles/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

// Added: Meta configuration for Checkbox stories
const meta = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Default unchecked checkbox
export const Unchecked: Story = {
  args: {
    label: 'I agree to the terms and conditions',
  },
};

// Added: Checked checkbox
export const Checked: Story = {
  args: {
    label: 'Email notifications enabled',
    defaultChecked: true,
  },
};

// Added: Checkbox without label
export const WithoutLabel: Story = {
  args: {},
};

// Added: Disabled unchecked checkbox
export const DisabledUnchecked: Story = {
  args: {
    label: 'This option is not available',
    disabled: true,
  },
};

// Added: Disabled checked checkbox
export const DisabledChecked: Story = {
  args: {
    label: 'Required setting (cannot be changed)',
    disabled: true,
    defaultChecked: true,
  },
};

// Added: Checkbox group example - rendered as multiple checkboxes
export const CheckboxGroup: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Checkbox label="Email notifications" defaultChecked />
      <Checkbox label="SMS notifications" />
      <Checkbox label="Push notifications" defaultChecked />
      <Checkbox label="Weekly digest" />
    </div>
  ),
};

// Added: Checkbox with long label text
export const LongLabel: Story = {
  args: {
    label: 'I acknowledge that I have read, understood, and agree to be bound by all terms and conditions of this agreement including the privacy policy',
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
};
