/**
 * API Response Validation Utilities
 *
 * Provides runtime validation of API responses using Zod schemas.
 * Catches contract mismatches between frontend and backend early.
 *
 * Usage:
 * ```typescript
 * import { validateResponse, validateArray } from '../schemas/validate';
 * import { vendorSchema } from '../schemas/domains';
 *
 * // Single entity
 * const vendor = validateResponse(response.data, vendorSchema);
 *
 * // Array of entities
 * const vendors = validateArray(response.data, vendorSchema);
 * ```
 */
import { z, ZodError } from 'zod';
import type { ZodSchema } from 'zod';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Enable/disable validation in different environments
 * In production, you may want to log but not throw on validation errors
 */
const VALIDATION_CONFIG = {
  // Throw errors on validation failure (development)
  throwOnError: import.meta.env.DEV,
  // Log validation errors to console
  logErrors: true,
  // Log successful validations (verbose mode)
  logSuccess: false,
};

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a single API response against a Zod schema
 *
 * @param data - The API response data to validate
 * @param schema - Zod schema to validate against
 * @param context - Optional context for error messages (e.g., "getVendor")
 * @returns The validated and typed data
 * @throws ZodError in development if validation fails
 */
export function validateResponse<T extends ZodSchema>(
  data: unknown,
  schema: T,
  context?: string
): z.infer<T> {
  try {
    const result = schema.parse(data);

    if (VALIDATION_CONFIG.logSuccess) {
      console.debug(`[API Validation] ✓ ${context || 'Response'} validated successfully`);
    }

    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      handleValidationError(error, data, context);
    }
    throw error;
  }
}

/**
 * Validate an array API response against a Zod schema
 *
 * @param data - The API response array to validate
 * @param itemSchema - Zod schema for each item in the array
 * @param context - Optional context for error messages
 * @returns The validated and typed array
 */
export function validateArray<T extends ZodSchema>(
  data: unknown,
  itemSchema: T,
  context?: string
): z.infer<T>[] {
  const arraySchema = z.array(itemSchema);
  return validateResponse(data, arraySchema, context);
}

/**
 * Safe validation that returns null on failure instead of throwing
 * Useful for optional/degraded functionality
 *
 * @param data - The API response data to validate
 * @param schema - Zod schema to validate against
 * @param context - Optional context for error messages
 * @returns The validated data or null if validation fails
 */
export function safeValidate<T extends ZodSchema>(
  data: unknown,
  schema: T,
  context?: string
): z.infer<T> | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      handleValidationError(error, data, context, false);
    }
    return null;
  }
}

/**
 * Partial validation - validates only the fields present in the schema
 * Useful for responses that may have extra fields not in the schema
 *
 * @param data - The API response data to validate
 * @param schema - Zod schema to validate against (will use .passthrough())
 * @param context - Optional context for error messages
 * @returns The validated data with extra fields preserved
 */
export function validatePartial<T extends z.ZodObject<z.ZodRawShape>>(
  data: unknown,
  schema: T,
  context?: string
): z.infer<T> & Record<string, unknown> {
  const passthroughSchema = schema.passthrough();
  return validateResponse(data, passthroughSchema, context) as z.infer<T> & Record<string, unknown>;
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Handle validation errors with consistent logging and optional throwing
 */
function handleValidationError(
  error: ZodError,
  data: unknown,
  context?: string,
  shouldThrow: boolean = VALIDATION_CONFIG.throwOnError
): void {
  if (VALIDATION_CONFIG.logErrors) {
    console.error(`[API Validation] ✗ ${context || 'Response'} validation failed:`);
    console.error('Issues:', error.issues);
    console.error('Received data:', data);
    console.error('Formatted errors:', error.format());
  }

  // In development, also add to Sentry if available
  if (import.meta.env.DEV && typeof window !== 'undefined' && (window as unknown as { Sentry?: { captureException: (e: Error) => void } }).Sentry) {
    (window as unknown as { Sentry: { captureException: (e: Error, ctx?: object) => void } }).Sentry.captureException(error, {
      tags: { type: 'api_validation_error', context },
      extra: { data, issues: error.issues },
    });
  }

  if (shouldThrow) {
    throw error;
  }
}

// =============================================================================
// Type-safe API Wrapper
// =============================================================================

/**
 * Create a validated API function that automatically validates responses
 *
 * @example
 * ```typescript
 * const getVendor = createValidatedFetcher(
 *   async (id: string) => {
 *     const response = await apiClient.get(`/vendor/show/${id}.json`);
 *     return response.data;
 *   },
 *   vendorSchema,
 *   'getVendor'
 * );
 *
 * const vendor = await getVendor('123'); // Fully typed and validated
 * ```
 */
export function createValidatedFetcher<TArgs extends unknown[], TSchema extends ZodSchema>(
  fetcher: (...args: TArgs) => Promise<unknown>,
  schema: TSchema,
  context?: string
): (...args: TArgs) => Promise<z.infer<TSchema>> {
  return async (...args: TArgs) => {
    const data = await fetcher(...args);
    return validateResponse(data, schema, context);
  };
}

/**
 * Create a validated list API function for array responses
 */
export function createValidatedListFetcher<TArgs extends unknown[], TSchema extends ZodSchema>(
  fetcher: (...args: TArgs) => Promise<unknown>,
  itemSchema: TSchema,
  context?: string
): (...args: TArgs) => Promise<z.infer<TSchema>[]> {
  return async (...args: TArgs) => {
    const data = await fetcher(...args);
    return validateArray(data, itemSchema, context);
  };
}
