/**
 * Spinner Component
 * Animated loading spinner with configurable size and color
 * Reference: soupfinance-designs/loading-*, design-system.md
 */

// Added: Size type for spinner variants
export type SpinnerSize = 'sm' | 'md' | 'lg';

// Added: Props interface for Spinner component
export interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Custom color class (defaults to primary) */
  color?: string;
  /** Additional CSS classes */
  className?: string;
}

// Added: Size configuration mapping
const sizeConfig: Record<SpinnerSize, string> = {
  sm: 'size-4 text-base',
  md: 'size-6 text-xl',
  lg: 'size-10 text-3xl',
};

/**
 * Spinner component following SoupFinance design system
 * Uses Material Symbols progress_activity icon with CSS animation
 */
export function Spinner({ size = 'md', color = 'text-primary', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`
        inline-flex items-center justify-center
        ${sizeConfig[size]}
        ${color}
        ${className}
      `}
    >
      <span className="material-symbols-outlined animate-spin">
        progress_activity
      </span>
    </span>
  );
}
