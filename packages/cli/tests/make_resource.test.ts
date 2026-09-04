/**
 * Tests for the CLI make:resource command.
 */

import { assert, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'
import { MAKE_COMMANDS } from '../commands/make/index.ts'

Deno.test('make:resource', async (t) => {
    await t.step('generates a Resource subclass from the stub', async () => {
        const content = await Stub.render('make', 'resource', {
            className: 'User',
        })

        assertStringIncludes(
            content,
            'export class UserResource extends Resource',
        )
        assertStringIncludes(
            content,
            "import { Resource } from '@lockness/core'",
        )
        assertStringIncludes(content, 'override toArray()')
    })

    await t.step(
        'the stub is opt-in — it names fields, never spreads the model',
        async () => {
            const content = await Stub.render('make', 'resource', {
                className: 'Post',
            })
            // Explicit-field body (security S2): no `...model` / `$inferSelect`.
            assert(!content.includes('...this.model'))
            assert(!content.includes('$inferSelect'))
        },
    )

    await t.step('is registered in MAKE_COMMANDS', () => {
        const names = MAKE_COMMANDS.map((c) => c.name)
        assert(names.includes('make:resource'))
    })
})
