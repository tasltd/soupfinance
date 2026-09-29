/**
 * HelpLink (SOUPFIN-81)
 *
 * The "? Need Help?" link shown in page headers and beside important sections.
 * It opens the matching section of the user guide in a new tab, so a
 * half-filled invoice or journal entry is never lost to a help lookup, and it
 * works on the sign-in pages too, where the /help route is not reachable.
 */
import { helpUrl, type HelpSection } from './helpSections';

interface HelpLinkProps {
  /** Element id in the user guide to open at. */
  section: HelpSection;
  className?: string;
  /** Defaults to help-link-{section}. */
  testId?: string;
}

export function HelpLink({ section, className = '', testId }: HelpLinkProps) {
  return (
    <a
      href={helpUrl(section)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId ?? `help-link-${section}`}
      data-help-section={section}
      className={`inline-flex items-center gap-1 rounded text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-base">help</span>
      <span>Need Help?</span>
      <span className="sr-only"> (opens the user guide in a new tab)</span>
    </a>
  );
}
