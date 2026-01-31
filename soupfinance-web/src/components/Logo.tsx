/**
 * SoupFinance Logo Component
 *
 * A versatile logo component with multiple variants:
 * - mark: Icon only (S symbol)
 * - full: Icon + "SoupFinance" wordmark
 * - wordmark: Text only
 *
 * Supports light/dark modes and custom sizing.
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
 * The logo mark (S icon) as an inline SVG
 */
function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SoupFinance logo"
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f24a0d" />
          <stop offset="100%" stopColor="#e03d05" />
        </linearGradient>
      </defs>

      {/* Rounded square background */}
      <rect x="0" y="0" width="48" height="48" rx="12" fill="url(#logoGradient)" />

      {/* The S mark - two flowing curves */}
      <path
        d="M12 18C12 18 16 12 24 12C32 12 36 16 36 20C36 24 32 26 24 26"
        stroke="white"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24 26C16 26 12 28 12 32C12 36 16 40 24 40C32 40 36 36 36 36"
        stroke="white"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Accent bar */}
      <rect x="34" y="8" width="4" height="8" rx="2" fill="white" opacity="0.9" />
    </svg>
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
 * Uses just the S curve without the background for flexibility
 */
export function LogoMarkSimple({
  size = 24,
  color = '#f24a0d',
  className = '',
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SoupFinance"
    >
      <path
        d="M6 9C6 9 8 6 12 6C16 6 18 8 18 10C18 12 16 13 12 13C8 13 6 14 6 16C6 18 8 20 12 20C16 20 18 18 18 18"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="19" cy="5" r="2" fill={color} />
    </svg>
  );
}

export default Logo;
