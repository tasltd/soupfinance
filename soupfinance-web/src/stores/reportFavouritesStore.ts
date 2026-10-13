/**
 * Added (SOUPFIN-103): favourite reports, kept in the browser per signed-in user.
 *
 * Favourites are a personal shortcut, not tenant data, so they live in
 * localStorage rather than on the backend. They are keyed by username so two
 * people sharing a browser do not see each other's list. They survive sign-out
 * on purpose: signing back in should find the same shortcuts.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';

/** Used when nobody is signed in (tests, or a page rendered before auth settles). */
const ANONYMOUS = '__anonymous__';

interface ReportFavouritesState {
  /** Report ids, per username, in the order they were starred. */
  byUser: Record<string, string[]>;
  toggleFavourite: (username: string, reportId: string) => void;
  reset: () => void;
}

export const useReportFavouritesStore = create<ReportFavouritesState>()(
  persist(
    (set) => ({
      byUser: {},
      toggleFavourite: (username, reportId) =>
        set((state) => {
          const key = username || ANONYMOUS;
          const current = state.byUser[key] ?? [];
          const next = current.includes(reportId)
            ? current.filter((id) => id !== reportId)
            : [...current, reportId];
          return { byUser: { ...state.byUser, [key]: next } };
        }),
      reset: () => set({ byUser: {} }),
    }),
    { name: 'report-favourites' }
  )
);

const EMPTY: string[] = [];

/** The signed-in user's favourite report ids, and a toggle for them. */
export function useReportFavourites(): {
  favourites: string[];
  isFavourite: (reportId: string) => boolean;
  toggleFavourite: (reportId: string) => void;
} {
  const username = useAuthStore((state) => state.user?.username) || ANONYMOUS;
  const favourites = useReportFavouritesStore((state) => state.byUser[username] ?? EMPTY);
  const toggle = useReportFavouritesStore((state) => state.toggleFavourite);

  return {
    favourites,
    isFavourite: (reportId) => favourites.includes(reportId),
    toggleFavourite: (reportId) => toggle(username, reportId),
  };
}
