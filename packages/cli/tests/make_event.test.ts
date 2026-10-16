/**
 * Tests for CLI make:event command
 */

import { test } from 'node:test'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:event', async (t) => {
    await t.test('generates valid event from stub', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'UserRegistered',
            description: 'user registered',
        })

        assertStringIncludes(content, 'export class UserRegistered')
        assertStringIncludes(content, 'extends BaseEvent')
    })

    await t.test('includes BaseEvent import', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'OrderPlaced',
            description: 'order placed',
        })

        assertStringIncludes(
            content,
            "import { BaseEvent } from '@lockness/core'",
        )
    })

    await t.test('replaces all placeholders correctly', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'PaymentProcessed',
            description: 'payment processed',
        })

        // Should NOT contain unreplaced placeholders
        assertEquals(content.includes('{{ className }}'), false)
        assertEquals(content.includes('{{ description }}'), false)
        assertEquals(content.includes('{{className}}'), false)
        assertEquals(content.includes('{{description}}'), false)

        // Should contain replaced values
        assertStringIncludes(content, 'PaymentProcessed')
        assertStringIncludes(content, 'payment processed')
    })

    await t.test('has proper JSDoc comment', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'UserDeleted',
            description: 'user deleted',
        })

        assertStringIncludes(content, '* UserDeleted Event')
        assertStringIncludes(content, 'user deleted')
    })
})
