/**
 * Lockness Validator System
 *
 * Advanced validation with custom rules, async validation, and sanitization.
 * Goes beyond Zod for complex business logic validation.
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export type ValidationResult = {
    valid: boolean
    errors: Record<string, string[]>
}

export type ValidatorFn<T = unknown> = (
    value: T,
    data?: Record<string, unknown>,
) => boolean | Promise<boolean>

export type SanitizerFn<T = unknown> = (value: T) => T

export interface Rule {
    name: string
    validator: ValidatorFn
    message?: string
}

export interface FieldRules {
    rules: Rule[]
    sanitizers?: SanitizerFn[]
    optional?: boolean
    nullable?: boolean
}

// =============================================================================
// Built-in Validators
// =============================================================================

/**
 * Email validator
 */
export function email(): Rule {
    return {
        name: 'email',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            return emailRegex.test(value)
        },
        message: 'Must be a valid email address',
    }
}

/**
 * URL validator
 */
export function url(): Rule {
    return {
        name: 'url',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            try {
                new URL(value)
                return true
            } catch {
                return false
            }
        },
        message: 'Must be a valid URL',
    }
}

/**
 * UUID validator
 */
export function uuid(): Rule {
    return {
        name: 'uuid',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            const uuidRegex =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return uuidRegex.test(value)
        },
        message: 'Must be a valid UUID',
    }
}

/**
 * Minimum length validator
 */
export function minLength(min: number): Rule {
    return {
        name: 'minLength',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            return value.length >= min
        },
        message: `Must be at least ${min} characters`,
    }
}

/**
 * Maximum length validator
 */
export function maxLength(max: number): Rule {
    return {
        name: 'maxLength',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            return value.length <= max
        },
        message: `Must be at most ${max} characters`,
    }
}

/**
 * Minimum value validator
 */
export function min(minValue: number): Rule {
    return {
        name: 'min',
        validator: (value: unknown) => {
            if (typeof value !== 'number') return false
            return value >= minValue
        },
        message: `Must be at least ${minValue}`,
    }
}

/**
 * Maximum value validator
 */
export function max(maxValue: number): Rule {
    return {
        name: 'max',
        validator: (value: unknown) => {
            if (typeof value !== 'number') return false
            return value <= maxValue
        },
        message: `Must be at most ${maxValue}`,
    }
}

/**
 * Between validator (inclusive)
 */
export function between(minValue: number, maxValue: number): Rule {
    return {
        name: 'between',
        validator: (value: unknown) => {
            if (typeof value !== 'number') return false
            return value >= minValue && value <= maxValue
        },
        message: `Must be between ${minValue} and ${maxValue}`,
    }
}

/**
 * In array validator
 */
export function inArray<T>(array: T[]): Rule {
    return {
        name: 'in',
        validator: (value: unknown) => {
            return array.includes(value as T)
        },
        message: `Must be one of: ${array.join(', ')}`,
    }
}

/**
 * Not in array validator
 */
export function notIn<T>(array: T[]): Rule {
    return {
        name: 'notIn',
        validator: (value: unknown) => {
            return !array.includes(value as T)
        },
        message: `Must not be one of: ${array.join(', ')}`,
    }
}

/**
 * Regex pattern validator
 */
export function pattern(regex: RegExp, message?: string): Rule {
    return {
        name: 'pattern',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            return regex.test(value)
        },
        message: message || 'Does not match the required pattern',
    }
}

/**
 * Alphanumeric validator
 */
export function alphanumeric(): Rule {
    return pattern(/^[a-zA-Z0-9]+$/, 'Must contain only letters and numbers')
}

/**
 * Alpha (letters only) validator
 */
export function alpha(): Rule {
    return pattern(/^[a-zA-Z]+$/, 'Must contain only letters')
}

/**
 * Numeric string validator
 */
export function numeric(): Rule {
    return pattern(/^[0-9]+$/, 'Must contain only numbers')
}

/**
 * Confirmed field validator (e.g., password confirmation)
 */
export function confirmed(fieldName: string): Rule {
    return {
        name: 'confirmed',
        validator: (value: unknown, data?: Record<string, unknown>) => {
            if (!data) return false
            return value === data[fieldName]
        },
        message: `Must match ${fieldName}`,
    }
}

/**
 * Different from another field validator
 */
export function different(fieldName: string): Rule {
    return {
        name: 'different',
        validator: (value: unknown, data?: Record<string, unknown>) => {
            if (!data) return true
            return value !== data[fieldName]
        },
        message: `Must be different from ${fieldName}`,
    }
}

/**
 * Required if another field has a specific value
 */
export function requiredIf(
    fieldName: string,
    fieldValue: unknown,
): Rule {
    return {
        name: 'requiredIf',
        validator: (value: unknown, data?: Record<string, unknown>) => {
            if (!data) return true
            if (data[fieldName] === fieldValue) {
                return value !== undefined && value !== null && value !== ''
            }
            return true
        },
        message: `Required when ${fieldName} is ${fieldValue}`,
    }
}

/**
 * Required unless another field has a specific value
 */
export function requiredUnless(
    fieldName: string,
    fieldValue: unknown,
): Rule {
    return {
        name: 'requiredUnless',
        validator: (value: unknown, data?: Record<string, unknown>) => {
            if (!data) return true
            if (data[fieldName] !== fieldValue) {
                return value !== undefined && value !== null && value !== ''
            }
            return true
        },
        message: `Required unless ${fieldName} is ${fieldValue}`,
    }
}

/**
 * IP address validator
 */
export function ip(): Rule {
    return {
        name: 'ip',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            // Simple IPv4 validation
            const ipv4Regex =
                /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
            return ipv4Regex.test(value)
        },
        message: 'Must be a valid IP address',
    }
}

/**
 * JSON string validator
 */
export function json(): Rule {
    return {
        name: 'json',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            try {
                JSON.parse(value)
                return true
            } catch {
                return false
            }
        },
        message: 'Must be valid JSON',
    }
}

/**
 * Date string validator
 */
export function dateString(): Rule {
    return {
        name: 'dateString',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            const date = new Date(value)
            return !isNaN(date.getTime())
        },
        message: 'Must be a valid date string',
    }
}

/**
 * Date after validator
 */
export function after(date: Date | string): Rule {
    const compareDate = typeof date === 'string' ? new Date(date) : date
    return {
        name: 'after',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            const valueDate = new Date(value)
            return valueDate > compareDate
        },
        message: `Must be after ${compareDate.toLocaleDateString()}`,
    }
}

/**
 * Date before validator
 */
export function before(date: Date | string): Rule {
    const compareDate = typeof date === 'string' ? new Date(date) : date
    return {
        name: 'before',
        validator: (value: unknown) => {
            if (typeof value !== 'string') return false
            const valueDate = new Date(value)
            return valueDate < compareDate
        },
        message: `Must be before ${compareDate.toLocaleDateString()}`,
    }
}

/**
 * File size validator (in bytes)
 */
export function fileSize(maxBytes: number): Rule {
    return {
        name: 'fileSize',
        validator: (value: unknown) => {
            if (!(value instanceof File)) return false
            return value.size <= maxBytes
        },
        message: `File must be smaller than ${Math.round(maxBytes / 1024)}KB`,
    }
}

/**
 * File MIME type validator
 */
export function fileMimeType(types: string[]): Rule {
    return {
        name: 'fileMimeType',
        validator: (value: unknown) => {
            if (!(value instanceof File)) return false
            return types.includes(value.type)
        },
        message: `File must be one of: ${types.join(', ')}`,
    }
}

/**
 * Custom validator
 */
export function custom(
    validator: ValidatorFn,
    message = 'Validation failed',
): Rule {
    return {
        name: 'custom',
        validator,
        message,
    }
}

// =============================================================================
// Built-in Sanitizers
// =============================================================================

/**
 * Trim whitespace
 */
export function trim(): SanitizerFn {
    return (value: unknown) => typeof value === 'string' ? value.trim() : value
}

/**
 * Lowercase
 */
export function lowercase(): SanitizerFn {
    return (value: unknown) =>
        typeof value === 'string' ? value.toLowerCase() : value
}

/**
 * Uppercase
 */
export function uppercase(): SanitizerFn {
    return (value: unknown) =>
        typeof value === 'string' ? value.toUpperCase() : value
}

/**
 * Escape HTML
 */
export function escapeHtml(): SanitizerFn {
    return (value: unknown) => {
        if (typeof value !== 'string') return value
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
    }
}

/**
 * Strip tags
 */
export function stripTags(): SanitizerFn {
    return (value: unknown) =>
        typeof value === 'string' ? value.replace(/<[^>]*>/g, '') : value
}

/**
 * To number
 */
export function toNumber(): SanitizerFn {
    return (value: unknown) => {
        if (typeof value === 'number') return value
        if (typeof value === 'string') {
            const num = Number(value)
            return isNaN(num) ? value : num
        }
        return value
    }
}

/**
 * To boolean
 */
export function toBoolean(): SanitizerFn {
    return (value: unknown) => {
        if (typeof value === 'boolean') return value
        if (typeof value === 'string') {
            const lower = value.toLowerCase()
            if (lower === 'true' || lower === '1' || lower === 'yes') {
                return true
            }
            if (lower === 'false' || lower === '0' || lower === 'no') {
                return false
            }
        }
        if (typeof value === 'number') return value !== 0
        return value
    }
}

/**
 * Default value if empty
 */
export function defaultValue<T>(defaultVal: T): SanitizerFn {
    return (value: unknown) => {
        if (value === undefined || value === null || value === '') {
            return defaultVal
        }
        return value as T
    }
}

// =============================================================================
// Validator Class
// =============================================================================

export class Validator {
    private fields: Map<string, FieldRules> = new Map()

    /**
     * Add validation rules for a field
     */
    field(
        name: string,
        rules: Rule[],
        options?: { optional?: boolean; nullable?: boolean },
    ): this {
        const existing = this.fields.get(name)
        this.fields.set(name, {
            rules,
            sanitizers: existing?.sanitizers,
            optional: options?.optional,
            nullable: options?.nullable,
        })
        return this
    }

    /**
     * Add sanitizers for a field
     */
    sanitize(name: string, sanitizers: SanitizerFn[]): this {
        const field = this.fields.get(name)
        if (field) {
            field.sanitizers = sanitizers
        } else {
            this.fields.set(name, { rules: [], sanitizers })
        }
        return this
    }

    /**
     * Apply sanitizers to data
     */
    applySanitizers(data: Record<string, unknown>): Record<string, unknown> {
        const sanitized = { ...data }

        for (const [fieldName, fieldRules] of this.fields.entries()) {
            if (fieldRules.sanitizers && fieldName in sanitized) {
                let value = sanitized[fieldName]
                for (const sanitizer of fieldRules.sanitizers) {
                    value = sanitizer(value)
                }
                sanitized[fieldName] = value
            }
        }

        return sanitized
    }

    /**
     * Validate data
     */
    async validate(
        data: Record<string, unknown>,
    ): Promise<ValidationResult> {
        const errors: Record<string, string[]> = {}

        // First apply sanitizers
        const sanitized = this.applySanitizers(data)

        for (const [fieldName, fieldRules] of this.fields.entries()) {
            const value = sanitized[fieldName]

            // Check if field is empty
            const isEmpty = value === undefined || value === null ||
                value === ''

            // Check if we have conditional required rules
            const hasConditionalRules = fieldRules.rules.some((rule) =>
                rule.name === 'requiredIf' || rule.name === 'requiredUnless'
            )

            // If empty and optional/nullable, skip unless has conditional rules
            if (isEmpty && !hasConditionalRules) {
                if (value === undefined && fieldRules.optional) continue
                if (value === null && fieldRules.nullable) continue

                // Required check for non-optional/nullable
                if (!fieldRules.optional && !fieldRules.nullable) {
                    if (!errors[fieldName]) errors[fieldName] = []
                    errors[fieldName].push(`${fieldName} is required`)
                }
                continue
            }

            // Run validators (including conditional ones)
            for (const rule of fieldRules.rules) {
                try {
                    const isValid = await rule.validator(value, sanitized)
                    if (!isValid) {
                        if (!errors[fieldName]) errors[fieldName] = []
                        errors[fieldName].push(
                            rule.message || `${fieldName} validation failed`,
                        )
                    }
                } catch (error) {
                    if (!errors[fieldName]) errors[fieldName] = []
                    errors[fieldName].push(
                        `${fieldName} validation error: ${
                            (error as Error).message
                        }`,
                    )
                }
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors,
        }
    }

    /**
     * Validate and throw on error
     */
    async validateOrThrow(
        data: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const result = await this.validate(data)
        if (!result.valid) {
            throw new ValidationError(result.errors)
        }
        return this.applySanitizers(data)
    }
}

// =============================================================================
// Validation Error
// =============================================================================

export class ValidationError extends Error {
    constructor(public errors: Record<string, string[]>) {
        super('Validation failed')
        this.name = 'ValidationError'
    }

    /**
     * Get all error messages as flat array
     */
    getAllMessages(): string[] {
        return Object.values(this.errors).flat()
    }

    /**
     * Get first error message
     */
    getFirstMessage(): string | undefined {
        const messages = this.getAllMessages()
        return messages[0]
    }

    /**
     * Get errors for specific field
     */
    getFieldErrors(field: string): string[] {
        return this.errors[field] || []
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a new validator instance
 */
export function validator(): Validator {
    return new Validator()
}

/**
 * Quick validation helper
 */
export async function validate(
    data: Record<string, unknown>,
    rules: Record<string, Rule[]>,
): Promise<ValidationResult> {
    const v = validator()

    for (const [field, fieldRules] of Object.entries(rules)) {
        v.field(field, fieldRules)
    }

    return await v.validate(data)
}

/**
 * Validate and throw
 */
export async function validateOrThrow(
    data: Record<string, unknown>,
    rules: Record<string, Rule[]>,
): Promise<Record<string, unknown>> {
    const v = validator()

    for (const [field, fieldRules] of Object.entries(rules)) {
        v.field(field, fieldRules)
    }

    return await v.validateOrThrow(data)
}
