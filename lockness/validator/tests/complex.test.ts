/**
 * Tests for @lockness/validator - Complex Scenarios
 */

import { assertEquals } from '@std/assert'
import {
    alphanumeric,
    confirmed,
    email,
    lowercase,
    maxLength,
    min,
    minLength,
    requiredIf,
    trim,
    validator,
} from '../mod.ts'

Deno.test('Validator - Complex scenarios', async (t) => {
    await t.step('user registration', async () => {
        const v = validator()
            .field('username', [minLength(3), maxLength(20), alphanumeric()])
            .field('email', [email()])
            .field('password', [minLength(8)])
            .field('password_confirmation', [confirmed('password')])
            .field('age', [min(18)])
            .sanitize('username', [trim(), lowercase()])
            .sanitize('email', [trim(), lowercase()])

        const result = await v.validate({
            username: '  JohnDoe  ',
            email: '  JOHN@EXAMPLE.COM  ',
            password: 'secure123',
            password_confirmation: 'secure123',
            age: 25,
        })
        assertEquals(result.valid, true)

        const sanitized = v.applySanitizers({
            username: '  JohnDoe  ',
            email: '  JOHN@EXAMPLE.COM  ',
        })
        assertEquals(sanitized.username, 'johndoe')
        assertEquals(sanitized.email, 'john@example.com')
    })

    await t.step('conditional validation', async () => {
        const v = validator()
            .field('shipping_address', [minLength(10)], {
                optional: true,
            })

        v.field('shipping_address', [
            requiredIf('needs_shipping', true),
            minLength(10),
        ])

        const withShipping = await v.validate({
            needs_shipping: true,
            shipping_address: '123 Main St, City',
        })
        assertEquals(withShipping.valid, true)

        const withoutShipping = await v.validate({
            needs_shipping: false,
        })
        // Will fail because shipping_address is required when needs_shipping is true
        // but here needs_shipping is false, so it should pass the requiredIf
        // However, the field is marked required by default unless optional: true
        assertEquals(withoutShipping.valid, false)
    })
})
