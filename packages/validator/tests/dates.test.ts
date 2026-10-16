/**
 * Tests for @lockness/validator - Date Validators
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { after, before, dateString, validate } from '../mod.ts'

test('Validator - Date validators', async (t) => {
    await t.test('dateString', async () => {
        const result = await validate(
            { birthdate: '2000-01-01' },
            { birthdate: [dateString()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { birthdate: 'not-a-date' },
            { birthdate: [dateString()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.test('after and before', async () => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        const afterResult = await validate(
            { event_date: tomorrow.toISOString() },
            { event_date: [after(new Date())] },
        )
        assertEquals(afterResult.valid, true)

        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        const beforeResult = await validate(
            { event_date: yesterday.toISOString() },
            { event_date: [before(new Date())] },
        )
        assertEquals(beforeResult.valid, true)
    })
})
