/**
 * Tests for @lockness/validator - Relational Validators
 */

import { assertEquals } from '@std/assert'
import {
    confirmed,
    different,
    requiredIf,
    requiredUnless,
    validate,
    validator,
} from '../mod.ts'

Deno.test('Validator - Relational validators', async (t) => {
    await t.step('confirmed', async () => {
        const result = await validate(
            { password: 'secret123', password_confirmation: 'secret123' },
            { password_confirmation: [confirmed('password')] },
        )
        assertEquals(result.valid, true)

        const mismatch = await validate(
            { password: 'secret123', password_confirmation: 'different' },
            { password_confirmation: [confirmed('password')] },
        )
        assertEquals(mismatch.valid, false)
    })

    await t.step('different', async () => {
        const result = await validate(
            { new_password: 'newpass123', old_password: 'oldpass123' },
            { new_password: [different('old_password')] },
        )
        assertEquals(result.valid, true)

        const same = await validate(
            { new_password: 'samepass', old_password: 'samepass' },
            { new_password: [different('old_password')] },
        )
        assertEquals(same.valid, false)
    })

    await t.step('requiredIf', async () => {
        const v = validator()
        v.field('card_number', [requiredIf('payment_method', 'card')], {
            optional: true,
        })

        const result = await v.validate(
            { payment_method: 'card', card_number: '1234' },
        )
        assertEquals(result.valid, true)

        const missing = await v.validate(
            { payment_method: 'card' },
        )
        assertEquals(missing.valid, false)

        const notRequired = await v.validate(
            { payment_method: 'cash' },
        )
        assertEquals(notRequired.valid, true)
    })

    await t.step('requiredUnless', async () => {
        const v = validator()
        v.field('reason', [requiredUnless('status', 'approved')], {
            optional: true,
        })

        const result = await v.validate(
            { status: 'pending', reason: 'Waiting approval' },
        )
        assertEquals(result.valid, true)

        const notRequired = await v.validate(
            { status: 'approved' },
        )
        assertEquals(notRequired.valid, true)
    })
})
