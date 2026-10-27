/**
 * Tests for @lockness/validator - Basic Validators
 */

import { assertEquals } from '@std/assert'
import {
    alpha,
    alphanumeric,
    between,
    email,
    inArray,
    max,
    maxLength,
    min,
    minLength,
    notIn,
    numeric,
    pattern,
    url,
    uuid,
    validate,
} from '../mod.ts'

Deno.test('Validator - Basic validators', async (t) => {
    await t.step('email validator', async () => {
        const result = await validate(
            { email: 'test@example.com' },
            { email: [email()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { email: 'invalid-email' },
            { email: [email()] },
        )
        assertEquals(invalid.valid, false)
        assertEquals(invalid.errors.email?.[0], 'Must be a valid email address')
    })

    await t.step('url validator', async () => {
        const result = await validate(
            { website: 'https://example.com' },
            { website: [url()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { website: 'not-a-url' },
            { website: [url()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('uuid validator', async () => {
        const result = await validate(
            { id: '550e8400-e29b-41d4-a716-446655440000' },
            { id: [uuid()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { id: 'not-a-uuid' },
            { id: [uuid()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('minLength and maxLength', async () => {
        const result = await validate(
            { password: 'secure123' },
            { password: [minLength(8), maxLength(20)] },
        )
        assertEquals(result.valid, true)

        const tooShort = await validate(
            { password: '123' },
            { password: [minLength(8)] },
        )
        assertEquals(tooShort.valid, false)

        const tooLong = await validate(
            { password: 'a'.repeat(21) },
            { password: [maxLength(20)] },
        )
        assertEquals(tooLong.valid, false)
    })

    await t.step('min and max', async () => {
        const result = await validate(
            { age: 25 },
            { age: [min(18), max(100)] },
        )
        assertEquals(result.valid, true)

        const tooYoung = await validate(
            { age: 15 },
            { age: [min(18)] },
        )
        assertEquals(tooYoung.valid, false)
    })

    await t.step('between', async () => {
        const result = await validate(
            { score: 75 },
            { score: [between(0, 100)] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { score: 150 },
            { score: [between(0, 100)] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('inArray and notIn', async () => {
        const result = await validate(
            { role: 'admin' },
            { role: [inArray(['admin', 'user', 'guest'])] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { role: 'superadmin' },
            { role: [inArray(['admin', 'user', 'guest'])] },
        )
        assertEquals(invalid.valid, false)

        const notInResult = await validate(
            { username: 'john' },
            { username: [notIn(['admin', 'root'])] },
        )
        assertEquals(notInResult.valid, true)
    })

    await t.step('pattern, alphanumeric, alpha, numeric', async () => {
        const alphanumericResult = await validate(
            { code: 'ABC123' },
            { code: [alphanumeric()] },
        )
        assertEquals(alphanumericResult.valid, true)

        const alphaResult = await validate(
            { name: 'John' },
            { name: [alpha()] },
        )
        assertEquals(alphaResult.valid, true)

        const numericResult = await validate(
            { pin: '1234' },
            { pin: [numeric()] },
        )
        assertEquals(numericResult.valid, true)

        const customPattern = await validate(
            { hex: 'FF00AA' },
            { hex: [pattern(/^[A-F0-9]+$/, 'Must be hex')] },
        )
        assertEquals(customPattern.valid, true)
    })
})
