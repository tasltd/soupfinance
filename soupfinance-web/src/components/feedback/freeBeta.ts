/**
 * Free beta offer dates.
 *
 * Added (SOUPFIN-89): SoupFinance is free for all users for one year of beta,
 * until November 2027. Kept apart from FreeBetaBanner.tsx so that file exports
 * only the component (React fast refresh requires it).
 */

/** Last day of the free beta: the end of November 2027, local time. */
export const FREE_BETA_LAST_DAY = new Date(2027, 10, 30, 23, 59, 59, 999);

/** True while the free beta offer is still running. */
export function isFreeBetaActive(now: Date = new Date()): boolean {
  return now.getTime() <= FREE_BETA_LAST_DAY.getTime();
}
