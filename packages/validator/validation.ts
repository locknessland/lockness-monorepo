/**
 * @fileoverview The validator core: the {@link Validator} builder, the
 * {@link ValidationError} it throws, and the {@link validate} /
 * {@link validateOrThrow} helpers.
 *
 * This module orchestrates the rules and sanitisers into a run: sanitise
 * first, then evaluate each field's rules, honouring the optional / nullable /
 * conditional-required policy. It owns {@link ValidationResult}, the shape a
 * run reports back.
 *
 * @module @lockness/validator/validation
 */

import type { FieldRules, Rule } from './rules/mod.ts'
import type { SanitizerFn } from './sanitisers/mod.ts'

/**
 * The outcome of a validation run: whether the data was valid and, if not, the
 * per-field error messages.
 */
export type ValidationResult = {
    valid: boolean
    errors: Record<string, string[]>
}

/**
 * Fluent builder that collects field rules and sanitisers, then runs them
 * against a data record.
 *
 * @example
 * ```ts
 * const result = await validator()
 *   .field('email', [email()])
 *   .sanitize('email', [trim(), lowercase()])
 *   .validate({ email: '  ME@EXAMPLE.COM ' })
 * ```
 */
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

/**
 * Error thrown by {@link Validator.validateOrThrow} and
 * {@link validateOrThrow} when validation fails, carrying the per-field
 * messages.
 */
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
