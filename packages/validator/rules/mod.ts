/**
 * @fileoverview Built-in validation rules for the Lockness validator.
 *
 * Each rule constructor returns a {@link Rule}: a named predicate plus a
 * default message. Rules are pure and synchronous unless a caller supplies an
 * async {@link ValidatorFn} through {@link custom}. Grouping the rule shapes
 * ({@link Rule}, {@link FieldRules}, {@link ValidatorFn}) alongside the
 * constructors keeps the contract a rule depends on next to the rules
 * themselves.
 *
 * @module @lockness/validator/rules
 */

import type { SanitizerFn } from '../sanitisers/mod.ts'

/**
 * A predicate deciding whether a value passes a rule.
 *
 * Receives the value under test and, optionally, the full data record so
 * cross-field rules (such as {@link confirmed}) can compare siblings. May be
 * synchronous or asynchronous.
 */
export type ValidatorFn<T = unknown> = (
    value: T,
    data?: Record<string, unknown>,
) => boolean | Promise<boolean>

/**
 * A single validation rule: a name for diagnostics, the predicate that decides
 * validity, and the message surfaced when it fails.
 */
export interface Rule {
    name: string
    validator: ValidatorFn
    message?: string
}

/**
 * The rules and sanitisers registered for one field, plus its emptiness
 * policy. `optional` skips validation when the value is `undefined`;
 * `nullable` skips it when the value is `null`.
 */
export interface FieldRules {
    rules: Rule[]
    sanitizers?: SanitizerFn[]
    optional?: boolean
    nullable?: boolean
}

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
