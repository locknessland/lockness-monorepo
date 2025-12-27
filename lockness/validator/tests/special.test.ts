/**
 * Tests for @lockness/validator - Special Validators
 */

import { assertEquals } from '@std/assert'
import {
    custom,
    ip,
    json,
    validate,
} from '../mod.ts'

Deno.test('Validator - Special validators', async (t) => {
    await t.step('ip validator', async () => {
        const result = await validate(
            { ip: '192.168.1.1' },
            { ip: [ip()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { ip: '999.999.999.999' },
            { ip: [ip()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('json validator', async () => {
        const result = await validate(
            { config: '{"key": "value"}' },
            { config: [json()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { config: '{invalid json}' },
            { config: [json()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('custom validator', async () => {
        const evenNumber = custom(
            (value: unknown) => typeof value === 'number' && value % 2 === 0,
            'Must be an even number',
        )

        const result = await validate(
            { number: 4 },
            { number: [evenNumber] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { number: 5 },
            { number: [evenNumber] },
        )
        assertEquals(invalid.valid, false)
        assertEquals(invalid.errors.number?.[0], 'Must be an even number')
    })

    await t.step('async custom validator', async () => {
        const asyncValidator = custom(
            async (value: unknown) => {
                await new Promise((resolve) => setTimeout(resolve, 10))
                return value === 'async-value'
            },
            'Async validation failed',
        )

        const result = await validate(
            { field: 'async-value' },
            { field: [asyncValidator] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { field: 'wrong' },
            { field: [asyncValidator] },
        )
        assertEquals(invalid.valid, false)
    })
})
