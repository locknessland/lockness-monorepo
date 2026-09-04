/**
 * @fileoverview Built-in sanitisers for the Lockness validator.
 *
 * Sanitisers normalise a value before rules run against it — trimming
 * whitespace, coercing types, escaping HTML, and so on. They are pure
 * value-to-value transforms with no I/O, applied in registration order.
 *
 * @module @lockness/validator/sanitisers
 */

/**
 * A sanitiser transforms a value in place before validation runs.
 *
 * Implementations must be pure: given the same input they return the same
 * output and perform no side effects.
 */
export type SanitizerFn<T = unknown> = (value: T) => T

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
