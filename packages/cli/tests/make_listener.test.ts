/**
 * Tests for CLI make:listener command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:listener', async (t) => {
    await t.step('generates valid listener from stub', async () => {
        const content = await Stub.render('make', 'listener', {
            className: 'UserListener',
            description: 'user',
        })

        assertStringIncludes(content, 'export class UserListener')
        assertStringIncludes(content, '@Service()')
    })

    await t.step('includes required imports', async () => {
        const content = await Stub.render('make', 'listener', {
            className: 'OrderListener',
            description: 'order',
        })

        assertStringIncludes(
            content,
            "import { Service } from '@lockness/container'",
        )
        assertStringIncludes(
            content,
            "import { Listener } from '@lockness/core'",
        )
    })

    await t.step('replaces all placeholders correctly', async () => {
        const content = await Stub.render('make', 'listener', {
            className: 'PaymentListener',
            description: 'payment',
        })

        // Should NOT contain unreplaced placeholders
        assertEquals(content.includes('{{ className }}'), false)
        assertEquals(content.includes('{{ description }}'), false)
        assertEquals(content.includes('{{className}}'), false)
        assertEquals(content.includes('{{description}}'), false)

        // Should contain replaced values
        assertStringIncludes(content, 'PaymentListener')
        assertStringIncludes(content, 'payment')
    })

    await t.step('has commented @Listener example', async () => {
        const content = await Stub.render('make', 'listener', {
            className: 'NotificationListener',
            description: 'notification',
        })

        assertStringIncludes(content, '@Listener(YourEvent)')
        assertStringIncludes(content, 'async handleEvent')
    })
})
