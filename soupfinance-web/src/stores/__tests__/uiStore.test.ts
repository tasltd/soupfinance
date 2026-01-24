/**
 * Unit tests for uiStore
 * Tests UI state management: dark mode, sidebar, notifications
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useUIStore } from '../uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      darkMode: false,
      sidebarOpen: true,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      notificationsOpen: false,
    })
    vi.clearAllMocks()
    // Clear any dark class from document
    document.documentElement.classList.remove('dark')
  })

  describe('initial state', () => {
    it('starts with darkMode as false', () => {
      expect(useUIStore.getState().darkMode).toBe(false)
    })

    it('starts with sidebarOpen as true', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true)
    })

    it('starts with sidebarCollapsed as false', () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    })

    it('starts with mobileSidebarOpen as false', () => {
      expect(useUIStore.getState().mobileSidebarOpen).toBe(false)
    })

    it('starts with notificationsOpen as false', () => {
      expect(useUIStore.getState().notificationsOpen).toBe(false)
    })
  })

  describe('dark mode', () => {
    describe('toggleDarkMode', () => {
      it('toggles darkMode from false to true', () => {
        // Arrange
        expect(useUIStore.getState().darkMode).toBe(false)

        // Act
        act(() => {
          useUIStore.getState().toggleDarkMode()
        })

        // Assert
        expect(useUIStore.getState().darkMode).toBe(true)
      })

      it('toggles darkMode from true to false', () => {
        // Arrange
        useUIStore.setState({ darkMode: true })

        // Act
        act(() => {
          useUIStore.getState().toggleDarkMode()
        })

        // Assert
        expect(useUIStore.getState().darkMode).toBe(false)
      })

      it('adds dark class to document when enabling', () => {
        // Arrange
        expect(document.documentElement.classList.contains('dark')).toBe(false)

        // Act
        act(() => {
          useUIStore.getState().toggleDarkMode()
        })

        // Assert
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })

      it('removes dark class from document when disabling', () => {
        // Arrange
        useUIStore.setState({ darkMode: true })
        document.documentElement.classList.add('dark')

        // Act
        act(() => {
          useUIStore.getState().toggleDarkMode()
        })

        // Assert
        expect(document.documentElement.classList.contains('dark')).toBe(false)
      })

      it('toggles multiple times correctly', () => {
        // Act & Assert: Toggle 4 times
        act(() => useUIStore.getState().toggleDarkMode())
        expect(useUIStore.getState().darkMode).toBe(true)

        act(() => useUIStore.getState().toggleDarkMode())
        expect(useUIStore.getState().darkMode).toBe(false)

        act(() => useUIStore.getState().toggleDarkMode())
        expect(useUIStore.getState().darkMode).toBe(true)

        act(() => useUIStore.getState().toggleDarkMode())
        expect(useUIStore.getState().darkMode).toBe(false)
      })
    })

    describe('setDarkMode', () => {
      it('sets darkMode to true when passed true', () => {
        // Act
        act(() => {
          useUIStore.getState().setDarkMode(true)
        })

        // Assert
        expect(useUIStore.getState().darkMode).toBe(true)
      })

      it('sets darkMode to false when passed false', () => {
        // Arrange
        useUIStore.setState({ darkMode: true })

        // Act
        act(() => {
          useUIStore.getState().setDarkMode(false)
        })

        // Assert
        expect(useUIStore.getState().darkMode).toBe(false)
      })

      it('adds dark class when setting to true', () => {
        // Act
        act(() => {
          useUIStore.getState().setDarkMode(true)
        })

        // Assert
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })

      it('removes dark class when setting to false', () => {
        // Arrange
        document.documentElement.classList.add('dark')

        // Act
        act(() => {
          useUIStore.getState().setDarkMode(false)
        })

        // Assert
        expect(document.documentElement.classList.contains('dark')).toBe(false)
      })

      it('is idempotent - setting same value twice has no side effects', () => {
        // Act
        act(() => {
          useUIStore.getState().setDarkMode(true)
          useUIStore.getState().setDarkMode(true)
        })

        // Assert
        expect(useUIStore.getState().darkMode).toBe(true)
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
    })
  })

  describe('sidebar', () => {
    describe('toggleSidebar', () => {
      it('toggles sidebarOpen from true to false', () => {
        // Arrange
        expect(useUIStore.getState().sidebarOpen).toBe(true)

        // Act
        act(() => {
          useUIStore.getState().toggleSidebar()
        })

        // Assert
        expect(useUIStore.getState().sidebarOpen).toBe(false)
      })

      it('toggles sidebarOpen from false to true', () => {
        // Arrange
        useUIStore.setState({ sidebarOpen: false })

        // Act
        act(() => {
          useUIStore.getState().toggleSidebar()
        })

        // Assert
        expect(useUIStore.getState().sidebarOpen).toBe(true)
      })
    })

    describe('setSidebarOpen', () => {
      it('sets sidebarOpen to provided value', () => {
        // Act
        act(() => {
          useUIStore.getState().setSidebarOpen(false)
        })

        // Assert
        expect(useUIStore.getState().sidebarOpen).toBe(false)

        // Act again
        act(() => {
          useUIStore.getState().setSidebarOpen(true)
        })

        // Assert
        expect(useUIStore.getState().sidebarOpen).toBe(true)
      })
    })

    describe('setSidebarCollapsed', () => {
      it('sets sidebarCollapsed to true', () => {
        // Act
        act(() => {
          useUIStore.getState().setSidebarCollapsed(true)
        })

        // Assert
        expect(useUIStore.getState().sidebarCollapsed).toBe(true)
      })

      it('sets sidebarCollapsed to false', () => {
        // Arrange
        useUIStore.setState({ sidebarCollapsed: true })

        // Act
        act(() => {
          useUIStore.getState().setSidebarCollapsed(false)
        })

        // Assert
        expect(useUIStore.getState().sidebarCollapsed).toBe(false)
      })
    })
  })

  describe('mobile sidebar', () => {
    describe('setMobileSidebarOpen', () => {
      it('sets mobileSidebarOpen to true', () => {
        // Act
        act(() => {
          useUIStore.getState().setMobileSidebarOpen(true)
        })

        // Assert
        expect(useUIStore.getState().mobileSidebarOpen).toBe(true)
      })

      it('sets mobileSidebarOpen to false', () => {
        // Arrange
        useUIStore.setState({ mobileSidebarOpen: true })

        // Act
        act(() => {
          useUIStore.getState().setMobileSidebarOpen(false)
        })

        // Assert
        expect(useUIStore.getState().mobileSidebarOpen).toBe(false)
      })
    })
  })

  describe('notifications', () => {
    describe('setNotificationsOpen', () => {
      it('sets notificationsOpen to true', () => {
        // Act
        act(() => {
          useUIStore.getState().setNotificationsOpen(true)
        })

        // Assert
        expect(useUIStore.getState().notificationsOpen).toBe(true)
      })

      it('sets notificationsOpen to false', () => {
        // Arrange
        useUIStore.setState({ notificationsOpen: true })

        // Act
        act(() => {
          useUIStore.getState().setNotificationsOpen(false)
        })

        // Assert
        expect(useUIStore.getState().notificationsOpen).toBe(false)
      })
    })
  })

  describe('state isolation', () => {
    it('changing darkMode does not affect sidebar state', () => {
      // Arrange
      const initialSidebarOpen = useUIStore.getState().sidebarOpen

      // Act
      act(() => {
        useUIStore.getState().toggleDarkMode()
      })

      // Assert
      expect(useUIStore.getState().sidebarOpen).toBe(initialSidebarOpen)
    })

    it('changing sidebar does not affect darkMode state', () => {
      // Arrange
      act(() => {
        useUIStore.getState().setDarkMode(true)
      })
      const initialDarkMode = useUIStore.getState().darkMode

      // Act
      act(() => {
        useUIStore.getState().toggleSidebar()
      })

      // Assert
      expect(useUIStore.getState().darkMode).toBe(initialDarkMode)
    })
  })
})
