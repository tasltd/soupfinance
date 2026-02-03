/**
 * Schema Exports for API Validation
 *
 * IMPORTANT: Runtime validation is OPTIONAL and NON-BREAKING
 *
 * - In DEVELOPMENT: Logs validation errors, throws to catch issues early
 * - In PRODUCTION: Logs errors only, never throws, app continues working
 *
 * Usage is gradual - you don't need to validate all endpoints at once.
 */

// Base schemas and utilities
export * from './base';

// Domain schemas
export * from './domains';

// Validation utilities
export {
  validateResponse,
  validateArray,
  safeValidate,
  validatePartial,
  createValidatedFetcher,
  createValidatedListFetcher,
} from './validate';
