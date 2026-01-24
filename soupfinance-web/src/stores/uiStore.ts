/**
 * UI Store using Zustand
 * Manages global UI state (dark mode, sidebar, notifications)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // Dark mode
  darkMode: boolean;
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
      // Dark mode - defaults to system preference
      darkMode: false,
      toggleDarkMode: () =>
        set((state) => {
          const newMode = !state.darkMode;
          // Apply dark class to html element
          document.documentElement.classList.toggle('dark', newMode);
          return { darkMode: newMode };
        }),
      setDarkMode: (enabled) => {
        document.documentElement.classList.toggle('dark', enabled);
        set({ darkMode: enabled });
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
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply dark mode on page load
        if (state?.darkMode) {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);
