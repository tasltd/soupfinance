/**
 * Tooltip Component Stories
 * Showcases tooltips in all positions: top, bottom, left, right
 * Reference: soupfinance-designs/interactive-tooltip-examples/, design-system.md
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from './Tooltip';

// Added: Meta configuration for Tooltip stories
const meta = {
  title: 'Feedback/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    position: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
    delay: {
      control: { type: 'number', min: 0, max: 1000, step: 50 },
    },
  },
  // Added: Extra padding for tooltips to be visible
  decorators: [
    (Story) => (
      <div className="p-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

// Added: Helper button component for consistent trigger styling
const TriggerButton = ({ children }: { children: React.ReactNode }) => (
  <button className="flex items-center justify-center gap-2 h-10 px-4 bg-background-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark text-sm font-medium hover:bg-primary/10 transition-colors">
    {children}
  </button>
);

// Added: Top position (default)
export const Top: Story = {
  args: {
    content: 'This is a helpful tooltip',
    position: 'top',
    children: <TriggerButton>Hover me</TriggerButton>,
  },
};

// Added: Bottom position
export const Bottom: Story = {
  args: {
    content: 'Tooltip appears below',
    position: 'bottom',
    children: <TriggerButton>Hover me</TriggerButton>,
  },
};

// Added: Left position
export const Left: Story = {
  args: {
    content: 'Tooltip on the left',
    position: 'left',
    children: <TriggerButton>Hover me</TriggerButton>,
  },
};

// Added: Right position
export const Right: Story = {
  args: {
    content: 'Tooltip on the right',
    position: 'right',
    children: <TriggerButton>Hover me</TriggerButton>,
  },
};

// Added: With custom delay
export const CustomDelay: Story = {
  args: {
    content: 'This tooltip appears after 500ms',
    position: 'top',
    delay: 500,
    children: <TriggerButton>Slow tooltip (500ms)</TriggerButton>,
  },
};

// Added: No delay
export const NoDelay: Story = {
  args: {
    content: 'This appears immediately',
    position: 'top',
    delay: 0,
    children: <TriggerButton>Instant tooltip</TriggerButton>,
  },
};

// Added: Tooltip on icon button
export const OnIconButton: Story = {
  args: {
    content: 'Edit invoice',
    position: 'top',
    children: (
      <button className="flex items-center justify-center size-10 rounded-full bg-background-light hover:bg-primary/10 text-text-light transition-colors">
        <span className="material-symbols-outlined">edit</span>
      </button>
    ),
  },
};

// Added: Tooltip with longer content
export const LongContent: Story = {
  args: {
    content: 'This is a longer tooltip message that provides more detailed information to the user',
    position: 'top',
    children: <TriggerButton>Hover for details</TriggerButton>,
  },
};

// Added: All positions displayed
export const AllPositions: Story = {
  args: {
    content: 'Tooltip',
    children: <TriggerButton>Hover</TriggerButton>,
  },
  render: () => (
    <div className="flex flex-col items-center gap-12">
      <Tooltip content="Top tooltip" position="top">
        <TriggerButton>Top</TriggerButton>
      </Tooltip>
      
      <div className="flex items-center gap-12">
        <Tooltip content="Left tooltip" position="left">
          <TriggerButton>Left</TriggerButton>
        </Tooltip>
        
        <Tooltip content="Right tooltip" position="right">
          <TriggerButton>Right</TriggerButton>
        </Tooltip>
      </div>
      
      <Tooltip content="Bottom tooltip" position="bottom">
        <TriggerButton>Bottom</TriggerButton>
      </Tooltip>
    </div>
  ),
};

// Added: Tooltip on help icon (common pattern)
export const HelpIcon: Story = {
  args: {
    content: 'Help tooltip',
    children: <TriggerButton>?</TriggerButton>,
  },
  render: () => (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-text-light">Invoice Due Date</label>
      <Tooltip content="The date by which payment should be received" position="top">
        <span className="material-symbols-outlined text-subtle-text text-lg cursor-help">
          help
        </span>
      </Tooltip>
    </div>
  ),
};
