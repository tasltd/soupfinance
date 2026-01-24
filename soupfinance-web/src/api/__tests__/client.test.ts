/**
 * Unit tests for API client helper functions
 * Tests toFormData and toQueryString utilities
 * 
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toFormData, toQueryString } from '../client'

describe('API Client Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('toFormData', () => {
    it('converts simple object to URLSearchParams', () => {
      // Arrange
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('name')).toBe('John Doe')
      expect(result.get('email')).toBe('john@example.com')
    })

    it('converts numbers to strings', () => {
      // Arrange
      const data = {
        amount: 150.50,
        quantity: 10,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('amount')).toBe('150.5')
      expect(result.get('quantity')).toBe('10')
    })

    it('converts boolean values to strings', () => {
      // Arrange
      const data = {
        active: true,
        archived: false,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('active')).toBe('true')
      expect(result.get('archived')).toBe('false')
    })

    it('skips null values', () => {
      // Arrange
      const data = {
        name: 'Test',
        description: null,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('name')).toBe('Test')
      expect(result.has('description')).toBe(false)
    })

    it('skips undefined values', () => {
      // Arrange
      const data = {
        name: 'Test',
        optional: undefined,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('name')).toBe('Test')
      expect(result.has('optional')).toBe(false)
    })

    it('handles nested objects with id (foreign key references)', () => {
      // Arrange
      const data = {
        name: 'Invoice',
        client: { id: 'uuid-123-456' },
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('name')).toBe('Invoice')
      expect(result.get('client.id')).toBe('uuid-123-456')
      expect(result.has('client')).toBe(false)
    })

    it('handles multiple nested objects with ids', () => {
      // Arrange
      const data = {
        amount: 1000,
        client: { id: 'client-uuid' },
        vendor: { id: 'vendor-uuid' },
        category: { id: 'category-uuid' },
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('amount')).toBe('1000')
      expect(result.get('client.id')).toBe('client-uuid')
      expect(result.get('vendor.id')).toBe('vendor-uuid')
      expect(result.get('category.id')).toBe('category-uuid')
    })

    it('returns empty params for empty object', () => {
      // Act
      const result = toFormData({})

      // Assert
      expect(result.toString()).toBe('')
    })

    it('handles object with all null/undefined values', () => {
      // Arrange
      const data = {
        a: null,
        b: undefined,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.toString()).toBe('')
    })

    it('converts Date objects to strings', () => {
      // Arrange
      const date = new Date('2024-01-15T10:30:00Z')
      const data = {
        createdAt: date,
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.has('createdAt')).toBe(true)
      expect(result.get('createdAt')).toBeTruthy()
    })

    it('preserves special characters in values', () => {
      // Arrange
      const data = {
        name: 'Company & Partners, LLC',
        notes: 'Line 1\nLine 2',
      }

      // Act
      const result = toFormData(data)

      // Assert
      expect(result.get('name')).toBe('Company & Partners, LLC')
      expect(result.get('notes')).toBe('Line 1\nLine 2')
    })
  })

  describe('toQueryString', () => {
    it('converts simple object to query string', () => {
      // Arrange
      const params = {
        page: 1,
        size: 20,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('page=1&size=20')
    })

    it('converts string values correctly', () => {
      // Arrange
      const params = {
        search: 'invoice',
        status: 'PAID',
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('search=invoice&status=PAID')
    })

    it('URL encodes special characters', () => {
      // Arrange
      const params = {
        search: 'John & Jane',
        filter: 'status=active',
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toContain('search=John+%26+Jane')
      expect(result).toContain('filter=status%3Dactive')
    })

    it('skips null values', () => {
      // Arrange
      const params = {
        page: 1,
        search: null,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('page=1')
    })

    it('skips undefined values', () => {
      // Arrange
      const params = {
        page: 1,
        filter: undefined,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('page=1')
    })

    it('returns empty string for empty object', () => {
      // Act
      const result = toQueryString({})

      // Assert
      expect(result).toBe('')
    })

    it('returns empty string when all values are null/undefined', () => {
      // Arrange
      const params = {
        a: null,
        b: undefined,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('')
    })

    it('converts boolean values to strings', () => {
      // Arrange
      const params = {
        active: true,
        archived: false,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('active=true&archived=false')
    })

    it('handles mixed value types', () => {
      // Arrange
      const params = {
        page: 1,
        size: 20,
        search: 'test',
        active: true,
        deleted: null,
        filter: undefined,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toContain('page=1')
      expect(result).toContain('size=20')
      expect(result).toContain('search=test')
      expect(result).toContain('active=true')
      expect(result).not.toContain('deleted')
      expect(result).not.toContain('filter')
    })

    it('preserves order of parameters', () => {
      // Arrange
      const params = {
        a: 1,
        b: 2,
        c: 3,
      }

      // Act
      const result = toQueryString(params)

      // Assert
      expect(result).toBe('a=1&b=2&c=3')
    })
  })

  describe('request interceptor logic (auth header)', () => {
    // Changed (2026-01-21): Tests updated to use X-Auth-Token header
    // Backend uses grails.plugin.springsecurity.rest.token.validation.useBearerToken = false
    it('attaches X-Auth-Token when token exists in localStorage', () => {
      // Arrange
      const token = 'test-jwt-token'
      localStorage.setItem('access_token', token)

      // Simulate interceptor logic
      const config = { headers: {} as Record<string, string> }
      const storedToken = localStorage.getItem('access_token')
      if (storedToken) {
        config.headers['X-Auth-Token'] = storedToken
      }

      // Assert
      expect(config.headers['X-Auth-Token']).toBe(token)
    })

    it('does not attach header when no token exists', () => {
      // Simulate interceptor logic
      const config = { headers: {} as Record<string, string> }
      const storedToken = localStorage.getItem('access_token')
      if (storedToken) {
        config.headers['X-Auth-Token'] = storedToken
      }

      // Assert
      expect(config.headers['X-Auth-Token']).toBeUndefined()
    })

    it('uses X-Auth-Token header (not Bearer format)', () => {
      // Arrange
      const token = 'my-access-token-123'
      localStorage.setItem('access_token', token)

      // Simulate interceptor logic
      const config = { headers: {} as Record<string, string> }
      const storedToken = localStorage.getItem('access_token')
      if (storedToken) {
        config.headers['X-Auth-Token'] = storedToken
      }

      // Assert - X-Auth-Token contains just the token value, not "Bearer X" format
      expect(config.headers['X-Auth-Token']).toBe('my-access-token-123')
      expect(config.headers['X-Auth-Token']).not.toMatch(/^Bearer/)
    })
  })
})
