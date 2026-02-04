/**
 * Unit tests for API client helper functions
 * Tests toFormData, toQueryString, and response normalization utilities
 *
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toFormData, toQueryString, normalizeToArray, normalizeToObject, normalizeClientAccountResponse } from '../client'

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

  // =============================================================================
  // Response Normalization Utilities
  // =============================================================================
  // The soupmarkets backend can return certain fields (accountServices, individual)
  // as either objects or arrays depending on the data. These utilities normalize
  // the responses for consistent frontend handling.

  describe('normalizeToArray', () => {
    it('returns empty array for null', () => {
      expect(normalizeToArray(null)).toEqual([])
    })

    it('returns empty array for undefined', () => {
      expect(normalizeToArray(undefined)).toEqual([])
    })

    it('returns same array if already an array', () => {
      const input = [{ id: '1' }, { id: '2' }]
      expect(normalizeToArray(input)).toEqual(input)
    })

    it('wraps single object in array', () => {
      const input = { id: '1', name: 'Test' }
      expect(normalizeToArray(input)).toEqual([{ id: '1', name: 'Test' }])
    })

    it('handles empty array', () => {
      expect(normalizeToArray([])).toEqual([])
    })

    it('handles primitive values', () => {
      expect(normalizeToArray('string')).toEqual(['string'])
      expect(normalizeToArray(123)).toEqual([123])
      expect(normalizeToArray(true)).toEqual([true])
    })
  })

  describe('normalizeToObject', () => {
    it('returns null for null', () => {
      expect(normalizeToObject(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(normalizeToObject(undefined)).toBeNull()
    })

    it('returns same object if already an object', () => {
      const input = { id: '1', name: 'Test' }
      expect(normalizeToObject(input)).toEqual({ id: '1', name: 'Test' })
    })

    it('returns first item if array', () => {
      const input = [{ id: '1', name: 'First' }, { id: '2', name: 'Second' }]
      expect(normalizeToObject(input)).toEqual({ id: '1', name: 'First' })
    })

    it('returns null for empty array', () => {
      expect(normalizeToObject([])).toBeNull()
    })

    it('handles array with single item', () => {
      const input = [{ id: '1', name: 'Only' }]
      expect(normalizeToObject(input)).toEqual({ id: '1', name: 'Only' })
    })
  })

  describe('normalizeClientAccountResponse', () => {
    it('normalizes accountServices from object to array', () => {
      const input = {
        id: '123',
        name: 'Test Client',
        accountServices: { id: 'svc-1', type: 'PORTFOLIO' },
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.accountServices).toEqual([{ id: 'svc-1', type: 'PORTFOLIO' }])
      expect(result.id).toBe('123')
      expect(result.name).toBe('Test Client')
    })

    it('keeps accountServices as array if already array', () => {
      const input = {
        id: '123',
        accountServices: [{ id: 'svc-1' }, { id: 'svc-2' }],
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.accountServices).toEqual([{ id: 'svc-1' }, { id: 'svc-2' }])
    })

    it('normalizes portfolioAccountServicesList from object to array', () => {
      const input = {
        id: '123',
        portfolioAccountServicesList: { id: 'pas-1', fundId: 'fund-123' },
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.portfolioAccountServicesList).toEqual([{ id: 'pas-1', fundId: 'fund-123' }])
    })

    it('normalizes individual from array to object (first item)', () => {
      const input = {
        id: '123',
        individual: [{ id: 'ind-1', firstName: 'John' }],
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.individual).toEqual({ id: 'ind-1', firstName: 'John' })
    })

    it('keeps individual as object if already object', () => {
      const input = {
        id: '123',
        individual: { id: 'ind-1', firstName: 'John' },
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.individual).toEqual({ id: 'ind-1', firstName: 'John' })
    })

    it('handles missing fields gracefully', () => {
      const input = {
        id: '123',
        name: 'Test',
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.id).toBe('123')
      expect(result.name).toBe('Test')
      expect('accountServices' in result).toBe(false)
      expect('individual' in result).toBe(false)
    })

    it('handles all fields at once', () => {
      const input = {
        id: '123',
        accountServices: { id: 'svc-1' },
        portfolioAccountServicesList: [{ id: 'pas-1' }, { id: 'pas-2' }],
        individual: [{ id: 'ind-1', firstName: 'John' }],
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.accountServices).toEqual([{ id: 'svc-1' }])
      expect(result.portfolioAccountServicesList).toEqual([{ id: 'pas-1' }, { id: 'pas-2' }])
      expect(result.individual).toEqual({ id: 'ind-1', firstName: 'John' })
    })

    it('handles null values in fields', () => {
      const input = {
        id: '123',
        accountServices: null,
        individual: null,
      }
      const result = normalizeClientAccountResponse(input)

      expect(result.accountServices).toEqual([])
      expect(result.individual).toBeNull()
    })
  })
})
