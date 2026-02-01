/**
 * SoupFinance Logo Component
 *
 * A versatile logo component with multiple variants:
 * - mark: Icon only (Bowl with SF steam)
 * - full: Icon + "SoupFinance" wordmark
 * - wordmark: Text only
 *
 * Supports light/dark modes and custom sizing.
 * Logo: Bowl with swirly SF steam rising from it
 */

interface LogoProps {
  /** Logo variant to display */
  variant?: 'mark' | 'full' | 'wordmark';
  /** Size in pixels (applies to height, width scales proportionally) */
  size?: number;
  /** Custom className for additional styling */
  className?: string;
  /** Whether to use dark mode colors (light text on dark bg) */
  darkMode?: boolean;
}

/**
 * Logo Mark - Bowl with SF Steam (PNG image)
 */
function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="SoupFinance Logo"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Main Logo component
 */
export function Logo({ variant = 'full', size = 40, className = '', darkMode = false }: LogoProps) {
  // "Soup" in red (#e31b23), "Finance" in dark gray (#4a4a4a)
  const soupColor = 'text-[#e31b23]'; // red from logo
  const financeColor = darkMode ? 'text-gray-300' : 'text-[#4a4a4a]'; // dark gray

  if (variant === 'mark') {
    return <LogoMark size={size} className={className} />;
  }

  if (variant === 'wordmark') {
    return (
      <span className={`font-display font-bold ${className}`} style={{ fontSize: size * 0.6 }}>
        <span className={soupColor}>Soup</span>
        <span className={financeColor}>Finance</span>
      </span>
    );
  }

  // Full logo (mark + wordmark)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display font-bold" style={{ fontSize: size * 0.45 }}>
        <span className={soupColor}>Soup</span>
        <span className={financeColor}>Finance</span>
      </span>
    </div>
  );
}

/**
 * Simplified logo mark for use in tight spaces (nav icons, favicons)
 */
export function LogoMarkSimple({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="SoupFinance"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

export default Logo;
