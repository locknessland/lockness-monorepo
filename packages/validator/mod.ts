/**
 * @fileoverview Lockness Validator System
 *
 * Advanced validation with custom rules, async validation, and sanitization.
 * Also includes Zod decorator for controller validation.
 *
 * This module is a thin re-export barrel; the implementation lives in
 * `rules/`, `sanitisers/`, `validation.ts`, and `zod_decorator.ts`.
 *
 * @module @lockness/validator
 */

// =============================================================================
// Zod Re-export (for convenience)
// =============================================================================

export { z } from 'zod'
export type { ZodSchema, ZodType } from 'zod'

// =============================================================================
// Zod Decorator for Controller Validation (Optional)
// =============================================================================

export {
    setValidationErrorHandler,
    Validate,
    type ValidationErrorHandler,
    type ValidationErrorResponse,
} from './zod_decorator.ts'

// =============================================================================
// Custom Validation System
// =============================================================================

// Rule constructors plus the Rule / FieldRules / ValidatorFn contract.
export * from './rules/mod.ts'

// Sanitiser functions plus the SanitizerFn type.
export * from './sanitisers/mod.ts'

// Validator builder, ValidationError, ValidationResult and helper functions.
export * from './validation.ts'
