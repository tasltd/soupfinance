/**
 * Vitest setup file
 * Configures testing environment with jest-dom matchers and global mocks
 */
import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// Mock axios globally to prevent URL issues in jsdom
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })),
  },
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock window.location
const locationMock = {
  href: '/',
  pathname: '/',
  assign: vi.fn(),
  replace: vi.fn(),
}
Object.defineProperty(window, 'location', {
  value: locationMock,
  writable: true,
})

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  locationMock.href = '/'
  locationMock.pathname = '/'
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})
