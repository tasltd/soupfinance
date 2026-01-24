/**
 * Tooltip Component
 * Hover tooltip with configurable position and arrow
 * Reference: soupfinance-designs/interactive-tooltip-examples/, design-system.md
 */
import { useState, type ReactNode } from 'react';

// Added: Position type for tooltip placement
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

// Added: Props interface for Tooltip component
export interface TooltipProps {
  /** Content to display in the tooltip */
  content: ReactNode;
  /** Element that triggers the tooltip on hover */
  children: ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: TooltipPosition;
  /** Delay in ms before showing tooltip */
  delay?: number;
  /** Additional CSS classes for the tooltip */
  className?: string;
}

// Added: Position configuration mapping
const positionConfig: Record<TooltipPosition, {
  containerClass: string;
  arrowClass: string;
}> = {
  top: {
    containerClass: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrowClass: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-gray-700 border-x-transparent border-b-transparent',
  },
  bottom: {
    containerClass: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrowClass: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-gray-700 border-x-transparent border-t-transparent',
  },
  left: {
    containerClass: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrowClass: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-gray-700 border-y-transparent border-r-transparent',
  },
  right: {
    containerClass: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrowClass: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-gray-700 border-y-transparent border-l-transparent',
  },
};

/**
 * Tooltip component following SoupFinance design system
 * Shows on hover with configurable delay and position
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const config = positionConfig[position];

  // Added: Show tooltip with delay
  const handleMouseEnter = () => {
    const id = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setTimeoutId(id);
  };

  // Added: Hide tooltip and clear pending timeout
  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsVisible(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {/* Trigger element */}
      {children}

      {/* Tooltip content - shown on hover */}
      {isVisible && (
        <div
          role="tooltip"
          className={`
            absolute z-50 whitespace-nowrap
            ${config.containerClass}
            ${className}
          `}
        >
          {/* Tooltip box */}
          <div
            className="
              px-3 py-1.5 rounded-md
              bg-gray-900 dark:bg-gray-700
              text-white text-sm font-medium
              shadow-lg
            "
          >
            {content}
          </div>

          {/* Arrow pointing to trigger */}
          <div
            className={`
              absolute w-0 h-0
              border-4
              ${config.arrowClass}
            `}
          />
        </div>
      )}
    </div>
  );
}
