/**
 * Tests for @lockness/validator - Validator Class & Errors
 */

import { assertEquals, assertRejects } from '@std/assert'
import {
    alphanumeric,
    email,
    lowercase,
    minLength,
    trim,
    validator,
    validateOrThrow,
    ValidationError,
} from '../mod.ts'

Deno.test('Validator - Validator class', async (t) => {
    await t.step('fluent API', async () => {
        const v = validator()
            .field('email', [email()])
            .field('password', [minLength(8)])
            .sanitize('email', [lowercase(), trim()])

        const result = await v.validate({
            email: '  TEST@EXAMPLE.COM  ',
            password: 'secure123',
        })
        assertEquals(result.valid, true)
    })

    await t.step('optional fields', async () => {
        const v = validator()
        v.field('nickname', [minLength(3)], { optional: true })

        const withoutField = await v.validate({})
        assertEquals(withoutField.valid, true)

        const withField = await v.validate({ nickname: 'Jo' })
        assertEquals(withField.valid, false)
    })

    await t.step('nullable fields', async () => {
        const v = validator()
        v.field('middle_name', [minLength(2)], { nullable: true })

        const withNull = await v.validate({ middle_name: null })
        assertEquals(withNull.valid, true)
    })

    await t.step('required fields', async () => {
        const v = validator()
        v.field('username', [minLength(3)])

        const missing = await v.validate({})
        assertEquals(missing.valid, false)
        assertEquals(missing.errors.username?.[0], 'username is required')
    })

    await t.step('multiple errors per field', async () => {
        const v = validator()
        v.field('password', [minLength(8), alphanumeric()])

        const result = await v.validate({ password: 'ab!' })
        assertEquals(result.valid, false)
        assertEquals(result.errors.password?.length, 2)
    })
})

Deno.test('Validator - validateOrThrow', async (t) => {
    await t.step('throws on validation error', async () => {
        await assertRejects(
            async () => {
                await validateOrThrow(
                    { email: 'invalid' },
                    { email: [email()] },
                )
            },
            ValidationError,
            'Validation failed',
        )
    })

    await t.step('returns sanitized data on success', async () => {
        const v = validator()
        v.field('email', [email()])
        v.sanitize('email', [trim(), lowercase()])

        const data = await v.validateOrThrow(
            { email: '  TEST@EXAMPLE.COM  ' },
        )
        // Validator class applies sanitizers
        assertEquals(data.email, 'test@example.com')
    })

    await t.step('ValidationError methods', async () => {
        try {
            await validateOrThrow(
                { email: 'invalid', password: '123' },
                { email: [email()], password: [minLength(8)] },
            )
        } catch (error) {
            const validationError = error as ValidationError
            assertEquals(validationError.getAllMessages().length, 2)
            assertEquals(typeof validationError.getFirstMessage(), 'string')
            assertEquals(validationError.getFieldErrors('email').length, 1)
            assertEquals(validationError.getFieldErrors('missing').length, 0)
        }
    })
})
