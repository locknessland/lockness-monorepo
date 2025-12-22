/**
 * Tests for ACE make:command command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { existsSync } from '@std/fs'
import { Stub } from '@lockness/ace'

const STUB_PATH = './lockness/ace/stubs/make/command.stub'

Deno.test('make:command', async (t) => {
    await t.step('stub file exists', () => {
        assertEquals(existsSync(STUB_PATH), true)
    })

    await t.step('generates valid command from stub', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'GreetCommand',
            commandName: 'greet',
            description: 'Greet a user',
        })

        assertStringIncludes(content, 'export class GreetCommand')
        assertStringIncludes(content, 'implements ICommand')
    })

    await t.step('includes Command decorator', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'SyncCommand',
            commandName: 'sync',
            description: 'Sync data',
        })

        assertStringIncludes(content, '@Command(')
        assertStringIncludes(content, "'sync'")
    })

    await t.step('includes handle method with CommandContext', async () => {
        const content = await Stub.render('make', 'command', {
            className: 'TestCommand',
            commandName: 'test',
            description: 'Test command',
        })

        assertStringIncludes(content, 'handle(')
        assertStringIncludes(content, 'CommandContext')
    })
})
