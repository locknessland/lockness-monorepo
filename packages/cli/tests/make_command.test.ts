/**
 * Tests for CLI make:command command
 */

import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:command', async (t) => {
    await t.test('generates valid command from stub', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'GreetCommand',
            commandName: 'greet',
            description: 'Greet a user',
        })

        assertStringIncludes(content, 'export class GreetCommand')
        assertStringIncludes(content, 'implements CommandContract')
    })

    await t.test('includes Command decorator', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'SyncCommand',
            commandName: 'sync',
            description: 'Sync data',
        })

        assertStringIncludes(content, '@Command(')
        assertStringIncludes(content, "'sync'")
    })

    await t.test('includes handle method with CommandContext', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'TestCommand',
            commandName: 'test',
            description: 'Test command',
        })

        assertStringIncludes(content, 'handle(')
        assertStringIncludes(content, 'CommandContext')
    })
})
