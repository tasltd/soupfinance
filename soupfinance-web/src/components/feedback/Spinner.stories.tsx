/**
 * Spinner Component Stories
 * Showcases spinner in different sizes and colors
 * Reference: soupfinance-designs/loading-*, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './Spinner';

// Added: Meta configuration for Spinner stories
const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Small spinner
export const Small: Story = {
  args: {
    size: 'sm',
  },
};

// Added: Medium spinner (default)
export const Medium: Story = {
  args: {
    size: 'md',
  },
};

// Added: Large spinner
export const Large: Story = {
  args: {
    size: 'lg',
  },
};

// Added: Custom color - white (for dark backgrounds)
export const WhiteColor: Story = {
  args: {
    size: 'md',
    color: 'text-white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Added: Custom color - danger
export const DangerColor: Story = {
  args: {
    size: 'md',
    color: 'text-danger',
  },
};

// Added: Custom color - success
export const SuccessColor: Story = {
  args: {
    size: 'md',
    color: 'text-success',
  },
};

// Added: All sizes comparison
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-sm text-subtle-text">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-sm text-subtle-text">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-sm text-subtle-text">Large</span>
      </div>
    </div>
  ),
};

// Added: Spinner in button context
export const InButton: Story = {
  render: () => (
    <button
      className="flex items-center justify-center gap-2 h-10 px-4 bg-primary text-white rounded-lg font-bold text-sm"
      disabled
    >
      <Spinner size="sm" color="text-white" />
      <span>Saving...</span>
    </button>
  ),
};

// Added: Full page loading overlay example
export const FullPageLoading: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Spinner size="lg" />
      <p className="text-text-light text-base font-medium">Loading...</p>
    </div>
  ),
};
