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
 * Inline SVG Logo Mark - Bowl with SF Steam
 * Colors: Bowl (#4a4a4a), Steam (#f24a0d primary orange)
 */
function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-label="SoupFinance Logo"
    >
      {/* Bowl Shadow */}
      <ellipse cx="50" cy="92" rx="22" ry="4" fill="#888" opacity="0.3"/>
      {/* Bowl - Main Body */}
      <path d="M20 55 Q20 78 50 80 Q80 78 80 55 L77 55 Q75 72 50 74 Q25 72 23 55 Z" fill="#4a4a4a"/>
      {/* Bowl - Rim/Top */}
      <ellipse cx="50" cy="55" rx="30" ry="8" fill="#4a4a4a"/>
      {/* Bowl - Base/Foot */}
      <path d="M38 80 Q50 82 62 80 L60 86 Q50 88 40 86 Z" fill="#4a4a4a"/>
      {/* Bowl Rim Highlight */}
      <path d="M28 52 Q50 60 72 52" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
      {/* Steam S - Swirly left wisp */}
      <path d="M30 38 C30 30 40 26 44 32 C48 38 36 42 40 48" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Steam S - Main S curve */}
      <path d="M38 28 C38 16 54 12 58 22 C62 32 46 36 50 46" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Steam F - Vertical stroke */}
      <path d="M58 8 L58 44" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
      {/* Steam F - Top horizontal */}
      <path d="M58 8 L74 8" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
      {/* Steam F - Middle horizontal */}
      <path d="M58 24 L70 24" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Main Logo component
 */
export function Logo({ variant = 'full', size = 40, className = '', darkMode = false }: LogoProps) {
  // Updated: "Soup" in red (#f24a0d), "Finance" in dark gray (#4a4a4a)
  const soupColor = 'text-primary'; // red/orange
  const financeColor = darkMode ? 'text-gray-300' : 'text-gray-700'; // dark gray

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
 * Inline SVG version for consistency
 */
export function LogoMarkSimple({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-label="SoupFinance"
    >
      {/* Bowl Shadow */}
      <ellipse cx="50" cy="92" rx="22" ry="4" fill="#888" opacity="0.3"/>
      {/* Bowl - Main Body */}
      <path d="M20 55 Q20 78 50 80 Q80 78 80 55 L77 55 Q75 72 50 74 Q25 72 23 55 Z" fill="#4a4a4a"/>
      {/* Bowl - Rim/Top */}
      <ellipse cx="50" cy="55" rx="30" ry="8" fill="#4a4a4a"/>
      {/* Bowl - Base/Foot */}
      <path d="M38 80 Q50 82 62 80 L60 86 Q50 88 40 86 Z" fill="#4a4a4a"/>
      {/* Bowl Rim Highlight */}
      <path d="M28 52 Q50 60 72 52" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
      {/* Steam S - Swirly left wisp */}
      <path d="M30 38 C30 30 40 26 44 32 C48 38 36 42 40 48" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Steam S - Main S curve */}
      <path d="M38 28 C38 16 54 12 58 22 C62 32 46 36 50 46" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Steam F - Vertical stroke */}
      <path d="M58 8 L58 44" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
      {/* Steam F - Top horizontal */}
      <path d="M58 8 L74 8" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
      {/* Steam F - Middle horizontal */}
      <path d="M58 24 L70 24" stroke="#f24a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export default Logo;
