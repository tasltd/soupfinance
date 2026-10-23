/**
 * SOUPFIN-68 — repo-wide guard against the UTC date-truncation idiom.
 *
 * SOUPFIN-64 fixed every report page and replaced the arithmetic with the
 * shared helpers in `src/utils/date.ts`. SOUPFIN-68 was filed against the same
 * defect afterwards, which is the tell that per-page tests are not enough: they
 * only pin the pages that were known to be broken. One instance had in fact
 * survived outside the reports feature (`DatePicker.stories.tsx`), because
 * nothing was looking anywhere else.
 *
 * `someDate.toISOString().split('T')[0]` converts to UTC *before* taking the
 * date part, so it is off by one for part of every day:
 *   - east of UTC, from local midnight until the offset elapses;
 *   - west of UTC, from local evening until UTC midnight.
 * From Ghana (UTC+0) it is always right, which is why it keeps getting written.
 *
 * Use `toLocalIsoDate()` / `getTodayIsoDate()` / `getCurrentMonthRange()`
 * instead. A bare `new Date().toISOString()` is fine and deliberately allowed —
 * a full UTC timestamp (as `frontendLogger` sends) is the correct thing to log.
 * Only truncating one to a calendar date is the bug.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Repo-root-relative source root, resolved from the vitest cwd. */
const SRC_ROOT = join(process.cwd(), 'src');

/**
 * Truncating an ISO string to its date part, in the three spellings that show
 * up in practice. Whitespace-tolerant so reformatting cannot smuggle one past.
 */
const UTC_TRUNCATION = [
  /\.toISOString\(\)\s*\.\s*split\(\s*['"`]T['"`]\s*\)\s*\[\s*0\s*\]/,
  /\.toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*substring\(\s*0\s*,\s*10\s*\)/,
];

/**
 * Comment lines are skipped, not stripped. The helper file and the fixed pages
 * quote the broken idiom in their explanatory comments on purpose — that is
 * documentation, and deleting it would lose the reason the helpers exist.
 * Skipping whole comment lines (rather than stripping trailing `//`) cannot
 * truncate a real code line and so cannot hide a real match.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * Tests are excluded: several deliberately execute the broken arithmetic to
 * prove the helpers disagree with it. Production source is what must stay clean.
 */
function isTestFile(path: string): boolean {
  return (
    path.includes(`${'__tests__'}`) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    path.includes(join('src', 'test'))
  );
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.[cm]?[jt]sx?$/.test(entry) && !isTestFile(full)) {
      out.push(full);
    }
  }
  return out;
}

describe('no UTC date truncation in application source (SOUPFIN-68)', () => {
  const files = collectSourceFiles(SRC_ROOT);

  it('scans a realistic number of source files', () => {
    // A broken walker that found nothing would make every assertion below pass
    // vacuously. Pin a floor so an empty scan reads as a failure, not a pass.
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds no `.toISOString()` truncated to a calendar date', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (isCommentLine(line)) return;
        if (UTC_TRUNCATION.some((pattern) => pattern.test(line))) {
          offenders.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Use toLocalIsoDate()/getTodayIsoDate()/getCurrentMonthRange() from src/utils/date.ts ` +
        `instead — toISOString() converts to UTC first, so these are off by one for part of ` +
        `every day.\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('still allows a bare toISOString() for full UTC timestamps', () => {
    // frontendLogger legitimately sends whole ISO instants; the guard must not
    // chase those, or it gets disabled and stops protecting the real case.
    const logger = readFileSync(join(SRC_ROOT, 'utils', 'frontendLogger.ts'), 'utf8');
    expect(logger).toContain('new Date().toISOString()');
    expect(UTC_TRUNCATION.some((pattern) => pattern.test(logger))).toBe(false);
  });
});
