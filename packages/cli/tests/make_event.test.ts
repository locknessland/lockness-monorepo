/**
 * Tests for CLI make:event command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:event', async (t) => {
    await t.step('generates valid event from stub', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'UserRegistered',
            description: 'user registered',
        })

        assertStringIncludes(content, 'export class UserRegistered')
        assertStringIncludes(content, 'extends BaseEvent')
    })

    await t.step('includes BaseEvent import', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'OrderPlaced',
            description: 'order placed',
        })

        assertStringIncludes(
            content,
            "import { BaseEvent } from '@lockness/core'",
        )
    })

    await t.step('replaces all placeholders correctly', async () => {
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

    await t.step('has proper JSDoc comment', async () => {
        const content = await Stub.render('make', 'event', {
            className: 'UserDeleted',
            description: 'user deleted',
        })

        assertStringIncludes(content, '* UserDeleted Event')
        assertStringIncludes(content, 'user deleted')
    })
})
