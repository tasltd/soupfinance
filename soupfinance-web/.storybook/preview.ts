/**
 * Storybook Preview Configuration
 * Configures global decorators, parameters, and CSS imports for SoupFinance components
 * Reference: soupfinance-web/.claude/rules/soupfinance-design-system.md
 */
import type { Preview } from '@storybook/react-vite';

// Added: Import main CSS to load Tailwind v4 and design system tokens
import '../src/index.css';

const preview: Preview = {
  parameters: {
    // Added: Background options matching SoupFinance design system
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8f6f5' },
        { name: 'dark', value: '#221510' },
        { name: 'surface-light', value: '#FFFFFF' },
        { name: 'surface-dark', value: '#1f1715' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Added: Documentation settings
    docs: {
      toc: true,
    },
  },
  // Added: Tags for autodocs
  tags: ['autodocs'],
};

export default preview;
