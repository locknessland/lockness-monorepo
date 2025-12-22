/**
 * Tests for Validation System
 */

import { assertEquals } from '@std/assert'
import { z } from 'zod'

Deno.test('validation system', async (t) => {
    await t.step('zod schema validates correct data', () => {
        const schema = z.object({
            name: z.string().min(1),
            email: z.string().email(),
            age: z.number().min(0),
        })

        const result = schema.safeParse({
            name: 'John',
            email: 'john@example.com',
            age: 25,
        })

        assertEquals(result.success, true)
    })

    await t.step('zod schema rejects invalid data', () => {
        const schema = z.object({
            email: z.string().email(),
        })

        const result = schema.safeParse({
            email: 'not-an-email',
        })

        assertEquals(result.success, false)
    })

    await t.step('zod coercion works', () => {
        const schema = z.object({
            id: z.coerce.number(),
        })

        const result = schema.safeParse({ id: '123' })

        assertEquals(result.success, true)
        if (result.success) {
            assertEquals(result.data.id, 123)
        }
    })

    await t.step('zod optional fields work', () => {
        const schema = z.object({
            required: z.string(),
            optional: z.string().optional(),
        })

        const result = schema.safeParse({ required: 'value' })

        assertEquals(result.success, true)
    })

    await t.step('zod default values work', () => {
        const schema = z.object({
            name: z.string().default('Anonymous'),
        })

        const result = schema.safeParse({})

        assertEquals(result.success, true)
        if (result.success) {
            assertEquals(result.data.name, 'Anonymous')
        }
    })
})
