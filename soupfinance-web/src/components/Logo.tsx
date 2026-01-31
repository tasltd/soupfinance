/**
 * SoupFinance Logo Component
 *
 * A versatile logo component with multiple variants:
 * - mark: Icon only (SF infinite ledger symbol)
 * - full: Icon + "SoupFinance" wordmark
 * - wordmark: Text only
 *
 * Supports light/dark modes and custom sizing.
 * Logo designed with Google Stitch - "Infinite Ledger" SF monogram
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
 * The logo mark (SF infinite ledger icon) as an image
 * Designed with Google Stitch - "Infinite Ledger" SF monogram
 */
function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="SoupFinance Logo"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Main Logo component
 */
export function Logo({ variant = 'full', size = 40, className = '', darkMode = false }: LogoProps) {
  const textColor = darkMode ? 'text-white' : 'text-text-light';
  const accentColor = 'text-primary';

  if (variant === 'mark') {
    return <LogoMark size={size} className={className} />;
  }

  if (variant === 'wordmark') {
    return (
      <span className={`font-display font-bold ${className}`} style={{ fontSize: size * 0.6 }}>
        <span className={textColor}>Soup</span>
        <span className={accentColor}>Finance</span>
      </span>
    );
  }

  // Full logo (mark + wordmark)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display font-bold" style={{ fontSize: size * 0.45 }}>
        <span className={textColor}>Soup</span>
        <span className={accentColor}>Finance</span>
      </span>
    </div>
  );
}

/**
 * Simplified logo mark for use in tight spaces (nav icons, favicons)
 * Uses the PNG logo image
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
      className={`rounded ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export default Logo;
