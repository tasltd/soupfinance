/**
 * Vitest setup file
 * Configures testing environment with jest-dom matchers and global mocks
 */
import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'
// Added (SOUPFIN-164): initialise i18next for every test file, so components that
// call useTranslation() render their English copy rather than the raw keys
import i18n from '../i18n'

// Mock axios globally to prevent URL issues in jsdom.
// Added isAxiosError helper (SOUPFIN-2) so utilities like normalizeApiError
// can detect mocked errors in tests — checks for plain objects carrying an
// `isAxiosError: true` flag.
const isAxiosErrorMock = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as { isAxiosError?: boolean }).isAxiosError === true
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
    isAxiosError: isAxiosErrorMock,
  },
  isAxiosError: isAxiosErrorMock,
}))

// Mock window.matchMedia (jsdom doesn't provide it; needed by uiStore dark mode)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

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
beforeEach(async () => {
  // Added (SOUPFIN-164): a test that switched language must not leak it into the next
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
  localStorageMock.clear()
  vi.clearAllMocks()
  locationMock.href = '/'
  locationMock.pathname = '/'
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})
