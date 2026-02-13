/**
 * UI Store using Zustand
 * Manages global UI state (dark mode, sidebar, notifications)
 *
 * Changed: Dark mode now supports three modes (light/dark/system) with
 * prefers-color-scheme media query listener for system mode
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Added: Theme mode type for three-way toggle (light/dark/system)
export type ThemeMode = 'light' | 'dark' | 'system';

// Added: Resolve whether dark mode is active based on theme mode setting
function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return mode === 'dark';
}

// Added: Apply dark class to document based on resolved state
function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
}

interface UIState {
  // Dark mode — themeMode is the user's preference, darkMode is the resolved boolean
  themeMode: ThemeMode;
  darkMode: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
  toggleDarkMode: () => void;
  setDarkMode: (enabled: boolean) => void;

  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Mobile sidebar
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Notifications
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Changed: Default to system preference detection
      themeMode: 'system' as ThemeMode,
      darkMode: resolveIsDark('system'),

      // Added: Set theme mode explicitly (light/dark/system)
      setThemeMode: (mode: ThemeMode) => {
        const isDark = resolveIsDark(mode);
        applyDarkClass(isDark);
        set({ themeMode: mode, darkMode: isDark });
      },

      // Added: Cycle through light → dark → system
      cycleThemeMode: () =>
        set((state) => {
          const cycle: ThemeMode[] = ['light', 'dark', 'system'];
          const currentIndex = cycle.indexOf(state.themeMode);
          const nextMode = cycle[(currentIndex + 1) % cycle.length];
          const isDark = resolveIsDark(nextMode);
          applyDarkClass(isDark);
          return { themeMode: nextMode, darkMode: isDark };
        }),

      // Changed: toggleDarkMode now cycles through the three modes
      toggleDarkMode: () =>
        set((state) => {
          const cycle: ThemeMode[] = ['light', 'dark', 'system'];
          const currentIndex = cycle.indexOf(state.themeMode);
          const nextMode = cycle[(currentIndex + 1) % cycle.length];
          const isDark = resolveIsDark(nextMode);
          applyDarkClass(isDark);
          return { themeMode: nextMode, darkMode: isDark };
        }),

      // Changed: setDarkMode sets explicit light or dark (not system)
      setDarkMode: (enabled) => {
        const mode: ThemeMode = enabled ? 'dark' : 'light';
        applyDarkClass(enabled);
        set({ themeMode: mode, darkMode: enabled });
      },

      // Sidebar
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Mobile sidebar
      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

      // Notifications
      notificationsOpen: false,
      setNotificationsOpen: (open) => set({ notificationsOpen: open }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        themeMode: state.themeMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply dark mode on page load based on persisted theme mode
        const mode = state?.themeMode ?? 'system';
        const isDark = resolveIsDark(mode);
        applyDarkClass(isDark);
      },
    }
  )
);

// Added: Listen for OS-level dark mode changes when themeMode is 'system'
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    const { themeMode } = useUIStore.getState();
    if (themeMode === 'system') {
      applyDarkClass(e.matches);
      useUIStore.setState({ darkMode: e.matches });
    }
  });
}
